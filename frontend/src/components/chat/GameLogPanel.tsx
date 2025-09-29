import type {
  BattleResultDelta,
  FortifyResultDelta,
  GameDelta,
  PhaseChangeDelta,
  TreasureAwardedDelta,
} from '@shared/types'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [entries, setEntries] = useState<LogEntry[]>([])
  const lastArmiesRef = useRef<Record<string, number>>({})
  const phaseRef = useRef<string | null>(null)
  const lastPlayerRef = useRef<string | null>(null)
  const startedLoggedRef = useRef(false)
  const fogOn = (room?.fogOfWar ?? 'off') !== 'off'
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

  // Backfill full history after game ends
  useEffect(() => {
    if (!gameId || redact || backfillLoadedRef.current) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const raw = await gameService.getGameLog(gameId)
        if (cancelled) return
        // Format to display entries; build newest-first
        const formatted: LogEntry[] = []
        // We rely on current maps for names
        const toName = (id: string) => territoryName.get(id) || id
        const nameOf = (id: string | null | undefined) =>
          id ? playerName.get(id) || id : undefined
        // Sort ascending by timestamp then push and reverse
        const sorted = [...raw].sort(
          (a, b) =>
            new Date(String(a.timestamp)).getTime() - new Date(String(b.timestamp)).getTime(),
        )
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
  }, [gameId, redact, playerName, territoryName, toSafeInt])

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
      // When a new reinforcement phase begins, previous player just ended turn
      if (phaseRef.current === 'fortify' || (phaseRef.current && delta.phase === 'reinforcement')) {
        if (prevPlayer && prevPlayer !== nextPlayer) {
          const prevName = playerName.get(prevPlayer) || prevPlayer
          add(`${prevName} ended the turn.`)
        }
      }
      phaseRef.current = delta.phase
      lastPlayerRef.current = nextPlayer

      if (delta.phase === 'reinforcement') {
        const name = playerName.get(nextPlayer) || nextPlayer
        // In fog-of-war games during play, do not show reinforcement amounts
        if (!redact) {
          if (typeof delta.reinforcementArmies === 'number' && delta.reinforcementArmies > 0) {
            const territoryCount = (game?.board || []).filter(
              (t) => t.ownerId === nextPlayer,
            ).length
            if (territoryCount > 0) {
              add(
                `${name} received ${delta.reinforcementArmies} troops for ${territoryCount} territories.`,
              )
            } else {
              add(`${name} received ${delta.reinforcementArmies} troops.`)
            }
          }
        }
        add(`${name} started the turn.`)
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

      if (d.type === 'PHASE_CHANGE') {
        handlePhaseChange(d as PhaseChangeDelta)
        return
      }
      if (d.type === 'BATTLE_RESULT') {
        if (redact) return
        handleBattleResult(d as BattleResultDelta)
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
        if (redact) return
        const ta = d as TreasureAwardedDelta
        const name = playerName.get(ta.userId) || ta.userId
        add(`${name} received a card.`)
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

    return () => {
      socketService.off('player-joined', onPlayerJoined)
      socketService.off('lifecycle:update', onLifecycle)
      socketService.off('phaseChanged', onPhaseChangedLegacy)
      socketService.off('game-delta', onDelta)
    }
  }, [gameId, playerName, territoryName, game?.board, game?.currentPlayer, redact, toSafeInt])

  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {entries.length === 0 ? (
          <div className="text-center text-muted py-6 text-sm">No log entries yet.</div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => {
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
