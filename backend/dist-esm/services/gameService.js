"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameService = void 0;
const database_js_1 = require("../config/database.js");
const gameEngine_js_1 = require("../game/gameEngine.js");
const hiddenTreasures_js_1 = require("../game/hiddenTreasures.js");
const mapLoader_js_1 = require("../game/mapLoader.js");
const deltaUpdates_js_1 = require("../types/deltaUpdates.js");
const logger_js_1 = require("../utils/logger.js");
const aiDecisionService_js_1 = require("./aiDecisionService.js");
const cacheService_js_1 = require("./cacheService.js");
const clanProgressionService_js_1 = require("./clanProgressionService.js");
const clanService_js_1 = require("./clanService.js");
const eloService_js_1 = require("./eloService.js");
const featureFlagService_js_1 = require("./featureFlagService.js");
const mapService_js_1 = require("./mapService.js");
const metricsService_js_1 = require("./metricsService.js");
const notificationService_js_1 = __importDefault(require("./notificationService.js"));
const queueService_js_1 = require("./queueService.js");
const socketRegistry_js_1 = require("./socketRegistry.js");
const territoryModifierService_js_1 = __importDefault(require("./territoryModifierService.js"));
const CLAN_XP_BASE = 400;
const CLAN_XP_WIN_BONUS = 250;
const CLAN_XP_TOP_PLACEMENTS = {
    1: 150,
    2: 100,
    3: 50,
};
const CLAN_XP_TERRITORY_FACTOR = 5;
const CLAN_XP_TERRITORY_CAP = 150;
class GameService {
    constructor() {
        this.gameEngine = new gameEngine_js_1.GameEngine();
    }
    async persistGameStateSnapshot(roomId, state) {
        try {
            await (0, database_js_1.query)(`
        INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
        VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
        ON CONFLICT (room_id) DO UPDATE
          SET game_data = EXCLUDED.game_data,
              turn_number = EXCLUDED.turn_number,
              current_player_id = EXCLUDED.current_player_id,
              game_phase = EXCLUDED.game_phase,
              last_activity = NOW()
        `, [
                roomId,
                JSON.stringify(state),
                state.turn ?? 1,
                state.currentPlayer ?? null,
                state.phase ?? 'deployment',
            ]);
        }
        catch (error) {
            logger_js_1.logger.error('Failed to persist game state snapshot to database', {
                roomId,
                phase: state.phase,
                turn: state.turn,
                error: error instanceof Error ? error.message : error,
            });
        }
        try {
            await cacheService_js_1.gameStateCache.setGameState(roomId, state);
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to cache game state snapshot', {
                roomId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
    async persistTurnStateTransactional(roomId, serialized) {
        await (0, database_js_1.transaction)(async (client) => {
            await client.query(`
        INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
        VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
        ON CONFLICT (room_id) DO UPDATE
          SET game_data = EXCLUDED.game_data,
              turn_number = EXCLUDED.turn_number,
              current_player_id = EXCLUDED.current_player_id,
              game_phase = EXCLUDED.game_phase,
              last_activity = NOW()
        `, [
                roomId,
                JSON.stringify(serialized),
                Math.max(1, Number(serialized.turn ?? 1)),
                serialized.currentPlayer ?? null,
                serialized.phase ?? 'reinforcement',
            ]);
            await client.query(`UPDATE game_rooms SET current_turn_user_id = $2, turn_number = $3 WHERE id = $1`, [roomId, serialized.currentPlayer, serialized.turn]);
            const turn = Math.max(1, Number(serialized.turn ?? 1));
            const phase = String(serialized.phase ?? 'reinforcement');
            await client.query(`INSERT INTO game_state_snapshots (room_id, turn_number, phase, snapshot)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (room_id, turn_number, phase) DO NOTHING`, [roomId, turn, phase, JSON.stringify(serialized)]);
        });
    }
    async saveSnapshot(roomId, state) {
        await this.persistGameStateSnapshot(roomId, state);
    }
    serializeGameState(gameState) {
        const { territoryModifiers, ...rest } = gameState;
        const baseState = rest;
        const serialized = {
            ...baseState,
        };
        if (territoryModifiers instanceof Map) {
            serialized.territoryModifiers = Object.fromEntries(territoryModifiers.entries());
        }
        else if (territoryModifiers) {
            serialized.territoryModifiers = territoryModifiers;
        }
        return serialized;
    }
    cloneGameState(state) {
        const serialized = this.serializeGameState(state);
        return this.hydrateGameState(structuredClone(serialized), state.roomId);
    }
    normalizeAction(action, roomId, playerId) {
        if (action.playerId && action.playerId !== playerId) {
            return null;
        }
        if (action.roomId && action.roomId !== roomId) {
            return { ...action, playerId, roomId };
        }
        return { ...action, playerId, roomId };
    }
    async applyActions(baseState, actions, playerId) {
        if (actions.length === 0) {
            return { success: false, gameState: baseState, applied: [] };
        }
        let workingState = this.cloneGameState(baseState);
        const applied = [];
        for (const originalAction of actions) {
            const normalized = this.normalizeAction(originalAction, baseState.roomId, playerId);
            if (!normalized) {
                return { success: false, gameState: baseState, applied: [] };
            }
            if (!this.gameEngine.validateAction(workingState, normalized)) {
                return { success: false, gameState: baseState, applied: [] };
            }
            const { gameState: updatedState } = await this.gameEngine.processAction(workingState, normalized);
            workingState = updatedState;
            applied.push(normalized);
        }
        return { success: true, gameState: workingState, applied };
    }
    limitFallbackActions(actions, budget, roomId, playerId) {
        const maxAllowed = budget?.maxPlannedActions ?? actions.length;
        const limited = actions.slice(0, Math.max(1, maxAllowed));
        return limited
            .map((action) => this.normalizeAction(action, roomId, playerId))
            .filter((a) => Boolean(a));
    }
    recordAssassinationAssignments(roomId, gameState) {
        if (gameState.gameConfig?.gameMode !== 'assassination') {
            return;
        }
        const assignments = gameState.assassinationTargets;
        if (!assignments || Object.keys(assignments).length === 0) {
            return;
        }
        metricsService_js_1.assassinationMetrics.recordAssignments(roomId, assignments, 0);
    }
    recordAssassinationElimination(roomId, gameState, elimination, eliminatorId, cause) {
        if (gameState.gameConfig?.gameMode !== 'assassination' ||
            !elimination.gameEnded ||
            !elimination.winner ||
            !gameState.assassinationTargets) {
            return;
        }
        const hunterId = elimination.winner.id;
        const targetId = gameState.assassinationTargets[hunterId];
        if (!targetId || !elimination.eliminatedPlayers.includes(targetId)) {
            return;
        }
        const resolvedEliminator = eliminatorId ?? 'system';
        let resolution;
        if (cause === 'neutralize') {
            resolution = 'resignation';
        }
        else if (resolvedEliminator === hunterId) {
            resolution = 'direct';
        }
        else if (resolvedEliminator === targetId) {
            resolution = 'self_eliminated';
        }
        else if (resolvedEliminator === 'system') {
            resolution = 'system';
        }
        else {
            resolution = 'collateral';
        }
        metricsService_js_1.assassinationMetrics.recordElimination({
            gameId: roomId,
            hunterId,
            targetId,
            eliminatorId: resolvedEliminator,
            turnNumber: gameState.turn ?? 0,
            resolution,
        });
    }
    hydrateGameState(state, roomId) {
        const normalizedState = roomId && (!state.roomId || typeof state.roomId !== 'string') ? { ...state, roomId } : state;
        if (normalizedState.territoryModifiers &&
            !(normalizedState.territoryModifiers instanceof Map)) {
            const modifierMap = new Map(Object.entries(normalizedState.territoryModifiers));
            return {
                ...normalizedState,
                territoryModifiers: modifierMap,
            };
        }
        return normalizedState;
    }
    async executeAiTurn(roomId, budgetOverrides) {
        const cachedState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!cachedState) {
            throw new Error('Game not found');
        }
        const hydrated = this.hydrateGameState(cachedState, roomId);
        const currentPlayer = hydrated.players.find((player) => player.id === hydrated.currentPlayer);
        if (!currentPlayer) {
            throw new Error('Current player not found');
        }
        if (!currentPlayer.isAi) {
            throw new Error('Current player is not AI-controlled');
        }
        const effectiveBudget = {
            maxThinkTimeMs: budgetOverrides?.maxThinkTimeMs ?? 1000,
            maxPlannedActions: budgetOverrides?.maxPlannedActions ?? 4,
            signal: budgetOverrides?.signal,
        };
        const decisionPlan = await aiDecisionService_js_1.aiDecisionService.chooseAction({
            gameState: this.cloneGameState(hydrated),
            player: currentPlayer,
            difficulty: currentPlayer.aiDifficulty ?? 'recruit',
            budget: effectiveBudget,
        });
        const baselineState = this.cloneGameState(hydrated);
        const planResult = await this.applyActions(baselineState, decisionPlan.actions, currentPlayer.id);
        let finalState;
        let appliedActions;
        let fallbackUsed = decisionPlan.usedFallback;
        let fallbackReason = decisionPlan.usedFallback
            ? (decisionPlan.reason ?? 'service_fallback')
            : undefined;
        if (planResult.success) {
            finalState = planResult.gameState;
            appliedActions = planResult.applied;
        }
        else {
            const fallbackActions = this.limitFallbackActions(aiDecisionService_js_1.aiDecisionService.buildFallbackPlan(baselineState, currentPlayer.id), effectiveBudget, roomId, currentPlayer.id);
            const fallbackResult = await this.applyActions(baselineState, fallbackActions, currentPlayer.id);
            if (!fallbackResult.success) {
                throw new Error('Failed to apply fallback plan for AI turn');
            }
            finalState = fallbackResult.gameState;
            appliedActions = fallbackResult.applied;
            fallbackUsed = true;
            fallbackReason = fallbackReason ?? 'invalid_plan';
        }
        await this.persistGameStateSnapshot(roomId, this.serializeGameState(finalState));
        const decisionDiagnostics = decisionPlan.diagnostics;
        const thinkTimeMs = decisionDiagnostics?.durationMs;
        const plannedActionCount = decisionPlan.actions.length;
        const difficulty = currentPlayer.aiDifficulty ?? 'recruit';
        metricsService_js_1.aiTurnMetrics.recordTurn({
            difficulty,
            fallbackUsed,
            fallbackReason,
            thinkTimeMs,
            plannedActions: plannedActionCount,
            appliedActions: appliedActions.length,
        });
        logger_js_1.logger.info('AI turn executed', {
            roomId,
            playerId: currentPlayer.id,
            difficulty,
            planUsedFallback: decisionPlan.usedFallback,
            planReason: decisionPlan.reason ?? null,
            fallbackUsed,
            fallbackReason: fallbackReason ?? null,
            plannedActionCount,
            appliedActionCount: appliedActions.length,
            thinkTimeMs: thinkTimeMs ?? null,
            budget: {
                maxThinkTimeMs: decisionDiagnostics?.budget?.maxThinkTimeMs ?? effectiveBudget.maxThinkTimeMs,
                maxPlannedActions: decisionDiagnostics?.budget?.maxPlannedActions ?? effectiveBudget.maxPlannedActions,
            },
            actionTypes: {
                planned: decisionPlan.actions.map((action) => action.type),
                applied: appliedActions.map((action) => action.type),
            },
            phaseBefore: baselineState.phase,
            phaseAfter: finalState.phase,
        });
        return {
            plan: decisionPlan,
            appliedActions,
            fallbackUsed,
            fallbackReason,
            gameState: finalState,
        };
    }
    async isCapitalTerritory(roomId, territoryId) {
        const rawState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!rawState) {
            return false;
        }
        const gameState = this.hydrateGameState(rawState, roomId);
        const normalizedId = typeof territoryId === 'number' ? territoryId.toString() : territoryId;
        const territory = gameState.board.find((entry) => entry.id === normalizedId);
        return territory?.isCapital === true;
    }
    async processGameAction(action, userId) {
        const cachedState = await cacheService_js_1.gameStateCache.getGameState(action.roomId);
        if (!cachedState) {
            throw new Error('Game not found');
        }
        const gameState = this.hydrateGameState(cachedState, action.roomId);
        if (!this.isValidAction(action, userId, gameState)) {
            throw new Error('Invalid action');
        }
        const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action);
        await this.persistGameStateSnapshot(action.roomId, this.serializeGameState(updatedState));
        logger_js_1.logger.info(`Game action processed for room ${action.roomId}: ${action.type}`);
        return updatedState;
    }
    async initializeGame(roomId, players, gameConfig) {
        const defaultGameConfig = {
            movementType: 'classic_adjacent',
            allowTeamPlay: false,
            teamMode: 'none',
            numberOfTeams: null,
            teamAssignments: undefined,
            maxPlayers: 6,
            gameMode: 'standard',
        };
        const config = { ...defaultGameConfig, ...(gameConfig || {}) };
        if (config.allowTeamPlay) {
            if (!config.teamAssignments) {
                const assignments = {};
                for (const player of players) {
                    if (player.teamId && player.teamId > 0) {
                        if (!assignments[player.teamId]) {
                            assignments[player.teamId] = [];
                        }
                        assignments[player.teamId].push(player.userId);
                    }
                }
                if (Object.keys(assignments).length > 0) {
                    config.teamAssignments = assignments;
                }
            }
        }
        else {
            config.teamAssignments = undefined;
            config.numberOfTeams = null;
        }
        if (!config.mapId) {
            throw new Error('No map selected for game');
        }
        const validation = await mapService_js_1.mapService.validateMapPlayable(config.mapId);
        if (!validation.isValid) {
            const msg = `Selected map failed validation: ${validation.errors.join('; ')}`;
            logger_js_1.logger.warn(msg, { mapId: config.mapId });
            throw new Error(msg);
        }
        const loaded = await (0, mapLoader_js_1.loadMapForEngine)(config.mapId);
        if (!config.sectorBonuses || config.sectorBonuses.length === 0) {
            config.sectorBonuses = loaded.continentBonuses;
            config.continentBonuses = loaded.continentBonuses;
        }
        const gameState = this.gameEngine.initializeGame(roomId, players, config, {
            territories: loaded.territories,
            continentBonuses: loaded.continentBonuses,
        });
        try {
            const crypto = await import('node:crypto');
            const seed = crypto.randomBytes(16).toString('hex');
            const seedStr = `sfc32:${seed}`;
            gameState.combatRngSeed = seedStr;
            try {
                const entry = {
                    type: 'RNG',
                    timestamp: new Date().toISOString(),
                    scope: 'combat',
                    algorithm: 'sfc32',
                    seed: seedStr,
                };
                await this.appendLog(roomId, [entry]);
            }
            catch (logErr) {
                logger_js_1.logger.debug('Skipped RNG seed appendLog', {
                    roomId,
                    error: logErr instanceof Error ? logErr.message : logErr,
                });
            }
        }
        catch (e) {
            logger_js_1.logger.warn('Failed to initialize or log combat RNG seed', {
                roomId,
                error: e instanceof Error ? e.message : e,
            });
        }
        if (config.useTerritoryModifiers) {
            const territoryIds = gameState.board.map((t) => t.id);
            await territoryModifierService_js_1.default.initializeGameModifiers(roomId, config.mapId, territoryIds);
            const modifiers = await territoryModifierService_js_1.default.getGameModifiers(roomId);
            gameState.territoryModifiers = modifiers;
        }
        await this.persistGameStateSnapshot(roomId, this.serializeGameState(gameState));
        this.recordAssassinationAssignments(roomId, gameState);
        if (notificationService_js_1.default.isEnabled()) {
            notificationService_js_1.default
                .notifyGameStart(roomId, players.map((player) => player.userId))
                .catch((error) => {
                logger_js_1.logger.warn('Failed to send game start push notifications', {
                    roomId,
                    error: error instanceof Error ? error.message : error,
                });
            });
        }
        logger_js_1.logger.info(`Game initialized for room ${roomId} with ${players.length} players`);
        return gameState;
    }
    async neutralizePlayerAndResolve(roomId, userId) {
        const cachedState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!cachedState) {
            return null;
        }
        let gameState = this.hydrateGameState(cachedState, roomId);
        const targetPlayer = gameState.players.find((player) => player.id === userId);
        if (targetPlayer) {
            for (const territory of gameState.board) {
                if (territory.ownerId === userId) {
                    territory.ownerId = 'neutral';
                }
            }
            targetPlayer.territories = [];
            targetPlayer.armies = 0;
            targetPlayer.treasures = [];
            targetPlayer.mustCashInTreasures = false;
        }
        let elimination = this.gameEngine.checkGameEnd(gameState);
        if (!elimination.gameEnded && gameState.currentPlayer === userId) {
            const action = {
                type: 'end_turn',
                roomId,
                playerId: userId,
            };
            const { gameState: advancedState } = await this.gameEngine.processAction(gameState, action);
            gameState = advancedState;
            elimination = this.gameEngine.checkGameEnd(gameState);
        }
        if (gameState.gameConfig?.gameMode === 'assassination') {
            this.recordAssassinationElimination(roomId, gameState, elimination, userId, 'neutralize');
        }
        const serializedState = this.serializeGameState(gameState);
        if (gameState.phase === 'finished' || elimination.gameEnded) {
            await cacheService_js_1.gameStateCache.setInactiveGameState(roomId, serializedState);
            this.gameEngine.clearModifiersCache(roomId);
            try {
                const playerStats = this.buildPlayerStats(gameState.players, gameState.board);
                let battleLog = [];
                try {
                    const res = await (0, database_js_1.query)('SELECT game_log FROM game_states WHERE room_id = $1', [roomId]);
                    const raw = res.rows[0]?.game_log;
                    if (Array.isArray(raw)) {
                        battleLog = raw.filter((e) => e && typeof e === 'object' && e.type === 'BATTLE');
                    }
                }
                catch (e) {
                    logger_js_1.logger.warn('Failed to load battle log before neutralize finalization', {
                        roomId,
                        error: e instanceof Error ? e.message : e,
                    });
                }
                const finalization = await this.finalizeCompletedGame(roomId, serializedState, gameState.players, playerStats, battleLog);
                if (finalization.archived) {
                    try {
                        const io = (0, socketRegistry_js_1.tryGetSocketServer)();
                        if (io) {
                            const winnerId = finalization.playerRankings.find((r) => r.isWinner)?.userId ||
                                (serializedState.currentPlayer ?? '');
                            const eliminated = finalization.playerRankings
                                .filter((r) => r.eliminated)
                                .map((r) => r.userId);
                            const delta = deltaUpdates_js_1.DeltaBuilder.gameEnd(roomId, winnerId, eliminated, serializedState.version);
                            io.to(`game:${roomId}`).emit('game-delta', delta);
                        }
                    }
                    catch (e) {
                        logger_js_1.logger.warn('Failed to emit GAME_END delta after neutralize', {
                            roomId,
                            error: e instanceof Error ? e.message : e,
                        });
                    }
                    await this.awardClanContributions(roomId, finalization.playerRankings);
                    try {
                        const { achievementService } = await import('./achievementService.js');
                        const minimal = finalization.playerRankings.map((r) => ({
                            userId: r.userId,
                            isWinner: r.isWinner,
                            eliminated: r.eliminated,
                        }));
                        await achievementService.handleGameCompleted(roomId, minimal);
                    }
                    catch (e) {
                        logger_js_1.logger.warn('Failed to process achievements after neutralize completion', {
                            roomId,
                            error: e instanceof Error ? e.message : e,
                        });
                    }
                }
            }
            catch (e) {
                logger_js_1.logger.error('Failed to finalize game after neutralize', {
                    roomId,
                    error: e instanceof Error ? e.message : e,
                });
            }
        }
        else {
            await this.persistGameStateSnapshot(roomId, serializedState);
        }
        return { state: serializedState, elimination };
    }
    async getGameState(roomId) {
        let cachedState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!cachedState) {
            try {
                const dbResult = await (0, database_js_1.query)('SELECT game_data FROM game_states WHERE room_id = $1', [roomId]);
                if (dbResult.rows.length > 0 && dbResult.rows[0].game_data != null) {
                    const raw = dbResult.rows[0].game_data;
                    if (typeof raw === 'string') {
                        cachedState = JSON.parse(raw);
                    }
                    else if (typeof raw === 'object') {
                        cachedState = raw;
                    }
                    else {
                        throw new Error('game_data has unexpected type');
                    }
                    await this.persistGameStateSnapshot(roomId, cachedState);
                    logger_js_1.logger.info('Loaded game state from database and repopulated cache', { roomId });
                }
                else {
                    return null;
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger_js_1.logger.warn('Error loading game state from database', { roomId, error: errorMessage });
                return null;
            }
        }
        const hydratedState = this.hydrateGameState(cachedState, roomId);
        if (hydratedState.gameConfig?.useTerritoryModifiers && !hydratedState.territoryModifiers) {
            const modifiers = await territoryModifierService_js_1.default.getGameModifiers(roomId);
            if (modifiers.size > 0) {
                hydratedState.territoryModifiers = modifiers;
            }
        }
        return hydratedState;
    }
    async deployArmies(roomId, userId, territoryId, armies) {
        const cachedState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!cachedState)
            throw new Error('Game not found');
        const gameState = this.hydrateGameState(cachedState, roomId);
        if (gameState.currentPlayer !== userId)
            throw new Error('Not your turn');
        if (gameState.phase !== 'reinforcement')
            throw new Error('Not reinforcement phase');
        const action = {
            type: 'deploy',
            roomId,
            playerId: userId,
            payload: { territoryId, armies },
        };
        if (!this.gameEngine.validateAction(gameState, action)) {
            throw new Error('Invalid deployment');
        }
        const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action);
        const serialized = this.serializeGameState(updatedState);
        await this.persistTurnStateTransactional(roomId, serialized);
        await cacheService_js_1.gameStateCache.setGameState(roomId, serialized);
        return {
            gameState: serialized,
            territoryId,
            armies: updatedState.board.find((t) => t.id === territoryId)?.armies || 0,
        };
    }
    async attack(roomId, userId, fromTerritoryId, toTerritoryId) {
        const cachedState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!cachedState)
            throw new Error('Game not found');
        const gameState = this.hydrateGameState(cachedState, roomId);
        if (gameState.currentPlayer !== userId)
            throw new Error('Not your turn');
        if (gameState.phase !== 'attack')
            throw new Error('Not attack phase');
        const action = {
            type: 'attack',
            roomId,
            playerId: userId,
            payload: { fromTerritoryId, toTerritoryId },
        };
        if (!this.gameEngine.validateAction(gameState, action)) {
            throw new Error('Invalid attack');
        }
        const { gameState: updatedState, battleResult } = await this.gameEngine.processAction(gameState, action);
        await this.persistGameStateSnapshot(roomId, this.serializeGameState(updatedState));
        if (updatedState.gameConfig?.gameMode === 'assassination') {
            const elimination = {
                gameEnded: Boolean(battleResult?.gameEnded),
                winner: battleResult?.winner ?? null,
                eliminatedPlayers: battleResult?.eliminatedPlayers ?? [],
            };
            if (elimination.gameEnded) {
                this.recordAssassinationElimination(roomId, updatedState, elimination, userId, 'battle');
            }
        }
        return {
            gameEnded: Boolean(battleResult?.gameEnded),
            winner: battleResult?.winner ?? null,
            eliminatedPlayers: battleResult?.eliminatedPlayers ?? [],
        };
    }
    async transferConquestArmies(roomId, userId, fromTerritoryId, toTerritoryId, armies) {
        const cachedState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!cachedState)
            throw new Error('Game not found');
        const gameState = this.hydrateGameState(cachedState, roomId);
        if (gameState.currentPlayer !== userId) {
            throw new Error('Not your turn');
        }
        if (gameState.phase !== 'attack') {
            throw new Error('Can only transfer conquest armies during attack phase');
        }
        const updatedState = this.gameEngine.transferConquestArmies(gameState, userId, fromTerritoryId, toTerritoryId, armies);
        const serialized = this.serializeGameState(updatedState);
        await this.persistTurnStateTransactional(roomId, serialized);
        await cacheService_js_1.gameStateCache.setGameState(roomId, serialized);
        const fromTerritory = updatedState.board.find((territory) => territory.id === fromTerritoryId);
        const toTerritory = updatedState.board.find((territory) => territory.id === toTerritoryId);
        return {
            gameState: serialized,
            fromArmies: fromTerritory?.armies ?? 0,
            toArmies: toTerritory?.armies ?? 0,
        };
    }
    async fortify(roomId, userId, fromTerritoryId, toTerritoryId, armies) {
        const cachedState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!cachedState)
            throw new Error('Game not found');
        const gameState = this.hydrateGameState(cachedState, roomId);
        if (gameState.currentPlayer !== userId)
            throw new Error('Not your turn');
        if (gameState.phase !== 'fortify')
            throw new Error('Not fortify phase');
        const action = {
            type: 'fortify',
            roomId,
            playerId: userId,
            payload: { fromTerritoryId, toTerritoryId, armies },
        };
        if (!this.gameEngine.validateAction(gameState, action)) {
            throw new Error('Invalid fortification');
        }
        const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action);
        const serialized = this.serializeGameState(updatedState);
        await this.persistTurnStateTransactional(roomId, serialized);
        await cacheService_js_1.gameStateCache.setGameState(roomId, serialized);
        return {
            gameState: serialized,
            fromTerritoryId,
            toTerritoryId,
            fromArmies: updatedState.board.find((t) => t.id === fromTerritoryId)?.armies || 0,
            toArmies: updatedState.board.find((t) => t.id === toTerritoryId)?.armies || 0,
        };
    }
    async endTurn(roomId, userId, options) {
        const cachedState = await cacheService_js_1.gameStateCache.getGameState(roomId);
        if (!cachedState)
            throw new Error('Game not found');
        const gameState = this.hydrateGameState(cachedState);
        if (gameState.currentPlayer !== userId)
            throw new Error('Not your turn');
        if (gameState.phase === 'reinforcement' && !(options?.allowEarlyEnd === true)) {
            const current = gameState.players.find((p) => p.id === userId);
            const remaining = Math.max(0, Math.trunc(current?.armies ?? 0));
            if (remaining > 0) {
                throw new Error(`You still have ${remaining} reinforcements to place`);
            }
        }
        const previousPlayerId = gameState.currentPlayer;
        const previousTurnNumber = Math.max(1, Math.trunc(gameState.turn ?? 1));
        const previousPhase = gameState.phase;
        const previousPlayer = gameState.players.find((p) => p.id === previousPlayerId);
        const prevTreasures = previousPlayer?.treasures;
        const prevHand = Array.isArray(prevTreasures) ? [...prevTreasures] : [];
        const updatedState = this.gameEngine.advancePhase(gameState);
        if (updatedState.phase === 'finished') {
            const finalSerialized = this.serializeGameState(updatedState);
            await cacheService_js_1.gameStateCache.setInactiveGameState(roomId, finalSerialized);
            await this.persistTurnStateTransactional(roomId, finalSerialized);
        }
        else {
            const serialized = this.serializeGameState(updatedState);
            await this.persistTurnStateTransactional(roomId, serialized);
            await cacheService_js_1.gameStateCache.setGameState(roomId, serialized);
        }
        if (notificationService_js_1.default.isEnabled()) {
            const nextPlayerId = updatedState.currentPlayer;
            const participantIds = updatedState.players.map((player) => player.id);
            if (updatedState.phase === 'finished' && previousPhase !== 'finished') {
                const winner = updatedState.players.find((player) => player.id === nextPlayerId && !player.isEliminated);
                notificationService_js_1.default
                    .notifyGameEnd(roomId, winner?.id ?? nextPlayerId, participantIds)
                    .catch((error) => {
                    logger_js_1.logger.warn('Failed to send game end push notifications', {
                        roomId,
                        error: error instanceof Error ? error.message : error,
                    });
                });
            }
            else if (nextPlayerId !== previousPlayerId && updatedState.phase === 'reinforcement') {
                const nextPlayer = updatedState.players.find((player) => player.id === nextPlayerId);
                notificationService_js_1.default
                    .notifyTurnStart(roomId, nextPlayerId, nextPlayer?.username ?? 'Your turn')
                    .catch((error) => {
                    logger_js_1.logger.warn('Failed to send turn start push notification', {
                        roomId,
                        nextPlayerId,
                        error: error instanceof Error ? error.message : error,
                    });
                });
            }
        }
        let treasureAwarded;
        try {
            const afterPlayer = updatedState.players.find((p) => p.id === previousPlayerId);
            const afterTreasures = afterPlayer?.treasures;
            const afterHand = Array.isArray(afterTreasures) ? afterTreasures : [];
            if (afterHand.length > prevHand.length) {
                const counts = new Map();
                for (const m of prevHand)
                    counts.set(m, (counts.get(m) ?? 0) + 1);
                for (const m of afterHand) {
                    const c = counts.get(m) ?? 0;
                    if (c > 0) {
                        counts.set(m, c - 1);
                    }
                    else {
                        treasureAwarded = m;
                        break;
                    }
                }
            }
        }
        catch {
        }
        let reinforcementArmies = 0;
        if (updatedState.phase === 'reinforcement') {
            reinforcementArmies = this.gameEngine.calculateBaseReinforcementArmies(updatedState, updatedState.currentPlayer);
        }
        const turnAdvanced = updatedState.phase === 'finished' || updatedState.currentPlayer !== previousPlayerId;
        if (turnAdvanced) {
            const now = new Date().toISOString();
            const entries = [];
            const endEvent = {
                type: 'TURN',
                timestamp: now,
                playerId: previousPlayerId,
                event: options?.endedByTimeout ? 'MISSED' : 'END',
                turnNumber: previousTurnNumber,
                ...(options?.endedByTimeout ? { reason: 'timeout' } : {}),
            };
            entries.push(endEvent);
            if (treasureAwarded) {
                entries.push({
                    type: 'TREASURE',
                    timestamp: now,
                    userId: previousPlayerId,
                    metal: treasureAwarded,
                });
            }
            const stats = this.buildTurnStatsSnapshot(updatedState);
            try {
                const bulkJobs = [
                    { event: 'append_log', gameId: roomId, data: entries },
                    { event: 'append_turn_stats', gameId: roomId, data: stats },
                ];
                const added = await queueService_js_1.queueService.addAnalyticsEventsBulk?.(bulkJobs);
                if (!added) {
                    setImmediate(() => {
                        this.appendLog(roomId, entries).catch(() => {
                        });
                    });
                    setImmediate(() => {
                        this.appendTurnStats(roomId, stats).catch(() => {
                        });
                    });
                }
            }
            catch {
                setImmediate(() => {
                    this.appendLog(roomId, entries).catch(() => {
                    });
                });
                setImmediate(() => {
                    this.appendTurnStats(roomId, stats).catch(() => {
                    });
                });
            }
        }
        try {
            if (updatedState.phase === 'finished' && previousPhase !== 'finished') {
                const finalSerialized = this.serializeGameState(updatedState);
                const playerStats = this.buildPlayerStats(updatedState.players, updatedState.board);
                let battleLog = [];
                try {
                    const res = await (0, database_js_1.query)('SELECT game_log FROM game_states WHERE room_id = $1', [roomId]);
                    const raw = res.rows[0]?.game_log;
                    if (Array.isArray(raw)) {
                        battleLog = raw.filter((e) => e && typeof e === 'object' && e.type === 'BATTLE');
                    }
                }
                catch (e) {
                    logger_js_1.logger.warn('Failed to load battle log before finalization', {
                        roomId,
                        error: e instanceof Error ? e.message : e,
                    });
                }
                const finalization = await this.finalizeCompletedGame(roomId, finalSerialized, updatedState.players, playerStats, battleLog);
                if (finalization.archived) {
                    try {
                        const io = (0, socketRegistry_js_1.tryGetSocketServer)();
                        if (io) {
                            const winnerId = finalization.playerRankings.find((r) => r.isWinner)?.userId ||
                                (updatedState.currentPlayer ?? '');
                            const eliminated = finalization.playerRankings
                                .filter((r) => r.eliminated)
                                .map((r) => r.userId);
                            const delta = deltaUpdates_js_1.DeltaBuilder.gameEnd(roomId, winnerId, eliminated, finalSerialized.version);
                            io.to(`game:${roomId}`).emit('game-delta', delta);
                        }
                    }
                    catch (e) {
                        logger_js_1.logger.warn('Failed to emit GAME_END delta on endTurn', {
                            roomId,
                            error: e instanceof Error ? e.message : e,
                        });
                    }
                    await this.awardClanContributions(roomId, finalization.playerRankings);
                    try {
                        const { achievementService } = await import('./achievementService.js');
                        const minimal = finalization.playerRankings.map((r) => ({
                            userId: r.userId,
                            isWinner: r.isWinner,
                            eliminated: r.eliminated,
                        }));
                        await achievementService.handleGameCompleted(roomId, minimal);
                    }
                    catch (e) {
                        logger_js_1.logger.warn('Failed to process achievements after game completion', {
                            roomId,
                            error: e instanceof Error ? e.message : e,
                        });
                    }
                }
            }
        }
        catch (e) {
            logger_js_1.logger.error('Failed to finalize game on endTurn', {
                roomId,
                error: e instanceof Error ? e.message : e,
            });
        }
        return {
            gameState: this.serializeGameState(updatedState),
            reinforcementArmies,
            treasureAwarded,
            turnAdvanced,
        };
    }
    isValidAction(action, userId, gameState) {
        if (gameState.currentPlayer !== userId) {
            return false;
        }
        return this.gameEngine.validateAction(gameState, action);
    }
    async processPlaceArmies(gameId, data) {
        return await (0, database_js_1.transaction)(async (client) => {
            const gameState = await this.getGameState(gameId);
            if (!gameState)
                throw new Error('Game not found');
            if (gameState.currentPlayer !== data.playerId || gameState.phase !== 'reinforcement') {
                throw new Error('Invalid placement phase or player');
            }
            const territoryBefore = gameState.board.find((t) => t.id === data.territoryId);
            if (!territoryBefore)
                throw new Error('Territory not found');
            const action = {
                type: 'deploy',
                roomId: gameId,
                playerId: data.playerId,
                payload: { territoryId: data.territoryId, armies: data.armies },
            };
            if (!this.gameEngine.validateAction(gameState, action)) {
                throw new Error('Invalid deployment');
            }
            const previousPhase = gameState.phase;
            const previousPlayerArmies = gameState.players.find((p) => p.id === data.playerId)?.armies ?? 0;
            const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action);
            const updatedTerritory = updatedState.board.find((t) => t.id === data.territoryId);
            const playerAfter = updatedState.players.find((p) => p.id === data.playerId);
            const serializedState = this.serializeGameState(updatedState);
            await client.query(`
        INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
        VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
        ON CONFLICT (room_id) DO UPDATE
          SET game_data = EXCLUDED.game_data,
              turn_number = EXCLUDED.turn_number,
              current_player_id = EXCLUDED.current_player_id,
              game_phase = EXCLUDED.game_phase,
              last_activity = NOW()
        `, [
                gameId,
                JSON.stringify(serializedState),
                Math.max(1, Number(serializedState.turn ?? 1)),
                serializedState.currentPlayer ?? null,
                serializedState.phase,
            ]);
            try {
                await cacheService_js_1.gameStateCache.setGameState(gameId, serializedState);
            }
            catch (error) {
                logger_js_1.logger.warn('Failed to cache game state during deployment', {
                    gameId,
                    error: error instanceof Error ? error.message : error,
                });
            }
            const beforeArmies = territoryBefore.armies;
            const afterArmies = updatedTerritory?.armies ?? beforeArmies;
            const delta = afterArmies - beforeArmies;
            if (delta !== 0) {
                const existing = await client.query('SELECT game_log FROM game_states WHERE room_id = $1', [gameId]);
                const current = Array.isArray(existing.rows[0]?.game_log)
                    ? existing.rows[0]?.game_log
                    : [];
                const entry = {
                    type: 'REINFORCE',
                    timestamp: new Date().toISOString(),
                    playerId: data.playerId,
                    territoryId: data.territoryId,
                    armies: delta,
                    remainingArmies: Math.max(0, playerAfter?.armies ?? 0),
                };
                const updated = [...current, entry].slice(-500);
                await client.query(`UPDATE game_states SET game_log = $1, last_activity = NOW() WHERE room_id = $2`, [JSON.stringify(updated), gameId]);
            }
            let phaseChanged;
            if (previousPhase !== updatedState.phase) {
                phaseChanged = {
                    phase: updatedState.phase,
                    currentPlayer: updatedState.currentPlayer,
                    turn: updatedState.turn,
                    reinforcementArmies: undefined,
                };
            }
            return {
                armies: afterArmies,
                playerArmies: playerAfter?.armies ?? previousPlayerArmies,
                phaseChanged,
                version: updatedState.version,
            };
        });
    }
    async processFortify(gameId, data) {
        return await (0, database_js_1.transaction)(async (client) => {
            const cachedState = await cacheService_js_1.gameStateCache.getGameState(gameId);
            if (!cachedState)
                throw new Error('Game not found');
            const gameState = this.hydrateGameState(cachedState, gameId);
            if (gameState.currentPlayer !== data.playerId)
                throw new Error('Not your turn');
            if (gameState.phase !== 'fortify')
                throw new Error('Not fortify phase');
            const action = {
                type: 'fortify',
                roomId: gameId,
                playerId: data.playerId,
                payload: {
                    fromTerritoryId: data.fromTerritoryId,
                    toTerritoryId: data.toTerritoryId,
                    armies: data.armies,
                },
            };
            if (!this.gameEngine.validateAction(gameState, action)) {
                throw new Error('Invalid fortification');
            }
            const { gameState: updatedState } = await this.gameEngine.processAction(gameState, action);
            const serializedState = this.serializeGameState(updatedState);
            await client.query(`
        INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
        VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
        ON CONFLICT (room_id) DO UPDATE
          SET game_data = EXCLUDED.game_data,
              turn_number = EXCLUDED.turn_number,
              current_player_id = EXCLUDED.current_player_id,
              game_phase = EXCLUDED.game_phase,
              last_activity = NOW()
        `, [
                gameId,
                JSON.stringify(serializedState),
                Math.max(1, Number(serializedState.turn ?? 1)),
                serializedState.currentPlayer ?? null,
                serializedState.phase,
            ]);
            try {
                await cacheService_js_1.gameStateCache.setGameState(gameId, serializedState);
            }
            catch (error) {
                logger_js_1.logger.warn('Failed to cache game state during fortify', {
                    gameId,
                    error: error instanceof Error ? error.message : error,
                });
            }
            const fromArmies = updatedState.board.find((t) => t.id === data.fromTerritoryId)?.armies || 0;
            const toArmies = updatedState.board.find((t) => t.id === data.toTerritoryId)?.armies || 0;
            const existing = await client.query('SELECT game_log FROM game_states WHERE room_id = $1', [gameId]);
            const current = Array.isArray(existing.rows[0]?.game_log)
                ? existing.rows[0]?.game_log
                : [];
            const entry = {
                type: 'FORTIFY',
                timestamp: new Date().toISOString(),
                playerId: data.playerId,
                fromTerritoryId: data.fromTerritoryId,
                toTerritoryId: data.toTerritoryId,
                movedArmies: data.armies,
                fromArmies,
                toArmies,
            };
            const updated = [...current, entry].slice(-500);
            await client.query(`UPDATE game_states SET game_log = $1, last_activity = NOW() WHERE room_id = $2`, [JSON.stringify(updated), gameId]);
            return {
                fromArmies,
                toArmies,
                version: updatedState.version,
            };
        });
    }
    async processEndTurn(gameId, playerId) {
        const result = await this.endTurn(gameId, playerId);
        return { id: result.gameState.currentPlayer };
    }
    async acknowledgeTurnStart(roomId, userId) {
        const state = await this.getGameState(roomId);
        if (!state)
            throw new Error('Game not found');
        if (state.currentPlayer !== userId)
            throw new Error('Not your turn');
        if (state.phase === 'finished') {
            return {
                logged: false,
                reinforcementArmies: 0,
                turnNumber: Math.max(1, Math.trunc(state.turn ?? 1)),
            };
        }
        const turnNumber = Math.max(1, Math.trunc(state.turn ?? 1));
        const reinforcementArmies = this.gameEngine.calculateBaseReinforcementArmies(state, userId);
        const territoryCount = state.board.filter((t) => t.ownerId === userId).length;
        let logged = false;
        let _appendedEntry = null;
        await (0, database_js_1.transaction)(async (client) => {
            const existing = await client.query('SELECT game_log FROM game_states WHERE room_id = $1 FOR UPDATE', [roomId]);
            const current = Array.isArray(existing.rows[0]?.game_log)
                ? existing.rows[0]?.game_log
                : [];
            const alreadyLogged = current.some((entry) => {
                if (!entry || typeof entry !== 'object')
                    return false;
                if (entry.type !== 'TURN')
                    return false;
                const typed = entry;
                return (typed.event === 'START' &&
                    typed.playerId === userId &&
                    (typed.turnNumber ?? turnNumber) === turnNumber);
            });
            if (alreadyLogged) {
                return;
            }
            const entry = {
                type: 'TURN',
                timestamp: new Date().toISOString(),
                playerId: userId,
                event: 'START',
                reinforcementArmies,
                territoryCount,
                turnNumber,
            };
            const sectorEntries = (() => {
                try {
                    const cfg = state.gameConfig;
                    const bonuses = cfg.continentBonuses !== undefined
                        ? cfg.continentBonuses || []
                        : cfg.sectorBonuses || [];
                    if (Array.isArray(bonuses) && bonuses.length > 0) {
                        const owned = new Set(state.board.filter((t) => t.ownerId === userId).map((t) => t.id));
                        const list = [];
                        for (const b of bonuses) {
                            const ownsAll = (b.territories || []).every((tid) => owned.has(tid));
                            if (ownsAll && typeof b.bonusArmies === 'number' && b.bonusArmies > 0) {
                                list.push({
                                    type: 'SECTOR_BONUS',
                                    timestamp: entry.timestamp,
                                    playerId: userId,
                                    sectorId: String(b.id || ''),
                                    sectorName: String(b.name || b.id || 'sector'),
                                    bonus: Math.trunc(b.bonusArmies),
                                });
                            }
                        }
                        return list;
                    }
                }
                catch {
                }
                return [];
            })();
            const updated = [...current, entry, ...sectorEntries].slice(-500);
            await client.query(`INSERT INTO game_states (room_id, game_log, last_activity, game_phase, turn_number)
         VALUES ($1, $2, NOW(), 'lobby', 1)
         ON CONFLICT (room_id) DO UPDATE SET game_log = EXCLUDED.game_log, last_activity = NOW()`, [roomId, JSON.stringify(updated)]);
            logged = true;
            _appendedEntry = entry;
        });
        return { logged, reinforcementArmies, turnNumber };
    }
    async processGoBackToReinforcement(gameId, playerId) {
        const action = {
            type: 'go_back_to_reinforcement',
            roomId: gameId,
            playerId,
        };
        const updatedState = await this.processGameAction(action, playerId);
        const currentPlayer = updatedState.players.find((p) => p.id === playerId);
        const reinforcementArmies = Math.max(0, currentPlayer?.armies ?? 0);
        return {
            phase: updatedState.phase,
            currentPlayer: updatedState.currentPlayer,
            turn: updatedState.turn,
            reinforcementArmies,
            version: updatedState.version,
        };
    }
    async processPhaseChange(gameId, playerId, phase) {
        const gameState = await this.getGameState(gameId);
        if (!gameState)
            throw new Error('Game not found');
        if (gameState.currentPlayer !== playerId) {
            throw new Error('Not your turn');
        }
        try {
            if (gameState.phase === 'attack' && phase !== 'attack') {
                const res = await (0, database_js_1.query)('SELECT game_log FROM game_states WHERE room_id = $1', [gameId]);
                const raw = res.rows[0]?.game_log;
                const log = Array.isArray(raw) ? raw : [];
                const lastBattle = [...log].reverse().find((e) => (e?.type ?? 'BATTLE') === 'BATTLE');
                if (lastBattle && !lastBattle.conquered) {
                    const engagementId = lastBattle.engagementId || lastBattle.jobId;
                    const engagementEntries = log.filter((e) => {
                        if ((e?.type ?? 'BATTLE') !== 'BATTLE')
                            return false;
                        const be = e;
                        return (be.engagementId || be.jobId) === engagementId;
                    });
                    const hasSummary = log.some((e) => e.type === 'ENGAGEMENT_SUMMARY' &&
                        e.engagementId === engagementId);
                    if (!hasSummary && engagementEntries.length > 0) {
                        const first = engagementEntries[0];
                        const totals = engagementEntries.reduce((acc, cur) => {
                            acc.attacker += cur.losses.attacker;
                            acc.defender += cur.losses.defender;
                            return acc;
                        }, { attacker: 0, defender: 0 });
                        const summary = {
                            type: 'ENGAGEMENT_SUMMARY',
                            timestamp: new Date().toISOString(),
                            engagementId,
                            attackingTerritoryId: first.attackingTerritoryId,
                            defendingTerritoryId: first.defendingTerritoryId,
                            attackerId: first.attackerId,
                            defenderId: first.defenderId,
                            initialFromArmies: Math.max(0, first.initialFromArmies ?? 0),
                            initialToArmies: Math.max(0, first.initialToArmies ?? 0),
                            totalLosses: totals,
                            conquered: false,
                        };
                        await this.appendLog(gameId, [summary]);
                    }
                }
            }
        }
        catch (e) {
            logger_js_1.logger.warn('Failed to flush engagement summary on phase change', {
                gameId,
                phase,
                error: e instanceof Error ? e.message : e,
            });
        }
        gameState.phase = phase;
        await this.persistGameStateSnapshot(gameId, this.serializeGameState(gameState));
    }
    async applyBattleResult(gameId, payload) {
        const { jobId, attackerLosses, defenderLosses, territoryConquered, attackingArmiesRemaining, defendingArmiesRemaining, dice, attackingTerritoryId, defendingTerritoryId, attackingPlayerId, defendingPlayerId, attackingArmiesCommitted, attackerArmiesBeforeRoll, defenderArmiesBeforeRoll, } = payload;
        const gameState = await this.getGameState(gameId);
        if (!gameState)
            throw new Error('Game not found');
        const attackerTerritory = gameState.board.find((t) => t.id === attackingTerritoryId);
        const defenderTerritory = gameState.board.find((t) => t.id === defendingTerritoryId);
        if (!attackerTerritory || !defenderTerritory) {
            throw new Error('Territory not found');
        }
        const attackerId = attackerTerritory.ownerId ?? attackingPlayerId;
        if (!attackerId) {
            throw new Error('Attacking player missing from state');
        }
        const defenderId = defenderTerritory.ownerId ?? defendingPlayerId ?? null;
        const preMoveAttackerArmies = Math.max(attackingArmiesRemaining, 0);
        const maxMovable = Math.max(preMoveAttackerArmies - 1, 0);
        const movingArmies = territoryConquered
            ? Math.max(0, Math.min(attackingArmiesCommitted, maxMovable))
            : 0;
        const finalAttackerArmies = territoryConquered
            ? Math.max(preMoveAttackerArmies - movingArmies, 1)
            : Math.max(preMoveAttackerArmies, 1);
        const finalDefenderArmies = territoryConquered
            ? Math.max(movingArmies, 0)
            : Math.max(defendingArmiesRemaining, 0);
        const updatedBoard = gameState.board.map((territory) => {
            if (territory.id === attackingTerritoryId) {
                return {
                    ...territory,
                    armies: finalAttackerArmies,
                };
            }
            if (territory.id === defendingTerritoryId) {
                return {
                    ...territory,
                    ownerId: territoryConquered ? attackerId : territory.ownerId,
                    armies: finalDefenderArmies,
                };
            }
            return territory;
        });
        const playersAfterBattle = this.rebuildPlayersAfterBattle(gameState.players, updatedBoard);
        const activePlayers = playersAfterBattle.filter((player) => !player.isEliminated);
        const gameEnded = activePlayers.length <= 1;
        const winner = gameEnded ? (activePlayers[0] ?? null) : null;
        const lastBattleResult = {
            attackerDice: dice.attacker,
            defenderDice: dice.defender,
            attackerLosses,
            defenderLosses,
            conquered: territoryConquered,
            fromTerritory: {
                id: attackingTerritoryId,
                name: attackerTerritory.name,
                armies: finalAttackerArmies,
            },
            toTerritory: {
                id: defendingTerritoryId,
                name: defenderTerritory.name,
                armies: finalDefenderArmies,
                ownerId: territoryConquered
                    ? attackerId
                    : (defenderTerritory.ownerId ?? defenderId ?? attackerId),
            },
            pendingConquestFor: territoryConquered ? attackerId : null,
            gameEnded,
            winner,
            eliminatedPlayers: playersAfterBattle
                .filter((player) => player.isEliminated)
                .map((p) => p.id),
        };
        const updatedGameState = {
            ...gameState,
            board: updatedBoard,
            players: playersAfterBattle,
            lastBattleResult,
            hasAttackedThisTurn: true,
            conqueredDuringTurn: (gameState.conqueredDuringTurn ?? false) || territoryConquered,
            phase: gameEnded ? 'finished' : gameState.phase,
            currentPlayer: gameEnded && winner ? winner.id : gameState.currentPlayer,
        };
        let serializedState = this.serializeGameState(updatedGameState);
        const playerStats = this.buildPlayerStats(playersAfterBattle, updatedBoard);
        const initialFrom = typeof attackerArmiesBeforeRoll === 'number'
            ? Math.max(0, attackerArmiesBeforeRoll)
            : Math.max(0, attackingArmiesRemaining + attackerLosses);
        const initialTo = typeof defenderArmiesBeforeRoll === 'number'
            ? Math.max(0, defenderArmiesBeforeRoll)
            : Math.max(0, defendingArmiesRemaining + defenderLosses);
        let engagementId;
        try {
            const existing = await (0, database_js_1.query)('SELECT game_log FROM game_states WHERE room_id = $1', [gameId]);
            const list = (existing.rows[0]?.game_log || []);
            const last = [...list].reverse().find((e) => (e?.type ?? 'BATTLE') === 'BATTLE');
            if (last &&
                last.attackingTerritoryId === attackingTerritoryId &&
                last.defendingTerritoryId === defendingTerritoryId &&
                last.attackerId === attackerId &&
                (last.defenderId || null) === (defenderId || null) &&
                !last.conquered) {
                engagementId = last.engagementId || last.jobId;
            }
        }
        catch {
        }
        if (!engagementId) {
            engagementId = `${attackingTerritoryId}->${defendingTerritoryId}:${Date.now()}`;
        }
        const logEntry = {
            type: 'BATTLE',
            jobId,
            timestamp: new Date().toISOString(),
            engagementId,
            attackingTerritoryId,
            defendingTerritoryId,
            attackerId,
            defenderId,
            losses: {
                attacker: attackerLosses,
                defender: defenderLosses,
            },
            conquered: territoryConquered,
            movedArmies: territoryConquered ? finalDefenderArmies : undefined,
            eliminatedPlayers: lastBattleResult.eliminatedPlayers ?? [],
            initialFromArmies: initialFrom,
            initialToArmies: initialTo,
        };
        let persistenceOutcome;
        let latestBattleLog = [];
        try {
            persistenceOutcome = await (0, database_js_1.transaction)(async (client) => {
                const existingStateResult = await client.query('SELECT territories, game_log, winner_id FROM game_states WHERE room_id = $1 FOR UPDATE', [gameId]);
                const existingRow = existingStateResult.rows[0];
                const existingLog = Array.isArray(existingRow?.game_log)
                    ? existingRow?.game_log
                    : [];
                latestBattleLog = existingLog;
                const alreadyApplied = existingLog.some((entry) => entry?.jobId === jobId);
                const divergence = this.calculateTerritoryDivergence(existingRow?.territories ?? null, updatedBoard);
                if (alreadyApplied) {
                    return { applied: false, divergence };
                }
                const lastBattle = [...existingLog]
                    .reverse()
                    .find((e) => (e?.type ?? 'BATTLE') === 'BATTLE');
                const lastEngagementId = lastBattle
                    ? lastBattle.engagementId || lastBattle.jobId
                    : undefined;
                const startsNewEngagement = !lastBattle ||
                    lastBattle.attackingTerritoryId !== attackingTerritoryId ||
                    lastBattle.defendingTerritoryId !== defendingTerritoryId ||
                    lastBattle.attackerId !== attackerId ||
                    (lastBattle.defenderId || null) !== (defenderId || null);
                let preExtra = [];
                if (startsNewEngagement && lastBattle && !lastBattle.conquered && lastEngagementId) {
                    const engagementEntries = existingLog.filter((e) => {
                        if ((e?.type ?? 'BATTLE') !== 'BATTLE')
                            return false;
                        const be = e;
                        return (be.engagementId || be.jobId) === lastEngagementId;
                    });
                    if (engagementEntries.length > 0) {
                        const first = engagementEntries[0];
                        const totals = engagementEntries.reduce((acc, cur) => {
                            acc.attacker += cur.losses.attacker;
                            acc.defender += cur.losses.defender;
                            return acc;
                        }, { attacker: 0, defender: 0 });
                        preExtra = [
                            {
                                type: 'ENGAGEMENT_SUMMARY',
                                timestamp: new Date().toISOString(),
                                engagementId: lastEngagementId,
                                attackingTerritoryId: first.attackingTerritoryId,
                                defendingTerritoryId: first.defendingTerritoryId,
                                attackerId: first.attackerId,
                                defenderId: first.defenderId,
                                initialFromArmies: Math.max(0, first.initialFromArmies ?? 0),
                                initialToArmies: Math.max(0, first.initialToArmies ?? 0),
                                totalLosses: totals,
                                conquered: false,
                            },
                        ];
                    }
                }
                let extra = [];
                if (logEntry.conquered) {
                    const engagementEntries = [...existingLog, logEntry].filter((e) => {
                        if ((e?.type ?? 'BATTLE') !== 'BATTLE')
                            return false;
                        const be = e;
                        return be.engagementId === engagementId;
                    });
                    const first = engagementEntries[0];
                    const totals = engagementEntries.reduce((acc, cur) => {
                        acc.attacker += cur.losses.attacker;
                        acc.defender += cur.losses.defender;
                        return acc;
                    }, { attacker: 0, defender: 0 });
                    const summary = {
                        type: 'ENGAGEMENT_SUMMARY',
                        timestamp: new Date().toISOString(),
                        engagementId,
                        attackingTerritoryId,
                        defendingTerritoryId,
                        attackerId,
                        defenderId,
                        initialFromArmies: Math.max(0, first?.initialFromArmies ?? initialFrom),
                        initialToArmies: Math.max(0, first?.initialToArmies ?? initialTo),
                        totalLosses: totals,
                        conquered: true,
                    };
                    extra = [summary];
                }
                const updatedLog = [...existingLog, ...preExtra, logEntry, ...extra].slice(-500);
                latestBattleLog = updatedLog;
                const roundNumber = this.calculateRoundNumber(updatedGameState);
                await client.query(`INSERT INTO game_states (
            room_id,
            current_player_id,
            game_phase,
            turn_number,
            round_number,
            territories,
            player_stats,
            game_log,
            last_activity,
            winner_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
          ON CONFLICT (room_id) DO UPDATE SET
            current_player_id = EXCLUDED.current_player_id,
            game_phase = EXCLUDED.game_phase,
            turn_number = EXCLUDED.turn_number,
            round_number = EXCLUDED.round_number,
            territories = EXCLUDED.territories,
            player_stats = EXCLUDED.player_stats,
            game_log = EXCLUDED.game_log,
            last_activity = NOW(),
            winner_id = EXCLUDED.winner_id`, [
                    gameId,
                    serializedState.currentPlayer,
                    serializedState.phase,
                    serializedState.turn,
                    roundNumber,
                    JSON.stringify(serializedState.board),
                    JSON.stringify(playerStats),
                    JSON.stringify(updatedLog),
                    gameEnded ? (winner?.id ?? null) : (existingRow?.winner_id ?? null),
                ]);
                return { applied: true, divergence };
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown battle persistence error';
            metricsService_js_1.battleMetrics.recordFailure(message, { gameId, jobId });
            throw error;
        }
        const status = persistenceOutcome.applied ? 'applied' : 'duplicate';
        metricsService_js_1.battleMetrics.recordApply(gameId, status, persistenceOutcome.divergence);
        if (persistenceOutcome.applied) {
            try {
                if (lastBattleResult.eliminatedPlayers && lastBattleResult.eliminatedPlayers.length > 0) {
                    const cfg = (0, hiddenTreasures_js_1.normalizeTreasureConfig)(updatedGameState.gameConfig.treasureConfig);
                    if (cfg.enabled) {
                        const eliminator = updatedGameState.players.find((p) => p.id === attackerId);
                        if (eliminator) {
                            let eliminatorHand;
                            if (Array.isArray(eliminator.treasures)) {
                                eliminatorHand = eliminator.treasures;
                            }
                            else {
                                eliminator.treasures = [];
                                eliminatorHand = eliminator.treasures;
                            }
                            let transferred = 0;
                            for (const elimId of lastBattleResult.eliminatedPlayers) {
                                const eliminated = updatedGameState.players.find((p) => p.id === elimId);
                                const has = Array.isArray(eliminated?.treasures) && (eliminated?.treasures?.length ?? 0) > 0;
                                if (!eliminated || !has)
                                    continue;
                                eliminatorHand.push(...eliminated.treasures);
                                transferred += eliminated.treasures.length;
                                eliminated.treasures = [];
                                eliminated.mustCashInTreasures = false;
                            }
                            if (transferred > 0 && eliminatorHand.length >= cfg.handCap) {
                                const hasValidSet = (0, hiddenTreasures_js_1.findRedeemableSets)(eliminatorHand)
                                    .length > 0;
                                eliminator.mustCashInTreasures = hasValidSet;
                                if (hasValidSet && eliminator.id === updatedGameState.currentPlayer) {
                                    updatedGameState.mustCashInTreasures = true;
                                }
                            }
                        }
                    }
                }
            }
            catch (e) {
                logger_js_1.logger.warn('Failed to transfer eliminated treasures in applyBattleResult', {
                    gameId,
                    error: e instanceof Error ? e.message : e,
                });
            }
            serializedState = this.serializeGameState(updatedGameState);
            await this.persistTurnStateTransactional(gameId, serializedState);
            try {
                await cacheService_js_1.gameStateCache.setGameState(gameId, serializedState);
            }
            catch {
            }
        }
        if (persistenceOutcome.applied && gameEnded) {
            const finalization = await this.finalizeCompletedGame(gameId, serializedState, playersAfterBattle, playerStats, latestBattleLog.filter((e) => e.type === 'BATTLE'));
            metricsService_js_1.battleMetrics.clearGame(gameId);
            if (finalization.archived) {
                try {
                    const io = (0, socketRegistry_js_1.tryGetSocketServer)();
                    if (io) {
                        const winnerId = finalization.playerRankings.find((r) => r.isWinner)?.userId ||
                            (serializedState.currentPlayer ?? '');
                        const eliminated = finalization.playerRankings
                            .filter((r) => r.eliminated)
                            .map((r) => r.userId);
                        const delta = deltaUpdates_js_1.DeltaBuilder.gameEnd(gameId, winnerId, eliminated, serializedState.version);
                        io.to(`game:${gameId}`).emit('game-delta', delta);
                    }
                }
                catch (e) {
                    logger_js_1.logger.warn('Failed to emit GAME_END delta after battle', {
                        gameId,
                        error: e instanceof Error ? e.message : e,
                    });
                }
                await this.awardClanContributions(gameId, finalization.playerRankings);
                try {
                    const { achievementService } = await import('./achievementService.js');
                    const minimal = finalization.playerRankings.map((r) => ({
                        userId: r.userId,
                        isWinner: r.isWinner,
                        eliminated: r.eliminated,
                    }));
                    await achievementService.handleGameCompleted(gameId, minimal);
                }
                catch (e) {
                    logger_js_1.logger.warn('Failed to process achievements after game completion', {
                        gameId,
                        error: e instanceof Error ? e.message : e,
                    });
                }
            }
        }
        return { applied: persistenceOutcome.applied };
    }
    rebuildPlayersAfterBattle(players, board) {
        return players.map((player) => {
            const territories = board.filter((territory) => territory.ownerId === player.id);
            const territoryIds = territories.map((territory) => territory.id);
            const totalArmies = territories.reduce((sum, territory) => sum + territory.armies, 0);
            return {
                ...player,
                territories: territoryIds,
                armies: totalArmies,
                isEliminated: territoryIds.length === 0,
            };
        });
    }
    buildPlayerStats(players, board) {
        const boardByOwner = board.reduce((acc, territory) => {
            if (!territory.ownerId)
                return acc;
            if (!acc[territory.ownerId]) {
                acc[territory.ownerId] = { territories: 0, armies: 0 };
            }
            acc[territory.ownerId].territories += 1;
            acc[territory.ownerId].armies += territory.armies;
            return acc;
        }, {});
        return players.reduce((acc, player) => {
            const metrics = boardByOwner[player.id] ?? { territories: 0, armies: 0 };
            acc[player.id] = {
                territories: metrics.territories,
                armies: metrics.armies,
                eliminated: player.isEliminated,
            };
            return acc;
        }, {});
    }
    calculateTerritoryDivergence(persisted, updatedBoard) {
        const normalized = this.normalizeTerritoriesInput(persisted);
        if (!normalized || normalized.length === 0) {
            return updatedBoard.length;
        }
        const persistedById = new Map();
        for (const territory of normalized) {
            persistedById.set(territory.id, territory);
        }
        let divergences = 0;
        for (const territory of updatedBoard) {
            const persistedTerritory = persistedById.get(territory.id);
            if (!persistedTerritory) {
                divergences += 1;
                continue;
            }
            if (persistedTerritory.ownerId !== territory.ownerId ||
                persistedTerritory.armies !== territory.armies) {
                divergences += 1;
            }
        }
        return divergences;
    }
    normalizeTerritoriesInput(input) {
        if (Array.isArray(input)) {
            return input;
        }
        if (typeof input === 'string') {
            try {
                const parsed = JSON.parse(input);
                if (Array.isArray(parsed))
                    return parsed;
                if (parsed && Array.isArray(parsed.board)) {
                    return parsed.board;
                }
            }
            catch {
                return null;
            }
        }
        if (input && typeof input === 'object') {
            const maybe = input;
            if (Array.isArray(maybe.board))
                return maybe.board;
        }
        return null;
    }
    async appendTurnStats(roomId, snapshot) {
        await (0, database_js_1.transaction)(async (client) => {
            const res = await client.query('SELECT turn_stats FROM game_states WHERE room_id = $1 FOR UPDATE', [roomId]);
            const current = (Array.isArray(res.rows[0]?.turn_stats) ? res.rows[0]?.turn_stats : []);
            const updated = [...current, snapshot].slice(-500);
            await client.query(`INSERT INTO game_states (room_id, turn_stats, last_activity, game_phase, turn_number)
         VALUES ($1, $2, NOW(), 'lobby', 1)
         ON CONFLICT (room_id) DO UPDATE SET turn_stats = EXCLUDED.turn_stats, last_activity = NOW()`, [roomId, JSON.stringify(updated)]);
        });
    }
    buildTurnStatsSnapshot(state, at) {
        const when = (at ?? new Date()).toISOString();
        const players = state.players.map((p) => ({
            id: p.id,
            territories: state.board.filter((t) => t.ownerId === p.id).length,
            armies: state.board.reduce((sum, t) => (t.ownerId === p.id ? sum + t.armies : sum), 0),
            eliminated: p.isEliminated,
        }));
        return {
            turn: state.turn,
            phase: state.phase,
            currentPlayerId: state.currentPlayer,
            timestamp: when,
            players,
        };
    }
    calculateRoundNumber(gameState) {
        const activePlayers = gameState.players.filter((player) => !player.isEliminated).length;
        const divisor = Math.max(activePlayers, 1);
        return Math.max(1, Math.ceil(gameState.turn / divisor));
    }
    buildEliminationOrder(battleLog) {
        const order = [];
        for (const entry of battleLog) {
            for (const eliminated of entry.eliminatedPlayers ?? []) {
                if (eliminated && !order.includes(eliminated)) {
                    order.push(eliminated);
                }
            }
        }
        return order;
    }
    buildPlayerRanking(players, playerStatsSnapshot, battleLog) {
        const eliminationOrder = this.buildEliminationOrder(battleLog);
        const playersById = new Map(players.map((player) => [player.id, player]));
        const winner = players.find((player) => !player.isEliminated) ?? null;
        const orderedIds = [];
        if (winner) {
            orderedIds.push(winner.id);
        }
        for (const eliminated of eliminationOrder) {
            if (!orderedIds.includes(eliminated) && playersById.has(eliminated)) {
                orderedIds.push(eliminated);
            }
        }
        for (const player of players) {
            if (!orderedIds.includes(player.id)) {
                orderedIds.push(player.id);
            }
        }
        return orderedIds.map((playerId, index) => {
            const stats = playerStatsSnapshot[playerId] ?? {
                territories: 0,
                armies: 0,
                eliminated: true,
            };
            const eliminationIndex = eliminationOrder.indexOf(playerId);
            const player = playersById.get(playerId);
            return {
                userId: playerId,
                position: index + 1,
                isWinner: winner?.id === playerId,
                eliminated: stats.eliminated ?? player?.isEliminated ?? true,
                territories: stats.territories,
                armies: stats.armies,
                eliminationOrder: eliminationIndex === -1 ? null : eliminationIndex + 1,
            };
        });
    }
    calculateClanXp(ranking) {
        const placementBonus = CLAN_XP_TOP_PLACEMENTS[ranking.position] ?? 0;
        const territoryBonus = Math.min(CLAN_XP_TERRITORY_CAP, Math.max(0, ranking.territories * CLAN_XP_TERRITORY_FACTOR));
        const rawTotal = CLAN_XP_BASE + placementBonus + territoryBonus + (ranking.isWinner ? CLAN_XP_WIN_BONUS : 0);
        return Math.max(CLAN_XP_BASE, Math.round(rawTotal));
    }
    async awardClanContributions(gameId, rankings) {
        if (rankings.length === 0) {
            return;
        }
        try {
            await featureFlagService_js_1.featureFlagService.evaluateFlagByName('clans_enabled');
        }
        catch (_err) {
        }
        let membershipMap;
        try {
            membershipMap = await clanService_js_1.clanService.getActiveMembershipsForUsers(rankings.map((ranking) => ranking.userId));
        }
        catch (error) {
            logger_js_1.logger.error('Failed to load clan memberships for awarding contributions', {
                gameId,
                error: error instanceof Error ? error.message : error,
            });
            return;
        }
        if (membershipMap.size === 0) {
            return;
        }
        for (const ranking of rankings) {
            const membership = membershipMap.get(ranking.userId);
            if (!membership) {
                continue;
            }
            const xp = this.calculateClanXp(ranking);
            if (xp <= 0) {
                continue;
            }
            try {
                const contribution = await clanProgressionService_js_1.clanProgressionService.awardContribution({
                    clanId: membership.clanId,
                    userId: ranking.userId,
                    actorUserId: ranking.userId,
                    xp,
                    matchesPlayed: 1,
                    matchesWon: ranking.isWinner ? 1 : 0,
                    source: 'game_result',
                    metadata: {
                        gameId,
                        placement: ranking.position,
                        territories: ranking.territories,
                        armies: ranking.armies,
                        eliminated: ranking.eliminated,
                    },
                });
                this.emitClanProgressionUpdate({
                    clanId: contribution.clanId,
                    gameId,
                    userId: ranking.userId,
                    xpAwarded: xp,
                    matchesPlayed: 1,
                    matchesWon: ranking.isWinner ? 1 : 0,
                    placement: ranking.position,
                    territories: ranking.territories,
                    armies: ranking.armies,
                    eliminated: ranking.eliminated,
                    progression: contribution.progression,
                    objectiveUpdates: contribution.objectiveUpdates,
                });
            }
            catch (error) {
                if (error instanceof clanProgressionService_js_1.ClanProgressionServiceError) {
                    logger_js_1.logger.warn('Skipped clan contribution for player', {
                        gameId,
                        userId: ranking.userId,
                        clanId: membership.clanId,
                        code: error.code,
                    });
                    continue;
                }
                logger_js_1.logger.error('Failed to award clan contribution', {
                    gameId,
                    userId: ranking.userId,
                    clanId: membership.clanId,
                    error: error instanceof Error ? error.message : error,
                });
            }
        }
    }
    emitClanProgressionUpdate(payload) {
        const io = (0, socketRegistry_js_1.tryGetSocketServer)();
        if (!io) {
            return;
        }
        io.to(`clan:${payload.clanId}`).emit('clan:progress', payload);
    }
    async finalizeCompletedGame(gameId, serializedState, players, playerStatsSnapshot, battleLog) {
        const playerRankings = this.buildPlayerRanking(players, playerStatsSnapshot, battleLog);
        const winner = playerRankings.find((ranking) => ranking.isWinner) ?? null;
        const playerIds = playerRankings.map((ranking) => ranking.userId);
        const finalStateJson = JSON.stringify(serializedState);
        const battleLogJson = JSON.stringify(battleLog);
        const totalTurns = serializedState.turn ?? 0;
        const archiveTimestamp = new Date();
        let finalRatingChanges = [];
        let isRankedGame = false;
        const persisted = await (0, database_js_1.transaction)(async (client) => {
            const existingResult = await client.query('SELECT room_id FROM game_results WHERE room_id = $1', [gameId]);
            if ((existingResult.rowCount ?? 0) > 0) {
                return false;
            }
            const roomResult = await client.query('SELECT map_id, started_at, ended_at, is_ranked FROM game_rooms WHERE id = $1 FOR UPDATE', [gameId]);
            if ((roomResult.rowCount ?? 0) === 0) {
                throw new Error('Game room not found during archival');
            }
            const room = roomResult.rows[0];
            isRankedGame = Boolean(room.is_ranked);
            const startedAt = room.started_at ? new Date(room.started_at) : null;
            const durationSeconds = startedAt !== null
                ? Math.max(0, Math.round((archiveTimestamp.getTime() - startedAt.getTime()) / 1000))
                : null;
            await client.query(`UPDATE game_rooms
         SET status = 'completed',
             ended_at = COALESCE(ended_at, NOW()),
             winner_id = $2,
             updated_at = NOW()
         WHERE id = $1`, [gameId, winner?.userId ?? null]);
            const usersResult = await client.query('SELECT id, username, skill_rating, created_at FROM users WHERE id = ANY($1)', [playerIds]);
            const userMap = new Map(usersResult.rows.map((user) => [user.id, user]));
            const statsResult = await client.query('SELECT user_id, games_played FROM player_stats WHERE user_id = ANY($1)', [playerIds]);
            const statsMap = new Map(statsResult.rows.map((row) => [row.user_id, row.games_played]));
            const playerRatings = playerRankings.map((ranking) => ({
                userId: ranking.userId,
                currentRating: userMap.get(ranking.userId)?.skill_rating ?? 800,
                gamesPlayed: statsMap.get(ranking.userId) ?? 0,
                position: ranking.position,
            }));
            let ratingChanges = [];
            try {
                ratingChanges = eloService_js_1.eloService.calculateRatingChanges(playerRatings);
            }
            catch (error) {
                logger_js_1.logger.warn('Skipping ELO calculation for game', {
                    gameId,
                    playerCount: playerRatings.length,
                    error: error instanceof Error ? error.message : error,
                });
            }
            if (ratingChanges.length > 0) {
                const ratingInputMap = new Map(playerRatings.map((player) => [player.userId, player]));
                logger_js_1.logger.info('Calculated rating changes for completed ranked game', {
                    gameId,
                    players: ratingChanges.length,
                    breakdown: ratingChanges.map((change) => {
                        const input = ratingInputMap.get(change.userId);
                        return {
                            userId: change.userId,
                            position: input?.position ?? null,
                            gamesPlayed: input?.gamesPlayed ?? null,
                            oldRating: change.oldRating,
                            newRating: change.newRating,
                            delta: change.change,
                            expectedScore: Number(change.expectedScore.toFixed(3)),
                            actualScore: Number(change.actualScore.toFixed(3)),
                            kFactor: Number(change.kFactor.toFixed(2)),
                        };
                    }),
                });
            }
            const ratingChangeMap = new Map(ratingChanges.map((change) => [change.userId, change]));
            const playerSummary = playerRankings.map((ranking) => {
                const user = userMap.get(ranking.userId);
                const ratingChange = ratingChangeMap.get(ranking.userId);
                return {
                    userId: ranking.userId,
                    username: user?.username ?? ranking.userId,
                    position: ranking.position,
                    isWinner: ranking.isWinner,
                    eliminated: ranking.eliminated,
                    territories: ranking.territories,
                    armies: ranking.armies,
                    eliminationOrder: ranking.eliminationOrder,
                    ratingBefore: ratingChange?.oldRating ?? user?.skill_rating ?? 800,
                    ratingAfter: ratingChange?.newRating ?? user?.skill_rating ?? 800,
                    ratingChange: ratingChange?.change ?? 0,
                };
            });
            await client.query(`INSERT INTO game_results (
           room_id,
           map_id,
           winner_id,
           duration_seconds,
           total_turns,
           final_state,
           player_summary,
           battle_log
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
         ON CONFLICT (room_id) DO NOTHING`, [
                gameId,
                room.map_id,
                winner?.userId ?? null,
                durationSeconds,
                totalTurns,
                finalStateJson,
                JSON.stringify(playerSummary),
                battleLogJson,
            ]);
            if (playerRankings.length > 0) {
                const playerStatsPlaceholders = [];
                const playerStatsValues = [];
                playerRankings.forEach((ranking, index) => {
                    const baseIndex = index * 4;
                    playerStatsPlaceholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`);
                    playerStatsValues.push(ranking.userId, 1, ranking.isWinner ? 1 : 0, ranking.isWinner ? 0 : 1);
                });
                await client.query(`INSERT INTO player_stats (user_id, games_played, games_won, games_lost)
           VALUES ${playerStatsPlaceholders.join(', ')}
           ON CONFLICT (user_id) DO UPDATE SET
             games_played = player_stats.games_played + EXCLUDED.games_played,
             games_won = player_stats.games_won + EXCLUDED.games_won,
             games_lost = player_stats.games_lost + EXCLUDED.games_lost,
             updated_at = NOW()`, playerStatsValues);
            }
            if (playerRankings.length > 0) {
                const resultsPlaceholders = [];
                const resultsValues = [];
                playerRankings.forEach((ranking, index) => {
                    const ratingChange = ratingChangeMap.get(ranking.userId);
                    const user = userMap.get(ranking.userId);
                    const ratingBefore = ratingChange?.oldRating ?? user?.skill_rating ?? 800;
                    const ratingAfter = ratingChange?.newRating ?? user?.skill_rating ?? 800;
                    const ratingDelta = ratingChange?.change ?? 0;
                    const baseIndex = index * 11;
                    resultsPlaceholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`);
                    resultsValues.push(gameId, ranking.userId, ranking.position, ranking.isWinner, ranking.eliminated, ranking.territories, ranking.armies, ranking.eliminationOrder, ratingBefore, ratingAfter, ratingDelta);
                });
                await client.query(`INSERT INTO player_game_results (
             room_id,
             user_id,
             position,
             is_winner,
             eliminated,
             territories,
             armies,
             elimination_order,
             rating_before,
             rating_after,
             rating_change
           ) VALUES ${resultsPlaceholders.join(', ')}
           ON CONFLICT (room_id, user_id) DO UPDATE SET
             position = EXCLUDED.position,
             is_winner = EXCLUDED.is_winner,
             eliminated = EXCLUDED.eliminated,
             territories = EXCLUDED.territories,
             armies = EXCLUDED.armies,
             elimination_order = EXCLUDED.elimination_order,
             rating_before = EXCLUDED.rating_before,
             rating_after = EXCLUDED.rating_after,
             rating_change = EXCLUDED.rating_change`, resultsValues);
            }
            for (const ranking of playerRankings) {
                await client.query(`UPDATE room_players
           SET is_eliminated = $3,
               elimination_reason = CASE WHEN $3 THEN COALESCE(elimination_reason, 'defeated') ELSE elimination_reason END,
               left_at = CASE WHEN $3 THEN COALESCE(left_at, NOW()) ELSE left_at END,
               player_order = $4
           WHERE room_id = $1 AND user_id = $2`, [gameId, ranking.userId, ranking.eliminated, ranking.position]);
            }
            if (ratingChanges.length > 0) {
                await eloService_js_1.eloService.applyRatingChanges(gameId, ratingChanges, client);
            }
            await eloService_js_1.eloService.updateLeaderboardCache(client);
            finalRatingChanges = ratingChanges;
            return true;
        });
        await cacheService_js_1.gameStateCache.setInactiveGameState(gameId, serializedState);
        if (persisted) {
            logger_js_1.logger.info('Archived completed game', {
                gameId,
                winnerId: winner?.userId ?? null,
            });
        }
        try {
            if (isRankedGame && finalRatingChanges && finalRatingChanges.length > 0) {
                const io = (0, socketRegistry_js_1.tryGetSocketServer)();
                if (io) {
                    io.to(`game:${gameId}`).emit('ratingUpdate', {
                        changes: finalRatingChanges.map((c) => ({
                            userId: c.userId,
                            oldRating: c.oldRating,
                            newRating: c.newRating,
                            change: c.change,
                        })),
                    });
                }
            }
        }
        catch (e) {
            logger_js_1.logger.warn('Failed to emit ratingUpdate socket event', {
                gameId,
                error: e instanceof Error ? e.message : e,
            });
        }
        try {
            if (finalRatingChanges && finalRatingChanges.length > 0) {
                const ts = new Date().toISOString();
                const ratingEntries = finalRatingChanges.map((rc) => ({
                    type: 'RATING',
                    timestamp: ts,
                    userId: rc.userId,
                    change: rc.change,
                    oldRating: rc.oldRating,
                    newRating: rc.newRating,
                }));
                await this.appendLog(gameId, ratingEntries);
            }
            try {
                const tsEnd = new Date().toISOString();
                const eliminated = playerRankings.filter((r) => r.eliminated).map((r) => r.userId);
                const winnerId = (winner?.userId ?? serializedState.currentPlayer ?? '');
                const endEntry = {
                    type: 'GAME_END',
                    timestamp: tsEnd,
                    winner: winnerId,
                    eliminatedPlayers: eliminated,
                };
                await this.appendLog(gameId, [endEntry]);
            }
            catch (logErr) {
                logger_js_1.logger.warn('Failed to append GAME_END log', {
                    gameId,
                    error: logErr instanceof Error ? logErr.message : logErr,
                });
            }
        }
        catch (e) {
            logger_js_1.logger.warn('Failed to append rating change logs', {
                gameId,
                error: e instanceof Error ? e.message : e,
            });
        }
        return { archived: persisted, playerRankings };
    }
    async archiveGameResults(gameId, results) {
        logger_js_1.logger.debug(`Archiving game ${gameId}:`, results);
    }
    async archiveGameMoves(gameId) {
        if (!gameId) {
            return { archived: 0 };
        }
        const archived = await (0, database_js_1.transaction)(async (client) => {
            const result = await client.query(`
          WITH moved AS (
            DELETE FROM game_moves
            WHERE room_id = $1
            RETURNING id, room_id, player_id, turn_number, move_type, move_data, is_valid, validation_error, created_at
          )
          INSERT INTO game_move_archive (
            id,
            room_id,
            player_id,
            turn_number,
            move_type,
            move_data,
            is_valid,
            validation_error,
            created_at,
            archived_at
          )
          SELECT
            id,
            room_id,
            player_id,
            turn_number,
            move_type,
            move_data,
            is_valid,
            validation_error,
            created_at,
            NOW()
          FROM moved
          RETURNING id
        `, [gameId]);
            return result.rowCount ?? 0;
        });
        if (archived > 0) {
            logger_js_1.logger.debug('Archived game moves', { gameId, archived });
        }
        return { archived };
    }
    async updateEloRatings(gameId, _gameState) {
        logger_js_1.logger.debug(`Updating ELO for game ${gameId}`);
    }
    async recordGameHistory(gameId, _gameState) {
        logger_js_1.logger.debug(`Recording history for game ${gameId}`);
    }
    async removeFromActiveGames(gameId) {
        await cacheService_js_1.gameStateCache.deleteGameState(gameId);
    }
    async getIdleGames(_threshold) {
        return [];
    }
    async markPlayerAsInactive(gameId, playerId) {
        logger_js_1.logger.info(`Marking player ${playerId} as inactive in game ${gameId}`);
    }
    async pauseGame(gameId) {
        logger_js_1.logger.info(`Pausing game ${gameId}`);
    }
    async deleteGame(gameId) {
        await cacheService_js_1.gameStateCache.deleteGameState(gameId);
    }
    async cleanupTemporaryData(gameId) {
        logger_js_1.logger.debug(`Cleaning temp data for game ${gameId}`);
    }
    async cleanupAbandonedGame(gameId) {
        await this.removeFromActiveGames(gameId);
    }
    async logCleanup(gameId, reason) {
        logger_js_1.logger.info(`Cleanup logged for game ${gameId}: ${reason}`);
    }
    async archiveGame(gameId) {
        logger_js_1.logger.info(`Archiving game ${gameId}`);
    }
    async findAbandonedGames(thresholdMs) {
        logger_js_1.logger.debug(`Finding games abandoned for ${thresholdMs}ms`);
        return [];
    }
    async cleanupFinishedGames(roomIds) {
        await cacheService_js_1.gameStateCache.cleanupFinishedGames(roomIds);
        await territoryModifierService_js_1.default.cleanupFinishedGameModifiers(roomIds);
    }
    async removeGame(roomId) {
        await cacheService_js_1.gameStateCache.invalidateGame(roomId);
        logger_js_1.logger.info(`Forcefully removed game ${roomId} from cache`);
    }
    async getBattleLog(roomId) {
        const result = await (0, database_js_1.query)('SELECT game_log FROM game_states WHERE room_id = $1', [roomId]);
        const rows = result.rows;
        if (!rows || rows.length === 0)
            return [];
        const log = rows[0]?.game_log;
        return Array.isArray(log) ? log : [];
    }
    async appendLog(roomId, entries) {
        if (!entries || entries.length === 0)
            return;
        await (0, database_js_1.transaction)(async (client) => {
            const existing = await client.query('SELECT game_log FROM game_states WHERE room_id = $1 FOR UPDATE', [roomId]);
            const current = Array.isArray(existing.rows[0]?.game_log)
                ? existing.rows[0]?.game_log
                : [];
            const updated = [...current, ...entries].slice(-500);
            await client.query(`INSERT INTO game_states (room_id, game_log, last_activity, game_phase, turn_number)
         VALUES ($1, $2, NOW(), 'lobby', 1)
         ON CONFLICT (room_id) DO UPDATE SET game_log = EXCLUDED.game_log, last_activity = NOW()`, [roomId, JSON.stringify(updated)]);
        });
    }
}
exports.GameService = GameService;
//# sourceMappingURL=gameService.js.map