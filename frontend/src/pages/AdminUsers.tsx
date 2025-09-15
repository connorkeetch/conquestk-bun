import { useEffect, useState } from 'react'
import api from '../services/api'

interface User {
  id: string
  username: string
  email: string
  status: string
  role: string
  createdAt: string
  lastLogin: string
  gamesPlayed: number
  elo: number
  isVip?: boolean
  isAdmin?: boolean
  premiumTier?: 'free' | 'premium'
  vipReason?: string
  vipGrantedAt?: string
  premiumExpiresAt?: string
}

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)
  const [filterType, setFilterType] = useState<'all' | 'vip' | 'admin' | 'premium'>('all')

  const loadUsers = async () => {
    try {
      setLoading(true)
      const response = await api.get('/admin/users', {
        params: { search: searchTerm },
      })
      setUsers(response.data.users || [])
    } catch (error) {
      console.error('Failed to fetch users:', error)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [searchTerm])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadUsers()
  }

  const handleBanUser = async (userId: string) => {
    if (!confirm('Are you sure you want to ban this user?')) return

    try {
      await api.post(`/admin/users/${userId}/ban`)
      loadUsers()
      setShowUserModal(false)
    } catch (error) {
      console.error('Failed to ban user:', error)
      alert('Failed to ban user')
    }
  }

  const handleUnbanUser = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/unban`)
      loadUsers()
      setShowUserModal(false)
    } catch (error) {
      console.error('Failed to unban user:', error)
      alert('Failed to unban user')
    }
  }

  const handleChangeVIPStatus = async (userId: string, newStatus: boolean) => {
    if (newStatus && !confirm('Grant VIP status to this user?')) return
    if (!newStatus && !confirm('Revoke VIP status from this user?')) return

    const reason = newStatus ? prompt('Enter reason for VIP status (optional):') : null

    try {
      await api.post(`/admin/users/${userId}/vip`, { isVip: newStatus, reason })
      loadUsers()
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, isVip: newStatus, vipReason: reason || undefined })
      }
    } catch (error) {
      console.error('Failed to change VIP status:', error)
      alert('Failed to change VIP status')
    }
  }

  const handleChangeAdminStatus = async (userId: string, newStatus: boolean) => {
    if (newStatus && !confirm('Grant admin privileges to this user?')) return
    if (!newStatus && !confirm('Remove admin privileges from this user?')) return

    try {
      await api.post(`/admin/users/${userId}/admin`, { isAdmin: newStatus })
      loadUsers()
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, isAdmin: newStatus })
      }
    } catch (error) {
      console.error('Failed to change admin status:', error)
      alert('Failed to change admin status')
    }
  }

  const handleChangePremiumTier = async (userId: string, tier: string) => {
    try {
      await api.post(`/admin/users/${userId}/premium`, { tier })
      loadUsers()
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, premiumTier: tier as any })
      }
    } catch (error) {
      console.error('Failed to change premium tier:', error)
      alert('Failed to change premium tier')
    }
  }

  const openUserModal = (user: User) => {
    setSelectedUser(user)
    setShowUserModal(true)
  }

  const closeUserModal = () => {
    setSelectedUser(null)
    setShowUserModal(false)
  }

  const filteredUsers = users.filter((user) => {
    if (filterType === 'vip') return user.isVip
    if (filterType === 'admin') return user.isAdmin
    if (filterType === 'premium') return user.premiumTier && user.premiumTier !== 'free'
    return true
  })

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-white">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">User Management</h2>
          <p className="text-muted">Manage user accounts, VIP status, and permissions</p>
        </div>
        <button
          onClick={loadUsers}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:brightness-110 transition-all"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface-2 rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="text-sm text-muted">Total Users</div>
        </div>
        <div className="bg-surface-2 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-400">
            {users.filter((u) => u.isVip).length}
          </div>
          <div className="text-sm text-muted">VIP Users</div>
        </div>
        <div className="bg-surface-2 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-400">
            {users.filter((u) => u.isAdmin).length}
          </div>
          <div className="text-sm text-muted">Admins</div>
        </div>
        <div className="bg-surface-2 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">
            {users.filter((u) => u.premiumTier && u.premiumTier !== 'free').length}
          </div>
          <div className="text-sm text-muted">Premium Users</div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-surface-2 rounded-lg p-4">
        <div className="flex gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <input
              type="text"
              placeholder="Search users by username or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 bg-surface-1 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Search
            </button>
          </form>

          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterType === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-surface-1 text-muted hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('vip')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterType === 'vip'
                  ? 'bg-purple-600 text-white'
                  : 'bg-surface-1 text-muted hover:text-white'
              }`}
            >
              VIP Only
            </button>
            <button
              onClick={() => setFilterType('admin')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterType === 'admin'
                  ? 'bg-purple-600 text-white'
                  : 'bg-surface-1 text-muted hover:text-white'
              }`}
            >
              Admins
            </button>
            <button
              onClick={() => setFilterType('premium')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterType === 'premium'
                  ? 'bg-purple-600 text-white'
                  : 'bg-surface-1 text-muted hover:text-white'
              }`}
            >
              Premium
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      {filteredUsers.length === 0 ? (
        <div className="bg-surface-2 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-xl font-bold text-white mb-2">No Users Found</h3>
          <p className="text-muted">No users match your search criteria.</p>
        </div>
      ) : (
        <div className="bg-surface-2 rounded-lg overflow-hidden">
          <table className="w-full text-white">
            <thead className="bg-surface-1">
              <tr>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Badges</th>
                <th className="px-4 py-3 text-left">Premium</th>
                <th className="px-4 py-3 text-left">Games</th>
                <th className="px-4 py-3 text-left">ELO</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-border hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{user.username}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        user.status === 'banned'
                          ? 'bg-red-600 text-white'
                          : user.status === 'suspended'
                            ? 'bg-yellow-600 text-white'
                            : 'bg-green-600 text-white'
                      }`}
                    >
                      {user.status || 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {user.isVip && (
                        <span
                          className="px-2 py-1 rounded text-xs bg-purple-600 text-white"
                          title={user.vipReason}
                        >
                          👑 VIP
                        </span>
                      )}
                      {user.isAdmin && (
                        <span className="px-2 py-1 rounded text-xs bg-red-600 text-white">
                          🛡️ Admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        user.premiumTier === 'enterprise'
                          ? 'bg-gold-600 text-white'
                          : user.premiumTier === 'pro'
                            ? 'bg-purple-600 text-white'
                            : user.premiumTier === 'premium'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-600 text-white'
                      }`}
                    >
                      {user.premiumTier || 'free'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{user.gamesPlayed || 0}</td>
                  <td className="px-4 py-3">{user.elo || 1000}</td>
                  <td className="px-4 py-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openUserModal(user)}
                      className="px-3 py-1 bg-primary text-white rounded hover:brightness-110 text-sm"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-1 rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-white">
                User Details: {selectedUser.username}
              </h3>
              <button onClick={closeUserModal} className="text-muted hover:text-white text-2xl">
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Account Info */}
              <div className="bg-surface-2 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">Account Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted">User ID:</span>
                    <span className="text-white ml-2 font-mono text-xs">{selectedUser.id}</span>
                  </div>
                  <div>
                    <span className="text-muted">Email:</span>
                    <span className="text-white ml-2">{selectedUser.email}</span>
                  </div>
                  <div>
                    <span className="text-muted">Status:</span>
                    <span className="text-white ml-2">{selectedUser.status || 'active'}</span>
                  </div>
                  <div>
                    <span className="text-muted">Joined:</span>
                    <span className="text-white ml-2">
                      {new Date(selectedUser.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Last Login:</span>
                    <span className="text-white ml-2">
                      {selectedUser.lastLogin
                        ? new Date(selectedUser.lastLogin).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Games Played:</span>
                    <span className="text-white ml-2">{selectedUser.gamesPlayed || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted">ELO Rating:</span>
                    <span className="text-white ml-2">{selectedUser.elo || 1000}</span>
                  </div>
                </div>
              </div>

              {/* Special Status */}
              <div className="bg-surface-2 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">Special Status & Permissions</h4>
                <div className="space-y-3">
                  {/* VIP Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-white">VIP Status</div>
                      <div className="text-xs text-muted">
                        {selectedUser.isVip && selectedUser.vipReason
                          ? `Reason: ${selectedUser.vipReason}`
                          : 'Grants access to VIP-only maps and features'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          selectedUser.isVip
                            ? 'bg-purple-600/20 text-purple-400 border border-purple-600'
                            : 'bg-gray-600/20 text-gray-400 border border-gray-600'
                        }`}
                      >
                        {selectedUser.isVip ? '👑 VIP' : 'Standard'}
                      </span>
                      <select
                        value={selectedUser.isVip ? 'vip' : 'standard'}
                        onChange={(e) =>
                          handleChangeVIPStatus(selectedUser.id, e.target.value === 'vip')
                        }
                        className="px-3 py-1 bg-surface-1 text-white rounded border border-border focus:outline-none focus:border-purple-500"
                      >
                        <option value="standard">Standard</option>
                        <option value="vip">VIP</option>
                      </select>
                    </div>
                  </div>

                  {/* Admin Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-white">Admin Status</div>
                      <div className="text-xs text-muted">Full administrative privileges</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          selectedUser.isAdmin
                            ? 'bg-red-600/20 text-red-400 border border-red-600'
                            : 'bg-gray-600/20 text-gray-400 border border-gray-600'
                        }`}
                      >
                        {selectedUser.isAdmin ? '🛡️ Admin' : 'User'}
                      </span>
                      <select
                        value={selectedUser.isAdmin ? 'admin' : 'user'}
                        onChange={(e) =>
                          handleChangeAdminStatus(selectedUser.id, e.target.value === 'admin')
                        }
                        className="px-3 py-1 bg-surface-1 text-white rounded border border-border focus:outline-none focus:border-red-500"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>

                  {/* Premium Tier */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-white">Premium Tier</div>
                      <div className="text-xs text-muted">Subscription level and features</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          selectedUser.premiumTier === 'premium'
                            ? 'bg-green-600/20 text-green-400 border border-green-600'
                            : 'bg-gray-600/20 text-gray-400 border border-gray-600'
                        }`}
                      >
                        {selectedUser.premiumTier === 'premium' ? '💎 Premium' : 'Free'}
                      </span>
                      <select
                        value={selectedUser.premiumTier || 'free'}
                        onChange={(e) => handleChangePremiumTier(selectedUser.id, e.target.value)}
                        className="px-3 py-1 bg-surface-1 text-white rounded border border-border focus:outline-none focus:border-green-500"
                      >
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="bg-surface-2 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">Account Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.status === 'banned' ? (
                    <button
                      onClick={() => handleUnbanUser(selectedUser.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Unban User
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBanUser(selectedUser.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Ban User
                    </button>
                  )}

                  <button
                    onClick={() => window.open(`/profile/${selectedUser.username}`, '_blank')}
                    className="px-4 py-2 bg-primary text-white rounded hover:brightness-110"
                  >
                    View Profile
                  </button>

                  <button
                    onClick={() => alert('Password reset functionality coming soon')}
                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                  >
                    Reset Password
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={closeUserModal}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminUsers
