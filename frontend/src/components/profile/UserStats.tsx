import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAppSelector } from '../../hooks/redux'
import {
  type PlayerStatsBreakdown,
  type ProfileSummary,
  profileService,
} from '../../services/profileService'

interface UserStatsProps {
  profileSummary?: ProfileSummary | null
  isOwnProfile?: boolean
  username?: string
  initialStats?: PlayerStatsBreakdown | null
  disableFetch?: boolean
}

const numberFormatter = new Intl.NumberFormat()
const percentFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const formatNumber = (value: number): string => numberFormatter.format(value)
const formatPercent = (value: number): string => `${percentFormatter.format(value)}%`

const computeWinRate = (wins: number, gamesPlayed: number): number => {
  if (gamesPlayed <= 0) {
    return 0
  }
  return Math.round((wins / gamesPlayed) * 1000) / 10
}

const formatDurationFromMinutes = (minutes: number | undefined): string => {
  if (!minutes) {
    return '—'
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.round(minutes % 60)
  if (hours <= 0) {
    return `${remainingMinutes}m`
  }
  return `${hours}h ${remainingMinutes}m`
}

const deriveSummary = (
  profileSummary?: ProfileSummary | null,
  stats?: PlayerStatsBreakdown | null,
) => {
  const gamesPlayed = stats?.overall.gamesPlayed ?? profileSummary?.gamesPlayed ?? 0
  const wins = stats?.overall.wins ?? profileSummary?.wins ?? 0
  const losses = stats?.overall.losses ?? profileSummary?.losses ?? Math.max(0, gamesPlayed - wins)
  const winRate = stats?.overall.winRate ?? profileSummary?.winRate ?? 0
  const longestWinStreak = stats?.overall.longestWinStreak ?? 0
  const currentWinStreak = stats?.overall.currentWinStreak ?? 0
  const eliminations = stats?.overall.totalEliminations ?? 0
  const territoriesConquered = stats?.overall.territoriesConquered ?? 0
  const bestTerritories = stats?.overall.bestTerritories ?? 0
  const bestArmies = stats?.overall.bestArmies ?? 0
  const cardTrades = stats?.overall.cardTrades ?? 0
  const cardsTraded = stats?.overall.cardsTraded ?? 0

  return {
    gamesPlayed,
    wins,
    losses,
    winRate,
    longestWinStreak,
    currentWinStreak,
    eliminations,
    territoriesConquered,
    bestTerritories,
    bestArmies,
    cardTrades,
    cardsTraded,
  }
}

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-6 rounded-xl border border-white/10 bg-white/5 text-center text-muted">
    <div className="text-4xl mb-3">🛰️</div>
    <p>{message}</p>
  </div>
)

const UserStats: React.FC<UserStatsProps> = ({
  profileSummary,
  isOwnProfile = false,
  username,
  initialStats = null,
  disableFetch = false,
}) => {
  const { user } = useAppSelector((state) => state.auth)
  const [stats, setStats] = useState<PlayerStatsBreakdown | null>(initialStats)
  const [loading, setLoading] = useState<boolean>(isOwnProfile && !initialStats)
  const [error, setError] = useState<string | null>(null)

  // Keep stats state in sync with prefetched data
  useEffect(() => {
    if (initialStats) {
      setStats(initialStats)
      setLoading(false)
    }
  }, [initialStats])

  useEffect(() => {
    if (!isOwnProfile || !user?.id || initialStats || disableFetch) {
      setLoading(false)
      return
    }

    let isActive = true
    const fetchStats = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await profileService.getMyStats()
        if (!isActive) return
        setStats(response)
      } catch (_fetchError) {
        if (!isActive) return
        setError('Unable to load detailed statistics right now.')
        setStats(null)
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    void fetchStats()

    return () => {
      isActive = false
    }
  }, [isOwnProfile, user?.id, initialStats, disableFetch])

  const summary = useMemo(() => deriveSummary(profileSummary, stats), [profileSummary, stats])

  if (!profileSummary && !stats && !loading) {
    return (
      <EmptyState message="We don't have any battle records yet. Play a game to unlock stats." />
    )
  }

  return (
    <div className="space-y-10">
      <section className="glass-box-lg p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <span>📊</span>
              Battlefield Summary
            </h2>
            <p className="text-muted text-sm">Tracking real matches from the ConquestK servers.</p>
          </div>
          {loading && (
            <div className="inline-flex items-center gap-2 text-sm text-muted">
              <span className="animate-spin">🔄</span>
              <span>Syncing stats…</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-6 p-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          <div className="glass-box p-5">
            <h3 className="text-white/80 text-sm uppercase tracking-widest mb-3">Games Played</h3>
            <div className="text-4xl font-bold text-primary">
              {formatNumber(summary.gamesPlayed)}
            </div>
            <p className="text-xs text-muted mt-1">
              Wins {formatNumber(summary.wins)} · Losses {formatNumber(summary.losses)}
            </p>
          </div>
          <div className="glass-box p-5">
            <h3 className="text-white/80 text-sm uppercase tracking-widest mb-3">Win Rate</h3>
            <div className="text-4xl font-bold text-emerald-400">
              {formatPercent(summary.winRate)}
            </div>
            <p className="text-xs text-muted mt-1">Across all tracked matches</p>
          </div>
          <div className="glass-box p-5">
            <h3 className="text-white/80 text-sm uppercase tracking-widest mb-3">Win Streak</h3>
            <div className="text-4xl font-bold text-amber-300">
              {formatNumber(summary.longestWinStreak)}
            </div>
            <p className="text-xs text-muted mt-1">
              Current streak: {formatNumber(summary.currentWinStreak)}
            </p>
          </div>
          <div className="glass-box p-5">
            <h3 className="text-white/80 text-sm uppercase tracking-widest mb-3">Battle Impact</h3>
            <div className="text-4xl font-bold text-fuchsia-300">
              {formatNumber(summary.eliminations)}
            </div>
            <p className="text-xs text-muted mt-1">
              Territories conquered: {formatNumber(summary.territoriesConquered)}
            </p>
          </div>
          <div className="glass-box p-5">
            <h3 className="text-white/80 text-sm uppercase tracking-widest mb-3">
              Territory Mastery
            </h3>
            <div className="text-4xl font-bold text-cyan-300">
              {formatNumber(summary.bestTerritories)}
            </div>
            <p className="text-xs text-muted mt-1">Most territories held at once</p>
            <p className="text-xs text-muted mt-1">
              Strongest army: {formatNumber(summary.bestArmies)} units
            </p>
          </div>
          <div className="glass-box p-5">
            <h3 className="text-white/80 text-sm uppercase tracking-widest mb-3">Card Trades</h3>
            <div className="text-4xl font-bold text-indigo-300">
              {formatNumber(summary.cardTrades)}
            </div>
            <p className="text-xs text-muted mt-1">
              Cards redeemed: {formatNumber(summary.cardsTraded)}
            </p>
          </div>
        </div>
      </section>

      {!isOwnProfile && (
        <section className="glass-box p-6 border border-dashed border-white/20">
          <div className="flex gap-3 items-start">
            <div className="text-2xl">🔒</div>
            <div>
              <h3 className="text-lg font-semibold text-white">Detailed analytics are private</h3>
              <p className="text-sm text-muted">
                {username ? `${username}'s` : "This commander's"} detailed breakdown is only visible
                to them. Start a match to build your own statistics.
              </p>
            </div>
          </div>
        </section>
      )}

      {isOwnProfile && stats && (
        <>
          <section className="glass-box-lg p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-semibold text-white flex items-center gap-3">
                <span>🗺️</span>
                Map Performance
              </h3>
              <span className="text-xs uppercase tracking-widest text-muted">
                Updated{' '}
                {stats.overall.updatedAt
                  ? new Date(stats.overall.updatedAt).toLocaleDateString()
                  : 'recently'}
              </span>
            </div>
            {stats.maps.length === 0 ? (
              <EmptyState message="Play a match to unlock map-specific insights." />
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {stats.maps.map((map) => (
                  <div key={map.mapName} className="glass-box p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-semibold text-white">{map.mapName}</h4>
                      <span className="text-xs text-muted uppercase tracking-widest">
                        {formatPercent(computeWinRate(map.wins, map.gamesPlayed))}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      Games {formatNumber(map.gamesPlayed)} · Wins {formatNumber(map.wins)}
                    </p>
                    <p className="text-xs text-muted/80 mt-2">
                      Avg duration {formatDurationFromMinutes(map.averageGameLength)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass-box-lg p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-semibold text-white flex items-center gap-3">
                <span>🎮</span>
                Game Modes
              </h3>
            </div>
            {stats.gameModes.length === 0 ? (
              <EmptyState message="We haven't logged any completed matches yet." />
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                {stats.gameModes.map((mode) => (
                  <div key={mode.mode} className="glass-box p-4">
                    <h4 className="text-lg font-semibold text-white capitalize mb-1">
                      {mode.mode.replace(/_/g, ' ')}
                    </h4>
                    <p className="text-sm text-muted">
                      Games {formatNumber(mode.gamesPlayed)} · Wins {formatNumber(mode.wins)}
                    </p>
                    <p className="text-xs text-muted/80 mt-2">
                      Avg duration {formatDurationFromMinutes(mode.averageGameLength)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass-box-lg p-8 space-y-4">
            <h3 className="text-2xl font-semibold text-white flex items-center gap-3">
              <span>📅</span>
              Last 90 Days
            </h3>
            {stats.timeline.length === 0 ? (
              <EmptyState message="Play matches to populate your recent history." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="text-muted uppercase tracking-widest text-xs">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Games</th>
                      <th className="py-2 pr-4">Wins</th>
                      <th className="py-2 pr-4">Win Rate</th>
                      <th className="py-2 pr-4">Playtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.timeline.map((entry) => (
                      <tr key={entry.date} className="border-t border-white/5 text-white/80">
                        <td className="py-2 pr-4">
                          {new Date(entry.date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="py-2 pr-4">{formatNumber(entry.gamesPlayed)}</td>
                        <td className="py-2 pr-4">{formatNumber(entry.wins)}</td>
                        <td className="py-2 pr-4">
                          {formatPercent(computeWinRate(entry.wins, entry.gamesPlayed))}
                        </td>
                        <td className="py-2 pr-4">
                          {formatDurationFromMinutes(entry.playtimeMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default UserStats
