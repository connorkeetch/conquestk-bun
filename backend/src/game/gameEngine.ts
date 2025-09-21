import territoryModifierService, {
  type GameTerritoryModifier,
} from '../services/territoryModifierService'
import type {
  AttackAction,
  BattleResult,
  DeployAction,
  FortifyAction,
  GameAction,
  GameConfiguration,
  GamePlayer,
  GameState,
  ProcessActionResult,
  Territory,
} from '../types/game'
import { WorldMap } from './worldMap'

export class GameEngine {
  private worldMap = new WorldMap()
  private gameModifiers: Map<string, GameTerritoryModifier> = new Map()

  initializeGame(
    roomId: string,
    playerConfigs: Array<{ userId: string; username?: string; teamId?: number | null }>,
    gameConfig: GameConfiguration,
  ): GameState {
    const territories = this.worldMap.getTerritories()
    const players = this.createPlayers(playerConfigs)

    // Randomize player order
    this.randomizePlayerOrder(players)

    // Distribute territories fairly with neutrals
    this.distributeTerritoriesWithNeutrals(territories, players)

    // Each player starts with 3 armies per territory
    this.deployInitialArmies(territories, players, gameConfig)

    const hydratedConfig: GameConfiguration = {
      ...gameConfig,
      continentBonuses:
        gameConfig.continentBonuses && gameConfig.continentBonuses.length > 0
          ? gameConfig.continentBonuses
          : this.worldMap.getContinentBonuses(),
    }

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
      case 'go_back_to_reinforcement':
        return gameState.phase === 'attack' && !gameState.hasAttackedThisTurn
      default:
        return false
    }
  }

  private createPlayers(
    playerConfigs: Array<{ userId: string; username?: string; teamId?: number | null }>,
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

    // Add continent bonuses
    armies += this.calculateContinentBonuses(playerTerritories, allTerritories, gameConfig)

    return armies
  }

  private calculateContinentBonuses(
    playerTerritories: string[],
    allTerritories: Territory[],
    gameConfig?: GameConfiguration,
  ): number {
    let bonusArmies = 0

    // Use continent bonuses from game config if available
    if (gameConfig?.continentBonuses) {
      // Dynamic continent bonuses from database (custom maps)
      for (const continent of gameConfig.continentBonuses) {
        const playerOwnsAll = continent.territories.every((territoryId) =>
          playerTerritories.includes(territoryId),
        )

        if (playerOwnsAll) {
          bonusArmies += continent.bonusArmies
        }
      }
    } else {
      // Fallback to classic Risk continent bonuses
      const classicContinentBonuses: { [continent: string]: number } = {
        'north-america': 5,
        'south-america': 2,
        europe: 5,
        asia: 7,
        africa: 3,
        australia: 2,
      }

      const continents: { [continent: string]: string[] } = {}

      // Group territories by continent
      for (const territory of allTerritories) {
        if (!continents[territory.continent]) {
          continents[territory.continent] = []
        }
        continents[territory.continent].push(territory.id)
      }

      // Check each continent for complete control
      for (const [continent, territories] of Object.entries(continents)) {
        const playerOwnsAll = territories.every((territoryId) =>
          playerTerritories.includes(territoryId),
        )

        if (playerOwnsAll && classicContinentBonuses[continent]) {
          bonusArmies += classicContinentBonuses[continent]
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

    // Mark that player has attacked this turn
    gameState.hasAttackedThisTurn = true

    // Get territory modifiers if game uses them
    let _attackBonus = 0
    let _defenseBonus = 0

    if (gameState.gameConfig?.useTerritoryModifiers) {
      // Load modifiers if not cached
      if (this.gameModifiers.size === 0 && gameState.roomId) {
        this.gameModifiers = await territoryModifierService.getGameModifiers(gameState.roomId)
      }

      const attackerModifier = this.gameModifiers.get(fromTerritoryId)
      const defenderModifier = this.gameModifiers.get(toTerritoryId)

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
      }

      toTerritory.ownerId = action.playerId
      toTerritory.armies = 1 // Attacker must move at least 1 army
      fromTerritory.armies -= 1
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

  private handleEndTurn(gameState: GameState): GameState {
    const _currentPlayerIndex = gameState.players.findIndex((p) => p.id === gameState.currentPlayer)

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
    // Check for eliminated players first
    this.updateEliminatedPlayers(gameState)

    // Check if game is over (only one player left)
    const activePlayers = gameState.players.filter((p) => !p.isEliminated)
    if (activePlayers.length <= 1) {
      this.endGame(gameState, activePlayers[0] || null)
      return
    }

    const currentPlayerIndex = gameState.players.findIndex((p) => p.id === gameState.currentPlayer)
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

    // Increment turn counter when we complete a full round (back to first active player)
    const firstActivePlayerIndex = gameState.players.findIndex((p) => !p.isEliminated)
    if (nextPlayerIndex === firstActivePlayerIndex) {
      gameState.turn += 1
    }
  }

  beginTurn(gameState: GameState): GameState {
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
    if (gameState.phase !== 'fortify') return false

    // Check movement type restrictions
    return this.validateMovementByType(gameState, fromTerritoryId, toTerritoryId, action.playerId)
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
