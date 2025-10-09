"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCleanupWorker = exports.CleanupWorker = void 0;
const bullmq_1 = require("bullmq");
const cacheService_js_1 = require("../services/cacheService.js");
const gameRoomService_js_1 = require("../services/gameRoomService.js");
const gameService_js_1 = require("../services/gameService.js");
const jobIdempotencyService_js_1 = require("../services/jobIdempotencyService.js");
const queueService_js_1 = require("../services/queueService.js");
const territoryModifierService_js_1 = __importDefault(require("../services/territoryModifierService.js"));
const workerHeartbeat_js_1 = require("../services/workerHeartbeat.js");
const logger_js_1 = require("../utils/logger.js");
class CleanupWorker {
    constructor(dependencies = {}) {
        this.worker = null;
        this.gameService = dependencies.gameService ?? new gameService_js_1.GameService();
        this.cacheService = dependencies.cacheService ?? new cacheService_js_1.CacheService();
        this.queueName =
            dependencies?.queue?.name ??
                queueService_js_1.queueService.getCleanupQueue().name;
        this.idempotencyService = dependencies.idempotencyService ?? jobIdempotencyService_js_1.jobIdempotencyService;
        this.gameRoomService = new gameRoomService_js_1.GameRoomService();
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
            this.worker = new bullmq_1.Worker(this.queueName, async (job) => this.cleanupGame(job), {
                concurrency: 2,
                connection,
            });
        }
        this.worker.on('completed', (job, result) => {
            logger_js_1.logger.info('🧹 Game cleanup job completed', {
                jobId: job.id,
                result,
            });
        });
        this.worker.on('failed', (job, error) => {
            logger_js_1.logger.error('❌ Game cleanup job failed', {
                jobId: job?.id,
                error,
            });
        });
        (0, workerHeartbeat_js_1.startWorkerHeartbeat)(this.queueName);
        setInterval(() => this.scheduleAbandonedGameCleanup(), 5 * 60 * 1000);
        setInterval(() => this.pruneStaleLobbies(), 6 * 60 * 60 * 1000);
        logger_js_1.logger.info('✅ CleanupWorker initialized');
    }
    async pruneStaleLobbies() {
        try {
            const deleted = await this.gameRoomService.pruneStaleRooms();
            if (deleted > 0) {
                logger_js_1.logger.info('🗑️ Pruned stale lobbies', { count: deleted });
            }
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to prune stale lobbies', { error });
        }
    }
    async cleanupGame(job) {
        const { gameId, reason, idempotencyKey } = job.data;
        const idKey = idempotencyKey ?? (job.id !== undefined ? String(job.id) : gameId);
        const existing = await this.idempotencyService.getProcessedJob(this.queueName, idKey);
        if (existing.exists && existing.value) {
            logger_js_1.logger.info('♻️ Skipping already processed cleanup job', {
                jobId: job.id,
                gameId,
            });
            return existing.value;
        }
        try {
            logger_js_1.logger.info('🧹 Cleaning up game', { gameId, reason });
            const gameState = await this.gameService.getGameState(gameId);
            if (!gameState) {
                logger_js_1.logger.info('Cleanup skipped because game state already absent', { gameId });
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
                    logger_js_1.logger.warn('Unknown cleanup reason received', { gameId, reason });
            }
            await this.performCommonCleanup(gameId);
            logger_js_1.logger.info('✅ Game cleanup completed', { gameId, reason });
            const result = {
                success: true,
                reason,
                cleanedAt: new Date().toISOString(),
            };
            await this.idempotencyService.markProcessedJob(this.queueName, idKey, result, 24 * 60 * 60);
            return result;
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to cleanup game', {
                gameId,
                reason,
                error,
            });
            await this.idempotencyService
                .clearProcessedJob(this.queueName, idKey)
                .catch((cleanupError) => {
                logger_js_1.logger.warn('Failed to clear idempotency state after cleanup failure', {
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
        logger_js_1.logger.info('Game marked as abandoned without ELO changes', { gameId });
    }
    async performCommonCleanup(gameId) {
        await this.cacheService.deleteGameState(gameId);
        try {
            await territoryModifierService_js_1.default.cleanupFinishedGameModifiers([gameId]);
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to clean up territory modifiers for game', {
                gameId,
                error,
            });
        }
        try {
            const { archived } = await this.gameService.archiveGameMoves(gameId);
            if (archived > 0) {
                logger_js_1.logger.info('Archived game moves during cleanup', { gameId, archived });
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to archive game moves during cleanup', {
                gameId,
                error,
            });
        }
        await this.cleanupTempResources(gameId);
        await this.gameService.removeFromActiveGames(gameId);
    }
    async cleanupTempResources(gameId) {
        logger_js_1.logger.debug('Cleaned temporary resources for game', { gameId });
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
                logger_js_1.logger.info('📅 Scheduling cleanup for abandoned game', { gameId });
                await queueService_js_1.queueService.addGameCleanup({
                    gameId,
                    reason: 'abandoned',
                });
            }
            if (abandonedGames.length > 0) {
                logger_js_1.logger.info('📅 Scheduled cleanup for abandoned games', {
                    count: abandonedGames.length,
                });
            }
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to schedule abandoned game cleanup', { error });
        }
    }
}
exports.CleanupWorker = CleanupWorker;
const createCleanupWorker = () => new CleanupWorker();
exports.createCleanupWorker = createCleanupWorker;
//# sourceMappingURL=cleanupWorker.js.map