import type {
  AdminApiHealth,
  AdminMatchSvcStatus,
  AdminOddsStatus,
  AdminQueuesHealth,
  AdminQueuesStats,
} from '@conquestk/shared/types/admin'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminService } from '@/services/adminService'

type HealthResult = {
  label: string
  path: string
  ok: boolean
  statusCode: number
  durationMs: number
  data?: unknown
  error?: string
}

const endpoints = [
  // Use API client baseURL ("/api" in production). Do NOT prefix paths with "/api" here.
  { label: 'API Health', path: '/health', auth: false },
  { label: 'Queues Health', path: '/queues/health', auth: true },
  { label: 'Queues Stats', path: '/queues/stats', auth: true },
  { label: 'Performance Detailed', path: '/performance/health/detailed', auth: true },
  { label: 'Performance Metrics', path: '/performance/metrics', auth: true },
  { label: 'Performance Alerts', path: '/performance/alerts?active=true', auth: true },
  { label: 'Odds/WASM Status', path: '/odds/status', auth: false },
  { label: 'Match Service', path: '/matchsvc/status', auth: false },
]

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ok ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}
    >
      {ok ? 'OK' : 'Issue'}
    </span>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4">
      <div className="text-white font-semibold mb-2">{title}</div>
      {children}
    </div>
  )
}

export default function AdminHealth() {
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [results, setResults] = useState<HealthResult[]>([])
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true)
    const started = Date.now()
    const fetchOne = async (e: {
      label: string
      path: string
      auth: boolean
    }): Promise<HealthResult> => {
      const t0 = Date.now()
      try {
        // Prefer service wrappers for admin endpoints
        if (e.label === 'API Health') {
          const data = await adminService.getApiHealth()
          const dt = Date.now() - t0
          const ok = String((data as AdminApiHealth).status || '').toUpperCase() === 'OK'
          return {
            label: e.label,
            path: e.path,
            ok,
            statusCode: ok ? 200 : 503,
            durationMs: dt,
            data,
          }
        }
        if (e.label === 'Queues Health') {
          const data = await adminService.getQueueHealth()
          const dt = Date.now() - t0
          return {
            label: e.label,
            path: e.path,
            ok: !!data.success,
            statusCode: data.success ? 200 : 503,
            durationMs: dt,
            data,
          }
        }
        if (e.label === 'Queues Stats') {
          const data = await adminService.getQueueStats()
          const dt = Date.now() - t0
          return {
            label: e.label,
            path: e.path,
            ok: true,
            statusCode: 200,
            durationMs: dt,
            data,
          }
        }
        if (e.label === 'Performance Detailed') {
          const data = await adminService.getPerformanceHealthDetailed()
          const dt = Date.now() - t0
          return {
            label: e.label,
            path: e.path,
            ok: !!(data as { success?: boolean }).success,
            statusCode: (data as { success?: boolean }).success ? 200 : 503,
            durationMs: dt,
            data,
          }
        }
        if (e.label === 'Performance Metrics') {
          const data = await adminService.getPerformanceMetrics()
          const dt = Date.now() - t0
          return {
            label: e.label,
            path: e.path,
            ok: true,
            statusCode: 200,
            durationMs: dt,
            data,
          }
        }
        if (e.label === 'Performance Alerts') {
          const data = await adminService.getPerformanceAlerts(true)
          const dt = Date.now() - t0
          const ok = Array.isArray(data)
          return {
            label: e.label,
            path: e.path,
            ok,
            statusCode: ok ? 200 : 503,
            durationMs: dt,
            data,
          }
        }
        if (e.label === 'Match Service') {
          const data = await adminService.getMatchSvcStatus()
          const dt = Date.now() - t0
          return {
            label: e.label,
            path: e.path,
            ok: !!(data as AdminMatchSvcStatus).ok,
            statusCode: (data as AdminMatchSvcStatus).ok ? 200 : 503,
            durationMs: dt,
            data,
          }
        }
        if (e.label === 'Odds/WASM Status') {
          const data = await adminService.getOddsStatus()
          const dt = Date.now() - t0
          return {
            label: e.label,
            path: e.path,
            ok: !!(data as AdminOddsStatus).success,
            statusCode: (data as AdminOddsStatus).success ? 200 : 503,
            durationMs: dt,
            data,
          }
        }
        // No generic fallback; all endpoints should be wrapped above
        throw new Error('Unhandled endpoint: ' + e.label)
      } catch (err: unknown) {
        const anyErr = err as { response?: { status?: number; data?: unknown }; message?: string }
        const dt = Date.now() - t0
        return {
          label: e.label,
          path: e.path,
          ok: false,
          statusCode: anyErr?.response?.status ?? 0,
          durationMs: dt,
          error:
            typeof anyErr?.response?.data === 'string'
              ? anyErr.response.data
              : anyErr?.message || 'Request failed',
          data: anyErr?.response?.data,
        }
      }
    }

    const settled = await Promise.allSettled(endpoints.map((e) => fetchOne(e)))
    const out: HealthResult[] = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value
      return {
        label: endpoints[i]?.label ?? 'Unknown',
        path: endpoints[i]?.path ?? 'Unknown',
        ok: false,
        statusCode: 0,
        durationMs: 0,
        error: String(s.reason),
      }
    })
    setResults(out)
    setLastRunAt(new Date(started).toISOString())
    setLoading(false)
  }, [])

  useEffect(() => {
    run().catch(() => {
      /* ignore initial run error */
    })
  }, [run])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(
      () =>
        run().catch(() => {
          /* ignore periodic run error */
        }),
      15000,
    )
    return () => clearInterval(id)
  }, [autoRefresh, run])

  const summary = useMemo(() => {
    const total = results.length
    const ok = results.filter((r) => r.ok).length
    return { total, ok }
  }, [results])

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-2xl font-bold text-white">System Health</div>
          <div className="text-sm text-muted">
            {lastRunAt ? `Last checked: ${new Date(lastRunAt).toLocaleString()}` : 'Running...'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh 15s
          </label>
          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-purple-600 text-white disabled:opacity-50"
            onClick={() => run()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mb-4 text-white">
        Overall: <StatusPill ok={summary.total > 0 && summary.ok === summary.total} />
        <span className="ml-2 text-sm text-muted">
          {summary.ok}/{summary.total} OK
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {results.map((r) => {
          let title = r.label

          // Helpers per endpoint for richer detail
          const renderApiHealth = () => {
            const d = (r.data ?? {}) as AdminApiHealth
            return (
              <div className="mt-3 text-xs text-white/80 space-y-1">
                <div>Server: {String(d.server ?? '')}</div>
                <div>DB: {String(d.database ?? '')}</div>
                <div>Redis: {String(d.redis ?? '')}</div>
                <div>Queues: {String(d.queues ?? '')}</div>
                <div className="text-muted">Env: {String(d.environment ?? '')}</div>
                {d['databaseError'] ? (
                  <div className="text-red-400">DB error: {String(d['databaseError'])}</div>
                ) : null}
                {d['redisError'] ? (
                  <div className="text-red-400">Redis error: {String(d['redisError'])}</div>
                ) : null}
                {d['queueError'] ? (
                  <div className="text-red-400">Queues error: {String(d['queueError'])}</div>
                ) : null}
              </div>
            )
          }

          const renderQueuesHealth = () => {
            const d = (r.data ?? {}) as AdminQueuesHealth
            const queues = d.details?.queues || {}
            const names = Object.keys(queues)
            const totals = names.reduce(
              (acc, name) => {
                const q = queues[name] || {}
                acc.waiting += Number(q.waiting || 0)
                acc.failed += Number(q.failed || 0)
                acc.active += Number(q.active || 0)
                if (Array.isArray(q.warnings) && q.warnings.length > 0) acc.warned += 1
                return acc
              },
              { waiting: 0, failed: 0, active: 0, warned: 0 },
            )
            const warnedList = names
              .filter(
                (n) =>
                  Array.isArray(queues[n]?.warnings) &&
                  (queues[n]?.warnings as unknown[]).length > 0,
              )
              .map((n) => ({ name: n, warnings: (queues[n]?.warnings as string[]) || [] }))
              .slice(0, 5)
            return (
              <div className="mt-3 text-xs text-white/80 space-y-1">
                <div>Status: {d.status || 'unknown'}</div>
                <div>Workers initialized: {String(d.details?.workers?.initialized ?? false)}</div>
                {d.details?.redis ? <div>Redis: {d.details.redis}</div> : null}
                <div>
                  Queues total — waiting {totals.waiting}, active {totals.active}, failed{' '}
                  {totals.failed}
                </div>
                <div>Queues with warnings: {totals.warned}</div>
                {warnedList.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {warnedList.map((w) => (
                      <span
                        key={w.name}
                        title={w.warnings.join('; ')}
                        className="bg-surface-3 text-white/80 rounded px-2 py-0.5 border border-border/50"
                      >
                        {w.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          }

          const renderQueuesStats = () => {
            const d = (r.data ?? {}) as AdminQueuesStats
            const queues = d.queues || {}
            const names = Object.keys(queues)
            const totals = names.reduce(
              (acc, name) => {
                const q = queues[name] || {}
                acc.waiting += Number(q.waiting || 0)
                acc.failed += Number(q.failed || 0)
                acc.active += Number(q.active || 0)
                acc.completed += Number(q.completed || 0)
                return acc
              },
              { waiting: 0, failed: 0, active: 0, completed: 0 },
            )
            return (
              <div className="mt-3 text-xs text-white/80 space-y-1">
                <div>Initialized: {String(d.data?.initialized ?? false)}</div>
                <div>
                  Totals — waiting {totals.waiting}, active {totals.active}, failed {totals.failed},
                  completed {totals.completed}
                </div>
                <div>Queues: {names.length}</div>
              </div>
            )
          }

          const renderMatchSvc = () => {
            const d = (r.data ?? {}) as {
              ok?: boolean
              service?: { url?: string; health?: string; statusCode?: number }
              auth?: { configured?: boolean; test?: string; statusCode?: number }
              redis?: { healthy?: boolean; message?: string }
              subscriber?: { active?: boolean }
              metrics?: {
                queueDepth?: Record<string, number>
                matchesFormedTotal?: number
                presenceOnline?: number
              } | null
              ts?: string
            }
            const qd = d.metrics?.queueDepth || {}
            const qdKeys = Object.keys(qd)
            // Rename the card when using local presence-only metrics
            if (d.service?.url === 'local') {
              title = 'Realtime Presence'
            }
            return (
              <div className="mt-3 text-xs text-white/80 space-y-1">
                <div>Health: {d.service?.health ?? 'unknown'}</div>
                {d.service?.url ? <div>URL: {d.service.url}</div> : null}
                {d.auth ? (
                  <div>
                    Auth: {d.auth.test} {d.auth.configured ? '(configured)' : '(skipped)'}
                  </div>
                ) : null}
                {typeof d.metrics?.presenceOnline === 'number' ? (
                  <div>Presence online: {d.metrics?.presenceOnline}</div>
                ) : null}
                {typeof d.metrics?.matchesFormedTotal === 'number' ? (
                  <div>Matches formed: {d.metrics?.matchesFormedTotal}</div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {qdKeys.length > 0 ? (
                    qdKeys.map((k) => (
                      <span key={k} className="bg-surface-3 text-white/80 rounded px-2 py-0.5">
                        {k}: {qd[k]}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted">No queue depths</span>
                  )}
                </div>
              </div>
            )
          }

          const renderPerformanceDetailed = () => {
            const d = (r.data ?? {}) as { status?: string; data?: unknown }
            const data = (d.data ?? {}) as {
              performance?: { status?: string }
              redis?: { status?: string }
              database?: { status?: string }
              cdn?: { status?: string }
            }
            return (
              <div className="mt-3 text-xs text-white/80 space-y-1">
                <div>Overall: {String(d.status ?? 'unknown')}</div>
                <div>Performance: {String(data.performance?.status ?? 'unknown')}</div>
                <div>Redis: {String(data.redis?.status ?? 'unknown')}</div>
                <div>Database: {String(data.database?.status ?? 'unknown')}</div>
                <div>CDN: {String(data.cdn?.status ?? 'unknown')}</div>
              </div>
            )
          }

          const renderPerformanceMetrics = () => {
            const d = (r.data ?? {}) as {
              server?: {
                uptime?: number
                memoryUsage?: { heapUsed?: number }
                requestsPerSecond?: number
              }
              database?: { avgResponseTime?: number; slowQueries?: number }
              cache?: { hitRate?: number }
              queues?: { waitingJobs?: number; failedJobs?: number; processedJobs?: number }
            }
            const memMb = d.server?.memoryUsage?.heapUsed
              ? Math.round((d.server.memoryUsage.heapUsed / 1024 / 1024) * 10) / 10
              : undefined
            return (
              <div className="mt-3 text-xs text-white/80 space-y-1">
                <div>
                  Uptime:{' '}
                  {d.server?.uptime != null
                    ? `${Math.round((d.server.uptime / 60) * 10) / 10} min`
                    : 'unknown'}
                </div>
                <div>
                  RPS:{' '}
                  {d.server?.requestsPerSecond != null
                    ? d.server.requestsPerSecond.toFixed(2)
                    : 'unknown'}
                </div>
                <div>Memory: {memMb != null ? `${memMb} MB` : 'unknown'}</div>
                <div>
                  DB avg rt:{' '}
                  {d.database?.avgResponseTime != null
                    ? `${d.database.avgResponseTime} ms`
                    : 'unknown'}
                </div>
                <div>Cache hit: {d.cache?.hitRate != null ? `${d.cache.hitRate}%` : 'unknown'}</div>
                <div>Queue waiting: {d.queues?.waitingJobs ?? 0}</div>
                <div>Queue failed: {d.queues?.failedJobs ?? 0}</div>
              </div>
            )
          }

          const renderPerformanceAlerts = () => {
            const arr = (r.data as unknown[]) || []
            return (
              <div className="mt-3 text-sm text-white">
                Active alerts: {Array.isArray(arr) ? arr.length : 0}
              </div>
            )
          }

          return (
            <Card key={r.path} title={title}>
              <div className="flex items-center justify-between">
                <StatusPill ok={r.ok} />
                <div className="text-sm text-muted">
                  {r.statusCode || 'ERR'} · {r.durationMs}ms
                </div>
              </div>
              <div className="mt-2 text-xs text-white/80 break-words">
                <div className="text-muted">{r.path}</div>
                {!r.ok && r.error ? <div className="mt-1 text-red-400">{r.error}</div> : null}
              </div>

              {r.ok && r.data
                ? r.label === 'API Health'
                  ? renderApiHealth()
                  : r.label === 'Queues Health'
                    ? renderQueuesHealth()
                    : r.label === 'Queues Stats'
                      ? renderQueuesStats()
                      : r.label === 'Performance Detailed'
                        ? renderPerformanceDetailed()
                        : r.label === 'Performance Metrics'
                          ? renderPerformanceMetrics()
                          : r.label === 'Performance Alerts'
                            ? renderPerformanceAlerts()
                            : r.label === 'Match Service'
                              ? renderMatchSvc()
                              : null
                : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
