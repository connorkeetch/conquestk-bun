import type { InputFrame, LockstepCommand, TickChecksum } from '@conquestk/shared/types/lockstep'
import { crc32 } from '@conquestk/shared/utils/crc32'
import { stableStringifyToUint8 } from '@conquestk/shared/utils/stableJson'
import type { PoolClient } from 'pg'
import { query } from '../config/database.js'
import type { GameAction, SerializedGameState } from '../types/game.js'

const CHECKSUM_INTERVAL_DEFAULT = 5

export class LockstepService {
  private readonly checksumInterval: number

  private readonly seqCache = new Map<string, number>()

  constructor(checksumInterval?: number) {
    const envInterval = Number(process.env.LOCKSTEP_CHECKSUM_INTERVAL ?? '')
    this.checksumInterval =
      Number.isFinite(envInterval) && envInterval > 0
        ? envInterval
        : (checksumInterval ?? CHECKSUM_INTERVAL_DEFAULT)
  }

  async reset(matchId: string, client?: PoolClient): Promise<void> {
    this.seqCache.delete(matchId)
    await query('DELETE FROM match_frames WHERE match_id = $1', [matchId], { client })
    await query('DELETE FROM match_checksums WHERE match_id = $1', [matchId], { client })
  }

  private async nextSeq(matchId: string, client?: PoolClient): Promise<number> {
    const cached = this.seqCache.get(matchId)
    if (cached !== undefined) {
      const next = cached + 1
      this.seqCache.set(matchId, next)
      return next
    }
    const result = await query<{ seq: number }>(
      'SELECT seq FROM match_frames WHERE match_id = $1 ORDER BY seq DESC LIMIT 1',
      [matchId],
      { client },
    )

    const lastSeq = result.rows[0]?.seq ?? 0

    const next = lastSeq + 1
    this.seqCache.set(matchId, next)
    return next
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

  async recordFrame(params: {
    matchId: string
    playerId: string
    action: GameAction
    state: SerializedGameState
    client?: PoolClient
  }): Promise<{ frame: InputFrame; checksum?: TickChecksum }> {
    const { matchId, playerId, action, state, client } = params
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

    await query(
      `INSERT INTO match_frames (match_id, seq, player_id, commands, committed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [matchId, seq, playerId, JSON.stringify(commands), committedAt],
      { client },
    )

    if (seq % this.checksumInterval !== 0) {
      return { frame }
    }

    const bytes = stableStringifyToUint8(state)
    const checksumValue = crc32(bytes)
    const computedAt = committedAt
    const snapshotBuffer = Buffer.from(bytes)

    const checksum: TickChecksum = {
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

    return { frame, checksum }
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
