import { computeConquestProbability } from '@shared/utils/battleOdds'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPlayerTextColor, type PlayerColor } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'
import { socketService } from '@/services/socketService'
import { deriveRoundMarkers, isParticipantInRoom } from '@/utils/gameLog'
import { gameService } from '../../services/gameService'

type Props = {
  gameId: string
  className?: string
  onFocus?: (territoryIds: string[]) => void
}

type LogEntry = {
  ts: Date
  text: string
  kind?: string
  actorId?: string
  actorName?: string
  focusTerritories?: string[]
  rich?: ReactNode
  id?: string
}

const LOG_KIND_PRIORITY: Record<string, number> = {
  round_start: 5,
  cp_loss: 10,
  cp_gain: 20,
  game_finished: 30,
  player_won: 40,
  player_eliminated: 50,
  player_kicked: 55,
  player_missed_turn: 60,
}
const DEFAULT_KIND_PRIORITY = 1000

const getKindPriority = (entry: LogEntry): number =>
  LOG_KIND_PRIORITY[entry.kind ?? ''] ?? DEFAULT_KIND_PRIORITY

const compareLogEntries = (a: LogEntry, b: LogEntry): number => {
  const timeDiff = b.ts.getTime() - a.ts.getTime()
  if (timeDiff !== 0) return timeDiff
  const priorityDiff = getKindPriority(a) - getKindPriority(b)
  if (priorityDiff !== 0) return priorityDiff
  return a.text.localeCompare(b.text)
}

function formatTimestamp(d: Date): string {
  const day = d.toLocaleDateString(undefined, { day: '2-digit' })
  const mon = d.toLocaleDateString(undefined, { month: 'short' })
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  return `${day} ${mon}, ${time}`
}

export default function GameLogPanel({ gameId, className = '', onFocus }: Props) {
  const room = useAppSelector((s) => s.room.currentRoom)
  const game = useAppSelector((s) => s.game.currentGame)
  const clientLogs = useAppSelector((s) => s.uiRoom.clientLogs ?? [])
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [_refreshKey, setRefreshKey] = useState(0)
  const lastArmiesRef = useRef<Record<string, number>>({})
  const phaseRef = useRef<string | null>(null)
  const lastPlayerRef = useRef<string | null>(null)
  const lastTurnRef = useRef<number | null>(null)
  const startedLoggedRef = useRef(false)
  // Removed refresh timers in favor of live 'log:append'
  const fogMode = (game?.gameConfig?.fogOfWar ?? room?.fogOfWar ?? 'off') as
    | 'off'
    | 'adjacent'
    | 'persistent'
  const fogOn = fogMode !== 'off'
  const gameEnded =
    game?.phase === 'finished' || room?.status === 'completed' || room?.status === 'abandoned'
  // Only redact for non-participants during active fog-of-war games
  const currentUserId = useAppSelector((s) => s.auth.user?.id)
  const isParticipant = useMemo(
    () => isParticipantInRoom(room, game, currentUserId),
    [room, game, currentUserId],
  )
  const redact = fogOn && !gameEnded && !isParticipant
  const backfillLoadedRef = useRef(false)

  // Aggregate consecutive battle rolls from the same source → target
  type BattleAggregate = {
    attackerId: string
    defenderId?: string
    fromId: string
    toId: string
    fromName: string
    toName: string
    attackerName: string
    defenderName?: string
    initFrom: number | null
    initTo: number | null
    totalKilled: number
    totalLost: number
    conquered: boolean
    movedArmies?: number
    eliminated?: string[]
    startTs: Date
    lastTs: Date
  } | null
  const aggRef = useRef<BattleAggregate>(null)

  const toSafeInt = useMemo(
    () =>
      (value: unknown, fallback = 0) => {
        if (typeof value === 'number') {
          return Number.isFinite(value) ? Math.trunc(value) : fallback
        }
        if (typeof value === 'string') {
          const n = Number.parseInt(value, 10)
          return Number.isFinite(n) ? n : fallback
        }
        const n = Number(value)
        return Number.isFinite(n) ? Math.trunc(n) : fallback
      },
    [],
  )

  const playerName = useMemo(() => {
    const map = new Map<string, string>()
    if (game?.players) {
      for (const p of game.players) {
        map.set(p.id, p.username || p.id)
      }
    }
    if (room?.players) {
      for (const p of room.players) {
        const id = (p.userId ?? p.id) as string
        if (!map.has(id)) map.set(id, p.username)
      }
    }
    return map
  }, [game?.players, room?.players])

  const playerColor = useMemo(() => {
    const map = new Map<string, string>()
    const addColor = (key?: string | null, rawColor?: PlayerColor | string | null) => {
      if (!key || !rawColor) return
      const resolved = getPlayerTextColor(rawColor)
      if (!resolved) return
      map.set(key, resolved)
    }

    if (game?.players) {
      for (const p of game.players) {
        addColor(p.id, p.color)
        addColor(p.userId, p.color)
      }
    }
    if (room?.players) {
      for (const p of room.players) {
        const color = p.selectedColor ?? p.preferred_color ?? null
        addColor(p.id, color)
        addColor(p.userId, color)
      }
    }
    return map
  }, [game?.players, room?.players])

  const territoryName = useMemo(() => {
    const map = new Map<string, string>()
    if (game?.board) {
      for (const t of game.board) map.set(t.id, t.name || t.id)
    }
    return map
  }, [game?.board])

  const flushAggregate = useCallback(
    (append: (rich: ReactNode, text: string, ts?: Date, focusTerritories?: string[]) => void) => {
      const agg = aggRef.current
      if (!agg) return
      const attackerColor = playerColor.get(agg.attackerId)
      const defenderColor = agg.defenderId ? playerColor.get(agg.defenderId) : undefined
      const fromWithCount =
        agg.initFrom != null ? `${agg.fromName} - ${agg.initFrom}` : agg.fromName
      const toWithCount = agg.initTo != null ? `${agg.toName} - ${agg.initTo}` : agg.toName
      const leading = `${fromWithCount} (${agg.attackerName}) attacked ${toWithCount}${
        agg.defenderName ? ` (${agg.defenderName})` : ''
      }`
      const middle = agg.conquered ? ' conquering it,' : ''
      const oddsText =
        typeof agg.initFrom === 'number' && typeof agg.initTo === 'number'
          ? ` • ≈${Math.round(
              computeConquestProbability(Math.max(0, agg.initFrom), Math.max(0, agg.initTo)) * 100,
            )}% win`
          : ''
      const tail = ` killing ${agg.totalKilled}, losing ${agg.totalLost}.`
      const text = `${leading}${middle}${tail}${oddsText}`
      const rich = (
        <>
          {fromWithCount} (
          <span className="font-semibold" style={{ color: attackerColor }}>
            {agg.attackerName}
          </span>
          ) attacked {toWithCount}
          {agg.defenderName ? (
            <>
              {' '}
              (
              <span className="font-semibold" style={{ color: defenderColor }}>
                {agg.defenderName}
              </span>
              )
            </>
          ) : null}
          {agg.conquered ? ' conquering it,' : ''} killing {agg.totalKilled}, losing {agg.totalLost}
          {oddsText ? oddsText : null}.
        </>
      )
      append(rich, text, agg.lastTs, [agg.fromId, agg.toId])
      if (agg.conquered && (agg.movedArmies ?? 0) > 0) {
        const moved = agg.movedArmies as number
        const occupyRich = (
          <>
            {agg.fromName} (
            <span className="font-semibold" style={{ color: attackerColor }}>
              {agg.attackerName}
            </span>
            ) occupied {agg.toName} with {moved} troops.
          </>
        )
        const occupyText = `${agg.fromName} (${agg.attackerName}) occupied ${agg.toName} with ${moved} troops.`
        append(occupyRich, occupyText, agg.lastTs, [agg.fromId, agg.toId])
      }
      if (agg.conquered && Array.isArray(agg.eliminated) && agg.eliminated.length > 0) {
        for (const eliminatedId of agg.eliminated) {
          const defeatedName = playerName.get(eliminatedId) || eliminatedId
          const elimRich = (
            <>
              <span className="font-semibold" style={{ color: playerColor.get(eliminatedId) }}>
                {defeatedName}
              </span>{' '}
              was conquered by{' '}
              <span className="font-semibold" style={{ color: attackerColor }}>
                {agg.attackerName}
              </span>
              .
            </>
          )
          const elimText = `${defeatedName} was conquered by ${agg.attackerName}.`
          append(elimRich, elimText, agg.lastTs)
        }
      }
      aggRef.current = null
    },
    [playerColor, playerName],
  )

  // Initialize lastArmies snapshot
  useEffect(() => {
    const snapshot: Record<string, number> = {}
    if (game?.board) {
      for (const t of game.board) snapshot[t.id] = t.armies
    }
    lastArmiesRef.current = snapshot
  }, [game?.board])
  // Keep phase/player/turn refs in sync when mounting mid-phase or on reloads
  useEffect(() => {
    if (game?.phase) phaseRef.current = game.phase
  }, [game?.phase])
  useEffect(() => {
    if (game?.currentPlayer) lastPlayerRef.current = game.currentPlayer
  }, [game?.currentPlayer])
  useEffect(() => {
    if (typeof game?.turn === 'number') lastTurnRef.current = game.turn
  }, [game?.turn])
  // Disable client-synthesized lifecycle lines; rely on server log

  // Backfill windowed history from the server
  useEffect(() => {
    const isFinished =
      game?.phase === 'finished' ||
      (room?.status as string | undefined) === 'completed' ||
      (room?.status as string | undefined) === 'abandoned'

    if (!gameId || redact) {
      return
    }
    // With server-side access opened to any authenticated user,
    // we allow backfill for all logged-in users (still honoring fog-of-war redaction).
    let cancelled = false
    backfillLoadedRef.current = true
    // Prefer server-rendered textual backfill when available (handled inside IIFE)
    ;(async () => {
      try {
        // Prefer server-rendered textual backfill when available
        try {
          const respTxt = await gameService.getGameTextLog(gameId, { limit: 150 })
          if (!cancelled && Array.isArray(respTxt.log)) {
            const formattedTxt = respTxt.log
              .map((l) => ({
                ts: new Date(l.t),
                text: l.text,
                kind: l.kind,
                ...(l.actor?.id ? { actorId: String(l.actor.id) } : {}),
                ...(l.actor?.name ? { actorName: String(l.actor.name) } : {}),
              }))
              .sort(compareLogEntries)
            setEntries(formattedTxt)
            return
          }
        } catch {
          /* fall through to legacy backfill */
        }
        // Structured backfill disabled; initialize empty legacy inputs
        if (cancelled) return
        // no-op
        const stats: Array<Record<string, unknown>> = []
        let sawGameEnd = false
        const formatted: LogEntry[] = []
        const toName = (id: string) => territoryName.get(id) || id
        const nameOf = (id: string | null | undefined) =>
          id ? playerName.get(id) || id : undefined
        const sorted = [] as Array<Record<string, unknown>>
        type BfAgg = {
          attackerId: string
          defenderId?: string
          fromId: string
          toId: string
          from: string
          to: string
          attackerName: string
          defenderName?: string
          killed: number
          lost: number
          conquered: boolean
          movedArmies?: number
          eliminated: string[]
          tsStart: Date
          tsLast: Date
          initFrom?: number
          initTo?: number
        } | null
        let bfAgg: BfAgg = null

        const flushBf = () => {
          if (!bfAgg) return
          const attackerColor = playerColor.get(bfAgg.attackerId)
          const defenderColor = bfAgg.defenderId ? playerColor.get(bfAgg.defenderId) : undefined
          const fromWith =
            typeof bfAgg.initFrom === 'number' ? `${bfAgg.from} - ${bfAgg.initFrom}` : bfAgg.from
          const toWith =
            typeof bfAgg.initTo === 'number' ? `${bfAgg.to} - ${bfAgg.initTo}` : bfAgg.to
          const leading = `${fromWith} (${bfAgg.attackerName}) attacked ${toWith}${
            bfAgg.defenderName ? ` (${bfAgg.defenderName})` : ''
          }`
          const middle = bfAgg.conquered ? ' conquering it,' : ''
          const oddsText =
            typeof bfAgg.initFrom === 'number' && typeof bfAgg.initTo === 'number'
              ? ` • ≈${Math.round(
                  computeConquestProbability(
                    Math.max(0, bfAgg.initFrom),
                    Math.max(0, bfAgg.initTo),
                  ) * 100,
                )}% win`
              : ''
          const tail = ` killing ${bfAgg.killed}, losing ${bfAgg.lost}.`
          const text = `${leading}${middle}${tail}${oddsText}`
          formatted.push({
            ts: bfAgg.tsLast,
            text,
            rich: (
              <>
                {fromWith} (
                <span className="font-semibold" style={{ color: attackerColor }}>
                  {bfAgg.attackerName}
                </span>
                ) attacked {toWith}
                {bfAgg.defenderName ? (
                  <>
                    {' '}
                    (
                    <span className="font-semibold" style={{ color: defenderColor }}>
                      {bfAgg.defenderName}
                    </span>
                    )
                  </>
                ) : null}
                {bfAgg.conquered ? ' conquering it,' : ''} killing {bfAgg.killed}, losing{' '}
                {bfAgg.lost}
                {oddsText ? oddsText : null}.
              </>
            ),
          })
          if (bfAgg.conquered && (bfAgg.movedArmies ?? 0) > 0) {
            const moved = bfAgg.movedArmies as number
            formatted.push({
              ts: bfAgg.tsLast,
              text: `${bfAgg.from} (${bfAgg.attackerName}) occupied ${bfAgg.to} with ${moved} troops.`,
              rich: (
                <>
                  {bfAgg.from} (
                  <span className="font-semibold" style={{ color: attackerColor }}>
                    {bfAgg.attackerName}
                  </span>
                  ) occupied {bfAgg.to} with {moved} troops.
                </>
              ),
            })
          }
          if (bfAgg.conquered) {
            for (const eliminatedId of bfAgg.eliminated) {
              const defeatedName = nameOf(eliminatedId) || eliminatedId
              formatted.push({
                ts: bfAgg.tsLast,
                text: `${defeatedName} was conquered by ${bfAgg.attackerName}.`,
                rich: (
                  <>
                    <span
                      className="font-semibold"
                      style={{ color: playerColor.get(eliminatedId) }}
                    >
                      {defeatedName}
                    </span>{' '}
                    was conquered by{' '}
                    <span className="font-semibold" style={{ color: attackerColor }}>
                      {bfAgg.attackerName}
                    </span>
                    .
                  </>
                ),
              })
            }
          }
          bfAgg = null
        }

        for (const e of sorted) {
          const er = e as Record<string, unknown>
          const ts = new Date(String(er.timestamp))
          const type = er.type as string | undefined
          if (!type || type === 'BATTLE') {
            const attackerId = String((er.attackerId as string) || '')
            const defenderId = (er.defenderId as string | undefined) || undefined
            const attackerName = nameOf(er.attackerId as string) || 'Unknown'
            const defenderName = nameOf(er.defenderId as string | null | undefined)
            const fromId = String(er.attackingTerritoryId)
            const toId = String(er.defendingTerritoryId)
            const from = toName(fromId)
            const to = toName(toId)
            const losses = (er.losses as Record<string, unknown> | undefined) ?? undefined
            const killed = toSafeInt(losses?.defender, 0)
            const lost = toSafeInt(losses?.attacker, 0)
            const conquered = Boolean(er.conquered)
            const same =
              bfAgg &&
              bfAgg.fromId === fromId &&
              bfAgg.toId === toId &&
              bfAgg.attackerId === attackerId &&
              (bfAgg.defenderId || undefined) === (defenderId || undefined)
            if (!same) {
              flushBf()
              const maybeInitFrom =
                typeof (er as { initialFromArmies?: unknown }).initialFromArmies === 'number'
                  ? Math.trunc((er as { initialFromArmies?: number }).initialFromArmies as number)
                  : undefined
              const maybeInitTo =
                typeof (er as { initialToArmies?: unknown }).initialToArmies === 'number'
                  ? Math.trunc((er as { initialToArmies?: number }).initialToArmies as number)
                  : undefined
              bfAgg = {
                attackerId,
                fromId,
                toId,
                from,
                to,
                attackerName,
                killed: 0,
                lost: 0,
                conquered: false,
                eliminated: [],
                tsStart: ts,
                tsLast: ts,
                ...(defenderId ? { defenderId } : {}),
                ...(defenderName ? { defenderName } : {}),
                ...(typeof maybeInitFrom === 'number' ? { initFrom: maybeInitFrom } : {}),
                ...(typeof maybeInitTo === 'number' ? { initTo: maybeInitTo } : {}),
              }
            }
            // Update aggregate
            if (bfAgg) {
              bfAgg.killed += killed
              bfAgg.lost += lost
              bfAgg.tsLast = ts
              if (conquered) {
                bfAgg.conquered = true
                const moved = toSafeInt(er.movedArmies, 0)
                if (moved > 0) bfAgg.movedArmies = moved
                const eliminated = Array.isArray(
                  (er as { eliminatedPlayers?: unknown[] }).eliminatedPlayers,
                )
                  ? ((er as { eliminatedPlayers?: string[] }).eliminatedPlayers ?? [])
                  : []
                bfAgg.eliminated = [...bfAgg.eliminated, ...eliminated]
                // If not set yet, attempt to set from this entry
                if (
                  typeof bfAgg.initFrom !== 'number' &&
                  typeof (er as { initialFromArmies?: unknown }).initialFromArmies === 'number'
                ) {
                  bfAgg.initFrom = Math.trunc(
                    (er as { initialFromArmies?: number }).initialFromArmies as number,
                  )
                }
                if (
                  typeof bfAgg.initTo !== 'number' &&
                  typeof (er as { initialToArmies?: unknown }).initialToArmies === 'number'
                ) {
                  bfAgg.initTo = Math.trunc(
                    (er as { initialToArmies?: number }).initialToArmies as number,
                  )
                }
              }
            }
          }
          // Flush any pending battle aggregation before handling non-battle entries
          flushBf()
          if (type === 'GAME_END') {
            const winnerId = String((er.winner as string) || '')
            const winnerName = nameOf(winnerId) || winnerId || 'Unknown'
            formatted.push({ ts, text: `${winnerName} won the game.` })
            formatted.push({ ts, text: 'Game finished.' })
            sawGameEnd = true
            continue
          }
          if (type === 'ENGAGEMENT_SUMMARY') {
            // Server-provided summary: render a concise recap with odds if initial stacks present
            const attackerId = String((er.attackerId as string) || '')
            const defenderId = (er.defenderId as string | undefined) || undefined
            const from = toName(String(er.attackingTerritoryId))
            const to = toName(String(er.defendingTerritoryId))
            const attackerName = nameOf(attackerId) || 'Unknown'
            const defenderName = nameOf(defenderId) || undefined
            const initFrom = toSafeInt(
              (er as { initialFromArmies?: number }).initialFromArmies,
              NaN,
            )
            const initTo = toSafeInt((er as { initialToArmies?: number }).initialToArmies, NaN)
            const tot =
              (er as { totalLosses?: { attacker?: number; defender?: number } }).totalLosses || {}
            const killed = toSafeInt(tot.defender, 0)
            const lost = toSafeInt(tot.attacker, 0)
            const conquered = Boolean(er.conquered)
            const withCounts =
              Number.isFinite(initFrom) && Number.isFinite(initTo)
                ? { from: `${from} - ${initFrom}`, to: `${to} - ${initTo}` }
                : { from, to }
            const oddsText =
              Number.isFinite(initFrom) && Number.isFinite(initTo)
                ? ` • ≈${Math.round(
                    computeConquestProbability(Math.max(0, initFrom), Math.max(0, initTo)) * 100,
                  )}% win`
                : ''
            formatted.push({
              ts,
              text: `${withCounts.from} (${attackerName}) attacked ${withCounts.to}${defenderName ? ` (${defenderName})` : ''}${conquered ? ' conquering it,' : ''} killing ${killed}, losing ${lost}.${oddsText}`,
              rich: (
                <>
                  {withCounts.from} (
                  <span className="font-semibold" style={{ color: playerColor.get(attackerId) }}>
                    {attackerName}
                  </span>
                  ) attacked {withCounts.to}
                  {defenderName ? (
                    <>
                      {' '}
                      (
                      <span
                        className="font-semibold"
                        style={{ color: defenderId ? playerColor.get(defenderId) : undefined }}
                      >
                        {defenderName}
                      </span>
                      )
                    </>
                  ) : null}
                  {conquered ? ' conquering it,' : ''} killing {killed}, losing {lost}
                  {oddsText ? oddsText : null}.
                </>
              ),
            })
            continue
          }
          if (type === 'TREASURE') {
            const name = nameOf(er.userId as string) || 'Unknown'
            const id = String((er.userId as string) || '')
            formatted.push({
              ts,
              text: `${name} received a card.`,
              rich: (
                <>
                  <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                    {name}
                  </span>{' '}
                  received a card.
                </>
              ),
            })
            continue
          }
          if (type === 'TREASURE_CASH') {
            const name = nameOf(er.playerId as string) || 'Unknown'
            const troops = toSafeInt(er.troops, 0)
            if (troops > 0) {
              const id = String((er.playerId as string) || '')
              const cards = Array.isArray((er as { cards?: unknown[] }).cards)
                ? ((er as { cards?: string[] }).cards as string[])
                : []
              const cardsText =
                cards.length === 3
                  ? ` for turning in cards ${cards[0]}, ${cards[1]}, and ${cards[2]}`
                  : ''
              formatted.push({
                ts,
                text: `${name} received ${troops} troops${cardsText || ' for cashing treasures.'}`,
                rich: (
                  <>
                    <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                      {name}
                    </span>{' '}
                    received {troops} troops
                    {cardsText ? (
                      <span className="whitespace-pre">{cardsText}</span>
                    ) : (
                      ' for cashing treasures.'
                    )}
                  </>
                ),
              })
            }
            continue
          }
          if (type === 'SECTOR_BONUS') {
            const id = String((er.playerId as string) || '')
            const name = nameOf(id) || 'Unknown'
            const sectorName = String((er as { sectorName?: string }).sectorName || 'a sector')
            const bonus = toSafeInt((er as { bonus?: number }).bonus, 0)
            if (bonus > 0) {
              formatted.push({
                ts,
                text: `${name} received ${bonus} troops for holding ${sectorName}.`,
                rich: (
                  <>
                    <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                      {name}
                    </span>{' '}
                    received {bonus} troops for holding {sectorName}.
                  </>
                ),
              })
            }
            continue
          }
          if (type === 'LIFECYCLE') {
            const ev = String(er.event)
            if (ev === 'CREATED') {
              formatted.push({ ts, text: 'Game created.' })
            } else if (ev === 'STARTED') {
              formatted.push({ ts, text: 'Game started.' })
            } else if (ev === 'COMPLETED') {
              formatted.push({ ts, text: 'Game finished.' })
              sawGameEnd = true
            }
            continue
          }
          if (type === 'RESIGN') {
            const id = String((er.playerId as string) || '')
            const name = nameOf(id) || id || 'A player'
            formatted.push({
              ts,
              text: `${name} resigned. Territories are now neutral.`,
              rich: (
                <>
                  <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                    {name}
                  </span>{' '}
                  resigned. Territories are now neutral.
                </>
              ),
            })
            continue
          }
          if (type === 'FORTIFY') {
            const name = nameOf(er.playerId as string) || 'Unknown'
            const from = toName(String(er.fromTerritoryId))
            const to = toName(String(er.toTerritoryId))
            const n = toSafeInt(er.movedArmies, 0)
            const id = String((er.playerId as string) || '')
            formatted.push({
              ts,
              text: `${to} (${name}) was fortified from ${from} (${name}) with ${n} ${n === 1 ? 'troop' : 'troops'}.`,
              rich: (
                <>
                  {to} (
                  <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                    {name}
                  </span>
                  ) was fortified from {from} (
                  <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                    {name}
                  </span>
                  ) with {n} {n === 1 ? 'troop' : 'troops'}.
                </>
              ),
            })
            continue
          }
          if (type === 'REINFORCE') {
            const name = nameOf(er.playerId as string) || 'Unknown'
            const territory = toName(String(er.territoryId))
            const change = toSafeInt(er.armies, 0)
            if (change > 0) {
              const id = String((er.playerId as string) || '')
              formatted.push({
                ts,
                text: `${territory} (${name}) received ${change} ${change === 1 ? 'troop' : 'troops'}.`,
                rich: (
                  <>
                    {territory} (
                    <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                      {name}
                    </span>
                    ) received {change} {change === 1 ? 'troop' : 'troops'}.
                  </>
                ),
              })
            } else if (change < 0) {
              const n = Math.abs(change)
              const id = String((er.playerId as string) || '')
              formatted.push({
                ts,
                text: `${territory} (${name}) returned ${n} ${n === 1 ? 'troop' : 'troops'} to the reserves.`,
                rich: (
                  <>
                    {territory} (
                    <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                      {name}
                    </span>
                    ) returned {n} {n === 1 ? 'troop' : 'troops'} to the reserves.
                  </>
                ),
              })
            }
            continue
          }
          if (type === 'TURN') {
            const name = nameOf(er.playerId as string) || 'Unknown'
            const event = String(er.event)
            if (event === 'END') {
              const id = String((er.playerId as string) || '')
              formatted.push({
                ts,
                text: `${name} ended the turn.`,
                rich: (
                  <>
                    <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                      {name}
                    </span>{' '}
                    ended the turn.
                  </>
                ),
              })
            } else if (event === 'MISSED') {
              const id = String((er.playerId as string) || '')
              const reason =
                er && typeof er === 'object' && 'reason' in er && er.reason === 'timeout'
                  ? ' (timer expired)'
                  : ''
              formatted.push({
                ts,
                text: `${name} missed the turn${reason}.`,
                rich: (
                  <>
                    <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                      {name}
                    </span>{' '}
                    missed the turn
                    {reason ? <span className="whitespace-pre"> (timer expired)</span> : null}.
                  </>
                ),
              })
            } else if (event === 'START') {
              const reinf = toSafeInt(er.reinforcementArmies, 0)
              const terrs = toSafeInt(er.territoryCount, 0)
              if (reinf > 0) {
                const id = String((er.playerId as string) || '')
                formatted.push({
                  ts,
                  text:
                    terrs > 0
                      ? `${name} received ${reinf} troops for ${terrs} territories.`
                      : `${name} received ${reinf} troops.`,
                  rich: (
                    <>
                      <span className="font-semibold" style={{ color: playerColor.get(id) }}>
                        {name}
                      </span>{' '}
                      received {reinf} troops{terrs > 0 ? <> for {terrs} territories</> : null}.
                    </>
                  ),
                })
              }
              const id2 = String((er.playerId as string) || '')
              formatted.push({
                ts,
                text: `${name} started the turn.`,
                rich: (
                  <>
                    <span className="font-semibold" style={{ color: playerColor.get(id2) }}>
                      {name}
                    </span>{' '}
                    started the turn.
                  </>
                ),
              })
            }
            continue
          }
          if (type === 'RATING') {
            const userId = er.userId as string
            const name = nameOf(userId) || userId
            const change = toSafeInt(er.change, 0)
            if (change !== 0) {
              const verb = change > 0 ? 'gained' : 'lost'
              formatted.push({
                ts,
                text: `${name} ${verb} ${Math.abs(change)} rating.`,
                rich: (
                  <>
                    <span className="font-semibold" style={{ color: playerColor.get(userId) }}>
                      {name}
                    </span>{' '}
                    {verb} {Math.abs(change)} rating.
                  </>
                ),
              })
            }
          }
        }
        // Flush if last entries were a battle sequence
        if (bfAgg) flushBf()

        // Derive "Round X started." markers from turn_stats snapshots
        try {
          const markers = deriveRoundMarkers(
            stats
              .filter((s) => s && typeof s === 'object' && 'timestamp' in s && 'turn' in s)
              .map(
                (s) =>
                  s as unknown as {
                    turn: number
                    timestamp: string
                    players?: Array<{ eliminated?: boolean }>
                  },
              ),
          )
          for (const m of markers) {
            const ts = new Date(m.timestamp)
            formatted.push({ ts, text: `Round ${m.round} started.` })
          }
        } catch {
          /* best-effort only */
        }
        // If the game has finished and there was no explicit GAME_END/LIFECYCLE COMPLETED in the log,
        // append a concise end summary as a fallback
        try {
          const isComplete =
            (room?.status as string | undefined) === 'completed' ||
            (room?.status as string | undefined) === 'abandoned' ||
            game?.phase === 'finished'
          if (isComplete && !sawGameEnd) {
            const tsEnd = new Date()
            formatted.push({ ts: tsEnd, text: 'Game finished.' })
          }
        } catch {
          /* ignore */
        }
        // Newest first
        formatted.sort(compareLogEntries)
        setEntries(formatted)
        backfillLoadedRef.current = true
      } catch (_err) {
        // ignore; keep live log only
        if (!isFinished) {
          backfillLoadedRef.current = false
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameId, redact, playerName, territoryName, toSafeInt, game?.phase, room?.status, playerColor])

  useEffect(() => {
    const ENABLE_CLIENT_SYNTHESIS = false
    if (!ENABLE_CLIENT_SYNTHESIS) {
      return
    }
    function add(text: string, ts?: Date, focusTerritories?: string[]) {
      const targetTs = ts ?? new Date()
      setEntries((prev) => {
        // De-dup by identical text within 2 seconds across client + persisted logs
        const existing: { ts: Date; text: string }[] = [
          ...prev,
          ...(clientLogs as Array<{ ts: string | number | Date; text: string }>).map((l) => ({
            ts: new Date(l.ts),
            text: l.text,
          })),
        ]
        const windowMs = 2000
        const dup = existing.some(
          (e) => e.text === text && Math.abs(targetTs.getTime() - e.ts.getTime()) <= windowMs,
        )
        if (dup) return prev
        const base = { ts: targetTs, text }
        const withFocus =
          focusTerritories && focusTerritories.length > 0 ? { ...base, focusTerritories } : base
        return [withFocus as LogEntry, ...prev].slice(0, 500)
      })
    }

    function addRich(
      rich: ReactNode,
      textFallback: string,
      ts?: Date,
      focusTerritories?: string[],
    ) {
      const targetTs = ts ?? new Date()
      setEntries((prev) => {
        // De-dup by identical text within 2 seconds across client + persisted logs
        const existing: { ts: Date; text: string }[] = [
          ...prev,
          ...(clientLogs as Array<{ ts: string | number | Date; text: string }>).map((l) => ({
            ts: new Date(l.ts),
            text: l.text,
          })),
        ]
        const windowMs = 2000
        const dup = existing.some(
          (e) =>
            e.text === textFallback && Math.abs(targetTs.getTime() - e.ts.getTime()) <= windowMs,
        )
        if (dup) return prev
        const base = { ts: targetTs, text: textFallback, rich }
        const withFocus =
          focusTerritories && focusTerritories.length > 0 ? { ...base, focusTerritories } : base
        return [withFocus as LogEntry, ...prev].slice(0, 500)
      })
    }

    const onPlayerJoined: Parameters<typeof socketService.on<'player-joined'>>[1] = (payload) => {
      if (!payload || payload.roomId !== gameId) return
      const name = payload.player.username
      const id = (payload.player.userId || payload.player.id) as string
      addRich(
        <>
          <span className="font-semibold" style={{ color: playerColor.get(String(id)) }}>
            {name}
          </span>{' '}
          joined the game.
        </>,
        `${name} joined the game.`,
      )
    }

    const onLifecycle: Parameters<typeof socketService.on<'lifecycle:update'>>[1] = (payload) => {
      if (!payload || payload.roomId !== gameId) return
      if (aggRef.current) flushAggregate(addRich)
      if (payload.status === 'active') {
        startedLoggedRef.current = true
        add('Game started.')
      } else if (payload.status === 'completed') {
        // No-op: rely on canonical GAME_END delta for finish + winner lines
      }
    }

    socketService.on('player-joined', onPlayerJoined)
    socketService.on('lifecycle:update', onLifecycle)
    // Live rating updates (ranked games)
    const onRating: Parameters<typeof socketService.on<'ratingUpdate'>>[1] = (payload) => {
      try {
        const p = payload as unknown as {
          changes?: Array<{
            userId: string
            username?: string
            oldRating: number
            newRating: number
            change: number
          }>
        }
        const list = Array.isArray(p?.changes) ? p.changes : []
        const now = new Date()
        for (const ch of list) {
          const name = ch.username || playerName.get(ch.userId) || ch.userId
          const verb = ch.change > 0 ? 'gained' : 'lost'
          addRich(
            <>
              <span className="font-semibold" style={{ color: playerColor.get(ch.userId) }}>
                {name}
              </span>{' '}
              {verb} {Math.abs(ch.change)} rating.
            </>,
            `${name} ${verb} ${Math.abs(ch.change)} rating.`,
            now,
          )
        }
      } catch {
        /* ignore */
      }
    }
    socketService.on('ratingUpdate', onRating)

    return () => {
      socketService.off('player-joined', onPlayerJoined)
      socketService.off('lifecycle:update', onLifecycle)
      socketService.off('ratingUpdate', onRating)
    }
  }, [gameId, playerName, playerColor, flushAggregate, clientLogs])

  // Legacy structured log listener removed
  useEffect(() => {
    if (!gameId || redact) return
  }, [gameId, redact])

  // Live fog-aware text appends
  useEffect(() => {
    if (!gameId || redact) return
    const onGameLogAppend: Parameters<typeof socketService.on<'game-log:append'>>[1] = (e) => {
      try {
        const data = e as unknown as {
          text?: string
          t?: string
          kind?: string
          actor?: { id?: string; name?: string }
        }
        const text = typeof data.text === 'string' ? data.text : null
        if (!text) return
        const ts = data.t ? new Date(String(data.t)) : new Date()
        const windowMs = 2000
        setEntries((prev) => {
          const dup = prev.some(
            (en) => en.text === text && Math.abs(ts.getTime() - en.ts.getTime()) <= windowMs,
          )
          if (dup) return prev
          return [
            {
              ts,
              text,
              ...(typeof data.kind === 'string' ? { kind: data.kind } : {}),
              ...(data.actor?.id ? { actorId: String(data.actor.id) } : {}),
              ...(data.actor?.name ? { actorName: String(data.actor.name) } : {}),
            },
            ...prev,
          ].slice(0, 500)
        })
      } catch {
        /* ignore */
      }
    }
    socketService.on('game-log:append', onGameLogAppend)
    const onGameLogBatch: Parameters<typeof socketService.on<'game-log:batch'>>[1] = (payload) => {
      try {
        const items = Array.isArray((payload as unknown as { items?: unknown[] }).items)
          ? (
              payload as unknown as {
                items: Array<{
                  text?: string
                  t?: string
                  kind?: string
                  actor?: { id?: string; name?: string }
                }>
              }
            ).items
          : []
        if (items.length === 0) return
        const windowMs = 2000
        setEntries((prev) => {
          let next = prev
          for (const it of items) {
            const text = typeof it.text === 'string' ? it.text : null
            if (!text) continue
            const ts = it.t ? new Date(String(it.t)) : new Date()
            const dup = next.some(
              (en) => en.text === text && Math.abs(ts.getTime() - en.ts.getTime()) <= windowMs,
            )
            if (dup) continue
            next = [
              {
                ts,
                text,
                ...(typeof it.kind === 'string' ? { kind: it.kind } : {}),
                ...(it.actor?.id ? { actorId: String(it.actor.id) } : {}),
                ...(it.actor?.name ? { actorName: String(it.actor.name) } : {}),
              },
              ...next,
            ].slice(0, 500)
          }
          return next
        })
      } catch {
        /* ignore */
      }
    }
    socketService.on('game-log:batch', onGameLogBatch)
    return () => {
      socketService.off('game-log:append', onGameLogAppend)
      socketService.off('game-log:batch', onGameLogBatch)
    }
  }, [gameId, redact])

  // On reveal, refetch full text history (unredacted)
  useEffect(() => {
    if (!gameId) return
    const onReveal: Parameters<typeof socketService.on<'game-log:reveal'>>[1] = async () => {
      try {
        const resp = await gameService.getGameTextLog(gameId, { limit: 150 })
        const formatted = resp.log
          .map((l) => ({
            ts: new Date(l.t),
            text: l.text,
            kind: l.kind,
            ...(l.actor?.id ? { actorId: String(l.actor.id) } : {}),
            ...(l.actor?.name ? { actorName: String(l.actor.name) } : {}),
          }))
          .sort(compareLogEntries)
        setEntries(formatted)
      } catch {
        setRefreshKey((k) => k + 1)
      }
    }
    socketService.on('game-log:reveal', onReveal)
    return () => {
      socketService.off('game-log:reveal', onReveal)
    }
  }, [gameId])

  return (
    <div className={`flex flex-col h-full min-h-0 bg-surface-1 rounded-lg ${className}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {entries.length === 0 && clientLogs.length === 0 ? (
          <div className="text-center text-muted py-6 text-sm">No log entries yet.</div>
        ) : (
          <div className="space-y-3">
            {(
              [
                ...(clientLogs as Array<{ ts: string | number | Date; text: string }>).map(
                  (l) => ({ ts: new Date(l.ts), text: l.text }) as LogEntry,
                ),
                ...entries,
              ] as LogEntry[]
            )
              .sort(compareLogEntries)
              .map((e) => {
                const key = `${e.ts.getTime()}-${e.text}`
                const clickable = Boolean(
                  onFocus && e.focusTerritories && e.focusTerritories.length > 0,
                )
                const isRound = e.kind === 'round_start' || e.text.startsWith('Round ')
                const actorName = e.actorName
                const actorId = e.actorId
                const actorColor = actorId ? playerColor.get(actorId) : undefined
                let content: ReactNode = e.rich ?? e.text
                if (!e.rich && actorName && actorColor && typeof content === 'string') {
                  const idx = content.indexOf(actorName)
                  if (idx >= 0) {
                    const left = content.slice(0, idx)
                    const right = content.slice(idx + actorName.length)
                    content = (
                      <>
                        {left}
                        <span className="font-semibold" style={{ color: actorColor }}>
                          {actorName}
                        </span>
                        {right}
                      </>
                    )
                  }
                }
                return (
                  <div
                    key={key}
                    className={`text-sm ${isRound ? 'bg-surface-3/40 rounded px-2 py-1' : ''}`}
                  >
                    <div className="text-xs text-muted">{formatTimestamp(e.ts)}</div>
                    {clickable ? (
                      <button
                        type="button"
                        className="text-left text-white underline underline-offset-2 hover:text-[color:var(--color-accent)]"
                        onClick={() => e.focusTerritories && onFocus?.(e.focusTerritories)}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="text-white">{content}</div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
