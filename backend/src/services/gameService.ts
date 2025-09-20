import { GameEngine } from '../game/gameEngine'
import type {
  GameAction,
  GameConfiguration,
  GamePhase,
  GamePlayer,
  GameState,
  GameTerritoryModifier,
  SerializedGameState,
  Territory,
} from '../types/game'
import { logger } from '../utils/logger'
import { transaction } from '../config/database'
import { gameStateCache } from './cacheService'
import { mapService } from './mapService'
import notificationService from './notificationService'
import territoryModifierService from './territoryModifierService'
import { battleMetrics } from './metricsService'

type BattleWorkerResult = {
  attackerLosses: number
  defenderLosses: number
  territoryConquered: boolean
  attackingArmiesRemaining: number
  defendingArmiesRemaining: number
  dice: {
    attacker: number[]
    defender: number[]
  }
  jobId: string
  attackingTerritoryId: string
  defendingTerritoryId: string
  attackingPlayerId: string
  defendingPlayerId?: string | null
  attackingArmiesCommitted: number
}

type BattleLogEntry = {
  jobId: string
  timestamp: string
  attackingTerritoryId: string
  defendingTerritoryId: string
  attackerId: string
  defenderId: string | null
  losses: {
    attacker: number
    defender: number
  }
  conquered: boolean
}

export class GameService {
  private gameEngine = new GameEngine()
  // Removed: private activeGames = new Map<string, GameState>()
  // Now using Redis-backed gameStateCache for persistence and scalability

  private serializeGameState(gameState: GameState): SerializedGameState {
    const { territoryModifiers, ...rest } = gameState
    const baseState = rest as Omit<GameState, 'territoryModifiers'>

    const serialized: SerializedGameState = {
      ...baseState,
    }

    if (territoryModifiers instanceof Map) {
      serialized.territoryModifiers = Object.fromEntries(territoryModifiers.entries())
    } else if (territoryModifiers) {
      serialized.territoryModifiers = territoryModifiers
    }

    return serialized
  }

  private hydrateGameState(state: GameState | SerializedGameState): GameState {
    if (state.territoryModifiers && !(state.territoryModifiers instanceof Map)) {
      const modifierMap = new Map<string, GameTerritoryModifier>(
        Object.entries(state.territoryModifiers),
      )

      return {
        ...state,
        territoryModifiers: modifierMap,
      }
    }

    return state as GameState
  }

  async isCapitalTerritory(roomId: string, _territoryId: string): Promise<boolean> {
    // This is a placeholder - in a real implementation, you'd check the game state
    // or database to see if this territory is marked as a capital
    const rawState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!rawState) return false
    const _gameState = this.hydrateGameState(rawState)

    // Check if the game has capitals enabled and if this territory is a capital
    // This would need proper implementation based on your game state structure
    return false
  }

  async processGameAction(action: GameAction, userId: string): Promise<GameState> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(action.roomId)

    if (!cachedState) {
      throw new Error('Game not found')
    }

    const gameState = this.hydrateGameState(cachedState)

    if (!this.isValidAction(action, userId, gameState)) {
      throw new Error('Invalid action')
    }

    const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(action.roomId, this.serializeGameState(updatedState))

    logger.info(`Game action processed for room ${action.roomId}: ${action.type}`)
    return updatedState
  }

  async initializeGame(
    roomId: string,
    players: string[],
    gameConfig?: Partial<GameConfiguration>,
  ): Promise<GameState> {
    // Default game configuration
    const defaultGameConfig = {
      movementType: 'classic_adjacent' as const,
      allowTeamPlay: false,
      maxPlayers: 6,
      mapId: 'classic',
      gameMode: 'standard',
    }

    const config: GameConfiguration = { ...defaultGameConfig, ...(gameConfig || {}) }

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
      gameState.territoryModifiers = modifiers
    }

    // Cache the game state with TTL for automatic cleanup (24 hours)
    await gameStateCache.setGameState(roomId, this.serializeGameState(gameState))

    if (notificationService.isEnabled()) {
      notificationService.notifyGameStart(roomId, players).catch((error) => {
        logger.warn('Failed to send game start push notifications', {
          roomId,
          error: error instanceof Error ? error.message : error,
        })
      })
    }

    logger.info(`Game initialized for room ${roomId} with ${players.length} players`)
    return gameState
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) return null

    const hydratedState = this.hydrateGameState(cachedState)

    if (hydratedState.gameConfig?.useTerritoryModifiers && !hydratedState.territoryModifiers) {
      const modifiers = await territoryModifierService.getGameModifiers(roomId)
      if (modifiers.size > 0) {
        hydratedState.territoryModifiers = modifiers
      }
    }

    return hydratedState
  }

  async deployArmies(roomId: string, userId: string, territoryId: string, armies: number) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
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

    const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(roomId, this.serializeGameState(updatedState))

    return {
      gameState: this.serializeGameState(updatedState),
      territoryId,
      armies: updatedState.board.find((t) => t.id === territoryId)?.armies || 0,
    }
  }

  async attack(roomId: string, userId: string, fromTerritoryId: string, toTerritoryId: string) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
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

    const { gameState: updatedState, battleResult } = await this.gameEngine.processAction(
      gameState,
      action,
    )

    if (!battleResult) {
      throw new Error('Attack did not produce a battle result')
    }

    await gameStateCache.setGameState(roomId, this.serializeGameState(updatedState))

    if (notificationService.isEnabled() && battleResult.gameEnded) {
      const participantIds = updatedState.players.map((player) => player.id)
      const winnerId = battleResult.winner?.id ?? updatedState.currentPlayer
      notificationService.notifyGameEnd(roomId, winnerId, participantIds).catch((error) => {
        logger.warn('Failed to send game end push notifications after battle', {
          roomId,
          error: error instanceof Error ? error.message : error,
        })
      })
    }

    return {
      ...battleResult,
      gameState: this.serializeGameState(updatedState),
    }
  }

  async fortify(
    roomId: string,
    userId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
  ) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
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

    const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action)
    await gameStateCache.setGameState(roomId, this.serializeGameState(updatedState))

    return {
      gameState: this.serializeGameState(updatedState),
      fromTerritoryId,
      toTerritoryId,
      fromArmies: updatedState.board.find((t) => t.id === fromTerritoryId)?.armies || 0,
      toArmies: updatedState.board.find((t) => t.id === toTerritoryId)?.armies || 0,
    }
  }

  async endTurn(roomId: string, userId: string) {
    const cachedState = await gameStateCache.getGameState<SerializedGameState>(roomId)
    if (!cachedState) throw new Error('Game not found')
    const gameState = this.hydrateGameState(cachedState)
    if (gameState.currentPlayer !== userId) throw new Error('Not your turn')

    const previousPlayerId = gameState.currentPlayer
    const previousPhase = gameState.phase
    const updatedState = this.gameEngine.advancePhase(gameState)

    // Use longer TTL for finished games
    if (updatedState.phase === 'finished') {
      await gameStateCache.setInactiveGameState(roomId, this.serializeGameState(updatedState))
    } else {
      await gameStateCache.setGameState(roomId, this.serializeGameState(updatedState))
    }

    if (notificationService.isEnabled()) {
      const nextPlayerId = updatedState.currentPlayer
      const participantIds = updatedState.players.map((player) => player.id)

      if (updatedState.phase === 'finished' && previousPhase !== 'finished') {
        const winner = updatedState.players.find(
          (player) => player.id === nextPlayerId && !player.isEliminated,
        )
        notificationService
          .notifyGameEnd(roomId, winner?.id ?? nextPlayerId, participantIds)
          .catch((error) => {
            logger.warn('Failed to send game end push notifications', {
              roomId,
              error: error instanceof Error ? error.message : error,
            })
          })
      } else if (nextPlayerId !== previousPlayerId && updatedState.phase === 'reinforcement') {
        const nextPlayer = updatedState.players.find((player) => player.id === nextPlayerId)
        notificationService
          .notifyTurnStart(roomId, nextPlayerId, nextPlayer?.username ?? 'Your turn')
          .catch((error) => {
            logger.warn('Failed to send turn start push notification', {
              roomId,
              nextPlayerId,
              error: error instanceof Error ? error.message : error,
            })
          })
      }
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
    await gameStateCache.setGameState(gameId, this.serializeGameState(gameState))

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

  async processPhaseChange(gameId: string, playerId: string, phase: GamePhase): Promise<void> {
    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    if (gameState.currentPlayer !== playerId) {
      throw new Error('Not your turn')
    }

    gameState.phase = phase
    await gameStateCache.setGameState(gameId, this.serializeGameState(gameState))
  }

  async applyBattleResult(gameId: string, payload: BattleWorkerResult): Promise<{ applied: boolean }> {
    const {
      jobId,
      attackerLosses,
      defenderLosses,
      territoryConquered,
      attackingArmiesRemaining,
      defendingArmiesRemaining,
      dice,
      attackingTerritoryId,
      defendingTerritoryId,
      attackingPlayerId,
      defendingPlayerId,
      attackingArmiesCommitted,
    } = payload

    const gameState = await this.getGameState(gameId)
    if (!gameState) throw new Error('Game not found')

    const attackerTerritory = gameState.board.find((t) => t.id === attackingTerritoryId)
    const defenderTerritory = gameState.board.find((t) => t.id === defendingTerritoryId)

    if (!attackerTerritory || !defenderTerritory) {
      throw new Error('Territory not found')
    }

    const attackerId = attackerTerritory.ownerId ?? attackingPlayerId
    if (!attackerId) {
      throw new Error('Attacking player missing from state')
    }

    const defenderId = defenderTerritory.ownerId ?? defendingPlayerId ?? null

    const preMoveAttackerArmies = Math.max(attackingArmiesRemaining, 0)
    const maxMovable = Math.max(preMoveAttackerArmies - 1, 0)
    const movingArmies = territoryConquered
      ? Math.max(0, Math.min(attackingArmiesCommitted, maxMovable))
      : 0
    const finalAttackerArmies = territoryConquered
      ? Math.max(preMoveAttackerArmies - movingArmies, 1)
      : Math.max(preMoveAttackerArmies, 1)
    const finalDefenderArmies = territoryConquered
      ? Math.max(movingArmies, 0)
      : Math.max(defendingArmiesRemaining, 0)

    const updatedBoard: Territory[] = gameState.board.map((territory) => {
      if (territory.id === attackingTerritoryId) {
        return {
          ...territory,
          armies: finalAttackerArmies,
        }
      }

      if (territory.id === defendingTerritoryId) {
        return {
          ...territory,
          ownerId: territoryConquered ? attackerId : territory.ownerId,
          armies: finalDefenderArmies,
        }
      }

      return territory
    })

    const playersAfterBattle = this.rebuildPlayersAfterBattle(gameState.players, updatedBoard)
    const activePlayers = playersAfterBattle.filter((player) => !player.isEliminated)
    const gameEnded = activePlayers.length <= 1
    const winner = gameEnded ? activePlayers[0] ?? null : null

    const lastBattleResult = {
      attackerDice: dice.attacker,
      defenderDice: dice.defender,
      attackerLosses,
      defenderLosses,
      conquered: territoryConquered,
      fromTerritory: {
        id: attackingTerritoryId,
        name: attackerTerritory.name,
        armies: finalAttackerArmies,
      },
      toTerritory: {
        id: defendingTerritoryId,
        name: defenderTerritory.name,
        armies: finalDefenderArmies,
        ownerId: territoryConquered
          ? attackerId
          : defenderTerritory.ownerId ?? defenderId ?? attackerId,
      },
      gameEnded,
      winner,
      eliminatedPlayers: playersAfterBattle.filter((player) => player.isEliminated).map((p) => p.id),
    }

    const updatedGameState: GameState = {
      ...gameState,
      board: updatedBoard,
      players: playersAfterBattle,
      lastBattleResult,
      hasAttackedThisTurn: true,
      phase: gameEnded ? 'finished' : gameState.phase,
      currentPlayer: gameEnded && winner ? winner.id : gameState.currentPlayer,
    }

    const serializedState = this.serializeGameState(updatedGameState)
    const playerStats = this.buildPlayerStats(playersAfterBattle, updatedBoard)
    const logEntry: BattleLogEntry = {
      jobId,
      timestamp: new Date().toISOString(),
      attackingTerritoryId,
      defendingTerritoryId,
      attackerId,
      defenderId,
      losses: {
        attacker: attackerLosses,
        defender: defenderLosses,
      },
      conquered: territoryConquered,
    }

    let persistenceOutcome: { applied: boolean; divergence: number }

    try {
      persistenceOutcome = await transaction(async (client) => {
        const existingStateResult = await client.query<{
          territories: Territory[] | null
          game_log: BattleLogEntry[] | null
          winner_id: string | null
        }>(
          'SELECT territories, game_log, winner_id FROM game_states WHERE room_id = $1 FOR UPDATE',
          [gameId],
        )

        const existingRow = existingStateResult.rows[0]
        const existingLog = Array.isArray(existingRow?.game_log) ? existingRow?.game_log : []
        const alreadyApplied = existingLog.some((entry) => entry?.jobId === jobId)
        const divergence = this.calculateTerritoryDivergence(
          existingRow?.territories ?? null,
          updatedBoard,
        )

        if (alreadyApplied) {
          return { applied: false, divergence }
        }

        const updatedLog = [...existingLog, logEntry].slice(-500)
        const roundNumber = this.calculateRoundNumber(updatedGameState)

        await client.query(
          `INSERT INTO game_states (
            room_id,
            current_player_id,
            game_phase,
            turn_number,
            round_number,
            territories,
            player_stats,
            game_log,
            last_activity,
            winner_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
          ON CONFLICT (room_id) DO UPDATE SET
            current_player_id = EXCLUDED.current_player_id,
            game_phase = EXCLUDED.game_phase,
            turn_number = EXCLUDED.turn_number,
            round_number = EXCLUDED.round_number,
            territories = EXCLUDED.territories,
            player_stats = EXCLUDED.player_stats,
            game_log = EXCLUDED.game_log,
            last_activity = NOW(),
            winner_id = EXCLUDED.winner_id`,
          [
            gameId,
            serializedState.currentPlayer,
            serializedState.phase,
            serializedState.turn,
            roundNumber,
            JSON.stringify(serializedState.board),
            JSON.stringify(playerStats),
            JSON.stringify(updatedLog),
            gameEnded ? winner?.id ?? null : existingRow?.winner_id ?? null,
          ],
        )

        return { applied: true, divergence }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown battle persistence error'
      battleMetrics.recordFailure(message, { gameId, jobId })
      throw error
    }

    const status = persistenceOutcome.applied ? 'applied' : 'duplicate'
    battleMetrics.recordApply(gameId, status, persistenceOutcome.divergence)

    if (persistenceOutcome.applied) {
      await gameStateCache.setGameState(gameId, serializedState)
    }

    return { applied: persistenceOutcome.applied }
  }

  private rebuildPlayersAfterBattle(players: GamePlayer[], board: Territory[]): GamePlayer[] {
    return players.map((player) => {
      const territories = board.filter((territory) => territory.ownerId === player.id)
      const territoryIds = territories.map((territory) => territory.id)
      const totalArmies = territories.reduce((sum, territory) => sum + territory.armies, 0)

      return {
        ...player,
        territories: territoryIds,
        armies: totalArmies,
        isEliminated: territoryIds.length === 0,
      }
    })
  }

  private buildPlayerStats(players: GamePlayer[], board: Territory[]) {
    const boardByOwner = board.reduce<Record<string, { territories: number; armies: number }>>(
      (acc, territory) => {
        if (!territory.ownerId) return acc

        if (!acc[territory.ownerId]) {
          acc[territory.ownerId] = { territories: 0, armies: 0 }
        }

        acc[territory.ownerId].territories += 1
        acc[territory.ownerId].armies += territory.armies
        return acc
      },
      {},
    )

    return players.reduce<Record<string, { territories: number; armies: number; eliminated: boolean }>>(
      (acc, player) => {
        const metrics = boardByOwner[player.id] ?? { territories: 0, armies: 0 }
        acc[player.id] = {
          territories: metrics.territories,
          armies: metrics.armies,
          eliminated: player.isEliminated,
        }
        return acc
      },
      {},
    )
  }

  private calculateTerritoryDivergence(
    persisted: Territory[] | null,
    updatedBoard: Territory[],
  ): number {
    if (!persisted || persisted.length === 0) {
      return updatedBoard.length
    }

    const persistedById = new Map<string, Territory>()
    for (const territory of persisted) {
      persistedById.set(territory.id, territory)
    }

    let divergences = 0

    for (const territory of updatedBoard) {
      const persistedTerritory = persistedById.get(territory.id)
      if (!persistedTerritory) {
        divergences += 1
        continue
      }

      if (
        persistedTerritory.ownerId !== territory.ownerId ||
        persistedTerritory.armies !== territory.armies
      ) {
        divergences += 1
      }
    }

    return divergences
  }

  private calculateRoundNumber(gameState: GameState): number {
    const activePlayers = gameState.players.filter((player) => !player.isEliminated).length
    const divisor = Math.max(activePlayers, 1)
    return Math.max(1, Math.ceil(gameState.turn / divisor))
  }

  async archiveGameResults(gameId: string, results: Record<string, unknown>): Promise<void> {
    // TODO: Store in database
    logger.debug(`Archiving game ${gameId}:`, results)
  }

  async updateEloRatings(gameId: string, _gameState: unknown): Promise<void> {
    // TODO: Update ELO ratings
    logger.debug(`Updating ELO for game ${gameId}`)
  }

  async recordGameHistory(gameId: string, _gameState: unknown): Promise<void> {
    // TODO: Record in database
    logger.debug(`Recording history for game ${gameId}`)
  }

  async removeFromActiveGames(gameId: string): Promise<void> {
    await gameStateCache.deleteGameState(gameId)
  }

  async getIdleGames(_threshold: number): Promise<string[]> {
    // TODO: Query games that have been idle
    return []
  }

  async markPlayerAsInactive(gameId: string, playerId: string): Promise<void> {
    logger.info(`Marking player ${playerId} as inactive in game ${gameId}`)
  }

  async pauseGame(gameId: string): Promise<void> {
    logger.info(`Pausing game ${gameId}`)
  }

  async deleteGame(gameId: string): Promise<void> {
    await gameStateCache.deleteGameState(gameId)
  }

  async cleanupTemporaryData(gameId: string): Promise<void> {
    logger.debug(`Cleaning temp data for game ${gameId}`)
  }

  async cleanupAbandonedGame(gameId: string): Promise<void> {
    await this.removeFromActiveGames(gameId)
  }

  async logCleanup(gameId: string, reason: string): Promise<void> {
    logger.info(`Cleanup logged for game ${gameId}: ${reason}`)
  }

  async archiveGame(gameId: string): Promise<void> {
    logger.info(`Archiving game ${gameId}`)
  }

  async findAbandonedGames(thresholdMs: number): Promise<string[]> {
    // TODO: Query database for games that haven't been updated in thresholdMs
    logger.debug(`Finding games abandoned for ${thresholdMs}ms`)
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
