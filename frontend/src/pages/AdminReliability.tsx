import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { adminService, type ClientMetricsSummary } from '@/services/adminService'

export default function AdminReliability() {
  const [hours, setHours] = useState<number>(24)
  const [tab, setTab] = useState<'overview' | 'hotspots'>('overview')
  const [summary, setSummary] = useState<ClientMetricsSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [realtime, setRealtime] = useState<{
    payloads: {
      gameUpdate: { count: number; p50: number; p95: number; max: number } | null
      lockstepFrame: { count: number; p50: number; p95: number; max: number } | null
      lockstepChecksum: { count: number; p50: number; p95: number; max: number } | null
    }
    realtime: {
      accepted: Array<{ metric: string; labels: Record<string, string>; value: number }>
      byAction: Record<
        string,
        {
          ackMs: { count: number; p50: number; p95: number; max: number }
          processMs: { count: number; p50: number; p95: number; max: number }
        }
      >
    }
    lockstep: {
      counters: Array<{ metric: string; labels: Record<string, string>; value: number }>
      gauges: Array<{ metric: string; labels: Record<string, string>; value: number }>
    }
    ts: string
  } | null>(null)
  const [loadingRealtime, setLoadingRealtime] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const loadSummary = useCallback(async () => {
    try {
      setLoadingSummary(true)
      const data = await adminService.getClientMetricsSummary(hours)
      setSummary(data)
    } finally {
      setLoadingSummary(false)
    }
  }, [hours])

  const loadRealtime = useCallback(async () => {
    try {
      setLoadingRealtime(true)
      const data = await adminService.getRealtimeMetrics()
      setRealtime(data)
    } catch {
      setRealtime(null)
    } finally {
      setLoadingRealtime(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    void loadRealtime()
  }, [loadRealtime])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      void loadSummary()
      void loadRealtime()
    }, 15000)
    return () => clearInterval(id)
  }, [autoRefresh, loadSummary, loadRealtime])

  const onResetData = async () => {
    const proceed = window.confirm('Delete persisted client metrics snapshots?')
    if (!proceed) return
    try {
      await adminService.resetClientMetrics({ scope: 'all' })
      toast.success('Client metrics cleared')
      await loadSummary()
    } catch {
      toast.error('Failed to reset client metrics')
    }
  }

  const onResetCounters = async () => {
    try {
      await adminService.resetRealtimeMetrics()
      toast.success('Realtime counters reset')
      await loadRealtime()
    } catch {
      toast.error('Failed to reset counters')
    }
  }

  const lockstep = summary?.lockstepResyncs ?? {
    total: 0,
    successes: 0,
    failures: 0,
    failureRate: 0,
    avgDurationMs: 0,
    byReason: [],
  }
  const failureRatePct = Math.round((lockstep.failureRate ?? 0) * 1000) / 10
  const avgResyncDuration = Math.round(lockstep.avgDurationMs ?? 0)
  const byReason = [...(lockstep.byReason ?? [])]
    .filter((entry) => (entry?.total ?? 0) > 0)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 5)
  const sessionsPerGame = Array.isArray(summary?.sessionsPerGame) ? summary?.sessionsPerGame : []
  const sessionsPerUser = Array.isArray(summary?.sessionsPerUser) ? summary?.sessionsPerUser : []

  const warnings = useMemo(() => {
    const arr: Array<{ severity: 'warn' | 'critical'; message: string }> = []
    const avgSuccessRate = summary?.avgSuccessRate ?? 100
    const avgLatency = summary?.avgLatency ?? 0
    const reconnectsPerSession =
      (summary?.sessionCount ?? 0) > 0
        ? (summary?.totalReconnects ?? 0) / (summary?.sessionCount ?? 1)
        : (summary?.totalReconnects ?? 0)
    if (avgSuccessRate < 90) {
      arr.push({
        severity: 'critical',
        message: `Action success rate is ${avgSuccessRate.toFixed(1)}% (< 90%)`,
      })
    } else if (avgSuccessRate < 95) {
      arr.push({
        severity: 'warn',
        message: `Action success rate dipped to ${avgSuccessRate.toFixed(1)}%`,
      })
    }
    if (avgLatency > 600) {
      arr.push({
        severity: 'critical',
        message: `Average latency is ${Math.round(avgLatency)} ms (> 600 ms)`,
      })
    } else if (avgLatency > 400) {
      arr.push({ severity: 'warn', message: `Average latency is ${Math.round(avgLatency)} ms` })
    }
    if (reconnectsPerSession > 5) {
      arr.push({
        severity: 'critical',
        message: `Reconnects average ${reconnectsPerSession.toFixed(1)} per session`,
      })
    } else if (reconnectsPerSession > 2) {
      arr.push({
        severity: 'warn',
        message: `Reconnects averaging ${reconnectsPerSession.toFixed(1)} per session`,
      })
    }
    if (failureRatePct > 10) {
      arr.push({
        severity: 'critical',
        message: `Lockstep resync failure rate is ${failureRatePct.toFixed(1)}% (> 10%)`,
      })
    } else if (failureRatePct > 3) {
      arr.push({
        severity: 'warn',
        message: `Lockstep resync failure rate is ${failureRatePct.toFixed(1)}%`,
      })
    }
    if (avgResyncDuration > 2000) {
      arr.push({ severity: 'warn', message: `Resyncs average ${avgResyncDuration} ms` })
    }
    return arr
  }, [summary, failureRatePct, avgResyncDuration])

  const barWidth = (value: number) => `${Math.max(0, Math.min(100, value))}%`
  const avgSuccessRate = summary?.avgSuccessRate ?? 100
  const avgLatency = summary?.avgLatency ?? 0
  const successColor =
    avgSuccessRate < 90 ? 'bg-red-500' : avgSuccessRate < 95 ? 'bg-amber-400' : 'bg-emerald-400'
  const latencyColor =
    avgLatency > 600 ? 'bg-red-500' : avgLatency > 400 ? 'bg-amber-400' : 'bg-sky-400'
  const failureColor =
    failureRatePct > 10 ? 'bg-red-500' : failureRatePct > 3 ? 'bg-amber-400' : 'bg-sky-400'

  const formatSessionsLabel = (label: string | null, fallback: string) =>
    label && label.trim().length > 0 ? label : fallback

  const renderResyncHotspots = (
    items: Array<{
      id: string | null
      label: string | null
      status?: string | null
      username?: string | null
      sessions: number
      reconnects: number
      resyncs: number
      resyncsPerSession: number
    }>,
    emptyText: string,
    fallbackPrefix: string,
  ) => {
    if (!items || items.length === 0) {
      return <div className="text-[11px] text-muted">{emptyText}</div>
    }
    return (
      <div className="space-y-2">
        {items.map((item) => {
          const severityClass =
            item.resyncsPerSession > 2
              ? 'text-red-200'
              : item.resyncsPerSession > 0.5
                ? 'text-amber-200'
                : 'text-white/80'
          const label = formatSessionsLabel(item.label ?? item.username ?? null, fallbackPrefix)
          const badge =
            item.status && item.status !== 'completed'
              ? ` · ${item.status.replaceAll('_', ' ')}`
              : ''
          return (
            <div
              key={`${fallbackPrefix}-${item.id ?? label}`}
              className="rounded-lg border border-border/40 bg-surface-3/60 p-2"
            >
              <div className="flex items-center justify-between text-sm text-white">
                <span className="truncate" title={label}>
                  {label}
                  <span className="text-[10px] uppercase text-muted">{badge}</span>
                </span>
                <span className={`text-xs font-semibold ${severityClass}`}>
                  {item.resyncs.toLocaleString()} resyncs
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {item.sessions} session{item.sessions === 1 ? '' : 's'} · {item.reconnects}{' '}
                reconnect
                {item.reconnects === 1 ? '' : 's'} · {item.resyncsPerSession.toFixed(2)}{' '}
                resyncs/session
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-2xl font-bold text-white">Reliability</div>
          <div className="text-sm text-muted">
            Lockstep health, client resyncs, and realtime latency
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh 15s
        </label>
      </div>

      {/* Client reliability summary */}
      <div className="bg-surface-2 border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted">Timeframe</span>
            <select
              className="bg-surface-2/80 border border-border/40 rounded px-2 py-1 text-[12px] text-white/90"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              <option value={6}>Last 6h</option>
              <option value={24}>Last 24h</option>
              <option value={72}>Last 72h</option>
              <option value={168}>Last 7d</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded overflow-hidden border border-border/40">
              <button
                type="button"
                className={`px-2 py-1 text-[11px] ${tab === 'overview' ? 'bg-surface-2 text-white' : 'bg-surface-1 text-white/70 hover:text-white'}`}
                onClick={() => setTab('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                className={`px-2 py-1 text-[11px] ${tab === 'hotspots' ? 'bg-surface-2 text-white' : 'bg-surface-1 text-white/70 hover:text-white'}`}
                onClick={() => setTab('hotspots')}
              >
                Hotspots
              </button>
            </div>
            <button
              type="button"
              className="px-2 py-1 text-[11px] rounded bg-surface-2/70 border border-border/40 hover:bg-surface-2"
              onClick={() => void onResetData()}
              disabled={loadingSummary}
            >
              Reset Data
            </button>
          </div>
        </div>

        {!summary ? (
          <div className="text-xs text-muted mt-3">{loadingSummary ? 'Loading…' : 'No data'}</div>
        ) : tab === 'overview' ? (
          <div className="mt-3 text-xs text-white/80 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted">Sessions</div>
                <div className="text-sm font-semibold text-white">{summary.sessionCount}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted">Active Games</div>
                <div className="text-sm font-semibold text-white">{summary.activeGames}</div>
                <div className="text-[10px] text-muted">
                  {(lockstep.total ?? 0).toLocaleString()} resyncs observed
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted">Reconnects</div>
                <div className="text-sm font-semibold text-white">{summary.totalReconnects}</div>
                <div className="text-[10px] text-muted">
                  {(summary.sessionCount > 0
                    ? summary.totalReconnects / summary.sessionCount
                    : summary.totalReconnects
                  ).toFixed(1)}{' '}
                  per session
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-muted uppercase tracking-wide">
                <span>Action Success</span>
                <span>{(summary.avgSuccessRate ?? 0).toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${successColor}`}
                  style={{ width: barWidth(summary.avgSuccessRate ?? 0) }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-muted uppercase tracking-wide">
                <span>Avg Latency</span>
                <span>{Math.round(summary.avgLatency ?? 0)} ms</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${latencyColor}`}
                  style={{ width: barWidth(((summary.avgLatency ?? 0) / 800) * 100) }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-muted uppercase tracking-wide">
                <span>Resync Failure Rate</span>
                <span>{failureRatePct.toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${failureColor}`}
                  style={{ width: barWidth(failureRatePct) }}
                />
              </div>
              <div className="text-[11px] text-muted mt-1">
                Avg duration {avgResyncDuration} ms · successes {lockstep.successes ?? 0} /{' '}
                {lockstep.total ?? 0}
              </div>
              {byReason.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {byReason.map((entry) => (
                    <span
                      key={entry.reason}
                      className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] text-white/70 border border-border/30"
                    >
                      {entry.reason.replaceAll('_', ' ')} · {entry.total}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {warnings.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-red-500/40 bg-red-500/10 p-2">
                {warnings.map((warning, index) => (
                  <div
                    key={`${warning.message}:${index}`}
                    className={`flex items-center gap-2 text-[11px] ${warning.severity === 'critical' ? 'text-red-200' : 'text-amber-200'}`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${warning.severity === 'critical' ? 'bg-red-400' : 'bg-amber-300'} shadow`}
                    />
                    {warning.message}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">
                Client reliability metrics are within healthy ranges.
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
                Resync Hotspots · Games
              </div>
              {renderResyncHotspots(sessionsPerGame, 'No game sessions recorded', 'Unknown game')}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
                Resync Hotspots · Users
              </div>
              {renderResyncHotspots(sessionsPerUser, 'No user sessions recorded', 'Unknown user')}
            </div>
          </div>
        )}
      </div>

      {/* Realtime metrics */}
      <div className="bg-surface-2 border border-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-white font-semibold">Realtime Metrics</div>
          <button
            type="button"
            className="px-2 py-1 text-[11px] rounded bg-surface-2/70 border border-border/40 hover:bg-surface-2"
            onClick={() => void onResetCounters()}
            disabled={loadingRealtime}
          >
            Reset Counters
          </button>
        </div>
        {!realtime ? (
          <div className="text-xs text-muted mt-3">{loadingRealtime ? 'Loading…' : 'No data'}</div>
        ) : (
          (() => {
            const payloadMetrics = realtime.payloads || {}
            const metricConfigs = [
              { key: 'gameUpdate', label: 'game:snapshot' },
              { key: 'lockstepFrame', label: 'game-action:frame-committed' },
              { key: 'lockstepChecksum', label: 'game-action:checksum' },
            ] as const
            const lockstepCounters = realtime.lockstep?.counters ?? []
            const lockstepTotals = lockstepCounters.reduce<Record<string, number>>((acc, entry) => {
              acc[entry.metric] = (acc[entry.metric] ?? 0) + (entry.value ?? 0)
              return acc
            }, {})
            const resyncStartedTotal = lockstepCounters
              .filter((entry) => entry.metric === 'lockstep_resync_started_total')
              .reduce((sum, entry) => sum + (entry.value ?? 0), 0)
            const resyncCompletedByStatus = lockstepCounters
              .filter((entry) => entry.metric === 'lockstep_resync_completed_total')
              .reduce<Record<string, number>>((acc, entry) => {
                const status = entry.labels?.status ?? 'unknown'
                acc[status] = (acc[status] ?? 0) + (entry.value ?? 0)
                return acc
              }, {})
            const resyncCompletedSuccess = resyncCompletedByStatus.success ?? 0
            const resyncCompletedFailed = resyncCompletedByStatus.failed ?? 0
            const resyncCompletedUnknown = resyncCompletedByStatus.unknown ?? 0
            const unsupportedCommandTotals = lockstepCounters
              .filter((entry) => entry.metric === 'lockstep_unsupported_commands_total')
              .reduce<Record<string, number>>((acc, entry) => {
                const command = entry.labels?.command ?? 'unknown'
                acc[command] = (acc[command] ?? 0) + (entry.value ?? 0)
                return acc
              }, {})
            const topUnsupported = Object.entries(unsupportedCommandTotals)
              .filter(([, value]) => value > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)

            return (
              <div className="text-xs text-white/80 space-y-3 mt-3">
                <div>
                  <div className="font-semibold mb-1">Socket payloads (bytes)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {metricConfigs.map((config) => {
                      const stats = (
                        payloadMetrics as Record<
                          (typeof metricConfigs)[number]['key'],
                          { count: number; p50: number; p95: number; max: number } | null
                        >
                      )[config.key]
                      return (
                        <div
                          key={config.key}
                          className="bg-surface-3/60 rounded p-2 border border-border/40"
                        >
                          <div className="text-muted mb-1">{config.label}</div>
                          <div className="flex items-center gap-3">
                            <div>P50: {stats?.p50 ?? 0}</div>
                            <div>P95: {stats?.p95 ?? 0}</div>
                            <div>Max: {stats?.max ?? 0}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="font-semibold mb-1">Lockstep counters</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-surface-3/60 rounded p-2 border border-border/40">
                      <div className="text-muted mb-1">Frames</div>
                      <div>{(lockstepTotals.lockstep_frames_total ?? 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-surface-3/60 rounded p-2 border border-border/40">
                      <div className="text-muted mb-1">Checksums</div>
                      <div>{(lockstepTotals.lockstep_checksums_total ?? 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-surface-3/60 rounded p-2 border border-border/40">
                      <div className="text-muted mb-1">Resyncs</div>
                      <div>{(lockstepTotals.lockstep_resync_total ?? 0).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <div className="bg-surface-3/60 rounded p-2 border border-border/40">
                      <div className="text-muted mb-1">Resync Started</div>
                      <div>{resyncStartedTotal.toLocaleString()}</div>
                    </div>
                    <div className="bg-surface-3/60 rounded p-2 border border-border/40">
                      <div className="text-muted mb-1">Resync Completed</div>
                      <div>
                        {resyncCompletedSuccess.toLocaleString()} success
                        {resyncCompletedFailed > 0 || resyncCompletedUnknown > 0 ? (
                          <span className="text-[11px] text-muted ml-1">
                            · {resyncCompletedFailed.toLocaleString()} failed
                            {resyncCompletedUnknown > 0
                              ? ` (${resyncCompletedUnknown} unknown)`
                              : ''}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {topUnsupported.length > 0 ? (
                  <div>
                    <div className="font-semibold mb-1">Unsupported command snapshots (top)</div>
                    <div className="flex flex-wrap gap-2">
                      {topUnsupported.map(([cmd, value]) => (
                        <span
                          key={cmd}
                          className="px-2 py-0.5 rounded bg-surface-3/60 border border-border/40 text-[11px]"
                        >
                          {cmd}: {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}
