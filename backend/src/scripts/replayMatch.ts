import process from 'node:process'
import type { LockstepCommand } from '@conquestk/shared/types/lockstep'
import { crc32 } from '@conquestk/shared/utils/crc32'
import { stableStringifyToUint8 } from '@conquestk/shared/utils/stableJson'
import { query } from '../config/database.js'
import { GameEngine } from '../game/gameEngine.js'
import type { GameAction, GameState, SerializedGameState } from '../types/game.js'
import { hydrateSerializedGameState, toSerializedGameState } from '../utils/serializeGameState.js'

const USAGE = 'Usage: npm run replay:match -- <matchId>'

async function loadInitialSnapshot(matchId: string): Promise<SerializedGameState | null> {
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

async function loadFrames(
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

async function loadLatestChecksum(matchId: string): Promise<{ seq: number; crc32: number } | null> {
  const checksums = await query<{ seq: number; crc32: number }>(
    `SELECT seq, crc32
     FROM match_checksums
     WHERE match_id = $1
     ORDER BY seq DESC
     LIMIT 1`,
    [matchId],
  )
  const row = checksums.rows[0]
  if (!row) {
    return null
  }
  return { seq: row.seq, crc32: row.crc32 }
}

async function replayMatch(matchId: string): Promise<void> {
  const initial = await loadInitialSnapshot(matchId)
  if (!initial) {
    console.error(`No snapshots available for match ${matchId}`)
    process.exitCode = 1
    return
  }

  let state: GameState = hydrateSerializedGameState(initial)
  const frames = await loadFrames(matchId)
  if (frames.length === 0) {
    console.warn(`No frames recorded for match ${matchId}; nothing to replay`)
    return
  }

  const engine = new GameEngine()
  for (const frame of frames) {
    for (const command of frame.commands) {
      const action = {
        type: command.kind,
        roomId: matchId,
        playerId: frame.playerId,
        payload: command.payload ?? {},
      } as GameAction
      const { gameState } = await engine.processAction(state, action)
      state = gameState
    }
  }

  const serialized = toSerializedGameState(state)
  const bytes = stableStringifyToUint8(serialized)
  const finalCrc = crc32(bytes)
  const checksum = await loadLatestChecksum(matchId)

  if (checksum) {
    const matches = checksum.crc32 === finalCrc
    console.info(
      `Final CRC ${finalCrc} (${matches ? 'matches' : 'differs from'}) stored checksum ${
        checksum.crc32
      } @ seq ${checksum.seq}`,
    )
    process.exitCode = matches ? 0 : 2
  } else {
    console.info(`Final CRC ${finalCrc} (no stored checksum to compare)`)
  }
}

const [, , matchId] = process.argv
if (!matchId) {
  console.error(USAGE)
  process.exitCode = 1
} else {
  replayMatch(matchId).catch((error) => {
    console.error('Replay failed:', error)
    process.exitCode = 1
  })
}
