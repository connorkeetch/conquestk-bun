import { Calendar, Crown, Medal, TrendingUp, Trophy, Users } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
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
  const [leaderboardTab, setLeaderboardTab] = useState<'global' | 'monthly' | 'friends'>('global')
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([])
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([])
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchLeaderboardData()
  }, [leaderboardTab])

  const fetchLeaderboardData = async () => {
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
      console.error('Failed to fetch leaderboard:', error)
      // Set empty arrays on error
      if (leaderboardTab === 'global') setGlobalLeaderboard([])
      else if (leaderboardTab === 'monthly') setMonthlyLeaderboard([])
      else setFriendsLeaderboard([])
    } finally {
      setLoading(false)
    }
  }

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
            onClick={() => setLeaderboardTab('global')}
            className={`tab-pill ${leaderboardTab === 'global' ? 'tab-pill-active' : ''}`}
          >
            <Trophy className="w-4 h-4" />
            Global Rankings
          </button>
          <button
            onClick={() => setLeaderboardTab('monthly')}
            className={`tab-pill ${leaderboardTab === 'monthly' ? 'tab-pill-active' : ''}`}
          >
            <Calendar className="w-4 h-4" />
            This Month
          </button>
          <button
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
                            <div className="text-sm font-medium text-white">
                              {player.username}
                            </div>
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
