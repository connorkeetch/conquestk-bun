import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { createRedisFromOptions } from '../utils/redisFactory.js';
const QUEUE_LATENCY_WARNING_MS = 2 * 60 * 1000;
const DEAD_LETTER_TTL_SECONDS = 7 * 24 * 60 * 60;
const QUEUE_CONFIGS = {
    gameActions: {
        name: 'game-actions',
        concurrency: 10,
        priority: 'high',
    },
    gameCleanup: {
        name: 'game-cleanup',
        concurrency: 2,
        priority: 'low',
    },
    analyticsEvents: {
        name: 'analytics-events',
        concurrency: 5,
        priority: 'low',
    },
    maintenance: {
        name: 'maintenance',
        concurrency: 1,
        priority: 'low',
    },
    mapAssets: {
        name: 'map-assets',
        concurrency: 1,
        priority: 'low',
    },
};
export class QueueService {
    redis = null;
    queues = new Map();
    deadLetterQueues = new Map();
    queueDisplayNames = new Map();
    queueEvents = new Map();
    queueEventCounters = new Map();
    eventCountersSince = null;
    queueErrorState = new Map();
    isInitialized = false;
    queueReadyTimeoutMs = Number(process.env.QUEUE_READY_TIMEOUT_MS ?? 15000);
    resolveQueue(key) {
        return this.queues.get(key) ?? null;
    }
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            this.redis = getRedisClient();
            if (!this.redis) {
                logger.warn('Redis not available, QueueService will be disabled');
                return;
            }
            logger.info('QueueService using centralized Redis client with Railway network support');
            const redisClient = this.redis;
            const { commandTimeout: _ignoredCommandTimeout, ..._redisClientOptions } = redisClient.options;
            const bullPrefix = process.env.BULL_PREFIX?.trim() || 'bull';
            for (const [key, config] of Object.entries(QUEUE_CONFIGS)) {
                const defaultJobOptions = config.name === 'analytics-events'
                    ? {
                        removeOnComplete: { age: 600, count: 100 },
                        removeOnFail: { age: 3600, count: 50 },
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 2000 },
                    }
                    : {
                        removeOnComplete: 10,
                        removeOnFail: 5,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 2000 },
                    };
                const queue = new Queue(config.name, {
                    connection: redisClient,
                    prefix: bullPrefix,
                    defaultJobOptions,
                });
                const deadLetterQueue = new Queue(`${config.name}-dead-letter`, {
                    connection: redisClient,
                    prefix: bullPrefix,
                    defaultJobOptions: {
                        removeOnComplete: false,
                        removeOnFail: false,
                        attempts: 1,
                    },
                });
                const queueKey = key;
                this.queues.set(queueKey, queue);
                this.deadLetterQueues.set(queueKey, deadLetterQueue);
                this.queueDisplayNames.set(queueKey, config.name);
                this.attachQueueEventHandlers(queueKey, queue, deadLetterQueue);
                try {
                    await Promise.all([
                        this.waitForQueueReady(queue, config.name),
                        this.waitForQueueReady(deadLetterQueue, `${config.name}-dead-letter`),
                    ]);
                }
                catch (queueReadyError) {
                    const formatted = this.formatQueueError(queueReadyError);
                    logger.error('❌ Queue failed to become ready', {
                        queue: config.name,
                        ...formatted,
                    });
                    throw queueReadyError;
                }
                logger.info(`✅ Queue initialized: ${config.name}`);
            }
            this.isInitialized = true;
            this.eventCountersSince = new Date().toISOString();
            logger.info('✅ QueueService initialized successfully');
        }
        catch (error) {
            logger.error('❌ Failed to initialize QueueService:', error);
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
                logger.warn('QueueService initialization failed but continuing without queues');
            }
            else {
                throw error;
            }
        }
    }
    async addGameAction(job) {
        if (!this.redis || !this.isInitialized) {
            logger.warn('QueueService not available, skipping game action queue');
            return null;
        }
        const queue = this.resolveQueue('gameActions');
        if (!queue)
            throw new Error('Game actions queue not initialized');
        const idempotencyKey = job.idempotencyKey ?? randomUUID();
        const payload = {
            ...job,
            idempotencyKey,
        };
        return queue.add('process-game-action', payload, {
            jobId: idempotencyKey,
            priority: this.getActionPriority(job.action),
            delay: 0,
        });
    }
    async removeGameActionJob(jobId) {
        if (!this.redis || !this.isInitialized) {
            return false;
        }
        const queue = this.resolveQueue('gameActions');
        if (!queue)
            return false;
        try {
            const job = await queue.getJob(jobId);
            if (job) {
                await job.remove();
                return true;
            }
        }
        catch (error) {
            logger.warn('Failed to remove game action job', {
                jobId,
                error: error instanceof Error ? error.message : error,
            });
        }
        return false;
    }
    async addDelayedGameAction(job, delayMs, options) {
        if (!this.redis || !this.isInitialized) {
            logger.warn('QueueService not available, skipping delayed game action');
            return null;
        }
        const queue = this.resolveQueue('gameActions');
        if (!queue)
            throw new Error('Game actions queue not initialized');
        const idempotencyKey = options?.idempotencyKey ?? job.idempotencyKey ?? randomUUID();
        const payload = {
            ...job,
            idempotencyKey,
        };
        return queue.add('process-game-action', payload, {
            jobId: idempotencyKey,
            delay: Math.max(0, Math.trunc(delayMs)),
            attempts: 1,
            removeOnFail: true,
            removeOnComplete: 10,
            priority: options?.priority ?? this.getActionPriority(job.action),
        });
    }
    async addGameCleanup(job) {
        if (!this.redis || !this.isInitialized) {
            logger.warn('QueueService not available, skipping game cleanup queue');
            return null;
        }
        const queue = this.resolveQueue('gameCleanup');
        if (!queue)
            throw new Error('Game cleanup queue not initialized');
        const idempotencyKey = job.idempotencyKey ?? job.gameId;
        const payload = {
            ...job,
            idempotencyKey,
        };
        return queue.add('cleanup-game', payload, {
            jobId: idempotencyKey,
            priority: 1,
            delay: job.reason === 'timeout' ? 30000 : 0,
        });
    }
    async changeDelayedGameActionDelay(jobId, delayMs) {
        if (!this.redis || !this.isInitialized)
            return false;
        const queue = this.resolveQueue('gameActions');
        if (!queue)
            return false;
        try {
            const job = await queue.getJob(jobId);
            if (!job)
                return false;
            await job.changeDelay(Math.max(0, Math.trunc(delayMs)));
            return true;
        }
        catch (e) {
            logger.warn('Failed to change delay for game action job', {
                jobId,
                delayMs,
                error: e instanceof Error ? e.message : e,
            });
            return false;
        }
    }
    async addAnalyticsEvent(job) {
        if (!this.redis || !this.isInitialized) {
            return null;
        }
        const queue = this.resolveQueue('analyticsEvents');
        if (!queue)
            return null;
        try {
            return queue.add('analytics-event', job, { priority: 1 });
        }
        catch {
            return null;
        }
    }
    async addAnalyticsEventsBulk(jobs) {
        if (!this.redis || !this.isInitialized)
            return null;
        const queue = this.resolveQueue('analyticsEvents');
        if (!queue)
            return null;
        try {
            const added = await queue.addBulk(jobs.map((j) => ({ name: 'analytics-event', data: j, opts: { priority: 1 } })));
            return added.map((j) => ({ id: j.id, name: j.name }));
        }
        catch (e) {
            logger.warn('Failed to add analytics events in bulk', {
                count: jobs.length,
                error: e instanceof Error ? e.message : e,
            });
            return null;
        }
    }
    async getQueueStats() {
        const stats = {};
        const now = Date.now();
        for (const [key, queue] of this.queues) {
            const inspectableQueue = queue;
            const [jobCounts, isPaused, waitingJobs, completedJobs, failedJobs] = await Promise.all([
                queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed'),
                queue.isPaused(),
                inspectableQueue.getJobs(['wait'], 0, 19),
                inspectableQueue.getJobs(['completed'], 0, 9),
                inspectableQueue.getJobs(['failed'], 0, 0),
            ]);
            const deadLetterQueue = this.deadLetterQueues.get(key);
            let deadLetterCount = 0;
            if (deadLetterQueue) {
                const deadLetterCounts = await deadLetterQueue.getJobCounts();
                deadLetterCount = Object.values(deadLetterCounts).reduce((sum, count) => {
                    const numeric = typeof count === 'number' ? count : Number(count ?? 0);
                    return sum + numeric;
                }, 0);
            }
            const oldestWaiting = waitingJobs.reduce((max, j) => {
                if (typeof j.timestamp === 'number') {
                    return Math.max(max, now - j.timestamp);
                }
                return max;
            }, 0);
            const completedDurations = completedJobs
                .map((j) => {
                if (typeof j.finishedOn === 'number' && typeof j.processedOn === 'number') {
                    return j.finishedOn - j.processedOn;
                }
                return null;
            })
                .filter((value) => value !== null && value >= 0);
            const avgProcessingMs = completedDurations.length > 0
                ? Math.round(completedDurations.reduce((sum, duration) => sum + duration, 0) /
                    completedDurations.length)
                : null;
            const lastFailedJob = failedJobs[0];
            const lastFailed = lastFailedJob
                ? {
                    id: lastFailedJob.id ?? 'unknown',
                    reason: lastFailedJob.failedReason || 'Unknown failure',
                    failedAt: new Date((lastFailedJob.finishedOn ?? lastFailedJob.processedOn ?? lastFailedJob.timestamp) ||
                        Date.now()).toISOString(),
                }
                : undefined;
            const warnings = [];
            if (isPaused) {
                warnings.push('queue paused');
            }
            if (deadLetterCount > 0) {
                warnings.push(`${deadLetterCount} dead-letter job${deadLetterCount === 1 ? '' : 's'}`);
            }
            if (oldestWaiting > QUEUE_LATENCY_WARNING_MS) {
                const seconds = Math.round(oldestWaiting / 1000);
                warnings.push(`oldest waiting job is ${seconds}s old`);
            }
            const counters = this.queueEventCounters.get(key) ?? {
                completed: 0,
                failed: 0,
                stalled: 0,
            };
            stats[key] = {
                waiting: Number(jobCounts.wait ?? jobCounts.waiting ?? 0),
                active: Number(jobCounts.active ?? 0),
                completed: Number(jobCounts.completed ?? 0),
                failed: Number(jobCounts.failed ?? 0),
                delayed: Number(jobCounts.delayed ?? 0),
                isPaused,
                deadLetter: deadLetterCount,
                stalled: 0,
                oldestWaitingMs: oldestWaiting > 0 ? oldestWaiting : null,
                avgProcessingMs,
                lastFailedJob: lastFailed,
                warnings,
                events: counters,
                eventsSince: this.eventCountersSince ?? undefined,
            };
        }
        return stats;
    }
    async hasActiveWorkers(queueName) {
        if (!this.redis || !this.isInitialized) {
            return false;
        }
        const queue = this.resolveQueue(queueName);
        if (!queue) {
            return false;
        }
        const queueRealName = this.queueDisplayNames.get(queueName) ?? queueName;
        try {
            const prefix = `worker:hb:${queueRealName}:`;
            const hasHb = await this.scanForAnyKey(prefix);
            if (hasHb)
                return true;
        }
        catch (_e) {
        }
        try {
            const completed = await queue.getJobs(['completed'], 0, 1);
            const last = Array.isArray(completed) && completed.length > 0 ? completed[0] : null;
            const finishedOn = (last?.finishedOn ?? last?.processedOn ?? 0);
            if (!finishedOn) {
                return false;
            }
            const RECENT_MS = 30_000;
            return Date.now() - finishedOn < RECENT_MS;
        }
        catch (error) {
            logger.warn('Failed to inspect queue workers', {
                queue: queueRealName,
                error: error instanceof Error ? error.message : error,
            });
            return false;
        }
    }
    async scanForAnyKey(prefix) {
        if (!this.redis)
            return false;
        let cursor = '0';
        do {
            const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
            if (Array.isArray(keys) && keys.length > 0)
                return true;
            cursor = next;
        } while (cursor !== '0');
        return false;
    }
    getActionPriority(action) {
        switch (action.type) {
            case 'end_turn':
                return 10;
            case 'attack':
            case 'fortify':
            case 'transfer_conquest':
                return 7;
            case 'deploy':
                return 5;
            case 'trade_cards':
                return 3;
            case 'go_back_to_reinforcement':
                return 2;
            default:
                return 5;
        }
    }
    formatQueueError(error) {
        if (error instanceof Error) {
            const nodeError = error;
            return {
                message: nodeError.message,
                code: nodeError.code ? String(nodeError.code) : undefined,
                name: nodeError.name,
                stack: nodeError.stack,
                errno: nodeError.errno,
                address: nodeError.address,
                port: nodeError.port,
            };
        }
        return {
            message: typeof error === 'string' ? error : JSON.stringify(error),
        };
    }
    shouldLogQueueError(queueName, message) {
        const now = Date.now();
        const existing = this.queueErrorState.get(queueName);
        if (!existing || existing.message !== message) {
            this.queueErrorState.set(queueName, {
                message,
                lastLoggedAt: now,
                occurrences: 1,
            });
            return { logNow: true, occurrences: 1, lastLoggedAt: now };
        }
        const occurrences = existing.occurrences + 1;
        const quietWindowMs = 30000;
        const shouldLogRepeat = occurrences % 10 === 0 || now - existing.lastLoggedAt > quietWindowMs;
        this.queueErrorState.set(queueName, {
            message,
            lastLoggedAt: shouldLogRepeat ? now : existing.lastLoggedAt,
            occurrences,
        });
        return {
            logNow: shouldLogRepeat,
            occurrences,
            lastLoggedAt: shouldLogRepeat ? now : existing.lastLoggedAt,
        };
    }
    async waitForQueueReady(queue, name) {
        const waitUntilReady = queue
            .waitUntilReady;
        const readinessPromise = (waitUntilReady ? waitUntilReady.call(queue) : Promise.resolve()).then(() => undefined);
        const timeoutPromise = new Promise((_, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Queue ${name} readiness timed out after ${this.queueReadyTimeoutMs}ms`));
            }, this.queueReadyTimeoutMs);
            readinessPromise
                .finally(() => clearTimeout(timer))
                .catch(() => {
            });
        });
        await Promise.race([readinessPromise, timeoutPromise]);
    }
    attachQueueEventHandlers(queueKey, queue, deadLetterQueue) {
        try {
            const baseOpts = (this.redis?.options ?? {});
            const eventsConn = createRedisFromOptions({
                ...baseOpts,
                enableReadyCheck: false,
                lazyConnect: false,
                maxRetriesPerRequest: null,
                commandTimeout: undefined,
            });
            const bullPrefix = process.env.BULL_PREFIX?.trim() || 'bull';
            const events = new QueueEvents(queue.name, {
                connection: eventsConn,
                prefix: bullPrefix,
            });
            events.on('failed', async ({ jobId, failedReason }) => {
                try {
                    const job = jobId ? await queue.getJob(jobId) : null;
                    if (!job)
                        return;
                    const attemptsMade = job.attemptsMade ?? 0;
                    const opts = job.opts;
                    const maxAttempts = typeof opts?.attempts === 'number' && opts.attempts > 0 ? opts.attempts : 1;
                    if (attemptsMade >= maxAttempts) {
                        await this.moveToDeadLetter(queueKey, deadLetterQueue, job, failedReason);
                    }
                }
                catch (deadLetterError) {
                    logger.error('❌ Failed handling failed event for DLQ', {
                        queue: queue.name,
                        jobId,
                        error: deadLetterError,
                    });
                }
            });
            events.on('error', (err) => {
                logger.warn('QueueEvents error', {
                    queue: queue.name,
                    error: err instanceof Error ? err.message : err,
                });
            });
            this.queueEvents.set(queueKey, events);
        }
        catch (e) {
            logger.warn('Failed to attach QueueEvents for queue', {
                queue: queue.name,
                error: e instanceof Error ? e.message : e,
            });
        }
        ;
        queue.on?.('error', (queueError) => {
            const normalized = this.formatQueueError(queueError);
            const { logNow, occurrences } = this.shouldLogQueueError(queue.name, normalized.message);
            if (!logNow) {
                logger.debug('Suppressed repetitive queue error', {
                    queue: queue.name,
                    message: normalized.message,
                    occurrences,
                });
                return;
            }
            logger.error('❌ Queue error detected', {
                queue: queue.name,
                ...normalized,
                occurrences,
            });
        });
    }
    async moveToDeadLetter(queueKey, deadLetterQueue, job, error) {
        const queueName = this.queueDisplayNames.get(queueKey) ?? String(queueKey);
        const payload = {
            originalQueue: queueName,
            jobId: job.id ?? null,
            jobName: job.name || 'unnamed-job',
            attemptsMade: job.attemptsMade ?? 0,
            failedReason: job.failedReason || (error instanceof Error ? error.message : 'Unknown failure reason'),
            failedAt: new Date().toISOString(),
            data: job.data,
            stacktrace: job.stacktrace,
        };
        await deadLetterQueue.add('dead-letter', payload, {
            jobId: `${job.id ?? randomUUID()}::${Date.now()}`,
            removeOnComplete: false,
            removeOnFail: false,
            attempts: 1,
            delay: 0,
            lifo: true,
        });
        await deadLetterQueue.clean(DEAD_LETTER_TTL_SECONDS * 1000, 1000, 'completed');
        await deadLetterQueue.clean(DEAD_LETTER_TTL_SECONDS * 1000, 1000, 'failed');
        logger.warn('Moved job to dead-letter queue', {
            queue: queueName,
            jobId: job.id,
            attemptsMade: job.attemptsMade,
        });
    }
    async shutdown() {
        logger.info('🔄 Shutting down QueueService...');
        const activeQueues = Array.from(this.queues.values());
        const deadLetterQueues = Array.from(this.deadLetterQueues.values());
        const events = Array.from(this.queueEvents.values());
        await Promise.all([
            ...[...activeQueues, ...deadLetterQueues].map((queue) => queue.close()),
            ...events.map((ev) => ev.close()),
        ]);
        if (this.redis) {
            logger.info('QueueService shutdown - Redis connection managed by central config');
        }
        this.isInitialized = false;
        logger.info('✅ QueueService shutdown complete');
    }
    async healthCheck() {
        try {
            if (!this.redis) {
                return {
                    status: 'disabled',
                    details: {
                        message: 'Redis not available, queue service disabled',
                        initialized: this.isInitialized,
                    },
                };
            }
            const pingResult = await this.redis.ping();
            const stats = await this.getQueueStats();
            const hasWarnings = Object.values(stats).some((queueStats) => queueStats.warnings.length > 0);
            return {
                status: pingResult === 'PONG' && !hasWarnings ? 'healthy' : 'unhealthy',
                details: {
                    redis: pingResult,
                    queues: stats,
                    initialized: this.isInitialized,
                },
            };
        }
        catch (error) {
            logger.error('❌ QueueService health check failed', error);
            return {
                status: 'unhealthy',
                details: {
                    redis: 'ERROR',
                    queues: {},
                    initialized: this.isInitialized,
                },
            };
        }
    }
    async listDeadLetters(key, opts) {
        const dlq = this.deadLetterQueues.get(key);
        if (!dlq)
            return [];
        const offset = Math.max(0, Math.trunc(opts?.offset ?? 0));
        const limit = Math.max(1, Math.min(200, Math.trunc(opts?.limit ?? 50)));
        const end = offset + limit - 1;
        const jobs = await dlq.getJobs(['wait', 'delayed'], offset, end);
        return jobs
            .map((j) => {
            const data = j.data;
            const failedAt = data?.failedAt || new Date().toISOString();
            const failedReason = data?.failedReason || 'Unknown';
            return {
                id: String(j.id ?? ''),
                failedReason,
                failedAt: String(failedAt),
                jobName: data?.jobName || 'unknown',
                attemptsMade: typeof data?.attemptsMade === 'number' ? data.attemptsMade : 0,
            };
        })
            .filter((row) => row.id.length > 0);
    }
    async requeueDeadLetter(key, dlqJobId) {
        const dlq = this.deadLetterQueues.get(key);
        const queue = this.queues.get(key);
        if (!dlq || !queue)
            return { requeued: false };
        const job = await dlq.getJob(String(dlqJobId));
        if (!job)
            return { requeued: false };
        const payload = job.data;
        try {
            const added = await queue.add(payload.jobName || 'requeued-job', payload.data, {
                removeOnComplete: 10,
                removeOnFail: 5,
                attempts: 1,
                priority: 1,
            });
            await job.remove();
            return { requeued: true, newJobId: added.id };
        }
        catch (e) {
            logger.warn('Failed to requeue DLQ job', {
                queue: queue.name,
                dlqJobId,
                error: e instanceof Error ? e.message : e,
            });
            return { requeued: false };
        }
    }
    requireQueue(name) {
        const queue = this.queues.get(name);
        if (!queue) {
            throw new Error(`Queue ${name} not found. Make sure initialize() was called first.`);
        }
        return queue;
    }
    getGameActionQueue() {
        return this.requireQueue('gameActions');
    }
    getCleanupQueue() {
        return this.requireQueue('gameCleanup');
    }
    getAnalyticsQueue() {
        return this.requireQueue('analyticsEvents');
    }
    getMaintenanceQueue() {
        return this.requireQueue('maintenance');
    }
    getMapAssetQueue() {
        return this.requireQueue('mapAssets');
    }
}
export const queueService = new QueueService();
//# sourceMappingURL=queueService.js.map