import type React from 'react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import UserStats from '../components/profile/UserStats'
import { useAppSelector } from '../hooks/redux'
import {
  type PlayerStatsBreakdown,
  type ProfileSummary,
  profileService,
} from '../services/profileService'

const Statistics: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null)
  const [stats, setStats] = useState<PlayerStatsBreakdown | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) {
      return
    }

    let isMounted = true
    const controller = new AbortController()

    const loadStats = async () => {
      try {
        setLoading(true)
        setError(null)

        const [profile, breakdown] = await Promise.all([
          profileService.getMyProfile({ signal: controller.signal }),
          profileService.getMyStats({ signal: controller.signal }),
        ])

        if (!isMounted) {
          return
        }

        setProfileSummary(profile)
        setStats(breakdown)
      } catch (_loadError) {
        if (!isMounted) {
          return
        }
        setError('Unable to load your statistics right now. Please try again in a moment.')
        setProfileSummary(null)
        setStats(null)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadStats()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [user?.id])

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep px-4 py-10 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="glass-box-lg p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white flex items-center gap-3">
              <span>📈</span>
              Your Battle Analytics
            </h1>
            <p className="text-muted text-sm">
              Detailed breakdown of every ranked and casual match, including 90-day trends,
              territory highs, and card trade activity.
            </p>
          </div>
          {loading && (
            <div className="inline-flex items-center gap-2 text-sm text-muted">
              <span className="animate-spin">🔄</span>
              <span>Syncing latest matches…</span>
            </div>
          )}
        </header>

        {error && (
          <div className="p-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="glass-box p-6 text-center text-muted">
            <div className="text-4xl mb-3 animate-pulse">🎲</div>
            <p>Loading your commander stats…</p>
          </div>
        ) : (
          <UserStats
            profileSummary={profileSummary}
            isOwnProfile={true}
            initialStats={stats}
            username={user.username}
            disableFetch={true}
          />
        )}
      </div>
    </div>
  )
}

export default Statistics
