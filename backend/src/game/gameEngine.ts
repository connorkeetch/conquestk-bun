import { treasureMetrics } from '../services/metricsService'
import territoryModifierService, {
  type GameTerritoryModifier,
} from '../services/territoryModifierService'
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
  Metal,
  ProcessActionResult,
  Territory,
  TradeCardsAction,
  TreasureConfig,
} from '../types/game'
import {
  drawTreasure,
  ensureTreasureState,
  findRedeemableSets,
  normalizeTreasureConfig,
  redeemSet,
} from './hiddenTreasures'

export class GameEngine {
  // Cache modifiers per room to prevent memory leaks
  private gameModifiersCache: Map<string, Map<string, GameTerritoryModifier>> = new Map()

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

    const treasureConfig = this.ensureTreasureConfig(hydratedConfig)
    treasureMetrics.recordMode(treasureConfig)

    return {
      roomId,
      players,
      currentPlayer: players[0].id,
      phase: 'setup', // Start in setup phase for initial deployment
      turn: 1,
      board: territories,
      cards: [],
      gameConfig: hydratedConfig,
      movementTracking: {},
      treasureState: treasureConfig.enabled ? ensureTreasureState() : undefined,
      mustCashInTreasures: false,
      conqueredDuringTurn: false,
    }
  }

  async processAction(gameState: GameState, action: GameAction): Promise<ProcessActionResult> {
    const newState = { ...gameState }

    switch (action.type) {
      case 'begin_turn':
        return { gameState: this.beginTurn(newState) }
      case 'deploy':
        return { gameState: this.handleDeploy(newState, action) }
      case 'attack': {
        const battleResult = await this.handleAttack(newState, action)
        return { gameState: newState, battleResult }
      }
      case 'fortify':
        return { gameState: this.handleFortify(newState, action) }
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
      case 'begin_turn':
        return gameState.phase === 'setup'
      case 'deploy':
        return this.validateDeploy(gameState, action)
      case 'attack':
        return this.validateAttack(gameState, action)
      case 'fortify':
        return this.validateFortify(gameState, action)
      case 'end_turn':
        return true
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
    }>,
  ): GamePlayer[] {
    const colors = [
      'red',
      'blue',
      'green',
      'yellow',
      'purple',
      'orange',
      'cyan',
      'pink',
      'brown',
      'lime',
      'teal',
      'indigo',
    ]

    return playerConfigs.map((player, index) => ({
      id: player.userId,
      username: player.username || `Player ${index + 1}`,
      color: colors[index % colors.length],
      armies: this.calculateInitialArmies(playerConfigs.length),
      territories: [],
      cards: [],
      isEliminated: false,
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
    currentPlayer.mustCashInTreasures = hand.length >= treasureConfig.handCap
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
      player.mustCashInTreasures = true
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
      eliminator.mustCashInTreasures = true
      if (eliminator.id === gameState.currentPlayer) {
        gameState.mustCashInTreasures = true
      }
    }
  }

  private randomizePlayerOrder(players: GamePlayer[]): void {
    // Fisher-Yates shuffle
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[players[i], players[j]] = [players[j], players[i]]
    }
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
      territory.armies += armies
      const player = gameState.players.find((p) => p.id === action.playerId)
      if (player) {
        player.armies -= armies
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

    // Determine number of dice
    const attackerDiceCount = Math.min(3, fromTerritory.armies - 1)
    const defenderDiceCount = Math.min(2, toTerritory.armies)

    const battleResult = this.simulateBattle(attackerDiceCount, defenderDiceCount)

    // Apply losses
    fromTerritory.armies -= battleResult.attackerLosses
    toTerritory.armies -= battleResult.defenderLosses

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
    player.mustCashInTreasures = player.treasures.length >= treasureConfig.handCap
    gameState.treasureState = result.updatedState

    treasureMetrics.recordCash(treasureConfig, result.hasDiamond)
    this.updateCurrentPlayerCashRequirement(gameState, treasureConfig)

    return gameState
  }

  private handleEndTurn(gameState: GameState): GameState {
    // Advance phase or move to next player
    switch (gameState.phase) {
      case 'setup':
        // After setup, first player begins their turn
        gameState.phase = 'reinforcement'
        break
      case 'reinforcement':
        // After reinforcement, move to attack phase
        gameState.phase = 'attack'
        gameState.hasAttackedThisTurn = false // Reset attack flag
        break
      case 'attack':
        // After attack, move to fortify phase
        gameState.phase = 'fortify'
        this.resetMovementTracking(gameState) // Reset movement tracking for fortify phase
        break
      case 'fortify':
        // After fortify, move to next player
        this.endPlayerTurn(gameState)
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
    gameState.phase = 'reinforcement'
    gameState.hasAttackedThisTurn = false // Reset attack flag for new player
    gameState.lastBattleResult = undefined // Clear last battle result

    // Calculate reinforcement armies for new player
    const nextPlayer = gameState.players[nextPlayerIndex]
    nextPlayer.armies = this.calculateReinforcementArmies(
      nextPlayer.territories,
      gameState.board,
      gameState.gameConfig,
    )

    this.updateCurrentPlayerCashRequirement(gameState, treasureConfig)

    // Increment turn counter when we complete a full round (back to first active player)
    const firstActivePlayerIndex = gameState.players.findIndex((p) => !p.isEliminated)
    if (nextPlayerIndex === firstActivePlayerIndex) {
      gameState.turn += 1
    }
  }

  beginTurn(gameState: GameState): GameState {
    const treasureConfig = this.ensureTreasureConfig(gameState.gameConfig)

    // Player hits "Begin Turn" button
    if (gameState.phase === 'setup') {
      // Transition from setup to reinforcement phase
      gameState.phase = 'reinforcement'

      // Calculate starting reinforcement armies for current player
      const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer)
      if (currentPlayer) {
        currentPlayer.armies = this.calculateReinforcementArmies(
          currentPlayer.territories,
          gameState.board,
          gameState.gameConfig,
        )
      }
    }

    if (treasureConfig.enabled) {
      gameState.treasureState = ensureTreasureState(gameState.treasureState)
      const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer)
      if (currentPlayer) {
        this.getPlayerTreasureHand(currentPlayer)
      }
    } else {
      gameState.treasureState = undefined
    }

    this.updateCurrentPlayerCashRequirement(gameState, treasureConfig)
    gameState.conqueredDuringTurn = false

    return gameState
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

      // Recalculate reinforcement armies for current player
      const currentPlayer = gameState.players.find((p) => p.id === gameState.currentPlayer)
      if (currentPlayer) {
        currentPlayer.armies = this.calculateReinforcementArmies(
          currentPlayer.territories,
          gameState.board,
          gameState.gameConfig,
        )
      }
    }

    return gameState
  }

  private validateDeploy(gameState: GameState, action: DeployAction): boolean {
    const { territoryId, armies } = action.payload
    const player = gameState.players.find((p) => p.id === action.playerId)
    const territory = gameState.board.find((t) => t.id === territoryId)

    if (!player || !territory || armies <= 0 || gameState.phase !== 'reinforcement') {
      return false
    }

    // Prevent deploying more armies than player has available
    if (player.armies < armies) {
      return false
    }

    return this.isFriendlyTerritory(gameState, action.playerId, territory.ownerId)
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

    if (toTerritory && this.arePlayersTeammates(gameState, action.playerId, toTerritory.ownerId)) {
      return false
    }

    return !!(
      fromTerritory &&
      toTerritory &&
      fromTerritory.ownerId === action.playerId &&
      toTerritory.ownerId !== action.playerId &&
      fromTerritory.armies > armies &&
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
    let attackerDice = this.rollDice(attackerDiceCount).sort((a, b) => b - a)
    let defenderDice = this.rollDice(defenderDiceCount).sort((a, b) => b - a)

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

  private rollDice(count: number): number[] {
    const dice: number[] = []
    for (let i = 0; i < count; i++) {
      dice.push(Math.floor(Math.random() * 6) + 1)
    }
    return dice
  }

  private getPlayerTeam(gameState: GameState, playerId?: string | null): number | null {
    if (!playerId) {
      return null
    }

    const player = gameState.players.find((p) => p.id === playerId)
    if (!player) {
      return null
    }

    const { teamId } = player
    return typeof teamId === 'number' && teamId > 0 ? teamId : null
  }

  private arePlayersTeammates(
    gameState: GameState,
    playerA: string,
    playerB?: string | null,
  ): boolean {
    if (!gameState.gameConfig.allowTeamPlay) {
      return false
    }

    if (!playerB || playerB === 'neutral') {
      return false
    }

    const teamA = this.getPlayerTeam(gameState, playerA)
    const teamB = this.getPlayerTeam(gameState, playerB)

    if (!teamA || !teamB) {
      return false
    }

    return teamA === teamB
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
    const visited = new Set<string>()
    const queue = [fromId]

    while (queue.length > 0) {
      const currentId = queue.shift()
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

      const currentTerritory = allowedTerritories.find((t) => t.id === currentId)
      if (!currentTerritory) continue

      // Add adjacent territories that can be used for pathfinding
      for (const adjacentId of currentTerritory.adjacentTerritories) {
        if (!visited.has(adjacentId)) {
          const adjacentTerritory = allowedTerritories.find((t) => t.id === adjacentId)
          if (adjacentTerritory) {
            queue.push(adjacentId)
          }
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

  // Check if game should end after territory conquest
  checkGameEnd(gameState: GameState): {
    gameEnded: boolean
    winner: GamePlayer | null
    eliminatedPlayers: string[]
  } {
    const eliminatedPlayers = this.updateEliminatedPlayers(gameState)
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
