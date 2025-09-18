import { GameEngine } from '../game/gameEngine'
import type { GameAction, GameState } from '../types/game'
import { logger } from '../utils/logger'
import { gameStateCache } from './cacheService'
import { mapService } from './mapService'
import territoryModifierService from './territoryModifierService'

export class GameService {
  private gameEngine = new GameEngine()
  // Removed: private activeGames = new Map<string, GameState>()
  // Now using Redis-backed gameStateCache for persistence and scalability

  // Helper to serialize game state for transmission
  private serializeGameState(gameState: GameState): any {
    const serialized = { ...gameState }

    // Convert Map to object for JSON serialization
    if ((gameState as unknown).territoryModifiers instanceof Map) {
      const modifiersObj: unknown = {}
      ;(gameState as unknown).territoryModifiers.forEach((value: unknown, key: string) => {
        modifiersObj[key] = value
      })
      ;(serialized as unknown).territoryModifiers = modifiersObj
    }

    return serialized
  }

  async isCapitalTerritory(roomId: string, _territoryId: string): Promise<boolean> {
    // This is a placeholder - in a real implementation, you'd check the game state
    // or database to see if this territory is marked as a capital
    const gameState = await gameStateCache.getGameState(roomId)
    if (!gameState) return false

    // Check if the game has capitals enabled and if this territory is a capital
    // This would need proper implementation based on your game state structure
    return false
  }

  async processGameAction(action: GameAction, userId: string): Promise<GameState> {
    const gameState = await gameStateCache.getGameState(action.roomId)

    if (!gameState) {
      throw new Error('Game not found')
    }

    if (!this.isValidAction(action, userId, gameState)) {
      throw new Error('Invalid action')
    }

    const updatedState = this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(action.roomId, updatedState)

    logger.info(`Game action processed for room ${action.roomId}: ${action.type}`)
    return updatedState
  }

  async initializeGame(roomId: string, players: string[], gameConfig?: unknown): Promise<GameState> {
    // Default game configuration
    const defaultGameConfig = {
      movementType: 'classic_adjacent' as const,
      allowTeamPlay: false,
      maxPlayers: 6,
      mapId: 'classic',
      gameMode: 'standard',
    }

    const config = { ...defaultGameConfig, ...gameConfig }

    // Load continent bonuses for custom maps
    if (config.mapId && config.mapId !== 'classic') {
      try {
        const continentBonuses = await mapService.getMapContinentBonuses(config.mapId)
        config.continentBonuses = continentBonuses
      } catch (_error) {
        // Continue with classic behavior if loading fails
      }
    }

    const gameState = this.gameEngine.initializeGame(roomId, players, config)

    // Initialize territory modifiers if enabled
    if (config.useTerritoryModifiers) {
      const territoryIds = gameState.board.map((t) => t.id)
      await territoryModifierService.initializeGameModifiers(
        roomId,
        config.mapId || 'classic',
        config.modifierDistribution || 'balanced',
        territoryIds,
      )

      // Load modifiers into game state
      const modifiers = await territoryModifierService.getGameModifiers(roomId)
      ;(gameState as unknown).territoryModifiers = modifiers
    }

    // Cache the game state with TTL for automatic cleanup (24 hours)
    await gameStateCache.setGameState(roomId, gameState)

    logger.info(`Game initialized for room ${roomId} with ${players.length} players`)
    return gameState
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    const gameState = await gameStateCache.getGameState(roomId)
    if (!gameState) return null

    // Attach territory modifiers if they exist
    if (gameState.gameConfig?.useTerritoryModifiers && !(gameState as unknown).territoryModifiers) {
      const modifiers = await territoryModifierService.getGameModifiers(roomId)
      if (modifiers.size > 0) {
        ;(gameState as unknown).territoryModifiers = modifiers
      }
    }

    return gameState
  }

  async deployArmies(roomId: string, userId: string, territoryId: string, armies: number) {
    const gameState = await gameStateCache.getGameState(roomId)
    if (!gameState) throw new Error('Game not found')
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')
    if (gameState.phase !== 'reinforcement') throw new Error('Not reinforcement phase')

    const action: GameAction = {
      type: 'deploy',
      roomId,
      playerId: userId,
      payload: { territoryId, armies },
    }

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid deployment')
    }

    const updatedState = this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(roomId, updatedState)

    return {
      gameState: this.serializeGameState(updatedState),
      territoryId,
      armies: updatedState.board.find((t: unknown) => t.id === territoryId)?.armies || 0,
    }
  }

  async attack(roomId: string, userId: string, fromTerritoryId: string, toTerritoryId: string) {
    const gameState = await gameStateCache.getGameState(roomId)
    if (!gameState) throw new Error('Game not found')
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')
    if (gameState.phase !== 'attack') throw new Error('Not attack phase')

    const action: GameAction = {
      type: 'attack',
      roomId,
      playerId: userId,
      payload: { fromTerritoryId, toTerritoryId },
    }

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid attack')
    }

    const battleResult = this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(roomId, gameState)

    return {
      ...battleResult,
      gameState: this.serializeGameState(gameState),
    }
  }

  async fortify(
    roomId: string,
    userId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
  ) {
    const gameState = await gameStateCache.getGameState(roomId)
    if (!gameState) throw new Error('Game not found')
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')
    if (gameState.phase !== 'fortify') throw new Error('Not fortify phase')

    const action: GameAction = {
      type: 'fortify',
      roomId,
      playerId: userId,
      payload: { fromTerritoryId, toTerritoryId, armies },
    }

    if (!this.gameEngine.validateAction(gameState, action)) {
      throw new Error('Invalid fortification')
    }

    const updatedState = this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(roomId, updatedState)

    return {
      gameState: this.serializeGameState(updatedState),
      fromTerritoryId,
      toTerritoryId,
      fromArmies: updatedState.board.find((t: unknown) => t.id === fromTerritoryId)?.armies || 0,
      toArmies: updatedState.board.find((t: unknown) => t.id === toTerritoryId)?.armies || 0,
    }
  }

  async endTurn(roomId: string, userId: string) {
    const gameState = (await gameStateCache.getGameState(roomId)) as GameState
    if (!gameState) throw new Error('Game not found')
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')

    const updatedState = this.gameEngine.advancePhase(gameState)

    // Use longer TTL for finished games
    if (updatedState.phase === 'finished') {
      await gameStateCache.setInactiveGameState(roomId, updatedState)
    } else {
      await gameStateCache.setGameState(roomId, updatedState)
    }

    // Calculate reinforcement armies if moving to reinforcement phase
    let reinforcementArmies = 0
    if (updatedState.phase === 'reinforcement') {
      reinforcementArmies = this.gameEngine.calculateBaseReinforcementArmies(
        updatedState,
        updatedState.currentPlayer,
      )
    }

    return {
      gameState: this.serializeGameState(updatedState),
      reinforcementArmies,
    }
  }

  private isValidAction(action: GameAction, userId: string, gameState: GameState): boolean {
    if (gameState.currentPlayer !== userId) {
      return false
    }

    return this.gameEngine.validateAction(gameState, action)
  }

  /**
   * Worker support methods
   */
  async processPlaceArmies(
    gameId: string,
    data: { territoryId: string; armies: number; playerId: string },
  ): Promise<number> {
    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    const territory = gameState.board.find((t) => t.id === data.territoryId)
    if (!territory) throw new Error('Territory not found')

    territory.armies += data.armies
    await gameStateCache.setGameState(gameId, gameState)

    return territory.armies
  }

  async processFortify(
    gameId: string,
    data: { fromTerritoryId: string; toTerritoryId: string; armies: number; playerId: string },
  ): Promise<{ fromArmies: number; toArmies: number }> {
    const result = await this.fortify(
      gameId,
      data.playerId,
      data.fromTerritoryId,
      data.toTerritoryId,
      data.armies,
    )
    return {
      fromArmies: result.fromArmies,
      toArmies: result.toArmies,
    }
  }

  async processEndTurn(gameId: string, playerId: string): Promise<{ id: string }> {
    const result = await this.endTurn(gameId, playerId)
    return { id: result.gameState.currentPlayer }
  }

  async processPhaseChange(gameId: string, playerId: string, phase: string): Promise<void> {
    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    gameState.phase = phase as unknown
    await gameStateCache.setGameState(gameId, gameState)
  }

  async applyBattleResult(
    gameId: string,
    battleResult: unknown,
    attackingTerritory: string,
    defendingTerritory: string,
  ): Promise<void> {
    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    const attacker = gameState.board.find((t) => t.id === attackingTerritory)
    const defender = gameState.board.find((t) => t.id === defendingTerritory)

    if (attacker && defender) {
      attacker.armies -= battleResult.attackerLosses
      defender.armies -= battleResult.defenderLosses

      if (battleResult.territoryConquered) {
        defender.ownerId = attacker.ownerId
      }

      await gameStateCache.setGameState(gameId, gameState)
    }
  }

  async archiveGameResults(gameId: string, results: unknown): Promise<void> {
    // TODO: Store in database
    console.log(`Archiving game ${gameId}:`, results)
  }

  async updateEloRatings(gameId: string, gameState: unknown): Promise<void> {
    // TODO: Update ELO ratings
    console.log(`Updating ELO for game ${gameId}`)
  }

  async recordGameHistory(gameId: string, gameState: unknown): Promise<void> {
    // TODO: Record in database
    console.log(`Recording history for game ${gameId}`)
  }

  async removeFromActiveGames(gameId: string): Promise<void> {
    await gameStateCache.deleteGameState(gameId)
  }

  async getIdleGames(threshold: number): Promise<any[]> {
    // TODO: Query games that have been idle
    return []
  }

  async markPlayerAsInactive(gameId: string, playerId: string): Promise<void> {
    console.log(`Marking player ${playerId} as inactive in game ${gameId}`)
  }

  async pauseGame(gameId: string): Promise<void> {
    console.log(`Pausing game ${gameId}`)
  }

  async deleteGame(gameId: string): Promise<void> {
    await gameStateCache.deleteGameState(gameId)
  }

  async cleanupTemporaryData(gameId: string): Promise<void> {
    console.log(`Cleaning temp data for game ${gameId}`)
  }

  async cleanupAbandonedGame(gameId: string): Promise<void> {
    await this.removeFromActiveGames(gameId)
  }

  async logCleanup(gameId: string, reason: string): Promise<void> {
    console.log(`Cleanup logged for game ${gameId}: ${reason}`)
  }

  async archiveGame(gameId: string): Promise<void> {
    console.log(`Archiving game ${gameId}`)
  }

  async findAbandonedGames(thresholdMs: number): Promise<string[]> {
    // TODO: Query database for games that haven't been updated in thresholdMs
    console.log(`Finding games abandoned for ${thresholdMs}ms`)
    return []
  }

  /**
   * Clean up finished games from cache
   */
  async cleanupFinishedGames(roomIds: string[]) {
    await gameStateCache.cleanupFinishedGames(roomIds)
    // Also cleanup territory modifiers for finished games
    await territoryModifierService.cleanupFinishedGameModifiers(roomIds)
  }

  /**
   * Force cleanup a specific game (useful for abandoned games)
   */
  async removeGame(roomId: string) {
    await gameStateCache.invalidateGame(roomId)
    logger.info(`Forcefully removed game ${roomId} from cache`)
  }
}
