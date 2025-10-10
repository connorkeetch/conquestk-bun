import { query } from '../config/database.js';
import { PREMIUM_COLOR_MESSAGE, PREMIUM_GAME_LIMIT_MESSAGE, PREMIUM_UPSELL_ERROR_CODE, } from '../constants/premium.js';
import { ensureGameConversation } from '../services/conversationService.js';
import { GameLifecycleService } from '../services/gameLifecycleService.js';
import { GameRoomService } from '../services/gameRoomService.js';
import { GameService } from '../services/gameService.js';
import { queueService } from '../services/queueService.js';
import { tryGetSocketServer } from '../services/socketRegistry.js';
import { logger } from '../utils/logger.js';
export class GameController {
    gameRoomService = new GameRoomService();
    lifecycleService = new GameLifecycleService();
    gameService = new GameService();
    getRooms = async (_req, res) => {
        try {
            const rooms = await this.gameRoomService.getActiveRooms();
            return res.json({ rooms });
        }
        catch (error) {
            logger.error('Get rooms error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    createRoom = async (req, res) => {
        try {
            const { name, maxPlayers, isPrivate, mapId, gameMode, movementType, fogOfWar, turnTimerSeconds, timeBankSeconds, teamMode, numberOfTeams, allowTeamPlay, isRanked, aiOpponents, treasureConfig, selectedColor, } = req.body;
            const hostId = req.userId;
            if (!hostId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            const parsedNumberOfTeams = typeof numberOfTeams === 'number'
                ? numberOfTeams
                : typeof numberOfTeams === 'string'
                    ? Number.parseInt(numberOfTeams, 10)
                    : undefined;
            const normalizedIsRanked = Boolean(isRanked);
            let normalizedTeamMode;
            if (teamMode === 'teams' || teamMode === 'auto_balance' || teamMode === 'none') {
                normalizedTeamMode = teamMode;
            }
            else if (teamMode === true) {
                normalizedTeamMode = 'teams';
            }
            else if (teamMode === false) {
                normalizedTeamMode = 'none';
            }
            else if (allowTeamPlay ||
                (typeof parsedNumberOfTeams === 'number' && parsedNumberOfTeams > 0)) {
                normalizedTeamMode = 'teams';
            }
            else {
                normalizedTeamMode = 'none';
            }
            const requestedAiOpponents = Array.isArray(aiOpponents) ? aiOpponents : [];
            const normalizedAiOpponents = [];
            if (requestedAiOpponents.length > 0 && !normalizedIsRanked) {
                const allowedDifficulties = new Set(['recruit', 'commander', 'grandmaster']);
                for (const opponent of requestedAiOpponents) {
                    if (!opponent || typeof opponent !== 'object')
                        continue;
                    const rawDifficulty = typeof opponent.difficulty === 'string' ? opponent.difficulty.toLowerCase() : null;
                    if (!rawDifficulty || !allowedDifficulties.has(rawDifficulty))
                        continue;
                    let personalitySeed;
                    if (typeof opponent.personalitySeed === 'number' &&
                        Number.isFinite(opponent.personalitySeed)) {
                        personalitySeed = Math.trunc(opponent.personalitySeed);
                    }
                    normalizedAiOpponents.push({
                        difficulty: rawDifficulty,
                        ...(personalitySeed !== undefined ? { personalitySeed } : {}),
                    });
                }
            }
            const maxAiSlots = Math.max(0, (maxPlayers || 6) - 1);
            if (normalizedAiOpponents.length > maxAiSlots) {
                normalizedAiOpponents.splice(maxAiSlots);
            }
            const roomData = {
                name,
                hostId,
                maxPlayers: maxPlayers || 6,
                isPrivate: isPrivate || false,
                gameMode: gameMode || 'classic',
                allowTeamPlay: allowTeamPlay === undefined ? normalizedTeamMode !== 'none' : Boolean(allowTeamPlay),
                teamMode: normalizedTeamMode,
                isRanked: normalizedIsRanked,
                aiOpponents: normalizedAiOpponents,
                ...(typeof mapId === 'string' ? { mapId } : {}),
                ...(movementType === 'classic_adjacent' ||
                    movementType === 'adjacent_multi' ||
                    movementType === 'path_single' ||
                    movementType === 'path_multi'
                    ? { movementType }
                    : {}),
                ...(fogOfWar === 'off' || fogOfWar === 'adjacent' || fogOfWar === 'persistent'
                    ? { fogOfWar }
                    : {}),
                ...(typeof turnTimerSeconds === 'number' && Number.isFinite(turnTimerSeconds)
                    ? { turnTimerSeconds: Math.max(10, Math.min(86400, Math.trunc(turnTimerSeconds))) }
                    : {}),
                ...(typeof timeBankSeconds === 'number' && Number.isFinite(timeBankSeconds)
                    ? { timeBankSeconds: Math.max(0, Math.min(86400, Math.trunc(timeBankSeconds))) }
                    : {}),
                ...(typeof parsedNumberOfTeams === 'number' && !Number.isNaN(parsedNumberOfTeams)
                    ? { numberOfTeams: parsedNumberOfTeams }
                    : {}),
                ...(treasureConfig !== undefined ? { treasureConfig } : {}),
            };
            const room = await this.gameRoomService.createRoom(roomData);
            try {
                const joinOptions = typeof selectedColor === 'string' ? { selectedColor } : undefined;
                await this.gameRoomService.joinRoom(room.id, hostId, joinOptions);
            }
            catch (joinError) {
                logger.warn('Host auto-join failed after room creation', {
                    roomId: room.id,
                    hostId,
                    error: joinError instanceof Error ? joinError.message : joinError,
                });
            }
            await this.lifecycleService.refreshLifecycle(room.id);
            try {
                await ensureGameConversation(room.id);
            }
            catch (chatError) {
                logger.warn('Failed to initialize game chat after room creation', {
                    roomId: room.id,
                    hostId,
                    error: chatError instanceof Error ? chatError.message : chatError,
                });
            }
            const hydratedRoom = await this.gameRoomService.getRoomById(room.id);
            return res.status(201).json({ room: hydratedRoom ?? room });
        }
        catch (error) {
            logger.error('Create room error:', error);
            if (error instanceof Error &&
                (error.message.includes('teams is not valid') ||
                    error.message.includes('Invalid number of teams') ||
                    error.message.includes('Ranked games') ||
                    error.message.includes('Team play'))) {
                return res.status(400).json({ message: error.message });
            }
            if (error instanceof Error && error.message === PREMIUM_GAME_LIMIT_MESSAGE) {
                return res.status(403).json({ code: PREMIUM_UPSELL_ERROR_CODE, message: error.message });
            }
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    submitAction = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const userId = req.userId;
            if (!userId)
                return res.status(401).json({ message: 'Authentication required' });
            const isMember = await this.gameRoomService.isPlayerInRoom(roomId, userId);
            if (!isMember)
                return res.status(403).json({ message: 'You are not in this game' });
            const body = (req.body ?? {});
            const rawCandidate = (body.action ?? body);
            const raw = (rawCandidate && typeof rawCandidate === 'object'
                ? rawCandidate
                : undefined);
            if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') {
                return res.status(400).json({ message: 'Invalid action payload' });
            }
            const action = { ...raw, roomId, playerId: userId };
            const idempotencyKey = req.headers['x-idempotency-key'] ||
                (typeof req.body?.idempotencyKey === 'string'
                    ? req.body.idempotencyKey
                    : undefined);
            const job = await queueService.addGameAction({
                gameId: roomId,
                playerId: userId,
                action,
                ...(idempotencyKey ? { idempotencyKey } : {}),
            });
            if (job) {
                return res.status(202).json({ ok: true, queued: true, jobId: job.id });
            }
            try {
                await this.gameService.processGameAction(action, userId);
                return res.status(200).json({ ok: true, queued: false });
            }
            catch (inlineError) {
                logger.warn('Inline action processing failed', {
                    roomId,
                    userId,
                    error: inlineError instanceof Error ? inlineError.message : inlineError,
                });
                return res.status(500).json({ ok: false, message: 'Failed to process action' });
            }
        }
        catch (error) {
            logger.error('submitAction error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    transferConquest = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const userId = req.userId;
            if (!userId)
                return res.status(401).json({ message: 'Authentication required' });
            const isMember = await this.gameRoomService.isPlayerInRoom(roomId, userId);
            if (!isMember)
                return res.status(403).json({ message: 'You are not in this game' });
            const { fromTerritoryId, toTerritoryId, armies } = (req.body ?? {});
            if (!fromTerritoryId || !toTerritoryId || typeof armies !== 'number') {
                return res.status(400).json({ message: 'Invalid conquest transfer payload' });
            }
            const result = await this.gameService.transferConquestArmies(roomId, userId, fromTerritoryId, toTerritoryId, armies);
            try {
                const io = tryGetSocketServer();
                if (io) {
                    io.to(`game:${roomId}`).emit('game-update', result.gameState);
                }
            }
            catch {
            }
            return res.status(200).json({ ok: true });
        }
        catch (error) {
            logger.error('transferConquest error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    updateTeamAssignment = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const hostId = req.userId;
            const { playerId, playerSlotId, teamId } = req.body;
            if (!hostId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            const targetIdentifier = playerSlotId ?? playerId;
            if (!targetIdentifier) {
                return res.status(400).json({ message: 'playerId is required' });
            }
            const parsedTeamId = teamId === null || teamId === undefined
                ? null
                : typeof teamId === 'number'
                    ? teamId
                    : Number.parseInt(teamId, 10);
            if (parsedTeamId !== null && Number.isNaN(parsedTeamId)) {
                return res.status(400).json({ message: 'teamId must be a number or null' });
            }
            const room = await this.gameRoomService.assignPlayerToTeam(roomId, hostId, targetIdentifier, parsedTeamId);
            await this.lifecycleService.refreshLifecycle(roomId);
            return res.json({ room });
        }
        catch (error) {
            logger.error('Update team assignment error:', error);
            if (error instanceof Error) {
                if (error.message === 'Room not found' || error.message.includes('not part')) {
                    return res.status(404).json({ message: error.message });
                }
                if (error.message.includes('Only the host') ||
                    error.message.includes('Team play') ||
                    error.message.includes('Team must be') ||
                    error.message.includes('Team identifier')) {
                    return res.status(400).json({ message: error.message });
                }
            }
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    setReadyState = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const userId = req.userId;
            const { ready } = req.body;
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            if (typeof ready !== 'boolean') {
                return res.status(400).json({ message: 'Ready flag must be provided' });
            }
            const lifecycle = await this.lifecycleService.setReadyState(roomId, userId, ready);
            return res.json({ lifecycle });
        }
        catch (error) {
            logger.error('Set ready state error:', error);
            if (error instanceof Error && error.message === 'Game already started') {
                return res.status(409).json({ message: error.message });
            }
            if (error instanceof Error && error.message === 'Player is not part of the room') {
                return res.status(403).json({ message: error.message });
            }
            if (error instanceof Error && error.message === 'Room not found') {
                return res.status(404).json({ message: error.message });
            }
            if (error instanceof Error &&
                (error.message.includes('Selected map failed validation') ||
                    error.message.includes('playability validation failed'))) {
                return res.status(400).json({ code: 'MAP_INVALID', message: error.message });
            }
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    joinRoom = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const userId = req.userId;
            const selectedColor = typeof req.body?.selectedColor === 'string'
                ? (req.body.selectedColor ?? null)
                : null;
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            const result = await this.gameRoomService.joinRoom(roomId, userId, { selectedColor });
            const room = await this.gameRoomService.getRoomById(roomId);
            try {
                await this.lifecycleService.setReadyState(roomId, userId, true);
            }
            catch (_err) {
            }
            await this.lifecycleService.refreshLifecycle(roomId);
            return res.json({ ...result, room });
        }
        catch (error) {
            logger.error('Join room error:', error);
            if (error instanceof Error) {
                if (error.message.includes('Color already taken')) {
                    return res.status(409).json({ message: error.message });
                }
                if (error.message.includes('Room is full') || error.message.includes('not accepting')) {
                    return res.status(403).json({ message: error.message });
                }
                if (error.message.includes('Room not found')) {
                    return res.status(404).json({ message: error.message });
                }
                if (error.message === PREMIUM_GAME_LIMIT_MESSAGE ||
                    error.message === PREMIUM_COLOR_MESSAGE) {
                    return res.status(403).json({ code: PREMIUM_UPSELL_ERROR_CODE, message: error.message });
                }
            }
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    leaveRoom = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            await this.gameRoomService.leaveRoom(roomId, userId);
            await this.lifecycleService.refreshLifecycle(roomId);
            return res.json({ message: 'Left room successfully' });
        }
        catch (error) {
            logger.error('Leave room error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    closeRoom = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            await this.gameRoomService.closeRoom(roomId, userId);
            await this.lifecycleService.refreshLifecycle(roomId);
            return res.json({ message: 'Room closed' });
        }
        catch (error) {
            logger.error('Close room error:', error);
            if (error instanceof Error) {
                if (error.message === 'Room not found') {
                    return res.status(404).json({ message: error.message });
                }
                if (error.message.includes('Only the host')) {
                    return res.status(403).json({ message: error.message });
                }
                if (error.message.includes('Game already started')) {
                    return res.status(409).json({ message: error.message });
                }
            }
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    updateAiOpponents = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const hostId = req.userId;
            if (!hostId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            const { aiOpponents } = req.body;
            if (!Array.isArray(aiOpponents)) {
                return res.status(400).json({ message: 'aiOpponents must be an array' });
            }
            const allowedDifficulties = new Set([
                'recruit',
                'commander',
                'grandmaster',
            ]);
            const sanitizedRequest = [];
            for (const entry of aiOpponents) {
                if (!entry || typeof entry !== 'object') {
                    continue;
                }
                const rawDifficulty = typeof entry.difficulty === 'string' ? entry.difficulty.toLowerCase() : undefined;
                if (!rawDifficulty || !allowedDifficulties.has(rawDifficulty)) {
                    continue;
                }
                let personalitySeed;
                if (typeof entry.personalitySeed === 'number' && Number.isFinite(entry.personalitySeed)) {
                    personalitySeed = Math.trunc(entry.personalitySeed);
                }
                sanitizedRequest.push({
                    difficulty: rawDifficulty,
                    ...(personalitySeed !== undefined ? { personalitySeed } : {}),
                });
            }
            const room = await this.gameRoomService.updateAiOpponents(roomId, hostId, sanitizedRequest);
            try {
                const playerCount = room.players?.length ?? 0;
                const required = room.maxPlayers;
                if (room.status === 'lobby' && required > 0 && playerCount >= required) {
                    await this.lifecycleService.setReadyState(roomId, hostId, true);
                }
            }
            catch (_err) {
            }
            await this.lifecycleService.refreshLifecycle(roomId);
            return res.json({ room });
        }
        catch (error) {
            logger.error('Update AI opponents error:', error);
            if (error instanceof Error) {
                if (error.message === 'Room not found') {
                    return res.status(404).json({ message: error.message });
                }
                if (error.message.includes('Only the host')) {
                    return res.status(403).json({ message: error.message });
                }
                if (error.message.includes('lobby') || error.message.includes('Ranked games')) {
                    return res.status(409).json({ message: error.message });
                }
                if (error.message.includes('Not enough open seats')) {
                    return res.status(400).json({ message: error.message });
                }
            }
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    getRoomDetails = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const room = await this.gameRoomService.getRoomById(roomId);
            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }
            return res.json({ room });
        }
        catch (error) {
            logger.error('Get room details error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    getRoomState = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const userId = req.userId;
            if (!roomId) {
                return res.status(400).json({ message: 'Room ID is required' });
            }
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            const room = await this.gameRoomService.getRoomById(roomId);
            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }
            const spectateParam = req.query?.spectate;
            const wantsSpectate = Array.isArray(spectateParam)
                ? spectateParam.includes('true')
                : spectateParam === 'true';
            const isAdminSpectator = Boolean(req.user?.isAdmin && wantsSpectate);
            const isParticipant = room.hostId === userId || (await this.gameRoomService.isPlayerInRoom(roomId, userId));
            let gameState = await this.gameService.getGameState(roomId);
            if (!gameState) {
                logger.info('Room state request before initialization', {
                    roomId,
                    userId,
                    isParticipant,
                    lifecyclePhase: room.lifecyclePhase ?? room.status,
                });
                return res.status(404).json({ message: 'Game state not initialized yet' });
            }
            try {
                if (!isAdminSpectator && room.fogOfWar && room.fogOfWar !== 'off') {
                    if (!isParticipant) {
                        gameState = {
                            ...gameState,
                            board: gameState.board.map((t) => ({ ...t, ownerId: null, armies: 0 })),
                        };
                        logger.info('Applied non-participant FoW masking', { roomId, userId });
                    }
                    else {
                        const owned = new Set(gameState.board.filter((t) => t.ownerId === userId).map((t) => t.id));
                        const visible = new Set(owned);
                        for (const t of gameState.board) {
                            if (!owned.has(t.id))
                                continue;
                            for (const adj of t.adjacentTerritories)
                                visible.add(adj);
                        }
                        gameState = {
                            ...gameState,
                            board: gameState.board.map((t) => visible.has(t.id) ? t : { ...t, ownerId: null, armies: 0 }),
                        };
                    }
                }
            }
            catch (maskError) {
                logger.warn('Fog-of-war masking failed; returning unmasked state fallback', {
                    roomId,
                    userId,
                    error: maskError instanceof Error ? maskError.message : String(maskError),
                });
            }
            return res.json({ game: gameState });
        }
        catch (error) {
            logger.error('Get room state error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    getMyGames = async (req, res) => {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            const games = await this.gameRoomService.getUserGames(userId);
            const winnerIds = Array.from(new Set(games
                .map((g) => (typeof g.winner === 'string' ? g.winner : null))
                .filter((v) => Boolean(v))));
            let winnerNameMap = new Map();
            if (winnerIds.length > 0) {
                try {
                    const result = await query('SELECT id, username FROM users WHERE id = ANY($1)', [winnerIds]);
                    winnerNameMap = new Map(result.rows.map((r) => [r.id, r.username]));
                }
                catch (err) {
                    logger.warn('Failed to resolve winner usernames for my-games payload', {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
            const formattedGames = games.map((game) => ({
                id: game.id,
                name: game.name,
                status: game.status || (game.gameStarted ? 'active' : 'lobby'),
                playerCount: game.playerCount || game.players?.length || 0,
                maxPlayers: game.maxPlayers,
                roomCode: game.roomCode,
                isYourTurn: game.currentTurnUserId === userId,
                winner: game.status === 'completed' && typeof game.winner === 'string'
                    ? (winnerNameMap.get(game.winner) ?? null)
                    : null,
                createdAt: game.createdAt,
                updatedAt: game.updatedAt ?? game.createdAt,
                isPrivate: game.isPrivate,
                hostUsername: game.hostUsername,
                isRanked: game.is_ranked === true,
                gameMode: game.gameMode ?? null,
            }));
            return res.json({ games: formattedGames });
        }
        catch (error) {
            logger.error('Get my games error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    getMyGamesMeta = async (req, res) => {
        try {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            const games = await this.gameRoomService.getUserGames(userId);
            const metaEntries = await Promise.all(games.map(async (game) => {
                try {
                    if (game.status !== 'active') {
                        return [
                            game.id,
                            {
                                isYourTurn: false,
                                currentTurnUserId: null,
                                currentTurnUsername: null,
                                turnExpiresAt: null,
                                timeBankSecondsRemaining: null,
                                queueAhead: null,
                                phase: null,
                            },
                        ];
                    }
                    const room = await this.gameRoomService.getRoomById(game.id);
                    const currentTurnUserId = room?.currentTurnUserId ?? null;
                    const turnExpiresAt = room?.turnExpiresAt ? room.turnExpiresAt.toISOString() : null;
                    const timeBankSecondsRemaining = typeof room?.timeBankSecondsRemaining === 'number'
                        ? Math.max(0, Math.trunc(room.timeBankSecondsRemaining))
                        : null;
                    let queueAhead = null;
                    let phase = null;
                    let currentTurnUsername = null;
                    try {
                        const gameState = await this.gameService.getGameState(game.id);
                        if (gameState && Array.isArray(gameState.players)) {
                            const players = gameState.players.filter((p) => !p.isEliminated);
                            const curIdx = players.findIndex((p) => p.id === gameState.currentPlayer);
                            const youIdx = players.findIndex((p) => p.id === userId);
                            const cur = players[curIdx];
                            if (cur && typeof cur.username === 'string') {
                                currentTurnUsername = cur.username;
                            }
                            if (curIdx !== -1 && youIdx !== -1) {
                                const n = players.length;
                                const dist = (((youIdx - curIdx) % n) + n) % n;
                                queueAhead = dist;
                            }
                            phase = gameState.phase;
                        }
                    }
                    catch (_err) {
                    }
                    return [
                        game.id,
                        {
                            isYourTurn: currentTurnUserId === userId,
                            currentTurnUserId,
                            currentTurnUsername,
                            turnExpiresAt,
                            timeBankSecondsRemaining,
                            queueAhead,
                            phase,
                        },
                    ];
                }
                catch (_err) {
                    return [
                        game.id,
                        {
                            isYourTurn: false,
                            currentTurnUserId: null,
                            currentTurnUsername: null,
                            turnExpiresAt: null,
                            timeBankSecondsRemaining: null,
                            queueAhead: null,
                            phase: null,
                        },
                    ];
                }
            }));
            const meta = {};
            for (const [id, m] of metaEntries)
                meta[id] = m;
            return res.json({ meta });
        }
        catch (error) {
            logger.error('Get my games meta error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
    getRoomLog = async (req, res) => {
        try {
            const { roomId: rawRoom } = req.params;
            const roomId = await this.gameRoomService.resolveRoomId(rawRoom);
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }
            const room = await this.gameRoomService.getRoomById(roomId);
            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }
            const [log, stats] = await Promise.all([
                this.gameService.getBattleLog(roomId),
                (async () => {
                    try {
                        const result = await query('SELECT turn_stats FROM game_states WHERE room_id = $1', [roomId]);
                        const list = result.rows[0]?.turn_stats;
                        return Array.isArray(list) ? list : [];
                    }
                    catch {
                        return [];
                    }
                })(),
            ]);
            let ratingChanges = {};
            try {
                const rc = await query('SELECT user_id, rating_change FROM player_game_results WHERE room_id = $1', [roomId]);
                const map = {};
                for (const row of rc.rows) {
                    const pid = row.user_id;
                    const delta = typeof row.rating_change === 'number' ? Math.trunc(row.rating_change) : 0;
                    if (pid)
                        map[pid] = delta;
                }
                ratingChanges = map;
            }
            catch (_err) {
                ratingChanges = {};
            }
            const players = Array.isArray(room.players) ? room.players : [];
            const isParticipant = Boolean((room.hostId && room.hostId === userId) ||
                players.some((player) => {
                    const candidate = (player.userId ?? player.id);
                    const participantId = typeof candidate === 'string' ? candidate : null;
                    return participantId === userId;
                }));
            const fogOn = room.fogOfWar && room.fogOfWar !== 'off';
            const isActive = room.status === 'active';
            if (fogOn && isActive && !isParticipant) {
                const redactedLog = (Array.isArray(log) ? log : []).map((entry) => {
                    const e = entry;
                    const type = e.type ?? undefined;
                    const timestamp = e.timestamp ?? undefined;
                    if (type === 'TURN') {
                        const event = e.event;
                        return event ? { type, timestamp, event } : { type, timestamp };
                    }
                    if (type === 'LIFECYCLE' || type === 'RATING') {
                        return { type, timestamp };
                    }
                    return { type: type ?? 'BATTLE', timestamp };
                });
                return res.json({ log: redactedLog, stats: [], ratingChanges: {} });
            }
            return res.json({ log, stats, ratingChanges });
        }
        catch (error) {
            logger.error('Get room log error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
}
//# sourceMappingURL=gameController.js.map