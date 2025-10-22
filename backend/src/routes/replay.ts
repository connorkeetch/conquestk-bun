/**
 * @fileoverview This file defines the Express routes for fetching game replay data.
 * It includes endpoints for retrieving a replay summary, chunks of replay data by turn, and individual replay frames.
 * Access to replays is controlled to ensure that only authorized users can view them.
 * @module routes/replay
 */
import crypto from 'node:crypto'
import { Router } from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { getReplayFrameChunk, getReplayInitialSnapshot } from '../services/replayFrameService.js'
import { logger } from '../utils/logger.js'

const router = Router()

/**
 * Checks if a user is authorized to view a game replay.
 * A user can view a replay if the game is public, if they were a participant in the game, or if they are the host.
 * @param {string} gameId - The ID of the game.
 * @param {string | null | undefined} viewerId - The ID of the user attempting to view the replay.
 * @returns {Promise<boolean>} A promise that resolves to true if the user is authorized, and false otherwise.
 */
async function canViewReplay(gameId: string, viewerId?: string | null): Promise<boolean> {
  try {
    const res = await query<{
      is_private: boolean | null
      host_id: string | null
    }>(`SELECT is_private, host_id FROM game_rooms WHERE id = $1`, [gameId])
    if (res.rows.length === 0) return false
    const row = res.rows[0]
    if (row.is_private === false) return true
    if (!viewerId) return false
    // Participant check
    const member = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM room_players WHERE room_id = $1 AND (user_id = $2 OR ai_player_id = $2)`,
      [gameId, viewerId],
    )
    const isMember = Number(member.rows[0]?.count ?? 0) > 0
    if (isMember) return true
    // Host can always view
    return row.host_id === viewerId
  } catch (e) {
    logger.warn('Replay access check failed', {
      roomId: gameId,
      error: e instanceof Error ? e.message : String(e),
    })
    return false
  }
}

/**
 * Route to get a summary of a game replay.
 * This includes metadata about the game, such as the players, number of turns, and game options.
 * @name GET /replay/:id/replay/summary
 * @function
 * @memberof module:routes/replay
 * @param {import('express').Request} req - The Express request object, with the game ID as a URL parameter.
 * @param {import('express').Response} res - The Express response object, returning the replay summary.
 * @returns {Promise<import('express').Response>}
 */
router.get('/:id/replay/summary', authenticateToken, async (req, res) => {
  try {
    const gameId = String(req.params.id)
    const viewerId = (req as unknown as { userId?: string }).userId ?? null

    // Verify access
    const allowed = await canViewReplay(gameId, viewerId)
    if (!allowed) return res.status(403).json({ error: 'Not authorized to view this replay' })

    // Load basic game metadata
    const gameRow = await query<{
      id: string
      status: string | null
      game_mode: string | null
      fog_of_war: string | null
      is_private: boolean | null
      started_at: Date | null
      ended_at: Date | null
      map_id: string | null
    }>(
      `SELECT id, status, game_mode, fog_of_war, is_private, started_at, ended_at, map_id
         FROM game_rooms WHERE id = $1`,
      [gameId],
    )
    if (gameRow.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' })
    }
    const g = gameRow.rows[0]

    // Load players
    const playersRes = await query<{
      user_id: string | null
      ai_player_id: string | null
      username: string | null
      color: string | null
    }>(
      `SELECT rp.user_id, rp.ai_player_id, u.username, rp.selected_color AS color
         FROM room_players rp
    LEFT JOIN users u ON u.id = rp.user_id
        WHERE rp.room_id = $1
        ORDER BY rp.joined_at ASC`,
      [gameId],
    )
    const players = playersRes.rows.map((r) => ({
      id: (r.user_id || r.ai_player_id || '') as string,
      username: (r.username || 'AI') as string,
      color: r.color ?? undefined,
    }))
    const playerCount = players.length

    // Determine total turns using turn_stats if available; fallback to max turn_number in logs
    let turns = 0
    try {
      const statsRes = await query<{ turn_stats: unknown }>(
        `SELECT turn_stats FROM game_states WHERE room_id = $1`,
        [gameId],
      )
      const arr = Array.isArray(statsRes.rows[0]?.turn_stats)
        ? (statsRes.rows[0]?.turn_stats as Array<{ turn?: number }>)
        : []
      if (arr.length > 0) {
        turns = Math.max(...arr.map((s) => Math.max(1, Number(s.turn ?? 1))))
      }
    } catch {
      // ignore
    }
    if (!turns || !Number.isFinite(turns)) {
      const maxTurn = await query<{ max: number | null }>(
        `SELECT MAX(turn_number) as max FROM game_logs WHERE game_id = $1`,
        [gameId],
      )
      turns = Number(maxTurn.rows[0]?.max ?? 0)
    }
    turns = Math.max(0, Math.trunc(turns))
    const rounds = playerCount > 0 ? Math.ceil(turns / playerCount) : 0

    // Build summary payload
    const summary = {
      rounds,
      turns,
      players,
      hasFog: Boolean(g.fog_of_war && g.fog_of_war !== 'off'),
      mode: g.game_mode ?? 'classic',
      options: {
        fogOfWar: g.fog_of_war ?? 'off',
        mapId: g.map_id ?? null,
        isPrivate: g.is_private === true,
      },
      createdAt: g.started_at ? new Date(g.started_at).toISOString() : null,
      completedAt: g.ended_at ? new Date(g.ended_at).toISOString() : null,
    }

    // ETag: based on last persisted game state
    let etag: string | null = null
    try {
      const s = await query<{ game_data: unknown }>(
        `SELECT game_data FROM game_states WHERE room_id = $1`,
        [gameId],
      )
      const json = JSON.stringify(s.rows[0]?.game_data ?? {})
      etag = `W/"${crypto.createHash('sha256').update(json).digest('hex').slice(0, 16)}"`
    } catch {
      // best-effort
    }
    if (etag) res.setHeader('ETag', etag)

    return res.json(summary)
  } catch (error) {
    logger.error('Replay summary error', { error: error instanceof Error ? error.message : error })
    return res.status(500).json({ error: 'Failed to load replay summary' })
  }
})

/**
 * Route to get a chunk of replay data for a specified range of turns.
 * This includes game logs and state snapshots to reconstruct the game state for the given turns.
 * @name GET /replay/:id/replay/chunk
 * @function
 * @memberof module:routes/replay
 * @param {import('express').Request} req - The Express request object, with the game ID and turn range as parameters.
 * @param {import('express').Response} res - The Express response object, returning the replay data chunk.
 * @returns {Promise<import('express').Response>}
 */
router.get('/:id/replay/chunk', authenticateToken, async (req, res) => {
  try {
    const gameId = String(req.params.id)
    const viewerId = (req as unknown as { userId?: string }).userId ?? null
    const allowed = await canViewReplay(gameId, viewerId)
    if (!allowed) return res.status(403).json({ error: 'Not authorized to view this replay' })

    const fromTurn = Math.max(1, Number(req.query.fromTurn ?? 1))
    const toTurn = Math.max(fromTurn, Number(req.query.toTurn ?? fromTurn + 24))
    const maxSpan = Math.min(100, toTurn - fromTurn + 1)

    // Load logs for the window
    const logs = await query<{
      turn_number: number
      move_type: string
      actor_id: string | null
      from_territory_id: string | null
      to_territory_id: string | null
      payload: unknown
      ts: Date
    }>(
      `SELECT turn_number, move_type, actor_id, from_territory_id, to_territory_id, payload, ts
         FROM game_logs
        WHERE game_id = $1 AND turn_number BETWEEN $2 AND $3
        ORDER BY ts ASC`,
      [gameId, fromTurn, fromTurn + maxSpan - 1],
    )

    // Load snapshots around window edges for pre/post maps
    const snaps = await query<{
      turn_number: number
      phase: string
      snapshot: unknown
      created_at: Date
    }>(
      `SELECT turn_number, phase, snapshot, created_at
         FROM game_state_snapshots
        WHERE room_id = $1 AND turn_number BETWEEN $2 AND $3
        ORDER BY turn_number ASC, created_at ASC`,
      [gameId, Math.max(1, fromTurn - 1), fromTurn + maxSpan],
    )

    // Helper to extract army map from a snapshot row
    const extractArmyMap = (
      snap: unknown,
    ): Record<string, { ownerId: string | null; armies: number }> => {
      try {
        const s = snap as {
          board?: Array<{ id: string; ownerId?: string | null; armies?: number }>
        }
        const board = Array.isArray(s?.board) ? s?.board : []
        const map: Record<string, { ownerId: string | null; armies: number }> = {}
        for (const t of board) {
          if (!t || typeof t !== 'object') continue
          const id = String((t as { id?: string }).id || '')
          if (!id) continue
          map[id] = {
            ownerId: (t as { ownerId?: string | null }).ownerId ?? null,
            armies: Number((t as { armies?: number }).armies || 0),
          }
        }
        return map
      } catch {
        return {}
      }
    }

    // Build per-turn aggregates from logs
    const byTurn = new Map<number, Array<(typeof logs.rows)[number]>>()
    for (const row of logs.rows) {
      const arr = byTurn.get(row.turn_number) ?? []
      arr.push(row)
      byTurn.set(row.turn_number, arr)
    }

    // No legacy structured log; count awards from game_logs rows we already loaded per turn

    // Snapshots map: first reinforcement snapshot per turn and start-of-next-turn
    const firstReinforcementByTurn = new Map<number, ReturnType<typeof extractArmyMap>>()
    const startOfNextTurnMap = new Map<number, ReturnType<typeof extractArmyMap>>()
    for (const s of snaps.rows) {
      if (s.phase === 'reinforcement') {
        const m = extractArmyMap(s.snapshot)
        // Earliest reinforcement for turn T is the pre-state of T
        if (!firstReinforcementByTurn.has(s.turn_number)) {
          firstReinforcementByTurn.set(s.turn_number, m)
        }
        // Also treat reinforcement at turn T as the post-state of T-1
        const prev = s.turn_number - 1
        if (prev >= 1 && !startOfNextTurnMap.has(prev)) {
          startOfNextTurnMap.set(prev, m)
        }
      }
    }

    // For each requested turn, compute stats and phase summary
    const items: Array<{
      turnNumber: number
      roundNumber: number
      playerId: string | null
      phases: Array<'reinforce' | 'attack' | 'fortify'>
      deltas: import('@conquestk/shared/types/delta').GameDelta[]
      paths: Array<{ from: string; to: string; kind: 'attack' | 'fortify' }>
      stats: {
        conquered: number
        lost: number
        armiesLost: number
        armiesKilled: number
        treasuresDrawn: number
        treasuresRedeemed: number
        treasurePayout: number
      }
      preArmyMap?: Record<string, { ownerId: string | null; armies: number }>
      postArmyMap?: Record<string, { ownerId: string | null; armies: number }>
    }> = []

    // Determine player ordering for round math
    const playersRes = await query<{ user_id: string | null; ai_player_id: string | null }>(
      `SELECT user_id, ai_player_id FROM room_players WHERE room_id = $1 ORDER BY joined_at ASC`,
      [gameId],
    )
    const playerIds = playersRes.rows.map((r) => (r.user_id || r.ai_player_id || '') as string)
    const playerCount = playerIds.length

    for (let t = fromTurn; t <= fromTurn + maxSpan - 1; t++) {
      const moves = byTurn.get(t) ?? []
      if (moves.length === 0) continue
      const phases: Array<'reinforce' | 'attack' | 'fortify'> = []
      let actor: string | null = null
      let conquered = 0
      const lost = 0
      let armiesLost = 0
      let armiesKilled = 0
      let treasuresDrawn = 0
      let treasuresRedeemed = 0
      let treasurePayout = 0

      const deltas: import('@conquestk/shared/types/delta').GameDelta[] = []
      const paths: Array<{ from: string; to: string; kind: 'attack' | 'fortify' }> = []
      let startTs: Date | null = null
      let endTs: Date | null = null
      for (const m of moves) {
        const kind = String(m.move_type)
        if (!startTs || m.ts < startTs) startTs = m.ts
        if (!endTs || m.ts > endTs) endTs = m.ts
        // Actor: prefer start_turn for the first seen actor
        if (
          !actor &&
          (kind === 'start_turn' || kind === 'reinforce' || kind === 'attack' || kind === 'fortify')
        ) {
          actor = m.actor_id
        }
        if (kind === 'reinforce' && !phases.includes('reinforce')) phases.push('reinforce')
        if (kind === 'attack' && !phases.includes('attack')) phases.push('attack')
        if (kind === 'fortify' && !phases.includes('fortify')) phases.push('fortify')
        if (kind === 'attack') {
          const p = (m.payload || {}) as {
            kills?: number
            losses?: number
            fromId?: string
            toId?: string
          }
          armiesKilled += Math.max(0, Number(p.kills || 0))
          armiesLost += Math.max(0, Number(p.losses || 0))
          const aFrom = (m.from_territory_id || p.fromId || '') as string
          const aTo = (m.to_territory_id || p.toId || '') as string
          if (aFrom && aTo) paths.push({ from: aFrom, to: aTo, kind: 'attack' })
        }
        if (kind === 'conquer') {
          const toId = (m.to_territory_id ||
            (m.payload as { toId?: string } | null)?.toId ||
            null) as string | null
          // Conquest attributed to current actor
          conquered += 1
          // Derive a minimal territory update delta for overlay
          if (toId) {
            deltas.push({
              type: 'TERRITORY_UPDATE',
              roomId: gameId,
              timestamp: Date.now(),
              territoryId: toId,
              changes: { ownerId: actor || undefined },
            } as import('@conquestk/shared/types/delta').TerritoryDelta)
          }
        }
        if (kind === 'fortify') {
          const p = (m.payload || {}) as { fromId?: string; toId?: string; armies?: number }
          if (p.fromId && p.toId && typeof p.armies === 'number') {
            deltas.push({
              type: 'FORTIFY_RESULT',
              roomId: gameId,
              timestamp: Date.now(),
              fromTerritoryId: p.fromId,
              toTerritoryId: p.toId,
              movedArmies: Number(p.armies || 0),
              fromArmies: 0,
              toArmies: 0,
              playerId: actor || '',
            } as import('@conquestk/shared/types/delta').FortifyResultDelta)
            paths.push({ from: p.fromId, to: p.toId, kind: 'fortify' })
          }
        }
        if (kind === 'trade_cards') {
          const p = (m.payload || {}) as { cardCount?: number; bonus?: number }
          treasuresRedeemed += Math.max(0, Number(p.cardCount || 0))
          treasurePayout += Math.max(0, Number(p.bonus || 0))
        }
      }

      // Count treasure awards in this time window from game_logs (move_type: 'card_award')
      try {
        if (startTs && endTs) {
          const startN = startTs.getTime()
          const endN = endTs.getTime()
          const rows = byTurn.get(t) ?? []
          treasuresDrawn = rows.filter((r) => {
            if (String(r.move_type) !== 'card_award') return false
            const ts = r.ts ? new Date(String(r.ts)).getTime() : NaN
            return Number.isFinite(ts) && ts >= startN && ts <= endN
          }).length
        }
      } catch {
        // ignore
      }

      // Derive lost territories for actor by scanning opponents' conquests in the same turn
      // Note: usually zero for own turn; this is defensive
      for (const m of moves) {
        if (m.move_type === 'conquer') {
          const _toId = (m.to_territory_id ||
            (m.payload as { toId?: string } | null)?.toId ||
            null) as string | null
          const _payload = (m.payload || {}) as { toOwnerName?: string }
          // We do not have defender id in textual logs; approximate with post snapshots later
          // Leave lost as zero for now; frontend can compute precise diffs from pre/post maps
        }
      }

      const preArmyMap = firstReinforcementByTurn.get(t)
      const postArmyMap = startOfNextTurnMap.get(t) ?? firstReinforcementByTurn.get(t + 1)

      const roundNumber = playerCount > 0 ? Math.ceil(t / playerCount) : 1

      items.push({
        turnNumber: t,
        roundNumber,
        playerId: actor,
        phases,
        deltas,
        paths,
        stats: {
          conquered,
          lost,
          armiesLost,
          armiesKilled,
          treasuresDrawn,
          treasuresRedeemed,
          treasurePayout,
        },
        ...(preArmyMap ? { preArmyMap } : {}),
        ...(postArmyMap ? { postArmyMap } : {}),
      })
    }

    // ETag based on last game state hash like in summary
    try {
      const s = await query<{ game_data: unknown }>(
        `SELECT game_data FROM game_states WHERE room_id = $1`,
        [gameId],
      )
      const json = JSON.stringify(s.rows[0]?.game_data ?? {})
      const etag = `W/"${crypto.createHash('sha256').update(json).digest('hex').slice(0, 16)}"`
      res.setHeader('ETag', etag)
    } catch {
      // ignore
    }

    // Basic compression hint
    res.setHeader('Content-Type', 'application/json')
    return res.json(items)
  } catch (error) {
    logger.error('Replay chunk error', { error: error instanceof Error ? error.message : error })
    return res.status(500).json({ error: 'Failed to load replay chunk' })
  }
})

/**
 * Route to get a sequence of replay frames.
 * This is used for a more granular, frame-by-frame replay playback.
 * @name GET /replay/:id/replay/frames
 * @function
 * @memberof module:routes/replay
 * @param {import('express').Request} req - The Express request object, with the game ID and pagination parameters (`fromSeq`, `limit`).
 * @param {import('express').Response} res - The Express response object, returning the replay frames.
 * @returns {Promise<import('express').Response>}
 */
router.get('/:id/replay/frames', authenticateToken, async (req, res) => {
  try {
    const gameId = String(req.params.id)
    const viewerId = (req as unknown as { userId?: string }).userId ?? null
    const allowed = await canViewReplay(gameId, viewerId)
    if (!allowed) return res.status(403).json({ error: 'Not authorized to view this replay' })

    const includeSnapshot = String(req.query.includeSnapshot ?? '').toLowerCase() === 'true'
    const limitParam = Number(req.query.limit ?? 50)
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(200, Math.trunc(limitParam)))
      : 50
    const fromParam = Number(req.query.fromSeq ?? 1)
    const fromSeq = Number.isFinite(fromParam) ? Math.max(1, Math.trunc(fromParam)) : 1
    const toSeq = fromSeq + limit - 1

    const [{ frames, finalSeq, totalFrames }, snapshot] = await Promise.all([
      getReplayFrameChunk(gameId, fromSeq, toSeq),
      includeSnapshot ? getReplayInitialSnapshot(gameId) : Promise.resolve(null),
    ])

    const lastSeq =
      frames.length > 0 ? (frames[frames.length - 1]?.seq ?? fromSeq - 1) : fromSeq - 1
    const hasMore = finalSeq > lastSeq
    const nextSeq = hasMore ? lastSeq + 1 : null

    return res.json({
      ok: true,
      data: {
        snapshot: includeSnapshot ? snapshot : undefined,
        frames,
        fromSeq,
        toSeq: lastSeq,
        finalSeq,
        totalFrames,
        nextSeq,
        hasMore,
      },
    })
  } catch (error) {
    logger.error('Replay frame window error', {
      matchId: req.params.id,
      error: error instanceof Error ? error.message : error,
    })
    return res.status(500).json({ error: 'Failed to load replay frames' })
  }
})

export default router
