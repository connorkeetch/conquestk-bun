import { logger } from '../utils/logger'

type LabelValue = Record<string, string>

type CounterSnapshot = {
  metric: string
  labels: LabelValue
  value: number
}

type GaugeSnapshot = CounterSnapshot

class CounterMetric {
  protected readonly values = new Map<string, number>()

  constructor(protected readonly name: string) {}

  inc(labels: LabelValue = {}, value = 1): void {
    const key = this.serializeLabels(labels)
    const current = this.values.get(key) ?? 0
    this.values.set(key, current + value)
  }

  snapshot(): CounterSnapshot[] {
    return Array.from(this.values.entries()).map(([key, value]) => ({
      metric: this.name,
      labels: this.deserializeLabels(key),
      value,
    }))
  }

  reset(labels: LabelValue): void {
    const key = this.serializeLabels(labels)
    this.values.delete(key)
  }

  protected serializeLabels(labels: LabelValue): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|')
  }

  protected deserializeLabels(serialized: string): LabelValue {
    if (!serialized) return {}
    return serialized.split('|').reduce<LabelValue>((acc, pair) => {
      const [key, value] = pair.split(':')
      if (key) acc[key] = value ?? ''
      return acc
    }, {})
  }
}

class GaugeMetric extends CounterMetric {
  set(value: number, labels: LabelValue = {}): void {
    const key = this.serializeLabels(labels)
    this.values.set(key, value)
  }

  override inc(labels: LabelValue = {}, value = 1): void {
    const key = this.serializeLabels(labels)
    const current = this.values.get(key) ?? 0
    this.values.set(key, current + value)
  }

  override reset(labels: LabelValue): void {
    const key = this.serializeLabels(labels)
    this.values.delete(key)
  }

  override snapshot(): GaugeSnapshot[] {
    return Array.from(this.values.entries()).map(([key, value]) => ({
      metric: this.name,
      labels: this.deserializeLabels(key),
      value,
    }))
  }
}

type BattleStatus = 'applied' | 'duplicate'

class BattleMetrics {
  private readonly battleApplyCounter = new CounterMetric('battle_applied_total')
  private readonly battleApplyFailureCounter = new CounterMetric('battle_apply_failures_total')
  private readonly battleStateDivergenceGauge = new GaugeMetric('battle_state_divergence')
  private failureTimestamps: number[] = []
  private readonly failureWindowMs = 60_000
  private readonly failureThreshold = Number(
    process.env.BATTLE_APPLY_FAILURE_ALERT_THRESHOLD ?? '3',
  )
  private lastAlertAt = 0

  recordApply(gameId: string, status: BattleStatus, divergence: number) {
    this.battleApplyCounter.inc({ status })
    this.battleStateDivergenceGauge.set(divergence, { gameId })
  }

  recordFailure(reason: string, metadata?: Record<string, unknown>) {
    this.battleApplyFailureCounter.inc()
    const now = Date.now()
    this.failureTimestamps.push(now)
    this.failureTimestamps = this.failureTimestamps.filter((ts) => now - ts <= this.failureWindowMs)

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
    this.battleStateDivergenceGauge.reset({ gameId })
  }

  snapshot() {
    return {
      counters: [
        ...this.battleApplyCounter.snapshot(),
        ...this.battleApplyFailureCounter.snapshot(),
      ],
      gauges: this.battleStateDivergenceGauge.snapshot(),
    }
  }
}

export const battleMetrics = new BattleMetrics()
