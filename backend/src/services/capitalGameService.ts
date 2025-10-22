/**
 * @fileoverview This file defines the CapitalGameService class, which manages the logic for the "Capitals" game mode.
 * This includes initializing capitals at the start of a game, checking for capital elimination when a capital is conquered,
 * and handling special rules related to capitals, such as defense bonuses.
 * @module services/capitalGameService
 */
import { query } from '../config/database.js'
import type { SerializedGameState } from '../types/game.js'
import { logger } from '../utils/logger.js'
import { gameStateCache } from './cacheService.js'
import { mapService } from './mapService.js'

/**
 * @interface CapitalGameState
 * @description Represents the state of capitals within a single game.
 */
export interface CapitalGameState {
  gameId: string
  capitalsEnabled: boolean
  capitals: Map<string, string> // playerId -> territoryId
  eliminatedPlayers: Set<string>
}

/**
 * @interface CapitalAttackResult
 * @description Represents the result of an attack on a capital territory.
 */
export interface CapitalAttackResult {
  territoryId: string
  attackerId: string
  defenderId: string
  isCapital: boolean
  capitalElimination?: {
    eliminatedPlayer: string
    territoriesGained: string[]
    troopsGained: number
  }
}

/**
 * A service class for managing the "Capitals" game mode.
 * @class CapitalGameService
 */
export class CapitalGameService {
  private gameStates: Map<string, CapitalGameState> = new Map()

  /**
   * Normalizes a territory ID to a string.
   * @private
   * @param {string | number} value - The territory ID to normalize.
   * @returns {string} The normalized territory ID.
   */
  private normalizeTerritoryId(value: string | number): string {
    return typeof value === 'number' ? value.toString() : value
  }

  /**
   * Gets the in-memory state for a game, creating it if it doesn't exist.
   * It also synchronizes the capital assignments from the cached game state if available.
   * @private
   * @param {string} gameId - The ID of the game.
   * @param {SerializedGameState | null} [cachedState] - The cached game state, if available.
   * @returns {CapitalGameState} The capital game state.
   */
  private getOrCreateState(
    gameId: string,
    cachedState?: SerializedGameState | null,
  ): CapitalGameState {
    let state = this.gameStates.get(gameId)
    if (!state) {
      state = {
        gameId,
        capitalsEnabled: false,
        capitals: new Map(),
        eliminatedPlayers: new Set(),
      }
      this.gameStates.set(gameId, state)
    }

    if (cachedState?.capitalAssignments) {
      state.capitals.clear()
      for (const [playerId, capitalId] of Object.entries(cachedState.capitalAssignments)) {
        state.capitals.set(playerId, capitalId)
      }
      state.capitalsEnabled = state.capitals.size > 0
    } else if (state.capitals.size === 0) {
      state.capitalsEnabled = false
    }

    return state
  }

  /**
   * Retrieves the serialized game state from the cache.
   * @private
   * @param {string} gameId - The ID of the game.
   * @returns {Promise<SerializedGameState | null>} A promise that resolves to the cached game state, or null if not found.
   */
  private async getCachedGameState(gameId: string): Promise<SerializedGameState | null> {
    try {
      const state = await gameStateCache.getGameState(gameId)
      return state as SerializedGameState | null
    } catch (error) {
      logger.error('Failed to load game state from cache for capitals', { gameId, error })
      return null
    }
  }

  /**
   * Persists the capital assignments to the cached game state.
   * @private
   * @param {string} gameId - The ID of the game.
   * @param {SerializedGameState} cachedState - The serialized game state to update.
   * @param {CapitalGameState} state - The current capital game state.
   */
  private persistCapitalState(
    gameId: string,
    cachedState: SerializedGameState,
    state: CapitalGameState,
  ): void {
    cachedState.capitalAssignments = Object.fromEntries(state.capitals.entries())
    gameStateCache.setGameState(gameId, cachedState).catch((error) => {
      logger.error('Failed to persist capital assignments to cache', { gameId, error })
    })
  }

  /**
   * Initializes the capitals for a game based on the map's configuration.
   * @param {string} gameId - The ID of the game.
   * @param {number} playerCount - The number of players in the game.
   * @param {string} mapId - The ID of the map being played.
   * @returns {Promise<void>} A promise that resolves when capitals have been initialized.
   */
  async initializeCapitals(gameId: string, playerCount: number, mapId: string): Promise<void> {
    try {
      const map = await mapService.getMap(mapId)
      const capitalAssignments = map?.capitalTerritories?.[playerCount.toString()]

      if (!capitalAssignments || capitalAssignments.length !== playerCount) {
        logger.warn('Capital configuration missing or invalid for map', {
          mapId,
          playerCount,
        })
        return
      }

      const cachedState = await this.getCachedGameState(gameId)
      if (!cachedState) {
        logger.warn('Cannot initialize capitals without an active game state', { gameId })
        return
      }

      const state = this.getOrCreateState(gameId, cachedState)
      const players = Array.isArray(cachedState.players) ? cachedState.players : []
      const board = Array.isArray(cachedState.board) ? cachedState.board : []

      state.capitals.clear()
      state.capitalsEnabled = true

      players.forEach((player, index) => {
        const capitalId = capitalAssignments[index]
        if (!capitalId) return

        const normalizedCapitalId = this.normalizeTerritoryId(capitalId)
        state.capitals.set(player.id, normalizedCapitalId)
        player.capitalTerritory = normalizedCapitalId

        const territory = board.find((t) => t.id === normalizedCapitalId)
        if (territory) {
          territory.isCapital = true
          territory.capitalOwnerId = player.id
        }
      })

      this.persistCapitalState(gameId, cachedState, state)

      logger.info('Capitals initialized for game', {
        gameId,
        playerCount,
        mapId,
      })
    } catch (error) {
      logger.error('Error initializing capitals:', error)
      throw error
    }
  }

  /**
   * Checks if an attack on a territory results in a capital elimination.
   * If it does, it processes the elimination, transferring territories and troops.
   * @param {string} gameId - The ID of the game.
   * @param {string | number} territoryId - The ID of the conquered territory.
   * @param {string} attackerId - The ID of the attacking player.
   * @param {string} defenderId - The ID of the defending player.
   * @returns {Promise<CapitalAttackResult>} A promise that resolves to the result of the attack, including any elimination details.
   */
  async checkCapitalElimination(
    gameId: string,
    territoryId: string | number,
    attackerId: string,
    defenderId: string,
  ): Promise<CapitalAttackResult> {
    const normalizedTerritoryId = this.normalizeTerritoryId(territoryId)
    const result: CapitalAttackResult = {
      territoryId: normalizedTerritoryId,
      attackerId,
      defenderId,
      isCapital: false,
    }

    const cachedState = await this.getCachedGameState(gameId)
    const state = this.getOrCreateState(gameId, cachedState)

    if (!state.capitalsEnabled || !cachedState) {
      return result
    }

    const defenderCapital = state.capitals.get(defenderId)
    if (defenderCapital !== normalizedTerritoryId) {
      return result
    }

    result.isCapital = true

    try {
      const board = Array.isArray(cachedState.board) ? cachedState.board : []
      const players = Array.isArray(cachedState.players) ? cachedState.players : []

      const defenderTerritories = board.filter((territory) => territory.ownerId === defenderId)
      const territoryIds = defenderTerritories.map((territory) => territory.id)
      const totalTroops = defenderTerritories.reduce(
        (sum, territory) => sum + (territory.armies || 0),
        0,
      )

      // Transfer territory ownership in the cached game state
      for (const territory of board) {
        if (territory.ownerId === defenderId) {
          territory.ownerId = attackerId
        }
        if (territory.id === defenderCapital) {
          territory.isCapital = true
          territory.capitalOwnerId = attackerId
        }
      }

      const defenderPlayer = players.find((player) => player.id === defenderId)
      if (defenderPlayer) {
        defenderPlayer.isEliminated = true
        defenderPlayer.capitalTerritory = undefined
      }

      const attackerPlayer = players.find((player) => player.id === attackerId)
      if (attackerPlayer) {
        attackerPlayer.capitalTerritory = defenderCapital
      }

      state.capitals.delete(defenderId)
      state.eliminatedPlayers.add(defenderId)

      if (!state.capitals.has(attackerId)) {
        state.capitals.set(attackerId, defenderCapital)
      } else {
        state.capitals.set(attackerId, defenderCapital)
      }

      this.persistCapitalState(gameId, cachedState, state)

      // Record elimination for analytics/history purposes
      await query(
        `
        INSERT INTO capital_eliminations 
          (game_id, eliminated_player_id, conqueror_player_id, capital_territory_id, territories_gained, troops_gained)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [gameId, defenderId, attackerId, defenderCapital, territoryIds.length, totalTroops],
      ).catch((error) => {
        logger.warn('Failed to insert capital elimination record', { gameId, error })
      })

      result.capitalElimination = {
        eliminatedPlayer: defenderId,
        territoriesGained: territoryIds,
        troopsGained: totalTroops,
      }

      this.emitCapitalElimination(gameId, result)

      logger.info('Capital elimination processed', {
        gameId,
        attackerId,
        defenderId,
        capitalTerritory: defenderCapital,
      })
    } catch (error) {
      logger.error('Error processing capital elimination:', error)
      throw error
    }

    return result
  }

  /**
   * Emits a capital elimination event. (Placeholder for future implementation)
   * @private
   * @param {string} _gameId - The ID of the game.
   * @param {CapitalAttackResult} result - The result of the capital attack.
   */
  private emitCapitalElimination(_gameId: string, result: CapitalAttackResult): void {
    if (!result.capitalElimination) return
    // Placeholder for socket emission once real-time events are wired in
  }

  /**
   * Emits an event when a capital is under attack. (Placeholder for future implementation)
   * @param {string} gameId - The ID of the game.
   * @param {string} defenderId - The ID of the defending player.
   * @param {string | number} territoryId - The ID of the territory under attack.
   */
  emitCapitalUnderAttack(gameId: string, defenderId: string, territoryId: string | number): void {
    const normalizedTerritoryId = this.normalizeTerritoryId(territoryId)
    const state = this.gameStates.get(gameId)
    if (!state?.capitalsEnabled) return

    const defenderCapital = state.capitals.get(defenderId)
    if (defenderCapital === normalizedTerritoryId) {
      // Placeholder for socket emission once real-time events are wired in
      logger.debug('Capital under attack', {
        gameId,
        defenderId,
        territoryId: normalizedTerritoryId,
      })
    }
  }

  /**
   * Gets the defense bonus for a capital territory.
   * @param {string} gameId - The ID of the game.
   * @param {string | number} territoryId - The ID of the territory.
   * @param {string} defenderId - The ID of the defending player.
   * @returns {number} The defense bonus (2 if it's the player's capital, otherwise 0).
   */
  getCapitalDefenseBonus(gameId: string, territoryId: string | number, defenderId: string): number {
    const normalizedTerritoryId = this.normalizeTerritoryId(territoryId)
    const state = this.gameStates.get(gameId)
    if (!state?.capitalsEnabled) return 0

    return state.capitals.get(defenderId) === normalizedTerritoryId ? 2 : 0
  }

  /**
   * Checks if a player can move troops from their capital.
   * A player must leave at least one troop in their capital.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @param {string | number} territoryId - The ID of the territory to move from.
   * @param {number} troopsToMove - The number of troops to move.
   * @returns {boolean} True if the move is allowed, false otherwise.
   */
  canMoveFromCapital(
    gameId: string,
    playerId: string,
    territoryId: string | number,
    troopsToMove: number,
  ): boolean {
    const normalizedTerritoryId = this.normalizeTerritoryId(territoryId)
    const state = this.gameStates.get(gameId)
    if (!state?.capitalsEnabled) return true

    const playerCapital = state.capitals.get(playerId)
    if (playerCapital !== normalizedTerritoryId) return true

    // Must leave at least one troop in the capital territory
    return troopsToMove < 1
  }

  /**
   * Gets the capital assignments for a game.
   * @param {string} gameId - The ID of the game.
   * @returns {Map<string, string> | null} A map of player IDs to their capital territory IDs, or null if not found.
   */
  getGameCapitals(gameId: string): Map<string, string> | null {
    const state = this.gameStates.get(gameId)
    return state?.capitals ?? null
  }

  /**
   * Checks if a player has been eliminated in a capitals game.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @returns {boolean} True if the player has been eliminated, false otherwise.
   */
  isPlayerEliminated(gameId: string, playerId: string): boolean {
    const state = this.gameStates.get(gameId)
    return state?.eliminatedPlayers.has(playerId) ?? false
  }

  /**
   * Cleans up the in-memory state for a completed game.
   * @param {string} gameId - The ID of the game to clean up.
   */
  cleanupGameState(gameId: string): void {
    this.gameStates.delete(gameId)
  }
}

export default new CapitalGameService()
