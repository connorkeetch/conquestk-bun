import { Worker } from 'bullmq';
import { CacheService } from '../services/cacheService.js';
import { GameRoomService } from '../services/gameRoomService.js';
import { GameService } from '../services/gameService.js';
import { jobIdempotencyService } from '../services/jobIdempotencyService.js';
import { queueService } from '../services/queueService.js';
import territoryModifierService from '../services/territoryModifierService.js';
import { startWorkerHeartbeat } from '../services/workerHeartbeat.js';
import { logger } from '../utils/logger.js';
export class CleanupWorker {
    worker = null;
    queueName;
    gameService;
    cacheService;
    idempotencyService;
    gameRoomService;
    constructor(dependencies = {}) {
        this.gameService = dependencies.gameService ?? new GameService();
        this.cacheService = dependencies.cacheService ?? new CacheService();
        this.queueName =
            dependencies?.queue?.name ??
                queueService.getCleanupQueue().name;
        this.idempotencyService = dependencies.idempotencyService ?? jobIdempotencyService;
        this.gameRoomService = new GameRoomService();
    }
    async initialize() {
        {
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
            this.worker = new Worker(this.queueName, async (job) => this.cleanupGame(job), {
                concurrency: 2,
                connection,
            });
        }
        this.worker.on('completed', (job, result) => {
            logger.info('🧹 Game cleanup job completed', {
                jobId: job.id,
                result,
            });
        });
        this.worker.on('failed', (job, error) => {
            logger.error('❌ Game cleanup job failed', {
                jobId: job?.id,
                error,
            });
        });
        startWorkerHeartbeat(this.queueName);
        setInterval(() => this.scheduleAbandonedGameCleanup(), 5 * 60 * 1000);
        setInterval(() => this.pruneStaleLobbies(), 6 * 60 * 60 * 1000);
        logger.info('✅ CleanupWorker initialized');
    }
    async pruneStaleLobbies() {
        try {
            const deleted = await this.gameRoomService.pruneStaleRooms();
            if (deleted > 0) {
                logger.info('🗑️ Pruned stale lobbies', { count: deleted });
            }
        }
        catch (error) {
            logger.error('❌ Failed to prune stale lobbies', { error });
        }
    }
    async cleanupGame(job) {
        const { gameId, reason, idempotencyKey } = job.data;
        const idKey = idempotencyKey ?? (job.id !== undefined ? String(job.id) : gameId);
        const existing = await this.idempotencyService.getProcessedJob(this.queueName, idKey);
        if (existing.exists && existing.value) {
            logger.info('♻️ Skipping already processed cleanup job', {
                jobId: job.id,
                gameId,
            });
            return existing.value;
        }
        try {
            logger.info('🧹 Cleaning up game', { gameId, reason });
            const gameState = await this.gameService.getGameState(gameId);
            if (!gameState) {
                logger.info('Cleanup skipped because game state already absent', { gameId });
                const result = { success: true, alreadyClean: true };
                await this.idempotencyService.markProcessedJob(this.queueName, idKey, result, 24 * 60 * 60);
                return result;
            }
            const cleanupState = gameState;
            switch (reason) {
                case 'finished':
                    await this.cleanupFinishedGame(gameId, cleanupState);
                    break;
                case 'timeout':
                    await this.cleanupTimedOutGame(gameId, cleanupState);
                    break;
                case 'abandoned':
                    await this.cleanupAbandonedGame(gameId, cleanupState);
                    break;
                default:
                    logger.warn('Unknown cleanup reason received', { gameId, reason });
            }
            await this.performCommonCleanup(gameId);
            logger.info('✅ Game cleanup completed', { gameId, reason });
            const result = {
                success: true,
                reason,
                cleanedAt: new Date().toISOString(),
            };
            await this.idempotencyService.markProcessedJob(this.queueName, idKey, result, 24 * 60 * 60);
            return result;
        }
        catch (error) {
            logger.error('❌ Failed to cleanup game', {
                gameId,
                reason,
                error,
            });
            await this.idempotencyService
                .clearProcessedJob(this.queueName, idKey)
                .catch((cleanupError) => {
                logger.warn('Failed to clear idempotency state after cleanup failure', {
                    gameId,
                    error: cleanupError,
                });
            });
            throw error;
        }
    }
    async cleanupFinishedGame(gameId, gameState) {
        const duration = this.getGameDuration(gameState);
        const winnerId = 'winner' in gameState ? (gameState.winner ?? null) : null;
        await this.gameService.archiveGameResults(gameId, {
            winner: winnerId,
            endReason: 'finished',
            duration: duration ?? 0,
            playerStats: this.calculatePlayerStats(gameState),
        });
        if (gameState.isRanked) {
            await this.gameService.updateEloRatings(gameId, gameState);
        }
        await this.gameService.recordGameHistory(gameId, gameState);
    }
    async cleanupTimedOutGame(gameId, gameState) {
        const territoryCount = this.countTerritoriesByPlayer(gameState.board);
        const [leadingEntry] = Object.entries(territoryCount).sort(([, a], [, b]) => b - a);
        const winner = leadingEntry?.[0] ?? null;
        const duration = this.getGameDuration(gameState);
        await this.gameService.archiveGameResults(gameId, {
            winner,
            endReason: 'timeout',
            duration: duration ?? 0,
            playerStats: this.calculatePlayerStats(gameState),
        });
        if (gameState.isRanked && winner) {
            await this.gameService.updateEloRatings(gameId, {
                ...gameState,
                winner,
                isTimeout: true,
            });
        }
    }
    async cleanupAbandonedGame(gameId, gameState) {
        const duration = this.getGameDuration(gameState);
        await this.gameService.archiveGameResults(gameId, {
            winner: null,
            endReason: 'abandoned',
            duration: duration ?? 0,
            playerStats: this.calculatePlayerStats(gameState),
        });
        logger.info('Game marked as abandoned without ELO changes', { gameId });
    }
    async performCommonCleanup(gameId) {
        await this.cacheService.deleteGameState(gameId);
        try {
            await territoryModifierService.cleanupFinishedGameModifiers([gameId]);
        }
        catch (error) {
            logger.warn('Failed to clean up territory modifiers for game', {
                gameId,
                error,
            });
        }
        try {
            const { archived } = await this.gameService.archiveGameMoves(gameId);
            if (archived > 0) {
                logger.info('Archived game moves during cleanup', { gameId, archived });
            }
        }
        catch (error) {
            logger.warn('Failed to archive game moves during cleanup', {
                gameId,
                error,
            });
        }
        await this.cleanupTempResources(gameId);
        await this.gameService.removeFromActiveGames(gameId);
    }
    async cleanupTempResources(gameId) {
        logger.debug('Cleaned temporary resources for game', { gameId });
    }
    calculatePlayerStats(gameState) {
        const stats = {};
        for (const player of gameState.players) {
            const territories = gameState.board.filter((territory) => this.getTerritoryOwnerId(territory) === player.id);
            const totalArmies = territories.reduce((sum, territory) => sum + territory.armies, 0);
            const turnsPlayedRaw = player.turnsPlayed;
            const turnsPlayed = typeof turnsPlayedRaw === 'number' ? turnsPlayedRaw : 0;
            stats[player.id] = {
                territoriesControlled: territories.length,
                totalArmies,
                turnsPlayed,
                eliminated: territories.length === 0,
            };
        }
        return stats;
    }
    countTerritoriesByPlayer(board) {
        const counts = {};
        for (const territory of board) {
            const ownerId = this.getTerritoryOwnerId(territory);
            if (!ownerId) {
                continue;
            }
            counts[ownerId] = (counts[ownerId] || 0) + 1;
        }
        return counts;
    }
    getTerritoryOwnerId(territory) {
        if (typeof territory.owner === 'string' && territory.owner.length > 0) {
            return territory.owner;
        }
        return territory.ownerId ?? null;
    }
    getGameDuration(gameState) {
        const { startTime } = gameState;
        if (!startTime) {
            return undefined;
        }
        if (typeof startTime === 'number') {
            return Date.now() - startTime;
        }
        if (startTime instanceof Date) {
            return Date.now() - startTime.getTime();
        }
        const parsed = Date.parse(startTime);
        if (!Number.isNaN(parsed)) {
            return Date.now() - parsed;
        }
        return undefined;
    }
    async scheduleAbandonedGameCleanup() {
        try {
            const abandonedGames = await this.gameService.findAbandonedGames(30 * 60 * 1000);
            for (const gameId of abandonedGames) {
                logger.info('📅 Scheduling cleanup for abandoned game', { gameId });
                await queueService.addGameCleanup({
                    gameId,
                    reason: 'abandoned',
                });
            }
            if (abandonedGames.length > 0) {
                logger.info('📅 Scheduled cleanup for abandoned games', {
                    count: abandonedGames.length,
                });
            }
        }
        catch (error) {
            logger.error('❌ Failed to schedule abandoned game cleanup', { error });
        }
    }
}
export const createCleanupWorker = () => new CleanupWorker();
//# sourceMappingURL=cleanupWorker.js.map