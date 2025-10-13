import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { AdminPageHeader } from '../components/admin/AdminPageHeader'
import { API_URL } from '../config'
import { adminService } from '../services/adminService'
import apiClient from '../services/api'

type QueueKey = 'gameActions' | 'gameCleanup' | 'analyticsEvents'

export default function AdminQueues() {
  const selectId = useId()
  const [selectedQueue, setSelectedQueue] = useState<QueueKey>('gameActions')
  const [bbStatus, setBbStatus] = useState<
    'unknown' | 'checking' | 'ok' | 'unauthorized' | 'forbidden' | 'not_found' | 'error'
  >('unknown')
  const [dlq, setDlq] = useState<
    Array<{
      id: string
      failedReason: string
      failedAt: string
      jobName: string
      attemptsMade: number
    }>
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requeueing, setRequeueing] = useState<string | null>(null)
  const [stats, setStats] = useState<null | {
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
  }>(null)

  const loadDlq = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await adminService.getDeadLetters({ queue: selectedQueue, limit: 50 })
      setDlq(result.items ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load DLQ')
      setDlq([])
    } finally {
      setLoading(false)
    }
  }, [selectedQueue])

  const loadStats = useCallback(async () => {
    try {
      const s = await adminService.getQueueStats()
      setStats(s)
    } catch {
      // non-fatal
    }
  }, [])

  const backendOrigin = useMemo(() => {
    return API_URL.startsWith('http') ? API_URL.replace(/\/?api$/, '') : window.location.origin
  }, [])

  const bullBoardUrl = useMemo(() => `${backendOrigin}/api/admin/queues/ui`, [backendOrigin])

  const checkBullBoard = useCallback(async () => {
    try {
      setBbStatus('checking')
      // Ensure UI cookie is set and valid for the UI path
      await apiClient.post('/admin/queues/ui/grant', undefined, { withCredentials: true })
      const response = await apiClient.get('/admin/queues/ui', {
        withCredentials: true,
        validateStatus: () => true,
        responseType: 'text',
      })
      const status = response.status
      if (status === 200) setBbStatus('ok')
      else if (status === 401) setBbStatus('unauthorized')
      else if (status === 403) setBbStatus('forbidden')
      else if (status === 404) setBbStatus('not_found')
      else setBbStatus('error')
    } catch {
      setBbStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadDlq()
  }, [loadDlq])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    // Run a quick reachability check on mount
    void checkBullBoard()
  }, [checkBullBoard])

  const queuesList = useMemo(
    () =>
      [
        { key: 'gameActions', label: 'Game Actions' },
        { key: 'gameCleanup', label: 'Game Cleanup' },
        { key: 'analyticsEvents', label: 'Analytics Events' },
      ] as Array<{ key: QueueKey; label: string }>,
    [],
  )

  const onRequeue = async (jobId: string) => {
    try {
      setRequeueing(jobId)
      await adminService.requeueDeadLetter({ queue: selectedQueue, jobId })
      await loadDlq()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to requeue job')
    } finally {
      setRequeueing(null)
    }
  }

  return (
    <div className="p-6">
      <AdminPageHeader
        title="Queues"
        subtitle="Inspect dead-letter jobs and queue health"
        icon="📥"
        actions={
          <div className="flex items-center gap-2">
            <div
              className="px-2 py-1 text-xs rounded bg-surface-2 border border-border"
              title={`Target: ${bullBoardUrl}`}
            >
              UI:
              {bbStatus === 'ok' && <span className="ml-1 text-green-400">OK</span>}
              {bbStatus === 'checking' && <span className="ml-1 text-muted">Checking…</span>}
              {bbStatus === 'unauthorized' && <span className="ml-1 text-yellow-300">401</span>}
              {bbStatus === 'forbidden' && <span className="ml-1 text-red-400">403</span>}
              {bbStatus === 'not_found' && <span className="ml-1 text-red-400">404</span>}
              {bbStatus === 'error' && <span className="ml-1 text-red-400">Error</span>}
              {bbStatus === 'unknown' && <span className="ml-1 text-muted">Unknown</span>}
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const resp = await apiClient.post<{ success: boolean; code?: string }>(
                    '/admin/queues/ui/grant',
                    undefined,
                    { withCredentials: true },
                  )

                  const code = (resp.data as unknown as { code?: unknown })?.code as
                    | string
                    | undefined

                  // Use dedicated login endpoint outside the guard; same-tab navigation avoids popups
                  const target = code
                    ? `/api/admin/queues/login?code=${encodeURIComponent(code)}`
                    : `/api/admin/queues/login?access_token=${encodeURIComponent(
                        localStorage.getItem('token') || '',
                      )}`
                  window.location.assign(target)
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Failed to prepare access for Bull Board')
                }
              }}
              className="px-3 py-2 text-sm rounded bg-purple-600 hover:brightness-110"
            >
              Open Bull Board
            </button>
            <button
              type="button"
              className="px-3 py-2 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80"
              onClick={() => void checkBullBoard()}
            >
              Check UI
            </button>
            <button
              type="button"
              className="px-3 py-2 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80"
              onClick={() => void loadStats()}
            >
              Refresh Stats
            </button>
          </div>
        }
      />

      {/* Stats overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {queuesList.map((q) => {
          const s = stats?.queues?.[q.key]
          return (
            <div key={q.key} className="glass-box">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{q.label}</div>
                {s?.warnings?.length ? (
                  <span className="text-xs text-yellow-300">{s.warnings.length} warnings</span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted">
                <div>
                  Waiting: <span className="text-[color:var(--heading)]">{s?.waiting ?? 0}</span>
                </div>
                <div>
                  Active: <span className="text-[color:var(--heading)]">{s?.active ?? 0}</span>
                </div>
                <div>
                  Failed: <span className="text-[color:var(--heading)]">{s?.failed ?? 0}</span>
                </div>
                <div>
                  Delayed: <span className="text-[color:var(--heading)]">{s?.delayed ?? 0}</span>
                </div>
                <div>
                  DLQ: <span className="text-[color:var(--heading)]">{s?.deadLetter ?? 0}</span>
                </div>
                <div>
                  Paused:{' '}
                  <span className="text-[color:var(--heading)]">{s?.isPaused ? 'yes' : 'no'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* DLQ controls */}
      <div className="glass-box-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="text-sm text-muted">
              Queue
            </label>
            <select
              id={selectId}
              value={selectedQueue}
              onChange={(e) => setSelectedQueue(e.target.value as QueueKey)}
              className="px-2 py-1 rounded bg-surface-2 border border-border text-sm"
            >
              {queuesList.map((q) => (
                <option key={q.key} value={q.key}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadDlq()}
            className="px-3 py-2 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh DLQ'}
          </button>
        </div>

        {error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : dlq.length === 0 ? (
          <div className="text-sm text-muted">No dead-letter jobs.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="py-2 pr-4">Job ID</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Failed</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {dlq.map((item) => (
                  <tr key={item.id} className="border-b border-border/40">
                    <td className="py-2 pr-4 font-mono text-xs">{item.id}</td>
                    <td className="py-2 pr-4">{item.jobName}</td>
                    <td className="py-2 pr-4">{new Date(item.failedAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 max-w-[360px] truncate" title={item.failedReason}>
                      {item.failedReason}
                    </td>
                    <td className="py-2 pr-4">{item.attemptsMade}</td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={() => void onRequeue(item.id)}
                        className="px-2 py-1 text-sm rounded bg-primary hover:brightness-110 disabled:opacity-60"
                        disabled={requeueing === item.id}
                      >
                        {requeueing === item.id ? 'Requeuing…' : 'Requeue'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
