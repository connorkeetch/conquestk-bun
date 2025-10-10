import { Worker } from 'bullmq';
import { maintenanceService } from '../services/maintenanceService.js';
import { queueService } from '../services/queueService.js';
import { logger } from '../utils/logger.js';
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
export class MaintenanceWorker {
    constructor() {
        this.timer = null;
        this.leaderboardTimer = null;
        this.worker = null;
    }
    async initialize() {
        const intervalMs = getIntervalMs();
        const retentionDays = getNotificationRetentionDays();
        const includeUnread = getIncludeUnread();
        const moveArchiveBatchSize = getMoveArchiveBatchSize();
        logger.info('🧹 Initializing MaintenanceWorker', {
            intervalMs,
            retentionDays,
            includeUnread,
            moveArchiveBatchSize,
        });
        try {
            const queue = queueService.getMaintenanceQueue();
            await queue.upsertJobScheduler('maintenance:prune', {
                every: intervalMs,
            });
            await queue.upsertJobScheduler('maintenance:refresh-skill-leaderboard', { cron: '0 4 * * *' });
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
                switch (job.name) {
                    case 'maintenance:prune':
                        await this.runOnce('interval');
                        return { ok: true };
                    case 'maintenance:refresh-skill-leaderboard':
                        await maintenanceService.refreshSkillLeaderboardCache();
                        return { ok: true };
                    default:
                        return null;
                }
            }, {
                connection,
            });
        }
        catch (e) {
            logger.warn('Failed to initialize maintenance scheduler; falling back to setInterval', {
                error: e instanceof Error ? e.message : e,
            });
            if (intervalMs > 0) {
                this.timer = setInterval(() => {
                    this.runOnce('interval').catch((error) => {
                        logger.error('❌ Scheduled maintenance prune failed', { error });
                    });
                }, intervalMs);
            }
            const ONE_DAY_MS = 24 * 60 * 60 * 1000;
            this.leaderboardTimer = setTimeout(() => {
                maintenanceService
                    .refreshSkillLeaderboardCache()
                    .catch((error) => logger.warn('Failed to refresh leaderboard cache (fallback)', { error }));
                this.leaderboardTimer = setInterval(() => {
                    maintenanceService
                        .refreshSkillLeaderboardCache()
                        .catch((error) => logger.warn('Failed to refresh leaderboard cache (interval fallback)', { error }));
                }, ONE_DAY_MS);
            }, 60 * 60 * 1000);
        }
        this.runOnce('startup').catch((error) => {
            logger.error('❌ Initial maintenance prune failed', { error });
        });
        logger.info('✅ MaintenanceWorker initialized');
    }
    async runOnce(source) {
        const retentionDays = getNotificationRetentionDays();
        const includeUnread = getIncludeUnread();
        const moveArchiveBatchSize = getMoveArchiveBatchSize();
        logger.info('🧹 Running maintenance prune', {
            source,
            retentionDays,
            includeUnread,
            moveArchiveBatchSize,
        });
        const [notifSummary, tokenSummary, archiveSummary] = await Promise.all([
            maintenanceService.pruneNotifications({ retentionDays, includeUnread }),
            maintenanceService.prunePasswordResetTokens(),
            maintenanceService.archiveCompletedGameMoves({ gameLimit: moveArchiveBatchSize }),
        ]);
        const summary = {
            notifications: notifSummary,
            passwordResetTokens: tokenSummary,
            archivedMoves: archiveSummary,
        };
        logger.info('🧹 Maintenance prune complete', { source, summary });
        return summary;
    }
    shutdown() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.leaderboardTimer) {
            clearInterval(this.leaderboardTimer);
            this.leaderboardTimer = null;
        }
        if (this.worker) {
            this.worker
                .close()
                .catch((e) => logger.warn('Failed to close Maintenance worker', { error: String(e) }));
            this.worker = null;
        }
    }
}
export const createMaintenanceWorker = () => new MaintenanceWorker();
//# sourceMappingURL=maintenanceWorker.js.map