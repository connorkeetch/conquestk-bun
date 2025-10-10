import { Worker } from 'bullmq';
import { mapStagingService } from '../services/mapStagingService.js';
import { queueService } from '../services/queueService.js';
import { logger } from '../utils/logger.js';
const DEFAULT_INTERVAL_MS = Number(process.env.MAP_ASSET_PURGE_INTERVAL_MS ?? 15 * 60 * 1000);
export class MapAssetWorker {
    timer = null;
    worker = null;
    async initialize() {
        logger.info('🧹 Initializing MapAssetWorker', {
            intervalMs: DEFAULT_INTERVAL_MS,
        });
        this.runOnce('startup').catch((error) => {
            logger.error('❌ Initial map asset purge failed', { error });
        });
        try {
            const queue = queueService.getMapAssetQueue();
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
            this.worker = new Worker(queue.name, async (job) => {
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
            logger.warn('Failed to initialize map-assets scheduler; falling back to setInterval', {
                error: e instanceof Error ? e.message : e,
            });
            if (DEFAULT_INTERVAL_MS > 0) {
                this.timer = setInterval(() => {
                    this.runOnce('interval').catch((error) => {
                        logger.error('❌ Scheduled map asset purge failed', { error });
                    });
                }, DEFAULT_INTERVAL_MS);
            }
        }
        logger.info('✅ MapAssetWorker initialized');
    }
    async runOnce(source, overrides) {
        logger.info('🧹 Running map asset purge', { source, overrides });
        const summary = await mapStagingService.purgeDeletedImages({
            batchSize: overrides?.batchSize,
            minAgeMinutes: overrides?.minAgeMinutes,
        });
        logger.info('🧹 Map asset purge complete', { source, summary });
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
                .catch((e) => logger.warn('Failed to close MapAsset worker', { error: String(e) }));
            this.worker = null;
        }
    }
}
export const createMapAssetWorker = () => new MapAssetWorker();
//# sourceMappingURL=mapAssetWorker.js.map