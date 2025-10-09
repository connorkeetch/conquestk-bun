import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { getRedisClient } from '../config/redis.js';
import { GameService } from '../services/gameService.js';
import { queueService } from '../services/queueService.js';
import { startWorkerHeartbeat } from '../services/workerHeartbeat.js';
import { logger } from '../utils/logger.js';
export class AnalyticsWorker {
    constructor() {
        this.worker = null;
        this.gameService = new GameService();
    }
    async initialize() {
        const queueName = queueService.getAnalyticsQueue().name;
        this.worker = new Worker(queueName, async (job) => {
            const { event, gameId, data } = job.data;
            try {
                if (event === 'append_log') {
                    const entries = Array.isArray(data) ? data : [];
                    await this.gameService.appendLog(gameId, entries);
                }
                else if (event === 'append_turn_stats') {
                    await this.gameService.appendTurnStats(gameId, data);
                }
                else {
                    logger.warn('Unknown analytics event', { event });
                }
            }
            catch (error) {
                logger.warn('Failed to process analytics-event', {
                    event,
                    gameId,
                    error: error instanceof Error ? error.message : error,
                });
                throw error;
            }
        }, {
            concurrency: 5,
            limiter: {
                max: 50,
                duration: 1000,
            },
            connection: (() => {
                const redis = getRedisClient();
                const baseOpts = (redis?.options ?? {});
                return new Redis({
                    ...baseOpts,
                    enableReadyCheck: false,
                    lazyConnect: false,
                    maxRetriesPerRequest: null,
                    commandTimeout: undefined,
                });
            })(),
        });
        this.worker.on('completed', (job) => {
            logger.debug('📈 Analytics job completed', { jobId: job.id });
        });
        this.worker.on('failed', (job, error) => {
            logger.warn('📉 Analytics job failed', {
                jobId: job?.id,
                error: error instanceof Error ? error.message : error,
            });
        });
        startWorkerHeartbeat(queueName);
        logger.info('✅ AnalyticsWorker initialized');
    }
}
export const createAnalyticsWorker = () => new AnalyticsWorker();
//# sourceMappingURL=analyticsWorker.js.map