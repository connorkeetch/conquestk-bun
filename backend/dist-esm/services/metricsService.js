import { logger } from '../utils/logger.js';
class CounterMetric {
    name;
    values = new Map();
    constructor(name) {
        this.name = name;
    }
    inc(labels = {}, value = 1) {
        const key = this.serializeLabels(labels);
        const current = this.values.get(key) ?? 0;
        this.values.set(key, current + value);
    }
    snapshot() {
        return Array.from(this.values.entries()).map(([key, value]) => ({
            metric: this.name,
            labels: this.deserializeLabels(key),
            value,
        }));
    }
    resetAll() {
        this.values.clear();
    }
    reset(labels) {
        const key = this.serializeLabels(labels);
        this.values.delete(key);
    }
    serializeLabels(labels) {
        return Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
    }
    deserializeLabels(serialized) {
        if (!serialized)
            return {};
        return serialized.split('|').reduce((acc, pair) => {
            const [key, value] = pair.split(':');
            if (key)
                acc[key] = value ?? '';
            return acc;
        }, {});
    }
}
class GaugeMetric extends CounterMetric {
    set(value, labels = {}) {
        const key = this.serializeLabels(labels);
        this.values.set(key, value);
    }
    inc(labels = {}, value = 1) {
        const key = this.serializeLabels(labels);
        const current = this.values.get(key) ?? 0;
        this.values.set(key, current + value);
    }
    reset(labels) {
        const key = this.serializeLabels(labels);
        this.values.delete(key);
    }
    snapshot() {
        return Array.from(this.values.entries()).map(([key, value]) => ({
            metric: this.name,
            labels: this.deserializeLabels(key),
            value,
        }));
    }
}
class BattleMetrics {
    battleApplyCounter = new CounterMetric('battle_applied_total');
    battleApplyFailureCounter = new CounterMetric('battle_apply_failures_total');
    battleStateDivergenceGauge = new GaugeMetric('battle_state_divergence');
    failureTimestamps = [];
    failureWindowMs = 60_000;
    failureThreshold = Number(process.env.BATTLE_APPLY_FAILURE_ALERT_THRESHOLD ?? '3');
    lastAlertAt = 0;
    recordApply(gameId, status, divergence) {
        this.battleApplyCounter.inc({ status });
        this.battleStateDivergenceGauge.set(divergence, { gameId });
    }
    recordFailure(reason, metadata) {
        this.battleApplyFailureCounter.inc();
        const now = Date.now();
        this.failureTimestamps.push(now);
        this.failureTimestamps = this.failureTimestamps.filter((ts) => now - ts <= this.failureWindowMs);
        if (this.failureTimestamps.length >= this.failureThreshold &&
            now - this.lastAlertAt > this.failureWindowMs) {
            this.lastAlertAt = now;
            logger.error('Battle persistence failures exceeded threshold', {
                failuresLastMinute: this.failureTimestamps.length,
                threshold: this.failureThreshold,
                reason,
                ...metadata,
            });
        }
    }
    clearGame(gameId) {
        this.battleStateDivergenceGauge.reset({ gameId });
    }
    snapshot() {
        return {
            counters: [
                ...this.battleApplyCounter.snapshot(),
                ...this.battleApplyFailureCounter.snapshot(),
            ],
            gauges: this.battleStateDivergenceGauge.snapshot(),
        };
    }
}
export const battleMetrics = new BattleMetrics();
class TreasureMetrics {
    drawCounter = new CounterMetric('treasure_drawn_total');
    cashCounter = new CounterMetric('treasure_cashed_total');
    modeCounter = new CounterMetric('treasure_mode_total');
    recordMode(config) {
        const mode = config.payoutMode ?? 'classic';
        const enabled = config.enabled ? 'enabled' : 'disabled';
        this.modeCounter.inc({ mode, enabled });
    }
    recordDraw(config, metal) {
        if (!config.enabled)
            return;
        const mode = config.payoutMode ?? 'classic';
        this.drawCounter.inc({ mode, metal });
    }
    recordCash(config, hasDiamond) {
        if (!config.enabled)
            return;
        const mode = config.payoutMode ?? 'classic';
        this.cashCounter.inc({ mode, diamond: hasDiamond ? 'yes' : 'no' });
    }
    snapshot() {
        return {
            counters: [
                ...this.drawCounter.snapshot(),
                ...this.cashCounter.snapshot(),
                ...this.modeCounter.snapshot(),
            ],
            gauges: [],
        };
    }
}
export const treasureMetrics = new TreasureMetrics();
class RollingWindowStats {
    windowByKey = new Map();
    maxSize;
    lastLogAt = new Map();
    counts = new Map();
    constructor(maxSize = 200) {
        this.maxSize = Math.max(1, maxSize);
    }
    record(key, value) {
        const arr = this.windowByKey.get(key) ?? [];
        arr.push(value);
        if (arr.length > this.maxSize)
            arr.shift();
        this.windowByKey.set(key, arr);
        const count = (this.counts.get(key) ?? 0) + 1;
        this.counts.set(key, count);
    }
    getPercentiles(key) {
        const arr = this.windowByKey.get(key);
        if (!arr || arr.length === 0)
            return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const p = (q) => {
            const idx = Math.ceil(sorted.length * q) - 1;
            if (idx < 0)
                return 0;
            return sorted[idx] ?? 0;
        };
        return {
            count: sorted.length,
            p50: p(0.5),
            p95: p(0.95),
            max: sorted[sorted.length - 1] ?? 0,
        };
    }
    shouldLog(key, { everyN = 50, minIntervalMs = 30000 } = {}) {
        const now = Date.now();
        const last = this.lastLogAt.get(key) ?? 0;
        if (!this.lastLogAt.has(key)) {
            this.lastLogAt.set(key, now);
            return true;
        }
        const count = this.counts.get(key) ?? 0;
        const due = now - last >= minIntervalMs || (everyN > 0 && count % everyN === 0);
        if (due)
            this.lastLogAt.set(key, now);
        return due;
    }
}
class SocketPayloadMetrics {
    gauge = new GaugeMetric('socket_payload_bytes');
    window = new RollingWindowStats(300);
    record(event, bytes) {
        if (Number.isFinite(bytes) && bytes >= 0) {
            this.gauge.set(bytes, { event });
            this.window.record(event, bytes);
        }
    }
    snapshot(event) {
        return this.window.getPercentiles(event);
    }
    shouldLog(event) {
        return this.window.shouldLog(event);
    }
}
export const socketPayloadMetrics = new SocketPayloadMetrics();
class AITurnMetrics {
    turnCounter = new CounterMetric('ai_turns_total');
    fallbackCounter = new CounterMetric('ai_turn_fallback_total');
    thinkTimeGauge = new GaugeMetric('ai_turn_think_time_ms');
    plannedActionsGauge = new GaugeMetric('ai_turn_actions_planned');
    appliedActionsGauge = new GaugeMetric('ai_turn_actions_applied');
    recordTurn(record) {
        const { difficulty, fallbackUsed, fallbackReason, thinkTimeMs, plannedActions, appliedActions, } = record;
        const baseLabels = { difficulty };
        this.turnCounter.inc(baseLabels);
        this.plannedActionsGauge.set(plannedActions, baseLabels);
        this.appliedActionsGauge.set(appliedActions, baseLabels);
        if (typeof thinkTimeMs === 'number' && Number.isFinite(thinkTimeMs)) {
            this.thinkTimeGauge.set(thinkTimeMs, baseLabels);
        }
        if (fallbackUsed) {
            const fallbackLabels = {
                difficulty,
                reason: fallbackReason ?? 'unknown',
            };
            this.fallbackCounter.inc(fallbackLabels);
        }
    }
    reset() {
        this.turnCounter.resetAll();
        this.fallbackCounter.resetAll();
        this.thinkTimeGauge.resetAll();
        this.plannedActionsGauge.resetAll();
        this.appliedActionsGauge.resetAll();
    }
    snapshot() {
        return {
            counters: [...this.turnCounter.snapshot(), ...this.fallbackCounter.snapshot()],
            gauges: [
                ...this.thinkTimeGauge.snapshot(),
                ...this.plannedActionsGauge.snapshot(),
                ...this.appliedActionsGauge.snapshot(),
            ],
        };
    }
}
export const aiTurnMetrics = new AITurnMetrics();
class AssassinationMetrics {
    assignmentCounter = new CounterMetric('assassination_assignment_total');
    eliminationCounter = new CounterMetric('assassination_elimination_total');
    recordAssignments(gameId, assignments, turnNumber = 0) {
        for (const [hunterId, targetId] of Object.entries(assignments)) {
            if (!hunterId || !targetId)
                continue;
            this.recordAssignment(gameId, hunterId, targetId, turnNumber);
        }
    }
    recordAssignment(gameId, hunterId, targetId, turnNumber = 0) {
        if (!gameId || !hunterId || !targetId)
            return;
        this.assignmentCounter.inc({
            gameId,
            hunterId,
            targetId,
            turn: String(turnNumber ?? 0),
        });
    }
    recordElimination(record) {
        const { gameId, hunterId, targetId, eliminatorId, turnNumber, resolution } = record;
        if (!gameId || !hunterId || !targetId)
            return;
        this.eliminationCounter.inc({
            gameId,
            hunterId,
            targetId,
            eliminatorId,
            resolution,
            turn: String(turnNumber ?? 0),
        });
    }
    reset() {
        this.assignmentCounter.resetAll();
        this.eliminationCounter.resetAll();
    }
    snapshot() {
        return {
            counters: [...this.assignmentCounter.snapshot(), ...this.eliminationCounter.snapshot()],
            gauges: [],
        };
    }
}
export const assassinationMetrics = new AssassinationMetrics();
class OddsMetrics {
    checkedCounter = new CounterMetric('odds_shadow_checked_total');
    divergenceCounter = new CounterMetric('odds_shadow_divergence_total');
    divergenceRateGauge = new GaugeMetric('odds_shadow_divergence_rate');
    history = [];
    recordBatch(environment, kind, checked, divergences) {
        this.checkedCounter.inc({ environment, kind }, checked);
        if (divergences > 0)
            this.divergenceCounter.inc({ environment, kind }, divergences);
        const rate = checked > 0 ? divergences / checked : 0;
        this.divergenceRateGauge.set(rate, { environment, kind });
        const now = Date.now();
        this.history.push({ ts: now, environment, kind, checked, divergences, rate });
        const cutoff = now - 24 * 60 * 60 * 1000;
        this.history = this.history.filter((p) => p.ts >= cutoff);
    }
    snapshot() {
        return {
            counters: [
                ...this.checkedCounter.snapshot(),
                ...this.divergenceCounter.snapshot(),
            ],
            gauges: this.divergenceRateGauge.snapshot(),
        };
    }
    getHistory(hours = 24) {
        const cutoff = Date.now() - Math.max(1, hours) * 60 * 60 * 1000;
        return this.history.filter((p) => p.ts >= cutoff);
    }
}
export const oddsMetrics = new OddsMetrics();
//# sourceMappingURL=metricsService.js.map