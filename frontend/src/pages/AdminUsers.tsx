import { useState, useEffect } from 'react'
import { adminService, User } from '../services/adminService'

interface UserEditModal {
  user: User
  isOpen: boolean
}

interface UserStatusUpdate {
  status: 'active' | 'suspended' | 'banned'
  reason?: string
  expiresAt?: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(25)
  
  // Search and filters
  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')
  
  // Modal states
  const [editModal, setEditModal] = useState<UserEditModal | null>(null)
  const [resetPasswordModal, setResetPasswordModal] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    loadUsers()
  }, [currentPage, searchTerm])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)

      const offset = (currentPage - 1) * limit
      const result = await adminService.getUsers({
        limit,
        offset,
        search: searchTerm || undefined
      })

      setUsers(result.users)
      setTotalUsers(result.total)
    } catch (err: any) {
      console.error('Error loading users:', err)
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchTerm(searchInput)
    setCurrentPage(1)
  }

  const updateUserStatus = async (userId: string, update: UserStatusUpdate) => {
    try {
      await adminService.updateUserStatus(
        userId,
        update.status,
        update.reason,
        update.expiresAt
      )
      await loadUsers()
      setEditModal(null)
    } catch (err: any) {
      console.error('Error updating user status:', err)
      alert(`Failed to update user status: ${err.message}`)
    }
  }

  const resetPassword = async () => {
    if (!resetPasswordModal || !newPassword) return

    try {
      await adminService.resetUserPassword(resetPasswordModal.id, newPassword)
      alert('Password reset successfully')
      setResetPasswordModal(null)
      setNewPassword('')
    } catch (err: any) {
      console.error('Error resetting password:', err)
      alert(`Failed to reset password: ${err.message}`)
    }
  }

  const totalPages = Math.ceil(totalUsers / limit)

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">👥 User Management</h1>
            <div className="text-gray-400">
              Manage user accounts, roles, and permissions
            </div>
          </div>
          <a 
            href="/admin"
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
          >
            ← Back to Dashboard
          </a>
        </div>

        {/* Search and Filters */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <form onSubmit={handleSearch} className="flex space-x-4">
            <div className="flex-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search users by username or email..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg"
            >
              🔍 Search
            </button>
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setSearchInput('')
                  setCurrentPage(1)
                }}
                className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Users Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">
                Users ({totalUsers.toLocaleString()})
              </h2>
              {searchTerm && (
                <div className="text-sm text-gray-400">
                  Showing results for "{searchTerm}"
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4">⏳</div>
              <div>Loading users...</div>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4 text-red-400">❌</div>
              <div className="text-red-400 mb-4">{error}</div>
              <button 
                onClick={loadUsers}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
              >
                Retry
              </button>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4">👤</div>
              <div>No users found</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Admin Roles
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Last Login
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {users.map((user) => {
                    const statusInfo = adminService.formatUserStatus(user.status)
                    return (
                      <tr key={user.id} className="hover:bg-gray-700">
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-medium">{user.username}</div>
                            <div className="text-sm text-gray-400">{user.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <span className={`font-medium ${statusInfo.color}`}>
                              {statusInfo.text}
                            </span>
                            {user.statusReason && (
                              <div className="text-xs text-gray-400 mt-1">
                                {user.statusReason}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {user.adminRoles.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.adminRoles.map((role, index) => (
                                <span
                                  key={index}
                                  className="inline-block bg-blue-600 text-xs px-2 py-1 rounded"
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">None</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {user.lastLogin 
                            ? new Date(user.lastLogin).toLocaleDateString()
                            : 'Never'
                          }
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setEditModal({ user, isOpen: true })}
                              className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setResetPasswordModal(user)}
                              className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-xs"
                            >
                              Reset PW
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-700">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, totalUsers)} of {totalUsers} users
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit User Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Edit User: {editModal.user.username}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <div className="space-y-2">
                  {['active', 'suspended', 'banned'].map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        const reason = status !== 'active' 
                          ? prompt(`Reason for ${status}:`) 
                          : undefined
                        
                        if (status === 'active' || reason) {
                          updateUserStatus(editModal.user.id, {
                            status: status as any,
                            reason
                          })
                        }
                      }}
                      className={`w-full text-left px-4 py-2 rounded ${
                        editModal.user.status === status
                          ? 'bg-blue-600'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {adminService.formatUserStatus(status).text}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setEditModal(null)}
                className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              Reset Password: {resetPasswordModal.username}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded"
                  placeholder="Enter new password..."
                  minLength={6}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => {
                  setResetPasswordModal(null)
                  setNewPassword('')
                }}
                className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={resetPassword}
                disabled={!newPassword || newPassword.length < 6}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded"
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}