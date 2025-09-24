import { isAxiosError } from 'axios'
import type React from 'react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { AdminPageHeader } from '../components/admin/AdminPageHeader'
import { adminService, type UserFeatureFlagAssignment } from '../services/adminService'
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
  premiumTier?: 'free' | 'premium' | 'pro' | 'enterprise'
  vipReason?: string
  vipGrantedAt?: string
  premiumExpiresAt?: string
  isBetaUser?: boolean
  emailVerified?: boolean
  preferredLanguage?: string
  timezone?: string
}

type UserActionType = 'ban' | 'unban' | 'vip' | 'admin'

interface ActionDialogState {
  type: UserActionType
  user: User
  newStatus?: boolean
}

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string } | string | undefined
    if (typeof data === 'string') return data
    return data?.error || data?.message || error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)
  const [filterType, setFilterType] = useState<'all' | 'vip' | 'admin' | 'premium'>('all')
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const actionNotesId = useId()
  const [userFeatureFlags, setUserFeatureFlags] = useState<UserFeatureFlagAssignment[]>([])
  const [userFlagsLoading, setUserFlagsLoading] = useState(false)
  const [userFlagsError, setUserFlagsError] = useState<string | null>(null)
  const [userFlagUpdating, setUserFlagUpdating] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await api.get('/admin/users', {
        params: searchQuery ? { search: searchQuery } : {},
      })

      setUsers(response.data.users || [])
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  const loadUserFeatureFlags = useCallback(async (userId: string) => {
    try {
      setUserFlagsLoading(true)
      setUserFlagsError(null)
      const flags = await adminService.getUserFeatureFlags(userId)
      setUserFeatureFlags(flags)
    } catch (err) {
      const message = getErrorMessage(err)
      setUserFlagsError(message)
      setUserFeatureFlags([])
    } finally {
      setUserFlagsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = searchInput.trim()
    setSearchInput(trimmed)
    setSearchQuery(trimmed)
  }

  const openActionDialog = (dialog: ActionDialogState) => {
    setActionDialog(dialog)
    setActionNotes('')
    setActionError(null)
  }

  const closeActionDialog = () => {
    setActionDialog(null)
    setActionNotes('')
    setActionError(null)
  }

  const executeAction = async () => {
    if (!actionDialog) return

    const { user, type, newStatus } = actionDialog
    const trimmedNotes = actionNotes.trim()

    setActionSubmitting(true)
    setActionError(null)

    try {
      switch (type) {
        case 'ban': {
          await api.post(
            `/admin/users/${user.id}/ban`,
            trimmedNotes ? { reason: trimmedNotes } : {},
          )
          toast.success(`Banned ${user.username}`)
          break
        }
        case 'unban': {
          await api.post(`/admin/users/${user.id}/unban`)
          toast.success(`Unbanned ${user.username}`)
          break
        }
        case 'vip': {
          await api.post(`/admin/users/${user.id}/vip`, {
            isVip: Boolean(newStatus),
            reason: newStatus ? trimmedNotes || undefined : undefined,
          })
          toast.success(`${newStatus ? 'Granted' : 'Removed'} VIP access for ${user.username}`)
          break
        }
        case 'admin': {
          await api.post(`/admin/users/${user.id}/admin`, { isAdmin: Boolean(newStatus) })
          toast.success(
            `${newStatus ? 'Granted' : 'Removed'} admin privileges for ${user.username}`,
          )
          break
        }
      }

      await loadUsers()

      setSelectedUser((current) => {
        if (!current || current.id !== user.id) return current

        switch (type) {
          case 'ban':
            return { ...current, status: 'banned' }
          case 'unban':
            return { ...current, status: 'active' }
          case 'vip': {
            const enableVip = Boolean(newStatus)
            return {
              ...current,
              isVip: enableVip,
              vipReason: enableVip ? trimmedNotes || current.vipReason : undefined,
              vipGrantedAt: enableVip ? new Date().toISOString() : undefined,
            }
          }
          case 'admin':
            return { ...current, isAdmin: Boolean(newStatus) }
          default:
            return current
        }
      })

      closeActionDialog()
    } catch (err) {
      const message = getErrorMessage(err)
      setActionError(message)
      toast.error(message)
    } finally {
      setActionSubmitting(false)
    }
  }

  const handleBanUser = (user: User) => {
    openActionDialog({ type: 'ban', user })
  }

  const handleUnbanUser = (user: User) => {
    openActionDialog({ type: 'unban', user })
  }

  const handleVipStatusChange = (user: User, newStatus: boolean) => {
    if (user.isVip === newStatus) return
    openActionDialog({ type: 'vip', user, newStatus })
  }

  const handleAdminStatusChange = (user: User, newStatus: boolean) => {
    if (user.isAdmin === newStatus) return
    openActionDialog({ type: 'admin', user, newStatus })
  }

  const getActionDialogCopy = (
    dialog: ActionDialogState,
  ): {
    title: string
    description: string
    confirmLabel: string
    confirmClass: string
    notesLabel?: string
    notesPlaceholder?: string
    notesRequired: boolean
  } => {
    switch (dialog.type) {
      case 'ban':
        return {
          title: `Ban ${dialog.user.username}?`,
          description: 'Banned players cannot log in until reinstated.',
          confirmLabel: 'Ban user',
          confirmClass: 'bg-red-600 hover:bg-red-700',
          notesLabel: 'Reason for ban',
          notesPlaceholder: 'Document why this account is being banned...',
          notesRequired: true,
        }
      case 'unban':
        return {
          title: `Reinstate ${dialog.user.username}?`,
          description: 'They will regain access immediately.',
          confirmLabel: 'Unban user',
          confirmClass: 'bg-green-600 hover:bg-green-700',
          notesRequired: false,
        }
      case 'vip': {
        const enabling = Boolean(dialog.newStatus)
        return {
          title: enabling
            ? `Grant VIP status to ${dialog.user.username}?`
            : `Remove VIP status from ${dialog.user.username}?`,
          description: enabling
            ? 'VIP players can access exclusive maps and perks.'
            : 'They will lose access to VIP-only content immediately.',
          confirmLabel: enabling ? 'Grant VIP access' : 'Remove VIP access',
          confirmClass: enabling
            ? 'bg-purple-600 hover:bg-purple-700'
            : 'bg-slate-600 hover:bg-slate-500',
          notesLabel: enabling ? 'VIP notes (optional)' : undefined,
          notesPlaceholder: enabling
            ? 'Share why this player is receiving VIP treatment...'
            : undefined,
          notesRequired: false,
        }
      }
      case 'admin': {
        const promoting = Boolean(dialog.newStatus)
        return {
          title: promoting
            ? `Promote ${dialog.user.username} to admin?`
            : `Remove admin privileges from ${dialog.user.username}?`,
          description: promoting
            ? 'Admins can manage users, maps, and system settings.'
            : 'They will immediately lose access to admin tooling.',
          confirmLabel: promoting ? 'Grant admin access' : 'Remove admin access',
          confirmClass: promoting
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-slate-600 hover:bg-slate-500',
          notesLabel: promoting
            ? 'Context for this promotion (optional)'
            : 'Reason for removal (optional)',
          notesPlaceholder: promoting
            ? 'Add context so other moderators know why this user is becoming an admin.'
            : 'Optional notes about why access is being removed.',
          notesRequired: false,
        }
      }
      default:
        return {
          title: 'Confirm action',
          description: '',
          confirmLabel: 'Confirm',
          confirmClass: 'bg-primary hover:brightness-110',
          notesRequired: false,
        }
    }
  }

  const handleChangePremiumTier = async (userId: string, tier: string) => {
    try {
      await api.post(`/admin/users/${userId}/premium`, { tier })
      toast.success('Updated premium tier')
      await loadUsers()
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, premiumTier: tier as User['premiumTier'] })
      }
    } catch (err) {
      const message = getErrorMessage(err)
      toast.error(message)
    }
  }

  const openUserModal = (user: User) => {
    setSelectedUser(user)
    setShowUserModal(true)
    void loadUserFeatureFlags(user.id)
  }

  const closeUserModal = () => {
    setSelectedUser(null)
    setShowUserModal(false)
    setUserFeatureFlags([])
    setUserFlagsError(null)
    setUserFlagUpdating(null)
  }

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (filterType === 'vip') return user.isVip
      if (filterType === 'admin') return user.isAdmin
      if (filterType === 'premium') return user.premiumTier && user.premiumTier !== 'free'
      return true
    })
  }, [users, filterType])

  const handleUserFlagOverrideChange = useCallback(
    async (userId: string, flagName: string, nextValue: 'inherit' | 'enable' | 'disable') => {
      try {
        setUserFlagUpdating(flagName)

        if (nextValue === 'inherit') {
          await adminService.clearUserFeatureFlagOverride(userId, flagName)
          toast.success(`Cleared override for ${flagName}`)
        } else {
          await adminService.setUserFeatureFlagOverride(userId, flagName, nextValue === 'enable')
          toast.success(`Set override for ${flagName}`)
        }

        await loadUserFeatureFlags(userId)
      } catch (err) {
        const message = getErrorMessage(err)
        toast.error(message)
        setUserFlagsError(message)
      } finally {
        setUserFlagUpdating(null)
      }
    },
    [loadUserFeatureFlags],
  )

  const isInitialLoading = loading && users.length === 0
  const isRefreshing = loading && users.length > 0
  const actionDialogCopy = actionDialog ? getActionDialogCopy(actionDialog) : null

  if (isInitialLoading) {
    return (
      <div className="p-6">
        <div className="text-white">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-1 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <AdminPageHeader
          title="User Management"
          subtitle="Manage accounts, status changes, and feature access"
          icon="👥"
          actions={
            <div className="flex items-center gap-3">
              {isRefreshing && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  Syncing latest data...
                </div>
              )}
              <button
                type="button"
                onClick={() => void loadUsers()}
                disabled={loading}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                🔄 Refresh
              </button>
            </div>
          }
        />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-box p-4">
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="text-sm text-muted">Total Users</div>
        </div>
        <div className="glass-box p-4">
          <div className="text-2xl font-bold text-purple-400">
            {users.filter((u) => u.isVip).length}
          </div>
          <div className="text-sm text-muted">VIP Users</div>
        </div>
        <div className="glass-box p-4">
          <div className="text-2xl font-bold text-yellow-400">
            {users.filter((u) => u.isAdmin).length}
          </div>
          <div className="text-sm text-muted">Admins</div>
        </div>
        <div className="glass-box p-4">
          <div className="text-2xl font-bold text-green-400">
            {users.filter((u) => u.premiumTier && u.premiumTier !== 'free').length}
          </div>
          <div className="text-sm text-muted">Premium Users</div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="glass-box p-4">
        <div className="flex gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <input
              type="text"
              placeholder="Search users by username or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
              type="button"
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
              type="button"
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
              type="button"
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
              type="button"
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

      {error && (
        <div className="bg-red-900/40 border border-red-500/40 rounded-lg px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium text-red-200">Unable to load users</p>
            <p className="text-sm text-red-200/80 mt-1 max-w-2xl">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded text-sm text-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {/* Users Table */}
      {filteredUsers.length === 0 ? (
        <div className="glass-box p-8 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-xl font-bold text-white mb-2">No Users Found</h3>
          <p className="text-muted">No users match your search criteria.</p>
        </div>
      ) : (
        <div className="glass-box overflow-hidden p-0">
          <table className="w-full text-white">
            <thead className="bg-surface-1">
              <tr>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Verified</th>
                <th className="px-4 py-3 text-left">Admin</th>
                <th className="px-4 py-3 text-left">VIP</th>
                <th className="px-4 py-3 text-left">Beta</th>
                <th className="px-4 py-3 text-left">Premium</th>
                <th className="px-4 py-3 text-left">Games</th>
                <th className="px-4 py-3 text-left">ELO</th>
                <th className="px-4 py-3 text-left">Last Login</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isRefreshing && (
                <tr>
                  <td colSpan={12} className="px-4 py-4 text-center text-sm text-muted">
                    Updating results...
                  </td>
                </tr>
              )}
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
                    {user.emailVerified ? (
                      <span className="px-2 py-1 rounded text-xs bg-blue-600 text-white">Yes</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs bg-gray-600 text-gray-300">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.isAdmin ? (
                      <span className="px-2 py-1 rounded text-xs bg-red-600 text-white">Yes</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs bg-gray-600 text-gray-300">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.isVip ? (
                      <span
                        className="px-2 py-1 rounded text-xs bg-purple-600 text-white"
                        title={user.vipReason}
                      >
                        Yes
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs bg-gray-600 text-gray-300">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.isBetaUser ? (
                      <span className="px-2 py-1 rounded text-xs bg-sky-600 text-white">
                        Tester
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs bg-gray-600 text-gray-300">
                        Standard
                      </span>
                    )}
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
                  <td className="px-4 py-3">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openUserModal(user)}
                      className="px-4 py-2 bg-gradient-to-r from-violet to-violet-soft text-white rounded-lg hover:brightness-110 transition-all duration-200 shadow-md hover:shadow-lg text-sm font-medium"
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
              <button
                type="button"
                onClick={closeUserModal}
                className="text-muted hover:text-white text-2xl"
              >
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
                  <div>
                    <span className="text-muted">Email Verified:</span>
                    <span
                      className={`ml-2 font-medium ${
                        selectedUser.emailVerified ? 'text-green-400' : 'text-red-300'
                      }`}
                    >
                      {selectedUser.emailVerified ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Beta Tester:</span>
                    <span
                      className={`ml-2 font-medium ${
                        selectedUser.isBetaUser ? 'text-sky-400' : 'text-gray-400'
                      }`}
                    >
                      {selectedUser.isBetaUser ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Language:</span>
                    <span className="text-white ml-2">
                      {selectedUser.preferredLanguage
                        ? selectedUser.preferredLanguage.toUpperCase()
                        : 'Default'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Timezone:</span>
                    <span className="text-white ml-2">{selectedUser.timezone || 'Not set'}</span>
                  </div>
                </div>
              </div>

              {/* Special Status */}
              <div className="bg-surface-2 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">Special Status & Permissions</h4>
                <div className="space-y-3">
                  {/* VIP Status */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">VIP Status</div>
                        <div className="text-xs text-muted">
                          Control access to VIP-only maps and community perks.
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
                            handleVipStatusChange(selectedUser, e.target.value === 'vip')
                          }
                          className="px-3 py-1 bg-surface-1 text-white rounded border border-border focus:outline-none focus:border-purple-500"
                        >
                          <option value="standard">Standard</option>
                          <option value="vip">VIP</option>
                        </select>
                      </div>
                    </div>
                    {selectedUser.isVip && (
                      <div className="text-xs text-muted">
                        {selectedUser.vipReason && <span>Reason: {selectedUser.vipReason}. </span>}
                        {selectedUser.vipGrantedAt && (
                          <span>
                            Granted {new Date(selectedUser.vipGrantedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Beta Status */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">Beta Access</div>
                        <div className="text-xs text-muted">
                          Determines eligibility for beta-limited features and experiments.
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded text-sm font-medium border ${
                          selectedUser.isBetaUser
                            ? 'bg-sky-600/20 text-sky-400 border-sky-600'
                            : 'bg-gray-600/20 text-gray-400 border-gray-600'
                        }`}
                      >
                        {selectedUser.isBetaUser ? 'Beta tester' : 'Standard user'}
                      </span>
                    </div>
                  </div>

                  {/* Admin Status */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">Admin Status</div>
                        <div className="text-xs text-muted">
                          Full administrative privileges across moderation tools.
                        </div>
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
                            handleAdminStatusChange(selectedUser, e.target.value === 'admin')
                          }
                          className="px-3 py-1 bg-surface-1 text-white rounded border border-border focus:outline-none focus:border-red-500"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    {selectedUser.isAdmin && (
                      <div className="text-xs text-orange-300/80">
                        Reminder: admin actions are logged for audit trails.
                      </div>
                    )}
                  </div>

                  {/* Premium Tier */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">Premium Tier</div>
                        <div className="text-xs text-muted">
                          Subscription level and entitlement window.
                        </div>
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
                    {selectedUser.premiumTier === 'premium' && selectedUser.premiumExpiresAt && (
                      <div className="text-xs text-muted">
                        Expires {new Date(selectedUser.premiumExpiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Feature Flags */}
              <div className="bg-surface-2 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-white">Feature Flag Overrides</h4>
                    <p className="text-xs text-muted">
                      Force-enable or disable experiments for this user without changing global
                      scope.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedUser && void loadUserFeatureFlags(selectedUser.id)}
                    disabled={userFlagsLoading}
                    className="px-3 py-1 text-xs rounded bg-surface-1 border border-border text-white hover:bg-surface-1/80 transition-colors disabled:opacity-60"
                  >
                    {userFlagsLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                {userFlagsError && (
                  <div className="text-sm text-red-400 mb-3">{userFlagsError}</div>
                )}

                {userFlagsLoading && userFeatureFlags.length === 0 ? (
                  <div className="text-sm text-muted">Loading feature flags...</div>
                ) : userFeatureFlags.length === 0 ? (
                  <div className="text-sm text-muted">No feature flags configured.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted border-b border-border/40">
                          <th className="py-2 pr-4 font-medium">Flag</th>
                          <th className="py-2 pr-4 font-medium">Scope</th>
                          <th className="py-2 pr-4 font-medium">Global</th>
                          <th className="py-2 pr-4 font-medium">Override</th>
                          <th className="py-2 pr-4 font-medium">Effective</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userFeatureFlags.map((flag) => {
                          const overrideValue =
                            flag.userOverride === null
                              ? 'inherit'
                              : flag.userOverride
                                ? 'enable'
                                : 'disable'

                          return (
                            <tr key={flag.flagName} className="border-b border-border/20">
                              <td className="py-2 pr-4 align-top">
                                <div className="text-white font-medium capitalize">
                                  {flag.flagName.replace(/_/g, ' ')}
                                </div>
                                {flag.description && (
                                  <div className="text-xs text-muted mt-1">{flag.description}</div>
                                )}
                              </td>
                              <td className="py-2 pr-4 align-top text-xs text-muted">
                                {flag.accessLevel}
                                {flag.rolloutPercentage != null && flag.rolloutPercentage < 100
                                  ? ` (${flag.rolloutPercentage}% rollout)`
                                  : ''}
                              </td>
                              <td className="py-2 pr-4 align-top text-xs">
                                <span
                                  className={`px-2 py-1 rounded ${
                                    flag.isEnabled
                                      ? 'bg-green-600/20 text-green-300 border border-green-600/40'
                                      : 'bg-gray-600/20 text-gray-400 border border-gray-600/40'
                                  }`}
                                >
                                  {flag.isEnabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </td>
                              <td className="py-2 pr-4 align-top">
                                <select
                                  value={overrideValue}
                                  onChange={(e) =>
                                    selectedUser &&
                                    void handleUserFlagOverrideChange(
                                      selectedUser.id,
                                      flag.flagName,
                                      e.target.value as 'inherit' | 'enable' | 'disable',
                                    )
                                  }
                                  disabled={
                                    Boolean(userFlagUpdating) && userFlagUpdating !== flag.flagName
                                  }
                                  className="bg-surface-1 text-white rounded px-3 py-1 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/60 text-xs"
                                >
                                  <option value="inherit">Inherit global</option>
                                  <option value="enable">Force enable</option>
                                  <option value="disable">Force disable</option>
                                </select>
                              </td>
                              <td className="py-2 pr-4 align-top text-xs">
                                <span
                                  className={`px-2 py-1 rounded ${
                                    flag.effectiveValue === null
                                      ? 'bg-surface-1 text-muted border border-border/40'
                                      : flag.effectiveValue
                                        ? 'bg-primary/20 text-primary border border-primary/40'
                                        : 'bg-gray-600/20 text-gray-400 border border-gray-600/40'
                                  }`}
                                >
                                  {flag.effectiveValue === null
                                    ? 'Unknown'
                                    : flag.effectiveValue
                                      ? 'Active'
                                      : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="bg-surface-2 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">Account Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.status === 'banned' ? (
                    <button
                      type="button"
                      onClick={() => handleUnbanUser(selectedUser)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Unban User
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleBanUser(selectedUser)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Ban User
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => window.open(`/profile/${selectedUser.username}`, '_blank')}
                    className="px-4 py-2 bg-primary text-white rounded hover:brightness-110"
                  >
                    View Profile
                  </button>

                  <button
                    type="button"
                    onClick={() => toast('Password reset tooling is coming soon.', { icon: '🔐' })}
                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                  >
                    Reset Password
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={closeUserModal}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {actionDialog && actionDialogCopy && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-surface-1 w-full max-w-xl rounded-lg border border-border p-6 shadow-2xl space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-white">{actionDialogCopy.title}</h3>
                {actionDialogCopy.description && (
                  <p className="text-sm text-muted mt-1">{actionDialogCopy.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeActionDialog}
                className="text-muted hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="bg-surface-2 rounded-lg p-4 space-y-2 text-sm">
              <div className="font-medium text-white">{actionDialog.user.username}</div>
              <div className="text-muted">{actionDialog.user.email}</div>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted">
                <div>
                  <span className="text-muted">Status:</span>{' '}
                  <span className="text-white capitalize">
                    {actionDialog.user.status || 'active'}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Last login:</span>{' '}
                  <span className="text-white">
                    {actionDialog.user.lastLogin
                      ? new Date(actionDialog.user.lastLogin).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                <div>
                  <span className="text-muted">VIP:</span>{' '}
                  <span className="text-white">{actionDialog.user.isVip ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-muted">Admin:</span>{' '}
                  <span className="text-white">{actionDialog.user.isAdmin ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>

            {actionDialogCopy.notesLabel && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-white" htmlFor={actionNotesId}>
                  {actionDialogCopy.notesLabel}
                  {actionDialogCopy.notesRequired && <span className="text-red-400 ml-1">*</span>}
                </label>
                <textarea
                  id={actionNotesId}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm focus:outline-none focus:border-primary"
                  placeholder={actionDialogCopy.notesPlaceholder}
                />
              </div>
            )}

            {actionDialogCopy.notesRequired && !actionDialogCopy.notesLabel && (
              <div className="text-sm text-red-400">
                Additional details are required for this action.
              </div>
            )}

            {actionError && <div className="text-sm text-red-400">{actionError}</div>}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeActionDialog}
                className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeAction}
                disabled={
                  actionSubmitting || (actionDialogCopy.notesRequired && !actionNotes.trim())
                }
                className={`px-4 py-2 rounded text-white disabled:opacity-60 disabled:cursor-not-allowed ${actionDialogCopy.confirmClass}`}
              >
                {actionSubmitting ? 'Working...' : actionDialogCopy.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default AdminUsers
