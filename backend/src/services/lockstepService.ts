import type { InputFrame, LockstepCommand, TickChecksum } from '@conquestk/shared/types/lockstep'
import { crc32 } from '@conquestk/shared/utils/crc32'
import { stableStringifyToUint8 } from '@conquestk/shared/utils/stableJson'
import type { PoolClient } from 'pg'
import { query } from '../config/database.js'
import type { GameAction, SerializedGameState } from '../types/game.js'
import { logger } from '../utils/logger.js'

// Configuration constants
const CHECKSUM_INTERVAL_DEFAULT = 5
const MAX_SEQ_RETRIES = 3
const DEFAULT_MAX_FRAMES = 2000
const MIN_CHECKSUM_MULTIPLIER = 4 // maxFrames must be at least checksumInterval * 4
const MIN_PRUNE_THRESHOLD = 50
const PRUNE_FREQUENCY_DIVISOR = 10 // Prune every maxFrames / 10
const RETRY_BASE_DELAY_MS = 10 // Exponential backoff: 10ms, 20ms, 40ms

interface PostgresError extends Error {
  code?: string
  detail?: string
}

function isUniqueViolationError(error: unknown): error is PostgresError {
  return (
    error instanceof Error && 'code' in error && (error as PostgresError).code === '23505' // Unique constraint violation
  )
}

export class LockstepService {
  private readonly checksumInterval: number

  private readonly maxFramesPerMatch: number

  private readonly maxChecksumsPerMatch: number

  private readonly pruneEvery: number

  constructor(checksumInterval?: number) {
    const envInterval = Number(process.env.LOCKSTEP_CHECKSUM_INTERVAL ?? '')
    this.checksumInterval =
      Number.isFinite(envInterval) && envInterval > 0
        ? envInterval
        : (checksumInterval ?? CHECKSUM_INTERVAL_DEFAULT)

    const envFrameCap = Number(process.env.LOCKSTEP_MAX_FRAMES ?? '')
    const frameCap =
      Number.isFinite(envFrameCap) && envFrameCap > 0 ? Math.trunc(envFrameCap) : DEFAULT_MAX_FRAMES
    this.maxFramesPerMatch = Math.max(frameCap, this.checksumInterval * MIN_CHECKSUM_MULTIPLIER)

    const checksumCap = Math.max(1, Math.floor(this.maxFramesPerMatch / this.checksumInterval))
    this.maxChecksumsPerMatch = checksumCap

    const envPruneEvery = Number(process.env.LOCKSTEP_PRUNE_INTERVAL ?? '')
    const derivedPrune = Math.max(
      MIN_PRUNE_THRESHOLD,
      Math.floor(this.maxFramesPerMatch / PRUNE_FREQUENCY_DIVISOR),
    )
    this.pruneEvery =
      Number.isFinite(envPruneEvery) && envPruneEvery > 0 ? Math.trunc(envPruneEvery) : derivedPrune
  }

  async reset(matchId: string, client?: PoolClient): Promise<void> {
    await query('DELETE FROM match_frames WHERE match_id = $1', [matchId], { client })
    await query('DELETE FROM match_checksums WHERE match_id = $1', [matchId], { client })
  }

  /**
   * Get next sequence number atomically by querying the database.
   * Uses COALESCE(MAX(seq), 0) + 1 to avoid race conditions.
   * The unique index on (match_id, seq) will catch any conflicts.
   */
  private async nextSeq(matchId: string, client?: PoolClient): Promise<number> {
    const result = await query<{ next_seq: number }>(
      'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM match_frames WHERE match_id = $1',
      [matchId],
      { client },
    )

    const nextSeq = result.rows[0]?.next_seq ?? 1
    return nextSeq
  }

  private toCommand(action: GameAction): LockstepCommand {
    const payload =
      'payload' in action && action.payload !== undefined
        ? (action.payload as Record<string, unknown>)
        : {}
    return {
      kind: action.type,
      payload,
    }
  }

  async recordBaseline(params: {
    matchId: string
    state: SerializedGameState
    client?: PoolClient
  }): Promise<void> {
    const { matchId, state, client } = params

    // Validate input parameters
    if (!matchId || typeof matchId !== 'string') {
      throw new Error('Invalid matchId: must be a non-empty string')
    }
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid state: must be an object')
    }

    try {
      const bytes = stableStringifyToUint8(state)
      const checksumValue = crc32(bytes)
      const committedAt = new Date().toISOString()
      await query(
        `INSERT INTO match_checksums (match_id, seq, crc32, snapshot, computed_at)
         VALUES ($1, 0, $2, $3, $4)
         ON CONFLICT (match_id, seq) DO UPDATE
         SET crc32 = EXCLUDED.crc32,
             snapshot = EXCLUDED.snapshot,
             computed_at = EXCLUDED.computed_at`,
        [matchId, checksumValue, Buffer.from(bytes), committedAt],
        { client },
      )
    } catch (error) {
      logger.error('Failed to record lockstep baseline snapshot', {
        matchId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Record a frame with retry logic on unique constraint violations.
   * Implements optimistic locking: if two concurrent requests get the same seq,
   * the second one will fail with a unique violation and retry with the next seq.
   */
  async recordFrame(params: {
    matchId: string
    playerId: string
    action: GameAction
    state: SerializedGameState
    client?: PoolClient
  }): Promise<{ frame: InputFrame; checksum?: TickChecksum }> {
    const { matchId, playerId, action, client } = params

    let lastError: Error | null = null
    for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
      try {
        return await this.recordFrameAttempt(params, client)
      } catch (error) {
        if (isUniqueViolationError(error) && attempt < MAX_SEQ_RETRIES - 1) {
          // Another process inserted this seq number - retry with the next one
          logger.debug('Lockstep sequence conflict, retrying', {
            matchId,
            attempt: attempt + 1,
            maxRetries: MAX_SEQ_RETRIES,
          })
          lastError = error
          // Small exponential backoff to reduce contention
          await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * RETRY_BASE_DELAY_MS))
          continue
        }

        // Non-retryable error or exhausted retries
        logger.error('Failed to record lockstep frame', {
          matchId,
          playerId,
          actionType: action.type,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
          errorCode: isUniqueViolationError(error) ? error.code : undefined,
        })
        throw error
      }
    }

    // Exhausted all retries
    throw new Error(
      `Failed to record lockstep frame after ${MAX_SEQ_RETRIES} attempts: ${lastError?.message ?? 'Unknown error'}`,
    )
  }

  /**
   * Single attempt to record a frame. May throw unique constraint violation.
   */
  private async recordFrameAttempt(
    params: {
      matchId: string
      playerId: string
      action: GameAction
      state: SerializedGameState
    },
    client?: PoolClient,
  ): Promise<{ frame: InputFrame; checksum?: TickChecksum }> {
    const { matchId, playerId, action, state } = params

    // Validate input parameters
    if (!matchId || typeof matchId !== 'string') {
      throw new Error('Invalid matchId: must be a non-empty string')
    }
    if (!playerId || typeof playerId !== 'string') {
      throw new Error('Invalid playerId: must be a non-empty string')
    }
    if (!action || typeof action.type !== 'string') {
      throw new Error('Invalid action: must have a type property')
    }
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid state: must be an object')
    }

    const seq = await this.nextSeq(matchId, client)
    const committedAt = new Date().toISOString()
    const commands = [this.toCommand(action)]

    const frame: InputFrame = {
      matchId,
      seq,
      playerId,
      commands,
      committedAt,
    }

    // This may throw unique constraint violation if another process inserted the same seq
    await query(
      `INSERT INTO match_frames (match_id, seq, player_id, commands, committed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [matchId, seq, playerId, JSON.stringify(commands), committedAt],
      { client },
    )

    // Frame successfully inserted - now handle checksum and pruning
    if (seq % this.checksumInterval !== 0) {
      if (seq % this.pruneEvery === 0) {
        await this.pruneHistory(matchId, seq, client)
      }
      return { frame }
    }

    // Compute and store checksum (with error handling)
    let checksum: TickChecksum
    try {
      const bytes = stableStringifyToUint8(state)
      const checksumValue = crc32(bytes)
      const computedAt = committedAt
      const snapshotBuffer = Buffer.from(bytes)

      checksum = {
        matchId,
        seq,
        crc32: checksumValue,
        computedAt,
      }

      await query(
        `INSERT INTO match_checksums (match_id, seq, crc32, snapshot, computed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (match_id, seq) DO UPDATE
         SET crc32 = EXCLUDED.crc32,
             snapshot = EXCLUDED.snapshot,
             computed_at = EXCLUDED.computed_at`,
        [matchId, seq, checksumValue, snapshotBuffer, computedAt],
        { client },
      )
    } catch (error) {
      // Checksum computation or storage failed - log but don't fail the frame insert
      logger.error('Failed to compute or store lockstep checksum', {
        matchId,
        seq,
        error: error instanceof Error ? error.message : String(error),
      })
      // Frame was already inserted successfully, so we return it without checksum
      // This allows gameplay to continue even if checksum storage fails
      if (seq % this.pruneEvery === 0) {
        await this.pruneHistory(matchId, seq, client)
      }
      return { frame }
    }

    if (seq % this.pruneEvery === 0) {
      await this.pruneHistory(matchId, seq, client)
    }

    return { frame, checksum }
  }

  /**
   * Prune old frames and checksums to prevent unbounded growth.
   * IMPORTANT: Only deletes frames if a snapshot exists at or after the deletion threshold,
   * ensuring replay is always possible from at least one snapshot.
   */
  private async pruneHistory(matchId: string, seq: number, client?: PoolClient): Promise<void> {
    if (seq <= this.maxFramesPerMatch) {
      return
    }

    const frameThreshold = seq - this.maxFramesPerMatch

    try {
      // Safety check: verify we have a snapshot at or after the threshold
      // This ensures replay can always start from a valid snapshot
      const snapshotCheck = await query<{ min_seq: number | null }>(
        `SELECT MIN(seq) as min_seq
         FROM match_checksums
         WHERE match_id = $1 AND seq >= $2 AND snapshot IS NOT NULL`,
        [matchId, frameThreshold],
        { client },
      )

      const oldestSafeSnapshot = snapshotCheck.rows[0]?.min_seq

      if (oldestSafeSnapshot === null || oldestSafeSnapshot === undefined) {
        logger.warn('Skipping frame pruning: no snapshot exists at or after threshold', {
          matchId,
          currentSeq: seq,
          frameThreshold,
          maxFramesPerMatch: this.maxFramesPerMatch,
        })
        return
      }

      // Safe to delete frames before the oldest snapshot
      const safeDeletionThreshold = Math.min(frameThreshold, oldestSafeSnapshot - 1)

      if (safeDeletionThreshold < 1) {
        // Nothing to delete yet
        return
      }

      const deleteResult = await query(
        `DELETE FROM match_frames
         WHERE match_id = $1 AND seq <= $2`,
        [matchId, safeDeletionThreshold],
        { client },
      )

      if (deleteResult.rowCount && deleteResult.rowCount > 0) {
        logger.debug('Pruned old lockstep frames', {
          matchId,
          deletedCount: deleteResult.rowCount,
          deletionThreshold: safeDeletionThreshold,
          oldestSnapshot: oldestSafeSnapshot,
        })
      }
    } catch (error) {
      logger.warn('Failed to prune match_frames history (best-effort)', {
        matchId,
        frameThreshold,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // Prune old checksums (keep recent N checkpoints)
    const checksumThreshold = seq - this.maxChecksumsPerMatch * this.checksumInterval
    if (checksumThreshold <= 0) {
      return
    }
    const deletionThreshold = Math.max(1, checksumThreshold)

    try {
      const deleteResult = await query(
        `DELETE FROM match_checksums
         WHERE match_id = $1 AND seq < $2`,
        [matchId, deletionThreshold],
        { client },
      )

      if (deleteResult.rowCount && deleteResult.rowCount > 0) {
        logger.debug('Pruned old lockstep checksums', {
          matchId,
          deletedCount: deleteResult.rowCount,
          deletionThreshold,
        })
      }
    } catch (error) {
      logger.warn('Failed to prune match_checksums history (best-effort)', {
        matchId,
        checksumThreshold,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async getLatestSnapshot(
    matchId: string,
    uptoSeq?: number,
    client?: PoolClient,
  ): Promise<{
    matchId: string
    seq: number
    crc32: number
    snapshot: Buffer | null
    computedAt: string
  } | null> {
    const params: unknown[] = [matchId]
    let condition = ''
    if (typeof uptoSeq === 'number' && Number.isFinite(uptoSeq)) {
      condition = 'AND seq <= $2'
      params.push(uptoSeq)
    }
    const result = await query<{
      seq: number
      crc32: number
      snapshot: Buffer | null
      computed_at: Date
    }>(
      `SELECT seq, crc32, snapshot, computed_at
       FROM match_checksums
       WHERE match_id = $1 ${condition}
       ORDER BY seq DESC
       LIMIT 1`,
      params,
      { client },
    )
    const row = result.rows[0]
    if (!row) {
      return null
    }
    return {
      matchId,
      seq: row.seq,
      crc32: row.crc32,
      snapshot: row.snapshot,
      computedAt:
        row.computed_at instanceof Date
          ? row.computed_at.toISOString()
          : new Date(row.computed_at).toISOString(),
    }
  }

  async getFramesAfter(
    matchId: string,
    seq: number,
    limit = 200,
    client?: PoolClient,
  ): Promise<InputFrame[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500))
    const result = await query<{
      seq: number
      player_id: string
      commands: LockstepCommand[]
      committed_at: Date
    }>(
      `SELECT seq, player_id, commands, committed_at
       FROM match_frames
       WHERE match_id = $1 AND seq > $2
       ORDER BY seq ASC
       LIMIT $3`,
      [matchId, seq, safeLimit],
      { client },
    )

    return result.rows.map((row) => ({
      matchId,
      seq: row.seq,
      playerId: row.player_id,
      commands: Array.isArray(row.commands) ? row.commands : [],
      committedAt:
        row.committed_at instanceof Date
          ? row.committed_at.toISOString()
          : new Date(row.committed_at).toISOString(),
    }))
  }
}

export const lockstepService = new LockstepService()
