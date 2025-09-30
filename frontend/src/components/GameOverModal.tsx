import React, { useEffect } from 'react'
import { gameService } from '@/services/gameService'
import { useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import type { GamePlayer } from '../types/game'

interface GameOverModalProps {
  isOpen: boolean
  winner: GamePlayer | null
  eliminatedPlayers: string[]
  onClose: () => void
  onNewGame?: () => void
  onBackToMenu?: () => void
  newGameLabel?: string
  roomId?: string
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  winner,
  eliminatedPlayers,
  onClose,
  onNewGame,
  onBackToMenu,
  newGameLabel = 'New Game',
  roomId,
}) => {
  const guntsPrescriptions = useFeatureFlag('gunts_prescriptions')
  const currentUserId = useAppSelector((state) => state.auth.user?.id)
  const isCurrentUserLoser = winner && winner.id !== currentUserId

  // Victory state effect system
  useEffect(() => {
    if (isOpen && winner) {
      document.documentElement.setAttribute('data-theme', 'victory')

      // Remove after 5 seconds
      const timer = setTimeout(() => {
        document.documentElement.removeAttribute('data-theme')
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [isOpen, winner])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl max-w-lg w-full m-4 overflow-hidden">
        {/* Header */}
        <div
          className={`p-6 text-center ${
            winner
              ? 'bg-gradient-to-r from-gold to-violet animate-victory-pulse'
              : 'bg-gradient-to-r from-surface-2 to-surface-1'
          }`}
        >
          <div className="text-6xl mb-4">{winner ? '🏆' : '🏳️'}</div>
          <h2 className="text-3xl font-bold text-white mb-2">
            {winner ? 'Victory!' : 'Game Over'}
          </h2>
          <p className="text-white/90">
            {winner ? `${winner.username} conquers the world!` : 'All players have been eliminated'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {winner && (
            <div className="text-center mb-6">
              <div
                className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-white shadow-lg`}
                style={{ backgroundColor: winner.color }}
              >
                {winner.username.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Champion: {winner.username}</h3>
              <div className="bg-warning-soft border border-yellow-600/50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-yellow-300">Final Territories:</span>
                    <div className="text-yellow-200">{winner.territories.length}</div>
                  </div>
                  <div>
                    <span className="font-medium text-yellow-300">Total Armies:</span>
                    <div className="text-yellow-200">{winner.armies}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {eliminatedPlayers.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-muted mb-3 text-center">
                Players Eliminated This Turn
              </h4>
              <div className="bg-danger-soft border border-red-600/50 rounded-lg p-4">
                <div className="flex flex-wrap gap-2 justify-center">
                  {eliminatedPlayers.map((playerId) => (
                    <div
                      key={playerId}
                      className="bg-red-800/50 text-red-300 px-3 py-1 rounded-full text-sm"
                    >
                      Player eliminated
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Gunt's Prescription - Loss Message */}
          {guntsPrescriptions && isCurrentUserLoser && (
            <div className="bg-danger-soft border-2 border-red-600/50 rounded-lg p-6 mb-6">
              <div className="text-center">
                <h4 className="text-xl font-bold text-red-400 mb-4">
                  💊 Dr. Gunt's Prescription 💊
                </h4>
                <p className="text-red-300 mb-4 text-lg">"Take these L's and get better!"</p>
                <div className="flex justify-center gap-3 mb-4">
                  {/* Pill graphics with L's */}
                  <div className="bg-red-600 text-white rounded-full w-16 h-10 flex items-center justify-center font-bold text-xl shadow-lg transform rotate-12">
                    L
                  </div>
                  <div className="bg-red-500 text-white rounded-full w-16 h-10 flex items-center justify-center font-bold text-xl shadow-lg transform -rotate-6">
                    L
                  </div>
                  <div className="bg-red-600 text-white rounded-full w-16 h-10 flex items-center justify-center font-bold text-xl shadow-lg transform rotate-6">
                    L
                  </div>
                </div>
                <p className="text-red-200 text-sm italic">
                  Side effects may include: improved strategy, better dice rolls, and an
                  overwhelming desire to rematch.
                </p>
              </div>
            </div>
          )}

          {/* Final standings summary (armies and territories) */
          <FinalStandings />

          {/* Game progress charts */}
          {roomId && <PostGameCharts roomId={roomId} />}

          {/* Key moments timeline */}
          {roomId && <KeyMomentsTimeline roomId={roomId} />}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {onNewGame && (
              <button
                type="button"
                onClick={onNewGame}
                className="flex-1 bg-primary hover:brightness-110 text-white py-3 px-4 rounded-lg font-semibold transition-all"
              >
                🎮 {newGameLabel}
              </button>
            )}
            {onBackToMenu && (
              <button
                type="button"
                onClick={onBackToMenu}
                className="flex-1 bg-surface-2 hover:brightness-110 text-text py-3 px-4 rounded-lg font-semibold transition-all"
              >
                🏠 Back to Menu
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface-1 hover:brightness-110 text-text py-3 px-4 rounded-lg font-semibold transition-all border border-border"
            >
              📊 View Final Board
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const FinalStandings: React.FC = () => {
  const game = useAppSelector((s) => s.game.currentGame)
  if (!game) return null
  const players = game.players
  const territoriesByPlayer = new Map<string, number>()
  const armiesByPlayer = new Map<string, number>()
  for (const t of game.board) {
    if (!t.ownerId) continue
    territoriesByPlayer.set(t.ownerId, (territoriesByPlayer.get(t.ownerId) ?? 0) + 1)
    armiesByPlayer.set(t.ownerId, (armiesByPlayer.get(t.ownerId) ?? 0) + t.armies)
  }
  const entries = players.map((p) => ({
    id: p.id,
    name: p.username,
    color: p.color,
    territories: territoriesByPlayer.get(p.id) ?? 0,
    armies: armiesByPlayer.get(p.id) ?? 0,
    eliminated: p.isEliminated,
  }))
  const maxTerr = Math.max(1, ...entries.map((e) => e.territories))
  const maxArmy = Math.max(1, ...entries.map((e) => e.armies))
  const sorted = [...entries].sort((a, b) => b.territories - a.territories || b.armies - a.armies)

  return (
    <div className="bg-surface-2/50 rounded-lg p-4 mb-6">
      <h4 className="font-semibold text-muted mb-3 text-center">Final Standings</h4>
      <div className="space-y-3">
        {sorted.map((e, idx) => (
          <div key={e.id} className="grid grid-cols-12 items-center gap-2 text-sm">
            <div className="col-span-3 flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full border border-white"
                style={{ backgroundColor: e.color }}
              />
              <div className={`font-medium ${e.eliminated ? 'line-through opacity-75' : ''}`}>
                {idx + 1}. {e.name}
              </div>
            </div>
            <div className="col-span-5">
              <div className="text-xs text-muted">Territories ({e.territories})</div>
              <div className="h-2 bg-surface-1 rounded">
                <div
                  className="h-2 rounded"
                  style={{ width: `${(e.territories / maxTerr) * 100}%`, backgroundColor: e.color }}
                />
              </div>
            </div>
            <div className="col-span-4">
              <div className="text-xs text-muted">Armies ({e.armies})</div>
              <div className="h-2 bg-surface-1 rounded">
                <div
                  className="h-2 rounded"
                  style={{ width: `${(e.armies / maxArmy) * 100}%`, backgroundColor: e.color }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type LogEntry =
  | {
      type: 'TURN'
      timestamp: string
      playerId: string
      event: 'START' | 'END'
      reinforcementArmies?: number
      territoryCount?: number
    }
  | {
      type: 'BATTLE'
      timestamp: string
      attackingTerritoryId: string
      defendingTerritoryId: string
      attackerId: string
      defenderId: string | null
      conquered: boolean
    }
  | { type: 'TREASURE'; timestamp: string; userId: string; metal: string }
  | { type: 'LIFECYCLE'; timestamp: string; event: string }

const KeyMomentsTimeline: React.FC<{ roomId: string }> = ({ roomId }) => {
  const [log, setLog] = React.useState<LogEntry[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const game = useAppSelector((s) => s.game.currentGame)
  const playerName = React.useCallback(
    (id?: string | null) => game?.players.find((p) => p.id === id)?.username ?? id ?? 'Unknown',
    [game?.players],
  )
  const territoryName = React.useCallback(
    (id?: string) => game?.board.find((t) => t.id === id)?.name ?? id ?? 'Unknown',
    [game?.board],
  )

  React.useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const entries = (await gameService.getGameLog(roomId)) as LogEntry[]
        if (!active) return
        setLog(Array.isArray(entries) ? entries : [])
      } catch (_e) {
        if (!active) return
        setError('Unable to load game log')
        setLog([])
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [roomId])

  if (log === null) {
    return (
      <div className="bg-surface-2/50 rounded-lg p-4 mb-6 text-sm text-muted">
        Loading key moments…
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-surface-2/50 rounded-lg p-4 mb-6 text-sm text-[color:var(--color-warning)]">
        {error}
      </div>
    )
  }

  // Build a simple per-turn timeline of START events and notable battles (conquests)
  const turnStarts = log.filter((e) => e.type === 'TURN' && e.event === 'START') as Extract<
    LogEntry,
    { type: 'TURN' }
  >[]
  const conquests = log.filter((e) => e.type === 'BATTLE' && e.conquered) as Extract<
    LogEntry,
    { type: 'BATTLE' }
  >[]

  const items: Array<{ when: string; label: string; detail?: string }> = []
  for (const t of turnStarts) {
    const who = playerName(t.playerId)
    const r = typeof t.reinforcementArmies === 'number' ? `${t.reinforcementArmies} troops` : '—'
    const terr = typeof t.territoryCount === 'number' ? `${t.territoryCount} terr.` : '—'
    items.push({ when: t.timestamp, label: `Turn start — ${who}`, detail: `${r}, ${terr}` })
  }
  for (const b of conquests) {
    const from = territoryName(b.attackingTerritoryId)
    const to = territoryName(b.defendingTerritoryId)
    const who = playerName(b.attackerId)
    items.push({ when: b.timestamp, label: `Conquest — ${who}`, detail: `${from} → ${to}` })
  }

  // Show up to the last 15 items, newest last
  const sorted = items
    .map((e) => ({ ...e, time: new Date(e.when).getTime() || 0 }))
    .sort((a, b) => a.time - b.time)
    .slice(-15)

  if (sorted.length === 0) return null

  return (
    <div className="bg-surface-2/50 rounded-lg p-4 mb-6">
      <h4 className="font-semibold text-muted mb-3 text-center">Key Moments</h4>
      <ol className="space-y-2 text-sm">
        {sorted.map((e, idx) => (
          <li key={`${e.when}-${idx}`} className="flex items-start gap-2">
            <span className="mt-1 inline-block w-2 h-2 rounded-full bg-primary" />
            <div>
              <div className="text-white">{e.label}</div>
              {e.detail && <div className="text-muted text-xs">{e.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// Lightweight SVG charts for Territories/Armies over time
const PostGameCharts: React.FC<{ roomId: string }> = ({ roomId }) => {
  const game = useAppSelector((s) => s.game.currentGame)
  const [stats, setStats] = React.useState<Array<Record<string, unknown>> | null>(null)
  const [tab, setTab] = React.useState<'territories' | 'armies'>('territories')
  const [error, setError] = React.useState<string | null>(null)
  const [visible, setVisible] = React.useState<Record<string, boolean>>({})

  const players = game?.players ?? []
  const playerMap = React.useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  React.useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const res = await gameService.getGameLog(roomId)
        if (!active) return
        const raw = Array.isArray(res.stats) ? res.stats : []
        setStats(raw)
        // Default all series visible
        const next: Record<string, boolean> = {}
        for (const p of players) next[p.id] = true
        setVisible(next)
      } catch (_e) {
        if (!active) return
        setError('Unable to load turn stats')
        setStats([])
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [roomId, players])

  if (!players.length) return null
  if (stats === null) {
    return (
      <div className="bg-surface-2/50 rounded-lg p-4 mb-6 text-sm text-muted">Preparing charts…</div>
    )
  }
  if (error) {
    return (
      <div className="bg-surface-2/50 rounded-lg p-4 mb-6 text-sm text-[color:var(--color-warning)]">
        {error}
      </div>
    )
  }

  const snapshots = stats as Array<{
    turn?: number
    players?: Array<{ id: string; territories?: number; armies?: number; eliminated?: boolean }>
  }>

  const n = snapshots.length
  if (n < 1) return null

  type Series = { id: string; name: string; color: string; values: number[] }
  const series: Series[] = players.map((p) => ({ id: p.id, name: p.username, color: p.color, values: [] }))
  for (const snap of snapshots) {
    for (const s of series) {
      const entry = (snap.players || []).find((pp) => pp.id === s.id)
      s.values.push(
        tab === 'territories'
          ? Math.max(0, Math.trunc(entry?.territories ?? 0))
          : Math.max(0, Math.trunc(entry?.armies ?? 0)),
      )
    }
  }

  const maxY = Math.max(1, ...series.flatMap((s) => s.values))

  const W = 640
  const H = 200
  const pad = 24
  const innerW = W - pad * 2
  const innerH = H - pad * 2

  // Hover tooltip state
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
  const xStep = innerW / Math.max(1, n - 1)

  const pathFor = (vals: number[]) => {
    if (vals.length === 0) return ''
    const step = innerW / Math.max(1, vals.length - 1)
    return vals
      .map((v, i) => {
        const x = pad + i * step
        const y = pad + innerH - (maxY === 0 ? 0 : (v / maxY) * innerH)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')
  }

  const ticksY = 4
  const yLabels = Array.from({ length: ticksY + 1 }, (_, i) => Math.round((maxY * i) / ticksY))

  return (
    <div className="bg-surface-2/50 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-muted">Game Progress</h4>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className={`btn btn-secondary btn-xs ${tab === 'territories' ? 'opacity-100' : 'opacity-70'}`}
            onClick={() => setTab('territories')}
          >
            Territories
          </button>
          <button
            type="button"
            className={`btn btn-secondary btn-xs ${tab === 'armies' ? 'opacity-100' : 'opacity-70'}`}
            onClick={() => setTab('armies')}
          >
            Armies
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {series.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`text-xs px-2 py-1 rounded border ${visible[s.id] !== false ? 'opacity-100' : 'opacity-50'}`}
            style={{ borderColor: s.color, color: s.color }}
            onClick={() => setVisible((prev) => ({ ...prev, [s.id]: !(prev[s.id] ?? true) }))}
            aria-pressed={visible[s.id] !== false}
          >
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: s.color }} />
            {playerMap.get(s.id)?.username ?? s.id}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Post game chart"
        className="w-full h-auto"
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const x = e.clientX - rect.left
          const idx = Math.round((x - pad) / xStep)
          setHoverIdx(Number.isFinite(idx) ? Math.max(0, Math.min(n - 1, idx)) : null)
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Axes */}
        <line x1={pad} y1={pad + innerH} x2={pad + innerW} y2={pad + innerH} stroke="var(--border)" strokeWidth="1" />
        {/* Y grid + labels */}
        {yLabels.map((label, i) => {
          const y = pad + innerH - (maxY === 0 ? 0 : (label / maxY) * innerH)
          return (
            <g key={i}>
              <line x1={pad} y1={y} x2={pad + innerW} y2={y} stroke="var(--border)" strokeOpacity="0.25" strokeWidth="1" />
              <text x={pad - 6} y={y + 3} textAnchor="end" className="text-[10px] fill-current" fill="currentColor">
                {label}
              </text>
            </g>
          )
        })}

        {/* X ticks (turn labels) */}
        {(() => {
          const maxTicks = 8
          const count = Math.max(2, Math.min(maxTicks, n))
          const stepIndex = (n - 1) / (count - 1)
          const ticks = Array.from({ length: count }, (_, i) => Math.round(i * stepIndex))
          const xStep = innerW / Math.max(1, n - 1)
          return ticks.map((idx, i) => {
            const x = pad + idx * xStep
            const label = `T${idx + 1}`
            return (
              <g key={`x-${i}`}>
                <line x1={x} y1={pad + innerH} x2={x} y2={pad + innerH + 4} stroke="var(--border)" strokeWidth="1" />
                <text x={x} y={pad + innerH + 14} textAnchor="middle" className="text-[10px] fill-current" fill="currentColor">
                  {label}
                </text>
              </g>
            )
          })
        })()}

        {/* Series */}
        {series
          .filter((s) => visible[s.id] !== false)
          .map((s) => (
            <path key={s.id} d={pathFor(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}

        {/* Hover guideline and points */}
        {hoverIdx !== null && (
          <g>
            <line
              x1={pad + hoverIdx * xStep}
              y1={pad}
              x2={pad + hoverIdx * xStep}
              y2={pad + innerH}
              stroke="var(--border)"
              strokeOpacity="0.6"
              strokeDasharray="3 3"
            />
            {series
              .filter((s) => visible[s.id] !== false)
              .map((s) => {
                const v = s.values[hoverIdx]
                const y = pad + innerH - (maxY === 0 ? 0 : (v / maxY) * innerH)
                const x = pad + hoverIdx * xStep
                return <circle key={`pt-${s.id}`} cx={x} cy={y} r={3} fill={s.color} />
              })}
          </g>
        )}
      </svg>

      {/* Hover tooltip */}
      {hoverIdx !== null && (
        <div className="mt-1 text-xs bg-surface-2/90 border border-border rounded px-2 py-1 inline-block">
          <div className="font-medium text-muted">Turn {hoverIdx + 1}</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {series
              .filter((s) => visible[s.id] !== false)
              .map((s) => (
                <div key={`tt-${s.id}`} className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-white truncate">{playerMap.get(s.id)?.username ?? s.id}</span>
                  <span className="ml-auto tabular-nums">{s.values[hoverIdx]}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
