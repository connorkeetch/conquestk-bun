import { v4 as uuidv4 } from 'uuid'
import { getClient, query } from '../config/database'
import type { GameRoom } from '../types/gameRoom'

export interface CreateRoomData {
  name: string
  hostId: string
  maxPlayers: number
  isPrivate: boolean
  mapId?: string
  gameType?: string
  movementType?: string
  allowTeamPlay?: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance'
  numberOfTeams?: number
  capitalsEnabled?: boolean
  isRanked?: boolean
  gameSettings?: unknown
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

  async createRoom(roomData: CreateRoomData): Promise<GameRoom> {
    // Check if map is VIP-only
    if (roomData.mapId) {
      const mapResult = await query('SELECT is_vip_only FROM maps WHERE id = $1', [roomData.mapId])

      if (mapResult.rows.length > 0 && mapResult.rows[0].is_vip_only) {
        // Check if user is VIP
        const userResult = await query('SELECT is_vip FROM users WHERE id = $1', [roomData.hostId])

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
      if (roomData.allowTeamPlay) {
        throw new Error('Ranked games cannot have team play enabled')
      }
    }

    // Include capitalsEnabled and team settings in game settings
    const gameSettings = {
      ...(roomData.gameSettings || {}),
      capitalsEnabled: roomData.capitalsEnabled || false,
    }

    // Determine team mode
    const teamMode = roomData.teamMode || (roomData.allowTeamPlay ? 'teams' : 'none')
    const numberOfTeams = roomData.numberOfTeams || (roomData.allowTeamPlay ? 2 : null)

    // Validate team configuration
    this.validateTeamConfiguration(roomData.maxPlayers, teamMode, numberOfTeams)

    const insertQuery = `
      INSERT INTO game_rooms (name, host_id, max_players, is_private, map_id, game_type, movement_type, allow_team_play, team_mode, number_of_teams, is_ranked, game_settings, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'waiting')
      RETURNING *
    `

    const result = await query(insertQuery, [
      roomData.name,
      roomData.hostId,
      roomData.maxPlayers,
      roomData.isPrivate,
      roomData.mapId || null,
      roomData.gameType || 'quick',
      roomData.movementType || 'classic_adjacent',
      roomData.allowTeamPlay || false,
      teamMode,
      numberOfTeams,
      roomData.isRanked || false,
      JSON.stringify(gameSettings),
    ])

    return result.rows[0]
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

    const result = await query(getQuery)
    return result.rows.map((row: unknown) => ({
      ...row,
      currentPlayers: parseInt(row.current_players, 10) || 0,
      hostUsername: row.host_username,
      hostSkillRating: row.host_skill_rating,
      hostTier: row.host_tier,
      mapName: row.map_name,
    }))
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

    const result = await query(roomQuery, [roomId])
    return result.rows[0] || null
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
          const minRating = parseFloat(playersResult.rows[0].min_rating)
          const maxRating = parseFloat(playersResult.rows[0].max_rating)

          // Check if the skill gap is too large (500 points)
          if (Math.abs(userRating - avgRating) > 500) {
            throw new Error(
              `Skill rating difference too large. Your rating: ${userRating}, Room average: ${Math.round(avgRating)}`,
            )
          }

          // Update room's average rating
          const newAvgRating = Math.round(
            (avgRating * currentPlayers + userRating) / (currentPlayers + 1),
          )
          const newMinRating = Math.min(minRating, userRating)
          const newMaxRating = Math.max(maxRating, userRating)

          const updateRoomQuery = `
            UPDATE game_rooms
            SET avg_skill_rating = $1,
                min_skill_rating = $2,
                max_skill_rating = $3
            WHERE id = $4
          `
          await client.query(updateRoomQuery, [newAvgRating, newMinRating, newMaxRating, roomId])
        } else {
          // First player joining, set initial ratings
          const updateRoomQuery = `
            UPDATE game_rooms
            SET avg_skill_rating = $1,
                min_skill_rating = $2,
                max_skill_rating = $3
            WHERE id = $4
          `
          await client.query(updateRoomQuery, [userRating, userRating, userRating, roomId])
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

  async getUserGames(userId: string): Promise<any[]> {
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

    const result = await query(gamesQuery, [userId])
    return result.rows
  }
}
