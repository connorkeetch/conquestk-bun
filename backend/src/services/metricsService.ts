import type { AIDifficulty, Metal, TreasureConfig } from '../types/game.js'
import { logger } from '../utils/logger.js'

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

  resetAll(): void {
    this.values.clear()
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

class TreasureMetrics {
  private readonly drawCounter = new CounterMetric('treasure_drawn_total')
  private readonly cashCounter = new CounterMetric('treasure_cashed_total')
  private readonly modeCounter = new CounterMetric('treasure_mode_total')

  recordMode(config: TreasureConfig) {
    const mode = config.payoutMode ?? 'classic'
    const enabled = config.enabled ? 'enabled' : 'disabled'
    this.modeCounter.inc({ mode, enabled })
  }

  recordDraw(config: TreasureConfig, metal: Metal) {
    if (!config.enabled) return
    const mode = config.payoutMode ?? 'classic'
    this.drawCounter.inc({ mode, metal })
  }

  recordCash(config: TreasureConfig, hasDiamond: boolean) {
    if (!config.enabled) return
    const mode = config.payoutMode ?? 'classic'
    this.cashCounter.inc({ mode, diamond: hasDiamond ? 'yes' : 'no' })
  }

  snapshot() {
    return {
      counters: [
        ...this.drawCounter.snapshot(),
        ...this.cashCounter.snapshot(),
        ...this.modeCounter.snapshot(),
      ],
      gauges: [] as GaugeSnapshot[],
    }
  }
}

export const treasureMetrics = new TreasureMetrics()

// Lightweight rolling window stats for payload sizes
class RollingWindowStats {
  private readonly windowByKey = new Map<string, number[]>()
  private readonly maxSize: number
  private readonly lastLogAt = new Map<string, number>()
  private readonly counts = new Map<string, number>()

  constructor(maxSize = 200) {
    this.maxSize = Math.max(1, maxSize)
  }

  record(key: string, value: number) {
    const arr = this.windowByKey.get(key) ?? []
    arr.push(value)
    if (arr.length > this.maxSize) arr.shift()
    this.windowByKey.set(key, arr)

    const count = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, count)
  }

  getPercentiles(key: string): { count: number; p50: number; p95: number; max: number } | null {
    const arr = this.windowByKey.get(key)
    if (!arr || arr.length === 0) return null
    const sorted = [...arr].sort((a, b) => a - b)
    const p = (q: number) => {
      const idx = Math.ceil(sorted.length * q) - 1
      if (idx < 0) return 0
      return sorted[idx] ?? 0
    }
    return {
      count: sorted.length,
      p50: p(0.5),
      p95: p(0.95),
      max: sorted[sorted.length - 1] ?? 0,
    }
  }

  shouldLog(key: string, { everyN = 50, minIntervalMs = 30000 } = {}): boolean {
    const now = Date.now()
    const last = this.lastLogAt.get(key) ?? 0
    // Log immediately for a new key so developers see initial numbers
    if (!this.lastLogAt.has(key)) {
      this.lastLogAt.set(key, now)
      return true
    }
    const count = this.counts.get(key) ?? 0
    const due = now - last >= minIntervalMs || (everyN > 0 && count % everyN === 0)
    if (due) this.lastLogAt.set(key, now)
    return due
  }
}

class SocketPayloadMetrics {
  private readonly gauge = new GaugeMetric('socket_payload_bytes')
  private readonly window = new RollingWindowStats(300)

  record(event: string, bytes: number) {
    if (Number.isFinite(bytes) && bytes >= 0) {
      this.gauge.set(bytes, { event })
      this.window.record(event, bytes)
    }
  }

  snapshot(event: string) {
    return this.window.getPercentiles(event)
  }

  shouldLog(event: string) {
    return this.window.shouldLog(event)
  }
}

export const socketPayloadMetrics = new SocketPayloadMetrics()

type AITurnMetricRecord = {
  difficulty: AIDifficulty
  fallbackUsed: boolean
  fallbackReason?: string
  thinkTimeMs?: number
  plannedActions: number
  appliedActions: number
}

class AITurnMetrics {
  private readonly turnCounter = new CounterMetric('ai_turns_total')
  private readonly fallbackCounter = new CounterMetric('ai_turn_fallback_total')
  private readonly thinkTimeGauge = new GaugeMetric('ai_turn_think_time_ms')
  private readonly plannedActionsGauge = new GaugeMetric('ai_turn_actions_planned')
  private readonly appliedActionsGauge = new GaugeMetric('ai_turn_actions_applied')

  recordTurn(record: AITurnMetricRecord) {
    const {
      difficulty,
      fallbackUsed,
      fallbackReason,
      thinkTimeMs,
      plannedActions,
      appliedActions,
    } = record
    const baseLabels: LabelValue = { difficulty }

    this.turnCounter.inc(baseLabels)
    this.plannedActionsGauge.set(plannedActions, baseLabels)
    this.appliedActionsGauge.set(appliedActions, baseLabels)

    if (typeof thinkTimeMs === 'number' && Number.isFinite(thinkTimeMs)) {
      this.thinkTimeGauge.set(thinkTimeMs, baseLabels)
    }

    if (fallbackUsed) {
      const fallbackLabels: LabelValue = {
        difficulty,
        reason: fallbackReason ?? 'unknown',
      }
      this.fallbackCounter.inc(fallbackLabels)
    }
  }

  reset() {
    this.turnCounter.resetAll()
    this.fallbackCounter.resetAll()
    this.thinkTimeGauge.resetAll()
    this.plannedActionsGauge.resetAll()
    this.appliedActionsGauge.resetAll()
  }

  snapshot() {
    return {
      counters: [...this.turnCounter.snapshot(), ...this.fallbackCounter.snapshot()],
      gauges: [
        ...this.thinkTimeGauge.snapshot(),
        ...this.plannedActionsGauge.snapshot(),
        ...this.appliedActionsGauge.snapshot(),
      ],
    }
  }
}

export const aiTurnMetrics = new AITurnMetrics()

type AssassinationResolution =
  | 'direct'
  | 'collateral'
  | 'resignation'
  | 'self_eliminated'
  | 'system'

type AssassinationEliminationRecord = {
  gameId: string
  hunterId: string
  targetId: string
  eliminatorId: string
  turnNumber: number
  resolution: AssassinationResolution
}

class AssassinationMetrics {
  private readonly assignmentCounter = new CounterMetric('assassination_assignment_total')
  private readonly eliminationCounter = new CounterMetric('assassination_elimination_total')

  recordAssignments(gameId: string, assignments: Record<string, string>, turnNumber = 0) {
    for (const [hunterId, targetId] of Object.entries(assignments)) {
      if (!hunterId || !targetId) continue
      this.recordAssignment(gameId, hunterId, targetId, turnNumber)
    }
  }

  recordAssignment(gameId: string, hunterId: string, targetId: string, turnNumber = 0) {
    if (!gameId || !hunterId || !targetId) return

    this.assignmentCounter.inc({
      gameId,
      hunterId,
      targetId,
      turn: String(turnNumber ?? 0),
    })
  }

  recordElimination(record: AssassinationEliminationRecord) {
    const { gameId, hunterId, targetId, eliminatorId, turnNumber, resolution } = record
    if (!gameId || !hunterId || !targetId) return

    this.eliminationCounter.inc({
      gameId,
      hunterId,
      targetId,
      eliminatorId,
      resolution,
      turn: String(turnNumber ?? 0),
    })
  }

  reset() {
    this.assignmentCounter.resetAll()
    this.eliminationCounter.resetAll()
  }

  snapshot() {
    return {
      counters: [...this.assignmentCounter.snapshot(), ...this.eliminationCounter.snapshot()],
      gauges: [] as GaugeSnapshot[],
    }
  }
}

export const assassinationMetrics = new AssassinationMetrics()

// Odds (shadow) verification metrics
class OddsMetrics {
  private readonly checkedCounter = new CounterMetric('odds_shadow_checked_total')
  private readonly divergenceCounter = new CounterMetric('odds_shadow_divergence_total')
  private readonly divergenceRateGauge = new GaugeMetric('odds_shadow_divergence_rate')
  private history: Array<{
    ts: number
    environment: string
    kind: string
    checked: number
    divergences: number
    rate: number
  }> = []

  recordBatch(environment: string, kind: string, checked: number, divergences: number) {
    this.checkedCounter.inc({ environment, kind }, checked)
    if (divergences > 0) this.divergenceCounter.inc({ environment, kind }, divergences)
    const rate = checked > 0 ? divergences / checked : 0
    this.divergenceRateGauge.set(rate, { environment, kind })

    // Append to history and prune to 24h
    const now = Date.now()
    this.history.push({ ts: now, environment, kind, checked, divergences, rate })
    const cutoff = now - 24 * 60 * 60 * 1000
    this.history = this.history.filter((p) => p.ts >= cutoff)
  }

  snapshot() {
    return {
      counters: [...this.checkedCounter.snapshot(), ...this.divergenceCounter.snapshot()],
      gauges: this.divergenceRateGauge.snapshot(),
    }
  }

  getHistory(hours = 24) {
    const cutoff = Date.now() - Math.max(1, hours) * 60 * 60 * 1000
    return this.history.filter((p) => p.ts >= cutoff)
  }
}

export const oddsMetrics = new OddsMetrics()
