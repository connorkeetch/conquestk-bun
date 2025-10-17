import process from 'node:process'
import { crc32 } from '@conquestk/shared/utils/crc32'
import { stableStringifyToUint8 } from '@conquestk/shared/utils/stableJson'
import { query } from '../config/database.js'
import { GameEngine } from '../game/gameEngine.js'
import type { GameAction, GameState } from '../types/game.js'
import { hydrateSerializedGameState, toSerializedGameState } from '../utils/serializeGameState.js'
import { loadFrames, loadInitialSnapshot } from './replayHelpers.js'

const USAGE = 'Usage: npm run replay:match -- <matchId>'

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
