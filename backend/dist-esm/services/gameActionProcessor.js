"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameActionProcessor = void 0;
const logger_js_1 = require("../utils/logger.js");
const deltaEmitter_js_1 = require("./deltaEmitter.js");
const gameService_js_1 = require("./gameService.js");
const queueService_js_1 = require("./queueService.js");
class GameActionProcessor {
    constructor(io) {
        this.gameService = new gameService_js_1.GameService();
        this.deltaEmitter = new deltaEmitter_js_1.DeltaEmitter(io);
        this.io = io;
    }
    async processDeployment(gameId, playerId, territoryId, armies, socketId) {
        const job = await queueService_js_1.queueService.addGameAction({
            gameId,
            playerId,
            action: {
                type: 'deploy',
                roomId: gameId,
                playerId,
                payload: { territoryId, armies },
            },
            socketId,
        });
        if (job) {
            const hasWorkers = await queueService_js_1.queueService.hasActiveWorkers('gameActions');
            if (hasWorkers) {
                logger_js_1.logger.info('Queued deployment action for worker processing', {
                    gameId,
                    jobId: job.id,
                    territoryId,
                    armies,
                });
                return { mode: 'queued' };
            }
            try {
                await job.remove();
            }
            catch (err) {
                logger_js_1.logger.warn('Failed to remove queued job for inline fallback', {
                    gameId,
                    jobId: job.id,
                    error: err instanceof Error ? err.message : err,
                });
            }
        }
        const result = await this.processDeploymentInline(gameId, playerId, territoryId, armies);
        await this.deltaEmitter.emitDeploymentDeltas(gameId, playerId, territoryId, result);
        await this.deltaEmitter.emitRevealTo(gameId, playerId);
        return { mode: 'inline', result };
    }
    async processDeploymentInline(gameId, playerId, territoryId, armies) {
        logger_js_1.logger.info('Processing deployment inline (no queue)', {
            gameId,
            playerId,
            territoryId,
            armies,
        });
        const result = await this.gameService.processPlaceArmies(gameId, {
            territoryId,
            armies,
            playerId,
        });
        return result;
    }
    async processFortify(gameId, playerId, fromTerritoryId, toTerritoryId, armies, socketId) {
        const job = await queueService_js_1.queueService.addGameAction({
            gameId,
            playerId,
            action: {
                type: 'fortify',
                roomId: gameId,
                playerId,
                payload: { fromTerritoryId, toTerritoryId, armies },
            },
            socketId,
        });
        if (job) {
            const hasWorkers = await queueService_js_1.queueService.hasActiveWorkers('gameActions');
            if (hasWorkers) {
                logger_js_1.logger.info('Queued fortify action for worker processing', {
                    gameId,
                    jobId: job.id,
                    fromTerritoryId,
                    toTerritoryId,
                    armies,
                });
                return;
            }
            try {
                await job.remove();
            }
            catch (err) {
                logger_js_1.logger.warn('Failed to remove queued job for inline fallback', {
                    gameId,
                    jobId: job.id,
                    error: err instanceof Error ? err.message : err,
                });
            }
        }
        await this.processFortifyInline(gameId, playerId, fromTerritoryId, toTerritoryId, armies);
    }
    async processFortifyInline(gameId, playerId, fromTerritoryId, toTerritoryId, armies) {
        logger_js_1.logger.info('Processing fortify inline (no queue)', {
            gameId,
            playerId,
            fromTerritoryId,
            toTerritoryId,
            armies,
        });
        const result = await this.gameService.processFortify(gameId, {
            fromTerritoryId,
            toTerritoryId,
            armies,
            playerId,
        });
        await this.deltaEmitter.emitFortifyDeltas(gameId, fromTerritoryId, toTerritoryId, result);
    }
    async processGoBack(gameId, playerId, socketId) {
        const job = await queueService_js_1.queueService.addGameAction({
            gameId,
            playerId,
            action: {
                type: 'go_back_to_reinforcement',
                roomId: gameId,
                playerId,
            },
            socketId,
        });
        if (job) {
            const hasWorkers = await queueService_js_1.queueService.hasActiveWorkers('gameActions');
            if (hasWorkers) {
                logger_js_1.logger.info('Queued go-back action for worker processing', {
                    gameId,
                    jobId: job.id,
                });
                return;
            }
            try {
                await job.remove();
            }
            catch (err) {
                logger_js_1.logger.warn('Failed to remove queued job for inline fallback', {
                    gameId,
                    jobId: job.id,
                    error: err instanceof Error ? err.message : err,
                });
            }
        }
        await this.processGoBackInline(gameId, playerId);
    }
    async processGoBackInline(gameId, playerId) {
        logger_js_1.logger.info('Processing go-back inline (no queue)', {
            gameId,
            playerId,
        });
        const result = await this.gameService.processGoBackToReinforcement(gameId, playerId);
        await this.deltaEmitter.emitPhaseChange(gameId, result);
    }
    getDeltaEmitter() {
        return this.deltaEmitter;
    }
    async processAttack(gameId, playerId, fromTerritoryId, toTerritoryId, armies, socketId) {
        const job = await queueService_js_1.queueService.addGameAction({
            gameId,
            playerId,
            action: {
                type: 'attack',
                roomId: gameId,
                playerId,
                payload: {
                    fromTerritoryId,
                    toTerritoryId,
                    ...(typeof armies === 'number' ? { armies } : {}),
                },
            },
            socketId,
        });
        if (job) {
            const hasWorkers = await queueService_js_1.queueService.hasActiveWorkers('gameActions');
            if (hasWorkers) {
                logger_js_1.logger.info('Queued attack action for worker processing', {
                    gameId,
                    jobId: job.id,
                    fromTerritoryId,
                    toTerritoryId,
                    armies,
                });
                return { mode: 'queued' };
            }
            try {
                await job.remove();
            }
            catch (err) {
                logger_js_1.logger.warn('Failed to remove queued job for inline fallback', {
                    gameId,
                    jobId: job.id,
                    error: err instanceof Error ? err.message : err,
                });
            }
        }
        let lockToken = null;
        const { acquireLock, releaseLock } = await import('../config/redis.js');
        const lockKey = `lock:game-actions:${gameId}`;
        const startWait = Date.now();
        lockToken = await acquireLock(lockKey, 5000);
        while (!lockToken) {
            if (Date.now() - startWait > 1500)
                break;
            await new Promise((r) => setTimeout(r, 25));
            lockToken = await acquireLock(lockKey, 5000);
        }
        const updated = await this.gameService.processGameAction({
            type: 'attack',
            roomId: gameId,
            playerId,
            payload: {
                fromTerritoryId,
                toTerritoryId,
                ...(typeof armies === 'number' ? { armies } : {}),
            },
        }, playerId);
        const last = updated.lastBattleResult;
        if (last) {
            try {
                const battleDelta = (await import('../types/deltaUpdates.js')).DeltaBuilder.battleResult(gameId, last, updated.version);
                battleDelta.changes = [
                    (await import('../types/deltaUpdates.js')).DeltaBuilder.territoryUpdate(gameId, last.fromTerritory.id, { armies: last.fromTerritory.armies }, updated.version),
                    (await import('../types/deltaUpdates.js')).DeltaBuilder.territoryUpdate(gameId, last.toTerritory.id, { armies: last.toTerritory.armies, ownerId: last.toTerritory.ownerId ?? undefined }, updated.version),
                ];
                const { emitFogFilteredDelta } = await import('./fogService.js');
                await emitFogFilteredDelta(this.io, gameId, battleDelta);
            }
            catch (e) {
                logger_js_1.logger.debug('Failed to emit fog-filtered battle delta in inline attack', {
                    gameId,
                    error: e instanceof Error ? e.message : e,
                });
            }
        }
        await this.deltaEmitter.emitRevealTo(gameId, playerId);
        if (lockToken) {
            try {
                await releaseLock(lockKey, lockToken);
            }
            catch {
            }
        }
        return { mode: 'inline' };
    }
}
exports.GameActionProcessor = GameActionProcessor;
//# sourceMappingURL=gameActionProcessor.js.map