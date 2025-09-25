import { Calendar, Crown, Medal, TrendingUp, Trophy, Users } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FEATURE_FLAGS } from '@/constants/featureFlags'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { logger } from '@/utils/logger'
import api from '../services/api'

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
  const clansEnabled = useFeatureFlag(FEATURE_FLAGS.CLANS_CORE)
  const [leaderboardTab, setLeaderboardTab] = useState<'global' | 'monthly' | 'friends'>('global')
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([])
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([])
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchLeaderboardData = useCallback(async () => {
    setLoading(true)
    try {
      const endpoint =
        leaderboardTab === 'monthly'
          ? '/leaderboard/monthly'
          : leaderboardTab === 'friends'
            ? '/leaderboard/friends'
            : '/leaderboard/global'

      const response = await api.get(endpoint)

      if (leaderboardTab === 'global') {
        setGlobalLeaderboard(response.data.leaderboard || [])
      } else if (leaderboardTab === 'monthly') {
        setMonthlyLeaderboard(response.data.leaderboard || [])
      } else {
        setFriendsLeaderboard(response.data.leaderboard || [])
      }
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-primary-soft mb-2">Community Hub</h1>
          <p className="text-muted text-lg">
            Connect, compete, and celebrate with fellow commanders
          </p>
        </div>
      </div>

      {clansEnabled && (
        <div className="grid gap-6 md:grid-cols-2 mb-10">
          <Link to="/clans" className="group">
            <div className="glass-box-lg p-6 h-full flex flex-col gap-4 border border-primary/20 group-hover:border-primary/60 transition">
              <div className="flex items-center gap-3 text-primary-soft">
                <Users className="w-5 h-5" />
                <span className="text-sm uppercase tracking-[0.3em]">New</span>
              </div>
              <h2 className="text-2xl font-semibold text-white">Clans directory</h2>
              <p className="text-muted leading-relaxed">
                Explore featured clans, review their mission statements, and find the crew that
                matches your playstyle.
              </p>
              <div className="mt-auto flex items-center gap-2 text-primary-soft font-medium">
                Enter directory
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 transform group-hover:translate-x-1 transition"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </Link>
          <div className="glass-box-lg p-6 flex flex-col gap-4 border border-white/10">
            <h3 className="text-lg font-semibold text-white">Clan recruitment tips</h3>
            <ul className="text-muted text-sm space-y-2 list-disc list-inside">
              <li>Set expectations in your clan description so applicants know what you value.</li>
              <li>Encourage members to add their region and active hours in their profiles.</li>
              <li>Use announcements to celebrate wins and keep members engaged.</li>
            </ul>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10 text-primary-soft">
          <Trophy className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-semibold text-white">Leaderboard</h2>
      </div>

      {/* Leaderboard Content */}
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
                    ELO
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
                          <div className="text-sm font-medium text-white">{player.username}</div>
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
    </div>
  )
}

export default CommunityPage
