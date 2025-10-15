import { computeConquestProbability } from '@conquestk/shared/utils/battleOdds'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'
import { gameService } from '@/services/gameService'
import { useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import type { GamePlayer } from '../types/game'

const FALLBACK_PLAYER_COLOR = '#F59E0B'

const extractFirstColorStop = (value?: string | null) => {
  if (!value) return null
  const lower = value.toLowerCase()
  if (!lower.includes('gradient')) return value
  const match = value.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/)
  return match ? match[1] : null
}

const resolvePlayerColor = (color?: string | null) => {
  if (!color) return FALLBACK_PLAYER_COLOR
  try {
    const mapped = getColorValue(color as PlayerColor)
    const solid = extractFirstColorStop(mapped) ?? extractFirstColorStop(color)
    return solid ?? FALLBACK_PLAYER_COLOR
  } catch {
    const solid = extractFirstColorStop(color)
    return solid ?? FALLBACK_PLAYER_COLOR
  }
}

interface GameOverModalProps {
  isOpen: boolean
  winners?: GamePlayer[]
  // Backward compatibility: single-winner prop may still be provided
  winner?: GamePlayer | null
  eliminatedPlayers: string[]
  onClose: () => void
  onNewGame?: () => void
  onBackToMenu?: () => void
  newGameLabel?: string
  roomId?: string
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  winners: winnersProp,
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
  const winners = React.useMemo(
    () => (winnersProp?.length ? winnersProp : winner ? [winner] : []),
    [winnersProp, winner],
  )
  const isCurrentUserWinner = winners.some((w) => w.id === currentUserId)
  const isCurrentUserLoser = winners.length > 0 && !isCurrentUserWinner
  // Removed local rating toast; rank change now surfaces via global notifications
  const primaryWinnerColor = useMemo(() => {
    if (!winners.length) return null
    return resolvePlayerColor(winners[0]?.color)
  }, [winners])
  const headerBackground = useMemo(() => {
    if (!winners.length) {
      return 'linear-gradient(120deg, rgba(34,38,56,0.97), rgba(16,19,31,0.97))'
    }
    if (primaryWinnerColor) {
      return isCurrentUserWinner
        ? `linear-gradient(120deg, ${primaryWinnerColor}, rgba(18,21,32,0.95))`
        : `linear-gradient(120deg, rgba(18,21,32,0.95), ${primaryWinnerColor})`
    }
    return isCurrentUserWinner
      ? 'linear-gradient(120deg, rgba(223,175,55,0.96), rgba(108,92,231,0.95))'
      : 'linear-gradient(120deg, rgba(34,38,56,0.97), rgba(16,19,31,0.97))'
  }, [isCurrentUserWinner, primaryWinnerColor, winners.length])
  const previousThemeRef = useRef<string | null>(null)
  const aggressionLabel = useMemo(() => {
    const primary = winners[0]
    if (!primary) return null
    const territoryTotal = primary.territories.length
    if (territoryTotal >= 20) return 'Conqueror'
    if (territoryTotal >= 10) return 'Opportunist'
    return 'Patient tactician'
  }, [winners])

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

  // No-op: rating delta is now handled globally via socket notifications

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:color-mix(in_srgb,var(--surface-1)_8%,black)] backdrop-blur-sm px-4 py-8">
      <div className="relative w-full max-w-5xl">
        {/* Rating change animation moved to a global overlay opened via notifications */}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-1 shadow-2xl">
          <div
            className="space-y-6 p-6 lg:p-8"
            style={{
              maxHeight: 'min(90vh, calc(100vh - 2rem))',
              WebkitOverflowScrolling: 'touch',
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            {/* Header */}
            <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6">
              <div
                className="relative overflow-hidden rounded-b-2xl border-b border-border/60 text-center shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
                style={{ background: headerBackground }}
              >
                <div
                  className="pointer-events-none absolute inset-0 bg-[color:color-mix(in_srgb,black_40%,transparent)]"
                  aria-hidden="true"
                />
                <div
                  className="relative px-6 pb-8 pt-10 text-white backdrop-blur"
                  style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)' }}
                >
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white transition hover:scale-105 hover:bg-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    aria-label="Close game report"
                  >
                    ×
                  </button>
                  <div className="mb-4 text-6xl drop-shadow-sm">
                    {isCurrentUserWinner ? '🏆' : winners.length > 0 ? '💀' : '🏳️'}
                  </div>
                  <h2 className="mb-2 text-3xl font-extrabold text-white">
                    {winners.length > 0
                      ? isCurrentUserWinner
                        ? 'Victory!'
                        : 'Defeat'
                      : 'Game Over'}
                  </h2>
                  <p className="mx-auto max-w-xl text-base text-white/90">
                    {winners.length > 0
                      ? isCurrentUserWinner
                        ? winners.length === 1
                          ? `${winners[0].username} conquers the world!`
                          : `${winners.map((w) => w.username).join(', ')} triumph!`
                        : winners.length === 1
                          ? `${winners[0].username} conquers the world.`
                          : `${winners.map((w) => w.username).join(', ')} triumph.`
                      : 'All players have been eliminated'}
                  </p>
                </div>
              </div>
            </div>

            {winners.length === 1 && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-xl border border-border/60 bg-surface-2/60 p-6 text-center shadow-inner">
                  <div
                    className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white shadow-lg"
                    style={{ backgroundColor: primaryWinnerColor ?? FALLBACK_PLAYER_COLOR }}
                  >
                    {winners[0].username.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-heading">
                    Champion: {winners[0].username}
                  </h3>
                  <p className="mx-auto mb-5 max-w-sm text-sm text-muted">
                    {winners[0].username} outmaneuvered every rival to claim the board. Here’s how
                    their empire finished the match.
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded-lg bg-surface-1/70 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted">
                        Final Territories
                      </div>
                      <div className="text-2xl font-semibold text-success">
                        {winners[0].territories.length}
                      </div>
                    </div>
                    <div className="rounded-lg bg-surface-1/70 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted">Total Armies</div>
                      <div className="text-2xl font-semibold text-success">{winners[0].armies}</div>
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
                      {winners[0].armies} troops standing guard.
                    </li>
                    <li>
                      <span className="font-semibold text-heading">Eliminations:</span>{' '}
                      {eliminatedPlayers.length}{' '}
                      {eliminatedPlayers.length === 1 ? 'rival' : 'rivals'} knocked out during the
                      march to victory.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {winners.length > 1 && (
              <div className="rounded-xl border border-border/60 bg-surface-2/60 p-6 shadow-inner">
                <h3 className="mb-4 text-center text-xl font-bold text-heading">Champions</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {winners.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center gap-3 rounded-lg bg-surface-1/70 p-3"
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: w.color }}
                        title={w.username}
                      >
                        {w.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-heading">{w.username}</div>
                        <div className="text-xs text-muted">
                          Territories: {w.territories.length} • Armies: {w.armies}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Removed the per-turn elimination chip section (not helpful per feedback) */}

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

            {/* Player Debrief + Final Standings */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <FinalStandings className="h-full" {...(roomId ? { roomId } : {})} />
              {roomId && <KeyMomentsTimeline roomId={roomId} className="h-full" />}
            </div>

            {roomId && (
              <>
                <PlayerDebrief roomId={roomId} {...(currentUserId ? { currentUserId } : {})} />
                <PostGameCharts roomId={roomId} className="shadow-inner" />
              </>
            )}

            {/* Action Buttons */}
            <div
              className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-3 border-t border-border/60 bg-surface-1/95 px-6 pt-4 backdrop-blur sm:flex-row sm:justify-end"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
            >
              {roomId && (
                <a
                  href={`/replay/${roomId}`}
                  className="flex-1 rounded-lg bg-secondary px-4 py-3 font-semibold text-white transition-all hover:brightness-110 sm:flex-none sm:min-w-[11rem] text-center"
                >
                  ▶ Watch Replay
                </a>
              )}
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
    </div>
  )
}

const FinalStandings: React.FC<{ className?: string; roomId?: string }> = ({ className }) => {
  const game = useAppSelector((s) => s.game.currentGame)
  const players = game?.players ?? []
  const [elimTurn, setElimTurn] = React.useState<Record<string, number | null>>({})
  const [cpDelta, setCpDelta] = React.useState<Record<string, number>>({})
  const territoriesByPlayer = new Map<string, number>()
  const armiesByPlayer = new Map<string, number>()

  React.useEffect(() => {
    // Optional elimination turn and CP deltas previously fetched via legacy /log; skip for now.
    setElimTurn((prev) => ({ ...prev }))
    setCpDelta((prev) => ({ ...prev }))
    // no deps required; derived from current game state at render time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!game) return null

  for (const t of game.board) {
    if (!t.ownerId) continue
    territoriesByPlayer.set(t.ownerId, (territoriesByPlayer.get(t.ownerId) ?? 0) + 1)
    armiesByPlayer.set(t.ownerId, (armiesByPlayer.get(t.ownerId) ?? 0) + t.armies)
  }
  const idToPlayer = new Map(players.map((p) => [p.id, p]))
  const allowTeamPlay = Boolean(
    (game as unknown as { gameConfig?: { allowTeamPlay?: boolean } })?.gameConfig?.allowTeamPlay,
  )
  const activePlayers = players.filter((p) => !p.isEliminated)
  const winningTeamId: number | null =
    allowTeamPlay && activePlayers.length > 0
      ? ((activePlayers[0] as unknown as { teamId?: number | null }).teamId ?? null)
      : null

  const entries = players.map((p) => ({
    id: p.id,
    name: p.username,
    color: resolvePlayerColor(p.color),
    territories: territoriesByPlayer.get(p.id) ?? 0,
    armies: armiesByPlayer.get(p.id) ?? 0,
    eliminated: p.isEliminated,
    eliminatedTurn: elimTurn[p.id] ?? null,
    teamWinner:
      allowTeamPlay && winningTeamId !== null
        ? ((idToPlayer.get(p.id) as unknown as { teamId?: number | null })?.teamId ?? null) ===
          winningTeamId
        : false,
    cp:
      typeof cpDelta[p.id] === 'number'
        ? cpDelta[p.id]
        : typeof cpDelta[(p as unknown as { userId?: string }).userId || ''] === 'number'
          ? cpDelta[(p as unknown as { userId?: string }).userId as string]
          : null,
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
              <div className={`font-medium ${e.eliminated ? 'opacity-80' : ''}`}>
                {idx + 1}. {e.name} {e.eliminated ? <span title="Eliminated">💀</span> : null}
                {e.eliminated && e.teamWinner ? (
                  <span
                    className="ml-2 inline-flex items-center gap-1 rounded bg-[color:var(--surface-2)] px-2 py-0.5 text-[10px] text-success border border-[color:var(--panel-border)]"
                    title="Your team won"
                  >
                    🏆 Team Victory
                  </span>
                ) : null}
                {typeof e.cp === 'number' ? (
                  <span
                    className={`ml-2 text-[10px] ${e.cp >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    title="CP change"
                  >
                    {e.cp >= 0 ? `+${e.cp}` : e.cp} CP
                  </span>
                ) : null}
                {e.eliminated && e.eliminatedTurn ? (
                  <div className="text-[10px] text-muted">Eliminated on T{e.eliminatedTurn}</div>
                ) : null}
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

const PlayerDebrief: React.FC<{
  roomId: string
  currentUserId?: string
  onRatingDelta?: (delta: number | null) => void
}> = ({ roomId, currentUserId, onRatingDelta }) => {
  const game = useAppSelector((s) => s.game.currentGame)
  const [stats, setStats] = React.useState<Array<Record<string, unknown>> | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [cpChange, setCpChange] = React.useState<number | null>(null)
  const [contested, setContested] = React.useState<
    Array<{ id: string; name: string; flips: number }>
  >([])
  const [longest, setLongest] = React.useState<{ from: string; to: string; rolls: number } | null>(
    null,
  )
  const me = React.useMemo(() => {
    if (!game || !currentUserId) return null
    return game.players.find((p) => p.userId === currentUserId) || null
  }, [game, currentUserId])

  React.useEffect(() => {
    let active = true
    const run = async () => {
      try {
        if (!game) return
        const summary = await gameService.getReplaySummary(roomId)
        const total = Math.max(1, summary.turns)
        const CHUNK = 25
        const snaps: Array<Record<string, unknown>> = []
        const flipsCount: Record<string, number> = {}
        let bestStreak = { from: '', to: '', rolls: 0 }
        for (let from = 1; from <= total; from += CHUNK) {
          const to = Math.min(total, from + CHUNK - 1)
          const resp = await gameService.getReplayChunk(roomId, from, to)
          const batch = Array.isArray(resp?.items)
            ? (resp.items as Array<Record<string, unknown>>)
            : []
          for (const it of batch) {
            // snaps for per-turn maxima
            const post = ((it as { postArmyMap?: unknown }).postArmyMap ||
              (it as { preArmyMap?: unknown }).preArmyMap ||
              {}) as Record<string, { ownerId: string | null; armies: number }>
            const byPlayer: Record<
              string,
              { id: string; territories: number; armies: number; eliminated?: boolean }
            > = {}
            for (const [, val] of Object.entries(post)) {
              const owner = (val?.ownerId ?? null) as string | null
              const armies = Number(val?.armies || 0)
              if (!owner) continue
              if (!byPlayer[owner]) byPlayer[owner] = { id: owner, territories: 0, armies: 0 }
              byPlayer[owner].territories += 1
              byPlayer[owner].armies += armies
            }
            snaps.push({
              turn: Number((it as { turnNumber?: number }).turnNumber || 0),
              players: Object.values(byPlayer),
            })
            // contested territories via flips
            const pre =
              (it as { preArmyMap?: Record<string, { ownerId: string | null; armies: number }> })
                .preArmyMap || ({} as Record<string, { ownerId: string | null; armies: number }>)
            for (const [tid, preVal] of Object.entries(pre)) {
              const pv = preVal?.ownerId ?? null
              const nv = (post[tid]?.ownerId ?? null) as string | null
              if (pv !== nv && nv !== null) flipsCount[tid] = (flipsCount[tid] ?? 0) + 1
            }
            // longest engagement: streak of same attack path
            const paths = Array.isArray((it as { paths?: unknown[] }).paths)
              ? (it as { paths?: Array<{ from: string; to: string; kind: string }> }).paths || []
              : []
            let curFrom = ''
            let curTo = ''
            let streak = 0
            for (const p of paths) {
              if (p.kind !== 'attack') continue
              if (p.from === curFrom && p.to === curTo) {
                streak += 1
              } else {
                curFrom = p.from
                curTo = p.to
                streak = 1
              }
              if (streak > bestStreak.rolls)
                bestStreak = { from: curFrom, to: curTo, rolls: streak }
            }
          }
        }
        if (!active) return
        setStats(snaps)
        // contested list top 5
        const nameOf = (id: string) => game?.board.find((t) => t.id === id)?.name ?? id
        const sorted = Object.entries(flipsCount)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 5)
          .map(([id, flips]) => ({ id, name: nameOf(id), flips: Number(flips) }))
        setContested(sorted)
        setLongest(
          bestStreak.rolls > 1
            ? { from: nameOf(bestStreak.from), to: nameOf(bestStreak.to), rolls: bestStreak.rolls }
            : null,
        )
        setCpChange(null)
        onRatingDelta?.(null)
        setError(null)
      } catch (_e) {
        if (!active) return
        setError('Unable to load debrief stats')
        setStats([])
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [game, onRatingDelta, roomId])

  if (!game || !me) return null

  // Compute final counts from board
  const territoriesByPlayer = new Map<string, number>()
  const armiesByPlayer = new Map<string, number>()
  for (const t of game.board) {
    if (!t.ownerId) continue
    territoriesByPlayer.set(t.ownerId, (territoriesByPlayer.get(t.ownerId) ?? 0) + 1)
    armiesByPlayer.set(t.ownerId, (armiesByPlayer.get(t.ownerId) ?? 0) + t.armies)
  }
  const finalTerritories = territoriesByPlayer.get(me.id) ?? 0
  const finalArmies = armiesByPlayer.get(me.id) ?? 0

  // Derive largest army and most territories over time from stats
  let maxArmies = finalArmies
  let maxTerritories = finalTerritories
  let eliminatedTurn: number | null = null
  if (Array.isArray(stats)) {
    stats.forEach((snap, idx) => {
      const players =
        (
          snap as {
            players?: Array<{
              id: string
              territories?: number
              armies?: number
              eliminated?: boolean
            }>
          }
        ).players || []
      const entry = players.find((p) => p.id === me.id)
      if (entry) {
        if (typeof entry.armies === 'number')
          maxArmies = Math.max(maxArmies, Math.trunc(entry.armies))
        if (typeof entry.territories === 'number')
          maxTerritories = Math.max(maxTerritories, Math.trunc(entry.territories))
        if (entry.eliminated && eliminatedTurn === null) {
          const turnFromSnap = (snap as { turn?: number }).turn
          eliminatedTurn =
            typeof turnFromSnap === 'number' && turnFromSnap > 0 ? turnFromSnap : idx + 1
        }
      }
    })
  }

  const iWon =
    !me.isEliminated && game.players.filter((p) => !p.isEliminated).some((p) => p.id === me.id)

  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/50 p-4">
      <h4 className="mb-3 text-center font-semibold text-muted">Your Battle Debrief</h4>
      {error && <div className="mb-2 text-xs text-[color:var(--color-warning)]">{error}</div>}
      <ul className="grid gap-2 sm:grid-cols-2 text-sm">
        <li>
          <span className="font-semibold text-heading">Result:</span>{' '}
          {iWon ? 'Victory' : me.isEliminated ? 'Defeat' : 'Completed'}
        </li>
        <li>
          <span className="font-semibold text-heading">Final Territories:</span> {finalTerritories}
        </li>
        <li>
          <span className="font-semibold text-heading">Final Armies:</span> {finalArmies}
        </li>
        <li>
          <span className="font-semibold text-heading">Most Territories:</span> {maxTerritories}
        </li>
        <li>
          <span className="font-semibold text-heading">Largest Army:</span> {maxArmies}
        </li>
        {typeof cpChange === 'number' && (
          <li>
            <span className="font-semibold text-heading">CP Change:</span>{' '}
            <span className={cpChange >= 0 ? 'text-green-400' : 'text-red-400'}>
              {cpChange >= 0 ? `+${cpChange}` : cpChange}
            </span>
          </li>
        )}
        {me.isEliminated && (
          <li>
            <span className="font-semibold text-heading">Eliminated:</span>{' '}
            {eliminatedTurn ? `Turn T${eliminatedTurn}` : 'Yes'}
          </li>
        )}
        {contested.length > 0 && (
          <li className="sm:col-span-2">
            <span className="font-semibold text-heading">Most Contested:</span>{' '}
            {contested.map((c, i) => (
              <span key={c.id}>
                {i > 0 ? ', ' : ''}
                {c.name} ({c.flips})
              </span>
            ))}
          </li>
        )}
        {longest && (
          <li className="sm:col-span-2">
            <span className="font-semibold text-heading">Longest Engagement:</span> {longest.from} →{' '}
            {longest.to} ({longest.rolls} rolls)
          </li>
        )}
      </ul>
    </div>
  )
}

type LogEntry =
  | {
      type: 'TURN'
      timestamp: string
      playerId: string
      event: 'START' | 'END' | 'MISSED'
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
      initialFromArmies?: number
      initialToArmies?: number
    }
  | { type: 'TREASURE'; timestamp: string; userId: string; metal: string }
  | { type: 'LIFECYCLE'; timestamp: string; event: string }

const UNLIKELY_ENGAGEMENT_THRESHOLD = 0.25

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
        map.set(p.id, resolvePlayerColor(p.color))
      }
    }
    return map
  }, [game?.players])
  const territoryName = React.useCallback(
    (id?: string) => game?.board.find((t) => t.id === id)?.name ?? id ?? 'Unknown',
    [game?.board],
  )

  React.useEffect(() => {
    if (!roomId) return undefined
    let active = true
    const run = async () => {
      try {
        // Load full replay (in chunks) and derive significance per turn
        const summary = await gameService.getReplaySummary(roomId)
        const total = Math.max(1, summary.turns)
        const CHUNK = 25
        const items: Array<{
          turnNumber: number
          stats?: Record<string, unknown>
          preArmyMap?: Record<string, { ownerId: string | null; armies: number }>
          postArmyMap?: Record<string, { ownerId: string | null; armies: number }>
        }> = []
        for (let from = 1; from <= total; from += CHUNK) {
          const to = Math.min(total, from + CHUNK - 1)
          const resp = await gameService.getReplayChunk(roomId, from, to)
          const batch = Array.isArray(resp?.items)
            ? (resp.items as Array<Record<string, unknown>>)
            : []
          for (const it of batch) {
            items.push({
              turnNumber: Number((it as { turnNumber?: number }).turnNumber || 0),
              stats: (it as { stats?: Record<string, unknown> }).stats,
              preArmyMap: (
                it as { preArmyMap?: Record<string, { ownerId: string | null; armies: number }> }
              ).preArmyMap,
              postArmyMap: (
                it as { postArmyMap?: Record<string, { ownerId: string | null; armies: number }> }
              ).postArmyMap,
            })
          }
        }
        // Compute significance per turn: ownership flips + casualties + treasure events
        type KM = { key: string; label: string; detail: string; probability: number }
        const moments: KM[] = []
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const pre = (it.preArmyMap || {}) as Record<
            string,
            { ownerId: string | null; armies: number }
          >
          const post = (it.postArmyMap || {}) as Record<
            string,
            { ownerId: string | null; armies: number }
          >
          // ownership flips
          let flips = 0
          for (const [tid, preVal] of Object.entries(pre)) {
            const pv = preVal?.ownerId ?? null
            const nv = (post[tid]?.ownerId ?? null) as string | null
            if (pv !== nv && nv !== null) flips += 1
          }
          // casualties
          const st = (it.stats || {}) as {
            armiesKilled?: number
            armiesLost?: number
            treasuresRedeemed?: number
          }
          const casualties = Math.max(0, Number(st.armiesKilled || 0) + Number(st.armiesLost || 0))
          const treasure = Math.max(0, Number(st.treasuresRedeemed || 0))
          const score = flips * 2 + casualties * 0.02 + treasure * 1
          if (score > 0) {
            const label = `Turn ${it.turnNumber}`
            const detail = `${flips} flips • ${casualties} casualties${treasure ? ` • ${treasure} cash-ins` : ''}`
            moments.push({ key: `${it.turnNumber}`, label, detail, probability: score })
          }
        }
        // Top moments by score
        moments.sort((a, b) => b.probability - a.probability)
        const top = moments.slice(0, 6)
        // Store as faux LogEntry for display (reuse list style)
        const entries = top.map((m) => ({
          type: 'LIFECYCLE',
          timestamp: String(m.key),
        })) as unknown as LogEntry[]
        if (active) {
          setLog(entries)
          setError(null)
        }
      } catch (_e) {
        if (active) {
          setError('Unable to load key moments')
          setLog([])
        }
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
      }>

    // Group consecutive BATTLE entries into engagements
    type Engagement = {
      attackerId: string
      defenderId?: string | null
      fromId: string
      toId: string
      initFrom?: number
      initTo?: number
      conquered: boolean
      firstTs: string
      lastTs: string
    }
    const battles = log
      .filter((e): e is Extract<LogEntry, { type: 'BATTLE' }> => e.type === 'BATTLE')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const engagements: Engagement[] = []
    let current: Engagement | null = null
    for (const b of battles) {
      const same =
        current &&
        current.fromId === b.attackingTerritoryId &&
        current.toId === b.defendingTerritoryId &&
        current.attackerId === b.attackerId &&
        (current.defenderId || null) === (b.defenderId || null)
      if (!same) {
        if (current) engagements.push(current)
        const base: Engagement = {
          attackerId: b.attackerId,
          defenderId: b.defenderId,
          fromId: b.attackingTerritoryId,
          toId: b.defendingTerritoryId,
          conquered: Boolean(b.conquered),
          firstTs: b.timestamp,
          lastTs: b.timestamp,
        }
        const withInitFrom =
          typeof b.initialFromArmies === 'number' ? { initFrom: b.initialFromArmies } : {}
        const withInitTo =
          typeof b.initialToArmies === 'number' ? { initTo: b.initialToArmies } : {}
        current = { ...base, ...withInitFrom, ...withInitTo }
      } else {
        if (!current) {
          // Should not happen due to the guard above
          continue
        }
        // Keep the earliest initial stacks if present; update outcome and lastTs
        if (typeof current.initFrom !== 'number' && typeof b.initialFromArmies === 'number') {
          current.initFrom = b.initialFromArmies
        }
        if (typeof current.initTo !== 'number' && typeof b.initialToArmies === 'number') {
          current.initTo = b.initialToArmies
        }
        current.conquered = current.conquered || Boolean(b.conquered)
        current.lastTs = b.timestamp
      }
    }
    if (current) engagements.push(current)

    const moments: Array<{ key: string; label: string; detail: string; probability: number }> = []
    for (const e of engagements) {
      const a0 = typeof e.initFrom === 'number' ? Math.max(0, Math.trunc(e.initFrom)) : null
      const d0 = typeof e.initTo === 'number' ? Math.max(0, Math.trunc(e.initTo)) : null
      if (a0 == null || d0 == null || a0 <= 0 || d0 <= 0) continue
      const P = computeConquestProbability(a0, d0)
      // Unlikely conquest (attacker wins despite low odds), or unlikely hold (defender holds despite attacker having strong odds)
      const unlikelyConquest = e.conquered && P <= UNLIKELY_ENGAGEMENT_THRESHOLD
      const unlikelyHold = !e.conquered && P >= 1 - UNLIKELY_ENGAGEMENT_THRESHOLD
      if (!unlikelyConquest && !unlikelyHold) continue

      const attacker = playerName(e.attackerId)
      const defender = e.defenderId ? playerName(e.defenderId) : 'Neutral forces'
      const from = territoryName(e.fromId)
      const to = territoryName(e.toId)
      const probText = formatProbability(unlikelyConquest ? P : 1 - P)
      const label = unlikelyConquest
        ? `Unlikely conquest — ${attacker}`
        : `Unlikely hold — ${defender}`
      const detail = `${from} ${a0} → ${to} ${d0} • ${attacker} vs ${defender} • ≈${probText}% chance`
      moments.push({
        key: `${e.firstTs}-${e.lastTs}-${e.fromId}-${e.toId}`,
        label,
        detail,
        probability: unlikelyConquest ? P : 1 - P,
      })
    }

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
  const hasKeyMoments = sortedTimeline.length > 0 || unlikelyMoments.length > 0

  return (
    <div className={containerClass}>
      <h4 className="mb-3 text-center font-semibold text-muted">Key Moments</h4>
      {hasKeyMoments ? (
        <>
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
                    Odds reflect chance to conquer from the initial stacks.
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
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border/50 bg-surface-1/60 p-4 text-center text-xs text-muted">
          No notable events were captured for this battle. We'll surface key turns here once the
          game log includes more detail.
        </div>
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
    if (!roomId) return undefined
    let active = true
    const run = async () => {
      try {
        const summary = await gameService.getReplaySummary(roomId)
        const total = Math.max(1, summary.turns)
        const CHUNK = 25
        const snapshots: Array<Record<string, unknown>> = []
        for (let from = 1; from <= total; from += CHUNK) {
          const to = Math.min(total, from + CHUNK - 1)
          const resp = await gameService.getReplayChunk(roomId, from, to)
          const batch = Array.isArray(resp?.items)
            ? (resp.items as Array<Record<string, unknown>>)
            : []
          for (const it of batch) {
            const post = ((it as { postArmyMap?: unknown }).postArmyMap ||
              (it as { preArmyMap?: unknown }).preArmyMap ||
              {}) as Record<string, { ownerId: string | null; armies: number }>
            const byPlayer: Record<string, { id: string; territories: number; armies: number }> = {}
            for (const [, val] of Object.entries(post)) {
              const owner = (val?.ownerId ?? null) as string | null
              const armies = Number(val?.armies || 0)
              if (!owner) continue
              if (!byPlayer[owner]) byPlayer[owner] = { id: owner, territories: 0, armies: 0 }
              byPlayer[owner].territories += 1
              byPlayer[owner].armies += armies
            }
            snapshots.push({
              turn: (it as { turnNumber?: number }).turnNumber || 0,
              players: Object.values(byPlayer),
            })
          }
        }
        if (!active) return
        setStats(snapshots)
        const next: Record<string, boolean> = {}
        for (const p of players) next[p.id] = true
        setVisible(next)
        setError(null)
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
    color: resolvePlayerColor(p.color),
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
