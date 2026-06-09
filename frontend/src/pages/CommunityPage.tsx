import { Calendar, Crown, Medal, TrendingUp, Trophy, Users } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
// Community hub with sub-navigation for Leaderboards and Clans
import { logger } from '@/utils/logger'
import api from '../services/api'
import ClanDirectoryPage from './ClanDirectoryPage'

interface LeaderboardEntry {
  id: string
  username: string
  rank: number
  skillRating?: number
  ratingGain?: number
  wins: number
  losses: number
  winRate: number
  gamesPlayed: number
}

const CommunityPage: React.FC = () => {
  const { section } = useParams<{ section?: string }>()
  const activeSection: 'leaderboard' | 'clans' = useMemo(() => {
    if (!section) return 'leaderboard'
    if (section.toLowerCase() === 'clans') return 'clans'
    if (section.toLowerCase().startsWith('leaderboard')) return 'leaderboard'
    return 'leaderboard'
  }, [section])
  const [leaderboardTab, setLeaderboardTab] = useState<'global' | 'monthly' | 'friends'>('global')
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([])
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([])
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)

  type AnyLeaderboardLike = Partial<Record<string, string | number | null | undefined>>

  const normalizeLeaderboard = useCallback(
    (payload: unknown, options?: { expectRatingGain?: boolean }): LeaderboardEntry[] => {
      const rawData =
        Array.isArray(payload) || payload == null
          ? payload
          : (payload as { leaderboard?: unknown }).leaderboard

      const rows = Array.isArray(rawData) ? (rawData as AnyLeaderboardLike[]) : []

      const toNumber = (value: unknown, fallback = 0): number =>
        typeof value === 'number'
          ? value
          : typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value))
            ? Number(value)
            : fallback

      const stringValue = (value: unknown, fallback = ''): string =>
        typeof value === 'string' ? value : fallback

      return rows
        .map<LeaderboardEntry | null>((entry, index) => {
          const userId = stringValue(entry.userId ?? entry.user_id ?? entry.id, '')
          if (!userId) {
            return null
          }

          const username = stringValue(entry.username, 'Commander')
          const rank = toNumber(entry.rank, index + 1)
          const wins = toNumber(entry.wins ?? entry.ranked_wins ?? entry.gamesWon, 0)
          const losses = toNumber(entry.losses ?? entry.ranked_losses, 0)
          const gamesPlayed = Math.max(
            0,
            toNumber(entry.gamesPlayed ?? entry.totalGames, wins + losses),
          )

          const computedWinRate =
            gamesPlayed > 0
              ? toNumber(entry.winRate ?? entry.win_rate, (wins / gamesPlayed) * 100)
              : 0

          const skillRating = toNumber(
            entry.skillRating ??
              entry.skill_rating ??
              entry.current_rating ??
              entry.rating ??
              entry.elo ??
              entry.cp,
            0,
          )

          const ratingGainValue = toNumber(
            entry.ratingGain ?? entry.rating_gain ?? entry.delta ?? entry.ratingChange,
            0,
          )

          return {
            id: userId,
            username,
            rank,
            skillRating,
            ...(options?.expectRatingGain ? { ratingGain: ratingGainValue } : {}),
            wins,
            losses,
            gamesPlayed,
            winRate: computedWinRate,
          }
        })
        .filter((entry): entry is LeaderboardEntry => entry !== null)
    },
    [],
  )

  const fetchLeaderboardData = useCallback(async () => {
    setLoading(true)
    try {
      if (leaderboardTab === 'global') {
        const response = await api.get('/skills/leaderboards/skill', {
          params: { limit: 100 },
        })
        setGlobalLeaderboard(normalizeLeaderboard(response.data))
        return
      }

      if (leaderboardTab === 'monthly') {
        const response = await api.get('/skills/leaderboards/skill', {
          params: { limit: 100, period: 'monthly' },
        })
        setMonthlyLeaderboard(normalizeLeaderboard(response.data, { expectRatingGain: true }))
        return
      }

      const response = await api.get('/skills/leaderboards/skill/friends', {
        params: { limit: 100 },
      })
      const metaPeriod =
        typeof response.data?.meta?.period === 'string'
          ? (response.data.meta.period as string).toLowerCase()
          : 'all_time'
      setFriendsLeaderboard(
        normalizeLeaderboard(response.data, { expectRatingGain: metaPeriod === 'monthly' }),
      )
    } catch (error) {
      logger.error('Failed to fetch leaderboard', error)
      // Set empty arrays on error
      if (leaderboardTab === 'global') setGlobalLeaderboard([])
      else if (leaderboardTab === 'monthly') setMonthlyLeaderboard([])
      else setFriendsLeaderboard([])
    } finally {
      setLoading(false)
    }
  }, [leaderboardTab, normalizeLeaderboard])

  useEffect(() => {
    fetchLeaderboardData()
  }, [fetchLeaderboardData])

  const renderRankBadge = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-warning" />
    if (rank === 2) return <Medal className="w-6 h-6 text-muted" />
    if (rank === 3) return <Medal className="w-6 h-6 text-warning" />
    return <span className="text-muted font-medium">#{rank}</span>
  }

  const currentLeaderboard =
    leaderboardTab === 'monthly'
      ? monthlyLeaderboard
      : leaderboardTab === 'friends'
        ? friendsLeaderboard
        : globalLeaderboard

  const cpColumnLabel = leaderboardTab === 'monthly' ? 'CP Gain' : 'CP'

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-primary-soft mb-1">Community Hub</h1>
          <p className="text-muted">Connect, compete, and celebrate with fellow commanders</p>
        </div>
      </div>

      {/* Community sub-navigation */}
      <div className="tabs-pills mb-6">
        <Link
          to="/community/leaderboards"
          className={`tab-pill ${activeSection === 'leaderboard' ? 'tab-pill-active' : ''}`}
        >
          <Trophy className="w-4 h-4" /> Leaderboards
        </Link>
        <Link
          to="/community/clans"
          className={`tab-pill ${activeSection === 'clans' ? 'tab-pill-active' : ''}`}
        >
          <Users className="w-4 h-4" /> Clans
        </Link>
      </div>

      {activeSection === 'clans' ? (
        <ClanDirectoryPage />
      ) : (
        <>
          {/* Leaderboard Sub-tabs */}
          <div className="tabs-pills mb-6">
            <button
              type="button"
              onClick={() => setLeaderboardTab('global')}
              className={`tab-pill ${leaderboardTab === 'global' ? 'tab-pill-active' : ''}`}
            >
              <Trophy className="w-4 h-4" />
              Global Rankings
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardTab('monthly')}
              className={`tab-pill ${leaderboardTab === 'monthly' ? 'tab-pill-active' : ''}`}
            >
              <Calendar className="w-4 h-4" />
              This Month
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardTab('friends')}
              className={`tab-pill ${leaderboardTab === 'friends' ? 'tab-pill-active' : ''}`}
            >
              <Users className="w-4 h-4" />
              Friends
            </button>
          </div>

          {/* Leaderboard Table */}
          <div className="glass-box-lg overflow-hidden p-0">
            {loading ? (
              <div className="p-16 text-center">
                <div className="text-muted">Loading leaderboard...</div>
              </div>
            ) : currentLeaderboard.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-ink border-b border-border">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Player
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-medium text-muted uppercase tracking-wider">
                        {cpColumnLabel}
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-medium text-muted uppercase tracking-wider">
                        Games
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-medium text-muted uppercase tracking-wider">
                        Wins
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-medium text-muted uppercase tracking-wider">
                        Win Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {currentLeaderboard.map((player, index) => {
                      const isMonthlyView = leaderboardTab === 'monthly'
                      const cpMetric = isMonthlyView
                        ? (player.ratingGain ?? 0)
                        : (player.skillRating ?? 0)
                      const roundedMetric = Math.round(cpMetric)
                      const cpDisplay = isMonthlyView
                        ? `${cpMetric >= 0 ? '+' : ''}${roundedMetric}`
                        : roundedMetric.toLocaleString()
                      const iconClass =
                        isMonthlyView && cpMetric < 0 ? 'text-danger' : 'text-success'
                      const textClass =
                        isMonthlyView && cpMetric < 0
                          ? 'text-danger font-medium'
                          : isMonthlyView
                            ? 'text-success font-medium'
                            : 'text-white font-medium'

                      return (
                        <tr
                          key={player.id}
                          className={`hover:bg-surface-2/50 transition-colors ${
                            index < 3 ? 'bg-surface-2/30' : ''
                          }`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            {renderRankBadge(player.rank || index + 1)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="ml-2">
                                <button
                                  type="button"
                                  onClick={() => setProfileUsername(player.username)}
                                  className="text-sm font-medium text-white underline-offset-2 hover:underline"
                                  title={`View ${player.username}'s profile`}
                                >
                                  {player.username}
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1">
                              <TrendingUp className={`w-4 h-4 ${iconClass}`} />
                              <span className={textClass}>{cpDisplay}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-muted">
                            {player.gamesPlayed}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-success">
                            {player.wins}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`font-medium ${
                                player.winRate > 60
                                  ? 'text-success'
                                  : player.winRate > 50
                                    ? 'text-warning'
                                    : 'text-danger'
                              }`}
                            >
                              {player.winRate.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-16 text-center">
                <Trophy className="w-16 h-16 text-muted mx-auto mb-4" />
                <p className="text-muted text-lg mb-2">No rankings available yet</p>
                <p className="text-muted text-sm">Play ranked games to appear on the leaderboard</p>
              </div>
            )}
          </div>
          <PlayerProfileModal
            open={profileUsername !== null}
            username={profileUsername}
            onClose={() => setProfileUsername(null)}
            context="global"
          />
        </>
      )}
    </div>
  )
}

export default CommunityPage
