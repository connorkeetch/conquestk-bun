import * as jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { setupChatHandlers } from '../socket/chatHandlers.js';
import { DeltaBuilder } from '../types/deltaUpdates.js';
import { logger } from '../utils/logger.js';
import { gameStateCache } from './cacheService.js';
import { clanService } from './clanService.js';
import { eloService } from './eloService.js';
import { GameActionProcessor } from './gameActionProcessor.js';
import { GameRoomService } from './gameRoomService.js';
import { GameService } from './gameService.js';
import { GameLifecycleService } from './gameLifecycleService.js';
import { socketPayloadMetrics } from './metricsService.js';
import { queueService } from './queueService.js';
import { registerSocketServer } from './socketRegistry.js';
const socketLatencies = new Map();
function calculateP95(samples) {
    if (samples.length === 0)
        return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[index] || 0;
}
export function getSocketLatencyMetrics() {
    const allSamples = [];
    for (const samples of socketLatencies.values()) {
        allSamples.push(...samples);
    }
    if (allSamples.length === 0) {
        return {
            avgLatency: 0,
            p95Latency: 0,
            maxLatency: 0,
            activeConnections: socketLatencies.size,
        };
    }
    const sum = allSamples.reduce((acc, val) => acc + val, 0);
    const avg = sum / allSamples.length;
    const p95 = calculateP95(allSamples);
    const max = Math.max(...allSamples);
    return {
        avgLatency: Math.round(avg),
        p95Latency: Math.round(p95),
        maxLatency: Math.round(max),
        activeConnections: socketLatencies.size,
    };
}
function requireUserId(socket) {
    if (!socket.userId) {
        throw new Error('User not authenticated');
    }
    return socket.userId;
}
function getGameChannel(roomId) {
    return `game:${roomId}`;
}
function computePayloadBytes(data) {
    try {
        const json = JSON.stringify(data);
        return Buffer.byteLength(json, 'utf8');
    }
    catch {
        return -1;
    }
}
function emitGameUpdateToRoom(io, channel, payload) {
    const bytes = computePayloadBytes(payload);
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
    io.to(channel).emit('game-update', payload);
}
function emitGameDeltaBatchToRoom(io, channel, deltas) {
    try {
        const bytes = computePayloadBytes(deltas);
        socketPayloadMetrics.record('game-delta', bytes);
        if (socketPayloadMetrics.shouldLog('game-delta')) {
            const stats = socketPayloadMetrics.snapshot('game-delta');
            if (stats) {
                logger.info('Socket payload stats', {
                    event: 'game-delta',
                    windowCount: stats.count,
                    p50Bytes: stats.p50,
                    p95Bytes: stats.p95,
                    maxBytes: stats.max,
                });
            }
        }
    }
    catch {
    }
    io.to(channel).emit('game-delta-batch', deltas);
}
function emitGameUpdateToSocket(socket, payload) {
    const bytes = computePayloadBytes(payload);
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
    socket.emit('game-update', payload);
}
function filterGameStateForPlayer(state, viewerId) {
    if (!state)
        return state;
    const typedState = state;
    const fogMode = typedState.gameConfig?.fogOfWar ?? 'off';
    const fogEnabled = fogMode !== 'off';
    let filteredState;
    if (!fogEnabled) {
        filteredState = { ...typedState };
    }
    else {
        const owned = new Set();
        for (const territory of state.board) {
            if (territory.ownerId === viewerId) {
                owned.add(territory.id);
            }
        }
        const visible = new Set(owned);
        for (const territory of state.board) {
            if (!owned.has(territory.id)) {
                continue;
            }
            for (const adjacentId of territory.adjacentTerritories) {
                visible.add(adjacentId);
            }
        }
        const filteredBoard = state.board.map((territory) => {
            if (visible.has(territory.id)) {
                return territory;
            }
            return {
                ...territory,
                ownerId: null,
                armies: 0,
            };
        });
        filteredState = { ...typedState, board: filteredBoard };
    }
    if (typedState.gameConfig?.gameMode === 'assassination' && typedState.assassinationTargets) {
        const viewerTarget = typedState.assassinationTargets[viewerId];
        filteredState.assassinationTargets = viewerTarget ? { [viewerId]: viewerTarget } : {};
    }
    return filteredState;
}
function serializeGameStateForClient(state) {
    if (!state) {
        return null;
    }
    const s = state;
    const players = s.players.map((p) => ({
        id: p.id,
        username: p.username,
        color: p.color,
        armies: p.armies,
        isEliminated: p.isEliminated,
        skillRating: p.skillRating,
        teamId: p.teamId ?? undefined,
        treasures: p.treasures,
        territories: p.territories,
        cards: p.cards,
    }));
    const board = s.board.map((t) => ({
        id: t.id,
        name: t.name,
        ownerId: t.ownerId,
        armies: t.armies,
        adjacentTerritories: t.adjacentTerritories,
        sector: t.sector,
        continent: t.continent,
        isCapital: t.isCapital,
        capitalOwnerId: t.capitalOwnerId,
        coordinates: t.coordinates,
    }));
    const cfg = (s.gameConfig ?? {});
    const gameConfig = {
        movementType: cfg?.movementType,
        allowTeamPlay: cfg?.allowTeamPlay,
        teamMode: cfg?.teamMode,
        numberOfTeams: cfg?.numberOfTeams,
        mapId: cfg?.mapId,
        fogOfWar: cfg?.fogOfWar,
        treasureConfig: cfg?.treasureConfig,
    };
    const base = {
        roomId: s.roomId,
        phase: s.phase,
        currentPlayer: s.currentPlayer,
        turn: s.turn,
        players,
        board,
        gameConfig: gameConfig,
        kingOfTheHillState: s.kingOfTheHillState,
        assassinationTargets: s.assassinationTargets,
        cards: Array.isArray(s.cards) ? s.cards : [],
        movementTracking: s.movementTracking,
    };
    const territoryModifiers = s.territoryModifiers;
    if (territoryModifiers instanceof Map) {
        const obj = Object.fromEntries(territoryModifiers.entries());
        return { ...base, territoryModifiers: obj };
    }
    if (territoryModifiers) {
        return {
            ...base,
            territoryModifiers: territoryModifiers,
        };
    }
    return base;
}
function handleSocketError(socket, eventName, error) {
    const isActualError = error instanceof Error;
    const errorMessage = isActualError ? error.message : String(error);
    const errorStack = isActualError ? error.stack : undefined;
    logger.error(`Socket error in ${eventName}:`, {
        error: errorMessage,
        stack: errorStack,
        isError: isActualError,
        userId: socket.userId,
        socketId: socket.id,
    });
    const clientErrorMessage = process.env.NODE_ENV === 'production'
        ? 'An error occurred processing your request'
        : errorMessage;
    socket.emit('error', {
        event: eventName,
        message: clientErrorMessage,
        timestamp: new Date().toISOString(),
    });
}
function withErrorHandler(socket, eventName, handler) {
    return async (...args) => {
        try {
            await handler(...args);
        }
        catch (error) {
            handleSocketError(socket, eventName, error);
        }
    };
}
export function setupSocketHandlers(io) {
    registerSocketServer(io);
    const gameService = new GameService();
    const gameRoomService = new GameRoomService();
    const gameActionProcessor = new GameActionProcessor(io);
    const lifecycleService = new GameLifecycleService();
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            logger.error('FATAL: JWT_SECRET environment variable is not set');
            return next(new Error('Server configuration error'));
        }
        try {
            const decoded = jwt.verify(token, jwtSecret);
            socket.userId = decoded.userId;
            socket.username = decoded.username;
            const sockWithData = socket;
            sockWithData.data = {
                ...(sockWithData.data ?? {}),
                userId: decoded.userId,
                username: decoded.username,
            };
            next();
        }
        catch (_error) {
            next(new Error('Authentication error'));
        }
    });
    io.on('connection', (socket) => {
        logger.info(`User ${socket.userId} connected`);
        if (socket.userId) {
            socketLatencies.set(socket.userId, []);
            socket.lastPingTime = Date.now();
        }
        if (socket.userId) {
            socket.join(`user:${socket.userId}`);
            void (async () => {
                try {
                    const membership = await clanService.getActiveMembership(socket.userId);
                    if (membership?.clanId) {
                        const clanRoom = `clan:${membership.clanId}`;
                        await socket.join(clanRoom);
                        socket.joinedClanRoom = clanRoom;
                    }
                }
                catch (error) {
                    logger.warn('Failed to join clan room for user', {
                        userId: socket.userId,
                        error: error instanceof Error ? error.message : error,
                    });
                }
            })();
        }
        setupChatHandlers(io, socket);
        socket.on('join-room', withErrorHandler(socket, 'join-room', async (roomId) => {
            if (!roomId || typeof roomId !== 'string') {
                throw new Error('Invalid room ID');
            }
            const normalizedRoomId = /^\d+$/.test(roomId)
                ? await gameRoomService
                    .getRoomByCode(Number.parseInt(roomId, 10))
                    .then((r) => r?.id ?? '')
                : roomId;
            if (!normalizedRoomId) {
                throw new Error('Room not found');
            }
            const userId = requireUserId(socket);
            const hasAccess = await gameRoomService.isPlayerInRoom(normalizedRoomId, userId);
            if (!hasAccess) {
                throw new Error('You are not a member of this game');
            }
            const channel = getGameChannel(normalizedRoomId);
            await socket.join(channel);
            await socket.join(normalizedRoomId);
            if (!socket.joinedGameRooms) {
                socket.joinedGameRooms = new Set();
            }
            socket.joinedGameRooms.add(normalizedRoomId);
            const player = await gameRoomService.getPlayer(normalizedRoomId, userId);
            const isAi = player?.isAi === true;
            const normalizedPlayer = {
                id: player?.id ?? player?.userId ?? userId,
                userId: player?.userId ?? userId,
                aiPlayerId: player?.aiPlayerId ?? null,
                username: player?.username ?? socket.username ?? 'Unknown player',
                joinedAt: (player?.joinedAt ?? new Date()).toISOString(),
                isReady: player?.isReady === undefined ? isAi : Boolean(player.isReady),
                readyAt: player?.readyAt instanceof Date ? player.readyAt.toISOString() : null,
                teamId: typeof player?.teamId === 'number'
                    ? player.teamId
                    : player?.teamId === null
                        ? null
                        : undefined,
                isAi,
                aiDifficulty: player?.aiDifficulty ?? null,
                aiPersonalitySeed: typeof player?.aiPersonalitySeed === 'number'
                    ? player.aiPersonalitySeed
                    : (player?.aiPersonalitySeed ?? null),
                selectedColor: typeof player?.selected_color === 'string' && player.selected_color.length > 0
                    ? player.selected_color
                    : null,
            };
            socket.to(channel).emit('player-joined', {
                roomId: normalizedRoomId,
                player: normalizedPlayer,
            });
            const cachedState = await gameStateCache.getGameState(normalizedRoomId);
            let serializedState = serializeGameStateForClient(cachedState);
            if (!serializedState) {
                const freshState = await gameService.getGameState(normalizedRoomId);
                if (freshState) {
                    const filtered = filterGameStateForPlayer(freshState, userId);
                    serializedState = serializeGameStateForClient(filtered);
                }
                else {
                    serializedState = null;
                }
            }
            if (serializedState) {
                const filtered = filterGameStateForPlayer(serializedState ?? null, userId);
                const finalState = serializeGameStateForClient(filtered);
                if (finalState) {
                    emitGameUpdateToSocket(socket, finalState);
                }
            }
            logger.info(`User ${userId} subscribed to game channel ${channel}`);
        }));
        socket.on('leave-room', withErrorHandler(socket, 'leave-room', async (roomId) => {
            if (!roomId || typeof roomId !== 'string') {
                throw new Error('Invalid room ID');
            }
            const normalizedRoomId = /^\d+$/.test(roomId)
                ? await gameRoomService
                    .getRoomByCode(Number.parseInt(roomId, 10))
                    .then((r) => r?.id ?? '')
                : roomId;
            if (!normalizedRoomId) {
                throw new Error('Room not found');
            }
            const userId = requireUserId(socket);
            const channel = getGameChannel(normalizedRoomId);
            const player = await gameRoomService.getPlayer(normalizedRoomId, userId).catch(() => null);
            await socket.leave(channel);
            await socket.leave(normalizedRoomId);
            socket.joinedGameRooms?.delete(normalizedRoomId);
            socket.to(channel).emit('player-left', {
                roomId: normalizedRoomId,
                playerSlotId: player?.id ?? userId,
                userId,
                aiPlayerId: player?.aiPlayerId ?? null,
                isAi: player?.isAi === true,
            });
            logger.info(`User ${userId} left game channel ${channel}`);
        }));
        socket.on('game-action', withErrorHandler(socket, 'game-action', async (data) => {
            if (!data || !data.roomId || !data.action) {
                throw new Error('Invalid game action data');
            }
            const userId = requireUserId(socket);
            const channel = getGameChannel(data.roomId);
            const normalizedAction = { ...data.action, roomId: data.roomId, playerId: userId };
            const job = await queueService.addGameAction({
                gameId: data.roomId,
                playerId: userId,
                action: normalizedAction,
                socketId: socket.id,
            });
            if (job) {
                logger.info(`Queued game action: ${data.action.type} for game ${data.roomId}`, {
                    jobId: job.id,
                    playerId: userId,
                });
            }
            else {
                logger.info(`Processed game action directly (no queue): ${normalizedAction.type} for game ${data.roomId}`, {
                    playerId: userId,
                });
                try {
                    const updatedState = await gameService.processGameAction(normalizedAction, userId);
                    const serialized = serializeGameStateForClient(updatedState);
                    if (serialized) {
                        emitGameUpdateToRoom(io, channel, serialized);
                    }
                    if (normalizedAction.type === 'go_back_to_reinforcement') {
                        try {
                            const currentPlayer = updatedState.players.find((p) => p.id === userId);
                            const reinforcementArmies = Math.max(0, currentPlayer?.armies ?? 0);
                            const phaseDelta = DeltaBuilder.phaseChange(data.roomId, updatedState.phase, updatedState.currentPlayer, updatedState.turn, reinforcementArmies);
                            const { emitFogFilteredDelta } = await import('./fogService.js');
                            await emitFogFilteredDelta(io, data.roomId, phaseDelta, updatedState);
                        }
                        catch (emitError) {
                            logger.warn('Failed to emit go-back delta inline', {
                                roomId: data.roomId,
                                error: emitError instanceof Error ? emitError.message : emitError,
                            });
                        }
                    }
                }
                catch (inlineError) {
                    handleSocketError(socket, 'game-action:inline', inlineError);
                }
            }
        }));
        socket.on('deployArmies', withErrorHandler(socket, 'deployArmies', async (data, ack) => {
            if (!data || !data.roomId || !data.territoryId || typeof data.armies !== 'number') {
                throw new Error('Invalid deployment data');
            }
            const userId = requireUserId(socket);
            const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId);
            if (!hasAccess) {
                throw new Error('Unauthorized: You are not a member of this game');
            }
            const outcome = await gameActionProcessor.processDeployment(data.roomId, userId, data.territoryId, data.armies, socket.id);
            if (typeof ack === 'function') {
                ack({ ok: true, queued: outcome.mode === 'queued', version: outcome.result?.version });
            }
        }));
        socket.on('attack', withErrorHandler(socket, 'attack', async (data, ack) => {
            if (!data || !data.roomId || !data.fromTerritoryId || !data.toTerritoryId) {
                throw new Error('Invalid attack data');
            }
            const userId = requireUserId(socket);
            const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId);
            if (!hasAccess) {
                throw new Error('Unauthorized: You are not a member of this game');
            }
            const armies = typeof data.armies === 'number' ? data.armies : undefined;
            const outcome = await gameActionProcessor.processAttack(data.roomId, userId, data.fromTerritoryId, data.toTerritoryId, armies, socket.id);
            if (typeof ack === 'function') {
                try {
                    ack({ ok: true, queued: outcome.mode === 'queued' });
                }
                catch {
                }
            }
        }));
        socket.on('checkCapitalAttack', withErrorHandler(socket, 'checkCapitalAttack', async (data) => {
            const { roomId, targetTerritoryId } = data;
            if (!roomId || !targetTerritoryId) {
                throw new Error('Invalid capital check data');
            }
            const isCapital = await gameService.isCapitalTerritory(roomId, targetTerritoryId);
            socket.emit('capitalAttackCheck', {
                territoryId: targetTerritoryId,
                isCapital,
            });
        }));
        socket.on('transferConquestArmies', withErrorHandler(socket, 'transferConquestArmies', async (data) => {
            if (!data ||
                !data.roomId ||
                !data.fromTerritoryId ||
                !data.toTerritoryId ||
                typeof data.armies !== 'number') {
                throw new Error('Invalid conquest transfer data');
            }
            const userId = requireUserId(socket);
            const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId);
            if (!hasAccess) {
                throw new Error('Unauthorized: You are not a member of this game');
            }
            const transferResult = await gameService.transferConquestArmies(data.roomId, userId, data.fromTerritoryId, data.toTerritoryId, data.armies);
            const channel = getGameChannel(data.roomId);
            emitGameDeltaBatchToRoom(io, channel, [
                {
                    type: 'TERRITORY_UPDATE',
                    roomId: data.roomId,
                    territoryId: data.fromTerritoryId,
                    changes: { armies: transferResult.fromArmies },
                    timestamp: Date.now(),
                },
                {
                    type: 'TERRITORY_UPDATE',
                    roomId: data.roomId,
                    territoryId: data.toTerritoryId,
                    changes: { armies: transferResult.toArmies },
                    timestamp: Date.now(),
                },
            ]);
        }));
        socket.on('fortify', withErrorHandler(socket, 'fortify', async (data) => {
            if (!data ||
                !data.roomId ||
                !data.fromTerritoryId ||
                !data.toTerritoryId ||
                typeof data.armies !== 'number') {
                throw new Error('Invalid fortification data');
            }
            const userId = requireUserId(socket);
            const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId);
            if (!hasAccess) {
                throw new Error('Unauthorized: You are not a member of this game');
            }
            const result = await gameService.fortify(data.roomId, userId, data.fromTerritoryId, data.toTerritoryId, data.armies);
            const channel = getGameChannel(data.roomId);
            emitGameDeltaBatchToRoom(io, channel, [
                {
                    type: 'TERRITORY_UPDATE',
                    roomId: data.roomId,
                    territoryId: data.fromTerritoryId,
                    changes: { armies: result.fromArmies },
                    timestamp: Date.now(),
                },
                {
                    type: 'TERRITORY_UPDATE',
                    roomId: data.roomId,
                    territoryId: data.toTerritoryId,
                    changes: { armies: result.toArmies },
                    timestamp: Date.now(),
                },
            ]);
            try {
                const fortifyDelta = {
                    type: 'FORTIFY_RESULT',
                    roomId: data.roomId,
                    timestamp: Date.now(),
                    fromTerritoryId: data.fromTerritoryId,
                    toTerritoryId: data.toTerritoryId,
                    movedArmies: data.armies,
                    fromArmies: result.fromArmies,
                    toArmies: result.toArmies,
                    playerId: userId,
                };
                const { emitFogFilteredDelta } = await import('../services/fogService.js');
                await emitFogFilteredDelta(io, data.roomId, fortifyDelta);
            }
            catch {
            }
        }));
        socket.on('undoFortify', withErrorHandler(socket, 'undoFortify', async (data) => {
            if (!data || !data.roomId) {
                throw new Error('Invalid undo fortify data');
            }
            const userId = requireUserId(socket);
            const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId);
            if (!hasAccess) {
                throw new Error('Unauthorized: You are not a member of this game');
            }
            const job = await queueService.addGameAction({
                gameId: data.roomId,
                playerId: userId,
                action: {
                    type: 'undo_fortify',
                    roomId: data.roomId,
                    playerId: userId,
                    payload: undefined,
                },
                socketId: socket.id,
            });
            if (job) {
                logger.info(`Queued undo fortify for game ${data.roomId}`, {
                    jobId: job.id,
                });
            }
            else {
                await gameService.processGameAction({
                    type: 'undo_fortify',
                    roomId: data.roomId,
                    playerId: userId,
                    payload: undefined,
                }, userId);
                const channel = getGameChannel(data.roomId);
                const serialized = await gameStateCache.getGameState(data.roomId);
                if (serialized) {
                    emitGameUpdateToRoom(io, channel, serialized);
                }
            }
        }));
        socket.on('player:resign', withErrorHandler(socket, 'player:resign', async (data) => {
            if (!data || !data.roomId)
                throw new Error('Invalid resign data');
            const userId = requireUserId(socket);
            const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId);
            if (!hasAccess)
                throw new Error('Not a member of this game');
            await lifecycleService.kickAndNeutralize(data.roomId, userId);
            const channel = getGameChannel(data.roomId);
            const cached = await gameStateCache.getGameState(data.roomId);
            const serialized = serializeGameStateForClient(cached);
            if (serialized) {
                emitGameUpdateToRoom(io, channel, serialized);
            }
            try {
                io.to(channel).emit('game-delta', {
                    type: 'SYSTEM_MESSAGE',
                    roomId: data.roomId,
                    timestamp: Date.now(),
                    text: `${socket.username ?? 'A player'} resigned; territories set neutral.`,
                    playerId: socket.userId,
                });
            }
            catch {
            }
            await lifecycleService.refreshLifecycle(data.roomId);
            logger.info(`User ${userId} resigned from room ${data.roomId}`);
        }));
        socket.on('host:replacement', withErrorHandler(socket, 'host:replacement', async (data) => {
            const userId = requireUserId(socket);
            const { roomId, targetUserId, choice, aiDifficulty } = data || {};
            if (!roomId || !targetUserId || !choice)
                throw new Error('Invalid replacement data');
            const room = await gameRoomService.getRoomById(roomId);
            if (!room)
                throw new Error('Room not found');
            if (room.hostId !== userId)
                throw new Error('Only the host can decide replacement');
            const pending = room
                .replacementPendingUserId;
            if (!pending || pending !== targetUserId)
                throw new Error('No pending replacement for user');
            await query(`UPDATE game_rooms SET replacement_pending_user_id = NULL WHERE id = $1`, [
                roomId,
            ]);
            if (choice === 'neutral') {
                await lifecycleService.kickAndNeutralize(roomId, targetUserId);
            }
            else {
                const stateRaw = await (await import('./cacheService.js')).gameStateCache.getGameState(roomId);
                if (!stateRaw)
                    throw new Error('Game state not found');
                const state = { ...stateRaw };
                const idx = state.players.findIndex((p) => p.id === targetUserId);
                if (idx < 0)
                    throw new Error('Player not found in game state');
                state.players[idx] = {
                    ...state.players[idx],
                    isAi: true,
                    aiDifficulty: aiDifficulty ?? 'recruit',
                };
                await gameService.saveSnapshot(roomId, state);
                await query(`UPDATE room_players SET is_ai = TRUE, ai_difficulty = COALESCE($3, 'recruit') WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId, aiDifficulty ?? null]);
            }
            await lifecycleService.refreshLifecycle(roomId);
            const freshState = await gameService.getGameState(roomId);
            if (freshState) {
                const filtered = filterGameStateForPlayer(freshState, userId);
                const finalState = serializeGameStateForClient(filtered);
                if (finalState) {
                    emitGameUpdateToRoom(io, getGameChannel(roomId), finalState);
                }
            }
        }));
        socket.on('endTurn', withErrorHandler(socket, 'endTurn', async (data) => {
            if (!data || !data.roomId) {
                throw new Error('Invalid end turn data');
            }
            const userId = requireUserId(socket);
            const result = await gameService.endTurn(data.roomId, userId);
            const channel = getGameChannel(data.roomId);
            if (result.treasureAwarded) {
                io.to(channel).emit('game-delta', {
                    type: 'TREASURE_AWARDED',
                    roomId: data.roomId,
                    timestamp: Date.now(),
                    userId,
                    metal: result.treasureAwarded,
                });
            }
            const phaseDelta = DeltaBuilder.phaseChange(data.roomId, result.gameState.phase, result.gameState.currentPlayer, result.gameState.turn, result.reinforcementArmies);
            io.to(channel).emit('game-delta', phaseDelta);
            if (result.turnAdvanced) {
                try {
                    const { GameLifecycleService } = await import('./gameLifecycleService.js');
                    const lifecycleService = new GameLifecycleService();
                    await lifecycleService.scheduleTurnTimeout(data.roomId);
                }
                catch (e) {
                    logger.warn('Failed to schedule turn timeout after manual endTurn', {
                        roomId: data.roomId,
                        error: e instanceof Error ? e.message : e,
                    });
                }
            }
        }));
        socket.on('turn:begin', withErrorHandler(socket, 'turn:begin', async (data) => {
            if (!data || !data.roomId) {
                throw new Error('Invalid turn acknowledgement data');
            }
            const userId = requireUserId(socket);
            await gameService.acknowledgeTurnStart(data.roomId, userId);
        }));
        socket.on('goBackToReinforcement', withErrorHandler(socket, 'goBackToReinforcement', async (data) => {
            if (!data || !data.roomId) {
                throw new Error('Invalid go-back data');
            }
            const userId = requireUserId(socket);
            await gameActionProcessor.processGoBack(data.roomId, userId, socket.id);
        }));
        socket.on('chat-message', withErrorHandler(socket, 'chat-message', async (data) => {
            if (!data || !data.roomId || !data.message) {
                throw new Error('Invalid chat message data');
            }
            const userId = requireUserId(socket);
            const sanitizedMessage = data.message.substring(0, 500).replace(/<[^>]*>/g, '');
            const channel = getGameChannel(data.roomId);
            socket.to(channel).emit('chat-message', {
                roomId: data.roomId,
                userId,
                message: sanitizedMessage,
                timestamp: new Date().toISOString(),
            });
        }));
        socket.on('ping:territory', withErrorHandler(socket, 'ping:territory', async (data) => {
            if (!data || !data.roomId || !data.territoryId)
                throw new Error('Invalid ping data');
            const userId = requireUserId(socket);
            const hasAccess = await gameRoomService.isPlayerInRoom(data.roomId, userId);
            if (!hasAccess)
                throw new Error('Not a member of this game');
            const channel = getGameChannel(data.roomId);
            io.to(channel).volatile.emit('ping:territory', {
                roomId: data.roomId,
                territoryId: data.territoryId,
                userId,
                username: socket.username ?? null,
                createdAt: new Date().toISOString(),
            });
        }));
        socket.on('disconnect', async () => {
            try {
                const userId = socket.userId;
                if (!userId) {
                    return;
                }
                logger.info(`User ${userId} disconnected`);
                socketLatencies.delete(userId);
                const gameRooms = socket.joinedGameRooms ?? new Set();
                for (const roomId of gameRooms) {
                    const channel = getGameChannel(roomId);
                    socket.to(channel).emit('player-disconnected', {
                        roomId,
                        playerId: userId,
                        socketId: socket.id,
                    });
                }
                socket.joinedGameRooms?.clear();
            }
            catch (error) {
                logger.error('Disconnect handler error:', error);
            }
        });
    });
    async function _handleRankedGameEnd(io, roomId, gameState) {
        try {
            const roomResult = await query(`SELECT is_ranked FROM game_rooms WHERE id = $1`, [roomId]);
            if (!roomResult.rows[0]?.is_ranked) {
                return;
            }
            const players = gameState.players;
            const playerRatings = [];
            const sortedPlayers = [...players].sort((a, b) => {
                if (!a.isEliminated && b.isEliminated)
                    return -1;
                if (a.isEliminated && !b.isEliminated)
                    return 1;
                const board = gameState.board;
                const aTerritories = board.filter((territory) => territory.ownerId === a.id).length;
                const bTerritories = board.filter((territory) => territory.ownerId === b.id).length;
                return bTerritories - aTerritories;
            });
            const humanPlayers = sortedPlayers.filter((p) => !p.id.startsWith('ai-'));
            if (humanPlayers.length > 0) {
                const playerIds = humanPlayers.map((p) => p.id);
                const placeholders = playerIds.map((_, index) => `$${index + 1}`).join(', ');
                const bulkUserQuery = `
          SELECT id, skill_rating, total_ranked_games 
          FROM users 
          WHERE id IN (${placeholders})
        `;
                const userResults = await query(bulkUserQuery, playerIds);
                const userDataMap = new Map();
                userResults.rows.forEach((row) => {
                    userDataMap.set(row.id, row);
                });
                humanPlayers.forEach((player, _index) => {
                    const userData = userDataMap.get(player.id);
                    if (userData) {
                        const position = sortedPlayers.findIndex((p) => p.id === player.id) + 1;
                        playerRatings.push({
                            userId: player.id,
                            currentRating: userData.skill_rating ?? 800,
                            gamesPlayed: userData.total_ranked_games ?? 0,
                            position: position,
                        });
                    }
                });
            }
            if (playerRatings.length >= 3) {
                const ratingChanges = eloService.calculateRatingChanges(playerRatings);
                await eloService.applyRatingChanges(roomId, ratingChanges);
                const channel = getGameChannel(roomId);
                io.to(channel).emit('ratingUpdate', {
                    changes: ratingChanges.map((change) => ({
                        userId: change.userId,
                        username: sortedPlayers.find((p) => p.id === change.userId)?.username,
                        oldRating: change.oldRating,
                        newRating: change.newRating,
                        change: change.change,
                        tier: eloService.getSkillTier(change.newRating).name,
                    })),
                });
                await query(`
          UPDATE game_rooms 
          SET status = 'completed' 
          WHERE id = $1
        `, [roomId]);
                logger.info(`Ranked game ${roomId} completed, ELO ratings updated`);
            }
        }
        catch (error) {
            logger.error('Error handling ranked game end:', error);
        }
    }
}
//# sourceMappingURL=socketService.js.map