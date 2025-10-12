import { GameEngine } from '../game/gameEngine.js'
import { arePlayersTeammates as utilArePlayersTeammates } from '../utils/gameTeams.js'
import { findRedeemableSets, normalizeTreasureConfig } from '../game/hiddenTreasures.js'
import type { AIDifficulty, GameAction, GamePlayer, GameState } from '../types/game.js'
import { filterStateForPlanner } from './fogService.js'

type FallbackReason = 'stubbed' | 'timeout' | 'aborted'

export interface DecisionBudget {
  maxThinkTimeMs: number
  maxPlannedActions?: number
  readableDelayMs?: number
  maxAttackChains?: number
  minAttackOddsByTier?: {
    recruit?: number
    commander?: number
    grandmaster?: number
  }
  allowOneSpiceAttack?: boolean
  signal?: AbortSignal
}

export interface DecisionRequest {
  gameState: GameState
  player: GamePlayer
  difficulty: AIDifficulty
  budget: DecisionBudget
}

export interface AIDecisionPlan {
  actions: GameAction[]
  usedFallback: boolean
  reason?: FallbackReason
  diagnostics: {
    generatedAt: string
    durationMs: number
    requestedDifficulty: AIDifficulty
    plannedActionCount: number
    budget: {
      maxThinkTimeMs: number
      maxPlannedActions?: number
      readableDelayMs?: number
      maxAttackChains?: number
      minAttackOddsByTier?: {
        recruit?: number
        commander?: number
        grandmaster?: number
      }
      allowOneSpiceAttack?: boolean
    }
  }
}

class AIDecisionService {
  async chooseAction(request: DecisionRequest): Promise<AIDecisionPlan> {
    const start = Date.now()

    if (request.budget.signal?.aborted) {
      return this.createFallbackPlan('aborted', request, start)
    }

    if (request.budget.maxThinkTimeMs <= 0) {
      return this.createFallbackPlan('timeout', request, start)
    }

    try {
      // Apply fog-of-war filtering so planner only sees visible info
      const fogMode =
        (
          request.gameState.gameConfig as
            | { fogOfWar?: 'off' | 'adjacent' | 'persistent' }
            | undefined
        )?.fogOfWar ?? 'off'
      const effectiveState = fogMode === 'off'
        ? request.gameState
        : filterStateForPlanner(request.gameState, request.player.id)

      const plannedActions = await this.generatePlan({ ...request, gameState: effectiveState })

      if (request.budget.signal?.aborted) {
        return this.createFallbackPlan('aborted', request, start)
      }

      const elapsed = Date.now() - start
      if (elapsed > request.budget.maxThinkTimeMs) {
        return this.createFallbackPlan('timeout', request, start)
      }

      if (plannedActions.length === 0) {
        return this.createFallbackPlan('stubbed', request, start)
      }

      const boundedActions = this.enforceBudget(plannedActions, request)
      if (boundedActions.length === 0) {
        return this.createFallbackPlan('stubbed', request, start)
      }

      return {
        actions: boundedActions,
        usedFallback: false,
        diagnostics: {
          generatedAt: new Date().toISOString(),
          durationMs: elapsed,
          requestedDifficulty: request.difficulty,
          plannedActionCount: boundedActions.length,
          budget: {
            maxThinkTimeMs: request.budget.maxThinkTimeMs,
            maxPlannedActions: request.budget.maxPlannedActions,
            readableDelayMs: request.budget.readableDelayMs,
            maxAttackChains: request.budget.maxAttackChains,
            minAttackOddsByTier: request.budget.minAttackOddsByTier,
            allowOneSpiceAttack: request.budget.allowOneSpiceAttack,
          },
        },
      }
    } catch {
      return this.createFallbackPlan('stubbed', request, start)
    }
  }

  private async generatePlan(request: DecisionRequest): Promise<GameAction[]> {
    if (request.player.isEliminated) {
      return []
    }

    switch (request.difficulty) {
      case 'recruit':
        return await this.generateRecruitPlan(request)
      case 'commander':
        return await this.generateCommanderPlan(request)
      case 'grandmaster':
        return await this.generateGrandmasterPlan(request)
      default:
        return []
      }
  }

  private async generateCommanderPlan(request: DecisionRequest): Promise<GameAction[]> {
    const { gameState, player, budget } = request
    const roomId = gameState.roomId
    const actions: GameAction[] = []

    const push = (a: GameAction) => {
      if (budget.maxPlannedActions !== undefined && actions.length >= budget.maxPlannedActions) {
        return false
      }
      actions.push(a)
      return true
    }

    if (gameState.phase === 'finished') return []

    // 1) Card timing: if we must cash in or we are at/over hand cap and have a set, trade first
    try {
      const cfg = (gameState.gameConfig as { treasureConfig?: unknown })?.treasureConfig as
        | import('../types/game.js').TreasureConfig
        | undefined
      const hand = (player.treasures ?? []) as import('../types/game.js').Metal[]
      const mustCash = Boolean(player.mustCashInTreasures || gameState.mustCashInTreasures)
      if (cfg?.enabled && hand.length >= 3) {
        const norm = normalizeTreasureConfig(cfg)
        const sets = findRedeemableSets(hand)
        const nearCap = hand.length >= Math.max(3, norm.handCap - 1)
        if ((mustCash || nearCap) && sets.length > 0) {
          const first = sets[0]
          push({
            type: 'trade_cards',
            roomId,
            playerId: player.id,
            payload: { treasureSet: first.indices as unknown as [number, number, number] },
          })
          // Commander may place reinforcements next (handled below) without ending turn
        }
      }
    } catch {
      // if treasure logic fails, continue with normal flow
    }

    let phase = gameState.phase

    // 2) Reinforcement: prefer sectors close to completion or defense of owned sectors
    if (phase === 'reinforcement') {
      const available = Math.max(0, player.armies)
      if (available > 0) {
        const target = this.chooseCommanderReinforcement(gameState, player.id)
        if (target) {
          if (
            !push({
              type: 'deploy',
              roomId,
              playerId: player.id,
              payload: { territoryId: target, armies: available },
            })
          )
            return actions
        }
      }
      if (!push({ type: 'end_turn', roomId, playerId: player.id })) return actions
      phase = 'attack'
    }

    // 3) Attack: choose a high-value border within priority sector
    if (phase === 'attack') {
      const attack = await this.findCommanderAttack(gameState, player.id, budget)
      if (attack) {
        if (!push(attack)) return actions
      }
      if (!push({ type: 'end_turn', roomId, playerId: player.id })) return actions
      phase = 'fortify'
    }

    // 4) Fortify toward weak borders and capitals
    if (phase === 'fortify') {
      const fort = this.findGrandmasterFortify(gameState, player.id)
      if (fort) push(fort)
      push({ type: 'end_turn', roomId, playerId: player.id })
    }

    return actions
  }

  private chooseCommanderReinforcement(gameState: GameState, playerId: string): string | null {
    const owned = gameState.board.filter((t) => t.ownerId === playerId)
    if (owned.length === 0) return null
    // Group by sector and compute control
    const sectorMap = new Map<string, { owned: number; total: number }>()
    for (const t of gameState.board) {
      const key = t.sector || t.continent || 'unknown'
      const e = sectorMap.get(key) ?? { owned: 0, total: 0 }
      e.total += 1
      if (t.ownerId === playerId) e.owned += 1
      sectorMap.set(key, e)
    }
    // Prefer sectors close to completion (highest owned/total) and where borders are weak
    const candidateSectors = Array.from(sectorMap.entries())
      .filter(([key]) => key !== 'unknown')
      .sort((a, b) => b[1].owned / Math.max(1, b[1].total) - a[1].owned / Math.max(1, a[1].total))

    // Find weakest border inside preferred sector
    for (const [sector] of candidateSectors) {
      const borders = owned
        .filter(
          (t) =>
            (t.sector || t.continent) === sector && this.hasEnemyNeighbor(gameState, t, playerId),
        )
        .sort((a, b) => a.armies - b.armies)
      if (borders.length > 0) return borders[0].id
    }
    // Fallback to weakest border overall
    const allBorders = owned
      .filter((t) => this.hasEnemyNeighbor(gameState, t, playerId))
      .sort((a, b) => a.armies - b.armies)
    return allBorders[0]?.id ?? owned[0].id
  }

  private async findCommanderAttack(
    gameState: GameState,
    playerId: string,
    budget: DecisionBudget,
  ): Promise<GameAction | null> {
    const owned = gameState.board.filter((t) => t.ownerId === playerId)
    if (owned.length === 0) return null
    const sectorScore = new Map<string, number>()
    for (const t of gameState.board) {
      const key = t.sector || t.continent || 'unknown'
      const e = sectorScore.get(key) ?? 0
      sectorScore.set(key, e + (t.ownerId === playerId ? 1 : 0))
    }
    // Select best sector by control
    const bestSector = Array.from(sectorScore.entries())
      .filter(([k]) => k !== 'unknown')
      .sort((a, b) => b[1] - a[1])[0]?.[0]

    const candidates: Array<{ from: string; to: string; score: number; armies: number; sectorBonus: number; isCapital: number }> = []
    for (const src of owned) {
      if (src.armies <= 3) continue
      for (const nid of src.adjacentTerritories) {
        const tgt = this.getTerritory(gameState, nid)
        if (!tgt || tgt.ownerId === playerId) continue
        if (tgt.ownerId && this.arePlayersTeammates(gameState, playerId, tgt.ownerId)) continue
        const attackDice = Math.min(3, Math.max(1, src.armies - 1))
        const advantage = src.armies - 1 - (tgt.armies ?? 0)
        const sectorBonus = (tgt.sector || tgt.continent) === bestSector ? 2 : 0
        const isCapital = tgt.isCapital === true ? 2 : 0
        const score = advantage * 2 + sectorBonus + isCapital
        if (advantage >= 1) {
          candidates.push({ from: src.id, to: tgt.id, score, armies: attackDice, sectorBonus, isCapital })
        } else if (
          advantage === 0 &&
          (budget.minAttackOddsByTier?.commander ?? 0.68) <= 0.68 // only very marginal equal-odds
        ) {
          candidates.push({ from: src.id, to: tgt.id, score: score - 1, armies: attackDice, sectorBonus, isCapital })
        }
      }
    }
    try {
      const { evaluateCandidatesAdapter } = await import('./aiEvalAdapter.js')
      const state = {
        currentPlayerId: playerId,
        territories: gameState.board.map((t) => ({ id: t.id, ownerId: t.ownerId || null, armies: Math.max(0, t.armies | 0) })),
      }
      const evalCands = candidates.map((c) => ({ kind: 'attack' as const, from: c.from, to: c.to }))
      const scores = await evaluateCandidatesAdapter(state, evalCands, { difficulty: request.difficulty })
      for (let i = 0; i < candidates.length; i++) {
        const p = scores[i] ?? 0
        candidates[i]!.score = p * 100 + candidates[i]!.sectorBonus * 2 + candidates[i]!.isCapital * 3
      }
    } catch {
      // keep heuristic scores
    }
    candidates.sort((a, b) => b.score - a.score)
    const pick = candidates[0]
    if (!pick) return null
    return {
      type: 'attack',
      roomId: gameState.roomId,
      playerId,
      payload: { fromTerritoryId: pick.from, toTerritoryId: pick.to, armies: pick.armies },
    }
  }

  // === Grandmaster (EV-driven) ===
  private async generateGrandmasterPlan(request: DecisionRequest): Promise<GameAction[]> {
    const { gameState, player, budget } = request
    const roomId = gameState.roomId
    const actions: GameAction[] = []
    const push = (a: GameAction) => {
      if (budget.maxPlannedActions !== undefined && actions.length >= budget.maxPlannedActions) {
        return false
      }
      actions.push(a)
      return true
    }

    if (gameState.phase === 'finished') return []

    // Card timing (must cash or near cap)
    try {
      const cfg = (gameState.gameConfig as { treasureConfig?: unknown })?.treasureConfig as
        | import('../types/game.js').TreasureConfig
        | undefined
      const hand = (player.treasures ?? []) as import('../types/game.js').Metal[]
      const mustCash = Boolean(player.mustCashInTreasures || gameState.mustCashInTreasures)
      if (cfg?.enabled && hand.length >= 3) {
        const norm = normalizeTreasureConfig(cfg)
        const sets = findRedeemableSets(hand)
        const nearCap = hand.length >= Math.max(3, norm.handCap - 1)
        if ((mustCash || nearCap) && sets.length > 0) {
          const first = sets[0]
          push({
            type: 'trade_cards',
            roomId,
            playerId: player.id,
            payload: { treasureSet: first.indices as unknown as [number, number, number] },
          })
        }
      }
    } catch {
      /* ignore */
    }

    let phase = gameState.phase
    if (phase === 'reinforcement') {
      const avail = Math.max(0, player.armies)
      if (avail > 0) {
        const target = this.chooseCommanderReinforcement(gameState, player.id)
        if (target) {
          if (
            !push({
              type: 'deploy',
              roomId,
              playerId: player.id,
              payload: { territoryId: target, armies: avail },
            })
          )
            return actions
        }
      }
      if (!push({ type: 'end_turn', roomId, playerId: player.id })) return actions
      phase = 'attack'
    }

    if (phase === 'attack') {
      const attack = this.findGrandmasterAttack(gameState, player.id, budget)
      if (attack) {
        if (!push(attack)) return actions
      }
      if (!push({ type: 'end_turn', roomId, playerId: player.id })) return actions
      phase = 'fortify'
    }

    if (phase === 'fortify') {
      const fort = this.findRecruitFortify(gameState, player.id)
      if (fort) push(fort)
      push({ type: 'end_turn', roomId, playerId: player.id })
    }

    return actions
  }

  private findGrandmasterAttack(
    gameState: GameState,
    playerId: string,
    budget: DecisionBudget,
  ): GameAction | null {
    const owned = gameState.board.filter((t) => t.ownerId === playerId)
    if (owned.length === 0) return null
    const endTime = Date.now() + Math.max(0, budget.maxThinkTimeMs - 50)
    const candidates: Array<{ from: string; to: string; ev: number; armies: number }> = []

    for (const src of owned) {
      if (src.armies <= 3) continue
      for (const nid of src.adjacentTerritories) {
        const tgt = this.getTerritory(gameState, nid)
        if (!tgt || tgt.ownerId === playerId) continue
        if (tgt.ownerId && this.arePlayersTeammates(gameState, playerId, tgt.ownerId)) continue
        const attackDice = Math.min(3, Math.max(1, src.armies - 1))
        const ev = this.estimateAttackEV(gameState, playerId, src.id, tgt.id, endTime)
        candidates.push({ from: src.id, to: tgt.id, ev, armies: attackDice })
      }
    }

    candidates.sort((a, b) => b.ev - a.ev)
    const best = candidates[0]
    if (!best) return null

    // Thresholds: EV must be positive or win prob above configured min
    if (best.ev <= 0) return null
    return {
      type: 'attack',
      roomId: gameState.roomId,
      playerId,
      payload: {
        fromTerritoryId: best.from,
        toTerritoryId: best.to,
        armies: Math.min(
          3,
          Math.max(1, (this.getTerritory(gameState, best.from)?.armies ?? 2) - 1),
        ),
      },
    }
  }

  private estimateAttackEV(
    gameState: GameState,
    playerId: string,
    fromId: string,
    toId: string,
    endTimeMs: number,
  ): number {
    const from = this.getTerritory(gameState, fromId)
    const to = this.getTerritory(gameState, toId)
    if (!from || !to) return 0
    const attackersStart = Math.max(0, from.armies - 1)
    const defendersStart = Math.max(0, to.armies)
    if (attackersStart <= 0 || defendersStart <= 0) return 0

    let wins = 0
    let totalALoss = 0
    let totalDLoss = 0
    let trials = 0
    const maxTrials = 200 // cap to keep fast

    while (trials < maxTrials && Date.now() < endTimeMs) {
      const { aLoss, dLoss, conquered } = this.simulateBattle(attackersStart, defendersStart)
      if (conquered) wins += 1
      totalALoss += aLoss
      totalDLoss += dLoss
      trials += 1
    }
    if (trials === 0) return 0

    const pWin = wins / trials
    const expALoss = totalALoss / trials
    const expDLoss = totalDLoss / trials

    const sectorVal = this.sectorCaptureValue(gameState, playerId, to)
    const capitalBonus = to.isCapital === true ? 3 : 0
    const territoryBase = 1
    const valueIfWin = territoryBase + sectorVal + capitalBonus
    const ev = pWin * valueIfWin - expALoss * 0.2 + expDLoss * 0.05
    return ev
  }

  private findGrandmasterFortify(gameState: GameState, playerId: string): GameAction | null {
    const owned = gameState.board.filter((t) => t.ownerId === playerId)
    if (owned.length === 0) return null

    const engine = new GameEngine()

    // Sources: interior stacks with enough armies to move
    const sources = owned
      .filter((t) => t.armies >= 4 && !this.hasEnemyNeighbor(gameState, t, playerId))
      .sort((a, b) => b.armies - a.armies)

    // Precompute sector control
    const sectorCtrl = new Map<string, { owned: number; total: number }>()
    for (const t of gameState.board) {
      const key = t.sector || t.continent || 'unknown'
      const e = sectorCtrl.get(key) ?? { owned: 0, total: 0 }
      e.total += 1
      if (t.ownerId === playerId) e.owned += 1
      sectorCtrl.set(key, e)
    }

    let best: { from: string; to: string; armies: number; score: number } | null = null
    for (const src of sources) {
      const targets = engine.getValidFortifyTargets(gameState, src.id, playerId)
      if (!targets || targets.length === 0) continue
      for (const tid of targets) {
        const tgt = this.getTerritory(gameState, tid)
        if (!tgt) continue
        // Prefer capitals and weak borders; avoid moving to interior
        const isBorder = this.hasEnemyNeighbor(gameState, tgt, playerId)
        if (!isBorder && !tgt.isCapital) continue
        const sector = tgt.sector || tgt.continent || 'unknown'
        const ctrl = sectorCtrl.get(sector) ?? { owned: 0, total: 1 }
        const willOwn = ctrl.owned // fortify does not change ownership
        const progress = willOwn / Math.max(1, ctrl.total)
        const capBonus = tgt.isCapital === true ? 3 : 0
        const borderWeakness = isBorder ? Math.max(0, 8 - tgt.armies) : 0
        const score = capBonus + borderWeakness + progress
        const moveable = Math.max(1, src.armies - 1)
        const armies = Math.max(1, Math.min(moveable, Math.ceil(moveable / 2)))
        if (!best || score > best.score) {
          best = { from: src.id, to: tid, armies, score }
        }
      }
    }

    if (!best) return null
    return {
      type: 'fortify',
      roomId: gameState.roomId,
      playerId,
      payload: { fromTerritoryId: best.from, toTerritoryId: best.to, armies: best.armies },
    }
  }

  private sectorCaptureValue(
    state: GameState,
    playerId: string,
    to: GameState['board'][number],
  ): number {
    const sector = to.sector || to.continent
    if (!sector) return 0
    let total = 0
    let owned = 0
    for (const t of state.board) {
      if ((t.sector || t.continent) !== sector) continue
      total += 1
      if (t.ownerId === playerId) owned += 1
    }
    // If capture would complete sector, bigger bonus; else small pressure value
    const willOwn = owned + 1
    if (total > 0 && willOwn === total) return 3
    return Math.max(0, willOwn / Math.max(1, total) - owned / Math.max(1, total))
  }

  private simulateBattle(
    attackersStart: number,
    defendersStart: number,
  ): {
    aLoss: number
    dLoss: number
    conquered: boolean
  } {
    let a = attackersStart
    let d = defendersStart
    let aLoss = 0
    let dLoss = 0
    while (a > 0 && d > 0) {
      // Dice counts per Risk rules
      const ad = Math.min(3, Math.max(1, a)) // Using all attacking dice available (a already excludes the 1 left behind)
      const dd = Math.min(2, Math.max(1, d))
      const aRolls = this.rollDice(ad)
      const dRolls = this.rollDice(dd)
      const pairs = Math.min(aRolls.length, dRolls.length)
      for (let i = 0; i < pairs; i++) {
        if (aRolls[i] > dRolls[i]) {
          d -= 1
          dLoss += 1
        } else {
          a -= 1
          aLoss += 1
        }
      }
      if (a <= 0 || d <= 0) break
      // Stop if further progress is very unlikely (simple bound)
      if (a <= d && a <= 1) break
      // Clamp to leave one behind for occupation semantics
      if (a <= 0) break
    }
    return { aLoss, dLoss, conquered: d <= 0 }
  }

  private rollDice(n: number): number[] {
    const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6))
    return rolls.sort((a, b) => b - a)
  }

  private async generateRecruitPlan(request: DecisionRequest): Promise<GameAction[]> {
    const { gameState, player, budget } = request
    const actions: GameAction[] = []
    const roomId = gameState.roomId
    const maxActions = budget.maxPlannedActions ?? Number.POSITIVE_INFINITY

    const pushAction = (action: GameAction) => {
      if (actions.length < maxActions) {
        actions.push(action)
        return true
      }
      return false
    }

    if (gameState.phase === 'finished') {
      return []
    }

    let currentPhase = gameState.phase

    if (currentPhase === 'reinforcement') {
      const reinforcement = this.buildReinforcementAction(gameState, player.id, player.armies)
      if (reinforcement) {
        if (!pushAction(reinforcement)) {
          return actions
        }
      }

      if (!pushAction({ type: 'end_turn', roomId, playerId: player.id })) {
        return actions
      }

      currentPhase = 'attack'
    }

    if (currentPhase === 'attack') {
      const attack = this.findRecruitAttack(gameState, player.id, budget)
      if (attack) {
        if (!pushAction(attack)) {
          return actions
        }
      }

      if (!pushAction({ type: 'end_turn', roomId, playerId: player.id })) {
        return actions
      }

      currentPhase = 'fortify'
    }

    if (currentPhase === 'fortify') {
      const fortify = this.findRecruitFortify(gameState, player.id)
      if (fortify) {
        if (!pushAction(fortify)) {
          return actions
        }
      }

      pushAction({ type: 'end_turn', roomId, playerId: player.id })
    }

    return actions
  }

  private buildReinforcementAction(
    gameState: GameState,
    playerId: string,
    availableArmies: number,
  ): GameAction | null {
    if (!availableArmies || availableArmies <= 0) {
      return null
    }

    const ownedTerritories = gameState.board.filter((territory) => territory.ownerId === playerId)
    if (ownedTerritories.length === 0) {
      return null
    }

    const borderTerritories = ownedTerritories.filter((territory) =>
      this.hasEnemyNeighbor(gameState, territory, playerId),
    )

    const targetTerritories = borderTerritories.length > 0 ? borderTerritories : ownedTerritories
    const target = [...targetTerritories].sort((a, b) => a.armies - b.armies)[0]

    return {
      type: 'deploy',
      roomId: gameState.roomId,
      playerId,
      payload: {
        territoryId: target.id,
        armies: availableArmies,
      },
    }
  }

  private findRecruitAttack(
    gameState: GameState,
    playerId: string,
    budget: DecisionBudget,
  ): GameAction | null {
    const ownedTerritories = gameState.board.filter((territory) => territory.ownerId === playerId)
    const rankedSources = [...ownedTerritories].sort((a, b) => b.armies - a.armies)

    for (const source of rankedSources) {
      if (source.armies <= 3) {
        continue
      }

      const hostileNeighbors = source.adjacentTerritories
        .map((neighborId) => this.getTerritory(gameState, neighborId))
        .filter((territory): territory is NonNullable<typeof territory> => {
          if (!territory) {
            return false
          }
          if (territory.ownerId === playerId) {
            return false
          }
          if (
            territory.ownerId &&
            this.arePlayersTeammates(gameState, playerId, territory.ownerId)
          ) {
            return false
          }
          return true
        })
        // Prefer enemy capitals first, then lower armies
        .sort((a, b) => {
          const capA = a.isCapital === true ? 1 : 0
          const capB = b.isCapital === true ? 1 : 0
          if (capA !== capB) return capB - capA
          return a.armies - b.armies
        })

      // Safe attack: attacker (leaving 1 behind) exceeds defender by 1+
      const safeTarget = hostileNeighbors.find((neighbor) => source.armies - 1 > neighbor.armies)
      if (safeTarget) {
        return {
          type: 'attack',
          roomId: gameState.roomId,
          playerId,
          payload: {
            fromTerritoryId: source.id,
            toTerritoryId: safeTarget.id,
            armies: Math.min(3, Math.max(1, source.armies - 1)),
          },
        }
      }

      // No safe target found; allow a single "spice" attack if configured
      if (budget.allowOneSpiceAttack) {
        const spice = hostileNeighbors.find((neighbor) => source.armies - 1 === neighbor.armies)
        if (spice) {
          return {
            type: 'attack',
            roomId: gameState.roomId,
            playerId,
            payload: {
              fromTerritoryId: source.id,
              toTerritoryId: spice.id,
              armies: Math.min(3, Math.max(1, source.armies - 1)),
            },
          }
        }
      }

      // else continue to next source
    }

    return null
  }

  private findRecruitFortify(gameState: GameState, playerId: string): GameAction | null {
    const ownedTerritories = gameState.board.filter((territory) => territory.ownerId === playerId)

    if (ownedTerritories.length === 0) {
      return null
    }

    const interiorSources = ownedTerritories
      .filter(
        (territory) =>
          territory.armies >= 3 && !this.hasEnemyNeighbor(gameState, territory, playerId),
      )
      .sort((a, b) => b.armies - a.armies)

    const borderTargets = ownedTerritories
      .filter((territory) => this.hasEnemyNeighbor(gameState, territory, playerId))
      .sort((a, b) => {
        // Prefer fortifying capitals, then weakest borders
        const capA = a.isCapital === true ? 1 : 0
        const capB = b.isCapital === true ? 1 : 0
        if (capA !== capB) return capB - capA
        return a.armies - b.armies
      })

    for (const source of interiorSources) {
      for (const target of borderTargets) {
        if (source.adjacentTerritories.includes(target.id)) {
          const armiesToMove = Math.min(3, source.armies - 1)
          if (armiesToMove > 0) {
            return {
              type: 'fortify',
              roomId: gameState.roomId,
              playerId,
              payload: {
                fromTerritoryId: source.id,
                toTerritoryId: target.id,
                armies: armiesToMove,
              },
            }
          }
        }
      }
    }

    return null
  }

  private enforceBudget(actions: GameAction[], request: DecisionRequest): GameAction[] {
    const maxAllowed = request.budget.maxPlannedActions
    if (typeof maxAllowed === 'number') {
      if (maxAllowed <= 0) {
        return []
      }
      return actions.slice(0, maxAllowed)
    }
    return actions
  }

  private hasEnemyNeighbor(
    gameState: GameState,
    territory: GameState['board'][number],
    playerId: string,
  ): boolean {
    return territory.adjacentTerritories.some((neighborId) =>
      this.isHostileTerritory(gameState, neighborId, playerId),
    )
  }

  private isHostileTerritory(gameState: GameState, territoryId: string, playerId: string): boolean {
    const neighbor = this.getTerritory(gameState, territoryId)
    if (!neighbor) {
      return false
    }

    if (neighbor.ownerId === playerId) {
      return false
    }

    if (neighbor.ownerId && this.arePlayersTeammates(gameState, playerId, neighbor.ownerId)) {
      return false
    }

    return true
  }

  private arePlayersTeammates(
    gameState: GameState,
    playerA: string,
    playerB?: string | null,
  ): boolean {
    return utilArePlayersTeammates(gameState, playerA, playerB)
  }

  private getTerritory(gameState: GameState, territoryId: string) {
    return gameState.board.find((territory) => territory.id === territoryId) ?? null
  }

  buildFallbackPlan(gameState: GameState, playerId: string): GameAction[] {
    const actions: GameAction[] = []
    const roomId = gameState.roomId
    const phase = gameState.phase
    const player = gameState.players.find((entry) => entry.id === playerId)
    const armiesToDeploy = Math.max(0, Math.trunc(player?.armies ?? 0))
    const firstTerritoryId = player?.territories?.[0]

    const addEndTurn = () => {
      actions.push({ type: 'end_turn', roomId, playerId })
    }

    switch (phase) {
      case 'reinforcement':
        if (firstTerritoryId && armiesToDeploy > 0) {
          actions.push({
            type: 'deploy',
            roomId,
            playerId,
            payload: { territoryId: firstTerritoryId, armies: armiesToDeploy },
          })
        }
        addEndTurn()
        addEndTurn()
        break
      case 'attack':
        addEndTurn()
        addEndTurn()
        break
      case 'fortify':
        addEndTurn()
        break
      default:
        break
    }

    if (actions.length === 0) {
      actions.push({ type: 'end_turn', roomId, playerId })
    }

    return actions
  }

  private createFallbackPlan(
    reason: FallbackReason,
    request: DecisionRequest,
    startedAt: number,
  ): AIDecisionPlan {
    const fallbackActions = this.buildFallbackPlan(request.gameState, request.player.id)
    const maxAllowed = request.budget.maxPlannedActions ?? fallbackActions.length
    const boundedActions = fallbackActions.slice(0, Math.max(1, maxAllowed))

    return {
      actions: boundedActions,
      usedFallback: true,
      reason,
      diagnostics: {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        requestedDifficulty: request.difficulty,
        plannedActionCount: boundedActions.length,
        budget: {
          maxThinkTimeMs: request.budget.maxThinkTimeMs,
          maxPlannedActions: request.budget.maxPlannedActions,
          readableDelayMs: request.budget.readableDelayMs,
          maxAttackChains: request.budget.maxAttackChains,
          minAttackOddsByTier: request.budget.minAttackOddsByTier,
          allowOneSpiceAttack: request.budget.allowOneSpiceAttack,
        },
      },
    }
  }
}

export const aiDecisionService = new AIDecisionService()
