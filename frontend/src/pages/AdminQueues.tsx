import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { AdminPageHeader } from '../components/admin/AdminPageHeader'
import { adminService } from '../services/adminService'

type QueueKey = 'gameActions' | 'gameCleanup' | 'analyticsEvents'
type JobState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'

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

  const [recentActive, setRecentActive] = useState<
    Array<{
      id: string
      name: string
      timestamp: string
      attemptsMade: number
      progress?: number | Record<string, unknown>
    }>
  >([])
  const [recentFailed, setRecentFailed] = useState<
    Array<{
      id: string
      name: string
      timestamp: string
      attemptsMade: number
      failedReason?: string
    }>
  >([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobState, setJobState] = useState<JobState>('active')
  const [details, setDetails] = useState<null | {
    id: string
    name: string
    state: JobState
    timestamp: string
    attemptsMade: number
    failedReason?: string
    progress?: number | Record<string, unknown>
    returnvalue?: unknown
  }>(null)
  const [transientLimit, setTransientLimit] = useState<number>(50)

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

  const loadRecentJobs = useCallback(async () => {
    try {
      setJobsLoading(true)
      const [primary, failed] = await Promise.all([
        adminService.getJobs({ queue: selectedQueue, state: jobState, limit: 25 }),
        adminService.getJobs({ queue: selectedQueue, state: 'failed', limit: 25 }),
      ])
      setRecentActive(
        (primary.items ?? []).map((j) => ({
          id: j.id,
          name: j.name,
          timestamp: j.timestamp,
          attemptsMade: j.attemptsMade,
          progress: j.progress,
        })),
      )
      setRecentFailed(
        (failed.items ?? []).map((j) => ({
          id: j.id,
          name: j.name,
          timestamp: j.timestamp,
          attemptsMade: j.attemptsMade,
          failedReason: j.failedReason,
        })),
      )
    } catch (_e) {
      // non-fatal for page
      setRecentActive([])
      setRecentFailed([])
    } finally {
      setJobsLoading(false)
    }
  }, [selectedQueue, jobState])

  const loadStats = useCallback(async () => {
    try {
      const s = await adminService.getQueueStats()
      setStats(s)
    } catch {
      // non-fatal
    }
  }, [])

  // Bull Board is now a standalone service
  const bullBoardUrl = 'https://bullboard-production-e18d.up.railway.app/?status=active'

  const checkBullBoard = useCallback(async () => {
    try {
      setBbStatus('checking')
      const response = await fetch(bullBoardUrl, { method: 'HEAD' })
      if (response.ok) {
        setBbStatus('ok')
      } else {
        setBbStatus('error')
      }
    } catch {
      setBbStatus('error')
    }
  }, [])

  const openBullBoard = useCallback(() => {
    // Bull Board is now a separate service, just open it in a new tab
    window.open(bullBoardUrl, '_blank', 'noopener,noreferrer')
  }, [])

  useEffect(() => {
    void loadDlq()
    void loadRecentJobs()
  }, [loadDlq, loadRecentJobs])

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

  const onRetry = async (jobId: string) => {
    try {
      await adminService.retryJob({ queue: selectedQueue, jobId })
      await loadRecentJobs()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to retry job')
    }
  }

  const onRetryTransient = async () => {
    try {
      await adminService.retryTransientDlq({ queue: selectedQueue, limit: transientLimit })
      await loadDlq()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to retry transient jobs')
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
              onClick={openBullBoard}
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
          <div className="flex items-center gap-2">
            <label
              htmlFor={`${selectId}-transient-limit`}
              className="text-xs text-muted"
              title="Retry DLQ jobs with transient errors (e.g., timeouts)"
            >
              Transient limit
            </label>
            <input
              type="number"
              min={1}
              max={200}
              id={`${selectId}-transient-limit`}
              value={transientLimit}
              onChange={(e) => setTransientLimit(Number.parseInt(e.target.value || '50', 10))}
              className="w-20 px-2 py-1 text-sm rounded bg-surface-2 border border-border"
            />
            <button
              type="button"
              onClick={() => void onRetryTransient()}
              className="px-3 py-2 text-sm rounded bg-primary hover:brightness-110"
            >
              Retry Transient
            </button>
            <button
              type="button"
              onClick={() => void loadDlq()}
              className="px-3 py-2 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh DLQ'}
            </button>
          </div>
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

      {/* Recent activity */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-box-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="font-semibold">Recent Jobs</div>
              <select
                value={jobState}
                onChange={(e) => setJobState(e.target.value as JobState)}
                className="px-2 py-1 rounded bg-surface-2 border border-border text-sm"
                title="Select queue state"
              >
                <option value="active">Active</option>
                <option value="waiting">Waiting</option>
                <option value="delayed">Delayed</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <button
              type="button"
              className="px-3 py-2 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80 disabled:opacity-60"
              disabled={jobsLoading}
              onClick={() => void loadRecentJobs()}
            >
              {jobsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {recentActive.length === 0 ? (
            <div className="text-sm text-muted">No active jobs.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="py-2 pr-4">Job ID</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Timestamp</th>
                    <th className="py-2 pr-4">Attempts</th>
                    <th className="py-2 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActive.map((j) => (
                    <tr key={j.id} className="border-b border-border/40">
                      <td className="py-2 pr-4 font-mono text-xs">{j.id}</td>
                      <td className="py-2 pr-4">{j.name}</td>
                      <td className="py-2 pr-4">{new Date(j.timestamp).toLocaleString()}</td>
                      <td className="py-2 pr-4">{j.attemptsMade}</td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() =>
                            setDetails({
                              id: j.id,
                              name: j.name,
                              state: jobState,
                              timestamp: j.timestamp,
                              attemptsMade: j.attemptsMade,
                              progress: j.progress,
                            })
                          }
                          className="px-2 py-1 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-box-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Recent Failures</div>
            <button
              type="button"
              className="px-3 py-2 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80 disabled:opacity-60"
              disabled={jobsLoading}
              onClick={() => void loadRecentJobs()}
            >
              {jobsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {recentFailed.length === 0 ? (
            <div className="text-sm text-muted">No failures.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="py-2 pr-4">Job ID</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Failed</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFailed.map((j) => (
                    <tr key={j.id} className="border-b border-border/40">
                      <td className="py-2 pr-4 font-mono text-xs">{j.id}</td>
                      <td className="py-2 pr-4">{j.name}</td>
                      <td className="py-2 pr-4">{new Date(j.timestamp).toLocaleString()}</td>
                      <td className="py-2 pr-4 max-w-[360px] truncate" title={j.failedReason}>
                        {j.failedReason}
                      </td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => void onRetry(j.id)}
                          className="px-2 py-1 text-sm rounded bg-primary hover:brightness-110"
                        >
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDetails({
                              id: j.id,
                              name: j.name,
                              state: 'failed',
                              timestamp: j.timestamp,
                              attemptsMade: j.attemptsMade,
                              failedReason: j.failedReason,
                            })
                          }
                          className="ml-2 px-2 py-1 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80"
                        >
                          View
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

      {/* Details modal */}
      {details && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="w-[min(92vw,720px)] max-h-[80vh] overflow-auto rounded-lg bg-surface-1 border border-border p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Job Details</div>
              <button
                type="button"
                onClick={() => setDetails(null)}
                className="px-2 py-1 text-sm rounded bg-surface-2 border border-border hover:bg-surface-2/80"
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted">ID:</span>{' '}
                <span className="font-mono">{details.id}</span>
              </div>
              <div>
                <span className="text-muted">Name:</span> {details.name}
              </div>
              <div>
                <span className="text-muted">State:</span> {details.state}
              </div>
              <div>
                <span className="text-muted">Timestamp:</span>{' '}
                {new Date(details.timestamp).toLocaleString()}
              </div>
              <div>
                <span className="text-muted">Attempts:</span> {details.attemptsMade}
              </div>
              {details.failedReason ? (
                <div>
                  <span className="text-muted">Failed Reason:</span>{' '}
                  <span className="break-words">{details.failedReason}</span>
                </div>
              ) : null}
              {typeof details.progress !== 'undefined' ? (
                <div>
                  <span className="text-muted">Progress:</span>{' '}
                  <span className="break-words font-mono text-xs">
                    {typeof details.progress === 'number'
                      ? details.progress
                      : JSON.stringify(details.progress)}
                  </span>
                </div>
              ) : null}
              {typeof (details as { returnvalue?: unknown }).returnvalue !== 'undefined' ? (
                <div>
                  <span className="text-muted">Return Value:</span>{' '}
                  <span className="break-words font-mono text-xs">
                    {JSON.stringify((details as { returnvalue?: unknown }).returnvalue)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
