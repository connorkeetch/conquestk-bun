import type { GameDelta } from '@conquestk/shared/types/delta'
import type { RemoteSocket, Server } from 'socket.io'
import type { GameState } from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { computeVisibilityMask } from './fogService.js'
import { GameService } from './gameService.js'
import { type DbMove, type FogView, renderLogText } from './logEmitter.js'
import { socketPayloadMetrics } from './metricsService.js'

type SocketData = { userId?: string }

export async function emitCombined(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>,
  roomId: string,
  payload: { deltas?: GameDelta[]; moves?: DbMove[] },
  state?: GameState,
): Promise<void> {
  const gameChannel = `game:${roomId}`
  const deltas = Array.isArray(payload.deltas) ? payload.deltas : []
  const moves = Array.isArray(payload.moves) ? payload.moves : []

  let sockets: Array<RemoteSocket<ServerToClientEvents, SocketData>> = []
  try {
    sockets = await io.in(gameChannel).fetchSockets()
  } catch {
    // Fallback broadcast without fog filtering
    if (deltas.length === 1) io.to(gameChannel).emit('game-delta', deltas[0])
    else if (deltas.length > 1) io.to(gameChannel).emit('game-delta-batch', deltas)
    for (const m of moves) {
      const base = {
        id: String(m.id),
        t: new Date(m.created_at).toISOString(),
        turn: m.turn_number,
        phase: m.phase,
        kind: m.move_type,
        actor: { id: m.actor_id, name: (m.payload?.actorName as string) ?? 'Unknown' },
        text: renderLogText(m, {
          canSeeFrom: true,
          canSeeTo: true,
          showCounts: true,
          fogActive: false,
        }),
      }
      io.to(gameChannel).emit('game-log:append', base)
    }
    return
  }

  const gameState = state ?? (await new GameService().getGameState(roomId))
  const fogMode =
    (gameState?.gameConfig as { fogOfWar?: 'off' | 'adjacent' | 'persistent' } | undefined)
      ?.fogOfWar ?? 'off'
  const fogEnabled = fogMode !== 'off' && gameState?.phase !== 'finished'

  // Local delta filter mirroring fogService logic
  const filterDeltaForMask = (delta: GameDelta, mask: Set<string>): GameDelta | null => {
    if ((delta as { type?: string }).type === 'TERRITORY_UPDATE') {
      const d = delta as unknown as { territoryId: string }
      return mask.has(d.territoryId) ? delta : null
    }
    if ((delta as { type?: string }).type === 'BATTLE_RESULT') {
      const d = delta as unknown as {
        battleResult: {
          fromTerritory: { id: string; armies: number }
          toTerritory: { id: string; armies: number; ownerId?: string }
        }
        changes?: Array<{ type?: string; territoryId?: string }>
      }
      const fromId = d.battleResult.fromTerritory.id
      const toId = d.battleResult.toTerritory.id
      const fromVisible = mask.has(fromId)
      const toVisible = mask.has(toId)
      if (!fromVisible && !toVisible) return null
      const redacted: typeof d = { ...d, battleResult: { ...d.battleResult } }
      if (!fromVisible) redacted.battleResult.fromTerritory = { id: fromId, armies: 0 }
      if (!toVisible)
        redacted.battleResult.toTerritory = { id: toId, armies: 0, ownerId: undefined }
      if (Array.isArray(redacted.changes)) {
        redacted.changes = redacted.changes.filter(
          (c) => c?.type !== 'TERRITORY_UPDATE' || (c.territoryId ? mask.has(c.territoryId) : true),
        )
      }
      return redacted as unknown as GameDelta
    }
    if ((delta as { type?: string }).type === 'PLAYER_UPDATE') {
      const d = delta as unknown as { changes: Record<string, unknown> }
      return {
        ...(delta as object),
        changes: { ...d.changes, territories: undefined },
      } as GameDelta
    }
    if ((delta as { type?: string }).type === 'FORTIFY_RESULT') {
      const d = delta as unknown as { fromTerritoryId: string; toTerritoryId: string }
      const fromVisible = mask.has(d.fromTerritoryId)
      const toVisible = mask.has(d.toTerritoryId)
      if (!fromVisible && !toVisible) return null
      return delta
    }
    return delta
  }

  for (const s of sockets) {
    const viewerId = s.data?.userId
    if (!viewerId) continue
    let mask: Set<string> | null = null
    if (fogEnabled && gameState) mask = computeVisibilityMask(gameState, viewerId)

    // Emit deltas (filtered per viewer)
    if (deltas.length > 0) {
      const filtered: GameDelta[] = []
      for (const d of deltas) {
        const f = mask ? filterDeltaForMask(d, mask) : d
        if (f) filtered.push(f)
      }
      if (filtered.length === 1) {
        try {
          const bytes = Buffer.byteLength(JSON.stringify(filtered[0]), 'utf8')
          socketPayloadMetrics.record('game-delta', bytes)
        } catch {
          // metrics best-effort
        }
        io.to(s.id).emit('game-delta', filtered[0])
      } else if (filtered.length > 1) {
        try {
          const bytes = Buffer.byteLength(JSON.stringify(filtered), 'utf8')
          socketPayloadMetrics.record('game-delta', bytes)
        } catch {
          // metrics best-effort
        }
        io.to(s.id).emit('game-delta-batch', filtered)
      }
    }

    // Emit log text moves (fog-aware)
    for (const m of moves) {
      const p = m.payload || {}
      const fromId =
        (p.fromId as string | undefined) || (p.attackingTerritoryId as string | undefined)
      const toId =
        (p.toId as string | undefined) ||
        (p.defendingTerritoryId as string | undefined) ||
        (p.territoryId as string | undefined)
      const fog: FogView =
        fogEnabled && mask
          ? {
              canSeeFrom: fromId ? mask.has(fromId) : false,
              canSeeTo: toId ? mask.has(toId) : false,
              showCounts: (fromId ? mask.has(fromId) : false) && (toId ? mask.has(toId) : false),
              fogActive: true,
            }
          : { canSeeFrom: true, canSeeTo: true, showCounts: true, fogActive: false }
      const base = {
        id: String(m.id),
        t: new Date(m.created_at).toISOString(),
        turn: m.turn_number,
        phase: m.phase,
        kind: m.move_type,
        actor: { id: m.actor_id, name: (m.payload?.actorName as string) ?? 'Unknown' },
        text: renderLogText(m, fog),
      }
      io.to(s.id).emit('game-log:append', base)
    }
  }
}
