import type { AIDifficulty, GameAction, GamePlayer, GameState } from '../types/game'

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
      const plannedActions = this.generatePlan(request)

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

  private generatePlan(request: DecisionRequest): GameAction[] {
    if (request.player.isEliminated) {
      return []
    }

    switch (request.difficulty) {
      case 'recruit':
        return this.generateRecruitPlan(request)
      default:
        return []
    }
  }

  private generateRecruitPlan(request: DecisionRequest): GameAction[] {
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
    if (!playerB || playerB === 'neutral') {
      return false
    }

    if (!gameState.gameConfig.allowTeamPlay) {
      return false
    }

    const player = gameState.players.find((entry) => entry.id === playerA)
    const teammate = gameState.players.find((entry) => entry.id === playerB)

    if (!player || !teammate) {
      return false
    }

    const playerTeam = typeof player.teamId === 'number' && player.teamId > 0 ? player.teamId : null
    const teammateTeam =
      typeof teammate.teamId === 'number' && teammate.teamId > 0 ? teammate.teamId : null

    return playerTeam !== null && playerTeam === teammateTeam
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
