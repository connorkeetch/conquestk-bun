# Phase 3: Client-Side Reliability Metrics Guide

## Overview
Track client-side metrics to monitor real-time system health, debug issues, and identify patterns in connection/action failures.

## Metrics to Track

### Connection Metrics
- `reconnect_count`: Number of disconnects/reconnects
- `connection_latency_avg`: Average ping latency
- `connection_latency_p95`: 95th percentile latency
- `connection_uptime_percent`: % of time connected

### Action Metrics
- `actions_attempted`: Total actions sent
- `actions_succeeded`: Actions acknowledged successfully
- `actions_failed`: Actions that failed/timed out
- `actions_retried`: Actions retried after failure
- `action_success_rate`: % of successful actions

### Delta Metrics
- `deltas_received`: Total deltas processed
- `deltas_duplicates`: Duplicate deltas filtered
- `delta_gaps_detected`: Sequence gaps found
- `delta_gap_recoveries`: Successful gap recoveries

### Desync Metrics
- `desync_detections`: Times desync was detected
- `desync_recoveries`: Successful full state refetches
- `desync_recovery_time_avg`: Average recovery time

## Implementation

### 1. Create Metrics Service

**File:** `frontend/src/services/metricsService.ts`

```typescript
import { logger } from '@/utils/logger'
import api from './api'

interface MetricSnapshot {
  // Connection
  reconnectCount: number
  avgLatency: number
  p95Latency: number
  uptimeMs: number
  downtimeMs: number

  // Actions
  actionsAttempted: number
  actionsSucceeded: number
  actionsFailed: number
  actionsRetried: number

  // Deltas
  deltasReceived: number
  deltasDuplicated: number
  deltaGapsDetected: number
  deltaGapRecoveries: number

  // Desyncs
  desyncDetections: number
  desyncRecoveries: number
  avgDesyncRecoveryMs: number

  // Session
  sessionId: string
  userId?: string
  gameId?: string
  timestamp: number
}

class MetricsService {
  private metrics: MetricSnapshot
  private sessionId: string
  private latencyHistory: number[] = []
  private desyncRecoveryTimes: number[] = []
  private lastUploadAt: number = Date.now()
  private uploadInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`
    this.metrics = this.createEmptySnapshot()
  }

  private createEmptySnapshot(): MetricSnapshot {
    return {
      reconnectCount: 0,
      avgLatency: 0,
      p95Latency: 0,
      uptimeMs: 0,
      downtimeMs: 0,
      actionsAttempted: 0,
      actionsSucceeded: 0,
      actionsFailed: 0,
      actionsRetried: 0,
      deltasReceived: 0,
      deltasDuplicated: 0,
      deltaGapsDetected: 0,
      deltaGapRecoveries: 0,
      desyncDetections: 0,
      desyncRecoveries: 0,
      avgDesyncRecoveryMs: 0,
      sessionId: this.sessionId,
      timestamp: Date.now(),
    }
  }

  /**
   * Start periodic upload of metrics to backend
   */
  startPeriodicUpload(intervalMs = 30000) {
    if (this.uploadInterval) return

    this.uploadInterval = setInterval(() => {
      this.uploadMetrics()
    }, intervalMs)

    logger.info('Started periodic metrics upload', { intervalMs })
  }

  /**
   * Stop periodic upload
   */
  stopPeriodicUpload() {
    if (this.uploadInterval) {
      clearInterval(this.uploadInterval)
      this.uploadInterval = null
    }
  }

  // === Metric Recording Methods ===

  recordReconnect() {
    this.metrics.reconnectCount++
  }

  recordLatency(latencyMs: number) {
    this.latencyHistory.push(latencyMs)

    // Keep last 100 samples for statistics
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift()
    }

    // Update averages
    this.metrics.avgLatency = this.calculateAverage(this.latencyHistory)
    this.metrics.p95Latency = this.calculatePercentile(this.latencyHistory, 0.95)
  }

  recordActionAttempt() {
    this.metrics.actionsAttempted++
  }

  recordActionSuccess() {
    this.metrics.actionsSucceeded++
  }

  recordActionFailure() {
    this.metrics.actionsFailed++
  }

  recordActionRetry() {
    this.metrics.actionsRetried++
  }

  recordDeltaReceived() {
    this.metrics.deltasReceived++
  }

  recordDeltaDuplicate() {
    this.metrics.deltasDuplicated++
  }

  recordDeltaGap() {
    this.metrics.deltaGapsDetected++
  }

  recordDeltaGapRecovery() {
    this.metrics.deltaGapRecoveries++
  }

  recordDesyncDetection() {
    this.metrics.desyncDetections++
  }

  recordDesyncRecovery(recoveryTimeMs: number) {
    this.metrics.desyncRecoveries++
    this.desyncRecoveryTimes.push(recoveryTimeMs)
    this.metrics.avgDesyncRecoveryMs = this.calculateAverage(this.desyncRecoveryTimes)
  }

  recordUptime(uptimeMs: number) {
    this.metrics.uptimeMs = uptimeMs
  }

  recordDowntime(downtimeMs: number) {
    this.metrics.downtimeMs = downtimeMs
  }

  setUserId(userId: string) {
    this.metrics.userId = userId
  }

  setGameId(gameId: string) {
    this.metrics.gameId = gameId
  }

  // === Utility Methods ===

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
  }

  private calculatePercentile(numbers: number[], percentile: number): number {
    if (numbers.length === 0) return 0
    const sorted = [...numbers].sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * percentile) - 1
    return sorted[index]
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricSnapshot {
    return {
      ...this.metrics,
      timestamp: Date.now(),
    }
  }

  /**
   * Get computed statistics
   */
  getStats(): {
    actionSuccessRate: number
    deltaAccuracyRate: number
    desyncRate: number
    avgLatency: number
  } {
    const actionSuccessRate = this.metrics.actionsAttempted > 0
      ? (this.metrics.actionsSucceeded / this.metrics.actionsAttempted) * 100
      : 100

    const deltaAccuracyRate = this.metrics.deltasReceived > 0
      ? ((this.metrics.deltasReceived - this.metrics.deltasDuplicated) / this.metrics.deltasReceived) * 100
      : 100

    const desyncRate = this.metrics.deltasReceived > 0
      ? (this.metrics.desyncDetections / this.metrics.deltasReceived) * 100
      : 0

    return {
      actionSuccessRate,
      deltaAccuracyRate,
      desyncRate,
      avgLatency: this.metrics.avgLatency,
    }
  }

  /**
   * Upload metrics to backend
   */
  private async uploadMetrics() {
    try {
      const snapshot = this.getSnapshot()

      await api.post('/api/metrics/client', {
        metrics: snapshot,
        stats: this.getStats(),
      })

      logger.debug('Uploaded client metrics', {
        sessionId: this.sessionId,
        actionsAttempted: snapshot.actionsAttempted,
      })

      this.lastUploadAt = Date.now()
    } catch (error) {
      // Don't spam logs - metrics upload is best-effort
      logger.debug('Failed to upload metrics', { error })
    }
  }

  /**
   * Reset metrics (on game end or new session)
   */
  reset() {
    this.metrics = this.createEmptySnapshot()
    this.latencyHistory = []
    this.desyncRecoveryTimes = []
    logger.info('Reset client metrics', { sessionId: this.sessionId })
  }

  /**
   * Force immediate metrics upload
   */
  async flush() {
    await this.uploadMetrics()
  }
}

export const metricsService = new MetricsService()
```

### 2. Integrate with Socket Service

**File:** `frontend/src/services/socketService.ts`

Add metrics tracking to all events:

```typescript
import { metricsService } from './metricsService'

// In constructor or connect():
metricsService.startPeriodicUpload(30000) // Upload every 30s

// In connect handler:
this.socket.on('connect', () => {
  // ... existing logic ...

  if (this.reliabilityMetrics.reconnectCount > 0) {
    metricsService.recordReconnect()
  }
})

// In heartbeat:
this.socket.volatile.emit('ping', () => {
  const latency = Date.now() - start
  this.connectionLatency = latency
  metricsService.recordLatency(latency)
  // ... rest ...
})

// In sendActionWithAck:
private async sendActionWithAck(...) {
  metricsService.recordActionAttempt()

  const result = await this._sendActionInternal(...)

  if (result.ok) {
    metricsService.recordActionSuccess()
  } else {
    metricsService.recordActionFailure()
  }

  return result
}

// In retryAction:
private async retryAction(...) {
  metricsService.recordActionRetry()
  // ... rest ...
}

// In delta handlers:
this.socket.on('game-delta', async (delta) => {
  metricsService.recordDeltaReceived()

  const shouldProcess = await this.checkDeltaSequence(roomId, delta)
  if (!shouldProcess) {
    metricsService.recordDeltaDuplicate()
    return
  }
  // ... rest ...
})

// In checkDeltaSequence:
private async checkDeltaSequence(...) {
  // ... gap detection logic ...

  if (currentSeq > lastSeq + 1) {
    metricsService.recordDeltaGap()
    await this.requestMissingDeltas(...)
    metricsService.recordDeltaGapRecovery()
  }
}

// In desync detection:
if (state.game.needsResync) {
  metricsService.recordDesyncDetection()

  const start = Date.now()
  await store.dispatch(fetchGameState(...))
  const recoveryTime = Date.now() - start

  metricsService.recordDesyncRecovery(recoveryTime)
}
```

### 3. Backend Metrics Endpoint

**File:** `backend/src/routes/metrics.ts`

```typescript
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

const router = Router()

// Store client metrics
router.post('/client', requireAuth, async (req, res) => {
  try {
    const { metrics, stats } = req.body
    const userId = req.user?.id

    // Store in database (or just log for now)
    await query(
      `INSERT INTO client_metrics
       (user_id, session_id, game_id, metrics, stats, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, metrics.sessionId, metrics.gameId || null, metrics, stats]
    )

    // Log critical issues
    if (stats.actionSuccessRate < 90) {
      logger.warn('Low action success rate detected', {
        userId,
        rate: stats.actionSuccessRate,
        sessionId: metrics.sessionId,
      })
    }

    res.json({ ok: true })
  } catch (error) {
    logger.error('Failed to store client metrics', { error })
    res.status(500).json({ error: 'Internal error' })
  }
})

// Get aggregated metrics for monitoring
router.get('/summary', requireAuth, async (req, res) => {
  try {
    // Only allow admins
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const result = await query(`
      SELECT
        COUNT(*) as session_count,
        AVG((metrics->>'avgLatency')::numeric) as avg_latency,
        AVG((stats->>'actionSuccessRate')::numeric) as avg_success_rate,
        SUM((metrics->>'reconnectCount')::integer) as total_reconnects
      FROM client_metrics
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `)

    res.json({ ok: true, data: result.rows[0] })
  } catch (error) {
    logger.error('Failed to fetch metrics summary', { error })
    res.status(500).json({ error: 'Internal error' })
  }
})

export default router
```

### 4. Create Metrics Table

**File:** `backend/migrations/XXX_create_client_metrics.sql`

```sql
CREATE TABLE IF NOT EXISTS client_metrics (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  session_id VARCHAR(255) NOT NULL,
  game_id VARCHAR(255),
  metrics JSONB NOT NULL,
  stats JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_client_metrics_user ON client_metrics(user_id);
CREATE INDEX idx_client_metrics_session ON client_metrics(session_id);
CREATE INDEX idx_client_metrics_created ON client_metrics(created_at DESC);
```

## Monitoring Dashboard

### Sample Queries

```sql
-- Average latency over time
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  AVG((metrics->>'avgLatency')::numeric) as avg_latency
FROM client_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

-- Users with high reconnect rates
SELECT
  user_id,
  COUNT(*) as sessions,
  AVG((metrics->>'reconnectCount')::integer) as avg_reconnects
FROM client_metrics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
HAVING AVG((metrics->>'reconnectCount')::integer) > 3
ORDER BY avg_reconnects DESC;

-- Action success rates by game
SELECT
  game_id,
  AVG((stats->>'actionSuccessRate')::numeric) as avg_success_rate,
  COUNT(*) as sample_count
FROM client_metrics
WHERE game_id IS NOT NULL
GROUP BY game_id
HAVING COUNT(*) >= 5
ORDER BY avg_success_rate ASC;
```

## Alerting Rules

Set up alerts for critical metrics:

1. **Action Success Rate < 90%**: Investigate connection issues
2. **Average Latency > 500ms**: Check server or network
3. **Reconnect Count > 5/session**: Investigate stability
4. **Desync Rate > 1%**: Check delta sequencing logic

## Key Benefits

1. **Proactive Monitoring**: Detect issues before users complain
2. **Data-Driven Optimization**: Identify bottlenecks with real data
3. **User Segmentation**: Find patterns (e.g., mobile users have higher latency)
4. **A/B Testing**: Compare metrics between feature flags

## Performance Notes

- Metrics stored in memory until upload
- Upload every 30s (batched, not per-action)
- Database insertion is async/non-blocking
- Negligible client-side overhead (<1ms per metric)
