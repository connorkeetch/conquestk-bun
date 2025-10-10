import { treasureMetrics } from '../services/metricsService.js'
import territoryModifierService, {
  type GameTerritoryModifier,
} from '../services/territoryModifierService.js'
import { getPlayerTeam as utilGetPlayerTeam, arePlayersTeammates as utilArePlayersTeammates } from '../utils/gameTeams.js'
import type {
  AttackAction,
  BattleResult,
  ContinentBonus,
  DeployAction,
  FortifyAction,
  GameAction,
  GameConfiguration,
  GamePlayer,
  GameState,
  KingOfTheHillConfig,
  KingOfTheHillState,
  Metal,
  ProcessActionResult,
  Territory,
  TradeCardsAction,
  TreasureConfig,
} from '../types/game.js'
import {
  drawTreasure,
  ensureTreasureState,
  findRedeemableSets,
  normalizeTreasureConfig,
  redeemSet,
} from './hiddenTreasures.js'

export class GameEngine {
  // Cache modifiers per room to prevent memory leaks
  private gameModifiersCache: Map<string, Map<string, GameTerritoryModifier>> = new Map()

  private cyrb128(seed: string): [number, number, number, number] {
    let h1 = 1779033703
    let h2 = 3144134277
    let h3 = 1013904242
    let h4 = 2773480762
    for (let i = 0; i < seed.length; i++) {
      const k = seed.charCodeAt(i)
      h1 = (h2 ^ Math.imul(h1 ^ k, 597399067)) >>> 0
      h2 = (h3 ^ Math.imul(h2 ^ k, 2869860233)) >>> 0
      h3 = (h4 ^ Math.imul(h3 ^ k, 951274213)) >>> 0
      h4 = (h1 ^ Math.imul(h4 ^ k, 2716044179)) >>> 0
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067) >>> 0
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233) >>> 0
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213) >>> 0
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179) >>> 0
    return [h1, h2, h3, h4]
  }

  private sfc32(a: number, b: number, c: number, d: number): () => number {
    let _a = a >>> 0
    let _b = b >>> 0
    let _c = c >>> 0
    let _d = d >>> 0
    return () => {
      const t = (((_a + _b) | 0) + _d) | 0
      _d = (_d + 1) | 0
      _a = _b ^ (_b >>> 9)
      _b = (_c + (_c << 3)) | 0
      _c = (_c << 21) | (_c >>> 11) | 0
      _c = (_c + t) | 0
      return (t >>> 0) / 4294967296
    }
  }

  private ensureCombatRng(gameState: GameState): { a: number; b: number; c: number; d: number } {
    if (!gameState.combatRngSeed || !gameState.combatRngState) {
      const seed = gameState.combatRngSeed || `${gameState.roomId}:legacy`
      const [a, b, c, d] = this.cyrb128(seed)
      gameState.combatRngSeed = seed
      gameState.combatRngState = { a, b, c, d }
    }
    return gameState.combatRngState
  }

  private nextRandom(gameState: GameState): number {
    const st = this.ensureCombatRng(gameState)
    const next = this.sfc32(st.a, st.b, st.c, st.d)
    const r = next()
    const r1 = Math.floor(next() * 4294967296) >>> 0
    const r2 = Math.floor(next() * 4294967296) >>> 0
    const r3 = Math.floor(next() * 4294967296) >>> 0
    const r4 = Math.floor(next() * 4294967296) >>> 0
    gameState.combatRngState = { a: r1, b: r2, c: r3, d: r4 }
    return r
  }

  /**
   * Clear cached modifiers for a specific room (call when game ends)
   */
  clearModifiersCache(roomId: string): void {
    this.gameModifiersCache.delete(roomId)
  }

  initializeGame(
    roomId: string,
    playerConfigs: Array<{
      userId: string
      username?: string
      teamId?: number | null
      isAi?: boolean
      aiDifficulty?: 'recruit' | 'commander' | 'grandmaster' | null
      aiPersonalitySeed?: number | null
      // Optional rating carried from lobby/DB for client display
      skillRating?: number | null
    }>,
    gameConfig: GameConfiguration,
    mapOverrides: { territories: Territory[]; continentBonuses: ContinentBonus[] },
  ): GameState {
    if (!mapOverrides || !Array.isArray(mapOverrides.territories)) {
      throw new Error('Map data not provided to GameEngine')
    }
    const baseTerritories = mapOverrides.territories
    // Ensure we operate on a fresh copy
    const territories = baseTerritories.map((t) => ({
      id: t.id,
      name: t.name,
      // Prefer sector; fall back to legacy continent name if present
      sector: (t.sector || t.continent || 'unknown') as string,
      ownerId: null,
      armies: 0,
      adjacentTerritories: [...t.adjacentTerritories],
      coordinates: t.coordinates ? { ...t.coordinates } : undefined,
      isCapital: t.isCapital,
      capitalOwnerId: t.capitalOwnerId ?? null,
    }))
    const players = this.createPlayers(playerConfigs)

    // Randomize player order
    this.randomizePlayerOrder(players)

    // Distribute territories fairly with neutrals
    this.distributeTerritoriesWithNeutrals(territories, players)

    let kingConfig: KingOfTheHillConfig | null = null
    let hillRotation: { current: string; queue: string[] } | null = null

    if (gameConfig.gameMode === 'king_of_the_hill') {
      kingConfig = this.normalizeKingOfTheHillConfig(gameConfig.kingOfTheHill, territories)
      hillRotation = this.createInitialHillRotation(territories, kingConfig)
      if (hillRotation) {
        this.prepareInitialHillTerritory(territories, players, kingConfig, hillRotation.current)
      }
    }

    // Each player starts with 3 armies per territory
    this.deployInitialArmies(territories, players, gameConfig)

    const hydratedConfig: GameConfiguration = {
      ...gameConfig,
      sectorBonuses:
        gameConfig.sectorBonuses && gameConfig.sectorBonuses.length > 0
          ? gameConfig.sectorBonuses
          : gameConfig.continentBonuses && gameConfig.continentBonuses.length > 0
            ? gameConfig.continentBonuses
            : mapOverrides.continentBonuses,
    }

    if (kingConfig) {
      hydratedConfig.kingOfTheHill = kingConfig
    }

    const treasureConfig = this.ensureTreasureConfig(hydratedConfig)
    treasureMetrics.recordMode(treasureConfig)

    if (hydratedConfig.gameMode === 'assassination') {
      hydratedConfig.allowTeamPlay = false
    }

    const assassinationTargets =
      hydratedConfig.gameMode === 'assassination'
        ? this.assignAssassinationTargets(players)
        : undefined

    const kingOfTheHillState =
      kingConfig && hillRotation
        ? this.createInitialKingOfTheHillState(kingConfig, hillRotation)
        : undefined

    const gameState: GameState = {
      roomId,
      players,
      currentPlayer: players[0].id,
      phase: 'reinforcement',
      turn: 1,
      board: territories,
      cards: [],
      gameConfig: hydratedConfig,
      movementTracking: {},
      treasureState: treasureConfig.enabled ? ensureTreasureState() : undefined,
      mustCashInTreasures: false,
      conqueredDuringTurn: false,
      assassinationTargets,
      kingOfTheHillState,
    }

    this.prepareReinforcementPhase(gameState, treasureConfig)

    return gameState
  }

  async processAction(gameState: GameState, action: GameAction): Promise<ProcessActionResult> {
    const newState = { ...gameState }
    // Increment version on every state mutation for desync detection
    newState.version = (newState.version ?? 0) + 1

    switch (action.type) {
      case 'deploy':
        return { gameState: this.handleDeploy(newState, action) }
      case 'attack': {
        const battleResult = await this.handleAttack(newState, action)
        return { gameState: newState, battleResult }
      }
      case 'fortify':
        return { gameState: this.handleFortify(newState, action) }
      case 'transfer_conquest': {
        const { fromTerritoryId, toTerritoryId, armies } = (action as import('../types/game.js').TransferConquestAction).payload
        const updated = this.transferConquestArmies(
          newState,
          action.playerId,
          fromTerritoryId,
          toTerritoryId,
          armies,
        )
        return { gameState: updated }
      }
      case 'undo_fortify':
        return { gameState: this.handleUndoFortify(newState, action) }
      case 'end_turn':
        return { gameState: this.handleEndTurn(newState) }
      case 'trade_cards':
        return { gameState: this.handleTradeCards(newState, action) }
      case 'go_back_to_reinforcement':
        return { gameState: this.handleGoBackToReinforcement(newState) }
      default: {
        const _exhaustiveCheck: never = action
        throw new Error(`Unknown action type received in game engine`)
      }
    }
  }

  validateAction(gameState: GameState, action: GameAction): boolean {
    if (action.playerId !== gameState.currentPlayer) {
      return false
    }

    switch (action.type) {
      case 'deploy':
        return this.validateDeploy(gameState, action)
      case 'attack':
        return this.validateAttack(gameState, action)
      case 'fortify':
        return this.validateFortify(gameState, action)
      case 'transfer_conquest':
        // Validation for transfer is enforced at the service layer; allow here to keep switch exhaustive
        return true
      case 'undo_fortify':
        return this.validateUndoFortify(gameState, action)
      case 'end_turn': {
        if (gameState.mustCashInTreasures) {
          return false
        }

        if (gameState.phase === 'reinforcement') {
          const player = gameState.players.find((p) => p.id === action.playerId)
          if (player && player.armies > 0) {
            return false
          }
        }

        return true
      }
      case 'trade_cards':
        return this.validateTreasureTrade(gameState, action)
      case 'go_back_to_reinforcement':
        return gameState.phase === 'attack' && !gameState.hasAttackedThisTurn
      default:
        return false
    }
  }

  private createPlayers(
    playerConfigs: Array<{
      userId: string
      username?: string
      teamId?: number | null
      isAi?: boolean
      aiDifficulty?: 'recruit' | 'commander' | 'grandmaster' | null
      aiPersonalitySeed?: number | null
      color?: string | null
      skillRating?: number | null
    }>,
  ): GamePlayer[] {
    const fallbackPalette = [
      '#DC2626',
      '#851D2D',
      '#EC4899',
      '#EA580C',
      '#F59E0B',
      '#014421',
      '#059669',
      '#2563EB',
      '#06B6D4',
      '#7C3AED',
      '#918151',
      '#5C4033',
    ]

    const namedPalette: Record<string, string> = {
      red: '#DC2626',
      blue: '#2563EB',
      green: '#059669',
      yellow: '#F59E0B',
      purple: '#7C3AED',
      orange: '#EA580C',
      cyan: '#06B6D4',
      pink: '#EC4899',
      brown: '#5C4033',
      lime: '#014421',
      indigo: '#7C3AED',
      teal: '#06B6D4',
    }

    const assigned = new Set<string>()

    const colorKey = (value: string): string => {
      const trimmed = value.trim()
      if (trimmed.startsWith('#')) {
        return trimmed.toUpperCase()
      }
      return trimmed.toLowerCase()
    }

    const normalizeColor = (value?: string | null): string | null => {
      if (!value || typeof value !== 'string') {
        return null
      }

      const trimmed = value.trim()
      if (!trimmed) {
        return null
      }

      if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmed)) {
        return trimmed.toUpperCase()
      }

      const mapped = namedPalette[trimmed.toLowerCase()]
      if (mapped) {
        return mapped
      }

      return trimmed
    }

    const resolveColor = (candidate: string | null | undefined, fallbackIndex: number): string => {
      const normalized = normalizeColor(candidate)
      if (normalized) {
        const key = colorKey(normalized)
        if (!assigned.has(key)) {
          assigned.add(key)
          return normalized
        }
      }

      for (const fallback of fallbackPalette) {
        const key = colorKey(fallback)
        if (!assigned.has(key)) {
          assigned.add(key)
          return fallback
        }
      }

      const fallback = fallbackPalette[fallbackIndex % fallbackPalette.length]
      assigned.add(colorKey(fallback))
      return fallback
    }

    return playerConfigs.map((player, index) => ({
      id: player.userId,
      username: player.username || `Player ${index + 1}`,
      color: resolveColor(player.color, index),
      armies: this.calculateInitialArmies(playerConfigs.length),
      territories: [],
      cards: [],
      isEliminated: false,
      skillRating:
        typeof player.skillRating === 'number' && Number.isFinite(player.skillRating)
          ? Math.trunc(player.skillRating)
          : undefined,
      teamId:
        typeof player.teamId === 'number' && !Number.isNaN(player.teamId) && player.teamId > 0
          ? player.teamId
          : null,
      isAi: player.isAi === true,
      aiDifficulty: player.aiDifficulty ?? null,
      aiPersonalitySeed:
        typeof player.aiPersonalitySeed === 'number' && Number.isFinite(player.aiPersonalitySeed)
          ? Math.trunc(player.aiPersonalitySeed)
          : (player.aiPersonalitySeed ?? null),
      treasures: [],
      mustCashInTreasures: false,
    }))
  }

  private calculateInitialArmies(playerCount: number): number {
    const armyMap: { [key: number]: number } = {
      2: 40,
      3: 35,
      4: 30,
      5: 25,
      6: 20,
    }
    return armyMap[playerCount] || 20
  }

  private ensureTreasureConfig(gameConfig: GameConfiguration): TreasureConfig {
    const normalized = normalizeTreasureConfig(gameConfig.treasureConfig)
    gameConfig.treasureConfig = normalized
    return normalized
  }

  private getPlayerTreasureHand(player: GamePlayer): Metal[] {
    if (!player.treasures) {
      player.treasures = []
    }
    return player.treasures
  }

  private updateCurrentPlayerCashRequirement(
    gameState: GameState,
    treasureConfig: TreasureConfig,
  ): void {
    if (!treasureConfig.enabled) {
      gameState.mustCashInTreasures = false
      return
    }

    const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer)
    if (!currentPlayer) {
      gameState.mustCashInTreasures = false
      return
    }

    const hand = this.getPlayerTreasureHand(currentPlayer)
    const hasValidSet = findRedeemableSets(hand).length > 0
    currentPlayer.mustCashInTreasures = hand.length >= treasureConfig.handCap && hasValidSet
    gameState.mustCashInTreasures = currentPlayer.mustCashInTreasures ?? false
  }

  private maybeAwardTreasureForConquest(
    gameState: GameState,
    player: GamePlayer,
    treasureConfig: TreasureConfig,
  ): void {
    if (!treasureConfig.enabled || !gameState.conqueredDuringTurn) {
      return
    }

    const treasureState = ensureTreasureState(gameState.treasureState)
    const treasure = drawTreasure(treasureConfig)
    const hand = this.getPlayerTreasureHand(player)
    hand.push(treasure)
    gameState.treasureState = treasureState
    treasureMetrics.recordDraw(treasureConfig, treasure)

    if (hand.length >= treasureConfig.handCap) {
      player.mustCashInTreasures = findRedeemableSets(hand).length > 0
    }
  }

  private transferEliminatedTreasures(
    gameState: GameState,
    eliminatorId: string,
    treasureConfig: TreasureConfig,
    eliminatedPlayerIds: string[] = [],
  ): void {
    if (!treasureConfig.enabled || eliminatedPlayerIds.length === 0) {
      return
    }

    const eliminator = gameState.players.find((p) => p.id === eliminatorId)
    if (!eliminator) {
      return
    }

    const eliminatorHand = this.getPlayerTreasureHand(eliminator)
    let transferred = 0

    for (const playerId of eliminatedPlayerIds) {
      const eliminated = gameState.players.find((p) => p.id === playerId)
      if (!eliminated || !eliminated.treasures || eliminated.treasures.length === 0) {
        continue
      }

      eliminatorHand.push(...eliminated.treasures)
      transferred += eliminated.treasures.length
      eliminated.treasures = []
      eliminated.mustCashInTreasures = false
    }

    if (transferred > 0 && eliminatorHand.length >= treasureConfig.handCap) {
      const hasValidSet = findRedeemableSets(eliminatorHand).length > 0
      eliminator.mustCashInTreasures = hasValidSet
      if (hasValidSet && eliminator.id === gameState.currentPlayer) {
        gameState.mustCashInTreasures = true
      }
    }
  }

  private randomizePlayerOrder(players: GamePlayer[]): void {
    const shuffleInPlace = <T>(items: T[]): void => {
      for (let index = items.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1))
        ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
      }
    }

    const teamBuckets = new Map<number, GamePlayer[]>()
    const soloPlayers: GamePlayer[] = []

    for (const player of players) {
      const teamId =
        typeof player.teamId === 'number' && Number.isFinite(player.teamId) && player.teamId > 0
          ? Math.trunc(player.teamId)
          : null
      if (teamId) {
        const bucket = teamBuckets.get(teamId)
        if (bucket) {
          bucket.push(player)
        } else {
          teamBuckets.set(teamId, [player])
        }
      } else {
        soloPlayers.push(player)
      }
    }

    if (teamBuckets.size <= 1) {
      shuffleInPlace(players)
      return
    }

    const rotation: Array<{ members: GamePlayer[] }> = []

    for (const [, members] of teamBuckets) {
      const copy = [...members]
      shuffleInPlace(copy)
      rotation.push({ members: copy })
    }

    for (const solo of soloPlayers) {
      rotation.push({ members: [solo] })
    }

    shuffleInPlace(rotation)

    const ordered: GamePlayer[] = []
    let madeProgress = true

    while (madeProgress) {
      madeProgress = false
      for (const bucket of rotation) {
        const next = bucket.members.shift()
        if (next) {
          ordered.push(next)
          madeProgress = true
        }
      }
    }

    if (ordered.length !== players.length) {
      const remaining = players.filter((player) => !ordered.includes(player))
      shuffleInPlace(remaining)
      ordered.push(...remaining)
    }

    players.splice(0, players.length, ...ordered)
  }

  private shuffleArray<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
  }

  private assignAssassinationTargets(players: GamePlayer[]): Record<string, string> | undefined {
    const eligible = players.filter((player) => !player.isEliminated)
    if (eligible.length < 2) {
      return undefined
    }

    const shuffled = [...eligible]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const assignments: Record<string, string> = {}
    for (let i = 0; i < shuffled.length; i++) {
      const hunter = shuffled[i]
      const target = shuffled[(i + 1) % shuffled.length]
      assignments[hunter.id] = target.id
    }

    return assignments
  }

  private normalizeKingOfTheHillConfig(
    config: KingOfTheHillConfig | undefined,
    territories: Territory[],
  ): KingOfTheHillConfig {
    const territoryIds = territories.map((territory) => territory.id)
    const territoryIdSet = new Set(territoryIds)

    const eligibleSource = Array.isArray((config as Record<string, unknown>)?.eligibleTerritories)
      ? ((config as Record<string, unknown>).eligibleTerritories as string[])
      : config?.eligibleTerritoryIds

    const eligibleSet = new Set<string>(
      (eligibleSource && eligibleSource.length > 0 ? eligibleSource : territoryIds).filter((id: string) =>
        territoryIdSet.has(id),
      ),
    )

    if (eligibleSet.size === 0) {
      for (const id of territoryIds) {
        eligibleSet.add(id)
      }
    }

    const rawRotationOrder = Array.isArray(config?.rotationOrder) ? config.rotationOrder : []
    const rotationOrder: string[] = []
    const seenRotation = new Set<string>()
    for (const id of rawRotationOrder) {
      if (typeof id !== 'string' || !eligibleSet.has(id) || seenRotation.has(id)) {
        continue
      }
      seenRotation.add(id)
      rotationOrder.push(id)
    }

    const targetPoints = Math.max(1, Math.floor(config?.targetPoints ?? 10))
    const neutralArmies = Math.max(1, Math.floor(config?.neutralArmies ?? 8))
    const previewTurns = Math.max(0, Math.floor(config?.previewTurns ?? 2))
    const rawInterval =
      typeof config?.rotationInterval === 'number' && Number.isFinite(config.rotationInterval)
        ? Math.floor(config.rotationInterval)
        : null
    const rotationInterval = rawInterval && rawInterval > 0 ? rawInterval : null

    return {
      targetPoints,
      neutralArmies,
      previewTurns,
      rotationInterval,
      eligibleTerritoryIds: Array.from(eligibleSet),
      rotationOrder,
    }
  }

  private createInitialHillRotation(
    territories: Territory[],
    config: KingOfTheHillConfig,
  ): { current: string; queue: string[] } | null {
    const territoryIds = territories.map((territory) => territory.id)
    const territoryIdSet = new Set(territoryIds)
    const eligiblePool =
      config.eligibleTerritoryIds && config.eligibleTerritoryIds.length > 0
        ? config.eligibleTerritoryIds.filter((id) => territoryIdSet.has(id))
        : territoryIds

    if (eligiblePool.length === 0) {
      return null
    }

    let rotationPool: string[]
    const eligiblePoolSet = new Set(eligiblePool)

    if (config.rotationOrder && config.rotationOrder.length > 0) {
      const uniqueOrder: string[] = []
      const seen = new Set<string>()
      for (const id of config.rotationOrder) {
        if (typeof id !== 'string' || !eligiblePoolSet.has(id) || seen.has(id)) {
          continue
        }
        seen.add(id)
        uniqueOrder.push(id)
      }
      const remaining = eligiblePool.filter((id: string) => !seen.has(id))
      rotationPool = [...uniqueOrder, ...remaining]
    } else {
      rotationPool = [...eligiblePool]
      this.shuffleArray(rotationPool)
    }

    const current = rotationPool.shift() ?? eligiblePool[0]
    const queue = rotationPool

    return { current, queue }
  }

  private prepareInitialHillTerritory(
    territories: Territory[],
    players: GamePlayer[],
    config: KingOfTheHillConfig,
    hillId: string,
  ): void {
    const hillTerritory = territories.find((territory) => territory.id === hillId)
    if (!hillTerritory) {
      return
    }

    const previousOwner = hillTerritory.ownerId
    hillTerritory.ownerId = 'neutral'
    hillTerritory.armies = config.neutralArmies ? Math.max(1, Math.floor(config.neutralArmies)) : 8

    if (previousOwner && previousOwner !== 'neutral') {
      const owner = players.find((player) => player.id === previousOwner)
      if (owner) {
        owner.territories = owner.territories.filter((territoryId) => territoryId !== hillId)
      }
    }
  }

  private createInitialKingOfTheHillState(
    config: KingOfTheHillConfig,
    rotation: { current: string; queue: string[] },
  ): KingOfTheHillState {
    const rotationInterval =
      typeof config.rotationInterval === 'number' && config.rotationInterval > 0
        ? config.rotationInterval
        : null

    const previewTurns = Math.max(0, config.previewTurns ?? 0)

    return {
      currentHillTerritoryId: rotation.current,
      points: {},
      targetPoints: Math.max(1, config.targetPoints ?? 10),
      rotationInterval,
      turnsUntilRotation: rotationInterval ?? null,
      upcomingHillTerritoryId: rotation.queue.length > 0 ? rotation.queue[0] : null,
      previewTurns,
      neutralArmies: Math.max(1, config.neutralArmies ?? 8),
      rotationQueue: [...rotation.queue],
      eligibleTerritoryIds: config.eligibleTerritoryIds
        ? [...config.eligibleTerritoryIds]
        : undefined,
      lastScoreTurn: undefined,
    }
  }

  private handleKingOfTheHillRoundComplete(gameState: GameState): void {
    const state = gameState.kingOfTheHillState
    if (!state) {
      return
    }

    // Guard against double-processing within the same round. If we've already
    // processed scoring/rotation for this gameState.turn, do nothing.
    if (state.lastScoreTurn === gameState.turn) {
      return
    }

    state.lastScoreTurn = gameState.turn

    const hillTerritory = gameState.board.find(
      (territory) => territory.id === state.currentHillTerritoryId,
    )
    if (hillTerritory) {
      const ownerId = hillTerritory.ownerId
      if (ownerId && ownerId !== 'neutral') {
        const owner = gameState.players.find((player) => player.id === ownerId)
        if (owner && !owner.isEliminated) {
          state.points[owner.id] = (state.points[owner.id] ?? 0) + 1
          if (this.isKingOfTheHillVictory(gameState, owner)) {
            this.endGame(gameState, owner)
          }
        }
      }
    }

    if (gameState.phase !== 'finished') {
      this.progressKingOfTheHillRotation(gameState)
    }
  }

  private progressKingOfTheHillRotation(gameState: GameState): void {
    const state = gameState.kingOfTheHillState
    if (!state || !state.rotationInterval || state.rotationInterval <= 0) {
      return
    }

    // DEBUG: trace KOTH rotation progression during tests
    // console.log('[KOTH] progress start', {
    //   turn: gameState.turn,
    //   current: state.currentHillTerritoryId,
    //   turnsUntilRotation: state.turnsUntilRotation,
    //   queueHead: state.rotationQueue?.[0],
    // })

    const remaining =
      typeof state.turnsUntilRotation === 'number'
        ? state.turnsUntilRotation - 1
        : state.rotationInterval - 1

    if (remaining <= 0) {
      this.rotateKingOfTheHill(gameState)
    } else {
      state.turnsUntilRotation = remaining
      if (state.rotationQueue && state.rotationQueue.length > 0) {
        state.upcomingHillTerritoryId = state.rotationQueue[0] ?? null
      }
    }
  }

  private rotateKingOfTheHill(gameState: GameState): void {
    const state = gameState.kingOfTheHillState
    if (!state || !state.rotationInterval || state.rotationInterval <= 0) {
      return
    }

    // DEBUG: trace KOTH rotation
    // console.log('[KOTH] rotate', {
    //   turn: gameState.turn,
    //   from: state.currentHillTerritoryId,
    //   to: state.rotationQueue?.[0],
    //   queueLen: state.rotationQueue?.length,
    // })

    const queue = state.rotationQueue ? [...state.rotationQueue] : []
    if (queue.length === 0) {
      queue.push(...this.refillHillRotationQueue(gameState))
    }

    if (queue.length === 0) {
      state.turnsUntilRotation = state.rotationInterval
      state.upcomingHillTerritoryId = null
      return
    }

    const nextHill = queue.shift()
    if (!nextHill) {
      state.turnsUntilRotation = state.rotationInterval
      state.upcomingHillTerritoryId = null
      return
    }

    state.currentHillTerritoryId = nextHill
    state.rotationQueue = queue

    this.ensureHillNeutralDefenders(gameState, nextHill)

    if (!state.rotationQueue || state.rotationQueue.length === 0) {
      state.rotationQueue = this.refillHillRotationQueue(gameState)
    }

    state.turnsUntilRotation = state.rotationInterval
    state.upcomingHillTerritoryId =
      state.rotationQueue && state.rotationQueue.length > 0 ? state.rotationQueue[0] : null
  }

  private refillHillRotationQueue(gameState: GameState): string[] {
    const state = gameState.kingOfTheHillState
    if (!state) {
      return []
    }

    const eligibleIds =
      state.eligibleTerritoryIds && state.eligibleTerritoryIds.length > 0
        ? state.eligibleTerritoryIds
        : gameState.board.map((territory) => territory.id)

    const pool: string[] = []
    const seen = new Set<string>()
    for (const id of eligibleIds) {
      if (id === state.currentHillTerritoryId || seen.has(id)) {
        continue
      }
      seen.add(id)
      pool.push(id)
    }

    this.shuffleArray(pool)
    return pool
  }

  private ensureHillNeutralDefenders(gameState: GameState, territoryId: string): void {
    const state = gameState.kingOfTheHillState
    if (!state) {
      return
    }

    const territory = gameState.board.find((t) => t.id === territoryId)
    if (!territory) {
      return
    }

    if (!territory.ownerId || territory.ownerId === 'neutral') {
      territory.ownerId = 'neutral'
      if (typeof territory.armies !== 'number' || territory.armies < state.neutralArmies) {
        territory.armies = state.neutralArmies
      }
    }
  }

  private isKingOfTheHillVictory(gameState: GameState, player: GamePlayer): boolean {
    const state = gameState.kingOfTheHillState
    if (!state) {
      return false
    }

    const target = Math.max(1, state.targetPoints ?? 0)
    const playerPoints = state.points[player.id] ?? 0
    if (playerPoints >= target) {
      return true
    }

    if (!gameState.gameConfig.allowTeamPlay) {
      return false
    }

    const teamId = this.getPlayerTeam(gameState, player.id)
    if (!teamId) {
      return false
    }

    let total = 0
    for (const teammate of gameState.players) {
      if (teammate.isEliminated) {
        continue
      }

      if (this.getPlayerTeam(gameState, teammate.id) === teamId) {
        total += state.points[teammate.id] ?? 0
        if (total >= target) {
          return true
        }
      }
    }

    return false
  }

  private distributeTerritoriesWithNeutrals(territories: Territory[], players: GamePlayer[]): void {
    // Calculate territories per player (equivalent distribution)
    const territoriesPerPlayer = Math.floor(territories.length / (players.length + 1)) // +1 for neutral

    // Shuffle territories for random distribution
    const shuffledTerritories = [...territories]
    for (let i = shuffledTerritories.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffledTerritories[i], shuffledTerritories[j]] = [
        shuffledTerritories[j],
        shuffledTerritories[i],
      ]
    }

    let territoryIndex = 0

    // Distribute to players
    for (const player of players) {
      for (let i = 0; i < territoriesPerPlayer; i++) {
        if (territoryIndex < shuffledTerritories.length) {
          const territory = shuffledTerritories[territoryIndex]
          territory.ownerId = player.id
          territory.armies = 3 // Each territory starts with 3 armies
          player.territories.push(territory.id)
          territoryIndex++
        }
      }
    }

    // Remaining territories become neutral (grey)
    while (territoryIndex < shuffledTerritories.length) {
      const territory = shuffledTerritories[territoryIndex]
      territory.ownerId = 'neutral'
      territory.armies = 3 // Neutral territories have 3 armies
      territoryIndex++
    }
  }

  private deployInitialArmies(
    territories: Territory[],
    players: GamePlayer[],
    gameConfig: GameConfiguration,
  ): void {
    // Initial armies already deployed (3 per territory)
    // Calculate reinforcement armies for each player
    for (const player of players) {
      player.armies = this.calculateReinforcementArmies(player.territories, territories, gameConfig)
    }
  }

  calculateReinforcementArmies(
    playerTerritories: string[],
    allTerritories: Territory[],
    gameConfig?: GameConfiguration,
  ): number {
    const territoryCount = playerTerritories.length

    // Base armies: 3 minimum, or territories/3 (rounded down)
    let armies = Math.max(3, Math.floor(territoryCount / 3))

    // Add sector (formerly continent) bonuses
    armies += this.calculateSectorBonuses(playerTerritories, allTerritories, gameConfig)

    return armies
  }

  private calculateSectorBonuses(
    playerTerritories: string[],
    allTerritories: Territory[],
    gameConfig?: GameConfiguration,
  ): number {
    let bonusArmies = 0

    // Use configured bonuses if explicitly provided. If continentBonuses is provided (even empty),
    // prefer it; otherwise fall back to sectorBonuses.
    const configuredBonuses = gameConfig
      ? gameConfig.continentBonuses !== undefined
        ? gameConfig.continentBonuses
        : gameConfig.sectorBonuses
      : undefined
    if (Array.isArray(configuredBonuses) && configuredBonuses.length > 0) {
      // Dynamic sector bonuses from database (custom maps)
      for (const sector of configuredBonuses) {
        const playerOwnsAll = sector.territories.every((territoryId) =>
          playerTerritories.includes(territoryId),
        )

        if (playerOwnsAll) {
          bonusArmies += sector.bonusArmies
        }
      }
    } else {
      // Fallback to classic Risk sector (continent) bonuses
      const classicSectorBonuses: { [sector: string]: number } = {
        'north-america': 5,
        'south-america': 2,
        europe: 5,
        asia: 7,
        africa: 3,
        australia: 2,
      }

      const sectors: { [sector: string]: string[] } = {}

      // Group territories by sector
      for (const territory of allTerritories) {
        const sec = (territory.sector || territory.continent || 'unknown') as string
        if (!sectors[sec]) {
          sectors[sec] = []
        }
        sectors[sec].push(territory.id)
      }

      // Check each sector for complete control
      for (const [sector, territories] of Object.entries(sectors)) {
        const playerOwnsAll = territories.every((territoryId) =>
          playerTerritories.includes(territoryId),
        )

        if (playerOwnsAll && classicSectorBonuses[sector]) {
          bonusArmies += classicSectorBonuses[sector]
        }
      }
    }

    return bonusArmies
  }

  private handleDeploy(gameState: GameState, action: DeployAction): GameState {
    const { territoryId, armies } = action.payload
    const territory = gameState.board.find((t) => t.id === territoryId)

    if (territory && this.isFriendlyTerritory(gameState, action.playerId, territory.ownerId)) {
      const baseline = gameState.reinforcementBaseline?.[territoryId]
      if (typeof baseline === 'number' && armies < 0) {
        const allowedUndo = Math.max(0, territory.armies - baseline)
        const requested = Math.abs(armies)
        const actual = Math.min(allowedUndo, requested)
        territory.armies = Math.max(baseline, territory.armies - actual)
        const player = gameState.players.find((p) => p.id === action.playerId)
        if (player) player.armies += actual
        const entry = {
          playerId: action.playerId,
          territoryId,
          armies: -actual,
          ts: Date.now(),
        }
        gameState.reinforcementHistory = [...(gameState.reinforcementHistory ?? []), entry]
      } else {
        territory.armies += armies
        const player = gameState.players.find((p) => p.id === action.playerId)
        if (player) {
          player.armies -= armies
          if (player.armies <= 0) {
            player.armies = 0
            if (gameState.phase === 'reinforcement') {
              const resumePhase = gameState.resumePhaseAfterReinforcement
              if (resumePhase && resumePhase !== 'reinforcement') {
                gameState.phase = resumePhase
                if (resumePhase === 'attack') {
                  gameState.hasAttackedThisTurn =
                    gameState.resumeHasAttackedAfterReinforcement ??
                    gameState.hasAttackedThisTurn ??
                    false
                }
              } else {
                gameState.phase = 'attack'
                gameState.hasAttackedThisTurn = false
              }
              gameState.resumePhaseAfterReinforcement = null
              gameState.resumeHasAttackedAfterReinforcement = undefined
            }
          }
        }
        const entry = {
          playerId: action.playerId,
          territoryId,
          armies,
          ts: Date.now(),
        }
        gameState.reinforcementHistory = [...(gameState.reinforcementHistory ?? []), entry]
      }
    }

    return gameState
  }

  private async handleAttack(gameState: GameState, action: AttackAction): Promise<BattleResult> {
    const { fromTerritoryId, toTerritoryId } = action.payload

    const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId)
    const toTerritory = gameState.board.find((t) => t.id === toTerritoryId)

    if (!fromTerritory || !toTerritory) {
      throw new Error('Invalid territories for attack')
    }

    // Enforce phase and minimum armies invariant here as a safety net
    if (gameState.phase !== 'attack') {
      throw new Error('Cannot attack outside of attack phase')
    }
    if (fromTerritory.armies <= 1) {
      throw new Error('Not enough armies to attack')
    }

    const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig)

    // Mark that player has attacked this turn
    gameState.hasAttackedThisTurn = true

    // Get territory modifiers if game uses them
    let _attackBonus = 0
    let _defenseBonus = 0

    if (gameState.gameConfig?.useTerritoryModifiers && gameState.roomId) {
      // Load modifiers if not cached for this room
      let gameModifiers = this.gameModifiersCache.get(gameState.roomId)
      if (!gameModifiers) {
        gameModifiers = await territoryModifierService.getGameModifiers(gameState.roomId)
        this.gameModifiersCache.set(gameState.roomId, gameModifiers)
      }

      const attackerModifier = gameModifiers.get(fromTerritoryId)
      const defenderModifier = gameModifiers.get(toTerritoryId)

      if (attackerModifier) {
        _attackBonus = attackerModifier.attack_bonus
      }
      if (defenderModifier) {
        _defenseBonus = defenderModifier.defense_bonus
      }
    }

    // Determine number of dice - always use maximum available
    // Attackers: 3 dice max (or armies - 1 if less), minimum 1
    // Defenders: 2 dice max (or armies if less), minimum 1
    const attackerDiceCount = Math.max(1, Math.min(3, fromTerritory.armies - 1))
    const defenderDiceCount = Math.max(1, Math.min(2, toTerritory.armies))

    const battleResult = this.simulateBattle(gameState, attackerDiceCount, defenderDiceCount)

    // Apply losses
    fromTerritory.armies = Math.max(1, fromTerritory.armies - battleResult.attackerLosses)
    toTerritory.armies = Math.max(0, toTerritory.armies - battleResult.defenderLosses)

    // Check if territory was conquered
    const conquered = toTerritory.armies === 0
    if (conquered) {
      // Update territory ownership and player territory lists
      const attacker = gameState.players.find((p) => p.id === action.playerId)
      const defender = gameState.players.find((p) => p.id === toTerritory.ownerId)

      if (attacker && defender) {
        // Remove territory from defender
        defender.territories = defender.territories.filter((t) => t !== toTerritoryId)
        // Add territory to attacker
        attacker.territories.push(toTerritoryId)
        this.getPlayerTreasureHand(attacker)
      }

      toTerritory.ownerId = action.playerId
      toTerritory.armies = 1 // Attacker must move at least 1 army
      fromTerritory.armies -= 1
      gameState.conqueredDuringTurn = true
    }

    const result: BattleResult = {
      ...battleResult,
      conquered,
      fromTerritory: {
        id: fromTerritory.id,
        name: fromTerritory.name,
        armies: fromTerritory.armies,
      },
      toTerritory: {
        id: toTerritory.id,
        name: toTerritory.name,
        armies: toTerritory.armies,
        ownerId: toTerritory.ownerId ?? action.playerId,
      },
      pendingConquestFor: conquered ? action.playerId : null,
    }

    // Store the battle result in game state
    gameState.lastBattleResult = result

    // Check if conquest resulted in game end
    if (conquered) {
      const gameEndCheck = this.checkGameEnd(gameState)
      result.gameEnded = gameEndCheck.gameEnded
      result.winner = gameEndCheck.winner
      result.eliminatedPlayers = gameEndCheck.eliminatedPlayers

      this.transferEliminatedTreasures(
        gameState,
        action.playerId,
        treasureConfig,
        gameEndCheck.eliminatedPlayers ?? [],
      )

      this.updateCurrentPlayerCashRequirement(gameState, treasureConfig)
    }

    return result
  }

  transferConquestArmies(
    gameState: GameState,
    playerId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
  ): GameState {
    if (gameState.phase !== 'attack') {
      throw new Error('Can only transfer armies immediately after an attack')
    }

    const lastBattle = gameState.lastBattleResult
    if (!lastBattle || !lastBattle.conquered) {
      throw new Error('No conquest available for transfer')
    }

    if (lastBattle.pendingConquestFor === null) {
      throw new Error('Conquest transfer already completed')
    }

    if (lastBattle.pendingConquestFor && lastBattle.pendingConquestFor !== playerId) {
      throw new Error('Only the conquering player can transfer armies')
    }

    const expectedFrom = lastBattle.fromTerritory.id
    const expectedTo = lastBattle.toTerritory.id

    if (expectedFrom !== fromTerritoryId || expectedTo !== toTerritoryId) {
      throw new Error('Transfer must match the most recent conquest')
    }

    const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId)
    const toTerritory = gameState.board.find((t) => t.id === toTerritoryId)

    if (!fromTerritory || !toTerritory) {
      throw new Error('Territory not found for conquest transfer')
    }

    if (fromTerritory.ownerId !== playerId || toTerritory.ownerId !== playerId) {
      throw new Error('You must control both territories to transfer armies')
    }

    if (!fromTerritory.adjacentTerritories.includes(toTerritory.id)) {
      throw new Error('Conquest transfer requires adjacent territories')
    }

    if (!Number.isInteger(armies) || armies < 0 || armies >= fromTerritory.armies) {
      throw new Error('Invalid number of armies to transfer')
    }

    fromTerritory.armies -= armies
    toTerritory.armies += armies

    const resolvedFrom = {
      id: fromTerritory.id,
      name: fromTerritory.name,
      armies: fromTerritory.armies,
    }
    const resolvedTo = {
      id: toTerritory.id,
      name: toTerritory.name,
      armies: toTerritory.armies,
      ownerId: toTerritory.ownerId ?? playerId,
    }

    gameState.lastBattleResult = {
      ...lastBattle,
      fromTerritory: resolvedFrom,
      toTerritory: resolvedTo,
      pendingConquestFor: null,
    }

    return gameState
  }

  private handleFortify(gameState: GameState, action: FortifyAction): GameState {
    const { fromTerritoryId, toTerritoryId, armies } = action.payload

    // Validate the fortify action first
    if (!this.validateFortify(gameState, action)) {
      throw new Error('Invalid fortify action')
    }

    const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId)
    const toTerritory = gameState.board.find((t) => t.id === toTerritoryId)

    if (!fromTerritory || !toTerritory) {
      throw new Error('Fortification territories not found')
    }

    // Perform the fortification
    fromTerritory.armies -= armies
    toTerritory.armies += armies

    // Mark territory as having moved (for multi-move types)
    this.markTerritoryAsMoved(gameState, fromTerritoryId)

    // Track fortify history for undo functionality
    if (!gameState.fortifyHistory) {
      gameState.fortifyHistory = []
    }
    gameState.fortifyHistory.push({
      playerId: action.playerId,
      fromTerritoryId,
      toTerritoryId,
      armies,
      ts: Date.now(),
    })

    return gameState
  }

  private handleUndoFortify(
    gameState: GameState,
    action: import('../types/game.js').UndoFortifyAction,
  ): GameState {
    if (!this.validateUndoFortify(gameState, action)) {
      throw new Error('Invalid undo fortify action')
    }

    const history = gameState.fortifyHistory ?? []
    if (history.length === 0) {
      throw new Error('No fortify moves to undo')
    }

    // Get the last fortify move
    const lastMove = history[history.length - 1]

    // Find the territories
    const fromTerritory = gameState.board.find((t) => t.id === lastMove.fromTerritoryId)
    const toTerritory = gameState.board.find((t) => t.id === lastMove.toTerritoryId)

    if (!fromTerritory || !toTerritory) {
      throw new Error('Territories not found for undo')
    }

    // Reverse the fortification
    fromTerritory.armies += lastMove.armies
    toTerritory.armies -= lastMove.armies

    // Remove from movement tracking so the territory can move again
    if (gameState.movementTracking?.[lastMove.fromTerritoryId]) {
      delete gameState.movementTracking[lastMove.fromTerritoryId]
    }

    // Remove the last entry from history
    gameState.fortifyHistory = history.slice(0, -1)

    return gameState
  }

  private handleTradeCards(gameState: GameState, action: TradeCardsAction): GameState {
    const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig)
    if (!treasureConfig.enabled) {
      return gameState
    }

    const player = gameState.players.find((p) => p.id === action.playerId)
    if (!player) {
      return gameState
    }

    const previousPhase = gameState.phase
    const selection = action.payload?.treasureSet
    if (!Array.isArray(selection) || selection.length !== 3) {
      throw new Error('Treasure set selection is required')
    }

    const indices = selection.map((value) => Number(value)) as number[]
    if (indices.some((value) => Number.isNaN(value))) {
      throw new Error('Treasure indices must be numeric')
    }

    const tuple = [indices[0], indices[1], indices[2]] as [number, number, number]
    const treasureState = ensureTreasureState(gameState.treasureState)
    const result = redeemSet(
      this.getPlayerTreasureHand(player),
      tuple,
      treasureConfig,
      treasureState,
    )

    player.treasures = result.updatedHand
    player.armies += result.troops
    const remainingMatches = findRedeemableSets(result.updatedHand)
    player.mustCashInTreasures =
      result.updatedHand.length >= treasureConfig.handCap && remainingMatches.length > 0
    gameState.treasureState = result.updatedState

    if (result.troops > 0 && previousPhase !== 'reinforcement') {
      gameState.resumePhaseAfterReinforcement = previousPhase
      gameState.resumeHasAttackedAfterReinforcement = gameState.hasAttackedThisTurn ?? false
      gameState.phase = 'reinforcement'
      this.refreshReinforcementTracking(gameState)
    } else if (previousPhase === 'reinforcement') {
      gameState.resumePhaseAfterReinforcement = null
      gameState.resumeHasAttackedAfterReinforcement = undefined
    }

    treasureMetrics.recordCash(treasureConfig, result.hasDiamond)
    this.updateCurrentPlayerCashRequirement(gameState, treasureConfig)

    return gameState
  }

  private handleEndTurn(gameState: GameState): GameState {
    // Advance phase or move to next player
    switch (gameState.phase) {
      case 'reinforcement':
        // After reinforcement, move to attack phase
        gameState.phase = 'attack'
        gameState.hasAttackedThisTurn = false // Reset attack flag
        // Clear reinforcement tracking when leaving reinforcement
        gameState.reinforcementHistory = []
        gameState.reinforcementBaseline = undefined
        gameState.resumePhaseAfterReinforcement = null
        gameState.resumeHasAttackedAfterReinforcement = undefined
        break
      case 'attack':
        // After attack, move to fortify phase
        gameState.phase = 'fortify'
        this.resetMovementTracking(gameState) // Reset movement tracking for fortify phase
        gameState.fortifyHistory = [] // Clear fortify history when entering fortify phase
        break
      case 'fortify':
        // After fortify, move to next player
        this.endPlayerTurn(gameState)
        // Fortify history will be cleared when the next player enters fortify phase
        break
    }

    return gameState
  }

  private endPlayerTurn(gameState: GameState): void {
    const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig)
    const currentPlayerIndex = gameState.players.findIndex((p) => p.id === gameState.currentPlayer)
    const currentPlayer = gameState.players[currentPlayerIndex]

    if (currentPlayer) {
      this.getPlayerTreasureHand(currentPlayer)
      this.maybeAwardTreasureForConquest(gameState, currentPlayer, treasureConfig)
    }

    gameState.conqueredDuringTurn = false

    // Check for eliminated players first
    this.updateEliminatedPlayers(gameState)

    // Check if game is over (only one player left)
    const activePlayers = gameState.players.filter((p) => !p.isEliminated)
    if (activePlayers.length <= 1) {
      this.endGame(gameState, activePlayers[0] || null)
      return
    }

    let nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length

    // Skip eliminated players
    while (gameState.players[nextPlayerIndex].isEliminated) {
      nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length
    }

    // Move to next player
    gameState.currentPlayer = gameState.players[nextPlayerIndex].id
    gameState.hasAttackedThisTurn = false // Reset attack flag for new player
    gameState.lastBattleResult = undefined // Clear last battle result

    // Increment turn counter when we complete a full round (back to first active player)
    const firstActivePlayerIndex = gameState.players.findIndex((p) => !p.isEliminated)
    if (nextPlayerIndex === firstActivePlayerIndex) {
      this.handleKingOfTheHillRoundComplete(gameState)
      if (gameState.phase === 'finished') {
        return
      }
      gameState.turn += 1
    }

    // Begin next player's reinforcement phase
    gameState.phase = 'reinforcement'
    this.prepareReinforcementPhase(gameState, treasureConfig)
  }

  private refreshReinforcementTracking(gameState: GameState): void {
    try {
      const baseline: Record<string, number> = {}
      for (const territory of gameState.board) {
        if (territory.ownerId === gameState.currentPlayer) {
          baseline[territory.id] = Math.max(0, Math.trunc(territory.armies))
        }
      }
      gameState.reinforcementBaseline = baseline
    } catch {
      gameState.reinforcementBaseline = {}
    }

    gameState.reinforcementHistory = []
  }

  private prepareReinforcementPhase(
    gameState: GameState,
    providedTreasureConfig?: TreasureConfig,
  ): void {
    const treasureConfig = providedTreasureConfig ?? this.ensureTreasureConfig(gameState.gameConfig)
    const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer)

    if (currentPlayer) {
      currentPlayer.armies = this.calculateReinforcementArmies(
        currentPlayer.territories,
        gameState.board,
        gameState.gameConfig,
      )
    }

    this.refreshReinforcementTracking(gameState)
    gameState.resumePhaseAfterReinforcement = null
    gameState.resumeHasAttackedAfterReinforcement = undefined

    if (treasureConfig.enabled) {
      gameState.treasureState = ensureTreasureState(gameState.treasureState)
      if (currentPlayer) {
        this.getPlayerTreasureHand(currentPlayer)
      }
    } else {
      gameState.treasureState = undefined
    }

    this.updateCurrentPlayerCashRequirement(gameState, treasureConfig)
    gameState.conqueredDuringTurn = false
  }

  // Get valid fortify targets for a given source territory
  getValidFortifyTargets(
    gameState: GameState,
    fromTerritoryId: string,
    playerId: string,
  ): string[] {
    const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId)
    if (!fromTerritory || fromTerritory.ownerId !== playerId || fromTerritory.armies <= 1) {
      return []
    }

    const _movementType = gameState.gameConfig.movementType
    const validTargets: string[] = []

    // Check each territory as a potential target
    for (const territory of gameState.board) {
      if (!this.canMoveTo(territory, playerId, gameState)) continue
      if (territory.id === fromTerritoryId) continue // Can't move to self

      if (this.validateMovementByType(gameState, fromTerritoryId, territory.id, playerId)) {
        validTargets.push(territory.id)
      }
    }

    return validTargets
  }

  calculateBaseReinforcementArmies(gameState: GameState, playerId: string): number {
    const player = gameState.players.find((p) => p.id === playerId)
    if (!player) {
      return 0
    }

    return this.calculateReinforcementArmies(
      player.territories,
      gameState.board,
      gameState.gameConfig,
    )
  }

  advancePhase(gameState: GameState): GameState {
    return this.handleEndTurn(gameState)
  }

  private handleGoBackToReinforcement(gameState: GameState): GameState {
    // Can only go back if in attack phase and haven't attacked yet
    if (gameState.phase === 'attack' && !gameState.hasAttackedThisTurn) {
      gameState.phase = 'reinforcement'

      // Recalculate reinforcement armies for current player and account for prior placements
      const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer)
      if (currentPlayer) {
        const baseReinforcements = this.calculateReinforcementArmies(
          currentPlayer.territories,
          gameState.board,
          gameState.gameConfig,
        )
        const history = (gameState.reinforcementHistory ?? []).filter(
          (entry) => entry.playerId === currentPlayer.id,
        )
        const netPlacements = history.reduce((sum, entry) => sum + entry.armies, 0)
        const remaining = Math.max(0, baseReinforcements - netPlacements)
        currentPlayer.armies = remaining
      }
    }

    return gameState
  }

  private validateDeploy(gameState: GameState, action: DeployAction): boolean {
    const { territoryId, armies } = action.payload
    const player = gameState.players.find((p) => p.id === action.playerId)
    const territory = gameState.board.find((t) => t.id === territoryId)

    if (!player || !territory || gameState.phase !== 'reinforcement') return false

    if (armies > 0 && gameState.mustCashInTreasures) {
      return false
    }

    if (armies > 0) {
      // Prevent deploying more armies than player has available
      if (player.armies < armies) return false
      return this.isFriendlyTerritory(gameState, action.playerId, territory.ownerId)
    }

    if (armies < 0) {
      const baseline = gameState.reinforcementBaseline?.[territoryId]
      if (typeof baseline !== 'number') return false
      const available = Math.max(0, territory.armies - baseline)
      const requested = Math.abs(armies)
      if (requested <= 0) return false
      if (available <= 0) return false
      return this.isFriendlyTerritory(gameState, action.playerId, territory.ownerId)
    }

    return false
  }

  private isFriendlyTerritory(
    gameState: GameState,
    playerId: string,
    ownerId?: string | null,
  ): boolean {
    if (!ownerId) {
      return false
    }

    if (ownerId === playerId) {
      return true
    }

    if (ownerId === 'neutral') {
      return false
    }

    return this.arePlayersTeammates(gameState, playerId, ownerId)
  }

  private validateAttack(gameState: GameState, action: AttackAction): boolean {
    if (gameState.mustCashInTreasures) {
      return false
    }

    const { fromTerritoryId, toTerritoryId, armies = 0 } = action.payload
    const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId)
    const toTerritory = gameState.board.find((t) => t.id === toTerritoryId)

    // Must be in attack phase
    if (gameState.phase !== 'attack') {
      return false
    }

    if (toTerritory && this.arePlayersTeammates(gameState, action.playerId, toTerritory.ownerId)) {
      return false
    }

    // Require at least 2 armies to attack (must leave 1 behind)
    const hasEnoughArmies = fromTerritory ? fromTerritory.armies >= 2 : false

    // If client supplied an armies number (legacy), ensure it does not exceed from - 1 and is positive
    const armiesOk =
      typeof armies === 'number' && armies > 0
        ? fromTerritory
          ? armies <= Math.max(0, fromTerritory.armies - 1)
          : false
        : true // when not provided, engine will determine dice, so skip this check

    return !!(
      fromTerritory &&
      toTerritory &&
      gameState.currentPlayer === action.playerId &&
      gameState.phase === 'attack' &&
      fromTerritory.ownerId === action.playerId &&
      toTerritory.ownerId !== action.playerId &&
      hasEnoughArmies &&
      armiesOk &&
      fromTerritory.adjacentTerritories.includes(toTerritoryId)
    )
  }

  private validateFortify(gameState: GameState, action: FortifyAction): boolean {
    const { fromTerritoryId, toTerritoryId, armies } = action.payload
    const fromTerritory = gameState.board.find((t) => t.id === fromTerritoryId)
    const toTerritory = gameState.board.find((t) => t.id === toTerritoryId)

    if (!fromTerritory || !toTerritory) return false
    if (fromTerritory.ownerId !== action.playerId) return false
    if (!this.canMoveTo(toTerritory, action.playerId, gameState)) return false
    if (fromTerritory.armies <= armies) return false // Must leave at least 1 army
    if (armies <= 0) return false
    // Prevent integer overflow: max 1 million armies per fortify
    if (armies > 1_000_000) return false
    if (gameState.phase !== 'fortify') return false

    // Check movement type restrictions
    return this.validateMovementByType(gameState, fromTerritoryId, toTerritoryId, action.playerId)
  }

  private validateUndoFortify(
    gameState: GameState,
    action: import('../types/game.js').UndoFortifyAction,
  ): boolean {
    // Must be in fortify phase
    if (gameState.phase !== 'fortify') return false

    // Must be the current player
    if (action.playerId !== gameState.currentPlayer) return false

    // Must have fortify history to undo
    const history = gameState.fortifyHistory ?? []
    if (history.length === 0) return false

    // The last move must belong to the current player
    const lastMove = history[history.length - 1]
    if (lastMove.playerId !== action.playerId) return false

    return true
  }

  private validateTreasureTrade(gameState: GameState, action: TradeCardsAction): boolean {
    const allowedPhases: GameState['phase'][] = ['reinforcement', 'attack', 'fortify']
    if (!allowedPhases.includes(gameState.phase)) {
      return false
    }

    const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig)
    if (!treasureConfig.enabled) {
      return false
    }

    const player = gameState.players.find((p) => p.id === action.playerId)
    if (!player) {
      return false
    }

    const selection = action.payload?.treasureSet
    if (!Array.isArray(selection) || selection.length !== 3) {
      return false
    }

    const hand = this.getPlayerTreasureHand(player)
    const indices = selection.map((value) => Number(value)) as number[]
    if (indices.some((value) => Number.isNaN(value))) {
      return false
    }

    const sorted = [...indices].sort((a, b) => a - b)
    if (sorted.some((index) => index < 0 || index >= hand.length)) {
      return false
    }

    const matches = findRedeemableSets(hand)
    return matches.some((match) => match.indices.every((value, idx) => value === sorted[idx]))
  }

  private simulateBattle(
    gameState: GameState,
    attackerDiceCount: number,
    defenderDiceCount: number,
    attackBonus: number = 0,
    defenseBonus: number = 0,
  ): {
    attackerDice: number[]
    defenderDice: number[]
    attackerLosses: number
    defenderLosses: number
  } {
    // Roll dice for attacker and defender
    let attackerDice = this.rollDice(gameState, attackerDiceCount).sort((a, b) => b - a)
    let defenderDice = this.rollDice(gameState, defenderDiceCount).sort((a, b) => b - a)

    // Apply territory modifiers to dice rolls
    // Bonuses are applied to all dice, capped between 1 and 6
    if (attackBonus !== 0) {
      attackerDice = attackerDice.map((die) => Math.max(1, Math.min(6, die + attackBonus)))
      attackerDice.sort((a, b) => b - a)
    }
    if (defenseBonus !== 0) {
      defenderDice = defenderDice.map((die) => Math.max(1, Math.min(6, die + defenseBonus)))
      defenderDice.sort((a, b) => b - a)
    }

    let attackerLosses = 0
    let defenderLosses = 0

    // Compare highest dice first
    if (attackerDice[0] > defenderDice[0]) {
      defenderLosses++
    } else {
      attackerLosses++
    }

    // Compare second highest dice if both sides have multiple dice
    if (attackerDice.length > 1 && defenderDice.length > 1) {
      if (attackerDice[1] > defenderDice[1]) {
        defenderLosses++
      } else {
        attackerLosses++
      }
    }

    return {
      attackerDice,
      defenderDice,
      attackerLosses,
      defenderLosses,
    }
  }

  private rollDice(gameState: GameState, count: number): number[] {
    const dice: number[] = []
    for (let i = 0; i < count; i++) {
      const r = this.nextRandom(gameState)
      dice.push(Math.floor(r * 6) + 1)
    }
    return dice
  }

  private getPlayerTeam(gameState: GameState, playerId?: string | null): number | null {
    return utilGetPlayerTeam(gameState, playerId)
  }

  private arePlayersTeammates(
    gameState: GameState,
    playerA: string,
    playerB?: string | null,
  ): boolean {
    return utilArePlayersTeammates(gameState, playerA, playerB)
  }

  // Check if a territory can be moved to (owned by player or teammate)
  private canMoveTo(territory: Territory, playerId: string, gameState: GameState): boolean {
    if (territory.ownerId === playerId) return true

    // If team play is enabled, check if territory belongs to a teammate
    if (gameState.gameConfig.allowTeamPlay) {
      if (this.arePlayersTeammates(gameState, playerId, territory.ownerId)) {
        return true
      }
    }

    return false
  }

  // Validate movement based on the configured movement type
  private validateMovementByType(
    gameState: GameState,
    fromId: string,
    toId: string,
    playerId: string,
  ): boolean {
    const movementType = gameState.gameConfig.movementType

    switch (movementType) {
      case 'classic_adjacent':
        return this.validateClassicAdjacent(gameState, fromId, toId, playerId)

      case 'adjacent_multi':
        return this.validateAdjacentMulti(gameState, fromId, toId, playerId)

      case 'path_single':
        return this.validatePathSingle(gameState, fromId, toId, playerId)

      case 'path_multi':
        return this.validatePathMulti(gameState, fromId, toId, playerId)

      default:
        return false
    }
  }

  // Classic Adjacent: One territory can move armies to one adjacent territory only
  private validateClassicAdjacent(
    gameState: GameState,
    fromId: string,
    toId: string,
    _playerId: string,
  ): boolean {
    const fromTerritory = gameState.board.find((t) => t.id === fromId)
    if (!fromTerritory) return false

    // Check if territories are adjacent
    const isAdjacent = fromTerritory.adjacentTerritories.includes(toId)
    if (!isAdjacent) return false

    // In classic mode, only one move per fortify phase is allowed
    // Check if any territory has already moved this phase
    const hasAnyMovement = Object.keys(gameState.movementTracking || {}).length > 0

    return !hasAnyMovement
  }

  // Adjacent Multi: Multiple territories can move, but only to adjacent territories
  private validateAdjacentMulti(
    gameState: GameState,
    fromId: string,
    toId: string,
    _playerId: string,
  ): boolean {
    const fromTerritory = gameState.board.find((t) => t.id === fromId)
    if (!fromTerritory) return false

    // Check if territories are adjacent
    const isAdjacent = fromTerritory.adjacentTerritories.includes(toId)
    if (!isAdjacent) return false

    // Check if this territory has already moved this phase
    const hasAlreadyMoved = gameState.movementTracking?.[fromId] || false

    return !hasAlreadyMoved
  }

  // Path Single: One territory can move to any connected territory, only one move per phase
  private validatePathSingle(
    gameState: GameState,
    fromId: string,
    toId: string,
    playerId: string,
  ): boolean {
    // Check if any territory has already moved this phase
    const hasAnyMovement = Object.keys(gameState.movementTracking || {}).length > 0
    if (hasAnyMovement) return false

    // Check if territories are connected through owned territories
    return this.areTerritoriesConnectedWithTeammates(fromId, toId, playerId, gameState)
  }

  // Path Multi: Multiple territories can move to any connected territories
  private validatePathMulti(
    gameState: GameState,
    fromId: string,
    toId: string,
    playerId: string,
  ): boolean {
    // Check if this territory has already moved this phase
    const hasAlreadyMoved = gameState.movementTracking?.[fromId] || false
    if (hasAlreadyMoved) return false

    // Check if territories are connected through owned territories
    return this.areTerritoriesConnectedWithTeammates(fromId, toId, playerId, gameState)
  }

  // Enhanced path finding that includes teammate territories
  private areTerritoriesConnectedWithTeammates(
    fromId: string,
    toId: string,
    playerId: string,
    gameState: GameState,
  ): boolean {
    if (fromId === toId) return true

    // Get all territories that can be used for pathfinding (owned + teammates)
    const allowedTerritories = gameState.board.filter((t) =>
      this.canUseForPathfinding(t, playerId, gameState),
    )
    const allowedTerritoryMap = new Map(
      allowedTerritories.map((territory) => [territory.id, territory]),
    )
    const visited = new Set<string>()
    const queue: string[] = [fromId]
    let queueIndex = 0

    while (queueIndex < queue.length) {
      const currentId = queue[queueIndex++]
      if (!currentId) {
        continue
      }

      if (currentId === toId) {
        return true
      }

      if (visited.has(currentId)) {
        continue
      }

      visited.add(currentId)

      const currentTerritory = allowedTerritoryMap.get(currentId)
      if (!currentTerritory) continue

      // Add adjacent territories that can be used for pathfinding
      for (const adjacentId of currentTerritory.adjacentTerritories) {
        if (!visited.has(adjacentId) && allowedTerritoryMap.has(adjacentId)) {
          queue.push(adjacentId)
        }
      }
    }

    return false
  }

  // Check if a territory can be used for pathfinding (owned by player or teammate)
  private canUseForPathfinding(
    territory: Territory,
    playerId: string,
    gameState: GameState,
  ): boolean {
    if (territory.ownerId === playerId) return true

    // If team play is enabled, include teammate territories in pathfinding
    if (gameState.gameConfig.allowTeamPlay) {
      if (this.arePlayersTeammates(gameState, playerId, territory.ownerId)) {
        return true
      }
    }

    return false
  }

  // Reset movement tracking at the start of fortify phase
  private resetMovementTracking(gameState: GameState): void {
    gameState.movementTracking = {}
  }

  // Mark a territory as having moved this phase
  private markTerritoryAsMoved(gameState: GameState, territoryId: string): void {
    if (!gameState.movementTracking) {
      gameState.movementTracking = {}
    }
    gameState.movementTracking[territoryId] = true
  }

  // Check and update eliminated players
  private updateEliminatedPlayers(gameState: GameState): string[] {
    const newlyEliminated: string[] = []

    for (const player of gameState.players) {
      if (!player.isEliminated) {
        const playerTerritories = gameState.board.filter((t) => t.ownerId === player.id)

        if (playerTerritories.length === 0) {
          player.isEliminated = true
          newlyEliminated.push(player.id)
        }
      }
    }

    return newlyEliminated
  }

  // End the game and declare winner
  private endGame(gameState: GameState, winner: GamePlayer | null): void {
    gameState.phase = 'finished'

    if (winner) {
      gameState.currentPlayer = winner.id
    }
  }

  private resolveAssassinationVictory(
    gameState: GameState,
    eliminatedPlayers: string[],
  ): GamePlayer | null {
    if (!gameState.assassinationTargets || eliminatedPlayers.length === 0) {
      return null
    }

    for (const eliminatedId of eliminatedPlayers) {
      for (const [hunterId, targetId] of Object.entries(gameState.assassinationTargets)) {
        if (targetId !== eliminatedId) {
          continue
        }

        const hunter = gameState.players.find((player) => player.id === hunterId)
        if (hunter && !hunter.isEliminated) {
          return hunter
        }
      }
    }

    return null
  }

  // Check if game should end after territory conquest
  checkGameEnd(gameState: GameState): {
    gameEnded: boolean
    winner: GamePlayer | null
    eliminatedPlayers: string[]
  } {
    const eliminatedPlayers = this.updateEliminatedPlayers(gameState)

    if (gameState.gameConfig.gameMode === 'assassination') {
      const winner = this.resolveAssassinationVictory(gameState, eliminatedPlayers)
      if (winner) {
        this.endGame(gameState, winner)
        return {
          gameEnded: true,
          winner,
          eliminatedPlayers,
        }
      }
    }

    const activePlayers = gameState.players.filter((p) => !p.isEliminated)

    if (activePlayers.length <= 1) {
      this.endGame(gameState, activePlayers[0] || null)
      return {
        gameEnded: true,
        winner: activePlayers[0] || null,
        eliminatedPlayers,
      }
    }

    if (gameState.gameConfig.allowTeamPlay) {
      const distinctTeams = new Set<string>()
      for (const player of activePlayers) {
        const teamId = this.getPlayerTeam(gameState, player.id)
        if (teamId) {
          distinctTeams.add(`team-${teamId}`)
        } else {
          distinctTeams.add(`player-${player.id}`)
        }
      }

      if (distinctTeams.size === 1) {
        const winner = activePlayers[0] || null
        this.endGame(gameState, winner)
        return {
          gameEnded: true,
          winner,
          eliminatedPlayers,
        }
      }
    }

    return {
      gameEnded: false,
      winner: null,
      eliminatedPlayers,
    }
  }
}
