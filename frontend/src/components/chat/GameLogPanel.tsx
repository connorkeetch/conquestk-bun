import type {
  BattleResultDelta,
  FortifyResultDelta,
  GameDelta,
  PhaseChangeDelta,
  SystemMessageDelta,
  TreasureAwardedDelta,
} from '@shared/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'
import { useAppSelector } from '../../hooks/redux'
import { gameService } from '../../services/gameService'
import { socketService } from '../../services/socketService'

type Props = {
  gameId: string
  className?: string
  onFocus?: (territoryIds: string[]) => void
}

type LogEntry = {
  ts: Date
  text: string
  focusTerritories?: string[]
  rich?: React.ReactNode
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
  const lastArmiesRef = useRef<Record<string, number>>({})
  const phaseRef = useRef<string | null>(null)
  const lastPlayerRef = useRef<string | null>(null)
  const lastTurnRef = useRef<number | null>(null)
  const startedLoggedRef = useRef(false)
  const fogMode = (game?.gameConfig?.fogOfWar ?? room?.fogOfWar ?? 'off') as
    | 'off'
    | 'adjacent'
    | 'persistent'
  const fogOn = fogMode !== 'off'
  const gameEnded =
    game?.phase === 'finished' || room?.status === 'completed' || room?.status === 'abandoned'
  const redact = fogOn && !gameEnded
  const backfillLoadedRef = useRef(false)

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
    if (game?.players) {
      for (const p of game.players) {
        try {
          const hex = getColorValue((p.color as unknown) as PlayerColor)
          map.set(p.id, hex)
        } catch {
          // ignore mapping issues; fallback handled during render
        }
      }
    }
    return map
  }, [game?.players])

  const territoryName = useMemo(() => {
    const map = new Map<string, string>()
    if (game?.board) {
      for (const t of game.board) map.set(t.id, t.name || t.id)
    }
    return map
  }, [game?.board])

  // Initialize lastArmies snapshot and seed with Game created
  useEffect(() => {
    const snapshot: Record<string, number> = {}
    if (game?.board) {
      for (const t of game.board) snapshot[t.id] = t.armies
    }
    lastArmiesRef.current = snapshot
  }, [game?.board])

  useEffect(() => {
    if (room?.createdAt) {
      const createdAt = new Date(room.createdAt)
      setEntries((prev) => [{ ts: createdAt, text: 'Game created.' }, ...prev])
    }
  }, [room?.createdAt])

  // Ensure we show a start entry if the component mounts mid-game
  useEffect(() => {
    if (!room) return
    if (room.status === 'active' && !startedLoggedRef.current) {
      startedLoggedRef.current = true
      setEntries((prev) => [{ ts: new Date(), text: 'Game started.' }, ...prev])
    }
  }, [room])

  // Backfill full history only after game ends (avoids 403 during active games)
  useEffect(() => {
    const isFinished =
      game?.phase === 'finished' ||
      (room?.status as string | undefined) === 'completed' ||
      (room?.status as string | undefined) === 'abandoned'

    if (!gameId || redact || backfillLoadedRef.current || !isFinished) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const resp = await gameService.getGameLog(gameId)
        // Narrow unknown response shape: either an array or an object with a `log` array
        const r1 = resp as unknown
        const maybeObj = r1 as { log?: unknown[] }
        const raw = Array.isArray(maybeObj.log) ? maybeObj.log : (r1 as unknown[])
        if (cancelled) return
        // Format to display entries; build newest-first
        const formatted: LogEntry[] = []
        // We rely on current maps for names
        const toName = (id: string) => territoryName.get(id) || id
        const nameOf = (id: string | null | undefined) =>
          id ? playerName.get(id) || id : undefined
        // Sort ascending by timestamp then push and reverse
        const sorted = [...raw].sort((a, b) => {
          const ar = a as Record<string, unknown>
          const br = b as Record<string, unknown>
          return new Date(String(ar.timestamp)).getTime() - new Date(String(br.timestamp)).getTime()
        })
        for (const e of sorted) {
          const er = e as Record<string, unknown>
          const ts = new Date(String(er.timestamp))
          const type = er.type as string | undefined
          if (!type || type === 'BATTLE') {
            const attackerName = nameOf(er.attackerId as string) || 'Unknown'
            const defenderName = nameOf(er.defenderId as string | null | undefined)
            const from = toName(String(er.attackingTerritoryId))
            const to = toName(String(er.defendingTerritoryId))
            const losses = (er.losses as Record<string, unknown> | undefined) ?? undefined
            const killed = toSafeInt(losses?.defender, 0)
            const lost = toSafeInt(losses?.attacker, 0)
            const conquered = Boolean(er.conquered)
            if (conquered) {
              formatted.push({
                ts,
                text: `${from} (${attackerName}) attacked ${to}${defenderName ? ` (${defenderName})` : ''} conquering it, killing ${killed}, losing ${lost}.`,
              })
              const moved = toSafeInt(er.movedArmies, 0)
              if (moved > 0) {
                formatted.push({
                  ts,
                  text: `${from} (${attackerName}) occupied ${to} with ${moved} troops.`,
                })
              }
              // Log any eliminations associated with this conquest
              const eliminated = Array.isArray(
                (er as { eliminatedPlayers?: unknown[] }).eliminatedPlayers,
              )
                ? ((er as { eliminatedPlayers?: string[] }).eliminatedPlayers ?? [])
                : []
              for (const eliminatedId of eliminated) {
                const defeatedName = nameOf(eliminatedId) || eliminatedId
                formatted.push({ ts, text: `${defeatedName} was defeated by ${attackerName}.` })
              }
            } else {
              formatted.push({
                ts,
                text: `${from} (${attackerName}) attacked ${to}${defenderName ? ` (${defenderName})` : ''} killing ${killed}, losing ${lost}.`,
              })
            }
            continue
          }
          if (type === 'TREASURE') {
            const name = nameOf(er.userId as string) || 'Unknown'
            formatted.push({ ts, text: `${name} received a card.` })
            continue
          }
          if (type === 'TREASURE_CASH') {
            const name = nameOf(er.playerId as string) || 'Unknown'
            const troops = toSafeInt(er.troops, 0)
            if (troops > 0) {
              formatted.push({
                ts,
                text: `${name} received ${troops} troops for cashing treasures.`,
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
            }
            continue
          }
          if (type === 'FORTIFY') {
            const name = nameOf(er.playerId as string) || 'Unknown'
            const from = toName(String(er.fromTerritoryId))
            const to = toName(String(er.toTerritoryId))
            const n = toSafeInt(er.movedArmies, 0)
            formatted.push({
              ts,
              text: `${to} (${name}) was fortified from ${from} (${name}) with ${n} ${n === 1 ? 'troop' : 'troops'}.`,
            })
            continue
          }
          if (type === 'REINFORCE') {
            const name = nameOf(er.playerId as string) || 'Unknown'
            const territory = toName(String(er.territoryId))
            const change = toSafeInt(er.armies, 0)
            if (change > 0) {
              formatted.push({
                ts,
                text: `${territory} (${name}) received ${change} ${change === 1 ? 'troop' : 'troops'}.`,
              })
            } else if (change < 0) {
              const n = Math.abs(change)
              formatted.push({
                ts,
                text: `${territory} (${name}) returned ${n} ${n === 1 ? 'troop' : 'troops'} to the reserves.`,
              })
            }
            continue
          }
          if (type === 'TURN') {
            const name = nameOf(er.playerId as string) || 'Unknown'
            const event = String(er.event)
            if (event === 'END') {
              formatted.push({ ts, text: `${name} ended the turn.` })
            } else if (event === 'START') {
              const reinf = toSafeInt(er.reinforcementArmies, 0)
              const terrs = toSafeInt(er.territoryCount, 0)
              if (reinf > 0) {
                formatted.push({
                  ts,
                  text:
                    terrs > 0
                      ? `${name} received ${reinf} troops for ${terrs} territories.`
                      : `${name} received ${reinf} troops.`,
                })
              }
              formatted.push({ ts, text: `${name} started the turn.` })
            }
            continue
          }
          if (type === 'RATING') {
            const userId = er.userId as string
            const name = nameOf(userId) || userId
            const change = toSafeInt(er.change, 0)
            if (change !== 0) {
              const verb = change > 0 ? 'gained' : 'lost'
              formatted.push({ ts, text: `${name} ${verb} ${Math.abs(change)} rating.` })
            }
          }
        }
        // Newest first
        formatted.sort((a, b) => b.ts.getTime() - a.ts.getTime())
        setEntries(formatted)
        backfillLoadedRef.current = true
      } catch (_err) {
        // ignore; keep live log only
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameId, redact, playerName, territoryName, toSafeInt, game?.phase, room?.status])

  useEffect(() => {
    function add(text: string, ts?: Date, focusTerritories?: string[]) {
      setEntries((prev) =>
        [{ ts: ts ?? new Date(), text, focusTerritories }, ...prev].slice(0, 500),
      )
    }

    const onPlayerJoined: Parameters<typeof socketService.on<'player-joined'>>[1] = (payload) => {
      if (!payload || payload.roomId !== gameId) return
      const name = payload.player.username
      add(`${name} joined the game.`)
    }

    const onLifecycle: Parameters<typeof socketService.on<'lifecycle:update'>>[1] = (payload) => {
      if (!payload || payload.roomId !== gameId) return
      if (payload.status === 'active') {
        startedLoggedRef.current = true
        add('Game started.')
      } else if (payload.status === 'completed') {
        add('Game ended.')
      }
    }

    const onPhaseChangedLegacy: Parameters<typeof socketService.on<'phaseChanged'>>[1] = (data) => {
      // Map legacy shape to PhaseChangeDelta-like handling
      const phase = data.phase
      const currentPlayer = data.currentPlayer
      const reinforcementArmies = data.reinforcementArmies
      handlePhaseChange({
        type: 'PHASE_CHANGE',
        roomId: gameId,
        timestamp: Date.now(),
        phase,
        currentPlayer,
        reinforcementArmies,
      })
    }

    const handlePhaseChange = (delta: PhaseChangeDelta) => {
      const prevPlayer = lastPlayerRef.current
      const nextPlayer = delta.currentPlayer
      const prevTurn = lastTurnRef.current
      // When a new reinforcement phase begins, previous player just ended turn
      if (phaseRef.current === 'fortify' || (phaseRef.current && delta.phase === 'reinforcement')) {
        if (prevPlayer && prevPlayer !== nextPlayer) {
          const prevName = playerName.get(prevPlayer) || prevPlayer
          add(`${prevName} ended the turn.`)
        }
      }
      // Track phase changes and player order
      phaseRef.current = delta.phase
      if (delta.turn !== undefined) {
        lastTurnRef.current = delta.turn
      }
      if (delta.currentPlayer) {
        // When reinforcement starts for the next player, announce their start
        if (delta.phase === 'reinforcement') {
          const turn = delta.turn ?? prevTurn
          const name = playerName.get(delta.currentPlayer) || delta.currentPlayer
          if (turn !== prevTurn || !startedLoggedRef.current) {
            startedLoggedRef.current = true
            add(`${name} started the turn.`)
          }
          if (typeof delta.reinforcementArmies === 'number' && delta.reinforcementArmies > 0) {
            add(`${name} received ${delta.reinforcementArmies} troops.`)
          }
        }
        lastPlayerRef.current = delta.currentPlayer
      }
    }

    const logEliminations = (
      attackerId: string | undefined,
      eliminated: string[] | undefined,
      ts?: Date,
    ) => {
      if (!eliminated || eliminated.length === 0) {
        return
      }
      const attackerName = attackerId ? playerName.get(attackerId) || attackerId : 'Unknown'
      for (const eliminatedId of eliminated) {
        const defeatedName = playerName.get(eliminatedId) || eliminatedId
        add(`${defeatedName} was defeated by ${attackerName}.`, ts)
      }
    }

    const handleBattleResult = (delta: BattleResultDelta) => {
      if (redact) return
      const br = delta.battleResult
      const fromName = territoryName.get(br.fromTerritory.id) || br.fromTerritory.id
      const toName = territoryName.get(br.toTerritory.id) || br.toTerritory.id
      const attackerId = br.attackerId || lastPlayerRef.current || game?.currentPlayer || ''
      const defenderId = br.defenderId || undefined
      const attackerName = playerName.get(attackerId) || attackerId || 'Unknown'
      const defenderName = defenderId ? playerName.get(defenderId) || defenderId : undefined

      const killed = br.defenderLosses
      const lost = br.attackerLosses

      if (br.conquered) {
        add(
          `${fromName} (${attackerName}) attacked ${toName}${defenderName ? ` (${defenderName})` : ''} conquering it, killing ${killed}, losing ${lost}.`,
          undefined,
          [br.fromTerritory.id, br.toTerritory.id],
        )
        // Moved troops equals final armies on conquered territory
        const moved = br.toTerritory.armies
        if (moved && moved > 0) {
          add(`${fromName} (${attackerName}) occupied ${toName} with ${moved} troops.`, undefined, [
            br.fromTerritory.id,
            br.toTerritory.id,
          ])
        }
        logEliminations(attackerId, br.eliminatedPlayers, new Date(delta.timestamp))
      } else {
        add(
          `${fromName} (${attackerName}) attacked ${toName}${defenderName ? ` (${defenderName})` : ''} killing ${killed}, losing ${lost}.`,
          undefined,
          [br.fromTerritory.id, br.toTerritory.id],
        )
      }
    }

    const onDelta: Parameters<typeof socketService.on<'game-delta'>>[1] = (delta) => {
      const d = delta as unknown as GameDelta
      if (!d || (d as { roomId?: string }).roomId !== gameId) return

      if (d.type === 'SYSTEM_MESSAGE') {
        const sm = d as SystemMessageDelta
        add(sm.text, new Date(sm.timestamp))
        return
      }
      if (d.type === 'PHASE_CHANGE') {
        handlePhaseChange(d as PhaseChangeDelta)
        return
      }
      if (d.type === 'BATTLE_RESULT') {
        const brd = d as BattleResultDelta & { changes?: GameDelta[] }
        const hasEliminationList =
          Array.isArray(brd.battleResult.eliminatedPlayers) &&
          brd.battleResult.eliminatedPlayers.length > 0
        if (!redact) {
          handleBattleResult(brd)
        } else {
          logEliminations(
            brd.battleResult.attackerId,
            brd.battleResult.eliminatedPlayers,
            new Date(brd.timestamp),
          )
        }
        // Detect eliminations from nested player updates when not already provided
        if (!hasEliminationList) {
          try {
            const nested = (brd as { changes?: GameDelta[] }).changes
            const attackerId = brd.battleResult.attackerId || lastPlayerRef.current || ''
            if (Array.isArray(nested)) {
              for (const ch of nested) {
                if ((ch as { type?: string }).type === 'PLAYER_UPDATE') {
                  const pu = ch as import('@shared/types').PlayerDelta
                  if (pu.changes?.isEliminated) {
                    const defeatedId = pu.playerId
                    const defeatedName = playerName.get(defeatedId) || defeatedId
                    const attackerName = playerName.get(attackerId) || attackerId
                    add(`${defeatedName} was defeated by ${attackerName}.`)
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
        }
        return
      }
      if (d.type === 'FORTIFY_RESULT') {
        if (redact) return
        const fr = d as FortifyResultDelta
        const name = playerName.get(fr.playerId) || fr.playerId
        const fromName = territoryName.get(fr.fromTerritoryId) || fr.fromTerritoryId
        const toName = territoryName.get(fr.toTerritoryId) || fr.toTerritoryId
        const n = toSafeInt(fr.movedArmies, 0)
        add(
          `${toName} (${name}) was fortified from ${fromName} (${name}) with ${n} ${n === 1 ? 'troop' : 'troops'}.`,
          undefined,
          [fr.fromTerritoryId, fr.toTerritoryId],
        )
        return
      }
      if (d.type === 'TREASURE_AWARDED') {
        const ta = d as TreasureAwardedDelta
        const name = playerName.get(ta.userId) || ta.userId
        add(`${name} received a card.`)
        return
      }
      if (d.type === 'GAME_END') {
        add('Game finished.')
        return
      }
      if (d.type === 'TERRITORY_UPDATE') {
        // Infer reinforcements only during reinforcement phase and on positive diffs
        if (phaseRef.current === 'reinforcement' && !redact) {
          const prev = lastArmiesRef.current[d.territoryId] ?? 0
          const next = d.changes.armies ?? prev
          if (next > prev) {
            const ownerId = lastPlayerRef.current || game?.currentPlayer || ''
            const name = playerName.get(ownerId) || ownerId
            const terr = territoryName.get(d.territoryId) || d.territoryId
            const diff = next - prev
            add(`${terr} (${name}) was reinforced by ${name} with ${diff} troops.`)
          }
          lastArmiesRef.current[d.territoryId] = next
        } else {
          // Update snapshot to avoid noisy diffs later
          const next = d.changes.armies ?? lastArmiesRef.current[d.territoryId]
          if (typeof next === 'number') lastArmiesRef.current[d.territoryId] = next
        }
      }
    }

    socketService.on('player-joined', onPlayerJoined)
    socketService.on('lifecycle:update', onLifecycle)
    socketService.on('phaseChanged', onPhaseChangedLegacy)
    socketService.on('game-delta', onDelta)
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
          add(`${name} ${verb} ${Math.abs(ch.change)} rating.`, now)
        }
      } catch {
        /* ignore */
      }
    }
    socketService.on('ratingUpdate', onRating)

    return () => {
      socketService.off('player-joined', onPlayerJoined)
      socketService.off('lifecycle:update', onLifecycle)
      socketService.off('phaseChanged', onPhaseChangedLegacy)
      socketService.off('game-delta', onDelta)
      socketService.off('ratingUpdate', onRating)
    }
  }, [gameId, playerName, territoryName, game?.currentPlayer, redact, toSafeInt])

  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {entries.length === 0 && clientLogs.length === 0 ? (
          <div className="text-center text-muted py-6 text-sm">No log entries yet.</div>
        ) : (
          <div className="space-y-3">
            {(
              [
                ...clientLogs.map((l) => ({ ts: new Date(l.ts), text: l.text }) as LogEntry),
                ...entries,
              ] as LogEntry[]
            )
              .sort((a, b) => b.ts.getTime() - a.ts.getTime())
              .map((e) => {
                const key = `${e.ts.getTime()}-${e.text}`
                const clickable = Boolean(
                  onFocus && e.focusTerritories && e.focusTerritories.length > 0,
                )
                return (
                  <div key={key} className="text-sm">
                    <div className="text-xs text-muted">{formatTimestamp(e.ts)}</div>
                    {clickable ? (
                      <button
                        type="button"
                        className="text-left text-white underline underline-offset-2 hover:text-[color:var(--color-accent)]"
                        onClick={() => e.focusTerritories && onFocus?.(e.focusTerritories)}
                      >
                        {e.text}
                      </button>
                    ) : (
                      <div className="text-white">{e.text}</div>
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
