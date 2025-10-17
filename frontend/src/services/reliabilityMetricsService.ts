import { store } from '@/store'
import { logger } from '@/utils/logger'
import api from './api'

export type ReliabilityStatus = 'excellent' | 'warning' | 'critical'

export interface ReliabilityDisplaySnapshot {
  status: ReliabilityStatus
  label: string
  actionSuccessRate: number
  deltaGapRate: number
  avgLatency: number
  p95Latency: number
  reconnectCount: number
  lastUploadAt: number | null
  sessionId: string
}

const MAX_LATENCY_SAMPLES = 100

class ReliabilityMetricsService {
  private sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`
  private firstConnection = true
  private connectedAt: number | null = null
  private lastConnectionChange = Date.now()
  private totalUptimeMs = 0
  private totalDowntimeMs = 0

  private reconnectCount = 0
  private actionsAttempted = 0
  private actionsSucceeded = 0
  private actionsFailed = 0
  private actionsRetried = 0

  private deltasReceived = 0
  private deltasDuplicated = 0
  private deltaGapsDetected = 0
  private deltaGapRecoveries = 0

  private desyncDetections = 0
  private desyncRecoveries = 0
  private desyncDetectedAt: number | null = null
  private desyncRecoveryDurations: number[] = []

  private latencySamples: number[] = []

  private lockstepResyncTotal = 0
  private lockstepResyncSuccess = 0
  private lockstepResyncFailure = 0
  private lockstepResyncReasonCounts: Record<string, number> = {}
  private lockstepResyncDurations: number[] = []
  private lockstepResyncPending: Map<
    string,
    {
      roomId: string
      reason:
        | 'frame_gap'
        | 'unsupported_commands'
        | 'missing_state'
        | 'checksum_mismatch'
        | 'snapshot_error'
        | 'manual'
      startedAt: number
      meta?: Record<string, unknown>
    }
  > = new Map()

  private listeners = new Set<() => void>()
  private uploadInterval: ReturnType<typeof setInterval> | null = null
  private lastUploadAt: number | null = null

  recordConnectionUp(): void {
    const now = Date.now()
    if (!this.firstConnection) {
      this.reconnectCount += 1
    } else {
      this.firstConnection = false
    }

    if (this.connectedAt === null) {
      this.totalDowntimeMs += Math.max(0, now - this.lastConnectionChange)
    }

    this.connectedAt = now
    this.lastConnectionChange = now
    this.notify()
  }

  recordConnectionDown(): void {
    const now = Date.now()
    if (this.connectedAt !== null) {
      this.totalUptimeMs += Math.max(0, now - this.connectedAt)
    }
    this.connectedAt = null
    this.lastConnectionChange = now
    this.notify()
  }

  recordLatencySample(latency: number): void {
    if (!Number.isFinite(latency) || latency < 0) return
    this.latencySamples.push(latency)
    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
      this.latencySamples.shift()
    }
    this.notify()
  }

  recordActionAttempt(): void {
    this.actionsAttempted += 1
    this.notify()
  }

  recordActionSuccess(): void {
    this.actionsSucceeded += 1
    this.notify()
  }

  recordActionFailure(): void {
    this.actionsFailed += 1
    this.notify()
  }

  recordActionRetry(): void {
    this.actionsRetried += 1
    this.notify()
  }

  recordDeltaReceived(): void {
    this.deltasReceived += 1
    this.notify()
  }

  recordDeltaDuplicate(): void {
    this.deltasDuplicated += 1
    this.notify()
  }

  recordDeltaGap(): void {
    this.deltaGapsDetected += 1
    this.notify()
  }

  recordDeltaGapRecovery(): void {
    this.deltaGapRecoveries += 1
    this.notify()
  }

  recordDesyncDetection(): void {
    this.desyncDetections += 1
    this.desyncDetectedAt = Date.now()
    this.notify()
  }

  recordDesyncRecovery(): void {
    this.desyncRecoveries += 1
    if (this.desyncDetectedAt) {
      this.desyncRecoveryDurations.push(Date.now() - this.desyncDetectedAt)
      this.desyncDetectedAt = null
    }
    this.notify()
  }

  recordLockstepResync(event: {
    traceId: string
    roomId: string
    reason:
      | 'frame_gap'
      | 'unsupported_commands'
      | 'missing_state'
      | 'checksum_mismatch'
      | 'snapshot_error'
      | 'manual'
    seq?: number
    expectedSeq?: number
    checksum?: { server?: number; local?: number }
    unsupported?: string[]
    meta?: Record<string, unknown>
  }): void {
    this.lockstepResyncTotal += 1
    this.lockstepResyncReasonCounts[event.reason] =
      (this.lockstepResyncReasonCounts[event.reason] ?? 0) + 1
    this.lockstepResyncPending.set(event.traceId, {
      roomId: event.roomId,
      reason: event.reason,
      startedAt: Date.now(),
      meta: {
        seq: event.seq,
        expectedSeq: event.expectedSeq,
        checksum: event.checksum,
        unsupported: event.unsupported,
        ...event.meta,
      },
    })
    this.notify()
  }

  resolveLockstepResync(
    traceId: string,
    outcome: {
      success: boolean
      roomId: string
      reason?:
        | 'frame_gap'
        | 'unsupported_commands'
        | 'missing_state'
        | 'checksum_mismatch'
        | 'snapshot_error'
        | 'manual'
      meta?: Record<string, unknown>
    },
  ): void {
    const pending = this.lockstepResyncPending.get(traceId)
    if (!pending) {
      return
    }
    this.lockstepResyncPending.delete(traceId)
    this.lockstepResyncDurations.push(Date.now() - pending.startedAt)
    if (outcome.success) {
      this.lockstepResyncSuccess += 1
    } else {
      this.lockstepResyncFailure += 1
    }
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  start(): void {
    if (this.uploadInterval) return
    this.uploadInterval = setInterval(() => {
      void this.flush()
    }, 30_000)
  }

  private getUptimeMs(): number {
    if (this.connectedAt != null) {
      return this.totalUptimeMs + (Date.now() - this.connectedAt)
    }
    return this.totalUptimeMs
  }

  private getDowntimeMs(): number {
    if (this.connectedAt == null) {
      return this.totalDowntimeMs + (Date.now() - this.lastConnectionChange)
    }
    return this.totalDowntimeMs
  }

  private getAvgLatency(): number {
    if (this.latencySamples.length === 0) return 0
    const sum = this.latencySamples.reduce((acc, value) => acc + value, 0)
    return sum / this.latencySamples.length
  }

  private getP95Latency(): number {
    if (this.latencySamples.length === 0) return 0
    const sorted = [...this.latencySamples].sort((a, b) => a - b)
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
    return sorted[idx]
  }

  private getAvgDesyncRecovery(): number {
    if (this.desyncRecoveryDurations.length === 0) return 0
    const sum = this.desyncRecoveryDurations.reduce((acc, value) => acc + value, 0)
    return sum / this.desyncRecoveryDurations.length
  }

  private getAvgLockstepResyncDuration(): number {
    if (this.lockstepResyncDurations.length === 0) return 0
    const sum = this.lockstepResyncDurations.reduce((acc, value) => acc + value, 0)
    return sum / this.lockstepResyncDurations.length
  }

  getSnapshot(): {
    sessionId: string
    reconnectCount: number
    avgLatency: number
    p95Latency: number
    uptimeMs: number
    downtimeMs: number
    actionsAttempted: number
    actionsSucceeded: number
    actionsFailed: number
    actionsRetried: number
    deltasReceived: number
    deltasDuplicated: number
    deltaGapsDetected: number
    deltaGapRecoveries: number
    desyncDetections: number
    desyncRecoveries: number
    avgDesyncRecoveryMs: number
    lockstepResyncs: {
      total: number
      successes: number
      failures: number
      pending: number
      avgDurationMs: number
      byReason: Record<
        | 'frame_gap'
        | 'unsupported_commands'
        | 'missing_state'
        | 'checksum_mismatch'
        | 'snapshot_error'
        | 'manual',
        number
      >
    }
    timestamp: number
  } {
    return {
      sessionId: this.sessionId,
      reconnectCount: this.reconnectCount,
      avgLatency: this.getAvgLatency(),
      p95Latency: this.getP95Latency(),
      uptimeMs: this.getUptimeMs(),
      downtimeMs: this.getDowntimeMs(),
      actionsAttempted: this.actionsAttempted,
      actionsSucceeded: this.actionsSucceeded,
      actionsFailed: this.actionsFailed,
      actionsRetried: this.actionsRetried,
      deltasReceived: this.deltasReceived,
      deltasDuplicated: this.deltasDuplicated,
      deltaGapsDetected: this.deltaGapsDetected,
      deltaGapRecoveries: this.deltaGapRecoveries,
      desyncDetections: this.desyncDetections,
      desyncRecoveries: this.desyncRecoveries,
      avgDesyncRecoveryMs: this.getAvgDesyncRecovery(),
      lockstepResyncs: {
        total: this.lockstepResyncTotal,
        successes: this.lockstepResyncSuccess,
        failures: this.lockstepResyncFailure,
        pending: this.lockstepResyncPending.size,
        avgDurationMs: this.getAvgLockstepResyncDuration(),
        byReason: {
          frame_gap: this.lockstepResyncReasonCounts.frame_gap ?? 0,
          unsupported_commands: this.lockstepResyncReasonCounts.unsupported_commands ?? 0,
          missing_state: this.lockstepResyncReasonCounts.missing_state ?? 0,
          checksum_mismatch: this.lockstepResyncReasonCounts.checksum_mismatch ?? 0,
          snapshot_error: this.lockstepResyncReasonCounts.snapshot_error ?? 0,
          manual: this.lockstepResyncReasonCounts.manual ?? 0,
        },
      },
      timestamp: Date.now(),
    }
  }

  getStats(): {
    actionSuccessRate: number
    deltaAccuracyRate: number
    desyncRate: number
    avgLatency: number
  } {
    const actionSuccessRate =
      this.actionsAttempted > 0 ? (this.actionsSucceeded / this.actionsAttempted) * 100 : 100
    const deltaAccuracyRate =
      this.deltasReceived > 0
        ? ((this.deltasReceived - this.deltasDuplicated) / this.deltasReceived) * 100
        : 100
    const desyncRate =
      this.deltasReceived > 0 ? (this.desyncDetections / this.deltasReceived) * 100 : 0

    return {
      actionSuccessRate,
      deltaAccuracyRate,
      desyncRate,
      avgLatency: this.getAvgLatency(),
    }
  }

  getDisplaySnapshot(): ReliabilityDisplaySnapshot {
    const stats = this.getStats()
    const p95Latency = this.getP95Latency()
    const deltaGapRate =
      this.deltasReceived > 0 ? (this.deltaGapsDetected / this.deltasReceived) * 100 : 0

    let status: ReliabilityStatus = 'excellent'
    if (
      stats.actionSuccessRate < 85 ||
      p95Latency > 600 ||
      deltaGapRate > 5 ||
      this.reconnectCount > 8
    ) {
      status = 'critical'
    } else if (
      stats.actionSuccessRate < 95 ||
      p95Latency > 350 ||
      deltaGapRate > 2 ||
      this.reconnectCount > 3
    ) {
      status = 'warning'
    }

    const label =
      status === 'excellent' ? 'Excellent' : status === 'warning' ? 'Needs Attention' : 'Degraded'

    return {
      status,
      label,
      actionSuccessRate: Math.round(stats.actionSuccessRate * 10) / 10,
      deltaGapRate: Math.round(deltaGapRate * 10) / 10,
      avgLatency: Math.round(this.getAvgLatency()),
      p95Latency: Math.round(p95Latency),
      reconnectCount: this.reconnectCount,
      lastUploadAt: this.lastUploadAt,
      sessionId: this.sessionId,
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener()
      } catch (error) {
        logger.warn('Reliability metrics listener failed', {
          error: error instanceof Error ? error.message : error,
        })
      }
    })
  }

  private async flush(): Promise<void> {
    const state = store.getState()
    if (!state.auth.user) {
      return
    }

    const payload = {
      metrics: this.getSnapshot(),
      stats: this.getStats(),
      gameId: state.game.currentGame?.roomId ?? null,
    }

    try {
      await api.post('/metrics/client', payload)
      this.lastUploadAt = Date.now()
      this.notify()
    } catch (error) {
      logger.debug('Failed to upload reliability metrics', {
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  /**
   * Test-only helper to reset accumulated metrics without restarting the session ID.
   */
  resetForTest(): void {
    this.reconnectCount = 0
    this.actionsAttempted = 0
    this.actionsSucceeded = 0
    this.actionsFailed = 0
    this.actionsRetried = 0
    this.deltasReceived = 0
    this.deltasDuplicated = 0
    this.deltaGapsDetected = 0
    this.deltaGapRecoveries = 0
    this.desyncDetections = 0
    this.desyncRecoveries = 0
    this.desyncDetectedAt = null
    this.desyncRecoveryDurations = []
    this.latencySamples = []
    this.totalUptimeMs = 0
    this.totalDowntimeMs = 0
    this.connectedAt = null
    this.lastConnectionChange = Date.now()
    this.firstConnection = true
    if (this.uploadInterval) {
      clearInterval(this.uploadInterval)
      this.uploadInterval = null
    }
    this.lockstepResyncTotal = 0
    this.lockstepResyncSuccess = 0
    this.lockstepResyncFailure = 0
    this.lockstepResyncReasonCounts = {}
    this.lockstepResyncDurations = []
    this.lockstepResyncPending.clear()
    this.start()
    this.notify()
  }
}

export const reliabilityMetrics = new ReliabilityMetricsService()
reliabilityMetrics.start()
