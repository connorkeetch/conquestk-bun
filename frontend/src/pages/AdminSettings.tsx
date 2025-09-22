import { useEffect, useState } from 'react'
import api from '../services/api'

interface FeatureFlag {
  id: string
  flagName: string
  description: string
  isEnabled: boolean
  updatedAt: string
}

const AdminSettings: React.FC = () => {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [cacheClearing, setCacheClearing] = useState(false)
  const [leaderboardRefreshing, setLeaderboardRefreshing] = useState(false)

  useEffect(() => {
    fetchFeatureFlags()
  }, [])

  const fetchFeatureFlags = async () => {
    try {
      setLoading(true)
      const response = await api.get('/admin/feature-flags')
      setFeatureFlags(response.data || [])
    } catch (error) {
      console.error('Failed to fetch feature flags:', error)
      setFeatureFlags([])
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFlag = async (flagName: string, enabled: boolean) => {
    try {
      await api.put(`/admin/feature-flags/${flagName}`, { enabled })
      fetchFeatureFlags()
    } catch (error) {
      console.error('Failed to toggle feature flag:', error)
      alert('Failed to toggle feature flag')
    }
  }

  const handleClearCache = async () => {
    if (!confirm('Are you sure you want to clear the server cache?')) return

    try {
      setCacheClearing(true)
      await api.post('/admin/cache/refresh')
      alert('Cache cleared successfully')
    } catch (error) {
      console.error('Failed to clear cache:', error)
      alert('Failed to clear cache')
    } finally {
      setCacheClearing(false)
    }
  }

  const handleRefreshLeaderboard = async () => {
    try {
      setLeaderboardRefreshing(true)
      await api.post('/skills/leaderboards/refresh')
      alert('Leaderboard cache refreshed successfully')
    } catch (error) {
      console.error('Failed to refresh leaderboard cache:', error)
      alert('Failed to refresh leaderboard cache')
    } finally {
      setLeaderboardRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-white">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Admin Settings</h2>
        <p className="text-muted">Configure system settings and feature flags</p>
      </div>

      {/* System Actions */}
      <div className="bg-surface-2 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">System Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={handleClearCache}
            disabled={cacheClearing}
            className="p-4 bg-surface-1 rounded-lg hover:bg-surface-2/50 transition-colors text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🔄</span>
              <span className="font-medium text-white">Clear Server Cache</span>
            </div>
            <p className="text-sm text-muted">
              {cacheClearing ? 'Clearing cache...' : 'Refresh all cached data on the server'}
            </p>
          </button>

          <button
            onClick={handleRefreshLeaderboard}
            disabled={leaderboardRefreshing}
            className="p-4 bg-surface-1 rounded-lg hover:bg-surface-2/50 transition-colors text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🏆</span>
              <span className="font-medium text-white">Refresh Leaderboard</span>
            </div>
            <p className="text-sm text-muted">
              {leaderboardRefreshing
                ? 'Refreshing leaderboard...'
                : 'Rebuild cached rankings for the skills leaderboard'}
            </p>
          </button>

          <div className="p-4 bg-surface-1 rounded-lg border border-surface-1/40 text-left">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🛠️</span>
              <span className="font-medium text-white">More Tools Coming Soon</span>
            </div>
            <p className="text-sm text-muted">
              Have an action you perform regularly? Let us know and we can automate it here.
            </p>
          </div>

        </div>
      </div>

      {/* Feature Flags */}
      <div className="bg-surface-2 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Feature Flags</h3>
          <button
            onClick={fetchFeatureFlags}
            className="px-3 py-1 bg-primary text-white rounded hover:brightness-110 text-sm"
          >
            🔄 Refresh
          </button>
        </div>

        {featureFlags.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">🚩</div>
            <p className="text-muted">No feature flags configured</p>
          </div>
        ) : (
          <div className="space-y-3">
            {featureFlags.map((flag) => (
              <div
                key={flag.id}
                className="flex items-center justify-between p-4 bg-surface-1 rounded-lg"
              >
                <div className="flex-1">
                  <div className="text-white font-medium">{flag.flagName}</div>
                  <div className="text-muted text-sm">{flag.description}</div>
                  {flag.updatedAt && (
                    <div className="text-xs text-muted mt-1">
                      Last updated: {new Date(flag.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleToggleFlag(flag.flagName, !flag.isEnabled)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    flag.isEnabled
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 hover:bg-gray-500 text-white'
                  }`}
                >
                  {flag.isEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="bg-surface-2 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">System Configuration</h3>
        <div className="space-y-3 text-sm text-muted">
          <p>
            Operational settings like game defaults and email verification are managed through
            environment variables and feature flags rather than fixed values.
          </p>
          <p>
            Use the create game flow to set lobby-specific rules. Update environment configs if you
            need global behaviour changes.
          </p>
        </div>
      </div>

      {/* Environment Info */}
      <div className="bg-surface-2 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Environment Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted">Environment:</span>
            <span className="text-white ml-2">Production</span>
          </div>
          <div>
            <span className="text-muted">Node Version:</span>
            <span className="text-white ml-2">v20.x</span>
          </div>
          <div>
            <span className="text-muted">Database:</span>
            <span className="text-white ml-2">PostgreSQL</span>
          </div>
          <div>
            <span className="text-muted">Deployment:</span>
            <span className="text-white ml-2">Railway</span>
          </div>
          <div>
            <span className="text-muted">Frontend URL:</span>
            <span className="text-white ml-2">conquestk.com</span>
          </div>
          <div>
            <span className="text-muted">API URL:</span>
            <span className="text-white ml-2">conquestk.com/api</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminSettings
