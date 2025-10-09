import { type Job, Queue } from 'bullmq';
import type { GameAction } from '../types/game.js';
export interface GameActionJob {
    gameId: string;
    playerId: string;
    action: GameAction;
    socketId?: string;
    idempotencyKey?: string;
    afkSkip?: boolean;
    turnTimeoutStage?: 'expire';
}
export interface GameCleanupJob {
    gameId: string;
    reason: 'finished' | 'timeout' | 'abandoned';
    idempotencyKey?: string;
}
type QueueConfigKey = keyof typeof QUEUE_CONFIGS;
declare const QUEUE_CONFIGS: {
    readonly gameActions: {
        readonly name: "game-actions";
        readonly concurrency: 10;
        readonly priority: "high";
    };
    readonly gameCleanup: {
        readonly name: "game-cleanup";
        readonly concurrency: 2;
        readonly priority: "low";
    };
    readonly analyticsEvents: {
        readonly name: "analytics-events";
        readonly concurrency: 5;
        readonly priority: "low";
    };
    readonly maintenance: {
        readonly name: "maintenance";
        readonly concurrency: 1;
        readonly priority: "low";
    };
    readonly mapAssets: {
        readonly name: "map-assets";
        readonly concurrency: 1;
        readonly priority: "low";
    };
};
export interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    isPaused: boolean;
    deadLetter: number;
    stalled: number;
    oldestWaitingMs: number | null;
    avgProcessingMs: number | null;
    lastFailedJob?: {
        id: string | number;
        reason: string;
        failedAt: string;
    };
    warnings: string[];
    events?: {
        completed: number;
        failed: number;
        stalled: number;
    };
    eventsSince?: string;
}
type QueueHealthDisabled = {
    status: 'disabled';
    details: {
        message: string;
        initialized: boolean;
    };
};
type QueueHealthOperational = {
    status: 'healthy' | 'unhealthy';
    details: {
        redis: string;
        queues: Record<string, QueueStats>;
        initialized: boolean;
    };
};
export type QueueHealthResult = QueueHealthOperational | QueueHealthDisabled;
export declare class QueueService {
    private redis;
    private queues;
    private deadLetterQueues;
    private queueDisplayNames;
    private queueEvents;
    private queueEventCounters;
    private eventCountersSince;
    private queueErrorState;
    private isInitialized;
    private readonly queueReadyTimeoutMs;
    private resolveQueue;
    initialize(): Promise<void>;
    addGameAction(job: GameActionJob): Promise<Job<GameActionJob> | null>;
    removeGameActionJob(jobId: string): Promise<boolean>;
    addDelayedGameAction(job: GameActionJob, delayMs: number, options?: {
        idempotencyKey?: string;
        priority?: number;
    }): Promise<Job<GameActionJob> | null>;
    addGameCleanup(job: GameCleanupJob): Promise<Job<GameCleanupJob> | null>;
    changeDelayedGameActionDelay(jobId: string, delayMs: number): Promise<boolean>;
    addAnalyticsEvent(job: {
        event: string;
        gameId: string;
        data: unknown;
    }): Promise<Job | null>;
    addAnalyticsEventsBulk(jobs: Array<{
        event: string;
        gameId: string;
        data: unknown;
    }>): Promise<Array<Pick<Job, 'id' | 'name'>> | null>;
    getQueueStats(): Promise<Record<string, QueueStats>>;
    hasActiveWorkers(queueName: QueueConfigKey): Promise<boolean>;
    private scanForAnyKey;
    private getActionPriority;
    private formatQueueError;
    private shouldLogQueueError;
    private waitForQueueReady;
    private attachQueueEventHandlers;
    private moveToDeadLetter;
    shutdown(): Promise<void>;
    healthCheck(): Promise<QueueHealthResult>;
    listDeadLetters(key: QueueConfigKey, opts?: {
        offset?: number;
        limit?: number;
    }): Promise<Array<{
        id: string;
        failedReason: string;
        failedAt: string;
        jobName: string;
        attemptsMade: number;
    }>>;
    requeueDeadLetter(key: QueueConfigKey, dlqJobId: string | number): Promise<{
        requeued: boolean;
        newJobId?: string | number;
    }>;
    private requireQueue;
    getGameActionQueue(): Queue;
    getCleanupQueue(): Queue<GameCleanupJob>;
    getAnalyticsQueue(): Queue;
    getMaintenanceQueue(): Queue;
    getMapAssetQueue(): Queue;
}
export declare const queueService: QueueService;
export {};
//# sourceMappingURL=queueService.d.ts.map