import { randomUUID } from 'node:crypto';
import { getClient, query, transaction } from '../config/database.js';
import { isPremiumColorChoice, PREMIUM_ACTIVE_STATUS_VALUES, PREMIUM_COLOR_MESSAGE, PREMIUM_GAME_LIMIT, PREMIUM_GAME_LIMIT_MESSAGE, } from '../constants/premium.js';
import { logger } from '../utils/logger.js';
const ACTIVE_ROOM_STATUS_VALUES = Array.from(PREMIUM_ACTIVE_STATUS_VALUES);
export class GameRoomService {
    validateTeamConfiguration(maxPlayers, teamMode, numberOfTeams) {
        if (teamMode === 'none' || teamMode === 'auto_balance') {
            return;
        }
        if (teamMode === 'teams') {
            if (!numberOfTeams || numberOfTeams < 2 || numberOfTeams > 6) {
                throw new Error('Invalid number of teams. Must be between 2 and 6.');
            }
            const validTeamOptions = this.getValidTeamOptions(maxPlayers);
            if (!validTeamOptions.includes(numberOfTeams)) {
                throw new Error(`${numberOfTeams} teams is not valid for ${maxPlayers} players. Valid options: ${validTeamOptions.filter((n) => n > 0).join(', ')} teams or Free for All.`);
            }
        }
    }
    getValidTeamOptions(playerCount) {
        const validOptions = [0];
        for (let teams = 2; teams <= 6; teams++) {
            if (playerCount % teams === 0 && playerCount / teams >= 2) {
                validOptions.push(teams);
            }
        }
        return validOptions;
    }
    normalizeTeamMode(teamMode, allowTeamPlay) {
        if (teamMode === 'teams' || teamMode === 'auto_balance' || teamMode === 'none') {
            return teamMode;
        }
        if (teamMode === true) {
            return 'teams';
        }
        if (teamMode === false || teamMode === null) {
            return 'none';
        }
        if (allowTeamPlay) {
            return 'teams';
        }
        return 'none';
    }
    normalizeNumberOfTeams(teamMode, requested) {
        if (teamMode === 'none') {
            return null;
        }
        if (typeof requested !== 'number' || Number.isNaN(requested)) {
            return null;
        }
        const normalized = Math.trunc(requested);
        return normalized > 0 ? normalized : null;
    }
    mapTeamMode(value) {
        if (value === 'auto_balance' || value === 'teams' || value === 'none') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.toLowerCase();
            if (normalized === 'true') {
                return 'teams';
            }
            if (normalized === 'auto_balance') {
                return 'auto_balance';
            }
            return 'none';
        }
        if (value === true) {
            return 'teams';
        }
        return 'none';
    }
    normalizeFogOfWar(value) {
        if (typeof value !== 'string') {
            return undefined;
        }
        const normalized = value.toLowerCase();
        if (normalized === 'off' || normalized === 'adjacent' || normalized === 'persistent') {
            return normalized;
        }
        if (normalized === 'on' || normalized === 'true') {
            return 'adjacent';
        }
        return undefined;
    }
    normalizeStatus(status) {
        if (!status) {
            return 'lobby';
        }
        if (status === 'waiting') {
            return 'lobby';
        }
        if (status === 'starting') {
            return 'initializing';
        }
        if (status === 'in_progress') {
            return 'active';
        }
        if (status === 'finished') {
            return 'completed';
        }
        const allowedStatuses = [
            'lobby',
            'initializing',
            'active',
            'completed',
            'paused',
            'abandoned',
        ];
        const normalized = status;
        return allowedStatuses.includes(normalized) ? normalized : 'lobby';
    }
    toDate(value) {
        if (!value) {
            return undefined;
        }
        return value instanceof Date ? value : new Date(value);
    }
    parseNullableNumber(value) {
        if (value === null || value === undefined) {
            return undefined;
        }
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            return Number.isNaN(parsed) ? undefined : parsed;
        }
        return undefined;
    }
    isPlayerRow(value) {
        return typeof value === 'object' && value !== null && 'id' in value && 'joinedAt' in value;
    }
    normalizePlayerTier(tier) {
        if (!tier) {
            return undefined;
        }
        const normalized = tier;
        const allowedTiers = [
            'Bronze',
            'Silver',
            'Gold',
            'Platinum',
            'Master',
            'Grandmaster',
        ];
        return allowedTiers.includes(normalized) ? normalized : undefined;
    }
    normalizeAIDifficulty(value) {
        if (value === null) {
            return null;
        }
        if (typeof value !== 'string') {
            return undefined;
        }
        const normalized = value.toLowerCase();
        const allowed = [
            'recruit',
            'commander',
            'grandmaster',
        ];
        return allowed.includes(normalized)
            ? normalized
            : undefined;
    }
    sanitizeAiOpponents(maxPlayers, aiOpponents, isRanked) {
        if (!Array.isArray(aiOpponents) || aiOpponents.length === 0) {
            return [];
        }
        if (isRanked) {
            return [];
        }
        const maxAvailableSlots = Math.max(0, maxPlayers - 1);
        if (maxAvailableSlots === 0) {
            return [];
        }
        const allowed = new Set(['recruit', 'commander', 'grandmaster']);
        const normalized = [];
        for (const entry of aiOpponents) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }
            const rawDifficulty = typeof entry.difficulty === 'string' ? entry.difficulty.toLowerCase() : null;
            if (!rawDifficulty || !allowed.has(rawDifficulty)) {
                continue;
            }
            let personalitySeed;
            if (typeof entry.personalitySeed === 'number' && Number.isFinite(entry.personalitySeed)) {
                personalitySeed = Math.trunc(entry.personalitySeed);
            }
            normalized.push({
                difficulty: rawDifficulty,
                personalitySeed: personalitySeed ?? undefined,
            });
            if (normalized.length >= maxAvailableSlots) {
                break;
            }
        }
        return normalized;
    }
    mapPlayers(players) {
        if (!Array.isArray(players)) {
            return undefined;
        }
        const mapped = players
            .filter((player) => this.isPlayerRow(player))
            .map((player) => {
            const isAi = player.isAi === true;
            const aiDifficulty = this.normalizeAIDifficulty(player.aiDifficulty);
            const usernameFallback = isAi
                ? `AI ${aiDifficulty ? aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1) : 'Opponent'}`
                : 'Unknown player';
            return {
                id: player.id,
                userId: typeof player.userId === 'string' && player.userId.length > 0
                    ? player.userId
                    : undefined,
                aiPlayerId: typeof player.aiPlayerId === 'string' && player.aiPlayerId.length > 0
                    ? player.aiPlayerId
                    : undefined,
                username: player.username ?? usernameFallback,
                skill_rating: this.parseNullableNumber(player.skill_rating) ?? undefined,
                current_tier: this.normalizePlayerTier(player.current_tier),
                preferred_color: typeof player.preferred_color === 'string' && player.preferred_color.length > 0
                    ? player.preferred_color
                    : undefined,
                selected_color: typeof player.selected_color === 'string' && player.selected_color.length > 0
                    ?
                        player.selected_color
                    : undefined,
                joinedAt: this.toDate(player.joinedAt) ?? new Date(),
                isReady: typeof player.isReady === 'boolean' ? player.isReady : undefined,
                readyAt: this.toDate(player.readyAt) ?? null,
                teamId: typeof player.teamId === 'number'
                    ? player.teamId
                    : player.teamId === null
                        ? null
                        : undefined,
                isAi,
                aiDifficulty,
                aiPersonalitySeed: typeof player.aiPersonalitySeed === 'number' &&
                    Number.isFinite(player.aiPersonalitySeed)
                    ? Math.trunc(player.aiPersonalitySeed)
                    : player.aiPersonalitySeed === null
                        ? null
                        : undefined,
                missedTurns: typeof player.missedTurns === 'number'
                    ? Math.max(0, Math.trunc(player.missedTurns))
                    : undefined,
                lastMissedTurnAt: this.toDate(player.lastMissedTurnAt) ?? null,
            };
        });
        return mapped.length > 0 ? mapped : undefined;
    }
    mapRoomRow(row) {
        const players = this.mapPlayers(row.players);
        const normalizedStatus = this.normalizeStatus(typeof row.status === 'string' ? row.status : null);
        const aggregatedCurrentPlayers = this.parseNullableNumber(row.current_players);
        const normalizedPlayerCount = this.parseNullableNumber(row.playerCount ?? row.playercount ?? row.current_players) ?? (players ? players.length : undefined);
        return {
            id: row.id,
            roomCode: typeof row.room_code === 'number'
                ? row.room_code
                : typeof row.room_code === 'string'
                    ? Number.parseInt(row.room_code, 10)
                    : undefined,
            name: row.name,
            hostId: row.host_id,
            maxPlayers: row.max_players,
            isPrivate: row.is_private,
            status: normalizedStatus,
            expiresAt: this.toDate(row.expires_at) ?? undefined,
            is_ranked: typeof row.is_ranked === 'boolean'
                ? row.is_ranked
                : row.is_ranked === null || row.is_ranked === undefined
                    ? undefined
                    : Boolean(row.is_ranked),
            avg_skill_rating: this.parseNullableNumber(row.avg_skill_rating),
            skill_variance: this.parseNullableNumber(row.skill_variance),
            min_skill_rating: this.parseNullableNumber(row.min_skill_rating),
            max_skill_rating: this.parseNullableNumber(row.max_skill_rating),
            skill_tier: (row.skill_tier ?? undefined),
            createdAt: this.toDate(row.created_at) ?? new Date(),
            updatedAt: this.toDate(row.updated_at),
            mapId: (row.map_id ?? undefined),
            gameMode: (row.game_mode ?? undefined),
            movementType: typeof row.movement_type === 'string'
                ? (row.movement_type ?? undefined)
                : undefined,
            allowTeamPlay: typeof row.team_mode === 'boolean'
                ? row.team_mode
                : this.mapTeamMode(row.team_mode) !== 'none',
            teamMode: this.mapTeamMode(row.team_mode),
            numberOfTeams: typeof row.number_of_teams === 'number'
                ? row.number_of_teams
                : row.number_of_teams === null
                    ? null
                    : undefined,
            turnTimerSeconds: this.parseNullableNumber(row.turn_timer) ?? undefined,
            fogOfWar: this.normalizeFogOfWar(row.fog_of_war),
            cardTradeMode: typeof row.card_trade_mode === 'string' ? row.card_trade_mode : undefined,
            bonusType: typeof row.bonus_type === 'string' ? row.bonus_type : undefined,
            treasureConfig: (row.treasure_config ?? undefined),
            kingOfTheHillConfig: (row.king_of_the_hill_config ?? undefined),
            currentPlayers: aggregatedCurrentPlayers ?? (players ? players.length : undefined),
            hostUsername: row.host_username ?? undefined,
            hostSkillRating: this.parseNullableNumber(row.host_skill_rating),
            hostTier: row.host_tier ?? undefined,
            mapName: row.map_name ?? undefined,
            gameStarted: typeof row.game_started === 'boolean' ? row.game_started : undefined,
            currentTurnUserId: row.current_turn_user_id ?? undefined,
            lifecyclePhase: (() => {
                const s = normalizedStatus;
                if (s === 'lobby' || s === 'initializing')
                    return s;
                if (s === 'completed')
                    return 'finished';
                return undefined;
            })(),
            turnNumber: this.parseNullableNumber(row.turn_number) ?? undefined,
            turnExpiresAt: this.toDate(row.turn_expires_at) ?? null,
            timeBankSeconds: this.parseNullableNumber(row.time_bank_seconds),
            timeBankSecondsRemaining: this.parseNullableNumber(row.time_bank_seconds_remaining),
            usingTimeBank: typeof row.using_time_bank === 'boolean'
                ? row.using_time_bank
                : false,
            readyCheckStartedAt: this.toDate(row.ready_check_started_at) ?? null,
            winner: typeof row.winner_id === 'string'
                ? row.winner_id
                : row.winner_id === null
                    ? null
                    : undefined,
            playerCount: normalizedPlayerCount,
            players,
            ...(typeof row.replacement_pending_user_id === 'string'
                ? {
                    replacementPendingUserId: row
                        .replacement_pending_user_id,
                }
                : {}),
        };
    }
    async createRoom(roomData) {
        if (!roomData.mapId || typeof roomData.mapId !== 'string') {
            throw new Error('Please select a map to create a game');
        }
        const hostResult = await query('SELECT is_vip, premium_tier FROM users WHERE id = $1', [roomData.hostId]);
        const hostRow = hostResult.rows[0];
        if (!hostRow) {
            throw new Error('User not found');
        }
        const hostPremiumTier = hostRow.premium_tier ?? 'free';
        const hostHasPremium = hostPremiumTier !== 'free';
        const hostIsVip = hostRow.is_vip === true;
        if (!hostHasPremium) {
            const activeCountResult = await query(`
        SELECT COUNT(*)::int AS count
        FROM room_players rp
        JOIN game_rooms gr ON gr.id = rp.room_id
        WHERE rp.user_id = $1
          AND COALESCE(gr.status, 'lobby') = ANY($2)
      `, [roomData.hostId, ACTIVE_ROOM_STATUS_VALUES]);
            const activeCount = Number(activeCountResult.rows[0]?.count ?? 0);
            if (activeCount >= PREMIUM_GAME_LIMIT) {
                throw new Error(PREMIUM_GAME_LIMIT_MESSAGE);
            }
        }
        if (roomData.mapId) {
            const mapResult = await query('SELECT is_vip_only FROM maps WHERE id = $1', [roomData.mapId]);
            if (mapResult.rows.length > 0 && mapResult.rows[0].is_vip_only) {
                if (!hostIsVip) {
                    throw new Error('This map is VIP-only. Upgrade to VIP to play on this map.');
                }
            }
        }
        const normalizedTeamMode = this.normalizeTeamMode(roomData.teamMode, roomData.allowTeamPlay);
        const normalizedNumberOfTeams = this.normalizeNumberOfTeams(normalizedTeamMode, roomData.numberOfTeams ?? null);
        const allowTeamPlay = normalizedTeamMode !== 'none';
        if (roomData.isRanked) {
            if (roomData.maxPlayers < 3) {
                throw new Error('Ranked games require at least 3 players');
            }
            if (roomData.isPrivate) {
                throw new Error('Ranked games cannot be private');
            }
            if (allowTeamPlay) {
                throw new Error('Ranked games cannot have team play enabled');
            }
        }
        this.validateTeamConfiguration(roomData.maxPlayers, normalizedTeamMode, normalizedNumberOfTeams);
        const sanitizedAiOpponents = this.sanitizeAiOpponents(roomData.maxPlayers, roomData.aiOpponents, roomData.isRanked);
        const roomRow = await transaction(async (client) => {
            const insertQuery = `
        INSERT INTO game_rooms (
          name,
          host_id,
          max_players,
          is_private,
          map_id,
          game_mode,
          movement_type,
          fog_of_war,
          turn_timer,
          time_bank_seconds,
          team_mode,
          number_of_teams,
          is_ranked,
          treasure_config,
          king_of_the_hill_config,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'lobby')
        RETURNING *
      `;
            const insertResult = await client.query(insertQuery, [
                roomData.name,
                roomData.hostId,
                roomData.maxPlayers,
                roomData.isPrivate,
                roomData.mapId,
                roomData.gameMode || 'classic',
                roomData.movementType || null,
                roomData.fogOfWar || null,
                typeof roomData.turnTimerSeconds === 'number' && Number.isFinite(roomData.turnTimerSeconds)
                    ? Math.trunc(roomData.turnTimerSeconds)
                    : 86400,
                typeof roomData.timeBankSeconds === 'number' && Number.isFinite(roomData.timeBankSeconds)
                    ? Math.max(0, Math.trunc(roomData.timeBankSeconds))
                    : 0,
                allowTeamPlay,
                normalizedNumberOfTeams,
                roomData.isRanked || false,
                roomData.treasureConfig ? JSON.stringify(roomData.treasureConfig) : null,
                roomData.kingOfTheHillConfig ? JSON.stringify(roomData.kingOfTheHillConfig) : null,
            ]);
            const createdRoom = insertResult.rows[0];
            if (!createdRoom) {
                throw new Error('Failed to create game room');
            }
            if (sanitizedAiOpponents.length > 0) {
                const insertAiQuery = `
          INSERT INTO room_players (
            room_id,
            user_id,
            ai_player_id,
            is_ai,
            ai_difficulty,
            ai_personality_seed,
            is_ready,
            ready_at
          )
          VALUES ($1, NULL, $2, TRUE, $3, $4, TRUE, NOW())
        `;
                for (const opponent of sanitizedAiOpponents) {
                    const aiIdentifier = randomUUID();
                    const seed = typeof opponent.personalitySeed === 'number'
                        ? opponent.personalitySeed
                        : Math.trunc(Math.random() * 10_000_000);
                    await client.query(insertAiQuery, [
                        createdRoom.id,
                        aiIdentifier,
                        opponent.difficulty,
                        seed,
                    ]);
                }
            }
            const initialGameState = {
                phase: 'lobby',
                turn: 1,
                currentPlayer: roomData.hostId,
                players: [],
                board: [],
            };
            await client.query(`INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
         VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
         ON CONFLICT (room_id) DO NOTHING`, [createdRoom.id, JSON.stringify(initialGameState), 1, roomData.hostId, 'lobby']);
            return createdRoom;
        });
        const hydratedRoom = await this.getRoomById(roomRow.id);
        return hydratedRoom ?? this.mapRoomRow(roomRow);
    }
    async pruneStaleRooms() {
        const result = await query(`DELETE FROM game_rooms
       WHERE status IN ('lobby', 'initializing')
         AND expires_at IS NOT NULL
         AND expires_at < NOW()
       RETURNING id`);
        return result.rowCount ?? 0;
    }
    async getActiveRooms() {
        const getQuery = `
      SELECT gr.*, 
             COUNT(rp.id) as current_players,
             u.username as host_username,
             u.skill_rating as host_skill_rating,
             -- u.current_tier as host_tier, -- Column doesn't exist yet
             NULL as host_tier,
             m.name as map_name
      FROM game_rooms gr
      LEFT JOIN room_players rp ON gr.id = rp.room_id
      LEFT JOIN users u ON gr.host_id = u.id
      LEFT JOIN maps m ON gr.map_id = m.id
      WHERE gr.status IN ('lobby', 'initializing', 'active')
      GROUP BY gr.id, u.username, u.skill_rating, m.name
      ORDER BY gr.created_at DESC
    `;
        const result = await query(getQuery);
        return result.rows.map((row) => {
            const mapped = this.mapRoomRow(row);
            return {
                ...mapped,
                currentPlayers: mapped.currentPlayers ?? 0,
            };
        });
    }
    async getRoomById(roomId) {
        await this.ensureAiReadyStates(roomId);
        const roomQuery = `
      SELECT gr.*,
             m.name as map_name,
             hu.username as host_username,
             hu.skill_rating as host_skill_rating,
             (
               SELECT rp2.time_bank_seconds_remaining
               FROM room_players rp2
               WHERE rp2.room_id = gr.id AND rp2.user_id = gr.current_turn_user_id
               LIMIT 1
             ) as time_bank_seconds_remaining,
             json_agg(
               json_build_object(
                  'id', rp.id,
                  'userId', rp.user_id,
                  'aiPlayerId', rp.ai_player_id,
                  'username', COALESCE(
                    u.username,
                    CASE
                      WHEN rp.is_ai THEN CONCAT('AI ', INITCAP(COALESCE(rp.ai_difficulty, 'opponent')))
                      ELSE 'Unknown player'
                    END
                  ),
                  'skill_rating', u.skill_rating,
                  -- 'current_tier', u.current_tier, -- Column doesn't exist yet
                  'current_tier', NULL,
              'preferred_color', up.preferred_color,
              'selected_color', rp.selected_color,
                  'joinedAt', rp.joined_at,
                  'isReady', rp.is_ready,
                  'readyAt', rp.ready_at,
                  'teamId', rp.team_id,
                  'isAi', rp.is_ai,
                  'aiDifficulty', rp.ai_difficulty,
                  'aiPersonalitySeed', rp.ai_personality_seed,
                  'missedTurns', rp.missed_turns,
                  'lastMissedTurnAt', rp.last_missed_turn_at
               )
               ORDER BY rp.joined_at
             ) FILTER (WHERE rp.id IS NOT NULL) as players
      FROM game_rooms gr
      LEFT JOIN room_players rp ON gr.id = rp.room_id
      LEFT JOIN users u ON rp.user_id = u.id
      LEFT JOIN user_preferences up ON u.id = up.user_id
      LEFT JOIN maps m ON gr.map_id = m.id
      LEFT JOIN users hu ON gr.host_id = hu.id
      WHERE gr.id = $1
      GROUP BY gr.id, m.name, hu.username, hu.skill_rating
    `;
        const result = await query(roomQuery, [roomId]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return this.mapRoomRow(row);
    }
    async getRoomByCode(roomCode) {
        const result = await query('SELECT id FROM game_rooms WHERE room_code = $1', [
            roomCode,
        ]);
        const row = result.rows[0];
        if (!row)
            return null;
        return this.getRoomById(row.id);
    }
    async resolveRoomId(idOrCode) {
        if (/^\d+$/.test(idOrCode)) {
            const code = Number.parseInt(idOrCode, 10);
            const res = await query('SELECT id FROM game_rooms WHERE room_code = $1', [
                code,
            ]);
            const row = res.rows[0];
            if (!row)
                throw new Error('Room not found');
            return row.id;
        }
        return idOrCode;
    }
    async getRoomByIdOrCode(idOrCode) {
        if (/^\d+$/.test(idOrCode)) {
            const code = Number.parseInt(idOrCode, 10);
            return this.getRoomByCode(code);
        }
        return this.getRoomById(idOrCode);
    }
    async triggerAutoStartIfReady(roomId) {
        const { GameLifecycleService } = await import('./gameLifecycleService.js');
        try {
            const lifecycleService = new GameLifecycleService();
            await lifecycleService.maybeAutoStart(roomId);
        }
        catch (error) {
            logger.warn('Failed to evaluate auto-start after lobby change', {
                roomId,
                error: error instanceof Error ? error.message : error,
            });
        }
    }
    async ensureAiReadyStates(roomId) {
        const updateQuery = `
      UPDATE room_players
      SET is_ready = TRUE,
          ready_at = COALESCE(ready_at, NOW())
      WHERE room_id = $1
        AND is_ai IS TRUE
        AND (is_ready IS DISTINCT FROM TRUE OR ready_at IS NULL)
    `;
        await query(updateQuery, [roomId]);
    }
    async updateAiOpponents(roomId, hostId, aiOpponents = []) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            const roomResult = await client.query('SELECT host_id, status, max_players, is_ranked FROM game_rooms WHERE id = $1 FOR UPDATE', [roomId]);
            const roomRow = roomResult.rows[0];
            if (!roomRow) {
                throw new Error('Room not found');
            }
            if (roomRow.host_id !== hostId) {
                throw new Error('Only the host can update AI opponents');
            }
            const lifecycleStatus = this.normalizeStatus(roomRow.status);
            if (lifecycleStatus !== 'lobby') {
                throw new Error('AI opponents can only be updated in the lobby');
            }
            if (roomRow.is_ranked) {
                throw new Error('Ranked games cannot use AI opponents');
            }
            const playersResult = await client.query('SELECT id, user_id, ai_player_id, is_ai, ai_difficulty, ai_personality_seed FROM room_players WHERE room_id = $1 ORDER BY joined_at ASC', [roomId]);
            const existingAiPlayers = playersResult.rows.filter((player) => player.is_ai);
            const humanPlayerCount = playersResult.rows.filter((player) => !player.is_ai).length;
            const maxAiCapacity = Math.max(0, roomRow.max_players - humanPlayerCount);
            const sanitizedRequested = this.sanitizeAiOpponents(roomRow.max_players, aiOpponents, roomRow.is_ranked ?? false);
            if (sanitizedRequested.length > maxAiCapacity) {
                throw new Error('Not enough open seats for the requested AI opponents');
            }
            const desiredCounts = {
                recruit: 0,
                commander: 0,
                grandmaster: 0,
            };
            const desiredSeeds = {
                recruit: [],
                commander: [],
                grandmaster: [],
            };
            sanitizedRequested.forEach((entry) => {
                if (!entry) {
                    return;
                }
                const difficulty = entry.difficulty;
                if (!difficulty) {
                    return;
                }
                desiredCounts[difficulty] = (desiredCounts[difficulty] ?? 0) + 1;
                desiredSeeds[difficulty]?.push(entry.personalitySeed);
            });
            const existingByDifficulty = {
                recruit: [],
                commander: [],
                grandmaster: [],
            };
            existingAiPlayers.forEach((player) => {
                const normalizedDifficulty = this.normalizeAIDifficulty(player.ai_difficulty);
                if (!normalizedDifficulty) {
                    return;
                }
                existingByDifficulty[normalizedDifficulty].push(player);
            });
            const removedIds = [];
            for (const difficulty of Object.keys(desiredCounts)) {
                const targetCount = desiredCounts[difficulty];
                const existing = existingByDifficulty[difficulty];
                if (existing.length > targetCount) {
                    const removeCount = existing.length - targetCount;
                    const toRemove = existing.splice(existing.length - removeCount, removeCount);
                    toRemove.forEach((player) => {
                        removedIds.push(player.id);
                    });
                }
                if (targetCount > existing.length) {
                    const addCount = targetCount - existing.length;
                    for (let index = 0; index < addCount; index += 1) {
                        const aiIdentifier = randomUUID();
                        const personalitySeedRaw = desiredSeeds[difficulty]?.shift();
                        const personalitySeed = typeof personalitySeedRaw === 'number' && Number.isFinite(personalitySeedRaw)
                            ? Math.trunc(personalitySeedRaw)
                            : Math.trunc(Math.random() * 10_000_000);
                        await client.query(`
              INSERT INTO room_players (
                room_id,
                user_id,
                ai_player_id,
                is_ai,
                ai_difficulty,
                ai_personality_seed,
                is_ready,
                ready_at
              )
              VALUES ($1, NULL, $2, TRUE, $3, $4, TRUE, NOW())
            `, [roomId, aiIdentifier, difficulty, personalitySeed]);
                    }
                }
            }
            if (removedIds.length > 0) {
                await client.query('DELETE FROM room_players WHERE room_id = $1 AND id = ANY($2::uuid[])', [
                    roomId,
                    removedIds,
                ]);
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
        await this.ensureAiReadyStates(roomId);
        await this.triggerAutoStartIfReady(roomId);
        const updatedRoom = await this.getRoomById(roomId);
        if (!updatedRoom) {
            throw new Error('Failed to load room after updating AI opponents');
        }
        return updatedRoom;
    }
    async isPlayerInRoom(roomId, userId) {
        const membershipQuery = `
      SELECT 1
      FROM room_players
      WHERE room_id = $1 AND user_id = $2
      LIMIT 1
    `;
        const result = await query(membershipQuery, [roomId, userId]);
        return (result.rowCount ?? 0) > 0;
    }
    async getPlayer(roomId, userId) {
        const playerQuery = `
      SELECT rp.id, rp.user_id, rp.ai_player_id, u.username, rp.joined_at, rp.is_ready, rp.ready_at, rp.team_id,
             rp.is_ai, rp.ai_difficulty, rp.ai_personality_seed, rp.selected_color
      FROM room_players rp
      LEFT JOIN users u ON rp.user_id = u.id
      WHERE rp.room_id = $1 AND rp.user_id = $2
      LIMIT 1
    `;
        const result = await query(playerQuery, [roomId, userId]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return {
            id: row.id,
            userId: row.user_id,
            aiPlayerId: typeof row.ai_player_id === 'string' ? row.ai_player_id : undefined,
            username: row.username ?? 'Unknown player',
            joinedAt: this.toDate(row.joined_at) ?? new Date(),
            isReady: typeof row.is_ready === 'boolean' ? row.is_ready : undefined,
            readyAt: this.toDate(row.ready_at) ?? null,
            teamId: typeof row.team_id === 'number' ? row.team_id : row.team_id === null ? null : undefined,
            isAi: row.is_ai === true,
            aiDifficulty: this.normalizeAIDifficulty(row.ai_difficulty),
            aiPersonalitySeed: typeof row.ai_personality_seed === 'number' && Number.isFinite(row.ai_personality_seed)
                ? Math.trunc(row.ai_personality_seed)
                : row.ai_personality_seed === null
                    ? null
                    : undefined,
            selected_color: typeof row.selected_color === 'string' && row.selected_color.length > 0
                ? row.selected_color
                : undefined,
        };
    }
    async joinRoom(roomId, userId, options) {
        const client = await getClient();
        let joinSucceeded = false;
        try {
            await client.query('BEGIN');
            const roomQuery = `SELECT * FROM game_rooms WHERE id = $1`;
            const roomResult = await client.query(roomQuery, [roomId]);
            if (roomResult.rows.length === 0) {
                throw new Error('Room not found');
            }
            const room = roomResult.rows[0];
            const lifecycleStatus = this.normalizeStatus(room.status);
            if (lifecycleStatus !== 'lobby') {
                throw new Error('Room is not accepting new players');
            }
            const userResult = await client.query('SELECT premium_tier, is_vip, skill_rating FROM users WHERE id = $1', [userId]);
            const userRow = userResult.rows[0];
            if (!userRow) {
                throw new Error('User not found');
            }
            const premiumTier = userRow.premium_tier ?? 'free';
            const userHasPremium = premiumTier !== 'free';
            const userIsVip = userRow.is_vip === true;
            const userRating = typeof userRow.skill_rating === 'number' ? userRow.skill_rating : 800;
            if (room.map_id) {
                const mapQuery = 'SELECT is_vip_only FROM maps WHERE id = $1';
                const mapResult = await client.query(mapQuery, [room.map_id]);
                if (mapResult.rows.length > 0 && mapResult.rows[0].is_vip_only && !userIsVip) {
                    throw new Error('This map is VIP-only. Upgrade to VIP to join this game.');
                }
            }
            const membershipResult = await client.query('SELECT 1 FROM room_players WHERE room_id = $1 AND user_id = $2 LIMIT 1', [roomId, userId]);
            const alreadyInRoom = (membershipResult.rowCount ?? 0) > 0;
            if (!userHasPremium && !alreadyInRoom) {
                const activeCountResult = await client.query(`
          SELECT COUNT(*)::int AS count
          FROM room_players rp
          JOIN game_rooms gr ON gr.id = rp.room_id
          WHERE rp.user_id = $1
            AND COALESCE(gr.status, 'lobby') = ANY($2)
        `, [userId, ACTIVE_ROOM_STATUS_VALUES]);
                const activeCount = Number(activeCountResult.rows[0]?.count ?? 0);
                if (activeCount >= PREMIUM_GAME_LIMIT) {
                    throw new Error(PREMIUM_GAME_LIMIT_MESSAGE);
                }
            }
            const playerCountQuery = `SELECT COUNT(*) as count FROM room_players WHERE room_id = $1`;
            const countResult = await client.query(playerCountQuery, [roomId]);
            const currentPlayers = parseInt(countResult.rows[0].count, 10);
            if (currentPlayers >= room.max_players) {
                throw new Error('Room is full');
            }
            if (room.is_ranked) {
                const playersQuery = `
          SELECT AVG(u.skill_rating) as avg_rating,
                 MIN(u.skill_rating) as min_rating,
                 MAX(u.skill_rating) as max_rating
          FROM room_players rp
          JOIN users u ON rp.user_id = u.id
          WHERE rp.room_id = $1
        `;
                const playersResult = await client.query(playersQuery, [roomId]);
                if (playersResult.rows[0].avg_rating) {
                    const avgRating = parseFloat(playersResult.rows[0].avg_rating);
                    if (Math.abs(userRating - avgRating) > 500) {
                        throw new Error(`Skill rating difference too large. Your rating: ${userRating}, Room average: ${Math.round(avgRating)}`);
                    }
                }
            }
            const usedColorsRes = await client.query(`SELECT selected_color FROM room_players WHERE room_id = $1 AND selected_color IS NOT NULL`, [roomId]);
            const used = new Set(usedColorsRes.rows
                .map((r) => r.selected_color)
                .filter((c) => typeof c === 'string')
                .map((c) => c.toUpperCase()));
            const normalize = (c) => typeof c === 'string' && c.trim().length > 0 ? c.trim().toUpperCase() : null;
            let finalColor = null;
            const requested = options?.selectedColor ?? null;
            const requestedNorm = requested ? normalize(requested) : null;
            if (requested && requestedNorm) {
                if (!userHasPremium && isPremiumColorChoice(requested)) {
                    throw new Error(PREMIUM_COLOR_MESSAGE);
                }
                if (used.has(requestedNorm)) {
                    throw new Error('Color already taken');
                }
                finalColor = requested;
            }
            else {
                const prefRes = await client.query(`SELECT preferred_color FROM user_preferences WHERE user_id = $1`, [userId]);
                const preferred = prefRes.rows[0]?.preferred_color ?? null;
                const preferredNorm = preferred ? normalize(preferred) : null;
                const preferredIsPremium = preferred ? isPremiumColorChoice(preferred) : false;
                if (preferred &&
                    (!preferredIsPremium || userHasPremium) &&
                    (!preferredNorm || !used.has(preferredNorm))) {
                    finalColor = preferred;
                }
                else {
                    const palette = [
                        '#DC2626',
                        '#851D2D',
                        '#EC4899',
                        '#EA580C',
                        '#F59E0B',
                        '#014421',
                        '#059669',
                        '#2563EB',
                        '#06B6D4',
                        '#7C3AED',
                        '#918151',
                        '#5C4033',
                    ];
                    finalColor = palette.find((c) => !used.has(c.toUpperCase())) ?? null;
                }
            }
            const joinQuery = `
        INSERT INTO room_players (room_id, user_id, is_ready, ready_at, selected_color)
        VALUES ($1, $2, TRUE, NOW(), $3)
        ON CONFLICT (room_id, user_id) DO UPDATE
          SET is_ready = TRUE,
              ready_at = NOW(),
              selected_color = COALESCE(EXCLUDED.selected_color, room_players.selected_color)
      `;
            await client.query(joinQuery, [roomId, userId, finalColor]);
            await client.query('COMMIT');
            joinSucceeded = true;
            return { success: true, message: 'Joined room successfully' };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            if (client.release) {
                client.release();
            }
            if (joinSucceeded) {
                await this.triggerAutoStartIfReady(roomId);
            }
        }
    }
    async assignPlayerToTeam(roomId, actingUserId, targetPlayerIdentifier, teamId) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            const roomResult = await client.query('SELECT host_id, team_mode, number_of_teams FROM game_rooms WHERE id = $1 FOR UPDATE', [
                roomId,
            ]);
            const roomRow = roomResult.rows[0];
            if (!roomRow) {
                throw new Error('Room not found');
            }
            if (roomRow.host_id !== actingUserId) {
                throw new Error('Only the host can update team assignments');
            }
            const teamMode = this.mapTeamMode(roomRow.team_mode);
            const totalTeams = this.normalizeNumberOfTeams(teamMode, roomRow.number_of_teams);
            if (teamMode === 'none' || !totalTeams) {
                throw new Error('Team play is not enabled for this room');
            }
            const playerLookupById = await client.query('SELECT id, user_id FROM room_players WHERE room_id = $1 AND id = $2', [
                roomId,
                targetPlayerIdentifier,
            ]);
            let targetPlayerRow = playerLookupById.rows[0];
            if (!targetPlayerRow) {
                const playerLookupByUser = await client.query('SELECT id, user_id FROM room_players WHERE room_id = $1 AND user_id = $2', [
                    roomId,
                    targetPlayerIdentifier,
                ]);
                targetPlayerRow = playerLookupByUser.rows[0];
            }
            if (!targetPlayerRow) {
                throw new Error('Player is not part of this room');
            }
            let normalizedTeamId;
            if (teamId === null || teamId === undefined) {
                normalizedTeamId = null;
            }
            else {
                const numericTeamId = Number(teamId);
                if (Number.isNaN(numericTeamId)) {
                    throw new Error('Team identifier must be numeric');
                }
                const truncated = Math.trunc(numericTeamId);
                normalizedTeamId = truncated >= 1 ? truncated : null;
            }
            if (normalizedTeamId !== null) {
                if (normalizedTeamId < 1 || normalizedTeamId > totalTeams) {
                    throw new Error(`Team must be between 1 and ${totalTeams}`);
                }
            }
            await client.query('UPDATE room_players SET team_id = $3 WHERE room_id = $1 AND id = $2', [
                roomId,
                targetPlayerRow.id,
                normalizedTeamId,
            ]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            if (client.release) {
                client.release();
            }
        }
        const updatedRoom = await this.getRoomById(roomId);
        if (!updatedRoom) {
            throw new Error('Failed to load room after updating team assignment');
        }
        return updatedRoom;
    }
    async leaveRoom(roomId, userId) {
        await query(`DELETE FROM room_players WHERE room_id = $1 AND user_id = $2`, [roomId, userId]);
        const result = await query('SELECT host_id, status FROM game_rooms WHERE id = $1', [roomId]);
        const row = result.rows[0];
        if (!row)
            return;
        const status = this.normalizeStatus(row.status);
        const hostLeft = row.host_id === userId;
        if (hostLeft && (status === 'lobby' || status === 'initializing')) {
            await this.performCloseRoom(roomId);
            return;
        }
        if (status === 'lobby' || status === 'initializing') {
            await query(`
        UPDATE game_rooms
        SET status = 'lobby',
            ready_check_started_at = NULL,
            turn_number = 0,
            turn_expires_at = NULL,
            current_turn_user_id = NULL
        WHERE id = $1 AND status IN ('lobby', 'initializing')
      `, [roomId]);
        }
    }
    async closeRoom(roomId, actorUserId) {
        const res = await query(`SELECT host_id, status FROM game_rooms WHERE id = $1`, [roomId]);
        const row = res.rows[0];
        if (!row) {
            throw new Error('Room not found');
        }
        const status = this.normalizeStatus(row.status);
        if (row.host_id !== actorUserId) {
            throw new Error('Only the host can close the room');
        }
        if (status !== 'lobby' && status !== 'initializing') {
            throw new Error('Game already started');
        }
        await this.performCloseRoom(roomId);
    }
    async performCloseRoom(roomId) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE game_rooms
         SET status = 'abandoned',
             ended_at = NOW(),
             ready_check_started_at = NULL,
             turn_number = 0,
             current_turn_user_id = NULL,
             turn_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $1`, [roomId]);
            await client.query(`DELETE FROM room_players WHERE room_id = $1`, [roomId]);
            await client.query(`DELETE FROM game_states WHERE room_id = $1`, [roomId]);
            await client.query('COMMIT');
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
            try {
                const { gameStateCache } = await import('./cacheService.js');
                await gameStateCache.deleteGameState(roomId);
            }
            catch {
            }
        }
    }
    async getUserGames(userId) {
        const gamesQuery = `
      SELECT DISTINCT gr.*,
        (SELECT COUNT(*) FROM room_players WHERE room_id = gr.id) as playerCount,
        u.username as host_username
      FROM game_rooms gr
      INNER JOIN room_players rp ON gr.id = rp.room_id
      LEFT JOIN users u ON u.id = gr.host_id
      WHERE rp.user_id = $1
      ORDER BY gr.created_at DESC
      LIMIT 50
    `;
        const result = await query(gamesQuery, [userId]);
        return result.rows.map((row) => this.mapRoomRow(row));
    }
}
//# sourceMappingURL=gameRoomService.js.map