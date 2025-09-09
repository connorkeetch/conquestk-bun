import { Trophy, Medal, Users, Calendar, TrendingUp, MessageSquare, Shield, CalendarDays, Crown } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'clans' | 'forums' | 'events'>('leaderboard')
  const [leaderboardTab, setLeaderboardTab] = useState<'global' | 'monthly' | 'friends'>('global')
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([])
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([])
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      fetchLeaderboardData()
    }
  }, [leaderboardTab])

  const fetchLeaderboardData = async () => {
    setLoading(true)
    try {
      const endpoint = leaderboardTab === 'monthly' 
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
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-400" />
    if (rank === 2) return <Medal className="w-6 h-6 text-muted" />
    if (rank === 3) return <Medal className="w-6 h-6 text-amber-500" />
    return <span className="text-muted font-medium">#{rank}</span>
  }

  const currentLeaderboard = 
    leaderboardTab === 'monthly' ? monthlyLeaderboard :
    leaderboardTab === 'friends' ? friendsLeaderboard :
    globalLeaderboard

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">Community Hub</h1>
          <p className="text-muted">Connect, compete, and celebrate with fellow commanders</p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex gap-2 mb-8 border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'leaderboard' 
              ? 'text-violet-soft border-b-2 border-violet' 
              : 'text-muted hover:text-white'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Leaderboard
        </button>
        <button
          onClick={() => setActiveTab('clans')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'clans' 
              ? 'text-violet-soft border-b-2 border-violet' 
              : 'text-muted hover:text-muted cursor-not-allowed'
          }`}
          disabled
        >
          <Shield className="w-4 h-4" />
          Clans
          <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded">Soon</span>
        </button>
        <button
          onClick={() => setActiveTab('forums')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'forums' 
              ? 'text-violet-soft border-b-2 border-violet' 
              : 'text-muted hover:text-muted cursor-not-allowed'
          }`}
          disabled
        >
          <MessageSquare className="w-4 h-4" />
          Forums
          <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded">Soon</span>
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'events' 
              ? 'text-violet-soft border-b-2 border-violet' 
              : 'text-muted hover:text-muted cursor-not-allowed'
          }`}
          disabled
        >
          <CalendarDays className="w-4 h-4" />
          Events
          <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded">Soon</span>
        </button>
      </div>

      {/* Leaderboard Content */}
      {activeTab === 'leaderboard' && (
        <>
          {/* Leaderboard Sub-tabs */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setLeaderboardTab('global')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                leaderboardTab === 'global'
                  ? 'bg-violet text-white'
                  : 'bg-surface-2 text-muted hover:bg-surface-2'
              }`}
            >
              <Trophy className="inline w-4 h-4 mr-2" />
              Global Rankings
            </button>
            <button
              onClick={() => setLeaderboardTab('monthly')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                leaderboardTab === 'monthly'
                  ? 'bg-violet text-white'
                  : 'bg-surface-2 text-muted hover:bg-surface-2'
              }`}
            >
              <Calendar className="inline w-4 h-4 mr-2" />
              This Month
            </button>
            <button
              onClick={() => setLeaderboardTab('friends')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                leaderboardTab === 'friends'
                  ? 'bg-violet text-white'
                  : 'bg-surface-2 text-muted hover:bg-surface-2'
              }`}
            >
              <Users className="inline w-4 h-4 mr-2" />
              Friends
            </button>
          </div>

          {/* Leaderboard Table */}
          <div className="bg-surface-2 rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-16 text-center">
                <div className="text-muted">Loading leaderboard...</div>
              </div>
            ) : currentLeaderboard.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-1">
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
                  <tbody className="divide-y divide-gray-700">
                    {currentLeaderboard.map((player, index) => (
                      <tr
                        key={player.id}
                        className={`hover:bg-surface-2 transition-colors ${
                          index < 3 ? 'bg-surface-2/50' : ''
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
                            <TrendingUp className="w-4 h-4 text-green-400" />
                            <span className="text-white font-medium">{player.elo}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-muted">
                          {player.gamesPlayed || player.wins + player.losses}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-green-400">
                          {player.wins}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`font-medium ${
                            player.winRate > 60 ? 'text-green-400' :
                            player.winRate > 50 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
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
                <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-muted text-lg mb-2">No rankings available yet</p>
                <p className="text-muted text-sm">Play ranked games to appear on the leaderboard</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Clans Content */}
      {activeTab === 'clans' && (
        <div className="bg-surface-2 rounded-lg p-16 text-center">
          <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-muted text-lg mb-2">Clans Coming Soon</p>
          <p className="text-muted text-sm">Form alliances and compete as a team</p>
        </div>
      )}

      {/* Forums Content */}
      {activeTab === 'forums' && (
        <div className="bg-surface-2 rounded-lg p-16 text-center">
          <MessageSquare className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-muted text-lg mb-2">Forums Coming Soon</p>
          <p className="text-muted text-sm">Discuss strategies and connect with players</p>
        </div>
      )}

      {/* Events Content */}
      {activeTab === 'events' && (
        <div className="bg-surface-2 rounded-lg p-16 text-center">
          <CalendarDays className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-muted text-lg mb-2">Events & Tournaments Coming Soon</p>
          <p className="text-muted text-sm">Compete in special events for exclusive rewards</p>
        </div>
      )}
    </div>
  )
}

export default CommunityPage