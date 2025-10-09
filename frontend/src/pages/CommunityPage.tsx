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
  elo: number
  wins: number
  losses: number
  winRate: number
  rank: number
  gamesPlayed?: number
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

  const fetchLeaderboardData = useCallback(async () => {
    setLoading(true)
    try {
      // Only the global leaderboard endpoint exists server-side today.
      if (leaderboardTab !== 'global') {
        // No API for monthly/friends yet; show empty state without calling backend
        if (leaderboardTab === 'monthly') setMonthlyLeaderboard([])
        else setFriendsLeaderboard([])
        return
      }

      // Use skill leaderboard: GET /api/skills/leaderboards/skill
      const response = await api.get('/skills/leaderboards/skill', {
        params: { limit: 100 },
      })

      // Expected shape: { leaderboard: [...] }. Also support array fallback just in case.
      const raw = Array.isArray(response.data) ? response.data : response.data?.leaderboard || []

      type AnyLeaderboardLike = Partial<Record<string, string | number | null | undefined>>

      const asNumber = (value: unknown, fallback = 0): number =>
        typeof value === 'number'
          ? value
          : Number.isFinite(Number(value))
            ? Number(value)
            : fallback

      const asString = (value: unknown, fallback = ''): string =>
        typeof value === 'string' ? value : fallback

      const normalized: LeaderboardEntry[] = (raw as AnyLeaderboardLike[]).map(
        (entry, index: number) => {
          // Accept both profile leaderboard shape and older variants
          const userId = asString(entry.userId ?? entry.user_id ?? entry.id, '')
          const username = asString(entry.username, '')
          const rating = asNumber(entry.rating ?? entry.elo ?? entry.skillRating, 0)
          const gamesWon = asNumber(entry.gamesWon ?? entry.wins, 0)
          const rawGamesPlayed = entry.gamesPlayed
          const rawLosses = entry.losses
          const computedGamesPlayed =
            typeof rawGamesPlayed === 'number'
              ? rawGamesPlayed
              : typeof entry.wins === 'number' && typeof rawLosses === 'number'
                ? // fallback if only wins/losses provided
                  (entry.wins as number) + (rawLosses as number)
                : undefined
          const losses =
            typeof rawLosses === 'number'
              ? (rawLosses as number)
              : computedGamesPlayed != null
                ? Math.max(0, computedGamesPlayed - gamesWon)
                : 0
          const winRate = asNumber(entry.winRate, 0)
          const rank = asNumber(entry.rank, index + 1)

          return {
            id: userId,
            username,
            elo: Math.round(rating),
            wins: gamesWon,
            losses,
            winRate,
            rank,
            gamesPlayed: computedGamesPlayed ?? gamesWon + losses,
          }
        },
      )

      setGlobalLeaderboard(normalized)
    } catch (error) {
      logger.error('Failed to fetch leaderboard', error)
      // Set empty arrays on error
      if (leaderboardTab === 'global') setGlobalLeaderboard([])
      else if (leaderboardTab === 'monthly') setMonthlyLeaderboard([])
      else setFriendsLeaderboard([])
    } finally {
      setLoading(false)
    }
  }, [leaderboardTab])

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
                        CP
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
                    {currentLeaderboard.map((player, index) => (
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
                            <TrendingUp className="w-4 h-4 text-success" />
                            <span className="text-white font-medium">{player.elo}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-muted">
                          {player.gamesPlayed || player.wins + player.losses}
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
                    ))}
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
