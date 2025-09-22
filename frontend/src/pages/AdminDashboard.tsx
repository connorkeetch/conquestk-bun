import { useCallback, useEffect, useState } from 'react'
import { adminService, type FeatureFlag } from '../services/adminService'

interface SystemStatus {
  timestamp: string
  database: {
    userCount: number
    mapCount: number
    activeGames: number
    pendingApprovals: number
  }
  featureFlags: Record<string, boolean>
}

interface AdminInfo {
  userId: string
  adminRoles: Array<{
    roleId: string
    roleName: string
    permissions: string[]
  }>
  isAdmin: boolean
}

interface FeatureFlagEntry {
  key: string
  flagName: string
  description?: string
  isEnabled: boolean
  updatedAt?: string
}

export default function AdminDashboard() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [refreshingFlags, setRefreshingFlags] = useState(false)
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null)
  const [cacheClearing, setCacheClearing] = useState(false)
  const [leaderboardRefreshing, setLeaderboardRefreshing] = useState(false)

  const loadDashboardData = useCallback(async (options: { showLoader?: boolean } = {}) => {
    const { showLoader = true } = options
    try {
      if (showLoader) {
        setLoading(true)
      }
      setError(null)

      const [statusData, adminData, featureFlagData] = await Promise.all([
        adminService.getSystemStatus(),
        adminService.getAdminInfo(),
        adminService.getFeatureFlags(),
      ])

      setSystemStatus(statusData)
      setAdminInfo(adminData)
      setFeatureFlags(featureFlagData ?? [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data'
      if (showLoader) {
        setError(message)
      } else {
        alert(`Failed to refresh dashboard data: ${message}`)
      }
    } finally {
      if (showLoader) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadDashboardData()
  }, [loadDashboardData])

  const toggleFeatureFlag = useCallback(
    async (flagName: string, enabled: boolean) => {
      try {
        setUpdatingFlag(flagName)
        await adminService.toggleFeatureFlag(flagName, enabled)
        await loadDashboardData({ showLoader: false })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        alert(`Failed to toggle feature flag: ${message}`)
      } finally {
        setUpdatingFlag(null)
      }
    },
    [loadDashboardData],
  )

  const refreshFeatureFlags = useCallback(async () => {
    try {
      setRefreshingFlags(true)
      await loadDashboardData({ showLoader: false })
    } finally {
      setRefreshingFlags(false)
    }
  }, [loadDashboardData])

  const handleClearCache = useCallback(async () => {
    if (!confirm('Are you sure you want to clear the server cache?')) {
      return
    }

    try {
      setCacheClearing(true)
      await adminService.refreshCache()
      alert('Cache cleared successfully')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      alert(`Failed to clear cache: ${message}`)
    } finally {
      setCacheClearing(false)
    }
  }, [])

  const handleRefreshLeaderboard = useCallback(async () => {
    try {
      setLeaderboardRefreshing(true)
      await adminService.refreshLeaderboard()
      alert('Leaderboard cache refreshed successfully')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      alert(`Failed to refresh leaderboard cache: ${message}`)
    } finally {
      setLeaderboardRefreshing(false)
    }
  }, [])

  const formatFlagName = (flagName: string) => {
    if (flagName === 'gunts_prescriptions') {
      return "💊 Gunt's Prescriptions"
    }

    return flagName.replace(/_/g, ' ')
  }

  const formatFlagStatus = (flagName: string, isEnabled: boolean) => {
    if (flagName === 'gunts_prescriptions') {
      return isEnabled ? 'Doctor is IN' : 'Doctor is OUT'
    }

    return isEnabled ? 'Enabled' : 'Disabled'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-2xl mb-4">🔄</div>
          <div>Loading admin dashboard...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-red-400">
          <div className="text-2xl mb-4">❌</div>
          <div>Error: {error}</div>
          <button
            onClick={loadDashboardData}
            className="mt-4 bg-primary hover:brightness-110 px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const databaseStats = systemStatus?.database
  const featureFlagEntries: FeatureFlagEntry[] =
    featureFlags.length > 0
      ? featureFlags.map((flag) => ({
          key: flag.id || flag.flagName,
          flagName: flag.flagName,
          description: flag.description,
          isEnabled: flag.isEnabled,
          updatedAt: flag.updatedAt,
        }))
      : systemStatus
        ? Object.entries(systemStatus.featureFlags).map(([flagName, isEnabled]) => ({
            key: flagName,
            flagName,
            description: undefined,
            isEnabled,
            updatedAt: undefined,
          }))
        : []

  return (
    <div className="min-h-screen bg-surface-1 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🛡️ Admin Dashboard</h1>
          <div className="text-muted">
            Welcome back, {adminInfo?.adminRoles.map((r) => r.roleName).join(', ')} admin
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="glass-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-primary-soft">
                  {databaseStats?.userCount != null ? databaseStats.userCount.toLocaleString() : '0'}
                </div>
                <div className="text-sm text-muted">Total Users</div>
              </div>
              <div className="text-3xl">👥</div>
            </div>
          </div>

          <div className="glass-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {databaseStats?.mapCount != null ? databaseStats.mapCount.toLocaleString() : '0'}
                </div>
                <div className="text-sm text-muted">Custom Maps</div>
              </div>
              <div className="text-3xl">🗺️</div>
            </div>
          </div>

          <div className="glass-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-yellow-400">
                  {databaseStats?.activeGames != null ? databaseStats.activeGames.toLocaleString() : '0'}
                </div>
                <div className="text-sm text-muted">Active Games</div>
              </div>
              <div className="text-3xl">🎮</div>
            </div>
          </div>

          <div className="glass-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-400">
                  {databaseStats?.pendingApprovals != null
                    ? databaseStats.pendingApprovals.toLocaleString()
                    : '0'}
                </div>
                <div className="text-sm text-muted">Pending Approvals</div>
              </div>
              <div className="text-3xl">⏳</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8">
            {/* Admin Tools */}
            <div className="glass-box-lg">
              <h2 className="text-xl font-bold mb-4">🛠️ Admin Tools</h2>
              <div className="space-y-3">
                <a
                  href="/admin/users"
                  className="block glass-box-sm hover:brightness-110 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">User Management</div>
                      <div className="text-sm text-muted">
                        Manage user accounts, roles, and permissions
                      </div>
                    </div>
                    <div className="text-2xl">👥</div>
                  </div>
                </a>

                <a
                  href="/admin/content"
                  className="block glass-box-sm hover:brightness-110 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Content Moderation</div>
                      <div className="text-sm text-muted">
                        Review and approve user-generated content
                      </div>
                    </div>
                    <div className="text-2xl">🔍</div>
                  </div>
                </a>

                <a
                  href="/admin/games"
                  className="block glass-box-sm hover:brightness-110 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Game Management</div>
                      <div className="text-sm text-muted">Monitor and manage active games</div>
                    </div>
                    <div className="text-2xl">🎮</div>
                  </div>
                </a>

                <a
                  href="/admin/logs"
                  className="block glass-box-sm hover:brightness-110 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Activity Logs</div>
                      <div className="text-sm text-muted">View admin and user activity logs</div>
                    </div>
                    <div className="text-2xl">📊</div>
                  </div>
                </a>
              </div>
            </div>

            {/* System Actions */}
            <div className="glass-box-lg">
              <h2 className="text-xl font-bold mb-4">⚙️ System Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
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
                  type="button"
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
                    Have a recurring task? Surface it here so future admins have a one-click action.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Flags */}
          <div className="glass-box-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">🚩 Feature Flags</h2>
              <button
                type="button"
                onClick={() => void refreshFeatureFlags()}
                disabled={refreshingFlags}
                className="px-3 py-1 bg-primary text-white rounded hover:brightness-110 text-sm disabled:opacity-50"
              >
                {refreshingFlags ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>
            {featureFlagEntries.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🚩</div>
                <p className="text-muted">No feature flags configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {featureFlagEntries.map((flag) => (
                  <div
                    key={flag.key}
                    className="flex items-center justify-between bg-surface-2 rounded-lg p-4"
                  >
                    <div className="flex-1 pr-4">
                      <div className="font-medium capitalize">{formatFlagName(flag.flagName)}</div>
                      {flag.description && (
                        <div className="text-sm text-muted">{flag.description}</div>
                      )}
                      <div className="text-xs text-muted mt-1">
                        Status: {formatFlagStatus(flag.flagName, flag.isEnabled)}
                      </div>
                      {flag.updatedAt && (
                        <div className="text-xs text-muted mt-1">
                          Last updated: {new Date(flag.updatedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <label
                      className={`relative inline-flex items-center ${
                        updatingFlag === flag.flagName ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={flag.isEnabled}
                        onChange={(e) => toggleFeatureFlag(flag.flagName, e.target.checked)}
                        className="sr-only peer"
                        disabled={updatingFlag === flag.flagName}
                      />
                      <div
                        className={`w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary ${
                          updatingFlag === flag.flagName ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      ></div>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-surface-2 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">🧭 System Configuration</h2>
            <div className="space-y-3 text-sm text-muted">
              <p>
                Operational settings like game defaults and email verification are managed through
                environment variables and feature flags rather than fixed values.
              </p>
              <p>
                Use the create game flow to set lobby-specific rules. Update environment configs if
                you need global behaviour changes.
              </p>
            </div>
          </div>

          <div className="bg-surface-2 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">🌍 Environment Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
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

        {/* Recent Activity */}
        <div className="mt-8 bg-surface-2 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">📈 System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl mb-2">💿</div>
              <div className="text-sm text-muted">Database</div>
              <div className="text-lg font-medium text-green-400">Connected</div>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">🔧</div>
              <div className="text-sm text-muted">System</div>
              <div className="text-lg font-medium text-green-400">Operational</div>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">⏰</div>
              <div className="text-sm text-muted">Last Updated</div>
              <div className="text-lg font-medium">
                {systemStatus && new Date(systemStatus.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
