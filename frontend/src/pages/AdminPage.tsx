import { useEffect, useState } from 'react'
import { Shield, Users, Map, Gamepad2, Settings, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import api from '../services/api'

interface TabConfig {
  id: string
  label: string
  icon: React.ReactNode
  component: React.ReactNode
}

const AdminPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const response = await api.get('/admin/status')
      setIsAdmin(response.data.isAdmin)
      if (!response.data.isAdmin) {
        navigate('/')
      }
    } catch (error) {
      console.error('Failed to check admin status:', error)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const tabs: TabConfig[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <Activity className="w-4 h-4" />,
      component: <AdminOverview />,
    },
    {
      id: 'users',
      label: 'User Management',
      icon: <Users className="w-4 h-4" />,
      component: <UserManagement />,
    },
    {
      id: 'maps',
      label: 'Map Approval',
      icon: <Map className="w-4 h-4" />,
      component: <MapApproval />,
    },
    {
      id: 'games',
      label: 'Game Management',
      icon: <Gamepad2 className="w-4 h-4" />,
      component: <GameManagement />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
      component: <AdminSettings />,
    },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-1 flex items-center justify-center">
        <div className="text-white">Loading admin panel...</div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-1">
      {/* Admin Header */}
      <div className="bg-gradient-to-r from-purple-800 to-red-800 text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>
          <div className="text-sm">
            Logged in as: {user?.username}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-surface-2 border-b border-border">
        <div className="max-w-7xl mx-auto">
          <nav className="flex gap-1 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                  ${
                    activeTab === tab.id
                      ? 'bg-purple-600 text-white'
                      : 'text-muted hover:bg-surface-2 hover:text-white'
                  }
                `}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto p-6">
        {tabs.find((tab) => tab.id === activeTab)?.component}
      </div>
    </div>
  )
}

// Admin Overview Component
const AdminOverview: React.FC = () => {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/stats')
      setStats(response.data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Overview</h2>
      
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Users" value={stats.totalUsers} />
          <StatCard title="Active Games" value={stats.activeGames} />
          <StatCard title="Maps Pending" value={stats.mapsPending} />
          <StatCard title="Reports" value={stats.reports} />
        </div>
      )}

      <div className="bg-surface-2 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
        <div className="text-muted">
          Activity log will be displayed here...
        </div>
      </div>
    </div>
  )
}

// User Management Component
const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users', {
        params: { search: searchTerm }
      })
      setUsers(response.data.users)
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  const handleBanUser = async (userId: string) => {
    if (!confirm('Are you sure you want to ban this user?')) return
    
    try {
      await api.post(`/admin/users/${userId}/ban`)
      fetchUsers()
    } catch (error) {
      console.error('Failed to ban user:', error)
    }
  }

  const handleUnbanUser = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/unban`)
      fetchUsers()
    } catch (error) {
      console.error('Failed to unban user:', error)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">User Management</h2>

      {/* Search Bar */}
      <div className="bg-surface-2 rounded-lg p-4">
        <input
          type="text"
          placeholder="Search users by username or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && fetchUsers()}
          className="w-full px-4 py-2 bg-surface-2 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Users Table */}
      <div className="bg-surface-2 rounded-lg overflow-hidden">
        <table className="w-full text-white">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-3 text-left">Username</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-border">
                <td className="px-4 py-3">{user.username}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    user.status === 'banned' 
                      ? 'bg-red-600 text-white' 
                      : 'bg-green-600 text-white'
                  }`}>
                    {user.status || 'active'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {user.status === 'banned' ? (
                      <button
                        onClick={() => handleUnbanUser(user.id)}
                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBanUser(user.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                      >
                        Ban
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="px-3 py-1 bg-violet text-white rounded hover:brightness-110 text-sm"
                    >
                      View
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Map Approval Component
const MapApproval: React.FC = () => {
  const [pendingMaps, setPendingMaps] = useState<any[]>([])

  useEffect(() => {
    fetchPendingMaps()
  }, [])

  const fetchPendingMaps = async () => {
    try {
      const response = await api.get('/admin/content/queue')
      setPendingMaps(response.data.items.filter((item: any) => item.contentType === 'map'))
    } catch (error) {
      console.error('Failed to fetch pending maps:', error)
    }
  }

  const handleApproveMap = async (queueId: string) => {
    try {
      await api.post(`/admin/content/${queueId}/approve`)
      fetchPendingMaps()
    } catch (error) {
      console.error('Failed to approve map:', error)
    }
  }

  const handleRejectMap = async (queueId: string, reason: string) => {
    try {
      await api.post(`/admin/content/${queueId}/reject`, { reason })
      fetchPendingMaps()
    } catch (error) {
      console.error('Failed to reject map:', error)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Map Approval Queue</h2>

      <div className="grid gap-4">
        {pendingMaps.length === 0 ? (
          <div className="bg-surface-2 rounded-lg p-6 text-center text-muted">
            No maps pending approval
          </div>
        ) : (
          pendingMaps.map((map) => (
            <div key={map.id} className="bg-surface-2 rounded-lg p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">{map.contentName}</h3>
                  <p className="text-muted text-sm">
                    Submitted by: {map.submitterUsername}
                  </p>
                  <p className="text-muted text-sm">
                    Date: {new Date(map.submittedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveMap(map.id)}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Rejection reason:')
                      if (reason) handleRejectMap(map.id, reason)
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Reject
                  </button>
                  <button
                    className="px-4 py-2 bg-violet text-white rounded hover:brightness-110"
                  >
                    View Map
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Game Management Component
const GameManagement: React.FC = () => {
  const [activeGames, setActiveGames] = useState<any[]>([])

  useEffect(() => {
    fetchActiveGames()
  }, [])

  const fetchActiveGames = async () => {
    try {
      const response = await api.get('/admin/games/active')
      setActiveGames(response.data)
    } catch (error) {
      console.error('Failed to fetch active games:', error)
    }
  }

  const handleEndGame = async (gameId: string) => {
    if (!confirm('Are you sure you want to force end this game?')) return
    
    try {
      await api.post(`/admin/games/${gameId}/end`)
      fetchActiveGames()
    } catch (error) {
      console.error('Failed to end game:', error)
    }
  }

  const handleExcludeFromElo = async (gameId: string) => {
    try {
      await api.post(`/admin/games/${gameId}/exclude-elo`)
      fetchActiveGames()
    } catch (error) {
      console.error('Failed to exclude from ELO:', error)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Game Management</h2>

      <div className="bg-surface-2 rounded-lg overflow-hidden">
        <table className="w-full text-white">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-3 text-left">Game ID</th>
              <th className="px-4 py-3 text-left">Players</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Duration</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeGames.map((game) => (
              <tr key={game.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-sm">{game.id.slice(0, 8)}</td>
                <td className="px-4 py-3">{game.playerCount}/{game.maxPlayers}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-green-600 text-white rounded text-xs">
                    {game.status}
                  </span>
                </td>
                <td className="px-4 py-3">{game.duration}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEndGame(game.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      End
                    </button>
                    <button
                      onClick={() => handleExcludeFromElo(game.id)}
                      className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                    >
                      Exclude ELO
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Admin Settings Component
const AdminSettings: React.FC = () => {
  const [featureFlags, setFeatureFlags] = useState<any[]>([])

  useEffect(() => {
    fetchFeatureFlags()
  }, [])

  const fetchFeatureFlags = async () => {
    try {
      const response = await api.get('/admin/feature-flags')
      setFeatureFlags(response.data)
    } catch (error) {
      console.error('Failed to fetch feature flags:', error)
    }
  }

  const handleToggleFlag = async (flagName: string, enabled: boolean) => {
    try {
      await api.post(`/admin/feature-flags/${flagName}/toggle`, { enabled })
      fetchFeatureFlags()
    } catch (error) {
      console.error('Failed to toggle feature flag:', error)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Admin Settings</h2>

      <div className="bg-surface-2 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Feature Flags</h3>
        <div className="space-y-2">
          {featureFlags.map((flag) => (
            <div key={flag.id} className="flex items-center justify-between p-3 bg-surface-2 rounded">
              <div>
                <div className="text-white font-medium">{flag.flagName}</div>
                <div className="text-muted text-sm">{flag.description}</div>
              </div>
              <button
                onClick={() => handleToggleFlag(flag.flagName, !flag.isEnabled)}
                className={`px-4 py-2 rounded ${
                  flag.isEnabled 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-gray-600 hover:bg-gray-500'
                } text-white transition-colors`}
              >
                {flag.isEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Stat Card Component
const StatCard: React.FC<{ title: string; value: number }> = ({ title, value }) => (
  <div className="bg-surface-2 rounded-lg p-4">
    <div className="text-muted text-sm">{title}</div>
    <div className="text-2xl font-bold text-white">{value || 0}</div>
  </div>
)

export default AdminPage