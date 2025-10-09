import { Worker } from 'bullmq';
import { query } from '../config/database.js';
import { acquireLock, releaseLock } from '../config/redis.js';
import { aiDecisionService } from '../services/aiDecisionService.js';
import { gameStateCache } from '../services/cacheService.js';
import { DeltaEmitter } from '../services/deltaEmitter.js';
import { GameService } from '../services/gameService.js';
import { jobIdempotencyService } from '../services/jobIdempotencyService.js';
import { aiTurnMetrics, socketPayloadMetrics } from '../services/metricsService.js';
import { queueService } from '../services/queueService.js';
import { startWorkerHeartbeat } from '../services/workerHeartbeat.js';
import { DeltaBuilder } from '../types/deltaUpdates.js';
import { logger } from '../utils/logger.js';
export class GameActionWorker {
    constructor(io) {
        this.worker = null;
        this.gameService = new GameService();
        this.deltaEmitter = new DeltaEmitter(io);
        this.io = io;
        this.queueName = queueService.getGameActionQueue().name;
    }
    computePayloadBytes(data) {
        try {
            const json = JSON.stringify(data);
            return Buffer.byteLength(json, 'utf8');
        }
        catch {
            return -1;
        }
    }
    emitGameUpdate(channel, payload) {
        const bytes = this.computePayloadBytes(payload);
        socketPayloadMetrics.record('game-update', bytes);
        if (socketPayloadMetrics.shouldLog('game-update')) {
            const stats = socketPayloadMetrics.snapshot('game-update');
            if (stats) {
                logger.info('Socket payload stats', {
                    event: 'game-update',
                    windowCount: stats.count,
                    p50Bytes: stats.p50,
                    p95Bytes: stats.p95,
                    maxBytes: stats.max,
                });
            }
        }
        this.io.to(channel).emit('game-update', payload);
    }
    async initialize() {
        const processJob = async (job) => {
            if (job.name === 'process-game-action') {
                return this.processGameAction(job);
            }
            if (job.name === 'execute-ai-turn') {
                return this.processAiTurn(job);
            }
            logger.warn('Received unknown job for game-actions queue', { name: job.name, id: job.id });
            return null;
        };
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
            this.worker = new Worker(this.queueName, processJob, {
                concurrency: 10,
                connection,
            });
        }
        this.worker.on('completed', (job, result) => {
            logger.info('✅ Game action job completed', {
                jobId: job.id,
                result,
            });
        });
        this.worker.on('failed', (job, error) => {
            logger.error('❌ Game action job failed', {
                jobId: job?.id,
                error: error instanceof Error
                    ? { message: error.message, name: error.name, stack: error.stack }
                    : String(error),
            });
        });
        this.worker.on('error', (error) => {
            logger.error('❌ GameActionWorker encountered an error', {
                error: error instanceof Error ? error.message : error,
            });
        });
        startWorkerHeartbeat(this.queueName);
        logger.info('✅ GameActionWorker initialized');
    }
    async processAiTurn(job) {
        const { gameId, playerId, turnNumber, budgetOverrides } = job.data;
        const idKey = job.id !== undefined ? String(job.id) : `ai:${gameId}:${turnNumber}`;
        const cached = await jobIdempotencyService.getProcessedJob(this.queueName, idKey);
        if (cached.exists && cached.value) {
            logger.info('♻️ Skipping already processed AI turn job', {
                gameId,
                playerId,
                jobId: job.id,
            });
            return { ...cached.value, processed: false };
        }
        try {
            const state = await this.gameService.getGameState(gameId);
            if (!state)
                throw new Error('Game not found');
            if (state.phase === 'finished') {
                const result = { success: true, delta: null, processed: true };
                await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60);
                return result;
            }
            if (state.turn !== turnNumber || state.currentPlayer !== playerId) {
                const result = { success: true, delta: null, processed: true };
                await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60);
                return result;
            }
            const current = state.players.find((p) => p.id === playerId);
            if (!current || !current.isAi) {
                const result = { success: true, delta: null, processed: true };
                await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60);
                return result;
            }
            const difficulty = current.aiDifficulty ?? 'recruit';
            const baseBudget = this.computeBudgetForDifficulty(difficulty);
            const effectiveBudget = {
                ...baseBudget,
                ...(budgetOverrides || {}),
                readableDelayMs: typeof process.env.AI_READABLE_DELAY_MS === 'string'
                    ? Math.max(0, parseInt(process.env.AI_READABLE_DELAY_MS, 10) || 0)
                    : (budgetOverrides?.readableDelayMs ?? baseBudget.readableDelayMs),
            };
            const streamEnabled = (process.env.AI_STREAM_ACTIONS ?? 'true').toLowerCase() !== 'false';
            if (streamEnabled && (effectiveBudget.readableDelayMs ?? 0) > 0) {
                await this.runAiTurnStreaming({ gameId, playerId, difficulty, budget: effectiveBudget });
            }
            else {
                await this.gameService.executeAiTurn(gameId, effectiveBudget);
                const serialized = await gameStateCache.getGameState(gameId);
                if (serialized) {
                    this.emitGameUpdate(`game:${gameId}`, serialized);
                }
            }
            try {
                const { GameLifecycleService } = await import('../services/gameLifecycleService.js');
                const lifecycle = new GameLifecycleService();
                await lifecycle.scheduleTurnTimeout(gameId);
                await lifecycle.scheduleAiTurn(gameId);
            }
            catch (e) {
                logger.warn('Failed to schedule lifecycle after AI turn', {
                    roomId: gameId,
                    error: e instanceof Error ? e.message : e,
                });
            }
            const result = { success: true, delta: null, processed: true };
            await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60);
            return result;
        }
        catch (error) {
            logger.error('❌ Failed to process AI turn', {
                gameId,
                playerId,
                error,
            });
            throw error;
        }
    }
    async runAiTurnStreaming(args) {
        const { gameId, playerId, difficulty, budget } = args;
        const start = Date.now();
        const state = await this.gameService.getGameState(gameId);
        if (!state)
            throw new Error('Game not found');
        if (state.currentPlayer !== playerId)
            return;
        const aiPlayer = state.players.find((p) => p.id === playerId);
        if (!aiPlayer) {
            return;
        }
        const plan = await aiDecisionService.chooseAction({
            gameState: state,
            player: aiPlayer,
            difficulty,
            budget,
        });
        const actions = Array.isArray(plan.actions) ? [...plan.actions] : [];
        let applied = 0;
        let usedFallback = plan.usedFallback;
        let fallbackReason = plan.reason;
        const planningElapsed = plan.diagnostics?.durationMs ?? 0;
        const totalBudget = Math.max(0, budget.maxThinkTimeMs);
        let remainingBudget = Math.max(0, totalBudget - planningElapsed);
        const chainLimit = Math.max(0, budget.maxAttackChains ?? 0);
        let chainCount = 0;
        for (let i = 0; i < actions.length; i++) {
            const now = Date.now();
            const elapsed = now - start;
            remainingBudget = Math.max(0, totalBudget - elapsed);
            if (remainingBudget <= 0) {
                usedFallback = true;
                fallbackReason = fallbackReason ?? 'timeout';
                break;
            }
            const stepsLeft = actions.length - i;
            const desiredDelay = Math.max(0, budget.readableDelayMs ?? 0);
            const maxDelay = Math.max(0, Math.floor(remainingBudget / (stepsLeft + 1)));
            const stepDelay = Math.min(desiredDelay, maxDelay);
            if (stepDelay > 0)
                await new Promise((r) => setTimeout(r, stepDelay));
            const action = actions[i];
            try {
                switch (action.type) {
                    case 'deploy': {
                        await this.processPlaceArmies(gameId, playerId, action);
                        break;
                    }
                    case 'fortify': {
                        await this.processFortify(gameId, playerId, action);
                        break;
                    }
                    case 'end_turn': {
                        await this.processEndTurn(gameId, playerId);
                        break;
                    }
                    case 'attack': {
                        const updated = await this.gameService.processGameAction(action, playerId);
                        const last = updated.lastBattleResult;
                        if (last) {
                            try {
                                const battleDelta = DeltaBuilder.battleResult(gameId, last, updated.version);
                                const { emitFogFilteredDelta } = await import('../services/fogService.js');
                                await emitFogFilteredDelta(this.io, gameId, battleDelta);
                            }
                            catch {
                            }
                        }
                        if (difficulty === 'grandmaster' && chainCount < chainLimit) {
                            const now2 = Date.now();
                            const elapsed2 = now2 - start;
                            remainingBudget = Math.max(0, totalBudget - elapsed2);
                            if (remainingBudget > 0) {
                                try {
                                    const latest = await this.gameService.getGameState(gameId);
                                    if (latest && latest.currentPlayer === playerId && latest.phase === 'attack') {
                                        const subBudget = {
                                            ...budget,
                                            maxThinkTimeMs: Math.min(remainingBudget, 500),
                                            maxPlannedActions: 3,
                                        };
                                        const player2 = latest.players.find((p) => p.id === playerId);
                                        if (!player2)
                                            break;
                                        const replanned = await aiDecisionService.chooseAction({
                                            gameState: latest,
                                            player: player2,
                                            difficulty,
                                            budget: subBudget,
                                        });
                                        const nextAttack = replanned.actions.find((a) => a.type === 'attack');
                                        if (nextAttack) {
                                            actions.splice(i + 1, 0, nextAttack);
                                            chainCount += 1;
                                        }
                                    }
                                }
                                catch {
                                }
                            }
                        }
                        break;
                    }
                    case 'trade_cards': {
                        const beforeState = await this.gameService.getGameState(gameId);
                        const prevBank = beforeState?.players.find((p) => p.id === playerId)?.armies ?? 0;
                        const prevPhase = beforeState?.phase;
                        const updated = await this.gameService.processGameAction(action, playerId);
                        try {
                            const postPlayer = updated.players.find((p) => p.id === playerId);
                            const postBank = postPlayer?.armies ?? prevBank;
                            const mustCash = typeof postPlayer?.mustCashInTreasures === 'boolean'
                                ? postPlayer?.mustCashInTreasures
                                : undefined;
                            const { emitFogFilteredDelta } = await import('../services/fogService.js');
                            const playerDelta = DeltaBuilder.playerUpdate(gameId, playerId, {
                                armies: Number(postBank),
                                ...(mustCash !== undefined ? { mustCashInTreasures: mustCash } : {}),
                            }, updated.version);
                            await emitFogFilteredDelta(this.io, gameId, playerDelta);
                            if (updated.phase !== prevPhase) {
                                await this.deltaEmitter.emitPhaseChange(gameId, {
                                    phase: updated.phase,
                                    currentPlayer: updated.currentPlayer,
                                    turn: updated.turn,
                                    reinforcementArmies: Number(postBank),
                                    version: updated.version,
                                });
                            }
                        }
                        catch {
                            try {
                                const serialized = await gameStateCache.getGameState(gameId);
                                if (serialized)
                                    this.emitGameUpdate(`game:${gameId}`, serialized);
                            }
                            catch (_ee) {
                            }
                        }
                        break;
                    }
                    default: {
                        await this.gameService.processGameAction(action, playerId);
                        try {
                            const serialized = await gameStateCache.getGameState(gameId);
                            if (serialized) {
                                this.emitGameUpdate(`game:${gameId}`, serialized);
                            }
                        }
                        catch {
                        }
                        break;
                    }
                }
            }
            catch (_e) {
                usedFallback = true;
                fallbackReason = fallbackReason ?? 'stubbed';
                break;
            }
            applied += 1;
        }
        if (applied < actions.length) {
            const latest = await this.gameService.getGameState(gameId);
            if (latest && latest.currentPlayer === playerId) {
                const fb = aiDecisionService.buildFallbackPlan(latest, playerId);
                const tail = fb.slice(0, 1);
                for (const a of tail) {
                    try {
                        switch (a.type) {
                            case 'deploy':
                                await this.processPlaceArmies(gameId, playerId, a);
                                break;
                            case 'fortify':
                                await this.processFortify(gameId, playerId, a);
                                break;
                            case 'end_turn':
                                await this.processEndTurn(gameId, playerId);
                                break;
                            default:
                                await this.gameService.processGameAction(a, playerId);
                                break;
                        }
                    }
                    catch {
                    }
                }
            }
        }
        aiTurnMetrics.recordTurn({
            difficulty,
            fallbackUsed: usedFallback,
            fallbackReason,
            thinkTimeMs: Date.now() - start,
            plannedActions: actions.length,
            appliedActions: applied,
        });
    }
    computeBudgetForDifficulty(difficulty) {
        switch (difficulty) {
            case 'recruit':
                return {
                    maxThinkTimeMs: 5000,
                    maxPlannedActions: 6,
                    readableDelayMs: 300,
                    maxAttackChains: 3,
                    minAttackOddsByTier: { recruit: 0.7 },
                    allowOneSpiceAttack: true,
                };
            case 'commander':
                return {
                    maxThinkTimeMs: 10000,
                    maxPlannedActions: 10,
                    readableDelayMs: 300,
                    maxAttackChains: 6,
                    minAttackOddsByTier: { commander: 0.68 },
                    allowOneSpiceAttack: false,
                };
            default:
                return {
                    maxThinkTimeMs: 15000,
                    maxPlannedActions: 16,
                    readableDelayMs: 300,
                    maxAttackChains: 999,
                    minAttackOddsByTier: { grandmaster: 0.6 },
                    allowOneSpiceAttack: false,
                };
        }
    }
    async processGameAction(job) {
        const { gameId, playerId, action, socketId, idempotencyKey } = job.data;
        const idKey = idempotencyKey ??
            (job.id !== undefined ? String(job.id) : `${gameId}:${playerId}:${action.type}`);
        const cached = await jobIdempotencyService.getProcessedJob(this.queueName, idKey);
        if (cached.exists && cached.value) {
            logger.info('♻️ Skipping already processed game action job', {
                gameId,
                playerId,
                actionType: action.type,
                jobId: job.id,
            });
            return { ...cached.value, processed: false };
        }
        let lockToken = null;
        const lockKey = `lock:game-actions:${gameId}`;
        try {
            const startWait = Date.now();
            lockToken = await acquireLock(lockKey, 5000);
            while (!lockToken) {
                if (Date.now() - startWait > 1500)
                    break;
                await new Promise((r) => setTimeout(r, 25));
                lockToken = await acquireLock(lockKey, 5000);
            }
            logger.debug('Processing game action', {
                gameId,
                playerId,
                actionType: action.type,
            });
            if (job.data.turnTimeoutStage === 'expire') {
                try {
                    const { GameLifecycleService } = await import('../services/gameLifecycleService.js');
                    const lifecycle = new GameLifecycleService();
                    await lifecycle.handleTurnTimeout(gameId);
                }
                catch (e) {
                    logger.warn('Turn timeout handling failed', {
                        roomId: gameId,
                        error: e instanceof Error ? e.message : e,
                    });
                }
                const result = { success: true, delta: null, processed: true };
                await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60);
                return result;
            }
            const currentState = await this.gameService.getGameState(gameId);
            if (!currentState) {
                throw new Error(`Game ${gameId} not found`);
            }
            if (!this.canPlayerPerformAction(currentState, playerId, action)) {
                throw new Error(`Player ${playerId} cannot perform action ${action.type}`);
            }
            let delta = null;
            let shouldBroadcast = true;
            switch (action.type) {
                case 'deploy':
                    delta = await this.processPlaceArmies(gameId, playerId, action);
                    await this.recordMove(gameId, playerId, currentState.turn, 'deploy', action.payload);
                    try {
                        await this.deltaEmitter.emitRevealTo(gameId, playerId);
                    }
                    catch (_e) {
                    }
                    shouldBroadcast = false;
                    break;
                case 'attack': {
                    await this.recordMove(gameId, playerId, currentState.turn, 'attack', action.payload);
                    const updated = await this.gameService.processGameAction(action, playerId);
                    const last = updated.lastBattleResult;
                    if (last) {
                        try {
                            const battleDelta = DeltaBuilder.battleResult(gameId, last, updated.version);
                            battleDelta.changes = [
                                DeltaBuilder.territoryUpdate(gameId, last.fromTerritory.id, { armies: last.fromTerritory.armies }, updated.version),
                                DeltaBuilder.territoryUpdate(gameId, last.toTerritory.id, {
                                    armies: last.toTerritory.armies,
                                    ownerId: last.toTerritory.ownerId ?? undefined,
                                }, updated.version),
                            ];
                            const { emitFogFilteredDelta } = await import('../services/fogService.js');
                            await emitFogFilteredDelta(this.io, gameId, battleDelta);
                        }
                        catch (e) {
                            logger.debug('Failed to emit fog-filtered battle delta in worker attack', {
                                roomId: gameId,
                                error: e instanceof Error ? e.message : e,
                            });
                        }
                    }
                    shouldBroadcast = false;
                    break;
                }
                case 'fortify':
                    delta = await this.processFortify(gameId, playerId, action);
                    await this.recordMove(gameId, playerId, currentState.turn, 'fortify', action.payload);
                    break;
                case 'end_turn': {
                    delta = await this.processEndTurn(gameId, playerId);
                    await this.recordMove(gameId, playerId, currentState.turn, 'end_turn', {});
                    break;
                }
                case 'trade_cards': {
                    try {
                        const payload = action
                            .payload;
                        const cards = Array.isArray(payload?.cards) ? payload?.cards : undefined;
                        const count = (cards?.length ?? 0) ||
                            (Array.isArray(payload?.treasureSet) ? (payload?.treasureSet).length : 0);
                        const moveData = cards && cards.length > 0
                            ? { cards }
                            : count > 0
                                ? { cardCount: count, treasureSet: payload?.treasureSet }
                                : { cardCount: 0 };
                        await this.recordMove(gameId, playerId, currentState.turn, 'trade_cards', moveData);
                    }
                    catch (e) {
                        logger.debug('Skipped logging trade_cards move', {
                            roomId: gameId,
                            playerId,
                            error: e instanceof Error ? e.message : e,
                        });
                    }
                    const prevBank = currentState.players.find((p) => p.id === playerId)?.armies ?? 0;
                    await this.gameService.processGameAction(action, playerId);
                    const serialized = await gameStateCache.getGameState(gameId);
                    const newPhase = serialized?.phase ?? currentState.phase;
                    const version = serialized?.version;
                    try {
                        const postPlayer = serialized?.players?.find((p) => p.id === playerId);
                        const postBank = postPlayer?.armies ?? prevBank;
                        const _mustCash = typeof postPlayer?.mustCashInTreasures === 'boolean'
                            ? postPlayer?.mustCashInTreasures
                            : undefined;
                        const gained = Math.max(0, postBank - prevBank);
                        if (gained > 0) {
                            let cardNames;
                            try {
                                const before = currentState.players.find((p) => p.id === playerId);
                                const sel = action.payload
                                    ?.treasureSet;
                                if (before && Array.isArray(before.treasures) && Array.isArray(sel)) {
                                    cardNames = sel
                                        .map((idx) => Number(idx))
                                        .filter((idx) => Number.isFinite(idx))
                                        .map((idx) => before.treasures[idx])
                                        .map((m) => String(m));
                                }
                            }
                            catch {
                            }
                            await this.gameService.appendLog(gameId, [
                                {
                                    type: 'TREASURE_CASH',
                                    timestamp: new Date().toISOString(),
                                    playerId,
                                    troops: gained,
                                    cards: cardNames && cardNames.length === 3 ? cardNames : undefined,
                                    cardCount: Array.isArray(action.payload?.cards)
                                        ? (action.payload?.cards?.length ??
                                            undefined)
                                        : Array.isArray(action.payload
                                            ?.treasureSet)
                                            ? (action.payload
                                                ?.treasureSet).length
                                            : undefined,
                                },
                            ]);
                        }
                    }
                    catch (logErr) {
                        logger.debug('Skipped appending treasure cash log', {
                            roomId: gameId,
                            playerId,
                            error: logErr instanceof Error ? logErr.message : logErr,
                        });
                    }
                    try {
                        const postPlayer = serialized?.players?.find((p) => p.id === playerId);
                        const postBank = postPlayer?.armies ?? prevBank;
                        const mustCash = typeof postPlayer?.mustCashInTreasures === 'boolean'
                            ? postPlayer?.mustCashInTreasures
                            : undefined;
                        const { emitFogFilteredDelta } = await import('../services/fogService.js');
                        const playerDelta = DeltaBuilder.playerUpdate(gameId, playerId, {
                            armies: Number(postBank),
                            ...(mustCash !== undefined ? { mustCashInTreasures: mustCash } : {}),
                        }, version);
                        await emitFogFilteredDelta(this.io, gameId, playerDelta);
                        if (newPhase !== currentState.phase) {
                            await this.deltaEmitter.emitPhaseChange(gameId, {
                                phase: newPhase,
                                currentPlayer: serialized?.currentPlayer ?? playerId,
                                turn: serialized?.turn ?? currentState.turn,
                                reinforcementArmies: Number(postBank),
                                version,
                            });
                        }
                    }
                    catch (_e) {
                        if (serialized) {
                            this.emitGameUpdate(`game:${gameId}`, serialized);
                        }
                    }
                    shouldBroadcast = false;
                    delta = null;
                    break;
                }
                case 'go_back_to_reinforcement': {
                    const result = await this.gameService.processGoBackToReinforcement(gameId, playerId);
                    await this.deltaEmitter.emitPhaseChange(gameId, result);
                    await this.recordMove(gameId, playerId, currentState.turn, 'go_back_to_reinforcement', {});
                    shouldBroadcast = false;
                    break;
                }
                case 'undo_fortify': {
                    await this.gameService.processGameAction({ type: 'undo_fortify', roomId: gameId, playerId }, playerId);
                    await this.recordMove(gameId, playerId, currentState.turn, 'undo_fortify', {});
                    const serialized = await gameStateCache.getGameState(gameId);
                    if (serialized) {
                        this.emitGameUpdate(`game:${gameId}`, serialized);
                    }
                    shouldBroadcast = false;
                    break;
                }
                default: {
                    const _exhaustive = action;
                    throw new Error('Unknown action type received in game action worker');
                }
            }
            if (shouldBroadcast && delta) {
                const { emitFogFilteredDelta } = await import('../services/fogService.js');
                await emitFogFilteredDelta(this.io, gameId, delta);
            }
            const result = {
                success: true,
                delta: delta || null,
                processed: true,
            };
            await jobIdempotencyService.markProcessedJob(this.queueName, idKey, result, 60 * 60);
            return result;
        }
        catch (error) {
            logger.error('❌ Failed to process game action', {
                gameId,
                playerId,
                actionType: action.type,
                error: error instanceof Error
                    ? { message: error.message, name: error.name, stack: error.stack }
                    : String(error),
            });
            if (socketId) {
                this.io.to(socketId).emit('error', {
                    event: 'game:action:error',
                    message: error.message,
                    timestamp: new Date().toISOString(),
                });
            }
            throw error;
        }
        finally {
            if (lockToken) {
                try {
                    await releaseLock(lockKey, lockToken);
                }
                catch {
                }
            }
        }
    }
    canPlayerPerformAction(gameState, playerId, action) {
        if (!gameState.players.some((player) => player.id === playerId)) {
            return false;
        }
        const turnBasedActions = ['deploy', 'attack', 'fortify', 'end_turn'];
        if (turnBasedActions.includes(action.type)) {
            return gameState.currentPlayer === playerId;
        }
        return true;
    }
    async recordMove(gameId, playerId, turnNumber, moveType, payload) {
        try {
            const result = await query(`INSERT INTO game_moves (room_id, player_id, turn_number, move_type, move_data)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id`, [gameId, playerId, turnNumber, moveType, JSON.stringify(payload || {})]);
            const moveId = result.rows[0]?.id ?? null;
            logger.debug('Recorded game move', { gameId, playerId, turnNumber, moveType, moveId });
            return moveId;
        }
        catch (error) {
            logger.warn('Failed to record game move', {
                gameId,
                playerId,
                turnNumber,
                moveType,
                error: error instanceof Error ? error.message : error,
            });
            return null;
        }
    }
    async processPlaceArmies(gameId, playerId, action) {
        const territoryId = action.payload?.territoryId || '';
        const result = await this.gameService.processPlaceArmies(gameId, {
            territoryId,
            armies: action.payload?.armies || 0,
            playerId,
        });
        await this.deltaEmitter.emitDeploymentDeltas(gameId, playerId, territoryId, result);
        return DeltaBuilder.territoryUpdate(gameId, territoryId, {
            armies: result.armies,
        });
    }
    async processFortify(gameId, playerId, action) {
        const fromTerritoryId = action.payload?.fromTerritoryId || '';
        const toTerritoryId = action.payload?.toTerritoryId || '';
        const result = await this.gameService.processFortify(gameId, {
            fromTerritoryId,
            toTerritoryId,
            armies: action.payload?.armies || 0,
            playerId,
        });
        await this.deltaEmitter.emitFortifyDeltas(gameId, fromTerritoryId, toTerritoryId, result);
        try {
            const fortifyDelta = {
                type: 'FORTIFY_RESULT',
                roomId: gameId,
                timestamp: Date.now(),
                fromTerritoryId,
                toTerritoryId,
                movedArmies: action.payload?.armies || 0,
                fromArmies: result.fromArmies,
                toArmies: result.toArmies,
                playerId,
            };
            const { emitFogFilteredDelta } = await import('../services/fogService.js');
            await emitFogFilteredDelta(this.io, gameId, fortifyDelta);
        }
        catch (_e) {
        }
        return DeltaBuilder.territoryUpdate(gameId, toTerritoryId, {
            armies: result.toArmies,
        });
    }
    async processEndTurn(gameId, playerId) {
        const nextPlayer = await this.gameService.processEndTurn(gameId, playerId);
        try {
            const { GameLifecycleService } = await import('../services/gameLifecycleService.js');
            const lifecycle = new GameLifecycleService();
            await lifecycle.scheduleTurnTimeout(gameId);
            await lifecycle.scheduleAiTurn(gameId);
        }
        catch (error) {
            logger.warn('Failed to schedule turn timeout for next player', {
                roomId: gameId,
                error: error instanceof Error ? error.message : error,
            });
        }
        return DeltaBuilder.phaseChange(gameId, 'reinforcement', nextPlayer.id, 0, 0);
    }
    async processPhaseChange(gameId, playerId, action) {
        const phase = (action.payload?.phase ??
            'reinforcement');
        await this.gameService.processPhaseChange(gameId, playerId, phase);
        return DeltaBuilder.phaseChange(gameId, phase, playerId, 0, 0);
    }
}
export const createGameActionWorker = (io) => new GameActionWorker(io);
//# sourceMappingURL=gameActionWorker.js.map