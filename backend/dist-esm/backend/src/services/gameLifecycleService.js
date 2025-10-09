import { getClient, query } from '../config/database.js';
import { acquireLock, releaseLock } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import capitalGameService from './capitalGameService.js';
import { GameRoomService } from './gameRoomService.js';
import { GameService } from './gameService.js';
import { mapService } from './mapService.js';
import { queueService } from './queueService.js';
import { tryGetSocketServer } from './socketRegistry.js';
export class GameLifecycleService {
    constructor() {
        this.gameRoomService = new GameRoomService();
        this.gameService = new GameService();
    }
    async setReadyState(roomId, userId, ready) {
        const lockKey = `lock:game:ready:${roomId}`;
        const lockToken = await acquireLock(lockKey, 5000);
        if (!lockToken) {
            throw new Error('Failed to acquire lock, another operation in progress');
        }
        const client = await getClient();
        let shouldStart = false;
        let players = [];
        let turnTimer = 60;
        let lifecycleStatus = 'lobby';
        let statusMessage;
        try {
            await client.query('BEGIN');
            const roomResult = await client.query('SELECT status, turn_timer, max_players, host_id, map_id FROM game_rooms WHERE id = $1 FOR UPDATE', [roomId]);
            if (roomResult.rowCount === 0) {
                throw new Error('Room not found');
            }
            const rawStatus = roomResult.rows[0].status;
            lifecycleStatus = this.normalizeStatus(rawStatus);
            turnTimer = roomResult.rows[0].turn_timer ?? 60;
            const hostId = roomResult.rows[0].host_id;
            const maxPlayers = roomResult.rows[0].max_players ?? 2;
            if (lifecycleStatus === 'active' || lifecycleStatus === 'completed') {
                throw new Error('Game already started');
            }
            const membershipResult = await client.query('SELECT is_ready FROM room_players WHERE room_id = $1 AND user_id = $2 FOR UPDATE', [roomId, userId]);
            if (membershipResult.rowCount === 0) {
                throw new Error('Player is not part of the room');
            }
            await client.query(`
        UPDATE room_players
        SET is_ready = $3,
            ready_at = CASE WHEN $3 THEN NOW() ELSE NULL END
        WHERE room_id = $1 AND user_id = $2
      `, [roomId, userId, ready]);
            const playersResult = await client.query(`
        SELECT
          id,
          user_id,
          ai_player_id,
          is_ready,
          ready_at,
          joined_at,
          team_id,
          is_ai,
          ai_difficulty,
          ai_personality_seed,
          selected_color
        FROM room_players
        WHERE room_id = $1
        ORDER BY joined_at ASC
      `, [roomId]);
            players = playersResult.rows;
            const playerCount = players.length;
            const minPlayers = 2;
            const isHost = userId === hostId;
            const lobbyIsFull = playerCount >= maxPlayers;
            const canStart = (isHost && ready === true && playerCount >= minPlayers) || (lobbyIsFull && ready === true);
            if (canStart && lifecycleStatus === 'lobby') {
                const mapId = roomResult.rows[0].map_id;
                if (!mapId) {
                    statusMessage = 'No map selected for this game';
                }
                else {
                    try {
                        const validation = await mapService.validateMapPlayable(mapId);
                        if (!validation.isValid) {
                            statusMessage = `Selected map failed validation: ${validation.errors.join('; ')}`;
                        }
                    }
                    catch (_e) {
                        statusMessage = 'Map validation failed';
                    }
                }
                if (statusMessage) {
                    shouldStart = false;
                }
                else {
                    shouldStart = true;
                    lifecycleStatus = 'initializing';
                    await client.query(`
          UPDATE game_rooms
          SET status = 'initializing',
              ready_check_started_at = NOW(),
              turn_number = 0,
              turn_expires_at = NULL
          WHERE id = $1
        `, [roomId]);
                }
            }
            if (!canStart && lifecycleStatus === 'initializing') {
                lifecycleStatus = 'lobby';
                await client.query(`
          UPDATE game_rooms
          SET status = 'lobby',
              ready_check_started_at = NULL,
              turn_number = 0,
              turn_expires_at = NULL
          WHERE id = $1
        `, [roomId]);
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
            await releaseLock(lockKey, lockToken);
        }
        if (shouldStart) {
            try {
                await this.startGame(roomId, players, turnTimer);
            }
            catch (error) {
                logger.error('Failed to start game after ready-check', {
                    roomId,
                    error: error instanceof Error ? error.message : error,
                });
                await query(`
          UPDATE game_rooms
          SET status = 'lobby',
              ready_check_started_at = NULL,
              turn_number = 0,
              current_turn_user_id = NULL,
              turn_expires_at = NULL
          WHERE id = $1
        `, [roomId]);
                try {
                    const snap = await this.getLifecycleSnapshot(roomId);
                    snap.triggeredStart = false;
                    snap.statusMessage = `Failed to start game: ${error instanceof Error ? error.message : String(error)}`;
                    snap.statusMessageLevel = 'error';
                    await this.broadcastLifecycle(snap);
                }
                catch {
                }
                throw error;
            }
        }
        const snapshot = await this.getLifecycleSnapshot(roomId);
        snapshot.triggeredStart = shouldStart;
        if (statusMessage) {
            snapshot.statusMessage = statusMessage;
            snapshot.statusMessageLevel = 'error';
        }
        await this.broadcastLifecycle(snapshot);
        return snapshot;
    }
    async maybeAutoStart(roomId) {
        const lockKey = `lock:game:ready:${roomId}`;
        const lockToken = await acquireLock(lockKey, 5000);
        if (!lockToken) {
            logger.warn('Failed to acquire lifecycle lock for auto-start', { roomId });
            return false;
        }
        const client = await getClient();
        let shouldStart = false;
        let players = [];
        let turnTimer = 60;
        let statusMessage;
        try {
            await client.query('BEGIN');
            const roomResult = await client.query('SELECT status, turn_timer, max_players, map_id FROM game_rooms WHERE id = $1 FOR UPDATE', [roomId]);
            if (roomResult.rowCount === 0) {
                throw new Error('Room not found');
            }
            const lifecycleStatus = this.normalizeStatus(roomResult.rows[0].status);
            turnTimer = roomResult.rows[0].turn_timer ?? 60;
            const maxPlayers = roomResult.rows[0].max_players ?? 0;
            if (lifecycleStatus === 'lobby') {
                const playersResult = await client.query(`
          SELECT
            id,
            user_id,
            ai_player_id,
            is_ready,
            ready_at,
            joined_at,
            team_id,
            is_ai,
            ai_difficulty,
            ai_personality_seed,
            selected_color
          FROM room_players
          WHERE room_id = $1
          ORDER BY joined_at ASC
        `, [roomId]);
                players = playersResult.rows;
                const playerCount = players.length;
                const targetCount = maxPlayers > 0 ? maxPlayers : playerCount;
                const minPlayers = Math.max(2, Math.min(targetCount, playerCount));
                if (playerCount >= targetCount && playerCount >= minPlayers) {
                    const mapId = roomResult.rows[0].map_id;
                    if (!mapId) {
                        statusMessage = 'No map selected for this game';
                    }
                    else {
                        try {
                            const validation = await mapService.validateMapPlayable(mapId);
                            if (!validation.isValid) {
                                statusMessage = `Selected map failed validation: ${validation.errors.join('; ')}`;
                            }
                        }
                        catch (_e) {
                            statusMessage = 'Map validation failed';
                        }
                    }
                    if (!statusMessage) {
                        shouldStart = true;
                        await client.query(`
            UPDATE game_rooms
            SET status = 'initializing',
                ready_check_started_at = NOW(),
                turn_number = 0,
                turn_expires_at = NULL
            WHERE id = $1
          `, [roomId]);
                    }
                }
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            logger.error('Auto-start lifecycle transaction failed', {
                roomId,
                error: error instanceof Error ? error.message : error,
            });
            shouldStart = false;
        }
        finally {
            client.release();
            await releaseLock(lockKey, lockToken);
        }
        if (!shouldStart) {
            if (statusMessage) {
                try {
                    const snap = await this.getLifecycleSnapshot(roomId);
                    snap.triggeredStart = false;
                    snap.statusMessage = statusMessage;
                    snap.statusMessageLevel = 'error';
                    await this.broadcastLifecycle(snap);
                }
                catch {
                }
            }
            return false;
        }
        try {
            await this.startGame(roomId, players, turnTimer);
        }
        catch (error) {
            logger.error('Failed to auto-start game', {
                roomId,
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined,
                playerCount: players.length,
            });
            await query(`
        UPDATE game_rooms
        SET status = 'lobby',
            ready_check_started_at = NULL,
            turn_number = 0,
            current_turn_user_id = NULL,
            turn_expires_at = NULL
        WHERE id = $1
      `, [roomId]);
            try {
                await query('DELETE FROM game_states WHERE room_id = $1', [roomId]);
                const { gameStateCache } = await import('./cacheService.js');
                await gameStateCache.deleteGameState(roomId);
            }
            catch (cleanupError) {
                logger.warn('Failed to cleanup partial game state after start failure', {
                    roomId,
                    error: cleanupError instanceof Error ? cleanupError.message : cleanupError,
                });
            }
            try {
                const snap = await this.getLifecycleSnapshot(roomId);
                snap.triggeredStart = false;
                snap.statusMessage = `Failed to auto-start game: ${error instanceof Error ? error.message : String(error)}`;
                snap.statusMessageLevel = 'error';
                await this.broadcastLifecycle(snap);
            }
            catch {
            }
            return false;
        }
        const snapshot = await this.getLifecycleSnapshot(roomId);
        snapshot.triggeredStart = true;
        await this.broadcastLifecycle(snapshot);
        return true;
    }
    async getLifecycleSnapshot(roomId) {
        const room = await this.gameRoomService.getRoomById(roomId);
        return {
            room,
            readyStates: room?.players?.map((player) => ({
                userId: player.userId ?? player.id,
                isReady: Boolean(player.isReady),
                readyAt: player.readyAt ? player.readyAt.toISOString() : null,
            })) ?? [],
            triggeredStart: false,
        };
    }
    async startGame(roomId, players, turnTimer) {
        const room = await this.gameRoomService.getRoomById(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
        if (!room.mapId) {
            throw new Error('No map selected for this game');
        }
        if (players.length < 2) {
            throw new Error(`Insufficient players to start game (${players.length}/2 minimum)`);
        }
        const teamAssignments = {};
        const playerConfigs = players.map((player) => {
            const slotIdentifier = player.user_id ?? player.ai_player_id;
            const configUserId = slotIdentifier ?? player.id;
            const matchingRoomPlayer = room?.players?.find((p) => p.id === player.id || (slotIdentifier && p.userId === slotIdentifier));
            const normalizedTeamId = typeof player.team_id === 'number' && !Number.isNaN(player.team_id) ? player.team_id : null;
            if (normalizedTeamId) {
                if (!teamAssignments[normalizedTeamId]) {
                    teamAssignments[normalizedTeamId] = [];
                }
                teamAssignments[normalizedTeamId].push(configUserId);
            }
            const normalizedDifficulty = (() => {
                if (matchingRoomPlayer && matchingRoomPlayer.aiDifficulty !== undefined) {
                    return matchingRoomPlayer.aiDifficulty;
                }
                if (player.ai_difficulty === null) {
                    return null;
                }
                if (typeof player.ai_difficulty === 'string') {
                    const lowered = player.ai_difficulty.toLowerCase();
                    if (lowered === 'recruit' || lowered === 'commander' || lowered === 'grandmaster') {
                        return lowered;
                    }
                }
                return undefined;
            })();
            const personalitySeed = (() => {
                if (matchingRoomPlayer && matchingRoomPlayer.aiPersonalitySeed !== undefined) {
                    return matchingRoomPlayer.aiPersonalitySeed;
                }
                if (typeof player.ai_personality_seed === 'number' &&
                    Number.isFinite(player.ai_personality_seed)) {
                    return Math.trunc(player.ai_personality_seed);
                }
                if (player.ai_personality_seed === null) {
                    return null;
                }
                return undefined;
            })();
            const selectedColor = (() => {
                const fromRoom = matchingRoomPlayer?.selected_color;
                if (typeof fromRoom === 'string' && fromRoom.trim().length > 0) {
                    return fromRoom.trim();
                }
                const fromRow = player.selected_color;
                if (typeof fromRow === 'string' && fromRow.trim().length > 0) {
                    return fromRow.trim();
                }
                return null;
            })();
            return {
                userId: configUserId,
                username: matchingRoomPlayer?.username,
                skillRating: typeof matchingRoomPlayer?.skill_rating === 'number'
                    ? matchingRoomPlayer.skill_rating
                    : undefined,
                teamId: normalizedTeamId,
                isAi: player.is_ai === true || matchingRoomPlayer?.isAi === true,
                aiDifficulty: normalizedDifficulty,
                aiPersonalitySeed: personalitySeed,
                color: selectedColor ?? undefined,
            };
        });
        const configOverrides = {};
        if (room?.mapId) {
            configOverrides.mapId = room.mapId;
        }
        if (room?.teamMode === 'teams' && room.numberOfTeams && room.numberOfTeams > 1) {
            configOverrides.allowTeamPlay = true;
            configOverrides.teamMode = 'teams';
            configOverrides.numberOfTeams = room.numberOfTeams;
            if (Object.keys(teamAssignments).length > 0) {
                configOverrides.teamAssignments = teamAssignments;
            }
        }
        if (room?.gameMode) {
            configOverrides.gameMode = room.gameMode;
        }
        if (room?.movementType) {
            configOverrides.movementType = room.movementType;
        }
        if (room?.fogOfWar && room.fogOfWar !== 'off') {
            configOverrides.fogOfWar = 'adjacent';
        }
        else {
            configOverrides.fogOfWar = 'off';
        }
        try {
            const { normalizeTreasureConfig } = await import('../game/hiddenTreasures.js');
            const roomTreasure = room?.treasureConfig;
            if (roomTreasure && typeof roomTreasure === 'object') {
                configOverrides.treasureConfig = normalizeTreasureConfig(roomTreasure);
            }
            else {
                const { cacheService } = await import('./cacheService.js');
                const cached = await cacheService.get(`room:treasure-config:${roomId}`);
                if (cached && typeof cached === 'object') {
                    configOverrides.treasureConfig = normalizeTreasureConfig(cached);
                    await cacheService.delete(`room:treasure-config:${roomId}`);
                }
            }
        }
        catch (_error) {
        }
        if (room?.gameMode === 'king_of_the_hill') {
            try {
                const roomKoth = room?.kingOfTheHillConfig;
                if (roomKoth && typeof roomKoth === 'object') {
                    configOverrides.kingOfTheHill = roomKoth;
                }
            }
            catch (_error) {
            }
        }
        let gameState;
        try {
            gameState = await this.gameService.initializeGame(roomId, playerConfigs, configOverrides);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to initialize game state', {
                roomId,
                mapId: room?.mapId,
                playerCount: players.length,
                error: errorMsg,
            });
            throw new Error(`Game initialization failed: ${errorMsg}`);
        }
        try {
            const initQuery = `
        UPDATE room_players rp
        SET time_bank_seconds_remaining = GREATEST(0, COALESCE(gr.time_bank_seconds, 0))
        FROM game_rooms gr
        WHERE rp.room_id = gr.id AND rp.room_id = $1
      `;
            await query(initQuery, [roomId]);
        }
        catch (error) {
            logger.warn('Failed to initialize time bank for room', {
                roomId,
                error: error instanceof Error ? error.message : error,
            });
        }
        if ((room?.gameMode === 'capitals' || configOverrides.gameMode === 'capitals') && room?.mapId) {
            try {
                await capitalGameService.initializeCapitals(roomId, players.length, room.mapId);
            }
            catch (error) {
                logger.warn('Failed to initialize capitals; continuing without capitals', {
                    roomId,
                    mapId: room?.mapId,
                    error: error instanceof Error ? error.message : error,
                });
            }
        }
        if (!gameState || !gameState.players || gameState.players.length === 0) {
            throw new Error('Invalid game state: missing players or game data');
        }
        if (!gameState.board || gameState.board.length === 0) {
            throw new Error('Invalid game state: no territories on board');
        }
        try {
            const { gameStateCache } = await import('./cacheService.js');
            const latest = await gameStateCache.getGameState(roomId);
            if (latest) {
                await this.gameService.saveSnapshot(roomId, latest);
            }
            else {
                await this.persistGameState(roomId, gameState);
            }
        }
        catch (error) {
            logger.error('Failed to persist game state to database', {
                roomId,
                error: error instanceof Error ? error.message : error,
            });
            throw new Error(`Failed to save game state: ${error instanceof Error ? error.message : error}`);
        }
        try {
            const createdAtIso = (room?.createdAt && new Date(room.createdAt).toISOString()) || new Date().toISOString();
            const nowIso = new Date().toISOString();
            await this.gameService.appendLog(roomId, [
                { type: 'LIFECYCLE', timestamp: createdAtIso, event: 'CREATED' },
                { type: 'LIFECYCLE', timestamp: nowIso, event: 'STARTED' },
            ]);
        }
        catch (err) {
            logger.warn('Failed to append lifecycle logs', {
                roomId,
                error: err instanceof Error ? err.message : err,
            });
        }
        await query(`
      UPDATE game_rooms
      SET status = 'active',
          turn_number = $2,
          current_turn_user_id = $3,
          turn_expires_at = CASE WHEN $4 > 0 THEN NOW() + ($4 * INTERVAL '1 second') ELSE NULL END,
          using_time_bank = FALSE,
          ready_check_started_at = NULL,
          started_at = COALESCE(started_at, NOW())
      WHERE id = $1
    `, [roomId, gameState.turn, gameState.currentPlayer, turnTimer]);
        await query('UPDATE room_players SET is_ready = FALSE, ready_at = NULL WHERE room_id = $1', [
            roomId,
        ]);
        const snapshot = await this.getLifecycleSnapshot(roomId);
        await this.broadcastLifecycle(snapshot);
        try {
            const stats = this.gameService.buildTurnStatsSnapshot(gameState);
            await this.gameService.appendTurnStats(roomId, stats);
        }
        catch (e) {
            logger.warn('Failed to append initial turn stats snapshot', {
                roomId,
                error: e instanceof Error ? e.message : e,
            });
        }
        const io = tryGetSocketServer();
        if (io) {
            const serialized = this.toSerializableGameState(gameState);
            try {
                const bytes = Buffer.byteLength(JSON.stringify(serialized), 'utf8');
                const { socketPayloadMetrics } = await import('./metricsService.js');
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
            }
            catch {
            }
            io.to(`game:${roomId}`).emit('game-update', serialized);
        }
        if (turnTimer && turnTimer > 0) {
            await this.scheduleTurnTimeout(roomId, { seconds: turnTimer, usingTimeBank: false });
        }
        await this.scheduleAiTurn(roomId);
    }
    async broadcastLifecycle(snapshot) {
        const io = tryGetSocketServer();
        if (!io || !snapshot.room) {
            return;
        }
        let computedLifecyclePhase = 'lobby';
        const roomStatus = snapshot.room.status;
        if (roomStatus === 'active') {
            try {
                const state = await this.gameService.getGameState(snapshot.room.id);
                computedLifecyclePhase = (state?.phase ?? 'reinforcement');
            }
            catch {
                computedLifecyclePhase = 'reinforcement';
            }
        }
        else if (roomStatus === 'lobby' || roomStatus === 'initializing') {
            computedLifecyclePhase = roomStatus;
        }
        else if (roomStatus === 'completed') {
            computedLifecyclePhase = 'reinforcement';
        }
        else {
            computedLifecyclePhase = 'lobby';
        }
        const players = snapshot.room.players?.map((player) => ({
            id: player.id,
            userId: player.userId ?? player.id,
            aiPlayerId: player.aiPlayerId ?? null,
            username: player.username,
            joinedAt: player.joinedAt instanceof Date ? player.joinedAt.toISOString() : player.joinedAt,
            isReady: Boolean(player.isReady),
            readyAt: player.readyAt instanceof Date ? player.readyAt.toISOString() : (player.readyAt ?? null),
            isAi: player.isAi === true,
            aiDifficulty: player.aiDifficulty ?? null,
            aiPersonalitySeed: player.aiPersonalitySeed ?? null,
            missedTurns: typeof player.missedTurns === 'number'
                ? player.missedTurns
                : undefined,
            lastMissedTurnAt: player.lastMissedTurnAt instanceof Date
                ? player.lastMissedTurnAt.toISOString()
                : (player.lastMissedTurnAt ?? null),
        }));
        const payload = {
            roomId: snapshot.room.id,
            status: snapshot.room.status,
            lifecyclePhase: computedLifecyclePhase,
            turnNumber: snapshot.room.turnNumber ?? 0,
            currentTurnUserId: snapshot.room.currentTurnUserId ?? null,
            turnExpiresAt: snapshot.room.turnExpiresAt ? snapshot.room.turnExpiresAt.toISOString() : null,
            readyCheckStartedAt: snapshot.room.readyCheckStartedAt
                ? snapshot.room.readyCheckStartedAt.toISOString()
                : null,
            timeBankSecondsRemaining: snapshot.room.timeBankSecondsRemaining ?? null,
            usingTimeBank: snapshot.room.usingTimeBank ?? false,
            replacementPendingUserId: snapshot.room.replacementPendingUserId ?? null,
            readyStates: snapshot.readyStates,
            players,
            ...(snapshot.statusMessage
                ? {
                    statusMessage: snapshot.statusMessage,
                    statusMessageLevel: snapshot.statusMessageLevel ?? 'info',
                }
                : {}),
        };
        io.to(snapshot.room.id).emit('lifecycle:update', payload);
        io.to(snapshot.room.id).emit('room-update', {
            id: snapshot.room.id,
            status: snapshot.room.status,
            lifecyclePhase: computedLifecyclePhase,
            turnNumber: snapshot.room.turnNumber,
            currentTurnUserId: snapshot.room.currentTurnUserId,
            turnExpiresAt: snapshot.room.turnExpiresAt ? snapshot.room.turnExpiresAt.toISOString() : null,
            timeBankSecondsRemaining: snapshot.room.timeBankSecondsRemaining ?? null,
            usingTimeBank: snapshot.room.usingTimeBank ?? false,
            readyCheckStartedAt: snapshot.room.readyCheckStartedAt
                ? snapshot.room.readyCheckStartedAt.toISOString()
                : null,
            replacementPendingUserId: snapshot.room.replacementPendingUserId ?? null,
            players,
            ...(snapshot.statusMessage
                ? {
                    statusMessage: snapshot.statusMessage,
                    statusMessageLevel: snapshot.statusMessageLevel ?? 'info',
                }
                : {}),
        });
    }
    async persistGameState(roomId, gameState) {
        const serializable = this.toSerializableGameState(gameState);
        try {
            await query(`
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
                JSON.stringify(serializable),
                Math.max(1, Number(gameState.turn ?? 1)),
                gameState.currentPlayer,
                gameState.phase ?? 'deployment',
            ]);
        }
        catch (error) {
            logger.error('Failed to persist initial game state to database', {
                roomId,
                phase: gameState.phase,
                turn: gameState.turn,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
        try {
            const { gameStateCache } = await import('./cacheService.js');
            await gameStateCache.setGameState(roomId, serializable);
        }
        catch (error) {
            logger.warn('Failed to cache initial game state', {
                roomId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
    toSerializableGameState(gameState) {
        return {
            ...gameState,
            territoryModifiers: gameState.territoryModifiers instanceof Map
                ? Object.fromEntries(gameState.territoryModifiers.entries())
                : (gameState.territoryModifiers ?? {}),
        };
    }
    normalizeStatus(status) {
        if (!status) {
            return 'lobby';
        }
        switch (status) {
            case 'waiting':
                return 'lobby';
            case 'starting':
                return 'initializing';
            case 'in_progress':
                return 'active';
            case 'finished':
                return 'completed';
            default: {
                const allowed = [
                    'lobby',
                    'initializing',
                    'active',
                    'completed',
                    'paused',
                    'abandoned',
                ];
                const normalized = status;
                return allowed.includes(normalized) ? normalized : 'lobby';
            }
        }
    }
    async refreshLifecycle(roomId) {
        const snapshot = await this.getLifecycleSnapshot(roomId);
        await this.broadcastLifecycle(snapshot);
        return snapshot;
    }
    async scheduleTurnTimeout(roomId, options) {
        try {
            const room = await this.gameRoomService.getRoomById(roomId);
            const seconds = options?.seconds ?? room?.turnTimerSeconds ?? 0;
            const currentTurnUserId = room?.currentTurnUserId ?? null;
            if (!seconds || seconds <= 0 || !currentTurnUserId) {
                await this.refreshLifecycle(roomId);
                return;
            }
            try {
                await query(`UPDATE game_rooms
             SET turn_expires_at = NOW() + ($2 * INTERVAL '1 second'),
                 using_time_bank = $3
           WHERE id = $1`, [roomId, seconds, options?.usingTimeBank === true]);
            }
            catch (e) {
                logger.warn('Failed to persist turn timeout window', {
                    roomId,
                    usingTimeBank: options?.usingTimeBank === true,
                    error: e instanceof Error ? e.message : e,
                });
            }
            const turnNumber = room?.turnNumber ?? 0;
            const idKey = `turn-timeout:${roomId}:turn:${turnNumber}`;
            const changed = await queueService.changeDelayedGameActionDelay(idKey, seconds * 1000);
            const job = changed
                ? null
                : await queueService.addDelayedGameAction({
                    gameId: roomId,
                    playerId: currentTurnUserId,
                    action: { type: 'end_turn', playerId: currentTurnUserId, roomId },
                    idempotencyKey: idKey,
                    turnTimeoutStage: 'expire',
                }, seconds * 1000, { idempotencyKey: idKey, priority: 10 });
            if (!job && process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
                try {
                    const existing = GameLifecycleService.localTurnTimeouts.get(roomId);
                    if (existing) {
                        clearTimeout(existing);
                        GameLifecycleService.localTurnTimeouts.delete(roomId);
                    }
                    const timer = setTimeout(() => {
                        this.handleTurnTimeout(roomId).catch(() => {
                        });
                    }, Math.max(0, seconds * 1000));
                    if (typeof timer.unref === 'function') {
                        timer.unref();
                    }
                    GameLifecycleService.localTurnTimeouts.set(roomId, timer);
                    logger.info('Scheduled local (dev) turn timeout fallback', {
                        roomId,
                        seconds,
                    });
                }
                catch (e) {
                    logger.warn('Failed to schedule local dev fallback timer', {
                        roomId,
                        error: e instanceof Error ? e.message : e,
                    });
                }
            }
            else {
                const existing = GameLifecycleService.localTurnTimeouts.get(roomId);
                if (existing) {
                    clearTimeout(existing);
                    GameLifecycleService.localTurnTimeouts.delete(roomId);
                }
            }
            await this.refreshLifecycle(roomId);
        }
        catch (error) {
            logger.warn('Failed to schedule turn timeout', {
                roomId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
    async scheduleAiTurn(roomId, options) {
        try {
            const state = await this.gameService.getGameState(roomId);
            if (!state || state.phase === 'finished')
                return;
            const current = state.players.find((p) => p.id === state.currentPlayer);
            if (!current || !current.isAi)
                return;
            const idKey = `ai-turn:${roomId}:turn:${state.turn}`;
            try {
                await queueService.removeGameActionJob(idKey);
            }
            catch {
            }
            const delay = Math.max(0, Math.trunc(options?.delayMs ?? 300));
            const queue = queueService.getGameActionQueue();
            await queue.add('execute-ai-turn', {
                gameId: roomId,
                playerId: current.id,
                turnNumber: state.turn,
                budgetOverrides: this.computeDefaultBudgetForDifficulty(current.aiDifficulty ?? 'recruit'),
                idempotencyKey: idKey,
            }, {
                jobId: idKey,
                delay,
                attempts: 1,
                removeOnFail: true,
                removeOnComplete: 10,
                priority: 7,
            });
            try {
                const io = tryGetSocketServer();
                if (io) {
                    io.to(`game:${roomId}`).emit('game-delta', {
                        type: 'SYSTEM_MESSAGE',
                        roomId,
                        timestamp: Date.now(),
                        text: 'ai:thinking',
                        playerId: current.id,
                    });
                }
            }
            catch {
            }
        }
        catch (error) {
            logger.warn('Failed to schedule AI turn', {
                roomId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
    computeDefaultBudgetForDifficulty(difficulty) {
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
                };
            default:
                return {
                    maxThinkTimeMs: 15000,
                    maxPlannedActions: 16,
                    readableDelayMs: 300,
                    maxAttackChains: 999,
                    minAttackOddsByTier: { grandmaster: 0.6 },
                };
        }
    }
    async handleTurnTimeout(roomId) {
        const client = await getClient();
        let strikes = 0;
        let targetUserId = null;
        let consumedBankSeconds = 0;
        let shouldSkip = false;
        try {
            const existing = GameLifecycleService.localTurnTimeouts.get(roomId);
            if (existing) {
                clearTimeout(existing);
                GameLifecycleService.localTurnTimeouts.delete(roomId);
            }
        }
        catch {
        }
        try {
            await client.query('BEGIN');
            const roomRes = await client.query(`
        SELECT gr.current_turn_user_id,
               gr.turn_expires_at,
               gr.turn_timer,
               gr.using_time_bank
          FROM game_rooms gr
         WHERE gr.id = $1
         FOR UPDATE OF gr
        `, [roomId]);
            const row = roomRes.rows[0];
            if (!row || !row.current_turn_user_id) {
                await client.query('ROLLBACK');
                return;
            }
            targetUserId = row.current_turn_user_id;
            const now = new Date();
            if (row.turn_expires_at && row.turn_expires_at > now) {
                await client.query('ROLLBACK');
                return;
            }
            let remainingBank = 0;
            try {
                const bankRes = await client.query(`
          SELECT time_bank_seconds_remaining
            FROM room_players
           WHERE room_id = $1 AND user_id = $2
           FOR UPDATE
          `, [roomId, targetUserId]);
                remainingBank = Math.max(0, Math.trunc(bankRes.rows[0]?.time_bank_seconds_remaining ?? 0));
            }
            catch (_e) {
                remainingBank = 0;
            }
            if (!row.using_time_bank && remainingBank > 0) {
                consumedBankSeconds = remainingBank;
                await client.query(`UPDATE room_players
             SET time_bank_seconds_remaining = 0
           WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
                await client.query(`UPDATE game_rooms
             SET using_time_bank = TRUE,
                 turn_expires_at = NOW() + ($3 * INTERVAL '1 second')
           WHERE id = $1`, [roomId, consumedBankSeconds]);
                await client.query('COMMIT');
                await this.scheduleTurnTimeout(roomId, {
                    seconds: consumedBankSeconds,
                    usingTimeBank: true,
                });
                return;
            }
            shouldSkip = true;
            await client.query(`UPDATE room_players
           SET missed_turns = missed_turns + 1,
               last_missed_turn_at = NOW()
         WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
            const missedRes = await client.query(`SELECT missed_turns FROM room_players WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
            strikes = missedRes.rows[0]?.missed_turns ?? 0;
            await client.query(`UPDATE game_rooms
           SET using_time_bank = FALSE,
               turn_expires_at = NULL
         WHERE id = $1`, [roomId]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error handling turn timeout', error);
            return;
        }
        finally {
            client.release();
        }
        if (!shouldSkip || !targetUserId) {
            return;
        }
        let lastResult = null;
        try {
            let steps = 0;
            const MAX_STEPS = 3;
            while (steps < MAX_STEPS) {
                const res = await this.gameService.endTurn(roomId, targetUserId, {
                    allowEarlyEnd: true,
                    endedByTimeout: true,
                });
                lastResult = res;
                steps += 1;
                if (res.gameState.phase === 'finished') {
                    break;
                }
                if (res.turnAdvanced &&
                    res.gameState.currentPlayer !== targetUserId &&
                    res.gameState.phase === 'reinforcement') {
                    break;
                }
            }
            try {
                const io = tryGetSocketServer();
                if (io) {
                    const { DeltaBuilder } = await import('../types/deltaUpdates.js');
                    const channel = `game:${roomId}`;
                    if (lastResult?.treasureAwarded) {
                        io.to(channel).emit('game-delta', {
                            type: 'TREASURE_AWARDED',
                            roomId,
                            timestamp: Date.now(),
                            userId: targetUserId,
                            metal: lastResult.treasureAwarded,
                        });
                    }
                    const phaseDelta = lastResult
                        ? DeltaBuilder.phaseChange(roomId, lastResult.gameState.phase, lastResult.gameState.currentPlayer, lastResult.gameState.turn, lastResult.reinforcementArmies)
                        : null;
                    if (phaseDelta)
                        io.to(channel).emit('game-delta', phaseDelta);
                }
            }
            catch (ee) {
                logger.warn('Failed to emit deltas after timeout skip', {
                    roomId,
                    error: ee instanceof Error ? ee.message : ee,
                });
            }
        }
        catch (error) {
            logger.warn('Turn timeout: endTurn failed', {
                roomId,
                targetUserId,
                error: error instanceof Error ? error.message : error,
            });
        }
        let neutralizeOutcome = null;
        if (strikes >= 3 && targetUserId) {
            try {
                neutralizeOutcome = await this.kickAndNeutralize(roomId, targetUserId);
                await query(`UPDATE game_rooms SET replacement_pending_user_id = $2 WHERE id = $1`, [
                    roomId,
                    targetUserId,
                ]);
            }
            catch (error) {
                logger.warn('Failed to neutralize kicked player after strikes', {
                    roomId,
                    targetUserId,
                    error: error instanceof Error ? error.message : error,
                });
            }
        }
        const gameEnded = (neutralizeOutcome?.elimination?.gameEnded ?? false) ||
            neutralizeOutcome?.state?.phase === 'finished' ||
            lastResult?.gameState?.phase === 'finished';
        if (gameEnded) {
            try {
                await this.refreshLifecycle(roomId);
            }
            catch (error) {
                logger.warn('Failed to refresh lifecycle after timeout game end', {
                    roomId,
                    error: error instanceof Error ? error.message : error,
                });
            }
            return;
        }
        await this.scheduleTurnTimeout(roomId);
    }
    async kickAndNeutralize(roomId, userId) {
        const result = await this.gameService.neutralizePlayerAndResolve(roomId, userId);
        await query(`UPDATE room_players
         SET is_kicked = TRUE,
             elimination_reason = 'timeout'
       WHERE room_id = $1 AND user_id = $2`, [roomId, userId]);
        return result;
    }
}
GameLifecycleService.localTurnTimeouts = new Map();
//# sourceMappingURL=gameLifecycleService.js.map