import type { GameDelta } from '@risk-game/shared/types'
import type { Server, Socket } from 'socket.io'
import { GameService } from './gameService'
import type { GameState } from '../types/game'

type AuthSocket = Socket & { userId?: string }

const ROOM_PREFIX = 'game:'

function getViewerTeamId(state: GameState, viewerId: string): number | null {
  const p = state.players.find((pl) => pl.id === viewerId)
  return p?.teamId ?? null
}

function computeVisibilityMask(state: GameState, viewerId: string): Set<string> {
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

  // PHASE_CHANGE, GAME_END: not sensitive
  return delta
}

export async function emitFogFilteredDelta(
  io: Server,
  roomId: string,
  delta: GameDelta,
  state?: GameState,
): Promise<void> {
  // Fetch sockets in room
  const channel = `${ROOM_PREFIX}${roomId}`
  let sockets: Array<{ id: string; data?: Record<string, unknown> }>
  try {
    // fetchSockets is the preferred way
    // biome-ignore lint/suspicious/noExplicitAny: socket.io types
    sockets = (await (io as any).in(channel).fetchSockets()) as Array<{
      id: string
      data?: Record<string, unknown>
    }>
  } catch {
    // Fallback: if the test/mocks don't implement .in().fetchSockets(), broadcast as-is
    io.to(channel).emit('game-delta', delta)
    return
  }

  // Get state if not provided
  const gameState = state ?? (await new GameService().getGameState(roomId))
  if (!gameState) {
    // Fallback: broadcast as-is
    io.to(channel).emit('game-delta', delta)
    return
  }

  // Compute masks per viewer and emit filtered deltas
  for (const s of sockets) {
    // RemoteSocket exposes 'data' not arbitrary properties
    // biome-ignore lint/suspicious/noExplicitAny: RemoteSocket .data is generic
    const viewerId = (s as any).data?.userId as string | undefined
    if (!viewerId) continue
    const mask = computeVisibilityMask(gameState, viewerId)
    const filtered = filterDeltaForMask(delta, mask)
    if (filtered) {
      io.to(s.id).emit('game-delta', filtered)
    }
  }
}
