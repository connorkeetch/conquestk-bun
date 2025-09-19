import { getClient, query } from '../config/database'
import type { GameRoom, Player } from '../types/gameRoom'

export interface CreateRoomData {
  name: string
  hostId: string
  maxPlayers: number
  isPrivate: boolean
  mapId?: string
  gameMode?: string
  teamMode?: boolean
  numberOfTeams?: number
  isRanked?: boolean
}

interface GameRoomRow {
  id: string
  name: string
  host_id: string
  max_players: number
  is_private: boolean
  status: string
  created_at: Date | string
  updated_at?: Date | string | null
  is_ranked?: boolean | null
  avg_skill_rating?: number | string | null
  skill_variance?: number | string | null
  min_skill_rating?: number | null
  max_skill_rating?: number | null
  skill_tier?: string | null
  map_id?: string | null
  game_mode?: string | null
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
  userId: string
  username: string
  skill_rating?: number | null
  current_tier?: string | null
  joinedAt: Date | string | null
}

interface GameRoomWithPlayersRow extends GameRoomRow {
  players: (PlayerRow | null)[] | null
}

export class GameRoomService {
  private validateTeamConfiguration(
    maxPlayers: number,
    teamMode: string,
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

  private normalizeStatus(status: string | null | undefined): GameRoom['status'] {
    if (!status) {
      return 'waiting'
    }

    if (status === 'active') {
      return 'in_progress'
    }

    if (status === 'in_progress' || status === 'finished' || status === 'waiting') {
      return status
    }

    return 'waiting'
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
    return (
      typeof value === 'object' &&
      value !== null &&
      'userId' in value &&
      'username' in value &&
      'joinedAt' in value
    )
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

  private mapPlayers(players: unknown): GameRoom['players'] {
    if (!Array.isArray(players)) {
      return undefined
    }

    const mapped = players
      .filter((player): player is PlayerRow => this.isPlayerRow(player))
      .map((player) => ({
        userId: player.userId,
        username: player.username,
        skill_rating: this.parseNullableNumber(player.skill_rating) ?? undefined,
        current_tier: this.normalizePlayerTier(player.current_tier),
        joinedAt: this.toDate(player.joinedAt) ?? new Date(),
      }))

    return mapped.length > 0 ? mapped : undefined
  }

  private mapRoomRow(row: GameRoomRow): GameRoom {
    return {
      id: row.id,
      name: row.name,
      hostId: row.host_id,
      maxPlayers: row.max_players,
      isPrivate: row.is_private,
      status: this.normalizeStatus(typeof row.status === 'string' ? row.status : null),
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
      teamMode: row.team_mode ?? undefined,
      numberOfTeams: row.number_of_teams ?? undefined,
      currentPlayers: this.parseNullableNumber((row as Partial<ActiveGameRoomRow>).current_players),
      hostUsername: (row as Partial<ActiveGameRoomRow>).host_username ?? undefined,
      hostSkillRating: this.parseNullableNumber(
        (row as Partial<ActiveGameRoomRow>).host_skill_rating,
      ),
      hostTier: (row as Partial<ActiveGameRoomRow>).host_tier ?? undefined,
      mapName: (row as Partial<ActiveGameRoomRow>).map_name ?? undefined,
      gameStarted: typeof row.game_started === 'boolean' ? row.game_started : undefined,
      currentTurnUserId: row.current_turn_user_id ?? undefined,
      winner: row.winner ?? undefined,
      playerCount:
        this.parseNullableNumber(
          row.playerCount ?? row.playercount ?? (row as Partial<ActiveGameRoomRow>).current_players,
        ) ?? undefined,
      players: this.mapPlayers(row.players),
    }
  }

  async createRoom(roomData: CreateRoomData): Promise<GameRoom> {
    // Check if map is VIP-only
    if (roomData.mapId) {
      const mapResult = await query<{ is_vip_only: boolean | null }>(
        'SELECT is_vip_only FROM maps WHERE id = $1',
        [roomData.mapId],
      )

      if (mapResult.rows.length > 0 && mapResult.rows[0].is_vip_only) {
        // Check if user is VIP
        const userResult = await query<{ is_vip: boolean | null }>(
          'SELECT is_vip FROM users WHERE id = $1',
          [roomData.hostId],
        )

        if (!userResult.rows[0]?.is_vip) {
          throw new Error('This map is VIP-only. Upgrade to VIP to play on this map.')
        }
      }
    }

    // Validate ranked game requirements
    if (roomData.isRanked) {
      if (roomData.maxPlayers < 3) {
        throw new Error('Ranked games require at least 3 players')
      }
      if (roomData.isPrivate) {
        throw new Error('Ranked games cannot be private')
      }
      if (roomData.teamMode) {
        throw new Error('Ranked games cannot have team play enabled')
      }
    }

    // Determine team mode - convert string team mode to boolean
    const teamMode = roomData.teamMode || false
    const numberOfTeams = teamMode ? roomData.numberOfTeams || 2 : null

    // Validate team configuration
    this.validateTeamConfiguration(roomData.maxPlayers, teamMode ? 'teams' : 'none', numberOfTeams)

    const insertQuery = `
      INSERT INTO game_rooms (name, host_id, max_players, is_private, map_id, game_mode, team_mode, number_of_teams, is_ranked, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'waiting')
      RETURNING *
    `

    const result = await query<GameRoomRow>(insertQuery, [
      roomData.name,
      roomData.hostId,
      roomData.maxPlayers,
      roomData.isPrivate,
      roomData.mapId || null,
      roomData.gameMode || 'classic',
      teamMode,
      numberOfTeams,
      roomData.isRanked || false,
    ])

    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create game room')
    }

    return this.mapRoomRow(row)
  }

  async getActiveRooms(): Promise<GameRoom[]> {
    const getQuery = `
      SELECT gr.*, 
             COUNT(rp.user_id) as current_players,
             u.username as host_username,
             u.skill_rating as host_skill_rating,
             -- u.current_tier as host_tier, -- Column doesn't exist yet
             NULL as host_tier,
             m.name as map_name
      FROM game_rooms gr
      LEFT JOIN room_players rp ON gr.id = rp.room_id
      LEFT JOIN users u ON gr.host_id = u.id
      LEFT JOIN maps m ON gr.map_id = m.id
      WHERE gr.status IN ('waiting', 'active')
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
    const roomQuery = `
      SELECT gr.*, 
             json_agg(
               json_build_object(
                 'userId', u.id,
                 'username', u.username,
                 'skill_rating', u.skill_rating,
                 -- 'current_tier', u.current_tier, -- Column doesn't exist yet
                 'current_tier', NULL,
                 'joinedAt', rp.joined_at
               )
             ) as players
      FROM game_rooms gr
      LEFT JOIN room_players rp ON gr.id = rp.room_id
      LEFT JOIN users u ON rp.user_id = u.id
      WHERE gr.id = $1
      GROUP BY gr.id
    `

    const result = await query<GameRoomWithPlayersRow>(roomQuery, [roomId])
    const row = result.rows[0]
    if (!row) {
      return null
    }
    return this.mapRoomRow(row)
  }

  async joinRoom(roomId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const client = await getClient()

    try {
      await client.query('BEGIN')

      const roomQuery = `SELECT * FROM game_rooms WHERE id = $1`
      const roomResult = await client.query(roomQuery, [roomId])

      if (roomResult.rows.length === 0) {
        throw new Error('Room not found')
      }

      const room = roomResult.rows[0]

      if (room.status !== 'waiting') {
        throw new Error('Room is not accepting new players')
      }

      // Check if the map is VIP-only
      if (room.map_id) {
        const mapQuery = 'SELECT is_vip_only FROM maps WHERE id = $1'
        const mapResult = await client.query(mapQuery, [room.map_id])

        if (mapResult.rows.length > 0 && mapResult.rows[0].is_vip_only) {
          // Check if user is VIP
          const userVipQuery = 'SELECT is_vip FROM users WHERE id = $1'
          const userVipResult = await client.query(userVipQuery, [userId])

          if (!userVipResult.rows[0]?.is_vip) {
            throw new Error('This map is VIP-only. Upgrade to VIP to join this game.')
          }
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
        // Get the user's skill rating
        const userQuery = `SELECT skill_rating FROM users WHERE id = $1`
        const userResult = await client.query(userQuery, [userId])

        if (userResult.rows.length === 0) {
          throw new Error('User not found')
        }

        const userRating = userResult.rows[0].skill_rating || 1000

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
          const _minRating = parseFloat(playersResult.rows[0].min_rating)
          const _maxRating = parseFloat(playersResult.rows[0].max_rating)

          // Check if the skill gap is too large (500 points)
          if (Math.abs(userRating - avgRating) > 500) {
            throw new Error(
              `Skill rating difference too large. Your rating: ${userRating}, Room average: ${Math.round(avgRating)}`,
            )
          }

          // Note: Room skill ratings can be tracked separately if needed
          // For now, we just validate the skill gap without storing in game_rooms
        } else {
          // First player joining, no skill gap to check
        }
      }

      const joinQuery = `
        INSERT INTO room_players (room_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (room_id, user_id) DO NOTHING
      `
      await client.query(joinQuery, [roomId, userId])

      await client.query('COMMIT')
      return { success: true, message: 'Joined room successfully' }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      if (client.release) {
        client.release()
      }
    }
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const deleteQuery = `DELETE FROM room_players WHERE room_id = $1 AND user_id = $2`
    await query(deleteQuery, [roomId, userId])
  }

  async getUserGames(userId: string): Promise<GameRoom[]> {
    // Query for all games the user is involved in
    const gamesQuery = `
      SELECT DISTINCT gr.*, 
        (SELECT COUNT(*) FROM room_players WHERE room_id = gr.id) as playerCount,
        CASE 
          WHEN gr.status = 'in_progress' THEN 'active'
          WHEN gr.status = 'finished' THEN 'finished'
          ELSE 'waiting'
        END as status
      FROM game_rooms gr
      INNER JOIN room_players rp ON gr.id = rp.room_id
      WHERE rp.user_id = $1
      ORDER BY gr.created_at DESC
      LIMIT 50
    `

    const result = await query<GameRoomRow>(gamesQuery, [userId])
    return result.rows.map((row) => this.mapRoomRow(row))
  }
}
