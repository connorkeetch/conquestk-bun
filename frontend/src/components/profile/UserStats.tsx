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
  <div className="panel text-center space-y-2">
    <div className="text-4xl">🛰️</div>
    <p className="text-muted text-sm">{message}</p>
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
      <section className="panel space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-[color:var(--heading)] flex items-center gap-3">
              <span>📊</span>
              Battlefield summary
            </h2>
            <p className="text-sm text-muted">
              Tracking ranked matches from the ConquestK servers.
            </p>
          </div>
          {loading && (
            <div className="inline-flex items-center gap-2 text-sm text-muted">
              <span className="animate-spin">🔄</span>
              <span>Syncing stats…</span>
            </div>
          )}
        </div>

        {error && (
          <div className="panel-muted border-l-4 border-[color:var(--color-danger)] text-sm text-[color:var(--color-danger)]">
            {error}
          </div>
        )}

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          <div className="panel-muted space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-muted">Games played</h3>
            <div className="text-4xl font-semibold text-[color:var(--color-primary)]">
              {formatNumber(summary.gamesPlayed)}
            </div>
            <p className="text-xs text-muted">
              Wins {formatNumber(summary.wins)} · Losses {formatNumber(summary.losses)}
            </p>
          </div>
          <div className="panel-muted space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-muted">Win rate</h3>
            <div className="text-4xl font-semibold text-[color:var(--color-success)]">
              {formatPercent(summary.winRate)}
            </div>
            <p className="text-xs text-muted">Across all tracked matches</p>
          </div>
          <div className="panel-muted space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-muted">Win streak</h3>
            <div className="text-4xl font-semibold text-[color:var(--color-warning)]">
              {formatNumber(summary.longestWinStreak)}
            </div>
            <p className="text-xs text-muted">
              Current streak: {formatNumber(summary.currentWinStreak)}
            </p>
          </div>
          <div className="panel-muted space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-muted">Battle impact</h3>
            <div className="text-4xl font-semibold text-[color:var(--color-accent)]">
              {formatNumber(summary.eliminations)}
            </div>
            <p className="text-xs text-muted">
              Territories captured {formatNumber(summary.territoriesConquered)}
            </p>
          </div>
          <div className="panel-muted space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-muted">Territory mastery</h3>
            <div className="text-4xl font-semibold text-[color:var(--color-info)]">
              {formatNumber(summary.bestTerritories)}
            </div>
            <p className="text-xs text-muted">Most territories held at once</p>
            <p className="text-xs text-muted">
              Largest army {formatNumber(summary.bestArmies)} units
            </p>
          </div>
          <div className="panel-muted space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-muted">Card trades</h3>
            <div className="text-4xl font-semibold text-[color:var(--color-primary)]">
              {formatNumber(summary.cardTrades)}
            </div>
            <p className="text-xs text-muted">Cards redeemed {formatNumber(summary.cardsTraded)}</p>
          </div>
        </div>
      </section>

      {!isOwnProfile && (
        <section className="panel-muted border border-dashed border-[color:var(--panel-border)]">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔒</div>
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--heading)]">
                Detailed analytics are private
              </h3>
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
          <section className="panel space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-semibold text-[color:var(--heading)] flex items-center gap-3">
                <span>🗺️</span>
                Map performance
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
                  <div key={map.mapName} className="panel-muted space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-[color:var(--heading)]">
                        {map.mapName}
                      </h4>
                      <span className="text-xs text-muted uppercase tracking-widest">
                        {formatPercent(computeWinRate(map.wins, map.gamesPlayed))}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      Games {formatNumber(map.gamesPlayed)} · Wins {formatNumber(map.wins)}
                    </p>
                    <p className="text-xs text-muted">
                      Avg duration {formatDurationFromMinutes(map.averageGameLength)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-semibold text-[color:var(--heading)] flex items-center gap-3">
                <span>🎮</span>
                Game modes
              </h3>
            </div>
            {stats.gameModes.length === 0 ? (
              <EmptyState message="We haven't logged any completed matches yet." />
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                {stats.gameModes.map((mode) => (
                  <div key={mode.mode} className="panel-muted space-y-2">
                    <h4 className="text-lg font-semibold text-[color:var(--heading)] capitalize">
                      {mode.mode.replace(/_/g, ' ')}
                    </h4>
                    <p className="text-sm text-muted">
                      Games {formatNumber(mode.gamesPlayed)} · Wins {formatNumber(mode.wins)}
                    </p>
                    <p className="text-xs text-muted">
                      Avg duration {formatDurationFromMinutes(mode.averageGameLength)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel space-y-4">
            <h3 className="text-2xl font-semibold text-[color:var(--heading)] flex items-center gap-3">
              <span>📅</span>
              Last 90 days
            </h3>
            {stats.timeline.length === 0 ? (
              <EmptyState message="Play matches to populate your recent history." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table text-sm">
                  <thead className="bg-[color:var(--panel-bg-alt)] text-[color:var(--heading)]">
                    <tr>
                      <th>Date</th>
                      <th>Games</th>
                      <th>Wins</th>
                      <th>Win rate</th>
                      <th>Playtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.timeline.map((entry) => (
                      <tr key={entry.date} className="table-row">
                        <td>
                          {new Date(entry.date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td>{formatNumber(entry.gamesPlayed)}</td>
                        <td>{formatNumber(entry.wins)}</td>
                        <td>{formatPercent(computeWinRate(entry.wins, entry.gamesPlayed))}</td>
                        <td>{formatDurationFromMinutes(entry.playtimeMinutes)}</td>
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
