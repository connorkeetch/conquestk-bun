import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/services/api'

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
        const resp = await api.get(e.path)
        const dt = Date.now() - t0
        return {
          label: e.label,
          path: e.path,
          ok: resp.status >= 200 && resp.status < 300,
          statusCode: resp.status,
          durationMs: dt,
          data: resp.data,
        }
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
            const d = (r.data ?? {}) as Record<string, unknown>
            const kv = (k: string) => String(d[k] ?? '')
            return (
              <div className="mt-3 text-xs text-white/80 space-y-1">
                <div>Server: {kv('server')}</div>
                <div>DB: {kv('database')}</div>
                <div>Redis: {kv('redis')}</div>
                <div>Queues: {kv('queues')}</div>
                <div className="text-muted">Env: {kv('environment')}</div>
                {d.databaseError ? (
                  <div className="text-red-400">DB error: {String(d.databaseError)}</div>
                ) : null}
                {d.redisError ? (
                  <div className="text-red-400">Redis error: {String(d.redisError)}</div>
                ) : null}
                {d.queueError ? (
                  <div className="text-red-400">Queues error: {String(d.queueError)}</div>
                ) : null}
              </div>
            )
          }

          const renderQueuesHealth = () => {
            const d = (r.data ?? {}) as {
              success?: boolean
              status?: string
              details?: {
                workers?: { initialized?: boolean }
                queues?: Record<string, any>
                redis?: string
                queueServiceInitialized?: boolean
              }
              timestamp?: string
            }
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
              .filter((n) => Array.isArray(queues[n]?.warnings) && queues[n].warnings.length > 0)
              .map((n) => ({ name: n, warnings: (queues[n].warnings as string[]) || [] }))
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
            const d = (r.data ?? {}) as {
              success?: boolean
              data?: { initialized?: boolean; queues?: Record<string, any>; timestamp?: string }
            }
            const queues = d.data?.queues || {}
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

          const renderPerformanceAlerts = () => (
            <div className="mt-3 text-sm text-white">
              Active alerts:{' '}
              {Array.isArray((r.data as { data?: unknown } | undefined)?.data)
                ? ((r.data as { data?: unknown } | undefined)?.data as unknown[]).length
                : 0}
            </div>
          )

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
                      : r.label === 'Match Service'
                        ? renderMatchSvc()
                        : r.label === 'Performance Alerts'
                          ? renderPerformanceAlerts()
                          : null
                : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
