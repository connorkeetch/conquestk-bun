import { useEffect, useState } from 'react'
import api from '../services/api'

interface StatCardProps {
  title: string
  value: number | string
  icon?: string
  color?: string
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color = 'text-white' }) => (
  <div className="bg-surface-2 rounded-lg p-6">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-muted mb-1">{title}</div>
        <div className={`text-3xl font-bold ${color}`}>{value || 0}</div>
      </div>
      {icon && <div className="text-3xl">{icon}</div>}
    </div>
  </div>
)

const AdminPage: React.FC = () => {
  const [stats, setStats] = useState<any>(null)
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)

      // Fetch stats
      const statsResponse = await api.get('/admin/stats')
      setStats(statsResponse.data)

      // TODO: Fetch recent activity when endpoint is available
      // const activityResponse = await api.get('/admin/activity')
      // setRecentActivity(activityResponse.data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-white">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Overview</h2>
        <p className="text-muted">Welcome to the admin dashboard</p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Users" value={stats.totalUsers} icon="👥" color="text-blue-400" />
          <StatCard
            title="Active Games"
            value={stats.activeGames}
            icon="🎮"
            color="text-green-400"
          />
          <StatCard
            title="Maps Pending"
            value={stats.mapsPending}
            icon="🗺️"
            color="text-yellow-400"
          />
          <StatCard title="Reports" value={stats.reports} icon="📋" color="text-red-400" />
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-surface-2 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            href="/admin/maps"
            className="p-4 bg-surface-1 rounded-lg hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🗺️</span>
              <span className="font-medium text-white">Review Maps</span>
            </div>
            <p className="text-sm text-muted">{stats?.mapsPending || 0} maps awaiting review</p>
          </a>

          <a
            href="/admin/games"
            className="p-4 bg-surface-1 rounded-lg hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🎮</span>
              <span className="font-medium text-white">Manage Games</span>
            </div>
            <p className="text-sm text-muted">{stats?.activeGames || 0} games currently active</p>
          </a>

          <a
            href="/admin/users"
            className="p-4 bg-surface-1 rounded-lg hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">👥</span>
              <span className="font-medium text-white">User Management</span>
            </div>
            <p className="text-sm text-muted">{stats?.totalUsers || 0} registered users</p>
          </a>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-surface-2 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
        {recentActivity.length > 0 ? (
          <div className="space-y-2">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div>
                  <div className="text-white">{activity.description}</div>
                  <div className="text-xs text-muted">{activity.timestamp}</div>
                </div>
                <div className="text-sm text-muted">{activity.user}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted">
            No recent activity to display. Activity logging will be implemented soon.
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-2 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">System Health</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted">Database</span>
              <span className="text-green-400">● Healthy</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Game Server</span>
              <span className="text-green-400">● Running</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Socket Connections</span>
              <span className="text-white">{stats?.socketConnections || 0} active</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-2 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">Quick Stats</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted">Games Today</span>
              <span className="text-white">{stats?.gamesToday || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">New Users (24h)</span>
              <span className="text-white">{stats?.newUsersToday || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Maps Submitted (7d)</span>
              <span className="text-white">{stats?.mapsThisWeek || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPage
