"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMaintenanceWorker = exports.MaintenanceWorker = void 0;
const bullmq_1 = require("bullmq");
const maintenanceService_js_1 = require("../services/maintenanceService.js");
const queueService_js_1 = require("../services/queueService.js");
const logger_js_1 = require("../utils/logger.js");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_MS = ONE_DAY_MS;
const DEFAULT_WEEKLY_MS = 7 * ONE_DAY_MS;
const DEFAULT_ARCHIVE_BATCH = 25;
function getIntervalMs() {
    const value = process.env.MAINTENANCE_PRUNE_INTERVAL_MS;
    if (!value)
        return DEFAULT_WEEKLY_MS;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_MS;
}
function getNotificationRetentionDays() {
    const value = process.env.NOTIFICATION_RETENTION_DAYS;
    if (!value)
        return 60;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}
function getIncludeUnread() {
    const value = (process.env.PRUNE_NOTIFICATIONS_INCLUDE_UNREAD || '').toLowerCase().trim();
    if (value === '1' || value === 'true' || value === 'yes')
        return true;
    return false;
}
function getMoveArchiveBatchSize() {
    const value = process.env.GAME_MOVE_ARCHIVE_BATCH_SIZE;
    if (!value)
        return DEFAULT_ARCHIVE_BATCH;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ARCHIVE_BATCH;
}
class MaintenanceWorker {
    constructor() {
        this.timer = null;
        this.worker = null;
    }
    async initialize() {
        const intervalMs = getIntervalMs();
        const retentionDays = getNotificationRetentionDays();
        const includeUnread = getIncludeUnread();
        const moveArchiveBatchSize = getMoveArchiveBatchSize();
        logger_js_1.logger.info('🧹 Initializing MaintenanceWorker', {
            intervalMs,
            retentionDays,
            includeUnread,
            moveArchiveBatchSize,
        });
        try {
            const queue = queueService_js_1.queueService.getMaintenanceQueue();
            await queue.upsertJobScheduler('maintenance:prune', {
                every: intervalMs,
            });
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
                if (job.name && job.name !== 'maintenance:prune')
                    return null;
                await this.runOnce('interval');
                return { ok: true };
            }, {
                connection,
            });
        }
        catch (e) {
            logger_js_1.logger.warn('Failed to initialize maintenance scheduler; falling back to setInterval', {
                error: e instanceof Error ? e.message : e,
            });
            if (intervalMs > 0) {
                this.timer = setInterval(() => {
                    this.runOnce('interval').catch((error) => {
                        logger_js_1.logger.error('❌ Scheduled maintenance prune failed', { error });
                    });
                }, intervalMs);
            }
        }
        this.runOnce('startup').catch((error) => {
            logger_js_1.logger.error('❌ Initial maintenance prune failed', { error });
        });
        logger_js_1.logger.info('✅ MaintenanceWorker initialized');
    }
    async runOnce(source) {
        const retentionDays = getNotificationRetentionDays();
        const includeUnread = getIncludeUnread();
        const moveArchiveBatchSize = getMoveArchiveBatchSize();
        logger_js_1.logger.info('🧹 Running maintenance prune', {
            source,
            retentionDays,
            includeUnread,
            moveArchiveBatchSize,
        });
        const [notifSummary, tokenSummary, archiveSummary] = await Promise.all([
            maintenanceService_js_1.maintenanceService.pruneNotifications({ retentionDays, includeUnread }),
            maintenanceService_js_1.maintenanceService.prunePasswordResetTokens(),
            maintenanceService_js_1.maintenanceService.archiveCompletedGameMoves({ gameLimit: moveArchiveBatchSize }),
        ]);
        const summary = {
            notifications: notifSummary,
            passwordResetTokens: tokenSummary,
            archivedMoves: archiveSummary,
        };
        logger_js_1.logger.info('🧹 Maintenance prune complete', { source, summary });
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
                .catch((e) => logger_js_1.logger.warn('Failed to close Maintenance worker', { error: String(e) }));
            this.worker = null;
        }
    }
}
exports.MaintenanceWorker = MaintenanceWorker;
const createMaintenanceWorker = () => new MaintenanceWorker();
exports.createMaintenanceWorker = createMaintenanceWorker;
//# sourceMappingURL=maintenanceWorker.js.map