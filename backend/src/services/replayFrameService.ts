import type { LockstepCommand } from '@conquestk/shared/types/lockstep'
import { query } from '../config/database.js'
import type { SerializedGameState } from '../types/game.js'
import { logger } from '../utils/logger.js'

export interface ReplayFrameRecord {
  matchId: string
  seq: number
  playerId: string
  committedAt: string
  commands: LockstepCommand[]
}

export interface ReplayFrameChunk {
  frames: ReplayFrameRecord[]
  finalSeq: number
  totalFrames: number
}

export async function getReplayInitialSnapshot(
  matchId: string,
): Promise<SerializedGameState | null> {
  try {
    const baseline = await query<{ snapshot: Buffer | null }>(
      `SELECT snapshot
         FROM match_checksums
        WHERE match_id = $1
          AND snapshot IS NOT NULL
        ORDER BY seq ASC
        LIMIT 1`,
      [matchId],
    )

    const baselineSnapshot = baseline.rows[0]?.snapshot
    if (baselineSnapshot) {
      try {
        const parsed = JSON.parse(baselineSnapshot.toString('utf8')) as SerializedGameState
        return parsed
      } catch (error) {
        logger.warn('Failed to parse baseline lockstep snapshot for replay (falling back)', {
          matchId,
          error: error instanceof Error ? error.message : error,
        })
      }
    }

    const snapshots = await query<{ snapshot: SerializedGameState }>(
      `SELECT snapshot
         FROM game_state_snapshots
         WHERE room_id = $1
         ORDER BY turn_number ASC, created_at ASC
         LIMIT 1`,
      [matchId],
    )

    if (snapshots.rows[0]?.snapshot) {
      return snapshots.rows[0].snapshot
    }

    const current = await query<{ game_data: SerializedGameState }>(
      `SELECT game_data
         FROM game_states
         WHERE room_id = $1`,
      [matchId],
    )

    return current.rows[0]?.game_data ?? null
  } catch (error) {
    logger.warn('Failed to load initial replay snapshot', {
      matchId,
      error: error instanceof Error ? error.message : error,
    })
    return null
  }
}

export async function getReplayFrameChunk(
  matchId: string,
  fromSeq: number,
  toSeq: number,
): Promise<ReplayFrameChunk> {
  const start = Math.max(1, Math.trunc(fromSeq))
  const end = Math.max(start, Math.trunc(toSeq))

  const [frameRes, metaRes] = await Promise.all([
    query<{
      seq: number
      player_id: string
      committed_at: Date
      commands: LockstepCommand[]
    }>(
      `SELECT seq, player_id, committed_at, commands
         FROM match_frames
        WHERE match_id = $1
          AND seq BETWEEN $2 AND $3
        ORDER BY seq ASC`,
      [matchId, start, end],
    ),
    query<{ max_seq: number | null; total: number }>(
      `SELECT COALESCE(MAX(seq), 0) AS max_seq, COUNT(*)::int AS total
         FROM match_frames
        WHERE match_id = $1`,
      [matchId],
    ),
  ])

  const frames: ReplayFrameRecord[] = frameRes.rows.map((row) => ({
    matchId,
    seq: row.seq,
    playerId: row.player_id,
    committedAt:
      row.committed_at instanceof Date
        ? row.committed_at.toISOString()
        : new Date(row.committed_at).toISOString(),
    commands: Array.isArray(row.commands) ? (row.commands as LockstepCommand[]) : [],
  }))

  const finalSeq = Number(metaRes.rows[0]?.max_seq ?? 0)
  const totalFrames = Number(metaRes.rows[0]?.total ?? 0)

  return {
    frames,
    finalSeq,
    totalFrames,
  }
}
