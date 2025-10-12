import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { type AdminActivityLog, adminService, type FeatureFlag } from '../services/adminService'

interface SystemStatus {
  timestamp: string
  database: {
    userCount: number
    verifiedUsers?: number
    betaUsers?: number
    vipUsers?: number
    premiumUsers?: number
    mapCount: number
    mapsPendingReview?: number
    publicMaps?: number
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
  const [queueStats, setQueueStats] = useState<{
    initialized: boolean
    queues: Record<
      string,
      {
        waiting: number
        active: number
        completed: number
        failed: number
        delayed: number
        deadLetter: number
        stalled: number
        isPaused: boolean
        oldestWaitingMs: number | null
        avgProcessingMs: number | null
        warnings: string[]
      }
    >
    timestamp: string
  } | null>(null)
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [refreshingFlags, setRefreshingFlags] = useState(false)
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null)
  const [cacheClearing, setCacheClearing] = useState(false)
  const [runningOddsVerify, setRunningOddsVerify] = useState(false)
  const [runningAiBench, setRunningAiBench] = useState(false)
  const [aiBenchResult, setAiBenchResult] = useState<null | {
    sets: number
    candidatesPer: number
    territories: number
    ts: { totalMs: number; candidatesPerSec: number }
    wasm: { totalMs: number; candidatesPerSec: number }
  }>(null)
  const [activityLogs, setActivityLogs] = useState<AdminActivityLog[]>([])
  const [activityError, setActivityError] = useState<string | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editAccessLevel, setEditAccessLevel] = useState<FeatureFlag['accessLevel']>('disabled')
  const [editCategory, setEditCategory] = useState<string>('')
  const [editConfig, setEditConfig] = useState('')
  const [editDependencies, setEditDependencies] = useState('')
  const [editReason, setEditReason] = useState('')
  const [savingFlag, setSavingFlag] = useState(false)
  const [oddsHistory, setOddsHistory] = useState<{
    points: Array<{ ts: number; environment: string; kind: string; checked: number; divergences: number; rate: number }>
    snapshot: { counters: Array<{ metric: string; labels: Record<string, string>; value: number }>; gauges: Array<{ metric: string; labels: Record<string, string>; value: number }> }
  } | null>(null)

  const Sparkline = ({ points }: { points: Array<{ ts: number; rate: number }> }) => {
    if (!points || points.length === 0) return null
    const width = 140
    const height = 36
    const pad = 2
    const xs = points.map((p) => p.ts)
    const ys = points.map((p) => p.rate)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    // const minY = 0
    const maxY = Math.max(0.001, Math.max(...ys))
    const normX = (x: number) =>
      pad + ((x - minX) / Math.max(1, maxX - minX)) * (width - pad * 2)
    const normY = (y: number) => height - pad - (y / maxY) * (height - pad * 2)
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${normX(p.ts).toFixed(1)} ${normY(p.rate).toFixed(1)}`)
      .join(' ')
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.5} />
      </svg>
    )
  }

  const fetchActivityLogs = useCallback(async () => {
    try {
      setLoadingActivity(true)
      setActivityError(null)
      const logs = await adminService.getAdminActivityLogs({ limit: 6 })
      setActivityLogs(logs)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load activity logs'
      setActivityError(message)
    } finally {
      setLoadingActivity(false)
    }
  }, [])

  const loadDashboardData = useCallback(
    async (options: { showLoader?: boolean } = {}) => {
      const { showLoader = true } = options
      try {
        if (showLoader) {
          setLoading(true)
        }
        setError(null)

        const [statusData, adminData, featureFlagData, oddsData] = await Promise.all([
          adminService.getSystemStatus(),
          adminService.getAdminInfo(),
          adminService.getFeatureFlags(),
          adminService.getOddsHistory(24),
        ])

        setSystemStatus(statusData)
        setAdminInfo(adminData)
        setFeatureFlags(featureFlagData ?? [])
        setOddsHistory(oddsData)
        await fetchActivityLogs()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load dashboard data'
        if (showLoader) {
          setError(message)
        } else {
          toast.error(`Failed to refresh dashboard data: ${message}`)
        }
      } finally {
        if (showLoader) {
          setLoading(false)
        }
      }
    },
    [fetchActivityLogs],
  )

  const handleRunOddsVerify = useCallback(async () => {
    try {
      setRunningOddsVerify(true)
      toast.loading('Running odds shadow verification…', { id: 'odds-run' })
      const result = await adminService.runOddsShadowVerify({ trials: 100_000 })
      toast.success(
        `Odds verify complete: ${result.trials.toLocaleString()} trials, divergences ${result.divergences}, rate ${(result.divergenceRate * 100).toFixed(4)}%`,
        { id: 'odds-run' },
      )
      const oddsData = await adminService.getOddsHistory(24)
      setOddsHistory(oddsData)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to run odds verification'
      toast.error(msg, { id: 'odds-run' })
    } finally {
      setRunningOddsVerify(false)
    }
  }, [])

  const handleRunAiEvalBench = useCallback(async () => {
    try {
      setRunningAiBench(true)
      toast.loading('Running AI eval benchmark…', { id: 'ai-bench' })
      const result = await adminService.runAiEvalBench({ sets: 50, candidatesPer: 200, territories: 120 })
      setAiBenchResult(result)
      toast.success(
        `AI eval: TS ${Math.round(result.ts.candidatesPerSec).toLocaleString()} cps, WASM ${Math.round(result.wasm.candidatesPerSec).toLocaleString()} cps`,
        { id: 'ai-bench' },
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to run AI eval benchmark'
      toast.error(msg, { id: 'ai-bench' })
    } finally {
      setRunningAiBench(false)
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
        toast.error(`Failed to toggle feature flag: ${message}`)
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

  useEffect(() => {
    const loadQueues = async () => {
      try {
        const stats = await adminService.getQueueStats()
        setQueueStats(stats)
      } catch {
        // non-fatal for dashboard
      }
    }
    void loadQueues()
  }, [])

  const handleClearCache = useCallback(async () => {
    if (!confirm('Are you sure you want to clear the server cache?')) {
      return
    }

    try {
      setCacheClearing(true)
      await adminService.refreshCache()
      toast.success('Cache cleared successfully')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Failed to clear cache: ${message}`)
    } finally {
      setCacheClearing(false)
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

  const formatCount = (value?: number) => (value != null ? value.toLocaleString() : '0')

  const sortedFeatureFlags = useMemo(() => {
    if (featureFlags.length > 0) {
      return [...featureFlags].sort((a, b) => a.flagName.localeCompare(b.flagName))
    }

    if (systemStatus) {
      return Object.entries(systemStatus.featureFlags)
        .map(([flagName, isEnabled]) => ({
          id: flagName,
          flagName,
          description: undefined,
          isEnabled,
          config: {},
          createdBy: 'system',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessLevel: 'disabled' as FeatureFlag['accessLevel'],
          category: null,
          dependencies: [],
        }))
        .sort((a, b) => a.flagName.localeCompare(b.flagName))
    }

    return []
  }, [featureFlags, systemStatus])

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
            type="button"
            onClick={() => void loadDashboardData()}
            className="mt-4 bg-primary hover:brightness-110 px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const databaseStats = systemStatus?.database
  const adminRoles = adminInfo?.adminRoles ?? []
  const adminRoleLabel =
    adminRoles.length > 0 ? adminRoles.map((role) => role.roleName).join(', ') : 'Admin'

  const openEditModal = (flag: FeatureFlag) => {
    setEditingFlag(flag)
    setEditDescription(flag.description ?? '')
    setEditAccessLevel(flag.accessLevel)
    setEditCategory(flag.category ?? '')
    setEditConfig(JSON.stringify(flag.config ?? {}, null, 2))
    setEditDependencies(flag.dependencies?.join(', ') ?? '')
    setEditReason('')
  }

  const closeEditModal = () => {
    setEditingFlag(null)
    setSavingFlag(false)
  }

  const handleSaveFeatureFlag = async () => {
    if (!editingFlag) return

    let parsedConfig: Record<string, unknown> = {}
    if (editConfig.trim().length > 0) {
      try {
        parsedConfig = JSON.parse(editConfig)
      } catch {
        toast.error('Config must be valid JSON')
        return
      }
    }

    const dependencies = editDependencies
      .split(',')
      .map((dep) => dep.trim())
      .filter((dep) => dep.length > 0)

    setSavingFlag(true)

    try {
      await adminService.updateFeatureFlagSettings(editingFlag.flagName, {
        description: editDescription.trim() || null,
        accessLevel: editAccessLevel,
        category: editCategory.trim() || null,
        config: parsedConfig,
        dependencies,
        ...(editReason.trim() ? { reason: editReason.trim() } : {}),
      })

      toast.success('Feature flag updated')
      closeEditModal()
      await loadDashboardData({ showLoader: false })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update feature flag'
      toast.error(message)
    } finally {
      setSavingFlag(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-1 p-6">
      <div className="max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🛡️ Admin Dashboard</h1>
          <div className="text-muted">Welcome back, {adminRoleLabel}</div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 mb-8">
          <div className="glass-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-primary-soft">
                  {databaseStats?.userCount != null
                    ? databaseStats.userCount.toLocaleString()
                    : '0'}
                </div>
                <div className="text-sm text-muted">Total Users</div>
              </div>
              <div className="text-3xl">👥</div>
            </div>
            <div className="mt-3 text-xs text-muted space-y-1">
              <div>Verified: {formatCount(databaseStats?.verifiedUsers)}</div>
              <div>Beta testers: {formatCount(databaseStats?.betaUsers)}</div>
              <div>
                VIP: {formatCount(databaseStats?.vipUsers)} · Premium:{' '}
                {formatCount(databaseStats?.premiumUsers)}
              </div>
            </div>
          </div>

          {/* Odds Divergence (last 24h) */}
          <div className="glass-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-purple-400">
                  {(() => {
                    const latest = oddsHistory?.points?.[oddsHistory.points.length - 1]
                    const pct = latest ? (latest.rate * 100).toFixed(3) : '—'
                    return `${pct}%`
                  })()}
                </div>
                <div className="text-sm text-muted">Odds Divergence (24h)</div>
              </div>
              <div className="text-3xl">🎲</div>
            </div>
            <div className="mt-3 text-xs text-muted space-y-1">
              <div>
                Checks: {oddsHistory?.points?.reduce((acc, p) => acc + (p.checked || 0), 0) ?? 0}
              </div>
              <div>
                Divergences: {oddsHistory?.points?.reduce((acc, p) => acc + (p.divergences || 0), 0) ?? 0}
              </div>
              <div>
                Last run:{' '}
                {(() => {
                  const ts = oddsHistory?.points?.[oddsHistory.points.length - 1]?.ts
                  return ts ? new Date(ts).toLocaleString() : '—'
                })()}
              </div>
              <div className="pt-2 text-[color:var(--heading)]">
                <Sparkline
                  points={(oddsHistory?.points || []).map((p) => ({ ts: p.ts, rate: p.rate }))}
                />
              </div>
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
            <div className="mt-3 text-xs text-muted space-y-1">
              <div>Public: {formatCount(databaseStats?.publicMaps)}</div>
              <div>Pending review: {formatCount(databaseStats?.mapsPendingReview)}</div>
            </div>
          </div>

          <div className="glass-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-yellow-400">
                  {databaseStats?.activeGames != null
                    ? databaseStats.activeGames.toLocaleString()
                    : '0'}
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
          <div className="glass-box">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-400">
                  {Object.values(queueStats?.queues ?? {}).reduce(
                    (sum, q) => sum + (q.deadLetter || 0),
                    0,
                  )}
                </div>
                <div className="text-sm text-muted">Dead-letter Jobs</div>
              </div>
              <div className="text-3xl">📥</div>
            </div>
            <div className="mt-3 text-xs text-muted space-y-1">
              <div>
                Waiting total:{' '}
                {Object.values(queueStats?.queues ?? {}).reduce(
                  (sum, q) => sum + (q.waiting || 0),
                  0,
                )}
              </div>
              <div>
                Failed total:{' '}
                {Object.values(queueStats?.queues ?? {}).reduce(
                  (sum, q) => sum + (q.failed || 0),
                  0,
                )}
              </div>
              <div className="pt-1">
                <a href="/admin/queue-tools" className="underline text-[color:var(--heading)]">
                  Open queue tools →
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8">
            {/* Admin Tools */}
            <div className="glass-box-lg">
              <h2 className="text-xl font-bold mb-4">🛠️ Admin Tools</h2>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void handleRunOddsVerify()}
                  disabled={runningOddsVerify}
                  className="w-full text-left glass-box-sm hover:brightness-110 transition-all disabled:opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Run Odds Shadow Verification (100k)</div>
                      <div className="text-muted text-xs">
                        Executes parallel shadow comparisons and updates the divergence metrics
                      </div>
                    </div>
                    <div className="text-sm">{runningOddsVerify ? 'Running…' : 'Run now'}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunAiEvalBench()}
                  disabled={runningAiBench}
                  className="w-full text-left glass-box-sm hover:brightness-110 transition-all disabled:opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Run AI Eval Benchmark</div>
                      <div className="text-muted text-xs">
                        Compare TS vs WASM candidate scoring throughput (candidates/sec)
                      </div>
                    </div>
                    <div className="text-sm">{runningAiBench ? 'Running…' : 'Run now'}</div>
                  </div>
                  {aiBenchResult && (
                    <div className="mt-2 text-xs text-muted">
                      TS: {Math.round(aiBenchResult.ts.candidatesPerSec).toLocaleString()} cps · WASM: {Math.round(aiBenchResult.wasm.candidatesPerSec).toLocaleString()} cps
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleClearCache}
                  disabled={cacheClearing}
                  className="w-full text-left glass-box-sm hover:brightness-110 transition-all disabled:opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[color:var(--heading)]">
                        Clear Server Cache
                      </div>
                      <div className="text-sm text-muted">
                        {cacheClearing
                          ? 'Clearing cache...'
                          : 'Refresh all cached data on the server'}
                      </div>
                    </div>
                    <div className="text-2xl">🔄</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Recent Admin Activity */}
            <div className="glass-box-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">📋 Recent Admin Activity</h2>
                <button
                  type="button"
                  onClick={() => void fetchActivityLogs()}
                  className="px-3 py-1 bg-surface-2 border border-border text-sm rounded hover:bg-surface-2/80 transition-colors disabled:opacity-60"
                  disabled={loadingActivity}
                >
                  {loadingActivity ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              {loadingActivity ? (
                <div className="py-8 text-center text-muted">Loading recent changes...</div>
              ) : activityError ? (
                <div className="py-8 text-center space-y-3">
                  <div className="text-sm text-red-400">Failed to load activity logs</div>
                  <div className="text-xs text-muted">{activityError}</div>
                  <button
                    type="button"
                    onClick={() => void fetchActivityLogs()}
                    className="px-3 py-2 bg-primary text-white text-sm rounded hover:brightness-110"
                  >
                    Try again
                  </button>
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="py-8 text-center text-muted">No admin actions recorded yet.</div>
              ) : (
                <div className="space-y-4">
                  {activityLogs.map((log) => {
                    const detailEntries = Object.entries(log.actionDetails ?? {})
                      .filter(
                        ([_, value]) => typeof value === 'string' || typeof value === 'number',
                      )
                      .slice(0, 2)

                    return (
                      <div
                        key={log.id}
                        className="rounded-lg bg-surface-1/60 border border-border/40 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-[color:var(--heading)]">
                              {adminService.formatActionType(log.actionType)}
                            </div>
                            <div className="text-xs text-muted mt-1">
                              {new Date(log.timestamp).toLocaleString()} · {log.adminUsername}
                            </div>
                          </div>
                          {log.targetType && (
                            <span className="px-2 py-1 text-xs uppercase tracking-wide rounded bg-surface-2/80 border border-border/40">
                              {log.targetType}
                            </span>
                          )}
                        </div>
                        {(log.targetId || detailEntries.length > 0) && (
                          <div className="text-xs text-muted mt-3 space-y-1">
                            {log.targetId && (
                              <div>
                                Target ID:{' '}
                                <span className="text-[color:var(--heading)]">{log.targetId}</span>
                              </div>
                            )}
                            {detailEntries.map(([key, value]) => (
                              <div key={key}>
                                {key}:{' '}
                                <span className="text-[color:var(--heading)]">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            <div className="glass-box-lg">
              <h2 className="text-xl font-bold mb-4">🛡️ Admin Access</h2>
              {adminRoles.length > 0 ? (
                <div className="space-y-4">
                  {adminRoles.map((role) => {
                    const permissions = role.permissions.filter(
                      (permission) => permission.trim().length > 0,
                    )
                    return (
                      <div
                        key={role.roleId}
                        className="rounded-lg bg-surface-1/60 border border-border/40 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-[color:var(--heading)]">
                              {role.roleName}
                            </div>
                            <div className="text-xs text-muted mt-1">
                              {permissions.length > 0
                                ? 'Role capabilities'
                                : 'No explicit permissions assigned'}
                            </div>
                          </div>
                          <span className="text-xs text-muted whitespace-nowrap">
                            #{role.roleId}
                          </span>
                        </div>
                        {permissions.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {permissions.map((permission) => (
                              <span
                                key={permission}
                                className="px-2 py-1 text-xs uppercase tracking-wide rounded bg-surface-2/80 border border-border/40"
                              >
                                {permission}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted">
                  You don't have any delegated admin roles yet. Reach out if this looks wrong.
                </div>
              )}
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
              {sortedFeatureFlags.filter((f) => f.flagName !== 'clans_enabled').length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">🚩</div>
                  <p className="text-muted">No feature flags configured</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedFeatureFlags
                    .filter((flag) => flag.flagName !== 'clans_enabled')
                    .map((flag) => (
                      <div
                        key={flag.flagName}
                        className="flex items-center justify-between bg-surface-2 rounded-lg p-4"
                      >
                        <div className="flex-1 pr-4">
                          <div className="font-medium capitalize">
                            {formatFlagName(flag.flagName)}
                          </div>
                          {flag.description && (
                            <div className="text-sm text-muted">{flag.description}</div>
                          )}
                          <div className="text-xs text-muted mt-1">
                            Status: {formatFlagStatus(flag.flagName, flag.isEnabled)}
                          </div>
                          {'updatedAt' in flag && flag.updatedAt && (
                            <div className="text-xs text-muted mt-1">
                              Last updated: {new Date(flag.updatedAt).toLocaleString()}
                            </div>
                          )}
                          {'accessLevel' in flag && (
                            <div className="text-xs text-muted mt-1">Scope: {flag.accessLevel}</div>
                          )}
                        </div>
                        <label
                          className={`toggle ${
                            updatingFlag === flag.flagName ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={flag.isEnabled}
                            onChange={(e) => toggleFeatureFlag(flag.flagName, e.target.checked)}
                            disabled={updatingFlag === flag.flagName}
                            aria-label={`Toggle ${formatFlagName(flag.flagName)}`}
                          />
                          <span className="slider"></span>
                        </label>
                        {featureFlags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openEditModal(flag as FeatureFlag)}
                            className="ml-4 px-3 py-2 text-sm bg-surface-1 border border-border rounded hover:bg-surface-1/70 transition-colors"
                          >
                            Manage
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingFlag && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-1 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between p-6 border-b border-border/50">
              <div>
                <h3 className="text-xl font-semibold text-[color:var(--heading)]">
                  Manage Flag: {formatFlagName(editingFlag.flagName)}
                </h3>
                <p className="text-sm text-muted mt-1">
                  Adjust targeting scope and overrides for this feature.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="text-muted hover:text-[color:var(--color-text)] text-2xl leading-none"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col text-sm">
                  <span className="text-muted mb-1">Description</span>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="bg-surface-2 text-[color:var(--color-text)] rounded px-3 py-2 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
                  />
                </label>
                <div className="space-y-3">
                  <label className="flex flex-col text-sm">
                    <span className="text-muted mb-1">Access Level</span>
                    <select
                      value={editAccessLevel}
                      onChange={(e) =>
                        setEditAccessLevel(e.target.value as FeatureFlag['accessLevel'])
                      }
                      className="bg-surface-2 text-[color:var(--color-text)] rounded px-3 py-2 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
                    >
                      <option value="disabled">Disabled</option>
                      <option value="internal">Internal (admins + testers)</option>
                      <option value="beta">Beta (admins + testers + beta users)</option>
                      <option value="public">Public (everyone)</option>
                    </select>
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="text-muted mb-1">Category</span>
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      placeholder="gameplay, ui, experimental..."
                      className="bg-surface-2 text-[color:var(--color-text)] rounded px-3 py-2 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col text-sm">
                  <span className="text-muted mb-1">Target Criteria (JSON)</span>
                  <textarea
                    value={editConfig}
                    onChange={(e) => setEditConfig(e.target.value)}
                    rows={8}
                    className="font-mono text-xs bg-surface-2 text-[color:var(--color-text)] rounded px-3 py-2 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
                  />
                </label>
                <div className="space-y-4">
                  <label className="flex flex-col text-sm">
                    <span className="text-muted mb-1">Dependencies</span>
                    <input
                      type="text"
                      value={editDependencies}
                      onChange={(e) => setEditDependencies(e.target.value)}
                      placeholder="Comma separated flag names"
                      className="bg-surface-2 text-[color:var(--color-text)] rounded px-3 py-2 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
                    />
                  </label>
                  <label className="flex flex-col text-sm">
                    <span className="text-muted mb-1">Change Reason (optional)</span>
                    <textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      rows={4}
                      className="bg-surface-2 text-[color:var(--color-text)] rounded px-3 py-2 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
                      placeholder="Document why you're adjusting this flag. Helpful for audit logs."
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 rounded bg-surface-2 border border-border text-[color:var(--color-text)] hover:bg-surface-2/80 transition-colors"
                  disabled={savingFlag}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveFeatureFlag()}
                  className="px-4 py-2 rounded bg-primary text-white hover:brightness-110 transition-colors disabled:opacity-60"
                  disabled={savingFlag}
                >
                  {savingFlag ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
