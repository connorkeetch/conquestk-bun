import { Counter, Gauge, Registry } from 'prom-client'
import { logger } from '../utils/logger'

const register = new Registry()

const battleApplyCounter = new Counter({
  name: 'battle_applied_total',
  help: 'Total battle results processed by the persistence layer',
  labelNames: ['status'],
  registers: [register],
})

const battleApplyFailureCounter = new Counter({
  name: 'battle_apply_failures_total',
  help: 'Number of battle result persistence failures',
  registers: [register],
})

const battleStateDivergenceGauge = new Gauge({
  name: 'battle_state_divergence',
  help: 'Territory mismatch count between cache and database prior to apply',
  labelNames: ['game_id'],
  registers: [register],
})

type BattleStatus = 'applied' | 'duplicate'

class BattleMetrics {
  private failureTimestamps: number[] = []
  private readonly failureWindowMs = 60_000
  private readonly failureThreshold = Number(
    process.env.BATTLE_APPLY_FAILURE_ALERT_THRESHOLD ?? '3',
  )
  private lastAlertAt = 0

  recordApply(gameId: string, status: BattleStatus, divergence: number) {
    battleApplyCounter.labels(status).inc()
    battleStateDivergenceGauge.labels(gameId).set(divergence)
  }

  recordFailure(reason: string, metadata?: Record<string, unknown>) {
    battleApplyFailureCounter.inc()
    const now = Date.now()
    this.failureTimestamps.push(now)
    this.failureTimestamps = this.failureTimestamps.filter(
      (ts) => now - ts <= this.failureWindowMs,
    )

    if (
      this.failureTimestamps.length >= this.failureThreshold &&
      now - this.lastAlertAt > this.failureWindowMs
    ) {
      this.lastAlertAt = now
      logger.error('Battle persistence failures exceeded threshold', {
        failuresLastMinute: this.failureTimestamps.length,
        threshold: this.failureThreshold,
        reason,
        ...metadata,
      })
    }
  }

  clearGame(gameId: string) {
    battleStateDivergenceGauge.remove(gameId)
  }

  getRegister() {
    return register
  }
}

export const battleMetrics = new BattleMetrics()
export const metricsRegistry = register
