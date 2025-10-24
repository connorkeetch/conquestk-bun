/**
 * EventLog - Event sourcing implementation for game events
 * Part of Authoritative Server architecture
 */
import type { PoolClient } from 'pg'
import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'
import type { GameEvent } from './CommandProcessor.js'

export class EventLog {
  /**
   * Append an event to the log
   */
  async appendEvent(event: GameEvent, client?: PoolClient): Promise<GameEvent> {
    try {
      // Get next sequence number
      const seqResult = await query<{ next_seq: number }>(
        'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM game_events WHERE game_id = $1',
        [event.gameId],
        { client },
      )

      const seq = seqResult.rows[0]?.next_seq ?? 1

      // Insert event
      await query(
        `INSERT INTO game_events (seq, game_id, event_type, version, player_id, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          seq,
          event.gameId,
          event.type,
          event.version,
          event.playerId ?? null,
          JSON.stringify(event.payload),
          event.timestamp,
        ],
        { client },
      )

      logger.debug('Event appended to log', {
        gameId: event.gameId,
        seq,
        type: event.type,
        version: event.version,
      })

      return {
        ...event,
        seq,
      }
    } catch (error) {
      logger.error('Failed to append event', {
        gameId: event.gameId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Get events after a specific sequence number
   */
  async getEventsAfter(
    gameId: string,
    afterSeq: number,
    limit: number = 100,
    client?: PoolClient,
  ): Promise<GameEvent[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500))

    const result = await query<{
      id: string
      seq: number
      event_type: string
      version: number
      player_id: string | null
      payload: unknown
      created_at: Date
    }>(
      `SELECT id, seq, event_type, version, player_id, payload, created_at
       FROM game_events
       WHERE game_id = $1 AND seq > $2
       ORDER BY seq ASC
       LIMIT $3`,
      [gameId, afterSeq, safeLimit],
      { client },
    )

    return result.rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      type: row.event_type,
      gameId,
      version: row.version,
      playerId: row.player_id ?? undefined,
      payload: row.payload,
      timestamp:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }))
  }

  /**
   * Get all events for a game
   */
  async getGameEvents(gameId: string, client?: PoolClient): Promise<GameEvent[]> {
    const result = await query<{
      id: string
      seq: number
      event_type: string
      version: number
      player_id: string | null
      payload: unknown
      created_at: Date
    }>(
      `SELECT id, seq, event_type, version, player_id, payload, created_at
       FROM game_events
       WHERE game_id = $1
       ORDER BY seq ASC`,
      [gameId],
      { client },
    )

    return result.rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      type: row.event_type,
      gameId,
      version: row.version,
      playerId: row.player_id ?? undefined,
      payload: row.payload,
      timestamp:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }))
  }

  /**
   * Get latest event sequence number for a game
   */
  async getLatestSeq(gameId: string, client?: PoolClient): Promise<number> {
    const result = await query<{ max_seq: number | null }>(
      'SELECT MAX(seq) AS max_seq FROM game_events WHERE game_id = $1',
      [gameId],
      { client },
    )

    return result.rows[0]?.max_seq ?? 0
  }

  /**
   * Prune old events (keep only recent N events)
   */
  async pruneOldEvents(
    gameId: string,
    keepCount: number = 1000,
    client?: PoolClient,
  ): Promise<void> {
    try {
      const latestSeq = await this.getLatestSeq(gameId, client)
      const deleteBeforeSeq = Math.max(0, latestSeq - keepCount)

      if (deleteBeforeSeq <= 0) {
        return // Nothing to prune
      }

      const result = await query(
        'DELETE FROM game_events WHERE game_id = $1 AND seq < $2',
        [gameId, deleteBeforeSeq],
        { client },
      )

      if (result.rowCount && result.rowCount > 0) {
        logger.debug('Pruned old events', {
          gameId,
          deletedCount: result.rowCount,
          deleteBeforeSeq,
        })
      }
    } catch (error) {
      logger.warn('Failed to prune events (best-effort)', {
        gameId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Clear all events for a game
   */
  async clearGameEvents(gameId: string, client?: PoolClient): Promise<void> {
    await query('DELETE FROM game_events WHERE game_id = $1', [gameId], { client })
    logger.debug('Cleared game events', { gameId })
  }
}

export const eventLog = new EventLog()
