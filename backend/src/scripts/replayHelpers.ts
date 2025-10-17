import type { LockstepCommand } from '@conquestk/shared/types/lockstep'
import { query } from '../config/database.js'
import type { SerializedGameState } from '../types/game.js'

export async function loadInitialSnapshot(matchId: string): Promise<SerializedGameState | null> {
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
}

export async function loadFrames(
  matchId: string,
): Promise<Array<{ seq: number; playerId: string; commands: LockstepCommand[] }>> {
  const frames = await query<{ seq: number; player_id: string; commands: LockstepCommand[] }>(
    `SELECT seq, player_id, commands
       FROM match_frames
       WHERE match_id = $1
       ORDER BY seq ASC`,
    [matchId],
  )

  return frames.rows.map((row) => ({
    seq: row.seq,
    playerId: row.player_id,
    commands: Array.isArray(row.commands) ? row.commands : [],
  }))
}
