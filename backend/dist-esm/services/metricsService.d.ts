import type { AIDifficulty, Metal, TreasureConfig } from '../types/game.js';
type LabelValue = Record<string, string>;
type CounterSnapshot = {
    metric: string;
    labels: LabelValue;
    value: number;
};
type GaugeSnapshot = CounterSnapshot;
type BattleStatus = 'applied' | 'duplicate';
declare class BattleMetrics {
    private readonly battleApplyCounter;
    private readonly battleApplyFailureCounter;
    private readonly battleStateDivergenceGauge;
    private failureTimestamps;
    private readonly failureWindowMs;
    private readonly failureThreshold;
    private lastAlertAt;
    recordApply(gameId: string, status: BattleStatus, divergence: number): void;
    recordFailure(reason: string, metadata?: Record<string, unknown>): void;
    clearGame(gameId: string): void;
    snapshot(): {
        counters: CounterSnapshot[];
        gauges: CounterSnapshot[];
    };
}
export declare const battleMetrics: BattleMetrics;
declare class TreasureMetrics {
    private readonly drawCounter;
    private readonly cashCounter;
    private readonly modeCounter;
    recordMode(config: TreasureConfig): void;
    recordDraw(config: TreasureConfig, metal: Metal): void;
    recordCash(config: TreasureConfig, hasDiamond: boolean): void;
    snapshot(): {
        counters: CounterSnapshot[];
        gauges: GaugeSnapshot[];
    };
}
export declare const treasureMetrics: TreasureMetrics;
declare class SocketPayloadMetrics {
    private readonly gauge;
    private readonly window;
    record(event: string, bytes: number): void;
    snapshot(event: string): {
        count: number;
        p50: number;
        p95: number;
        max: number;
    } | null;
    shouldLog(event: string): boolean;
}
export declare const socketPayloadMetrics: SocketPayloadMetrics;
type AITurnMetricRecord = {
    difficulty: AIDifficulty;
    fallbackUsed: boolean;
    fallbackReason?: string;
    thinkTimeMs?: number;
    plannedActions: number;
    appliedActions: number;
};
declare class AITurnMetrics {
    private readonly turnCounter;
    private readonly fallbackCounter;
    private readonly thinkTimeGauge;
    private readonly plannedActionsGauge;
    private readonly appliedActionsGauge;
    recordTurn(record: AITurnMetricRecord): void;
    reset(): void;
    snapshot(): {
        counters: CounterSnapshot[];
        gauges: CounterSnapshot[];
    };
}
export declare const aiTurnMetrics: AITurnMetrics;
type AssassinationResolution = 'direct' | 'collateral' | 'resignation' | 'self_eliminated' | 'system';
type AssassinationEliminationRecord = {
    gameId: string;
    hunterId: string;
    targetId: string;
    eliminatorId: string;
    turnNumber: number;
    resolution: AssassinationResolution;
};
declare class AssassinationMetrics {
    private readonly assignmentCounter;
    private readonly eliminationCounter;
    recordAssignments(gameId: string, assignments: Record<string, string>, turnNumber?: number): void;
    recordAssignment(gameId: string, hunterId: string, targetId: string, turnNumber?: number): void;
    recordElimination(record: AssassinationEliminationRecord): void;
    reset(): void;
    snapshot(): {
        counters: CounterSnapshot[];
        gauges: GaugeSnapshot[];
    };
}
export declare const assassinationMetrics: AssassinationMetrics;
export {};
//# sourceMappingURL=metricsService.d.ts.map