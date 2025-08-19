import { useState, useEffect } from 'react'
import { adminService } from '../services/adminService'

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

export default function AdminDashboard() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [statusData, adminData] = await Promise.all([
        adminService.getSystemStatus(),
        adminService.getAdminInfo()
      ])

      setSystemStatus(statusData)
      setAdminInfo(adminData)
    } catch (err: any) {
      console.error('Error loading admin dashboard:', err)
      setError(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const toggleFeatureFlag = async (flagName: string, enabled: boolean) => {
    try {
      await adminService.toggleFeatureFlag(flagName, enabled)
      await loadDashboardData() // Refresh data
    } catch (err: any) {
      console.error('Error toggling feature flag:', err)
      alert(`Failed to toggle feature flag: ${err.message}`)
    }
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
            className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🛡️ Admin Dashboard</h1>
          <div className="text-gray-400">
            Welcome back, {adminInfo?.adminRoles.map(r => r.roleName).join(', ')} admin
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-400">
                  {systemStatus?.database.userCount.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Total Users</div>
              </div>
              <div className="text-3xl">👥</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {systemStatus?.database.mapCount.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Custom Maps</div>
              </div>
              <div className="text-3xl">🗺️</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-yellow-400">
                  {systemStatus?.database.activeGames.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Active Games</div>
              </div>
              <div className="text-3xl">🎮</div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-400">
                  {systemStatus?.database.pendingApprovals.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Pending Approvals</div>
              </div>
              <div className="text-3xl">⏳</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Admin Tools */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">🛠️ Admin Tools</h2>
            <div className="space-y-3">
              <a 
                href="/admin/users" 
                className="block bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">User Management</div>
                    <div className="text-sm text-gray-400">Manage user accounts, roles, and permissions</div>
                  </div>
                  <div className="text-2xl">👥</div>
                </div>
              </a>

              <a 
                href="/admin/content" 
                className="block bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Content Moderation</div>
                    <div className="text-sm text-gray-400">Review and approve user-generated content</div>
                  </div>
                  <div className="text-2xl">🔍</div>
                </div>
              </a>

              <a 
                href="/admin/games" 
                className="block bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Game Management</div>
                    <div className="text-sm text-gray-400">Monitor and manage active games</div>
                  </div>
                  <div className="text-2xl">🎮</div>
                </div>
              </a>

              <a 
                href="/admin/logs" 
                className="block bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Activity Logs</div>
                    <div className="text-sm text-gray-400">View admin and user activity logs</div>
                  </div>
                  <div className="text-2xl">📊</div>
                </div>
              </a>
            </div>
          </div>

          {/* Feature Flags */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">🚩 Feature Flags</h2>
            <div className="space-y-3">
              {systemStatus && Object.entries(systemStatus.featureFlags).map(([flagName, isEnabled]) => (
                <div key={flagName} className="flex items-center justify-between bg-gray-700 rounded-lg p-4">
                  <div>
                    <div className="font-medium capitalize">
                      {flagName.replace(/_/g, ' ')}
                    </div>
                    <div className="text-sm text-gray-400">
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => toggleFeatureFlag(flagName, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">📈 System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl mb-2">💿</div>
              <div className="text-sm text-gray-400">Database</div>
              <div className="text-lg font-medium text-green-400">Connected</div>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">🔧</div>
              <div className="text-sm text-gray-400">System</div>
              <div className="text-lg font-medium text-green-400">Operational</div>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">⏰</div>
              <div className="text-sm text-gray-400">Last Updated</div>
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