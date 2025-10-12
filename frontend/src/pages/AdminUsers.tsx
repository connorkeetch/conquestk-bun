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
  vipGrantedBy?: string
  vipGrantedByName?: string
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

const badgeTone = (
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted',
): string => {
  const base = 'badge'
  switch (tone) {
    case 'primary':
      return `${base} border-[color:color-mix(in srgb, var(--color-primary) 45%, transparent)] bg-[color:color-mix(in srgb, var(--color-primary) 14%, transparent)] text-[color:var(--color-primary)]`
    case 'success':
      return `${base} border-[color:color-mix(in srgb, var(--color-success) 45%, transparent)] bg-[color:color-mix(in srgb, var(--color-success) 14%, transparent)] text-[color:var(--color-success)]`
    case 'warning':
      return `${base} border-[color:color-mix(in srgb, var(--color-warning) 45%, transparent)] bg-[color:color-mix(in srgb, var(--color-warning) 16%, transparent)] text-[color:var(--color-warning)]`
    case 'danger':
      return `${base} border-[color:color-mix(in srgb, var(--color-danger) 45%, transparent)] bg-[color:color-mix(in srgb, var(--color-danger) 14%, transparent)] text-[color:var(--color-danger)]`
    case 'info':
      return `${base} border-[color:color-mix(in srgb, var(--color-info) 45%, transparent)] bg-[color:color-mix(in srgb, var(--color-info) 14%, transparent)] text-[color:var(--color-info)]`
    default:
      return `${base} text-muted`
  }
}

const getStatusTone = (status?: string | null): Parameters<typeof badgeTone>[0] => {
  if (!status) return 'muted'
  const normalized = status.toLowerCase()
  if (normalized === 'banned' || normalized === 'suspended') {
    return normalized === 'banned' ? 'danger' : 'warning'
  }
  if (normalized === 'active') return 'success'
  return 'muted'
}

const formatStatusLabel = (status?: string | null): string => {
  if (!status) return 'Active'
  return status
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

const formatPremiumTier = (tier?: User['premiumTier']): string => {
  if (!tier) return 'Free'
  return tier
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const getPremiumTone = (tier?: User['premiumTier']): Parameters<typeof badgeTone>[0] => {
  switch (tier) {
    case 'enterprise':
      return 'warning'
    case 'pro':
      return 'primary'
    case 'premium':
      return 'success'
    default:
      return 'muted'
  }
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
      // Hide deprecated clans flag from per-user view
      setUserFeatureFlags(flags.filter((f) => f.flagName !== 'clans_enabled'))
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
              ...(enableVip && trimmedNotes
                ? { vipReason: trimmedNotes }
                : {}),
              ...(enableVip ? { vipGrantedAt: new Date().toISOString() } : {}),
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
    confirmVariant: 'primary' | 'secondary' | 'success' | 'danger'
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
          confirmVariant: 'danger',
          notesLabel: 'Reason for ban',
          notesPlaceholder: 'Document why this account is being banned...',
          notesRequired: true,
        }
      case 'unban':
        return {
          title: `Reinstate ${dialog.user.username}?`,
          description: 'They will regain access immediately.',
          confirmLabel: 'Unban user',
          confirmVariant: 'success',
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
          confirmVariant: enabling ? 'primary' : 'secondary',
          ...(enabling ? { notesLabel: 'VIP notes (optional)' } : {}),
          ...(enabling
            ? { notesPlaceholder: 'Share why this player is receiving VIP treatment...' }
            : {}),
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
          confirmVariant: promoting ? 'danger' : 'secondary',
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
          confirmVariant: 'primary',
          notesRequired: false,
        }
    }
  }

  const renderUserModal = () => {
    if (!showUserModal || !selectedUser) return null

    const joinDate = new Date(selectedUser.createdAt).toLocaleDateString()
    const joinDateTime = new Date(selectedUser.createdAt).toLocaleString()
    const lastLogin = selectedUser.lastLogin
      ? new Date(selectedUser.lastLogin).toLocaleString()
      : 'Never'
    const vipBadgeClass = badgeTone(selectedUser.isVip ? 'primary' : 'muted')
    const adminBadgeClass = badgeTone(selectedUser.isAdmin ? 'danger' : 'muted')
    const betaBadgeClass = badgeTone(selectedUser.isBetaUser ? 'info' : 'muted')
    const emailBadgeClass = badgeTone(selectedUser.emailVerified ? 'success' : 'danger')
    const statusBadgeClass = badgeTone(getStatusTone(selectedUser.status))
    const premiumBadgeClass = badgeTone(getPremiumTone(selectedUser.premiumTier))

    const vipNotes: string[] = []
    if (selectedUser.vipReason) {
      vipNotes.push(`Reason: ${selectedUser.vipReason}.`)
    }
    if (selectedUser.vipGrantedAt) {
      const by = selectedUser.vipGrantedByName ? ` by ${selectedUser.vipGrantedByName}` : ''
      vipNotes.push(`Granted${by} ${new Date(selectedUser.vipGrantedAt).toLocaleString()}`)
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div className="modal w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="modal-header flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[color:var(--heading)]">
                {selectedUser.username}
              </h3>
              <p className="text-sm text-muted">Joined {joinDate}</p>
            </div>
            <button
              type="button"
              onClick={closeUserModal}
              className="btn-ghost btn-icon text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="modal-body space-y-5">
            <section className="panel-muted space-y-4">
              <h4 className="text-base font-semibold text-[color:var(--heading)]">
                Account information
              </h4>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted">User ID:</span>
                  <span className="font-mono text-xs text-[color:var(--text)]">
                    {selectedUser.id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Email:</span>
                  <span className="text-[color:var(--text)]">{selectedUser.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Status:</span>
                  <span className={statusBadgeClass}>{formatStatusLabel(selectedUser.status)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Joined:</span>
                  <span className="text-[color:var(--text)]">{joinDateTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Last login:</span>
                  <span className="text-[color:var(--text)]">{lastLogin}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Games played:</span>
                  <span className="text-[color:var(--text)]">{selectedUser.gamesPlayed || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Conquest Points (CP):</span>
                  <span className="text-[color:var(--text)]">{selectedUser.elo || 800}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Email verified:</span>
                  <span className={emailBadgeClass}>
                    {selectedUser.emailVerified ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Beta tester:</span>
                  <span className={betaBadgeClass}>{selectedUser.isBetaUser ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Language:</span>
                  <span className="text-[color:var(--text)]">
                    {selectedUser.preferredLanguage
                      ? selectedUser.preferredLanguage.toUpperCase()
                      : 'Default'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">Timezone:</span>
                  <span className="text-[color:var(--text)]">
                    {selectedUser.timezone || 'Not set'}
                  </span>
                </div>
              </div>
            </section>

            <section className="panel-muted space-y-4">
              <h4 className="text-base font-semibold text-[color:var(--heading)]">
                Special status & permissions
              </h4>
              <div className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-[color:var(--heading)]">VIP status</p>
                    <p className="text-xs text-muted">
                      Control access to VIP-only maps and community perks.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className={vipBadgeClass}>{selectedUser.isVip ? 'VIP' : 'Standard'}</span>
                    <select
                      value={selectedUser.isVip ? 'vip' : 'standard'}
                      onChange={(event) =>
                        handleVipStatusChange(selectedUser, event.target.value === 'vip')
                      }
                      className="form-select sm:w-40"
                    >
                      <option value="standard">Standard</option>
                      <option value="vip">VIP</option>
                    </select>
                  </div>
                </div>
                {vipNotes.length > 0 && <p className="text-xs text-muted">{vipNotes.join(' ')}</p>}

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-[color:var(--heading)]">Beta access</p>
                    <p className="text-xs text-muted">
                      Determines eligibility for beta-limited features and experiments.
                    </p>
                  </div>
                  <span className={betaBadgeClass}>
                    {selectedUser.isBetaUser ? 'Beta tester' : 'Standard'}
                  </span>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-[color:var(--heading)]">Admin status</p>
                    <p className="text-xs text-muted">
                      Full administrative privileges across moderation tools.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className={adminBadgeClass}>
                      {selectedUser.isAdmin ? 'Admin' : 'User'}
                    </span>
                    <select
                      value={selectedUser.isAdmin ? 'admin' : 'user'}
                      onChange={(event) =>
                        handleAdminStatusChange(selectedUser, event.target.value === 'admin')
                      }
                      className="form-select sm:w-36"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                {selectedUser.isAdmin && (
                  <p className="text-xs text-muted">
                    Reminder: admin actions are logged for audit trails.
                  </p>
                )}

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-[color:var(--heading)]">Premium tier</p>
                    <p className="text-xs text-muted">Subscription level and entitlement window.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className={premiumBadgeClass}>
                      {formatPremiumTier(selectedUser.premiumTier)}
                    </span>
                    <select
                      value={selectedUser.premiumTier || 'free'}
                      onChange={(event) =>
                        handleChangePremiumTier(selectedUser.id, event.target.value)
                      }
                      className="form-select sm:w-36"
                    >
                      <option value="free">Free</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>
                </div>
                {selectedUser.premiumTier === 'premium' && selectedUser.premiumExpiresAt && (
                  <p className="text-xs text-muted">
                    Expires {new Date(selectedUser.premiumExpiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </section>

            <section className="panel-muted space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-base font-semibold text-[color:var(--heading)]">
                    Feature flag overrides
                  </h4>
                  <p className="text-xs text-muted">
                    Force-enable or disable experiments for this user without changing global scope.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectedUser && void loadUserFeatureFlags(selectedUser.id)}
                  disabled={userFlagsLoading}
                  className="btn-secondary btn-sm disabled:opacity-60"
                >
                  {userFlagsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {userFlagsError && (
                <p className="text-sm text-[color:var(--color-danger)]">{userFlagsError}</p>
              )}

              {userFlagsLoading && userFeatureFlags.length === 0 ? (
                <p className="text-sm text-muted">Loading feature flags...</p>
              ) : userFeatureFlags.length === 0 ? (
                <p className="text-sm text-muted">No feature flags configured.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table text-sm min-w-[640px]">
                    <thead className="bg-[color:var(--panel-bg-alt)] text-[color:var(--heading)]">
                      <tr>
                        <th className="text-left">Flag</th>
                        <th className="text-left">Scope</th>
                        <th className="text-left">Global</th>
                        <th className="text-left">Override</th>
                        <th className="text-left">Effective</th>
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
                        const overrideDisabled =
                          Boolean(userFlagUpdating) && userFlagUpdating !== flag.flagName
                        const globalBadge = badgeTone(flag.isEnabled ? 'success' : 'muted')
                        const effectiveBadge =
                          flag.effectiveValue === null
                            ? badgeTone('info')
                            : badgeTone(flag.effectiveValue ? 'success' : 'muted')

                        return (
                          <tr key={flag.flagName} className="table-row">
                            <td className="align-top">
                              <div className="font-medium text-[color:var(--heading)] capitalize">
                                {flag.flagName.replace(/_/g, ' ')}
                              </div>
                              {flag.description && (
                                <p className="text-xs text-muted mt-1">{flag.description}</p>
                              )}
                            </td>
                            <td className="align-top text-xs text-muted">{flag.accessLevel}</td>
                            <td className="align-top">
                              <span className={globalBadge}>
                                {flag.isEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </td>
                            <td className="align-top">
                              <select
                                value={overrideValue}
                                onChange={(event) =>
                                  selectedUser &&
                                  void handleUserFlagOverrideChange(
                                    selectedUser.id,
                                    flag.flagName,
                                    event.target.value as 'inherit' | 'enable' | 'disable',
                                  )
                                }
                                disabled={overrideDisabled}
                                className="form-select text-xs sm:w-44"
                              >
                                <option value="inherit">Inherit global</option>
                                <option value="enable">Force enable</option>
                                <option value="disable">Force disable</option>
                              </select>
                            </td>
                            <td className="align-top">
                              <span className={effectiveBadge}>
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
            </section>

            <section className="panel-muted space-y-3">
              <h4 className="text-base font-semibold text-[color:var(--heading)]">
                Account actions
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedUser.status === 'banned' ? (
                  <button
                    type="button"
                    onClick={() => handleUnbanUser(selectedUser)}
                    className="btn-success"
                  >
                    Unban user
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleBanUser(selectedUser)}
                    className="btn-danger"
                  >
                    Ban user
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.open(`/profile/${selectedUser.username}`, '_blank')}
                  className="btn-primary"
                >
                  View profile
                </button>
                <button
                  type="button"
                  onClick={() => toast('Password reset tooling is coming soon.', { icon: '🔐' })}
                  className="btn-secondary"
                >
                  Reset password
                </button>
              </div>
            </section>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={closeUserModal} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderActionDialog = () => {
    if (!actionDialog || !actionDialogCopy) return null

    const confirmClass = (() => {
      switch (actionDialogCopy.confirmVariant) {
        case 'danger':
          return 'btn-danger'
        case 'success':
          return 'btn-success'
        case 'secondary':
          return 'btn-secondary'
        default:
          return 'btn-primary'
      }
    })()

    const lastLogin = actionDialog.user.lastLogin
      ? new Date(actionDialog.user.lastLogin).toLocaleString()
      : 'Never'

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
        <div className="modal w-full max-w-xl space-y-6">
          <div className="modal-header flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[color:var(--heading)]">
                {actionDialogCopy.title}
              </h3>
              {actionDialogCopy.description && (
                <p className="text-sm text-muted mt-1">{actionDialogCopy.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={closeActionDialog}
              className="btn-ghost btn-icon text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="modal-body space-y-4">
            <section className="panel-muted space-y-2 text-sm">
              <div className="font-medium text-[color:var(--heading)]">
                {actionDialog.user.username}
              </div>
              <div className="text-muted">{actionDialog.user.email}</div>
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted">Status:</span>{' '}
                  <span className={badgeTone(getStatusTone(actionDialog.user.status))}>
                    {formatStatusLabel(actionDialog.user.status)}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Last login:</span>{' '}
                  <span className="text-[color:var(--text)]">{lastLogin}</span>
                </div>
                <div>
                  <span className="text-muted">VIP:</span>{' '}
                  <span className={badgeTone(actionDialog.user.isVip ? 'primary' : 'muted')}>
                    {actionDialog.user.isVip ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Admin:</span>{' '}
                  <span className={badgeTone(actionDialog.user.isAdmin ? 'danger' : 'muted')}>
                    {actionDialog.user.isAdmin ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </section>

            {actionDialogCopy.notesLabel && (
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-[color:var(--heading)]"
                  htmlFor={actionNotesId}
                >
                  {actionDialogCopy.notesLabel}
                  {actionDialogCopy.notesRequired && (
                    <span className="text-[color:var(--color-danger)] ml-1">*</span>
                  )}
                </label>
                <textarea
                  id={actionNotesId}
                  value={actionNotes}
                  onChange={(event) => setActionNotes(event.target.value)}
                  rows={4}
                  className="w-full rounded border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-alt)] px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)]"
                  placeholder={actionDialogCopy.notesPlaceholder}
                />
              </div>
            )}

            {actionDialogCopy.notesRequired && !actionDialogCopy.notesLabel && (
              <p className="text-sm text-[color:var(--color-danger)]">
                Additional details are required for this action.
              </p>
            )}

            {actionError && (
              <p className="text-sm text-[color:var(--color-danger)]">{actionError}</p>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" onClick={closeActionDialog} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={executeAction}
              disabled={actionSubmitting || (actionDialogCopy.notesRequired && !actionNotes.trim())}
              className={confirmClass}
            >
              {actionSubmitting ? 'Working...' : actionDialogCopy.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleChangePremiumTier = async (userId: string, tier: string) => {
    try {
      await api.post(`/admin/users/${userId}/premium`, { tier })
      toast.success('Updated premium tier')
      await loadUsers()
      if (selectedUser?.id === userId) {
        setSelectedUser((prev) =>
          prev
            ? { ...prev, premiumTier: tier as Exclude<User['premiumTier'], undefined> }
            : prev,
        )
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
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="panel">
          <p className="text-muted">Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="space-y-8">
        <AdminPageHeader
          title="User Management"
          subtitle="Manage accounts, status changes, and feature access"
          icon="👥"
          actions={
            <div className="flex items-center gap-3">
              {isRefreshing && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="h-2 w-2 rounded-full bg-[color:var(--color-primary)] animate-pulse" />
                  Syncing latest data...
                </div>
              )}
              <button
                type="button"
                onClick={() => void loadUsers()}
                disabled={loading}
                className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                🔄 Refresh
              </button>
            </div>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="panel">
            <div className="text-2xl font-semibold text-[color:var(--heading)]">{users.length}</div>
            <p className="text-sm text-muted mt-1">Total users</p>
          </div>
          <div className="panel">
            <div className="text-2xl font-semibold text-[color:var(--color-primary)]">
              {users.filter((u) => u.isVip).length}
            </div>
            <p className="text-sm text-muted mt-1">VIP players</p>
          </div>
          <div className="panel">
            <div className="text-2xl font-semibold text-[color:var(--color-warning)]">
              {users.filter((u) => u.isAdmin).length}
            </div>
            <p className="text-sm text-muted mt-1">Admins</p>
          </div>
          <div className="panel">
            <div className="text-2xl font-semibold text-[color:var(--color-success)]">
              {users.filter((u) => u.premiumTier && u.premiumTier !== 'free').length}
            </div>
            <p className="text-sm text-muted mt-1">Premium members</p>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <form
              onSubmit={handleSearch}
              className="flex w-full flex-col gap-3 sm:flex-row sm:items-center"
            >
              <input
                type="text"
                placeholder="Search users by username or email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="form-input flex-1"
              />
              <button type="submit" className="btn-primary">
                Search
              </button>
            </form>

            <div className="segmented-control">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={filterType === 'all' ? 'segmented-active' : ''}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterType('vip')}
                className={filterType === 'vip' ? 'segmented-active' : ''}
              >
                VIP
              </button>
              <button
                type="button"
                onClick={() => setFilterType('admin')}
                className={filterType === 'admin' ? 'segmented-active' : ''}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setFilterType('premium')}
                className={filterType === 'premium' ? 'segmented-active' : ''}
              >
                Premium
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-[color:var(--color-danger)]">
                  Unable to load users
                </p>
                <p className="text-sm text-muted mt-1 max-w-2xl">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => void loadUsers()}
                className="btn-outline text-[color:var(--color-danger)] border-[color:var(--color-danger)] hover:border-[color:var(--color-danger)]"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Users Table */}
        {filteredUsers.length === 0 ? (
          <div className="panel text-center">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-bold text-[color:var(--heading)] mb-2">No users found</h3>
            <p className="text-muted">No users match your search criteria.</p>
          </div>
        ) : (
          <div className="panel p-0">
            <div className="overflow-x-auto">
              <table className="table min-w-[1024px]">
                <thead className="bg-[color:var(--panel-bg-alt)] text-[color:var(--heading)]">
                  <tr>
                    <th className="text-left">Username</th>
                    <th className="text-left">Email</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Verified</th>
                    <th className="text-left">Admin</th>
                    <th className="text-left">VIP</th>
                    <th className="text-left">Beta</th>
                    <th className="text-left">Premium</th>
                    <th className="text-left">Games</th>
                    <th className="text-left">CP</th>
                    <th className="text-left">Last Login</th>
                    <th className="text-left">Actions</th>
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
                    <tr key={user.id} className="table-row hover:bg-[color:var(--hover-bg)]">
                      <td className="font-medium text-[color:var(--heading)]">{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={badgeTone(getStatusTone(user.status))}>
                          {formatStatusLabel(user.status)}
                        </span>
                      </td>
                      <td>
                        <span className={badgeTone(user.emailVerified ? 'success' : 'danger')}>
                          {user.emailVerified ? 'Verified' : 'Unverified'}
                        </span>
                      </td>
                      <td>
                        <span className={badgeTone(user.isAdmin ? 'danger' : 'muted')}>
                          {user.isAdmin ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={badgeTone(user.isVip ? 'primary' : 'muted')}
                          title={user.vipReason || undefined}
                        >
                          {user.isVip ? 'VIP' : 'Standard'}
                        </span>
                      </td>
                      <td>
                        <span className={badgeTone(user.isBetaUser ? 'info' : 'muted')}>
                          {user.isBetaUser ? 'Tester' : 'Standard'}
                        </span>
                      </td>
                      <td>
                        <span className={badgeTone(getPremiumTone(user.premiumTier))}>
                          {formatPremiumTier(user.premiumTier)}
                        </span>
                      </td>
                      <td>{user.gamesPlayed || 0}</td>
                      <td>{user.elo || 800}</td>
                      <td>
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openUserModal(user)}
                          className="btn-secondary"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {renderUserModal()}

        {renderActionDialog()}
      </div>
    </div>
  )
}

export default AdminUsers
