/**
 * StateManager - Manages game state versioning and snapshots
 * Part of Authoritative Server architecture
 */
import type { PoolClient } from 'pg'
import { query } from '../config/database.js'
import type { GameState, SerializedGameState } from '../types/game.js'
import { logger } from '../utils/logger.js'
import { hydrateSerializedGameState, toSerializedGameState } from '../utils/serializeGameState.js'

export class StateManager {
  /**
   * Increment version and update state
   */
  incrementVersion(state: GameState): GameState {
    const currentVersion = state.version ?? 0
    return {
      ...state,
      version: currentVersion + 1,
    }
  }

  /**
   * Save a state snapshot to database
   */
  async saveSnapshot(gameId: string, state: GameState, client?: PoolClient): Promise<void> {
    try {
      const version = state.version ?? 0
      const serialized = toSerializedGameState(state)
      const stateJson = JSON.stringify(serialized)

      await query(
        `INSERT INTO game_state_snapshots (game_id, version, state, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (game_id, version) DO UPDATE
         SET state = EXCLUDED.state, created_at = NOW()`,
        [gameId, version, stateJson],
        { client },
      )

      // Update game_rooms with current version
      await query('UPDATE game_rooms SET state_version = $1 WHERE id = $2', [version, gameId], {
        client,
      })

      logger.debug('Snapshot saved', { gameId, version })
    } catch (error) {
      logger.error('Failed to save snapshot', {
        gameId,
        version: state.version,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Load the latest snapshot for a game
   */
  async loadLatestSnapshot(gameId: string, client?: PoolClient): Promise<GameState | null> {
    try {
      const result = await query<{
        version: number
        state: SerializedGameState
      }>(
        `SELECT version, state
         FROM game_state_snapshots
         WHERE game_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [gameId],
        { client },
      )

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      const serialized = row.state
      const hydrated = hydrateSerializedGameState(serialized)

      return {
        ...hydrated,
        version: row.version,
      }
    } catch (error) {
      logger.error('Failed to load snapshot', {
        gameId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Load a specific version snapshot
   */
  async loadSnapshotAtVersion(
    gameId: string,
    version: number,
    client?: PoolClient,
  ): Promise<GameState | null> {
    try {
      const result = await query<{
        state: SerializedGameState
      }>(
        `SELECT state
         FROM game_state_snapshots
         WHERE game_id = $1 AND version = $2`,
        [gameId, version],
        { client },
      )

      if (result.rows.length === 0) {
        return null
      }

      const serialized = result.rows[0].state
      const hydrated = hydrateSerializedGameState(serialized)

      return {
        ...hydrated,
        version,
      }
    } catch (error) {
      logger.error('Failed to load snapshot at version', {
        gameId,
        version,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Get current version for a game
   */
  async getCurrentVersion(gameId: string, client?: PoolClient): Promise<number> {
    const result = await query<{ state_version: number | null }>(
      'SELECT state_version FROM game_rooms WHERE id = $1',
      [gameId],
      { client },
    )

    return result.rows[0]?.state_version ?? 0
  }

  /**
   * Prune old snapshots (keep only recent N versions)
   */
  async pruneOldSnapshots(
    gameId: string,
    keepCount: number = 50,
    client?: PoolClient,
  ): Promise<void> {
    try {
      const latestVersion = await this.getCurrentVersion(gameId, client)
      const deleteBeforeVersion = Math.max(0, latestVersion - keepCount)

      if (deleteBeforeVersion <= 0) {
        return // Nothing to prune
      }

      const result = await query(
        'DELETE FROM game_state_snapshots WHERE game_id = $1 AND version < $2',
        [gameId, deleteBeforeVersion],
        { client },
      )

      if (result.rowCount && result.rowCount > 0) {
        logger.debug('Pruned old snapshots', {
          gameId,
          deletedCount: result.rowCount,
          deleteBeforeVersion,
        })
      }
    } catch (error) {
      logger.warn('Failed to prune snapshots (best-effort)', {
        gameId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Clear all snapshots for a game
   */
  async clearGameSnapshots(gameId: string, client?: PoolClient): Promise<void> {
    await query('DELETE FROM game_state_snapshots WHERE game_id = $1', [gameId], { client })
    logger.debug('Cleared game snapshots', { gameId })
  }
}

export const stateManager = new StateManager()
