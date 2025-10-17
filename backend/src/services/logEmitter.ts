import type { RemoteSocket, Server } from 'socket.io'
import type { GameState } from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'
import { computeVisibilityMask } from './fogService.js'
import { GameService } from './gameService.js'

type SocketData = { userId?: string }

// Cheeky, single-tone phrasing
export const V = {
  // core actions
  attacked: ['assaulted'],
  reinforced: ['shored up'],
  fortified: ['fortified'],
  occupied: ['conquered'],
  started: ['stepped onto the field'],
  ended: ['stood down'],
  bonus: ['secured'],
  casualties: ['left {kills} foes fallen, lost {losses}'],

  // lifecycle
  victory: ['has vanquished their foes and conquered the map.'],
  eliminated: ['was swept from the field by {by}.'],
  missed: ['failed to muster and missed the turn.'],
  kicked: ['was deemed unworthy to continue.'],
  resigned: ['laid down arms and quit the field.'],

  // CP only
  cpUp: ['gained {delta} Conquest Points.'],
  cpDown: ['lost {delta} Conquest Points.'],

  // banners
  gameStart: ['The conquest began.'],
  gameFinish: ['The conquest has ended, for now.'],
  roundStart: ['Round {round} commenced.'],
} as const

export type DbMove = {
  id: string | number
  game_id: string
  turn_number: number
  phase: string
  move_type:
    | 'game_created'
    | 'game_started'
    | 'game_finished'
    | 'round_start'
    | 'start_turn'
    | 'end_turn'
    | 'reinforce'
    | 'attack'
    | 'conquer'
    | 'fortify'
    | 'bonus'
    | 'trade_cards'
    | 'card_award'
    | 'player_eliminated'
    | 'player_missed_turn'
    | 'player_kicked'
    | 'player_resigned'
    | 'player_won'
    | 'cp_gain'
    | 'cp_loss'
  actor_id: string
  created_at: string | Date
  payload: Record<string, unknown>
}

export type FogView = {
  canSeeFrom: boolean
  canSeeTo: boolean
  showCounts: boolean
  fogActive: boolean
}

const label = (t?: string, owner?: string) =>
  t ? (owner ? `${t} (${owner})` : t) : 'unknown ground'
const withArmies = (n?: number, show?: boolean) =>
  show && typeof n === 'number' && Number.isFinite(n) && n > 0
    ? ` with ${n} ${n === 1 ? 'troop' : 'troops'}`
    : ''

export function renderLogText(move: DbMove, fog: FogView): string {
  const p = move.payload || {}
  const actor = (p.actorName as string) ?? 'Unknown'
  const from = fog.canSeeFrom
    ? label(p.fromName as string | undefined, p.fromOwnerName as string | undefined)
    : 'an unseen front'
  const to = fog.canSeeTo
    ? label(p.toName as string | undefined, p.toOwnerName as string | undefined)
    : 'a shrouded target'

  switch (move.move_type) {
    // banners
    case 'game_started':
      return V.gameStart[0]
    case 'game_created':
      return 'Game created.'
    case 'game_finished':
      return V.gameFinish[0]
    case 'round_start':
      return V.roundStart[0].replace('{round}', String(p.round ?? '?'))

    // turns
    case 'start_turn':
      return `${actor} ${V.started[0]}`
    case 'end_turn':
      return `${actor} ${V.ended[0]}`

    // core actions
    case 'reinforce':
      return fog.canSeeTo
        ? `${label(p.toName as string | undefined, p.toOwnerName as string | undefined)} was ${V.reinforced[0]} by ${actor}${withArmies(
            (p.armies as number | undefined) ?? undefined,
            fog.showCounts,
          )}.`
        : `${actor} ${V.reinforced[0]} forces beyond your scouts.`

    case 'attack': {
      if (!fog.canSeeFrom && !fog.canSeeTo) return `${actor} ${V.attacked[0]} from the shadows.`
      if (fog.canSeeFrom && !fog.canSeeTo) return `${from} ${V.attacked[0]} a hidden position.`
      if (!fog.canSeeFrom && fog.canSeeTo) return `A hidden force ${V.attacked[0]} ${to}.`
      const loss =
        fog.showCounts && (p.kills != null || p.losses != null)
          ? `, ${V.casualties[0]
              .replace('{kills}', String(p.kills ?? '?'))
              .replace('{losses}', String(p.losses ?? '?'))}`
          : ''
      return `${from} ${V.attacked[0]} ${to}${loss}.`
    }

    case 'conquer': {
      if (!fog.canSeeTo) return `${actor} ${V.occupied[0]} a territory you couldn’t see.`
      const occ =
        (p.occupyArmies as number | undefined) && fog.showCounts
          ? ` Occupied ${p.toName} with ${p.occupyArmies} troops.`
          : ''
      return `${label(p.fromName as string | undefined, p.fromOwnerName as string | undefined)} ${V.occupied[0]} ${label(
        p.toName as string | undefined,
        p.toOwnerName as string | undefined,
      )}.${occ}`
    }

    case 'fortify':
      if (!fog.canSeeFrom && !fog.canSeeTo) return `${actor} ${V.fortified[0]} lines off-map.`
      if (fog.canSeeFrom && !fog.canSeeTo)
        return `${from} ${V.fortified[0]} a concealed position${withArmies(
          (p.armies as number | undefined) ?? undefined,
          fog.showCounts,
        )}.`
      if (!fog.canSeeFrom && fog.canSeeTo)
        return `A concealed origin ${V.fortified[0]} ${to}${withArmies(
          (p.armies as number | undefined) ?? undefined,
          fog.showCounts,
        )}.`
      return `${to} was ${V.fortified[0]} from ${from}${withArmies(
        (p.armies as number | undefined) ?? undefined,
        fog.showCounts,
      )}.`

    case 'bonus':
      return (p.sector as string | undefined)
        ? `${actor} ${V.bonus[0]} ${p.bonus} troops for holding ${p.sector}.`
        : `${actor} ${V.bonus[0]} ${p.bonus} troops for ${(p.reason as string | undefined) ?? 'territories'}.`

    case 'trade_cards':
      return `${actor} bartered Hidden Treasures for ${p.bonus} fresh troops.`
    case 'card_award':
      return `${actor} received a Hidden Treasure. Fortune smirks.`

    // lifecycle
    case 'player_won':
      return `${p.playerName ?? actor} ${V.victory[0]}`
    case 'player_eliminated':
      return `${p.playerName ?? 'A player'} ${V.eliminated[0].replace(
        '{by}',
        String(p.byName ?? 'an enemy'),
      )}`
    case 'player_missed_turn':
      return `${p.playerName ?? 'A player'} ${V.missed[0]}`
    case 'player_kicked':
      return `${p.playerName ?? 'A player'} ${V.kicked[0]}`
    case 'player_resigned':
      return `${p.playerName ?? 'A player'} ${V.resigned[0]}`

    // CP only
    case 'cp_gain':
      return `${p.playerName ?? 'A player'} ${V.cpUp[0].replace('{delta}', String(p.delta ?? '?'))}`
    case 'cp_loss':
      return `${p.playerName ?? 'A player'} ${V.cpDown[0].replace('{delta}', String(p.delta ?? '?'))}`

    default:
      return `${actor} acted. The scribes blinked.`
  }
}

function roundNumber(state: GameState): number {
  try {
    const active = Math.max(
      1,
      state.players.filter((p) => !p.isEliminated).length || state.players.length || 1,
    )
    return Math.max(1, Math.ceil(Math.max(1, state.turn) / active))
  } catch {
    return Math.max(1, (state as { turn?: number }).turn ?? 1)
  }
}

/**
 * Compute fog view booleans for a given viewerId and move.
 */
function fogForMove(state: GameState, viewerId: string, move: DbMove): FogView {
  const fogMode =
    (state.gameConfig as { fogOfWar?: 'off' | 'adjacent' | 'persistent' }).fogOfWar ?? 'off'
  const fogActive = fogMode !== 'off' && state.phase !== 'finished'
  if (!fogActive) return { canSeeFrom: true, canSeeTo: true, showCounts: true, fogActive: false }
  const mask = computeVisibilityMask(state, viewerId)
  const p = move.payload || {}
  // prefer explicit ids set on payload
  const fromId = (p.fromId as string | undefined) || (p.attackingTerritoryId as string | undefined)
  const toId =
    (p.toId as string | undefined) ||
    (p.defendingTerritoryId as string | undefined) ||
    (p.territoryId as string | undefined)
  const canSeeFrom = fromId ? mask.has(fromId) : false
  const canSeeTo = toId ? mask.has(toId) : false
  const showCounts = canSeeFrom && canSeeTo
  return { canSeeFrom, canSeeTo, showCounts, fogActive: true }
}

export async function emitLogAppend(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>,
  roomId: string,
  move: DbMove,
): Promise<void> {
  // Fetch sockets in room channel with fog rules and room spectators channel without fog
  const gameChannel = `game:${roomId}`
  let sockets: Array<RemoteSocket<ServerToClientEvents, SocketData>> = []
  let spectatorSockets: Array<RemoteSocket<ServerToClientEvents, SocketData>> = []
  try {
    sockets = await io.in(gameChannel).fetchSockets()
  } catch {
    // ignore; best-effort
  }
  try {
    spectatorSockets = await io.in(roomId).fetchSockets()
  } catch {
    // ignore
  }

  const state = await new GameService().getGameState(roomId)
  if (!state) {
    // Fallback: broadcast unredacted to both channels
    const payload = {
      id: String(move.id),
      t: new Date(move.created_at).toISOString(),
      turn: move.turn_number,
      phase: move.phase,
      kind: move.move_type,
      actor: { id: move.actor_id, name: (move.payload?.actorName as string) ?? 'Unknown' },
      text: renderLogText(move, {
        canSeeFrom: true,
        canSeeTo: true,
        showCounts: true,
        fogActive: false,
      }),
    }
    if (sockets.length > 0) io.to(gameChannel).emit('game-log:append', payload)
    if (spectatorSockets.length > 0) io.to(roomId).emit('game-log:append', payload)
    return
  }

  // Per-viewer emission for players channel
  for (const s of sockets) {
    const viewerId = s.data?.userId
    if (!viewerId) continue
    const fog = fogForMove(state, viewerId, move)
    const payload = {
      id: String(move.id),
      t: new Date(move.created_at).toISOString(),
      turn: state.turn,
      phase: state.phase,
      kind: move.move_type,
      actor: { id: move.actor_id, name: (move.payload?.actorName as string) ?? 'Unknown' },
      text: renderLogText(move, fog),
    }
    io.to(s.id).emit('game-log:append', payload)
  }

  // Spectators get unredacted short text; allowed only when fog-off or finished.
  if (spectatorSockets.length > 0) {
    const payload = {
      id: String(move.id),
      t: new Date(move.created_at).toISOString(),
      turn: roundNumber(state),
      phase: state.phase,
      kind: move.move_type,
      actor: { id: move.actor_id, name: (move.payload?.actorName as string) ?? 'Unknown' },
      text: renderLogText(move, {
        canSeeFrom: true,
        canSeeTo: true,
        showCounts: true,
        fogActive: false,
      }),
    }
    io.to(roomId).emit('game-log:append', payload)
  }
}

/**
 * Convert existing DB log entries to textual moves and emit fog-aware lines.
 * Minimal mapping; does not mutate database.
 */
export async function emitFogAwareForEntries(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>,
  roomId: string,
  entries: Array<Record<string, unknown>>,
): Promise<void> {
  try {
    const gs = new GameService()
    const state = await gs.getGameState(roomId)
    if (!state) return

    const idOf = (x: unknown) => (typeof x === 'string' ? x : (x as { id?: string })?.id || '')
    const nameOfPlayer = (pid?: string | null) =>
      pid ? state.players.find((p) => p.id === pid)?.username || pid : 'Unknown'
    const ownerName = (tid?: string | null) => {
      if (!tid) return undefined
      const terr = state.board.find((t) => t.id === tid)
      const pid = terr?.ownerId
      return pid ? state.players.find((p) => p.id === pid)?.username || pid : undefined
    }
    const terrName = (tid?: string | null) =>
      tid ? state.board.find((t) => t.id === tid)?.name || tid : undefined
    const turn = state.turn
    const phase = state.phase
    const game_id = roomId
    const created_atBase = new Date()

    // Helper to emit a move
    let serial = 0
    const emit = async (m: Omit<DbMove, 'id' | 'created_at'> & { created_at?: string | Date }) => {
      const move: DbMove = {
        id: `${Date.now()}-${serial++}`,
        created_at: m.created_at ?? created_atBase,
        ...m,
      }
      await emitLogAppend(io, roomId, move)
    }

    for (const e of entries) {
      const type = String(((e as { type?: string }).type ?? 'BATTLE').toString())
      const ts = (e as { timestamp?: string | number }).timestamp
      const created_at = ts ? new Date(String(ts)) : created_atBase
      if (type === 'LIFECYCLE') {
        const ev = String((e as { event?: string }).event || '')
        if (ev === 'STARTED') {
          await emit({
            game_id,
            turn_number: turn,
            phase,
            move_type: 'game_started',
            actor_id: '',
            payload: {},
            created_at,
          })
        }
      }
      if (type === 'GAME_END') {
        const winner = idOf((e as { winner?: string }).winner)
        const eliminated = Array.isArray((e as { eliminatedPlayers?: unknown[] }).eliminatedPlayers)
          ? ((e as { eliminatedPlayers?: string[] }).eliminatedPlayers as string[])
          : []
        if (winner) {
          await emit({
            game_id,
            turn_number: turn,
            phase,
            move_type: 'player_won',
            actor_id: winner,
            payload: { playerName: nameOfPlayer(winner) },
            created_at,
          })
        }
        for (const pid of eliminated) {
          await emit({
            game_id,
            turn_number: turn,
            phase,
            move_type: 'player_eliminated',
            actor_id: pid,
            payload: {
              playerName: nameOfPlayer(pid),
              byName: winner ? nameOfPlayer(winner) : undefined,
            },
            created_at,
          })
        }
        await emit({
          game_id,
          turn_number: turn,
          phase,
          move_type: 'game_finished',
          actor_id: winner || '',
          payload: {},
          created_at,
        })
      }
      if (type === 'TURN') {
        const pid = idOf((e as { playerId?: string }).playerId)
        const event = String((e as { event?: string }).event || '')
        const actorName = nameOfPlayer(pid)
        if (event === 'START') {
          await emit({
            game_id,
            turn_number: turn,
            phase,
            move_type: 'start_turn',
            actor_id: pid,
            payload: { actorName },
            created_at,
          })
        } else if (event === 'END') {
          await emit({
            game_id,
            turn_number: turn,
            phase,
            move_type: 'end_turn',
            actor_id: pid,
            payload: { actorName },
            created_at,
          })
        } else if (event === 'MISSED') {
          await emit({
            game_id,
            turn_number: turn,
            phase,
            move_type: 'player_missed_turn',
            actor_id: pid,
            payload: { playerName: actorName },
            created_at,
          })
        }
        continue
      }
      if (type === 'REINFORCE') {
        const pid = idOf((e as { playerId?: string }).playerId)
        const tid = idOf((e as { territoryId?: string }).territoryId)
        const armies = Number((e as { armies?: number }).armies || 0)
        await emit({
          game_id,
          turn_number: turn,
          phase,
          move_type: 'reinforce',
          actor_id: pid,
          payload: {
            actorName: nameOfPlayer(pid),
            toId: tid,
            toName: terrName(tid),
            toOwnerName: ownerName(tid),
            armies,
          },
          created_at,
        })
        continue
      }
      if (type === 'FORTIFY') {
        const pid = idOf((e as { playerId?: string }).playerId)
        const fromId = idOf((e as { fromTerritoryId?: string }).fromTerritoryId)
        const toId = idOf((e as { toTerritoryId?: string }).toTerritoryId)
        const moved = Number((e as { movedArmies?: number }).movedArmies || 0)
        await emit({
          game_id,
          turn_number: turn,
          phase,
          move_type: 'fortify',
          actor_id: pid,
          payload: {
            actorName: nameOfPlayer(pid),
            fromId,
            fromName: terrName(fromId),
            fromOwnerName: ownerName(fromId),
            toId,
            toName: terrName(toId),
            toOwnerName: ownerName(toId),
            armies: moved,
          },
          created_at,
        })
        continue
      }
      if (type === 'SECTOR_BONUS') {
        const pid = idOf((e as { playerId?: string }).playerId)
        const bonus = Number((e as { bonus?: number }).bonus || 0)
        const sectorName = (e as { sectorName?: string }).sectorName
        await emit({
          game_id,
          turn_number: turn,
          phase,
          move_type: 'bonus',
          actor_id: pid,
          payload: { actorName: nameOfPlayer(pid), bonus, sector: sectorName },
          created_at,
        })
        continue
      }
      if (type === 'RATING') {
        const pid = idOf((e as { userId?: string }).userId)
        const delta = Number((e as { change?: number }).change || 0)
        const move_type = delta >= 0 ? 'cp_gain' : 'cp_loss'
        await emit({
          game_id,
          turn_number: turn,
          phase,
          move_type,
          actor_id: pid,
          payload: { playerName: nameOfPlayer(pid), delta: Math.abs(delta) },
          created_at,
        })
        continue
      }
      if (type === 'RESIGN') {
        const pid = idOf((e as { playerId?: string }).playerId)
        await emit({
          game_id,
          turn_number: turn,
          phase,
          move_type: 'player_resigned',
          actor_id: pid,
          payload: { playerName: nameOfPlayer(pid) },
          created_at,
        })
        continue
      }
      // BATTLE and others default
      if (type === 'BATTLE') {
        const attackerId = idOf((e as { attackerId?: string }).attackerId)
        const _defenderId = idOf((e as { defenderId?: string | null }).defenderId)
        const fromId = idOf((e as { attackingTerritoryId?: string }).attackingTerritoryId)
        const toId = idOf((e as { defendingTerritoryId?: string }).defendingTerritoryId)
        const kills = Number((e as { losses?: { defender?: number } }).losses?.defender || 0)
        const losses = Number((e as { losses?: { attacker?: number } }).losses?.attacker || 0)
        const conquered = Boolean((e as { conquered?: boolean }).conquered)
        const movedArmies = (e as { movedArmies?: number }).movedArmies
        const eliminated = Array.isArray((e as { eliminatedPlayers?: unknown[] }).eliminatedPlayers)
          ? ((e as { eliminatedPlayers?: string[] }).eliminatedPlayers as string[])
          : []
        await emit({
          game_id,
          turn_number: turn,
          phase,
          move_type: 'attack',
          actor_id: attackerId,
          payload: {
            actorName: nameOfPlayer(attackerId),
            fromId,
            fromName: terrName(fromId),
            fromOwnerName: ownerName(fromId),
            toId,
            toName: terrName(toId),
            toOwnerName: ownerName(toId),
            kills,
            losses,
          },
          created_at,
        })
        if (conquered) {
          await emit({
            game_id,
            turn_number: turn,
            phase,
            move_type: 'conquer',
            actor_id: attackerId,
            payload: {
              actorName: nameOfPlayer(attackerId),
              fromId,
              fromName: terrName(fromId),
              fromOwnerName: ownerName(fromId),
              toId,
              toName: terrName(toId),
              toOwnerName: ownerName(toId),
              occupyArmies: typeof movedArmies === 'number' ? movedArmies : undefined,
            },
            created_at,
          })
          // Print elimination lines if present
          for (const pid of eliminated) {
            await emit({
              game_id,
              turn_number: turn,
              phase,
              move_type: 'player_eliminated',
              actor_id: pid,
              payload: { playerName: nameOfPlayer(pid), byName: nameOfPlayer(attackerId) },
              created_at,
            })
          }
        }
      }
    }
  } catch (error) {
    logger.warn('emitFogAwareForEntries failed', {
      roomId,
      error: error instanceof Error ? error.message : error,
    })
  }
}

/**
 * Persist a list of already-rendered DbMove rows into game_logs.
 * Accepts the same structure we emit over sockets. Best-effort insert only.
 */
export async function persistMoves(roomId: string, moves: DbMove[]): Promise<void> {
  try {
    if (!Array.isArray(moves) || moves.length === 0) return
    const rows = moves.map((m) => {
      const p = (m.payload || {}) as Record<string, unknown>
      const fromId =
        (p.fromId as string | undefined) || (p.attackingTerritoryId as string | undefined) || null
      const toId =
        (p.toId as string | undefined) ||
        (p.defendingTerritoryId as string | undefined) ||
        (p.territoryId as string | undefined) ||
        null
      return {
        game_id: m.game_id,
        ts: new Date(m.created_at),
        turn_number: m.turn_number,
        phase: m.phase,
        move_type: m.move_type,
        actor_id: m.actor_id || null,
        from_territory_id: fromId,
        to_territory_id: toId,
        payload: m.payload ?? {},
      }
    })

    const { query } = await import('../config/database.js')
    const cols = [
      'game_id',
      'ts',
      'turn_number',
      'phase',
      'move_type',
      'actor_id',
      'from_territory_id',
      'to_territory_id',
      'payload',
    ]
    const values: unknown[] = []
    const placeholders: string[] = []
    rows.forEach((r, i) => {
      const base = i * cols.length
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${
          base + 7
        }, $${base + 8}, $${base + 9})`,
      )
      values.push(
        roomId,
        r.ts,
        r.turn_number,
        r.phase,
        r.move_type,
        r.actor_id,
        r.from_territory_id,
        r.to_territory_id,
        JSON.stringify(r.payload ?? {}),
      )
    })
    await query(
      `INSERT INTO game_logs (game_id, ts, turn_number, phase, move_type, actor_id, from_territory_id, to_territory_id, payload)
       VALUES ${placeholders.join(', ')}`,
      values,
    )
  } catch (error) {
    logger.warn('persistMoves failed', {
      roomId,
      error: error instanceof Error ? error.message : error,
    })
  }
}

export function createGameEndMoves(
  roomId: string,
  state: GameState | null,
  winnerId: string,
  eliminated: string[],
  createdAt?: Date,
): DbMove[] {
  const ts = createdAt ?? new Date()
  const nameOf = (pid?: string | null) =>
    pid && state ? state.players.find((p) => p.id === pid)?.username || pid : 'Unknown'
  const moves: DbMove[] = []
  if (winnerId) {
    moves.push({
      id: `${ts.getTime()}-win`,
      game_id: roomId,
      turn_number: state?.turn ?? 1,
      phase: state?.phase ?? 'reinforcement',
      move_type: 'player_won',
      actor_id: winnerId,
      created_at: ts,
      payload: { playerName: nameOf(winnerId) },
    })
  }
  for (const pid of eliminated) {
    moves.push({
      id: `${ts.getTime()}-elim-${pid}`,
      game_id: roomId,
      turn_number: state?.turn ?? 1,
      phase: state?.phase ?? 'reinforcement',
      move_type: 'player_eliminated',
      actor_id: pid,
      created_at: ts,
      payload: { playerName: nameOf(pid), byName: nameOf(winnerId) },
    })
  }
  moves.push({
    id: `${ts.getTime()}-end`,
    game_id: roomId,
    turn_number: state?.turn ?? 1,
    phase: state?.phase ?? 'finished',
    move_type: 'game_finished',
    actor_id: winnerId || '',
    created_at: ts,
    payload: {},
  })
  return moves
}

/**
 * Persist fog-aware textual moves derived from structured entries to game_logs.
 */
export async function persistFogAwareForEntries(
  roomId: string,
  entries: Array<Record<string, unknown>>,
): Promise<void> {
  try {
    const gs = new GameService()
    const state = await gs.getGameState(roomId)
    if (!state || !entries || entries.length === 0) return

    const idOf = (x: unknown) => (typeof x === 'string' ? x : (x as { id?: string })?.id || '')
    const nameOfPlayer = (pid?: string | null) =>
      pid ? state.players.find((p) => p.id === pid)?.username || pid : 'Unknown'
    const ownerName = (tid?: string | null) => {
      if (!tid) return undefined
      const terr = state.board.find((t) => t.id === tid)
      const pid = terr?.ownerId
      return pid ? state.players.find((p) => p.id === pid)?.username || pid : undefined
    }
    const terrName = (tid?: string | null) =>
      tid ? state.board.find((t) => t.id === tid)?.name || tid : undefined
    const turn = state.turn
    const phase = state.phase
    const game_id = roomId
    const created_atBase = new Date()

    type Row = {
      game_id: string
      ts: Date
      turn_number: number
      phase: string
      move_type: string
      actor_id: string | null
      from_territory_id?: string | null
      to_territory_id?: string | null
      payload: Record<string, unknown>
    }
    const rows: Row[] = []

    const push = (r: Row) => rows.push(r)

    for (const e of entries) {
      const type = String(((e as { type?: string }).type ?? 'BATTLE').toString())
      const tsAny = (e as { timestamp?: string | number }).timestamp
      const ts = tsAny ? new Date(String(tsAny)) : created_atBase
      if (type === 'LIFECYCLE') {
        const ev = String((e as { event?: string }).event || '')
        if (ev === 'STARTED')
          push({
            game_id,
            ts,
            turn_number: turn,
            phase,
            move_type: 'game_started',
            actor_id: null,
            payload: {},
          })
        continue
      }
      if (type === 'GAME_END') {
        const winner = idOf((e as { winner?: string }).winner)
        const eliminated = Array.isArray((e as { eliminatedPlayers?: unknown[] }).eliminatedPlayers)
          ? ((e as { eliminatedPlayers?: string[] }).eliminatedPlayers as string[])
          : []
        if (winner)
          push({
            game_id,
            ts,
            turn_number: turn,
            phase,
            move_type: 'player_won',
            actor_id: winner || null,
            payload: { playerName: nameOfPlayer(winner) },
          })
        for (const pid of eliminated) {
          push({
            game_id,
            ts,
            turn_number: turn,
            phase,
            move_type: 'player_eliminated',
            actor_id: pid || null,
            payload: {
              playerName: nameOfPlayer(pid),
              byName: winner ? nameOfPlayer(winner) : undefined,
            },
          })
        }
        push({
          game_id,
          ts,
          turn_number: turn,
          phase,
          move_type: 'game_finished',
          actor_id: winner || null,
          payload: {},
        })
        continue
      }
      if (type === 'TURN') {
        const pid = idOf((e as { playerId?: string }).playerId)
        const event = String((e as { event?: string }).event || '')
        const actorName = nameOfPlayer(pid)
        if (event === 'START')
          push({
            game_id,
            ts,
            turn_number: turn,
            phase,
            move_type: 'start_turn',
            actor_id: pid || null,
            payload: { actorName },
          })
        else if (event === 'END')
          push({
            game_id,
            ts,
            turn_number: turn,
            phase,
            move_type: 'end_turn',
            actor_id: pid || null,
            payload: { actorName },
          })
        else if (event === 'MISSED')
          push({
            game_id,
            ts,
            turn_number: turn,
            phase,
            move_type: 'player_missed_turn',
            actor_id: pid || null,
            payload: { playerName: actorName },
          })
        continue
      }
      if (type === 'REINFORCE') {
        const pid = idOf((e as { playerId?: string }).playerId)
        const tid = idOf((e as { territoryId?: string }).territoryId)
        const armies = Number((e as { armies?: number }).armies || 0)
        push({
          game_id,
          ts,
          turn_number: turn,
          phase,
          move_type: 'reinforce',
          actor_id: pid || null,
          from_territory_id: null,
          to_territory_id: tid || null,
          payload: {
            actorName: nameOfPlayer(pid),
            toId: tid,
            toName: terrName(tid),
            toOwnerName: ownerName(tid),
            armies,
          },
        })
        continue
      }
      if (type === 'FORTIFY') {
        const pid = idOf((e as { playerId?: string }).playerId)
        const fromId = idOf((e as { fromTerritoryId?: string }).fromTerritoryId)
        const toId = idOf((e as { toTerritoryId?: string }).toTerritoryId)
        const moved = Number((e as { movedArmies?: number }).movedArmies || 0)
        push({
          game_id,
          ts,
          turn_number: turn,
          phase,
          move_type: 'fortify',
          actor_id: pid || null,
          from_territory_id: fromId || null,
          to_territory_id: toId || null,
          payload: {
            actorName: nameOfPlayer(pid),
            fromId,
            fromName: terrName(fromId),
            fromOwnerName: ownerName(fromId),
            toId,
            toName: terrName(toId),
            toOwnerName: ownerName(toId),
            armies: moved,
          },
        })
        continue
      }
      if (type === 'SECTOR_BONUS') {
        const pid = idOf((e as { playerId?: string }).playerId)
        const bonus = Number((e as { bonus?: number }).bonus || 0)
        const sectorName = (e as { sectorName?: string }).sectorName
        push({
          game_id,
          ts,
          turn_number: turn,
          phase,
          move_type: 'bonus',
          actor_id: pid || null,
          payload: { actorName: nameOfPlayer(pid), bonus, sector: sectorName },
        })
        continue
      }
      if (type === 'RATING') {
        const pid = idOf((e as { userId?: string }).userId)
        const delta = Number((e as { change?: number }).change || 0)
        const move_type = delta >= 0 ? 'cp_gain' : 'cp_loss'
        push({
          game_id,
          ts,
          turn_number: turn,
          phase,
          move_type,
          actor_id: pid || null,
          payload: { playerName: nameOfPlayer(pid), delta: Math.abs(delta) },
        })
        continue
      }
      if (type === 'RESIGN') {
        const pid = idOf((e as { playerId?: string }).playerId)
        push({
          game_id,
          ts,
          turn_number: turn,
          phase,
          move_type: 'player_resigned',
          actor_id: pid || null,
          payload: { playerName: nameOfPlayer(pid) },
        })
        continue
      }
      if (type === 'BATTLE') {
        const attackerId = idOf((e as { attackerId?: string }).attackerId)
        const fromId = idOf((e as { attackingTerritoryId?: string }).attackingTerritoryId)
        const toId = idOf((e as { defendingTerritoryId?: string }).defendingTerritoryId)
        const kills = Number((e as { losses?: { defender?: number } }).losses?.defender || 0)
        const losses = Number((e as { losses?: { attacker?: number } }).losses?.attacker || 0)
        const conquered = Boolean((e as { conquered?: boolean }).conquered)
        const movedArmies = (e as { movedArmies?: number }).movedArmies
        const eliminated = Array.isArray((e as { eliminatedPlayers?: unknown[] }).eliminatedPlayers)
          ? ((e as { eliminatedPlayers?: string[] }).eliminatedPlayers as string[])
          : []
        push({
          game_id,
          ts,
          turn_number: turn,
          phase,
          move_type: 'attack',
          actor_id: attackerId || null,
          from_territory_id: fromId || null,
          to_territory_id: toId || null,
          payload: {
            actorName: nameOfPlayer(attackerId),
            fromId,
            fromName: terrName(fromId),
            fromOwnerName: ownerName(fromId),
            toId,
            toName: terrName(toId),
            toOwnerName: ownerName(toId),
            kills,
            losses,
          },
        })
        if (conquered) {
          push({
            game_id,
            ts,
            turn_number: turn,
            phase,
            move_type: 'conquer',
            actor_id: attackerId || null,
            from_territory_id: fromId || null,
            to_territory_id: toId || null,
            payload: {
              actorName: nameOfPlayer(attackerId),
              fromId,
              fromName: terrName(fromId),
              fromOwnerName: ownerName(fromId),
              toId,
              toName: terrName(toId),
              toOwnerName: ownerName(toId),
              occupyArmies: typeof movedArmies === 'number' ? movedArmies : undefined,
            },
          })
          for (const pid of eliminated) {
            push({
              game_id,
              ts,
              turn_number: turn,
              phase,
              move_type: 'player_eliminated',
              actor_id: pid || null,
              payload: { playerName: nameOfPlayer(pid), byName: nameOfPlayer(attackerId) },
            })
          }
        }
      }
    }

    if (rows.length === 0) return
    const { query } = await import('../config/database.js')
    const cols = [
      'game_id',
      'ts',
      'turn_number',
      'phase',
      'move_type',
      'actor_id',
      'from_territory_id',
      'to_territory_id',
      'payload',
    ]
    const values: unknown[] = []
    const placeholders: string[] = []
    rows.forEach((r, i) => {
      const base = i * cols.length
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${
          base + 7
        }, $${base + 8}, $${base + 9})`,
      )
      values.push(
        r.game_id,
        r.ts,
        r.turn_number,
        r.phase,
        r.move_type,
        r.actor_id,
        r.from_territory_id ?? null,
        r.to_territory_id ?? null,
        JSON.stringify(r.payload ?? {}),
      )
    })
    await query(
      `INSERT INTO game_logs (game_id, ts, turn_number, phase, move_type, actor_id, from_territory_id, to_territory_id, payload)
       VALUES ${placeholders.join(', ')}`,
      values,
    )
  } catch (error) {
    logger.warn('persistFogAwareForEntries failed', {
      roomId,
      error: error instanceof Error ? error.message : error,
    })
  }
}

/**
 * Emit and persist a round_start banner.
 */
export async function emitAndPersistRoundStart(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, unknown>, SocketData>,
  roomId: string,
  round: number,
  createdAt?: Date,
): Promise<void> {
  try {
    const ts = createdAt ?? new Date()
    // Persist
    const { query } = await import('../config/database.js')
    await query(
      `INSERT INTO game_logs (game_id, ts, turn_number, phase, move_type, actor_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [roomId, ts, 1, 'reinforcement', 'round_start', null, JSON.stringify({ round })],
    )
  } catch {
    // best-effort persistence
  }
  // Emit banner (not fog-sensitive)
  const move: DbMove = {
    id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    game_id: roomId,
    turn_number: 1,
    phase: 'reinforcement',
    move_type: 'round_start',
    actor_id: '',
    created_at: createdAt ?? new Date(),
    payload: { round },
  }
  await emitLogAppend(io, roomId, move)
}
