import { randomUUID } from 'node:crypto'
import { DeterministicRng } from '@conquestk/shared/utils/deterministicRng'
import { getClient, query, transaction } from '../config/database.js'
import {
  isPremiumColorChoice,
  PREMIUM_ACTIVE_STATUS_VALUES,
  PREMIUM_COLOR_MESSAGE,
  PREMIUM_GAME_LIMIT,
  PREMIUM_GAME_LIMIT_MESSAGE,
} from '../constants/premium.js'
import type { GameLifecycleStatus, GameRoom, Player } from '../types/gameRoom.js'
import { logger } from '../utils/logger.js'

type AIDifficultyOption = NonNullable<Player['aiDifficulty']>

export interface CreateRoomData {
  name: string
  hostId: string
  maxPlayers: number
  isPrivate: boolean
  mapId?: string
  gameMode?: string
  allowTeamPlay?: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance' | boolean | null
  numberOfTeams?: number | null
  isRanked?: boolean
  aiOpponents?: Array<{
    difficulty: AIDifficultyOption
    personalitySeed?: number | null
  }>
  treasureConfig?: unknown
  kingOfTheHillConfig?: unknown
  movementType?: 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi'
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  turnTimerSeconds?: number
  timeBankSeconds?: number
}

interface GameRoomRow {
  id: string
  name: string
  host_id: string
  max_players: number
  is_private: boolean
  status: string
  room_code?: number | string | null
  expires_at?: Date | string | null
  turn_number?: number | string | null
  turn_expires_at?: Date | string | null
  ready_check_started_at?: Date | string | null
  created_at: Date | string
  updated_at?: Date | string | null
  turn_timer?: number | string | null
  is_ranked?: boolean | null
  avg_skill_rating?: number | string | null
  skill_variance?: number | string | null
  min_skill_rating?: number | null
  max_skill_rating?: number | null
  skill_tier?: string | null
  map_id?: string | null
  game_mode?: string | null
  fog_of_war?: string | null
  card_trade_mode?: string | null
  bonus_type?: string | null
  treasure_config?: unknown | null
  king_of_the_hill_config?: unknown | null
  movement_type?: string | null
  team_mode?: boolean | string | null
  number_of_teams?: number | null
  game_started?: boolean | null
  current_turn_user_id?: string | null
  winner?: string | null
  playercount?: number | string | null
  playerCount?: number | string | null
  [key: string]: unknown
}

interface ActiveGameRoomRow extends GameRoomRow {
  current_players: number | string | null
  host_username: string | null
  host_skill_rating: number | null
  host_tier: string | null
  map_name: string | null
}

interface PlayerRow {
  id: string
  userId?: string | null
  aiPlayerId?: string | null
  username?: string | null
  skill_rating?: number | null
  current_tier?: string | null
  preferred_color?: string | null
  selectedColor?: string | null
  selected_color?: string | null
  joinedAt: Date | string | null
  isReady?: boolean | null
  readyAt?: Date | string | null
  teamId?: number | null
  isAi?: boolean | null
  aiDifficulty?: string | null
  aiPersonalitySeed?: number | null
  missedTurns?: number | null
  lastMissedTurnAt?: Date | string | null
}

interface GameRoomWithPlayersRow extends GameRoomRow {
  players: (PlayerRow | null)[] | null
}

const ACTIVE_ROOM_STATUS_VALUES = Array.from(PREMIUM_ACTIVE_STATUS_VALUES)

export class GameRoomService {
  private validateTeamConfiguration(
    maxPlayers: number,
    teamMode: 'none' | 'teams' | 'auto_balance',
    numberOfTeams?: number | null,
  ): void {
    if (teamMode === 'none' || teamMode === 'auto_balance') {
      return // No validation needed for FFA or auto-balance
    }

    if (teamMode === 'teams') {
      if (!numberOfTeams || numberOfTeams < 2 || numberOfTeams > 6) {
        throw new Error('Invalid number of teams. Must be between 2 and 6.')
      }

      // Check if the team configuration is valid for the player count
      const validTeamOptions = this.getValidTeamOptions(maxPlayers)
      if (!validTeamOptions.includes(numberOfTeams)) {
        throw new Error(
          `${numberOfTeams} teams is not valid for ${maxPlayers} players. Valid options: ${validTeamOptions.filter((n) => n > 0).join(', ')} teams or Free for All.`,
        )
      }
    }
  }

  private getValidTeamOptions(playerCount: number): number[] {
    const validOptions: number[] = [0] // 0 represents Free for All

    // Check all possible team counts from 2 to 6
    for (let teams = 2; teams <= 6; teams++) {
      // Valid if players divide evenly and at least 2 players per team
      if (playerCount % teams === 0 && playerCount / teams >= 2) {
        validOptions.push(teams)
      }
    }

    return validOptions
  }

  private normalizeTeamMode(
    teamMode: CreateRoomData['teamMode'],
    allowTeamPlay?: boolean,
  ): 'none' | 'teams' | 'auto_balance' {
    if (teamMode === 'teams' || teamMode === 'auto_balance' || teamMode === 'none') {
      return teamMode
    }

    if (teamMode === true) {
      return 'teams'
    }

    if (teamMode === false || teamMode === null) {
      return 'none'
    }

    if (allowTeamPlay) {
      return 'teams'
    }

    return 'none'
  }

  private normalizeNumberOfTeams(
    teamMode: 'none' | 'teams' | 'auto_balance',
    requested: number | null | undefined,
  ): number | null {
    if (teamMode === 'none') {
      return null
    }

    if (typeof requested !== 'number' || Number.isNaN(requested)) {
      return null
    }

    const normalized = Math.trunc(requested)
    return normalized > 0 ? normalized : null
  }

  private mapTeamMode(value: GameRoomRow['team_mode']): 'none' | 'teams' | 'auto_balance' {
    if (value === 'auto_balance' || value === 'teams' || value === 'none') {
      return value
    }

    if (typeof value === 'string') {
      const normalized = value.toLowerCase()
      if (normalized === 'true') {
        return 'teams'
      }
      if (normalized === 'auto_balance') {
        return 'auto_balance'
      }
      return 'none'
    }

    if (value === true) {
      return 'teams'
    }

    return 'none'
  }

  private normalizeFogOfWar(value: unknown): 'off' | 'adjacent' | 'persistent' | undefined {
    if (typeof value !== 'string') {
      return undefined
    }

    const normalized = value.toLowerCase()
    if (normalized === 'off' || normalized === 'adjacent' || normalized === 'persistent') {
      return normalized
    }

    if (normalized === 'on' || normalized === 'true') {
      return 'adjacent'
    }

    return undefined
  }

  private normalizeStatus(status: string | null | undefined): GameLifecycleStatus {
    if (!status) {
      return 'lobby'
    }

    if (status === 'waiting') {
      return 'lobby'
    }

    if (status === 'starting') {
      return 'initializing'
    }

    if (status === 'in_progress') {
      return 'active'
    }

    if (status === 'finished') {
      return 'completed'
    }

    const allowedStatuses: GameLifecycleStatus[] = [
      'lobby',
      'initializing',
      'active',
      'completed',
      'paused',
      'abandoned',
    ]

    const normalized = status as GameLifecycleStatus
    return allowedStatuses.includes(normalized) ? normalized : 'lobby'
  }

  private toDate(value: Date | string | null | undefined): Date | undefined {
    if (!value) {
      return undefined
    }
    return value instanceof Date ? value : new Date(value)
  }

  private parseNullableNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined
    }
    if (typeof value === 'number') {
      return value
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      return Number.isNaN(parsed) ? undefined : parsed
    }
    return undefined
  }

  private isPlayerRow(value: unknown): value is PlayerRow {
    return typeof value === 'object' && value !== null && 'id' in value && 'joinedAt' in value
  }

  private normalizePlayerTier(tier: string | null | undefined): Player['current_tier'] {
    if (!tier) {
      return undefined
    }

    const normalized = tier as Player['current_tier']
    const allowedTiers: Player['current_tier'][] = [
      'Bronze',
      'Silver',
      'Gold',
      'Platinum',
      'Master',
      'Grandmaster',
    ]

    return allowedTiers.includes(normalized) ? normalized : undefined
  }

  private normalizeAIDifficulty(value: unknown): Player['aiDifficulty'] {
    if (value === null) {
      return null
    }

    if (typeof value !== 'string') {
      return undefined
    }

    const normalized = value.toLowerCase()
    const allowed: Array<NonNullable<Player['aiDifficulty']>> = [
      'recruit',
      'commander',
      'grandmaster',
    ]
    return allowed.includes(normalized as NonNullable<Player['aiDifficulty']>)
      ? (normalized as NonNullable<Player['aiDifficulty']>)
      : undefined
  }

  private sanitizeAiOpponents(
    maxPlayers: number,
    aiOpponents: CreateRoomData['aiOpponents'],
    isRanked?: boolean,
  ): Array<{ difficulty: AIDifficultyOption; personalitySeed?: number | null }> {
    if (!Array.isArray(aiOpponents) || aiOpponents.length === 0) {
      return []
    }

    if (isRanked) {
      return []
    }

    const maxAvailableSlots = Math.max(0, maxPlayers - 1)
    if (maxAvailableSlots === 0) {
      return []
    }

    const allowed: Set<AIDifficultyOption> = new Set(['recruit', 'commander', 'grandmaster'])
    const normalized: Array<{ difficulty: AIDifficultyOption; personalitySeed?: number | null }> =
      []

    for (const entry of aiOpponents) {
      if (!entry || typeof entry !== 'object') {
        continue
      }

      const rawDifficulty =
        typeof entry.difficulty === 'string' ? entry.difficulty.toLowerCase() : null

      if (!rawDifficulty || !allowed.has(rawDifficulty as AIDifficultyOption)) {
        continue
      }

      let personalitySeed: number | null | undefined
      if (typeof entry.personalitySeed === 'number' && Number.isFinite(entry.personalitySeed)) {
        personalitySeed = Math.trunc(entry.personalitySeed)
      }

      normalized.push({
        difficulty: rawDifficulty as AIDifficultyOption,
        personalitySeed: personalitySeed ?? undefined,
      })

      if (normalized.length >= maxAvailableSlots) {
        break
      }
    }

    return normalized
  }

  private mapPlayers(players: unknown): GameRoom['players'] {
    if (!Array.isArray(players)) {
      return undefined
    }

    const mapped = players
      .filter((player): player is PlayerRow => this.isPlayerRow(player))
      .map((player) => {
        const isAi = player.isAi === true
        const aiDifficulty = this.normalizeAIDifficulty(player.aiDifficulty)
        const usernameFallback = isAi
          ? `AI ${aiDifficulty ? aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1) : 'Opponent'}`
          : 'Unknown player'

        return {
          id: player.id,
          userId:
            typeof player.userId === 'string' && player.userId.length > 0
              ? player.userId
              : undefined,
          aiPlayerId:
            typeof player.aiPlayerId === 'string' && player.aiPlayerId.length > 0
              ? player.aiPlayerId
              : undefined,
          username: player.username ?? usernameFallback,
          skill_rating: this.parseNullableNumber(player.skill_rating) ?? undefined,
          current_tier: this.normalizePlayerTier(player.current_tier),
          preferred_color:
            typeof player.preferred_color === 'string' && player.preferred_color.length > 0
              ? player.preferred_color
              : undefined,
          selectedColor:
            typeof player.selectedColor === 'string' && player.selectedColor.length > 0
              ? player.selectedColor
              : typeof player.selected_color === 'string' &&
                  (player.selected_color as string).length > 0
                ? (player.selected_color as string)
                : undefined,
          joinedAt: this.toDate(player.joinedAt) ?? new Date(),
          isReady: typeof player.isReady === 'boolean' ? player.isReady : undefined,
          readyAt: this.toDate(player.readyAt) ?? null,
          teamId:
            typeof player.teamId === 'number'
              ? player.teamId
              : player.teamId === null
                ? null
                : undefined,
          isAi,
          aiDifficulty,
          aiPersonalitySeed:
            typeof player.aiPersonalitySeed === 'number' &&
            Number.isFinite(player.aiPersonalitySeed)
              ? Math.trunc(player.aiPersonalitySeed)
              : player.aiPersonalitySeed === null
                ? null
                : undefined,
          missedTurns:
            typeof player.missedTurns === 'number'
              ? Math.max(0, Math.trunc(player.missedTurns))
              : undefined,
          lastMissedTurnAt: this.toDate(player.lastMissedTurnAt) ?? null,
        }
      })

    return mapped.length > 0 ? mapped : undefined
  }

  private mapRoomRow(row: GameRoomRow): GameRoom {
    const players = this.mapPlayers(row.players)
    const normalizedStatus = this.normalizeStatus(
      typeof row.status === 'string' ? row.status : null,
    )
    const aggregatedCurrentPlayers = this.parseNullableNumber(
      (row as Partial<ActiveGameRoomRow>).current_players,
    )
    const normalizedPlayerCount =
      this.parseNullableNumber(
        row.playerCount ?? row.playercount ?? (row as Partial<ActiveGameRoomRow>).current_players,
      ) ?? (players ? players.length : undefined)

    return {
      id: row.id,
      roomCode:
        typeof row.room_code === 'number'
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
      is_ranked:
        typeof row.is_ranked === 'boolean'
          ? row.is_ranked
          : row.is_ranked === null || row.is_ranked === undefined
            ? undefined
            : Boolean(row.is_ranked),
      avg_skill_rating: this.parseNullableNumber(row.avg_skill_rating),
      skill_variance: this.parseNullableNumber(row.skill_variance),
      min_skill_rating: this.parseNullableNumber(row.min_skill_rating),
      max_skill_rating: this.parseNullableNumber(row.max_skill_rating),
      skill_tier: (row.skill_tier ?? undefined) as GameRoom['skill_tier'],
      createdAt: this.toDate(row.created_at) ?? new Date(),
      updatedAt: this.toDate(row.updated_at),
      mapId: (row.map_id ?? undefined) as string | undefined,
      gameMode: (row.game_mode ?? undefined) as string | undefined,
      movementType:
        typeof row.movement_type === 'string'
          ? ((row.movement_type as GameRoom['movementType']) ?? undefined)
          : undefined,
      allowTeamPlay:
        typeof row.team_mode === 'boolean'
          ? row.team_mode
          : this.mapTeamMode(row.team_mode) !== 'none',
      teamMode: this.mapTeamMode(row.team_mode),
      numberOfTeams:
        typeof row.number_of_teams === 'number'
          ? row.number_of_teams
          : row.number_of_teams === null
            ? null
            : undefined,
      turnTimerSeconds: this.parseNullableNumber(row.turn_timer) ?? undefined,
      fogOfWar: this.normalizeFogOfWar(row.fog_of_war),
      cardTradeMode: typeof row.card_trade_mode === 'string' ? row.card_trade_mode : undefined,
      bonusType: typeof row.bonus_type === 'string' ? row.bonus_type : undefined,
      treasureConfig: (row.treasure_config ?? undefined) as
        | import('../types/game.js').TreasureConfig
        | null
        | undefined,
      kingOfTheHillConfig: (row.king_of_the_hill_config ?? undefined) as
        | import('../types/game.js').KingOfTheHillConfig
        | null
        | undefined,
      currentPlayers: aggregatedCurrentPlayers ?? (players ? players.length : undefined),
      hostUsername: (row as Partial<ActiveGameRoomRow>).host_username ?? undefined,
      hostSkillRating: this.parseNullableNumber(
        (row as Partial<ActiveGameRoomRow>).host_skill_rating,
      ),
      hostTier: (row as Partial<ActiveGameRoomRow>).host_tier ?? undefined,
      mapName: (row as Partial<ActiveGameRoomRow>).map_name ?? undefined,
      gameStarted: typeof row.game_started === 'boolean' ? row.game_started : undefined,
      currentTurnUserId: row.current_turn_user_id ?? undefined,
      // lifecyclePhase is derived from status when helpful for lobby/initializing/completed views.
      lifecyclePhase: (() => {
        const s = normalizedStatus
        if (s === 'lobby' || s === 'initializing') return s
        if (s === 'completed') return 'finished'
        return undefined
      })() as GameRoom['lifecyclePhase'],
      turnNumber: this.parseNullableNumber(row.turn_number) ?? undefined,
      turnExpiresAt: this.toDate(row.turn_expires_at) ?? null,
      timeBankSeconds: this.parseNullableNumber((row as Record<string, unknown>).time_bank_seconds),
      timeBankSecondsRemaining: this.parseNullableNumber(
        (row as Record<string, unknown>).time_bank_seconds_remaining,
      ),
      usingTimeBank:
        typeof (row as Record<string, unknown>).using_time_bank === 'boolean'
          ? ((row as Record<string, unknown>).using_time_bank as boolean)
          : false,
      readyCheckStartedAt: this.toDate(row.ready_check_started_at) ?? null,
      // Winner (user id) captured at game end; DB column is winner_id
      winner:
        typeof (row as Record<string, unknown>).winner_id === 'string'
          ? ((row as Record<string, unknown>).winner_id as string)
          : (row as Record<string, unknown>).winner_id === null
            ? null
            : undefined,
      playerCount: normalizedPlayerCount,
      players,
      // Replacement pending user id for host decision
      ...(typeof (row as Record<string, unknown>).replacement_pending_user_id === 'string'
        ? {
            replacementPendingUserId: (row as Record<string, unknown>)
              .replacement_pending_user_id as string,
          }
        : {}),
    }
  }

  async createRoom(roomData: CreateRoomData): Promise<GameRoom> {
    // Enforce required map selection for game creation
    if (!roomData.mapId || typeof roomData.mapId !== 'string') {
      throw new Error('Please select a map to create a game')
    }

    const hostResult = await query<{ is_vip: boolean | null; premium_tier: string | null }>(
      'SELECT is_vip, premium_tier FROM users WHERE id = $1',
      [roomData.hostId],
    )

    const hostRow = hostResult.rows[0]
    if (!hostRow) {
      throw new Error('User not found')
    }

    const hostPremiumTier = hostRow.premium_tier ?? 'free'
    const hostHasPremium = hostPremiumTier !== 'free'
    const hostIsVip = hostRow.is_vip === true

    if (!hostHasPremium) {
      const activeCountResult = await query<{ count: number }>(
        `
        SELECT COUNT(*)::int AS count
        FROM room_players rp
        JOIN game_rooms gr ON gr.id = rp.room_id
        WHERE rp.user_id = $1
          AND COALESCE(gr.status, 'lobby') = ANY($2)
      `,
        [roomData.hostId, ACTIVE_ROOM_STATUS_VALUES],
      )

      const activeCount = Number(activeCountResult.rows[0]?.count ?? 0)
      if (activeCount >= PREMIUM_GAME_LIMIT) {
        throw new Error(PREMIUM_GAME_LIMIT_MESSAGE)
      }
    }

    // Check if map is VIP-only
    if (roomData.mapId) {
      const mapResult = await query<{ is_vip_only: boolean | null }>(
        'SELECT is_vip_only FROM maps WHERE id = $1',
        [roomData.mapId],
      )

      if (mapResult.rows.length > 0 && mapResult.rows[0].is_vip_only) {
        if (!hostIsVip) {
          throw new Error('This map is VIP-only. Upgrade to VIP to play on this map.')
        }
      }
    }

    const normalizedTeamMode = this.normalizeTeamMode(roomData.teamMode, roomData.allowTeamPlay)
    const normalizedNumberOfTeams = this.normalizeNumberOfTeams(
      normalizedTeamMode,
      roomData.numberOfTeams ?? null,
    )
    const allowTeamPlay = normalizedTeamMode !== 'none'

    // Validate ranked game requirements
    if (roomData.isRanked) {
      if (roomData.maxPlayers < 3) {
        throw new Error('Ranked games require at least 3 players')
      }
      if (roomData.isPrivate) {
        throw new Error('Ranked games cannot be private')
      }
      if (allowTeamPlay) {
        throw new Error('Ranked games cannot have team play enabled')
      }
    }

    // Validate team configuration
    this.validateTeamConfiguration(roomData.maxPlayers, normalizedTeamMode, normalizedNumberOfTeams)

    const sanitizedAiOpponents = this.sanitizeAiOpponents(
      roomData.maxPlayers,
      roomData.aiOpponents,
      roomData.isRanked,
    )

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
      `

      const insertResult = await client.query<GameRoomRow>(insertQuery, [
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
          : 86400, // default to 24 hours
        typeof roomData.timeBankSeconds === 'number' && Number.isFinite(roomData.timeBankSeconds)
          ? Math.max(0, Math.trunc(roomData.timeBankSeconds))
          : 0,
        allowTeamPlay,
        normalizedNumberOfTeams,
        roomData.isRanked || false,
        roomData.treasureConfig ? JSON.stringify(roomData.treasureConfig) : null,
        roomData.kingOfTheHillConfig ? JSON.stringify(roomData.kingOfTheHillConfig) : null,
      ])

      const createdRoom = insertResult.rows[0]
      if (!createdRoom) {
        throw new Error('Failed to create game room')
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
        `

        for (const opponent of sanitizedAiOpponents) {
          const aiIdentifier = randomUUID()
          const seed =
            typeof opponent.personalitySeed === 'number'
              ? opponent.personalitySeed
              : new DeterministicRng(`${createdRoom.id}:${aiIdentifier}:personality`).nextInt(
                  10_000_000,
                )

          await client.query(insertAiQuery, [
            createdRoom.id,
            aiIdentifier,
            opponent.difficulty,
            seed,
          ])
        }
      }

      // Create initial game_state with 'lobby' phase so frontend doesn't get 404
      const initialGameState = {
        phase: 'lobby' as const,
        turn: 1,
        currentPlayer: roomData.hostId,
        players: [],
        board: [],
      }

      await client.query(
        `INSERT INTO game_states (room_id, game_data, turn_number, current_player_id, game_phase, last_activity)
         VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
         ON CONFLICT (room_id) DO NOTHING`,
        [createdRoom.id, JSON.stringify(initialGameState), 1, roomData.hostId, 'lobby'],
      )

      return createdRoom
    })

    // Persist a textual log entry indicating that the game was created (distinct from game_started)
    try {
      await query(
        `INSERT INTO game_logs (game_id, ts, turn_number, phase, move_type, actor_id, payload)
         VALUES ($1, NOW(), $2, $3, $4, $5, $6)`,
        [roomRow.id, 1, 'lobby', 'game_created', roomData.hostId, JSON.stringify({})],
      )
      try {
        const { tryGetSocketServer } = await import('./socketRegistry.js')
        const io = tryGetSocketServer()
        if (io) {
          const { emitLogAppend } = await import('./logEmitter.js')
          const move: import('./logEmitter.js').DbMove = {
            id: `${Date.now()}-created`,
            game_id: roomRow.id,
            turn_number: 1,
            phase: 'lobby',
            move_type: 'game_created',
            actor_id: roomData.hostId,
            created_at: new Date(),
            payload: {},
          }
          await emitLogAppend(
            io as unknown as import('socket.io').Server<
              import('../types/shared.js').ClientToServerEvents,
              import('../types/shared.js').ServerToClientEvents,
              Record<string, unknown>,
              { userId?: string }
            >,
            roomRow.id,
            move,
          )
        }
      } catch {
        // best-effort emit
      }
    } catch {
      // best-effort persistence
    }

    const hydratedRoom = await this.getRoomById(roomRow.id)
    return hydratedRoom ?? this.mapRoomRow(roomRow)
  }

  /**
   * Prune lobbies that never started within their expiration window.
   * Returns the number of rooms deleted.
   */
  async pruneStaleRooms(): Promise<number> {
    const result = await query<{ id: string }>(
      `DELETE FROM game_rooms
       WHERE status IN ('lobby', 'initializing')
         AND expires_at IS NOT NULL
         AND expires_at < NOW()
       RETURNING id`,
    )

    return result.rowCount ?? 0
  }

  async getActiveRooms(): Promise<GameRoom[]> {
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
    `

    const result = await query<ActiveGameRoomRow>(getQuery)
    return result.rows.map((row) => {
      const mapped = this.mapRoomRow(row)
      return {
        ...mapped,
        currentPlayers: mapped.currentPlayers ?? 0,
      }
    })
  }

  async getRoomById(roomId: string): Promise<GameRoom | null> {
    await this.ensureAiReadyStates(roomId)
    const roomQuery = `
      SELECT gr.*, 
             m.name as map_name,
             hu.username as host_username,
             hu.skill_rating as host_skill_rating,
             (
               CASE
                 WHEN gr.using_time_bank IS TRUE AND gr.turn_expires_at IS NOT NULL THEN
                   GREATEST(0, EXTRACT(EPOCH FROM (gr.turn_expires_at - NOW()))::int)
                 ELSE (
                   SELECT rp2.time_bank_seconds_remaining
                   FROM room_players rp2
                   WHERE rp2.room_id = gr.id AND rp2.user_id = gr.current_turn_user_id
                   LIMIT 1
                 )
               END
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
              'selectedColor', rp.selected_color,
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
    `

    const result = await query<GameRoomWithPlayersRow>(roomQuery, [roomId])
    const row = result.rows[0]
    if (!row) {
      return null
    }
    return this.mapRoomRow(row)
  }

  async getRoomByCode(roomCode: number): Promise<GameRoom | null> {
    const result = await query<{ id: string }>('SELECT id FROM game_rooms WHERE room_code = $1', [
      roomCode,
    ])
    const row = result.rows[0]
    if (!row) return null
    return this.getRoomById(row.id)
  }

  async resolveRoomId(idOrCode: string): Promise<string> {
    // If numeric, treat as room_code; otherwise assume UUID string
    if (/^\d+$/.test(idOrCode)) {
      const code = Number.parseInt(idOrCode, 10)
      const res = await query<{ id: string }>('SELECT id FROM game_rooms WHERE room_code = $1', [
        code,
      ])
      const row = res.rows[0]
      if (!row) throw new Error('Room not found')
      return row.id
    }
    return idOrCode
  }

  async getRoomByIdOrCode(idOrCode: string): Promise<GameRoom | null> {
    if (/^\d+$/.test(idOrCode)) {
      const code = Number.parseInt(idOrCode, 10)
      return this.getRoomByCode(code)
    }
    return this.getRoomById(idOrCode)
  }

  private async triggerAutoStartIfReady(roomId: string): Promise<void> {
    const { GameLifecycleService } = await import('./gameLifecycleService.js')

    try {
      const lifecycleService = new GameLifecycleService()
      await lifecycleService.maybeAutoStart(roomId)
    } catch (error) {
      logger.warn('Failed to evaluate auto-start after lobby change', {
        roomId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  async ensureAiReadyStates(roomId: string): Promise<void> {
    const updateQuery = `
      UPDATE room_players
      SET is_ready = TRUE,
          ready_at = COALESCE(ready_at, NOW())
      WHERE room_id = $1
        AND is_ai IS TRUE
        AND (is_ready IS DISTINCT FROM TRUE OR ready_at IS NULL)
    `

    await query(updateQuery, [roomId])
  }

  async updateAiOpponents(
    roomId: string,
    hostId: string,
    aiOpponents: Array<{ difficulty: AIDifficultyOption; personalitySeed?: number | null }> = [],
  ): Promise<GameRoom> {
    const client = await getClient()

    try {
      await client.query('BEGIN')

      const roomResult = await client.query<{
        host_id: string
        status: string
        max_players: number
        is_ranked: boolean | null
      }>(
        'SELECT host_id, status, max_players, is_ranked FROM game_rooms WHERE id = $1 FOR UPDATE',
        [roomId],
      )

      const roomRow = roomResult.rows[0]
      if (!roomRow) {
        throw new Error('Room not found')
      }

      if (roomRow.host_id !== hostId) {
        throw new Error('Only the host can update AI opponents')
      }

      const lifecycleStatus = this.normalizeStatus(roomRow.status)
      if (lifecycleStatus !== 'lobby') {
        throw new Error('AI opponents can only be updated in the lobby')
      }

      if (roomRow.is_ranked) {
        throw new Error('Ranked games cannot use AI opponents')
      }

      const playersResult = await client.query<{
        id: string
        user_id: string | null
        ai_player_id: string | null
        is_ai: boolean | null
        ai_difficulty: string | null
        ai_personality_seed: number | null
      }>(
        'SELECT id, user_id, ai_player_id, is_ai, ai_difficulty, ai_personality_seed FROM room_players WHERE room_id = $1 ORDER BY joined_at ASC',
        [roomId],
      )

      const existingAiPlayers = playersResult.rows.filter((player) => player.is_ai)
      const humanPlayerCount = playersResult.rows.filter((player) => !player.is_ai).length
      const maxAiCapacity = Math.max(0, roomRow.max_players - humanPlayerCount)

      const sanitizedRequested = this.sanitizeAiOpponents(
        roomRow.max_players,
        aiOpponents,
        roomRow.is_ranked ?? false,
      )

      if (sanitizedRequested.length > maxAiCapacity) {
        throw new Error('Not enough open seats for the requested AI opponents')
      }

      const desiredCounts: Record<AIDifficultyOption, number> = {
        recruit: 0,
        commander: 0,
        grandmaster: 0,
      }
      const desiredSeeds: Record<AIDifficultyOption, Array<number | null | undefined>> = {
        recruit: [],
        commander: [],
        grandmaster: [],
      }

      sanitizedRequested.forEach((entry) => {
        if (!entry) {
          return
        }
        const difficulty = entry.difficulty
        if (!difficulty) {
          return
        }
        desiredCounts[difficulty] = (desiredCounts[difficulty] ?? 0) + 1
        desiredSeeds[difficulty]?.push(entry.personalitySeed)
      })

      const existingByDifficulty: Record<AIDifficultyOption, typeof existingAiPlayers> = {
        recruit: [],
        commander: [],
        grandmaster: [],
      }

      existingAiPlayers.forEach((player) => {
        const normalizedDifficulty = this.normalizeAIDifficulty(player.ai_difficulty)
        if (!normalizedDifficulty) {
          return
        }
        existingByDifficulty[normalizedDifficulty].push(player)
      })

      const removedIds: string[] = []

      for (const difficulty of Object.keys(desiredCounts) as AIDifficultyOption[]) {
        const targetCount = desiredCounts[difficulty]
        const existing = existingByDifficulty[difficulty]

        if (existing.length > targetCount) {
          const removeCount = existing.length - targetCount
          const toRemove = existing.splice(existing.length - removeCount, removeCount)
          toRemove.forEach((player) => {
            removedIds.push(player.id)
          })
        }

        if (targetCount > existing.length) {
          const addCount = targetCount - existing.length
          for (let index = 0; index < addCount; index += 1) {
            const aiIdentifier = randomUUID()
            const personalitySeedRaw = desiredSeeds[difficulty]?.shift()
            const personalitySeed =
              typeof personalitySeedRaw === 'number' && Number.isFinite(personalitySeedRaw)
                ? Math.trunc(personalitySeedRaw)
                : new DeterministicRng(`${roomId}:${aiIdentifier}:personality`).nextInt(10_000_000)

            await client.query(
              `
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
            `,
              [roomId, aiIdentifier, difficulty, personalitySeed],
            )
          }
        }
      }

      if (removedIds.length > 0) {
        await client.query('DELETE FROM room_players WHERE room_id = $1 AND id = ANY($2::uuid[])', [
          roomId,
          removedIds,
        ])
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    await this.ensureAiReadyStates(roomId)
    await this.triggerAutoStartIfReady(roomId)
    const updatedRoom = await this.getRoomById(roomId)
    if (!updatedRoom) {
      throw new Error('Failed to load room after updating AI opponents')
    }

    return updatedRoom
  }

  async isPlayerInRoom(roomId: string, userId: string): Promise<boolean> {
    const membershipQuery = `
      SELECT 1
      FROM room_players
      WHERE room_id = $1 AND user_id = $2
      LIMIT 1
    `

    const result = await query(membershipQuery, [roomId, userId])
    return (result.rowCount ?? 0) > 0
  }

  async getPlayer(roomId: string, userId: string): Promise<Player | null> {
    const playerQuery = `
      SELECT rp.id, rp.user_id, rp.ai_player_id, u.username, rp.joined_at, rp.is_ready, rp.ready_at, rp.team_id,
             rp.is_ai, rp.ai_difficulty, rp.ai_personality_seed, rp.selected_color
      FROM room_players rp
      LEFT JOIN users u ON rp.user_id = u.id
      WHERE rp.room_id = $1 AND rp.user_id = $2
      LIMIT 1
    `

    const result = await query<{
      id: string
      user_id: string
      ai_player_id: string | null
      username: string | null
      joined_at: Date | string | null
      is_ready: boolean | null
      ready_at: Date | string | null
      team_id: number | null
      is_ai: boolean | null
      ai_difficulty: string | null
      ai_personality_seed: number | null
      selected_color?: string | null
    }>(playerQuery, [roomId, userId])

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return {
      id: row.id,
      userId: row.user_id,
      aiPlayerId: typeof row.ai_player_id === 'string' ? row.ai_player_id : undefined,
      username: row.username ?? 'Unknown player',
      joinedAt: this.toDate(row.joined_at) ?? new Date(),
      isReady: typeof row.is_ready === 'boolean' ? row.is_ready : undefined,
      readyAt: this.toDate(row.ready_at) ?? null,
      teamId:
        typeof row.team_id === 'number' ? row.team_id : row.team_id === null ? null : undefined,
      isAi: row.is_ai === true,
      aiDifficulty: this.normalizeAIDifficulty(row.ai_difficulty),
      aiPersonalitySeed:
        typeof row.ai_personality_seed === 'number' && Number.isFinite(row.ai_personality_seed)
          ? Math.trunc(row.ai_personality_seed)
          : row.ai_personality_seed === null
            ? null
            : undefined,
      selected_color:
        typeof row.selected_color === 'string' && row.selected_color.length > 0
          ? row.selected_color
          : undefined,
      selectedColor:
        typeof row.selected_color === 'string' && row.selected_color.length > 0
          ? row.selected_color
          : undefined,
    }
  }

  async joinRoom(
    roomId: string,
    userId: string,
    options?: { selectedColor?: string | null },
  ): Promise<{ success: boolean; message: string }> {
    const client = await getClient()
    let joinSucceeded = false

    try {
      await client.query('BEGIN')

      const roomQuery = `SELECT * FROM game_rooms WHERE id = $1`
      const roomResult = await client.query(roomQuery, [roomId])

      if (roomResult.rows.length === 0) {
        throw new Error('Room not found')
      }

      const room = roomResult.rows[0]

      const lifecycleStatus = this.normalizeStatus(room.status)

      if (lifecycleStatus !== 'lobby') {
        throw new Error('Room is not accepting new players')
      }

      const userResult = await client.query<{
        premium_tier: string | null
        is_vip: boolean | null
        skill_rating: number | null
      }>('SELECT premium_tier, is_vip, skill_rating FROM users WHERE id = $1', [userId])

      const userRow = userResult.rows[0]
      if (!userRow) {
        throw new Error('User not found')
      }

      const premiumTier = userRow.premium_tier ?? 'free'
      const userHasPremium = premiumTier !== 'free'
      const userIsVip = userRow.is_vip === true
      const userRating = typeof userRow.skill_rating === 'number' ? userRow.skill_rating : 800

      // Check if the map is VIP-only
      if (room.map_id) {
        const mapQuery = 'SELECT is_vip_only FROM maps WHERE id = $1'
        const mapResult = await client.query(mapQuery, [room.map_id])

        if (mapResult.rows.length > 0 && mapResult.rows[0].is_vip_only && !userIsVip) {
          throw new Error('This map is VIP-only. Upgrade to VIP to join this game.')
        }
      }

      const membershipResult = await client.query(
        'SELECT 1 FROM room_players WHERE room_id = $1 AND user_id = $2 LIMIT 1',
        [roomId, userId],
      )
      const alreadyInRoom = (membershipResult.rowCount ?? 0) > 0

      if (!userHasPremium && !alreadyInRoom) {
        const activeCountResult = await client.query<{ count: number }>(
          `
          SELECT COUNT(*)::int AS count
          FROM room_players rp
          JOIN game_rooms gr ON gr.id = rp.room_id
          WHERE rp.user_id = $1
            AND COALESCE(gr.status, 'lobby') = ANY($2)
        `,
          [userId, ACTIVE_ROOM_STATUS_VALUES],
        )

        const activeCount = Number(activeCountResult.rows[0]?.count ?? 0)
        if (activeCount >= PREMIUM_GAME_LIMIT) {
          throw new Error(PREMIUM_GAME_LIMIT_MESSAGE)
        }
      }

      const playerCountQuery = `SELECT COUNT(*) as count FROM room_players WHERE room_id = $1`
      const countResult = await client.query(playerCountQuery, [roomId])
      const currentPlayers = parseInt(countResult.rows[0].count, 10)

      if (currentPlayers >= room.max_players) {
        throw new Error('Room is full')
      }

      // Check skill rating gap for ranked games
      if (room.is_ranked) {
        // Get current players' average rating
        const playersQuery = `
          SELECT AVG(u.skill_rating) as avg_rating,
                 MIN(u.skill_rating) as min_rating,
                 MAX(u.skill_rating) as max_rating
          FROM room_players rp
          JOIN users u ON rp.user_id = u.id
          WHERE rp.room_id = $1
        `
        const playersResult = await client.query(playersQuery, [roomId])

        if (playersResult.rows[0].avg_rating) {
          const avgRating = parseFloat(playersResult.rows[0].avg_rating)

          // Check if the skill gap is too large (500 points)
          if (Math.abs(userRating - avgRating) > 500) {
            throw new Error(
              `Skill rating difference too large. Your rating: ${userRating}, Room average: ${Math.round(avgRating)}`,
            )
          }

          // Note: Room skill ratings can be tracked separately if needed
          // For now, we just validate the skill gap without storing in game_rooms
        }
      }

      // Enforce unique selected_color
      // Gather used colors
      const usedColorsRes = await client.query<{ selected_color: string | null }>(
        `SELECT selected_color FROM room_players WHERE room_id = $1 AND selected_color IS NOT NULL`,
        [roomId],
      )
      const used = new Set(
        usedColorsRes.rows
          .map((r) => r.selected_color)
          .filter((c): c is string => typeof c === 'string')
          .map((c) => c.toUpperCase()),
      )

      const normalize = (c?: string | null) =>
        typeof c === 'string' && c.trim().length > 0 ? c.trim().toUpperCase() : null

      // Determine final selected color
      let finalColor: string | null = null
      const requested = options?.selectedColor ?? null
      const requestedNorm = requested ? normalize(requested) : null
      if (requested && requestedNorm) {
        if (!userHasPremium && isPremiumColorChoice(requested)) {
          throw new Error(PREMIUM_COLOR_MESSAGE)
        }
        if (used.has(requestedNorm)) {
          throw new Error('Color already taken')
        }
        finalColor = requested
      } else {
        // Try user's preferred color
        const prefRes = await client.query<{ preferred_color: string | null }>(
          `SELECT preferred_color FROM user_preferences WHERE user_id = $1`,
          [userId],
        )
        const preferred = prefRes.rows[0]?.preferred_color ?? null
        const preferredNorm = preferred ? normalize(preferred) : null
        const preferredIsPremium = preferred ? isPremiumColorChoice(preferred) : false
        if (
          preferred &&
          (!preferredIsPremium || userHasPremium) &&
          (!preferredNorm || !used.has(preferredNorm))
        ) {
          finalColor = preferred
        } else {
          // Fallback palette of 12 distinct colors
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
          ]
          finalColor = palette.find((c) => !used.has(c.toUpperCase())) ?? null
        }
      }

      const joinQuery = `
        INSERT INTO room_players (room_id, user_id, is_ready, ready_at, selected_color)
        VALUES ($1, $2, TRUE, NOW(), $3)
        ON CONFLICT (room_id, user_id) DO UPDATE
          SET is_ready = TRUE,
              ready_at = NOW(),
              selected_color = COALESCE(EXCLUDED.selected_color, room_players.selected_color)
      `
      await client.query(joinQuery, [roomId, userId, finalColor])

      await client.query('COMMIT')
      joinSucceeded = true
      return { success: true, message: 'Joined room successfully' }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      if (client.release) {
        client.release()
      }

      if (joinSucceeded) {
        await this.triggerAutoStartIfReady(roomId)
      }
    }
  }

  async assignPlayerToTeam(
    roomId: string,
    actingUserId: string,
    targetPlayerIdentifier: string,
    teamId: number | null | undefined,
  ): Promise<GameRoom> {
    const client = await getClient()

    try {
      await client.query('BEGIN')

      const roomResult = await client.query<{
        host_id: string
        team_mode: boolean | string | null
        number_of_teams: number | null
      }>('SELECT host_id, team_mode, number_of_teams FROM game_rooms WHERE id = $1 FOR UPDATE', [
        roomId,
      ])

      const roomRow = roomResult.rows[0]
      if (!roomRow) {
        throw new Error('Room not found')
      }

      if (roomRow.host_id !== actingUserId) {
        throw new Error('Only the host can update team assignments')
      }

      const teamMode = this.mapTeamMode(roomRow.team_mode)
      const totalTeams = this.normalizeNumberOfTeams(teamMode, roomRow.number_of_teams)

      if (teamMode === 'none' || !totalTeams) {
        throw new Error('Team play is not enabled for this room')
      }

      const playerLookupById = await client.query<{
        id: string
        user_id: string | null
      }>('SELECT id, user_id FROM room_players WHERE room_id = $1 AND id = $2', [
        roomId,
        targetPlayerIdentifier,
      ])

      let targetPlayerRow = playerLookupById.rows[0]

      if (!targetPlayerRow) {
        const playerLookupByUser = await client.query<{
          id: string
          user_id: string | null
        }>('SELECT id, user_id FROM room_players WHERE room_id = $1 AND user_id = $2', [
          roomId,
          targetPlayerIdentifier,
        ])
        targetPlayerRow = playerLookupByUser.rows[0]
      }

      if (!targetPlayerRow) {
        throw new Error('Player is not part of this room')
      }

      let normalizedTeamId: number | null
      if (teamId === null || teamId === undefined) {
        normalizedTeamId = null
      } else {
        const numericTeamId = Number(teamId)
        if (Number.isNaN(numericTeamId)) {
          throw new Error('Team identifier must be numeric')
        }
        const truncated = Math.trunc(numericTeamId)
        normalizedTeamId = truncated >= 1 ? truncated : null
      }

      if (normalizedTeamId !== null) {
        if (normalizedTeamId < 1 || normalizedTeamId > totalTeams) {
          throw new Error(`Team must be between 1 and ${totalTeams}`)
        }
      }

      await client.query('UPDATE room_players SET team_id = $3 WHERE room_id = $1 AND id = $2', [
        roomId,
        targetPlayerRow.id,
        normalizedTeamId,
      ])

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      if (client.release) {
        client.release()
      }
    }

    const updatedRoom = await this.getRoomById(roomId)
    if (!updatedRoom) {
      throw new Error('Failed to load room after updating team assignment')
    }

    return updatedRoom
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    // Remove the player from the room
    await query(`DELETE FROM room_players WHERE room_id = $1 AND user_id = $2`, [roomId, userId])

    // If the game hasn't started and the host leaves, auto-close the room to avoid orphan lobbies
    const result = await query<{
      host_id: string
      status: string
    }>('SELECT host_id, status FROM game_rooms WHERE id = $1', [roomId])
    const row = result.rows[0]
    if (!row) return

    const status = this.normalizeStatus(row.status)
    const hostLeft = row.host_id === userId

    if (hostLeft && (status === 'lobby' || status === 'initializing')) {
      await this.performCloseRoom(roomId)
      return
    }

    // Otherwise, just normalize lobby state if pre-start
    if (status === 'lobby' || status === 'initializing') {
      await query(
        `
        UPDATE game_rooms
        SET status = 'lobby',
            ready_check_started_at = NULL,
            turn_number = 0,
            turn_expires_at = NULL,
            current_turn_user_id = NULL
        WHERE id = $1 AND status IN ('lobby', 'initializing')
      `,
        [roomId],
      )
    }
  }

  /**
   * Host-requested close for a lobby (pre-start). Marks room as abandoned, clears players and transient state.
   */
  async closeRoom(roomId: string, actorUserId: string): Promise<void> {
    const res = await query<{ host_id: string; status: string }>(
      `SELECT host_id, status FROM game_rooms WHERE id = $1`,
      [roomId],
    )
    const row = res.rows[0]
    if (!row) {
      throw new Error('Room not found')
    }

    const status = this.normalizeStatus(row.status)
    if (row.host_id !== actorUserId) {
      throw new Error('Only the host can close the room')
    }
    if (status !== 'lobby' && status !== 'initializing') {
      throw new Error('Game already started')
    }

    await this.performCloseRoom(roomId)
  }

  private async performCloseRoom(roomId: string): Promise<void> {
    // Ensure atomic update + cleanup
    const client = await getClient()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE game_rooms
         SET status = 'abandoned',
             ended_at = NOW(),
             ready_check_started_at = NULL,
             turn_number = 0,
             current_turn_user_id = NULL,
             turn_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [roomId],
      )
      await client.query(`DELETE FROM room_players WHERE room_id = $1`, [roomId])
      await client.query(`DELETE FROM game_states WHERE room_id = $1`, [roomId])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
      try {
        const { gameStateCache } = await import('./cacheService.js')
        await gameStateCache.deleteGameState(roomId)
      } catch {
        // best-effort cache cleanup
      }
    }
  }

  async getUserGames(userId: string): Promise<GameRoom[]> {
    // Query for all games the user is involved in, include host username and player count
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
    `

    const result = await query<GameRoomRow>(gamesQuery, [userId])
    return result.rows.map((row) => this.mapRoomRow(row))
  }
}
