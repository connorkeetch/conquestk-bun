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
  { label: 'Core Health', path: '/health', auth: false },
  { label: 'API Health', path: '/api/health', auth: false },
  { label: 'Queues Health', path: '/api/queues/health', auth: true },
  { label: 'Queues Stats', path: '/api/queues/stats', auth: true },
  { label: 'Performance Detailed', path: '/api/performance/health/detailed', auth: true },
  { label: 'Performance Metrics', path: '/api/performance/metrics', auth: true },
  { label: 'Performance Alerts', path: '/api/performance/alerts?active=true', auth: true },
  { label: 'Odds/WASM Status', path: '/api/odds/status', auth: false },
  { label: 'Match Service', path: '/api/matchsvc/status', auth: false },
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
        <div className="flex items-center gap-2">
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
        {results.map((r) => (
          <Card key={r.path} title={r.label}>
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
            {r.ok && r.data && r.label === 'Performance Alerts' ? (
              <div className="mt-3 text-sm text-white">
                Active alerts:{' '}
                {Array.isArray((r.data as { data?: unknown } | undefined)?.data)
                  ? ((r.data as { data?: unknown } | undefined)?.data as unknown[]).length
                  : 0}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  )
}
