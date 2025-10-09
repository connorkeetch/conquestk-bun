"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMapAssetWorker = exports.MapAssetWorker = void 0;
const bullmq_1 = require("bullmq");
const mapStagingService_js_1 = require("../services/mapStagingService.js");
const queueService_js_1 = require("../services/queueService.js");
const logger_js_1 = require("../utils/logger.js");
const DEFAULT_INTERVAL_MS = Number(process.env.MAP_ASSET_PURGE_INTERVAL_MS ?? 15 * 60 * 1000);
class MapAssetWorker {
    constructor() {
        this.timer = null;
        this.worker = null;
    }
    async initialize() {
        logger_js_1.logger.info('🧹 Initializing MapAssetWorker', {
            intervalMs: DEFAULT_INTERVAL_MS,
        });
        this.runOnce('startup').catch((error) => {
            logger_js_1.logger.error('❌ Initial map asset purge failed', { error });
        });
        try {
            const queue = queueService_js_1.queueService.getMapAssetQueue();
            await queue.upsertJobScheduler('map-assets:purge', { every: DEFAULT_INTERVAL_MS });
            const Redis = (await import('ioredis')).default;
            const redis = (await import('../config/redis.js')).getRedisClient();
            const baseOpts = (redis?.options ?? {});
            const connection = new Redis({
                ...baseOpts,
                enableReadyCheck: false,
                lazyConnect: false,
                maxRetriesPerRequest: null,
                commandTimeout: undefined,
            });
            this.worker = new bullmq_1.Worker(queue.name, async (job) => {
                if (job.name && job.name !== 'map-assets:purge')
                    return null;
                await this.runOnce('interval', {
                    batchSize: job.data?.batchSize,
                    minAgeMinutes: job.data?.minAgeMinutes,
                });
                return { ok: true };
            }, { connection });
        }
        catch (e) {
            logger_js_1.logger.warn('Failed to initialize map-assets scheduler; falling back to setInterval', {
                error: e instanceof Error ? e.message : e,
            });
            if (DEFAULT_INTERVAL_MS > 0) {
                this.timer = setInterval(() => {
                    this.runOnce('interval').catch((error) => {
                        logger_js_1.logger.error('❌ Scheduled map asset purge failed', { error });
                    });
                }, DEFAULT_INTERVAL_MS);
            }
        }
        logger_js_1.logger.info('✅ MapAssetWorker initialized');
    }
    async runOnce(source, overrides) {
        logger_js_1.logger.info('🧹 Running map asset purge', { source, overrides });
        const summary = await mapStagingService_js_1.mapStagingService.purgeDeletedImages({
            batchSize: overrides?.batchSize,
            minAgeMinutes: overrides?.minAgeMinutes,
        });
        logger_js_1.logger.info('🧹 Map asset purge complete', { source, summary });
        return summary;
    }
    shutdown() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.worker) {
            this.worker
                .close()
                .catch((e) => logger_js_1.logger.warn('Failed to close MapAsset worker', { error: String(e) }));
            this.worker = null;
        }
    }
}
exports.MapAssetWorker = MapAssetWorker;
const createMapAssetWorker = () => new MapAssetWorker();
exports.createMapAssetWorker = createMapAssetWorker;
//# sourceMappingURL=mapAssetWorker.js.map