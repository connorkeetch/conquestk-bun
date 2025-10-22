import type { BroadcastOperator, RemoteSocket, Server } from 'socket.io'
import type { GameState } from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { computeVisibilityMask } from './fogService.js'
import { GameService } from './gameService.js'
import { collectPlayerRefs, type DbMove, type FogView, renderLogText } from './logEmitter.js'

type SocketData = { userId?: string }

/**
 * Emits a combined set of game log moves to all clients in a room, taking
 * into account fog of war for each player.
 *
 * @param {Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>} io - The Socket.io server instance.
 * @param {string} roomId - The ID of the room to emit the moves to.
 * @param {{ moves?: DbMove[]; }} payload - The payload containing the moves to emit.
 * @param {GameState} [state] - Optional game state. If not provided, it will be fetched from the database.
 */
export async function emitCombined(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>,
  roomId: string,
  payload: { moves?: DbMove[] },
  state?: GameState,
): Promise<void> {
  const BATCH_THRESHOLD = Number.parseInt(process.env.LOG_TEXT_BATCH_THRESHOLD || '2', 10)
  const moves = Array.isArray(payload.moves) ? payload.moves : []

  if (moves.length === 0) {
    return
  }

  const gameChannel = `game:${roomId}`
  let sockets: Array<RemoteSocket<ServerToClientEvents, SocketData>> = []
  try {
    sockets = await io.in(gameChannel).fetchSockets()
  } catch {
    sockets = []
  }

  const gameState = state ?? (await new GameService().getGameState(roomId))
  if (!gameState) {
    return
  }
  const fogMode =
    (gameState?.gameConfig as { fogOfWar?: 'off' | 'adjacent' | 'persistent' } | undefined)
      ?.fogOfWar ?? 'off'
  const fogEnabled = fogMode !== 'off' && gameState?.phase !== 'finished'

  const buildItems = (
    mask: Set<string> | null,
  ): Array<{
    id: string
    t: string
    turn: number
    phase: string
    kind: string
    actor: { id: string; name: string }
    text: string
    players: ReturnType<typeof collectPlayerRefs>
  }> =>
    moves.map((m) => {
      const payloadData = m.payload ?? {}
      const fromId =
        (payloadData.fromId as string | undefined) ||
        (payloadData.attackingTerritoryId as string | undefined)
      const toId =
        (payloadData.toId as string | undefined) ||
        (payloadData.defendingTerritoryId as string | undefined) ||
        (payloadData.territoryId as string | undefined)
      const fog: FogView =
        mask !== null
          ? {
              canSeeFrom: fromId ? mask.has(fromId) : false,
              canSeeTo: toId ? mask.has(toId) : false,
              showCounts: (fromId ? mask.has(fromId) : false) && (toId ? mask.has(toId) : false),
              fogActive: true,
            }
          : { canSeeFrom: true, canSeeTo: true, showCounts: true, fogActive: false }

      return {
        id: String(m.id),
        t: new Date(m.created_at).toISOString(),
        turn: m.turn_number,
        phase: m.phase,
        kind: m.move_type,
        actor: { id: m.actor_id, name: (payloadData.actorName as string) ?? 'Unknown' },
        text: renderLogText(m, fog),
        players: collectPlayerRefs(m),
      }
    })

  const emitItems = (
    target: BroadcastOperator<ServerToClientEvents, SocketData>,
    items: ReturnType<typeof buildItems>,
  ) => {
    if (items.length >= BATCH_THRESHOLD) {
      target.emit('game-log:batch', { items })
    } else {
      for (const item of items) {
        target.emit('game-log:append', item)
      }
    }
  }

  if (sockets.length === 0) {
    const items = buildItems(null)
    emitItems(io.to(gameChannel), items)
    return
  }

  for (const socket of sockets) {
    const viewerId = socket.data?.userId
    const mask =
      fogEnabled && gameState && viewerId ? computeVisibilityMask(gameState, viewerId) : null
    const items = buildItems(mask)
    emitItems(io.to(socket.id), items)
  }
}
