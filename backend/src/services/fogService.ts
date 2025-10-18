import type { GameDelta } from '@conquestk/shared/types/delta'
import type { RemoteSocket, Server } from 'socket.io'
import type { GameState, GameTerritoryModifier, SerializedGameState } from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'
import { GameService } from './gameService.js'
import { deltaTransportMetrics, socketPayloadMetrics } from './metricsService.js'

const ROOM_PREFIX = 'game:'

function getViewerTeamId(state: GameState, viewerId: string): number | null {
  const p = state.players.find((pl) => pl.id === viewerId)
  return p?.teamId ?? null
}

export function computeVisibilityMask(state: GameState, viewerId: string): Set<string> {
  const allowTeam = state.gameConfig?.allowTeamPlay === true
  const viewerTeam = allowTeam ? getViewerTeamId(state, viewerId) : null

  const owned = new Set<string>()
  for (const t of state.board) {
    if (t.ownerId === viewerId) {
      owned.add(t.id)
    } else if (allowTeam && viewerTeam && viewerTeam > 0) {
      const owner = t.ownerId ? state.players.find((pl) => pl.id === t.ownerId) : null
      if (owner?.teamId && owner.teamId === viewerTeam) owned.add(t.id)
    }
  }
  const visible = new Set<string>(owned)
  for (const t of state.board) {
    if (!owned.has(t.id)) continue
    for (const adj of t.adjacentTerritories) visible.add(adj)
  }
  return visible
}

function filterDeltaForMask(delta: GameDelta, mask: Set<string>): GameDelta | null {
  if (delta.type === 'TERRITORY_UPDATE') {
    return mask.has(delta.territoryId) ? delta : null
  }

  if (delta.type === 'BATTLE_RESULT') {
    const fromId = delta.battleResult.fromTerritory.id
    const toId = delta.battleResult.toTerritory.id
    const fromVisible = mask.has(fromId)
    const toVisible = mask.has(toId)
    if (!fromVisible && !toVisible) {
      return null
    }
    const redacted = { ...delta, battleResult: { ...delta.battleResult } }
    if (!fromVisible) {
      redacted.battleResult.fromTerritory = {
        id: fromId,
        armies: 0,
      }
    }
    if (!toVisible) {
      redacted.battleResult.toTerritory = {
        id: toId,
        armies: 0,
        ownerId: undefined,
      }
    }
    // If there is a changes array (non-standard extension), filter it
    // biome-ignore lint/suspicious/noExplicitAny: handle optional extension
    const maybeAny: any = redacted
    if (Array.isArray(maybeAny.changes)) {
      maybeAny.changes = maybeAny.changes.filter(
        // biome-ignore lint/suspicious/noExplicitAny: shared union safe check
        (c: any) => c?.type !== 'TERRITORY_UPDATE' || mask.has(c.territoryId),
      )
    }
    return redacted
  }

  if (delta.type === 'PLAYER_UPDATE') {
    // Avoid leaking territories list via deltas; drop that field if present
    return {
      ...delta,
      changes: { ...delta.changes, territories: undefined },
    }
  }

  if ((delta as { type?: string }).type === 'FORTIFY_RESULT') {
    // biome-ignore lint/suspicious/noExplicitAny: union guard for custom type
    const fr = delta as any
    const fromVisible = mask.has(fr.fromTerritoryId)
    const toVisible = mask.has(fr.toTerritoryId)
    if (!fromVisible && !toVisible) {
      return null
    }
    return delta
  }

  // PHASE_CHANGE, GAME_END: not sensitive
  return delta
}

type SocketData = { userId?: string }

export async function emitFogFilteredDelta(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>,
  roomId: string,
  delta: GameDelta,
  state?: GameState,
): Promise<void> {
  const recordTransport = (
    event: 'game-delta' | 'game-delta-batch',
    audience: 'room' | 'socket',
    context: string,
    extra: Record<string, string> = {},
  ) => {
    deltaTransportMetrics.record(event, audience, {
      source: 'fog',
      context,
      ...extra,
    })
  }
  // Persist the raw delta into the replay ring buffer (best-effort)
  try {
    const { deltaBufferService } = await import('./deltaBufferService.js')
    await deltaBufferService.append(roomId, [delta])
  } catch {
    // best-effort only
  }
  // Fetch sockets in room
  const channel = `${ROOM_PREFIX}${roomId}`
  let sockets: Array<RemoteSocket<ServerToClientEvents, SocketData>>
  try {
    // fetchSockets is the preferred way
    sockets = await io.in(channel).fetchSockets()
  } catch {
    // Fallback: if the test/mocks don't implement .in().fetchSockets(), broadcast as-is
    try {
      const bytes = Buffer.byteLength(JSON.stringify(delta), 'utf8')
      socketPayloadMetrics.record('game-delta', bytes)
    } catch {
      /* metrics best-effort */
    }
    io.to(channel).emit('game-delta', delta)
    recordTransport('game-delta', 'room', 'fetchSockets-fallback', { fog: 'unknown' })
    return
  }

  // Get state if not provided
  const gameState = state ?? (await new GameService().getGameState(roomId))
  if (!gameState) {
    // Fallback: broadcast as-is
    try {
      const bytes = Buffer.byteLength(JSON.stringify(delta), 'utf8')
      socketPayloadMetrics.record('game-delta', bytes)
    } catch {
      /* metrics best-effort */
    }
    io.to(channel).emit('game-delta', delta)
    recordTransport('game-delta', 'room', 'missing-state', { fog: 'unknown' })
    return
  }

  const fogMode =
    (gameState.gameConfig as { fogOfWar?: 'off' | 'adjacent' | 'persistent' } | undefined)
      ?.fogOfWar ?? 'off'

  if (fogMode === 'off') {
    try {
      const bytes = Buffer.byteLength(JSON.stringify(delta), 'utf8')
      socketPayloadMetrics.record('game-delta', bytes)
    } catch {
      /* metrics best-effort */
    }
    io.to(channel).emit('game-delta', delta)
    recordTransport('game-delta', 'room', 'broadcast', { fog: fogMode })
    return
  }

  // Compute masks per viewer and emit filtered deltas
  for (const s of sockets) {
    const viewerId = s.data?.userId
    if (!viewerId) {
      // Fallback: if viewer identity is missing, emit unfiltered delta to avoid silent drops
      try {
        const bytes = Buffer.byteLength(JSON.stringify(delta), 'utf8')
        socketPayloadMetrics.record('game-delta', bytes)
      } catch {
        /* metrics best-effort */
      }
      io.to(s.id).emit('game-delta', delta)
      recordTransport('game-delta', 'socket', 'missing-viewer', { fog: fogMode })
      continue
    }
    const mask = computeVisibilityMask(gameState, viewerId)
    const filtered = filterDeltaForMask(delta, mask)
    if (filtered) {
      try {
        const bytes = Buffer.byteLength(JSON.stringify(filtered), 'utf8')
        socketPayloadMetrics.record('game-delta', bytes)
      } catch {
        /* metrics best-effort */
      }
      io.to(s.id).emit('game-delta', filtered)
      recordTransport('game-delta', 'socket', 'filtered', { fog: fogMode })
    }
  }
}

export function filterFullStateForViewer(state: GameState, viewerId: string): GameState {
  const fogMode = (state.gameConfig as { fogOfWar?: 'off' | 'adjacent' | 'persistent' })?.fogOfWar
  const fogEnabled = fogMode && fogMode !== 'off'
  if (!fogEnabled) return state
  const mask = computeVisibilityMask(state, viewerId)
  return {
    ...state,
    board: state.board.map((t) => (mask.has(t.id) ? t : { ...t, ownerId: null, armies: 0 })),
  }
}

// For AI planner: filter the game state so the AI only sees what the viewer would see under fog.
// Currently identical to filterFullStateForViewer, but split for future planner-specific tweaks
// (e.g., hiding opponent treasure counts or pending effects if needed).
export function filterStateForPlanner(state: GameState, viewerId: string): GameState {
  return filterFullStateForViewer(state, viewerId)
}

function hasMapTerritoryModifiers(
  s: GameState | SerializedGameState,
): s is GameState & { territoryModifiers: Map<string, GameTerritoryModifier> } {
  return Boolean(
    s &&
      typeof s === 'object' &&
      'territoryModifiers' in s &&
      (s as GameState).territoryModifiers instanceof Map,
  )
}

function serializeForClient(state: GameState | SerializedGameState): SerializedGameState {
  const s = state as GameState
  const roundNumber = (() => {
    try {
      const active = Math.max(
        1,
        s.players.filter((p) => !p.isEliminated).length || s.players.length || 1,
      )
      return Math.max(1, Math.ceil(Math.max(1, s.turn) / active))
    } catch {
      return Math.max(1, (s as { turn?: number }).turn ?? 1)
    }
  })()

  if (hasMapTerritoryModifiers(state)) {
    const { territoryModifiers, ...rest } = state
    const obj = Object.fromEntries(territoryModifiers.entries())
    return { ...(rest as SerializedGameState), territoryModifiers: obj, roundNumber }
  }
  return { ...(state as SerializedGameState), roundNumber }
}

export async function emitRevealSnapshot(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>,
  roomId: string,
  viewerId: string,
  state?: GameState,
): Promise<void> {
  const channel = `${ROOM_PREFIX}${roomId}`
  let sockets: Array<RemoteSocket<ServerToClientEvents, SocketData>>
  try {
    sockets = await io.in(channel).fetchSockets()
  } catch {
    return
  }

  const target = sockets.find((s) => s.data?.userId === viewerId)
  if (!target) return

  const gameState = state ?? (await new GameService().getGameState(roomId))
  if (!gameState) return

  const filtered = filterFullStateForViewer(gameState, viewerId)
  const serialized = serializeForClient(filtered)
  try {
    const bytes = Buffer.byteLength(JSON.stringify(serialized), 'utf8')
    socketPayloadMetrics.record('game:snapshot', bytes)
    if (socketPayloadMetrics.shouldLog('game:snapshot')) {
      const stats = socketPayloadMetrics.snapshot('game:snapshot')
      if (stats) {
        logger.info('Socket payload stats', {
          event: 'game:snapshot',
          windowCount: stats.count,
          p50Bytes: stats.p50,
          p95Bytes: stats.p95,
          maxBytes: stats.max,
        })
      }
    }
  } catch {
    // best-effort metrics only
  }
  io.to(target.id).emit('game:snapshot', serialized)
}
