"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnalyticsWorker = exports.AnalyticsWorker = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const redis_js_1 = require("../config/redis.js");
const gameService_js_1 = require("../services/gameService.js");
const queueService_js_1 = require("../services/queueService.js");
const workerHeartbeat_js_1 = require("../services/workerHeartbeat.js");
const logger_js_1 = require("../utils/logger.js");
class AnalyticsWorker {
    constructor() {
        this.worker = null;
        this.gameService = new gameService_js_1.GameService();
    }
    async initialize() {
        const queueName = queueService_js_1.queueService.getAnalyticsQueue().name;
        this.worker = new bullmq_1.Worker(queueName, async (job) => {
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
                    logger_js_1.logger.warn('Unknown analytics event', { event });
                }
            }
            catch (error) {
                logger_js_1.logger.warn('Failed to process analytics-event', {
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
                const redis = (0, redis_js_1.getRedisClient)();
                const baseOpts = (redis?.options ?? {});
                return new ioredis_1.default({
                    ...baseOpts,
                    enableReadyCheck: false,
                    lazyConnect: false,
                    maxRetriesPerRequest: null,
                    commandTimeout: undefined,
                });
            })(),
        });
        this.worker.on('completed', (job) => {
            logger_js_1.logger.debug('📈 Analytics job completed', { jobId: job.id });
        });
        this.worker.on('failed', (job, error) => {
            logger_js_1.logger.warn('📉 Analytics job failed', {
                jobId: job?.id,
                error: error instanceof Error ? error.message : error,
            });
        });
        (0, workerHeartbeat_js_1.startWorkerHeartbeat)(queueName);
        logger_js_1.logger.info('✅ AnalyticsWorker initialized');
    }
}
exports.AnalyticsWorker = AnalyticsWorker;
const createAnalyticsWorker = () => new AnalyticsWorker();
exports.createAnalyticsWorker = createAnalyticsWorker;
//# sourceMappingURL=analyticsWorker.js.map