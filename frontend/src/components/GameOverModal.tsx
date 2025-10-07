import { computeRollOdds } from '@shared/utils/combatOdds'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'
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
  const previousThemeRef = useRef<string | null>(null)
  const aggressionLabel = useMemo(() => {
    if (!winner) return null
    const territoryTotal = winner.territories.length
    if (territoryTotal >= 20) return 'Conqueror'
    if (territoryTotal >= 10) return 'Opportunist'
    return 'Patient tactician'
  }, [winner])

  const restoreTheme = useCallback(() => {
    const root = document.documentElement
    const prev = previousThemeRef.current
    if (prev) {
      root.setAttribute('data-theme', prev)
    } else {
      root.removeAttribute('data-theme')
    }
  }, [])

  // Keep the report styled within the active theme; avoid forcing a temporary theme
  useEffect(() => {
    if (!isOpen) return undefined
    const root = document.documentElement
    if (previousThemeRef.current === null) {
      previousThemeRef.current = root.getAttribute('data-theme')
    }
    return () => {
      restoreTheme()
    }
  }, [isOpen, restoreTheme])

  useEffect(() => {
    return () => {
      restoreTheme()
    }
  }, [restoreTheme])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-8">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-border/60 bg-surface-1 shadow-2xl">
        {/* Header */}
        <div
          className={`relative px-6 pb-8 pt-10 text-center ${
            winner
              ? 'bg-gradient-to-r from-gold to-violet/90 text-white'
              : 'bg-gradient-to-r from-surface-2/80 to-surface-1/60'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white transition hover:scale-105 hover:bg-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Close game report"
          >
            ×
          </button>
          <div className="mb-4 text-6xl drop-shadow-sm">{winner ? '🏆' : '🏳️'}</div>
          <h2 className="mb-2 text-3xl font-extrabold text-white">
            {winner ? 'Victory!' : 'Game Over'}
          </h2>
          <p className="mx-auto max-w-xl text-base text-white/90">
            {winner ? `${winner.username} conquers the world!` : 'All players have been eliminated'}
          </p>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6 lg:p-8">
          {winner && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-border/60 bg-surface-2/60 p-6 text-center shadow-inner">
                <div
                  className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white shadow-lg"
                  style={{ backgroundColor: winner.color }}
                >
                  {winner.username.charAt(0).toUpperCase()}
                </div>
                <h3 className="mb-2 text-xl font-bold text-heading">Champion: {winner.username}</h3>
                <p className="mx-auto mb-5 max-w-sm text-sm text-muted">
                  {winner.username} outmaneuvered every rival to claim the board. Here’s how their
                  empire finished the match.
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg bg-surface-1/70 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted">
                      Final Territories
                    </div>
                    <div className="text-2xl font-semibold text-success">
                      {winner.territories.length}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-1/70 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted">Total Armies</div>
                    <div className="text-2xl font-semibold text-success">{winner.armies}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface-2/60 p-6 text-left shadow-inner">
                <h4 className="mb-3 text-lg font-semibold text-heading">Battle Debrief</h4>
                <ul className="space-y-3 text-sm text-muted">
                  <li>
                    <span className="font-semibold text-heading">Aggression Meter:</span>{' '}
                    {aggressionLabel}
                  </li>
                  <li>
                    <span className="font-semibold text-heading">Final Army Strength:</span>{' '}
                    {winner.armies} troops standing guard.
                  </li>
                  <li>
                    <span className="font-semibold text-heading">Eliminations:</span>{' '}
                    {eliminatedPlayers.length} {eliminatedPlayers.length === 1 ? 'rival' : 'rivals'}{' '}
                    knocked out during the march to victory.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {eliminatedPlayers.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-danger-soft/40 p-4 text-center shadow-inner">
              <h4 className="mb-3 font-semibold text-muted">Players Eliminated This Turn</h4>
              <div className="flex flex-wrap justify-center gap-2">
                {eliminatedPlayers.map((playerId) => (
                  <div
                    key={playerId}
                    className="rounded-full bg-red-900/60 px-3 py-1 text-xs font-medium text-red-200"
                  >
                    Player eliminated
                  </div>
                ))}
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

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <FinalStandings className="h-full" />
            {roomId && <KeyMomentsTimeline roomId={roomId} className="h-full" />}
          </div>

          {roomId && <PostGameCharts roomId={roomId} className="shadow-inner" />}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            {onNewGame && (
              <button
                type="button"
                onClick={onNewGame}
                className="flex-1 rounded-lg bg-primary px-4 py-3 font-semibold text-white transition-all hover:brightness-110 sm:flex-none sm:min-w-[11rem]"
              >
                🎮 {newGameLabel}
              </button>
            )}
            {onBackToMenu && (
              <button
                type="button"
                onClick={onBackToMenu}
                className="flex-1 rounded-lg bg-surface-2 px-4 py-3 font-semibold text-text transition-all hover:brightness-110 sm:flex-none sm:min-w-[11rem]"
              >
                🏠 Back to Menu
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border bg-surface-1 px-4 py-3 font-semibold text-text transition-all hover:brightness-110 sm:flex-none sm:min-w-[11rem]"
            >
              📊 View Final Board
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const FinalStandings: React.FC<{ className?: string }> = ({ className }) => {
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
    <div className={`rounded-lg border border-border/60 bg-surface-2/50 p-4 ${className ?? ''}`}>
      <h4 className="mb-3 text-center font-semibold text-muted">Final Standings</h4>
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
      losses?: { attacker: number; defender: number }
      conquered: boolean
    }
  | { type: 'TREASURE'; timestamp: string; userId: string; metal: string }
  | { type: 'LIFECYCLE'; timestamp: string; event: string }

const DICE_COMBOS = [
  { attDice: 1 as const, defDice: 1 as const, odds: computeRollOdds(1, 1) },
  { attDice: 1 as const, defDice: 2 as const, odds: computeRollOdds(1, 2) },
  { attDice: 2 as const, defDice: 1 as const, odds: computeRollOdds(2, 1) },
  { attDice: 2 as const, defDice: 2 as const, odds: computeRollOdds(2, 2) },
  { attDice: 3 as const, defDice: 1 as const, odds: computeRollOdds(3, 1) },
  { attDice: 3 as const, defDice: 2 as const, odds: computeRollOdds(3, 2) },
] as const

type DiceProbability = {
  attDice: (typeof DICE_COMBOS)[number]['attDice']
  defDice: (typeof DICE_COMBOS)[number]['defDice']
  probability: number
}

const UNLIKELY_THRESHOLD = 0.33

const outcomeProbability = (
  odds: ReturnType<typeof computeRollOdds>,
  attackerLosses: number,
  defenderLosses: number,
) => {
  if (attackerLosses === 2 && defenderLosses === 0) return odds.probabilities.attackerLoses2
  if (attackerLosses === 0 && defenderLosses === 2) return odds.probabilities.defenderLoses2
  if (attackerLosses === 1 && defenderLosses === 1) return odds.probabilities.trade11
  if (attackerLosses === 1 && defenderLosses === 0) return odds.probabilities.attackerLoses1
  if (attackerLosses === 0 && defenderLosses === 1) return odds.probabilities.defenderLoses1
  return 0
}

const formatProbability = (value: number) => {
  if (!Number.isFinite(value)) return '0.0'
  const percent = value * 100
  return percent >= 10 ? percent.toFixed(1) : percent.toFixed(2)
}

const KeyMomentsTimeline: React.FC<{ roomId: string; className?: string }> = ({
  roomId,
  className,
}) => {
  const [log, setLog] = React.useState<LogEntry[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const game = useAppSelector((s) => s.game.currentGame)
  const playerName = React.useCallback(
    (id?: string | null) => game?.players.find((p) => p.id === id)?.username ?? id ?? 'Unknown',
    [game?.players],
  )
  const playerColor = React.useMemo(() => {
    const map = new Map<string, string>()
    if (game?.players) {
      for (const p of game.players) {
        try {
          map.set(p.id, getColorValue(p.color as unknown as PlayerColor))
        } catch {
          // ignore mapping issues
        }
      }
    }
    return map
  }, [game?.players])
  const territoryName = React.useCallback(
    (id?: string) => game?.board.find((t) => t.id === id)?.name ?? id ?? 'Unknown',
    [game?.board],
  )

  React.useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const resp = await gameService.getGameLog(roomId)
        const entries = Array.isArray(resp?.log) ? (resp.log as LogEntry[]) : []
        if (!active) return
        setLog(entries)
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

  const containerClass = `rounded-lg border border-border/60 bg-surface-2/50 p-4 ${className ?? ''}`

  const unlikelyMoments = React.useMemo(() => {
    if (!log)
      return [] as Array<{
        key: string
        label: string
        detail: string
        probability: number
        rangeText?: string
      }>

    const battles = log.filter(
      (entry): entry is Extract<LogEntry, { type: 'BATTLE' }> => entry.type === 'BATTLE',
    )
    const moments: Array<{
      key: string
      label: string
      detail: string
      probability: number
      rangeText?: string
    }> = []

    battles.forEach((battle, idx) => {
      const losses = battle.losses
      if (!losses) return

      const combos = DICE_COMBOS.map((combo) => {
        const probability = outcomeProbability(combo.odds, losses.attacker, losses.defender)
        return probability > 0
          ? ({
              attDice: combo.attDice,
              defDice: combo.defDice,
              probability,
            } satisfies DiceProbability)
          : null
      }).filter((combo): combo is DiceProbability => combo !== null)

      if (combos.length === 0) return

      const assumedCombo =
        combos.find((combo) => combo.attDice === 3 && combo.defDice === 2) ??
        combos.find((combo) => combo.attDice === 3 && combo.defDice === 1) ??
        combos.find((combo) => combo.attDice === 2 && combo.defDice === 2) ??
        combos[0]

      if (assumedCombo.probability > UNLIKELY_THRESHOLD) return

      const minProbability = Math.min(...combos.map((combo) => combo.probability))
      const maxProbability = Math.max(...combos.map((combo) => combo.probability))

      const attacker = playerName(battle.attackerId)
      const defender = battle.defenderId ? playerName(battle.defenderId) : 'Neutral forces'
      const from = territoryName(battle.attackingTerritoryId)
      const to = territoryName(battle.defendingTerritoryId)

      const label =
        losses.attacker >= losses.defender ? `Defensive stand at ${to}` : `Blitz at ${to}`
      const detail =
        losses.attacker >= losses.defender
          ? `${defender} held ${to} while ${attacker} lost ${losses.attacker} ${
              losses.attacker === 1 ? 'army' : 'armies'
            } in a single roll.`
          : `${attacker} overran ${defender} from ${from}, costing the defender ${losses.defender} ${
              losses.defender === 1 ? 'army' : 'armies'
            } instantly.`

      const rangeText =
        maxProbability - minProbability > 0.05
          ? `range ${formatProbability(minProbability)}–${formatProbability(maxProbability)}% depending on dice`
          : undefined

      moments.push({
        key: `${battle.timestamp}-${idx}`,
        label,
        detail,
        probability: assumedCombo.probability,
        rangeText,
      })
    })

    return moments.sort((a, b) => a.probability - b.probability).slice(0, 5)
  }, [log, playerName, territoryName])

  if (log === null) {
    return <div className={`${containerClass} text-sm text-muted`}>Loading key moments…</div>
  }
  if (error) {
    return (
      <div className={`${containerClass} text-sm text-[color:var(--color-warning)]`}>{error}</div>
    )
  }

  // Build a simple per-turn timeline of START events and notable battles (conquests)
  const turnStarts = log.filter(
    (e): e is Extract<LogEntry, { type: 'TURN' }> => e.type === 'TURN' && e.event === 'START',
  )
  const conquests = log.filter(
    (e): e is Extract<LogEntry, { type: 'BATTLE' }> => e.type === 'BATTLE' && e.conquered,
  )

  const timelineItems: Array<{
    when: string
    label: string
    labelRich?: React.ReactNode
    detail?: string
  }> = []
  for (const t of turnStarts) {
    const who = playerName(t.playerId)
    const r = typeof t.reinforcementArmies === 'number' ? `${t.reinforcementArmies} troops` : '—'
    const terr = typeof t.territoryCount === 'number' ? `${t.territoryCount} terr.` : '—'
    timelineItems.push({
      when: t.timestamp,
      label: `Turn start — ${who}`,
      labelRich: (
        <>
          Turn start —{' '}
          <span className="font-semibold" style={{ color: playerColor.get(t.playerId) }}>
            {who}
          </span>
        </>
      ),
      detail: `${r}, ${terr}`,
    })
  }
  for (const b of conquests) {
    const from = territoryName(b.attackingTerritoryId)
    const to = territoryName(b.defendingTerritoryId)
    const who = playerName(b.attackerId)
    timelineItems.push({
      when: b.timestamp,
      label: `Conquest — ${who}`,
      labelRich: (
        <>
          Conquest —{' '}
          <span className="font-semibold" style={{ color: playerColor.get(b.attackerId) }}>
            {who}
          </span>
        </>
      ),
      detail: `${from} → ${to}`,
    })
  }

  // Show up to the last 15 items, newest last
  const sortedTimeline = timelineItems
    .map((e) => ({ ...e, time: new Date(e.when).getTime() || 0 }))
    .sort((a, b) => a.time - b.time)
    .slice(-15)

  if (sortedTimeline.length === 0 && unlikelyMoments.length === 0) {
    return null
  }

  return (
    <div className={containerClass}>
      <h4 className="mb-3 text-center font-semibold text-muted">Key Moments</h4>
      {unlikelyMoments.length > 0 && (
        <div className="mb-4 space-y-2 rounded-lg border border-border/40 bg-surface-1/70 p-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-lg" aria-hidden="true">
              🎲
            </span>
            <div>
              <div className="font-semibold text-[color:var(--color-warning)]">
                Unlikely rolls spotted
              </div>
              <p className="text-xs text-muted">
                Odds assume both sides rolled the maximum dice available for that skirmish.
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {unlikelyMoments.map((moment) => (
              <li key={moment.key} className="rounded-md bg-surface-2/70 p-3">
                <div className="text-sm font-semibold text-heading">{moment.label}</div>
                <div className="text-xs text-muted">{moment.detail}</div>
                <div className="mt-1 text-xs font-semibold text-[color:var(--color-warning)]">
                  ≈{formatProbability(moment.probability)}% chance
                  {moment.rangeText ? ` • ${moment.rangeText}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sortedTimeline.length > 0 && (
        <ol className="space-y-2 text-sm">
          {sortedTimeline.map((e, idx) => (
            <li key={`${e.when}-${idx}`} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-2 w-2 rounded-full bg-primary" />
              <div>
                <div className="text-white">{e.labelRich ?? e.label}</div>
                {e.detail && <div className="text-xs text-muted">{e.detail}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// Lightweight SVG charts for Territories/Armies over time
const PostGameCharts: React.FC<{ roomId: string; className?: string }> = ({
  roomId,
  className,
}) => {
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

  // Hover tooltip state must be defined before any early returns
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)

  const containerClass = `rounded-lg border border-border/60 bg-surface-2/50 p-4 ${className ?? ''}`

  if (!players.length) return null
  if (stats === null) {
    return <div className={`${containerClass} text-sm text-muted`}>Preparing charts…</div>
  }
  if (error) {
    return (
      <div className={`${containerClass} text-sm text-[color:var(--color-warning)]`}>{error}</div>
    )
  }

  const snapshots = stats as Array<{
    turn?: number
    players?: Array<{ id: string; territories?: number; armies?: number; eliminated?: boolean }>
  }>

  const n = snapshots.length

  if (n < 1) return null

  type Series = { id: string; name: string; color: string; values: number[] }
  const series: Series[] = players.map((p) => ({
    id: p.id,
    name: p.username,
    color: p.color,
    values: [],
  }))
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
    <div className={containerClass}>
      <div className="mb-2 flex items-center justify-between">
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

      <div className="mb-3 flex flex-wrap gap-2">
        {series.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`text-xs px-2 py-1 rounded border ${visible[s.id] !== false ? 'opacity-100' : 'opacity-50'}`}
            style={{ borderColor: s.color, color: s.color }}
            onClick={() => setVisible((prev) => ({ ...prev, [s.id]: !(prev[s.id] ?? true) }))}
            aria-pressed={visible[s.id] !== false}
          >
            <span
              className="inline-block w-2 h-2 rounded-full mr-1"
              style={{ backgroundColor: s.color }}
            />
            {playerMap.get(s.id)?.username ?? s.id}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Post game chart"
        className="h-auto w-full"
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const x = e.clientX - rect.left
          const rawIdx = Math.round((x - pad) / xStep)
          // Bounds check: ensure index is within array bounds
          const idx = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < n ? rawIdx : null
          setHoverIdx(idx)
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Axes */}
        <line
          x1={pad}
          y1={pad + innerH}
          x2={pad + innerW}
          y2={pad + innerH}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {/* Y grid + labels */}
        {yLabels.map((label) => {
          const y = pad + innerH - (maxY === 0 ? 0 : (label / maxY) * innerH)
          return (
            <g key={`y-${label}`}>
              <line
                x1={pad}
                y1={y}
                x2={pad + innerW}
                y2={y}
                stroke="var(--border)"
                strokeOpacity="0.25"
                strokeWidth="1"
              />
              <text
                x={pad - 6}
                y={y + 3}
                textAnchor="end"
                className="text-[10px] fill-current"
                fill="currentColor"
              >
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
          const xStepLocal = innerW / Math.max(1, n - 1)
          return ticks.map((idx) => {
            const x = pad + idx * xStepLocal
            const label = `T${idx + 1}`
            return (
              <g key={`x-turn-${idx}`}>
                <line
                  x1={x}
                  y1={pad + innerH}
                  x2={x}
                  y2={pad + innerH + 4}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={pad + innerH + 14}
                  textAnchor="middle"
                  className="text-[10px] fill-current"
                  fill="currentColor"
                >
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
            <path
              key={s.id}
              d={pathFor(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
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
                // Bounds check: ensure hoverIdx is within values array
                if (hoverIdx >= s.values.length) return null
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
              .map((s) => {
                // Bounds check for tooltip values
                const value = hoverIdx < s.values.length ? s.values[hoverIdx] : 0
                return (
                  <div key={`tt-${s.id}`} className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-white truncate">
                      {playerMap.get(s.id)?.username ?? s.id}
                    </span>
                    <span className="ml-auto tabular-nums">{value}</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
