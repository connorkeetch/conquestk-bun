import type { BattleResultDelta, GameDelta, PhaseChangeDelta } from '@shared/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppSelector } from '../../hooks/redux'
import { socketService } from '../../services/socketService'

type Props = {
  gameId: string
  className?: string
}

type LogEntry = {
  ts: Date
  text: string
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

export default function GameLogPanel({ gameId, className = '' }: Props) {
  const room = useAppSelector((s) => s.room.currentRoom)
  const game = useAppSelector((s) => s.game.currentGame)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const lastArmiesRef = useRef<Record<string, number>>({})
  const phaseRef = useRef<string | null>(null)
  const lastPlayerRef = useRef<string | null>(null)

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

  useEffect(() => {
    function add(text: string, ts?: Date) {
      setEntries((prev) => [{ ts: ts ?? new Date(), text }, ...prev].slice(0, 500))
    }

    const onPlayerJoined: Parameters<typeof socketService.on<'player-joined'>>[1] = (payload) => {
      if (!payload || payload.roomId !== gameId) return
      const name = payload.player.username
      add(`${name} joined the game.`)
    }

    const onLifecycle: Parameters<typeof socketService.on<'lifecycle:update'>>[1] = (payload) => {
      if (!payload || payload.roomId !== gameId) return
      if (payload.status === 'active') {
        add('Game started.')
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
        if (typeof delta.reinforcementArmies === 'number' && delta.reinforcementArmies > 0) {
          // best-effort territory count from current board snapshot
          const territoryCount = (game?.board || []).filter((t) => t.ownerId === nextPlayer).length
          if (territoryCount > 0) {
            add(
              `${name} received ${delta.reinforcementArmies} troops for ${territoryCount} territories.`,
            )
          } else {
            add(`${name} received ${delta.reinforcementArmies} troops.`)
          }
        }
        add(`${name} started the turn.`)
      }
    }

    const handleBattleResult = (delta: BattleResultDelta) => {
      const br = delta.battleResult
      const fromName = territoryName.get(br.fromTerritory.id) || br.fromTerritory.id
      const toName = territoryName.get(br.toTerritory.id) || br.toTerritory.id

      const attackerId = lastPlayerRef.current || game?.currentPlayer || ''
      const attackerName = playerName.get(attackerId) || attackerId || 'Unknown'

      const killed = br.defenderLosses
      const lost = br.attackerLosses

      if (br.conquered) {
        add(
          `${fromName} (${attackerName}) attacked ${toName} conquering it, killing ${killed}, losing ${lost}.`,
        )
        // Moved troops equals final armies on conquered territory
        const moved = br.toTerritory.armies
        if (moved && moved > 0) {
          add(`${fromName} (${attackerName}) occupied ${toName} with ${moved} troops.`)
        }
      } else {
        add(`${fromName} (${attackerName}) attacked ${toName} killing ${killed}, losing ${lost}.`)
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
        handleBattleResult(d as BattleResultDelta)
        return
      }
      if (d.type === 'TERRITORY_UPDATE') {
        // Infer reinforcements only during reinforcement phase and on positive diffs
        if (phaseRef.current === 'reinforcement') {
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
  }, [gameId, playerName, territoryName, game?.board, game?.currentPlayer])

  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {entries.length === 0 ? (
          <div className="text-center text-muted py-6 text-sm">No log entries yet.</div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={`${e.ts.getTime()}-${e.text}`} className="text-sm">
                <div className="text-xs text-muted">{formatTimestamp(e.ts)}</div>
                <div className="text-white">{e.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
