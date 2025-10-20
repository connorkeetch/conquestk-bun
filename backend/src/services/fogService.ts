import type { RemoteSocket, Server } from 'socket.io'
import type { GameState, GameTerritoryModifier, SerializedGameState } from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'
import { GameService } from './gameService.js'
import { socketPayloadMetrics } from './metricsService.js'

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

type SocketData = { userId?: string }

export async function emitFogFilteredDelta(
  _io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>,
  roomId: string,
  _delta: unknown,
  _state?: GameState,
): Promise<void> {
  logger.debug('Skipping legacy game-delta emission', { roomId })
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
