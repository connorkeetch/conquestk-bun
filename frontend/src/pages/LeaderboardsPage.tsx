import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import SkillTierBadge from '../components/SkillTierBadge'
import { useAppSelector } from '../hooks/redux'

interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  skillRating: number
  tier: string
  confidence: number
  totalGames: number
  winRate: number
  recentTrend?: 'up' | 'down' | 'stable'
  lastChange?: number
}

const LeaderboardsPage: React.FC = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(0)
  const currentUser = useAppSelector((state) => state.auth.user)

  const ITEMS_PER_PAGE = 50

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: ITEMS_PER_PAGE.toString(),
        offset: (currentPage * ITEMS_PER_PAGE).toString(),
      })

      if (tierFilter !== 'all') {
        params.append('tier', tierFilter)
      }

      const response = await fetch(`/api/skills/leaderboards/skill?${params}`)

      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard')
      }

      const data = await response.json()
      setLeaderboard(data.leaderboard)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [ITEMS_PER_PAGE, currentPage, tierFilter])

  useEffect(() => {
    void fetchLeaderboard()
  }, [fetchLeaderboard])

  const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <span className="text-green-400">↑</span>
      case 'down':
        return <span className="text-red-400">↓</span>
      default:
        return <span className="text-muted">−</span>
    }
  }

  const tiers = ['all', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Master', 'Grandmaster']

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Skill Leaderboard</h1>
          <p className="text-muted">Top players ranked by Command Points (CP)</p>
        </div>

        {/* Tier Filter */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {tiers.map((tier) => (
              <button
                type="button"
                key={tier}
                onClick={() => {
                  setTierFilter(tier)
                  setCurrentPage(0)
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  tierFilter === tier
                    ? 'bg-primary text-white'
                    : 'bg-surface-1 text-muted hover:bg-surface-2'
                }`}
              >
                {tier === 'all' ? 'All Tiers' : tier}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-400">{error}</div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-12 text-muted">No players found in this tier</div>
        ) : (
          <div className="bg-surface-1 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-surface-1">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Rating
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Games
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Win Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {leaderboard.map((entry) => {
                  const isCurrentUser = currentUser?.id === entry.userId
                  return (
                    <tr
                      key={entry.userId}
                      className={`${
                        isCurrentUser ? 'bg-blue-900 bg-opacity-20' : 'hover:bg-surface-1'
                      } transition-colors`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span
                            className={`text-lg font-bold ${
                              entry.rank <= 3 ? 'text-yellow-400' : 'text-muted'
                            }`}
                          >
                            {entry.rank === 1 && '🏆 '}
                            {entry.rank === 2 && '🥈 '}
                            {entry.rank === 3 && '🥉 '}#{entry.rank}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          to={`/profile/${entry.userId}`}
                          className="text-primary-soft hover:text-primary-soft font-medium"
                        >
                          {entry.username}
                          {isCurrentUser && <span className="ml-2 text-xs text-muted">(You)</span>}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <SkillTierBadge
                          rating={entry.skillRating}
                          tier={entry.tier}
                          showRating={false}
                          size="sm"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg font-semibold">{entry.skillRating}</span>
                        {entry.lastChange && entry.lastChange !== 0 && (
                          <span
                            className={`ml-2 text-sm ${
                              entry.lastChange > 0 ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            ({entry.lastChange > 0 ? '+' : ''}
                            {entry.lastChange})
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-muted">{entry.totalGames}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            entry.winRate >= 60
                              ? 'text-green-400'
                              : entry.winRate >= 40
                                ? 'text-muted'
                                : 'text-red-400'
                          }`}
                        >
                          {entry.winRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-2xl">
                        {getTrendIcon(entry.recentTrend)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && leaderboard.length > 0 && (
          <div className="mt-6 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="px-4 py-2 bg-surface-1 text-muted rounded-lg hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-muted">Page {currentPage + 1}</span>
            <button
              type="button"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={leaderboard.length < ITEMS_PER_PAGE}
              className="px-4 py-2 bg-surface-1 text-muted rounded-lg hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default LeaderboardsPage
