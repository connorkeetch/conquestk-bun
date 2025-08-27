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
  capitalsEnabled?: boolean
  isRanked?: boolean
  gameSettings?: any
}

export class GameRoomService {
  async createRoom(roomData: CreateRoomData): Promise<GameRoom> {
    const id = uuidv4()
    const isPostgres = process.env.DB_TYPE !== 'sqlite'

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

    // Include capitalsEnabled in game settings
    const gameSettings = {
      ...(roomData.gameSettings || {}),
      capitalsEnabled: roomData.capitalsEnabled || false,
    }

    if (isPostgres) {
      const pgQuery = `
        INSERT INTO game_rooms (name, host_id, max_players, is_private, map_id, game_type, movement_type, allow_team_play, is_ranked, game_settings, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'waiting')
        RETURNING *
      `

      const result = await query(pgQuery, [
        roomData.name,
        roomData.hostId,
        roomData.maxPlayers,
        roomData.isPrivate,
        roomData.mapId || null,
        roomData.gameType || 'quick',
        roomData.movementType || 'classic_adjacent',
        roomData.allowTeamPlay || false,
        roomData.isRanked || false,
        JSON.stringify(gameSettings),
      ])

      return result.rows[0]
    }
    const sqliteQuery = `
        INSERT INTO game_rooms (id, name, host_id, max_players, is_private, map_id, game_type, movement_type, allow_team_play, is_ranked, game_settings, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting')
      `

    await query(sqliteQuery, [
      id,
      roomData.name,
      roomData.hostId,
      roomData.maxPlayers,
      roomData.isPrivate,
      roomData.mapId || null,
      roomData.gameType || 'quick',
      roomData.movementType || 'classic_adjacent',
      roomData.allowTeamPlay || false,
      roomData.isRanked || false,
      JSON.stringify(gameSettings),
    ])

    const result = await query('SELECT * FROM game_rooms WHERE id = ?', [id])
    return result.rows[0]
  }

  async getActiveRooms(): Promise<GameRoom[]> {
    const getQuery = `
      SELECT gr.*, 
             COUNT(rp.user_id) as current_players,
             u.username as host_username,
             u.skill_rating as host_skill_rating,
             u.current_tier as host_tier,
             m.name as map_name
      FROM game_rooms gr
      LEFT JOIN room_players rp ON gr.id = rp.room_id
      LEFT JOIN users u ON gr.host_id = u.id
      LEFT JOIN maps m ON gr.map_id = m.id
      WHERE gr.status IN ('waiting', 'active')
      GROUP BY gr.id, u.username, u.skill_rating, u.current_tier, m.name
      ORDER BY gr.created_at DESC
    `

    const result = await query(getQuery)
    return result.rows.map((row: any) => ({
      ...row,
      currentPlayers: parseInt(row.current_players, 10) || 0,
      hostUsername: row.host_username,
      hostSkillRating: row.host_skill_rating,
      hostTier: row.host_tier,
      mapName: row.map_name,
    }))
  }

  async getRoomById(roomId: string): Promise<GameRoom | null> {
    const isPostgres = process.env.DB_TYPE !== 'sqlite'
    const _paramPlaceholder = isPostgres ? '$1' : '?'

    if (isPostgres) {
      const pgQuery = `
        SELECT gr.*, 
               json_agg(
                 json_build_object(
                   'userId', u.id,
                   'username', u.username,
                   'skill_rating', u.skill_rating,
                   'current_tier', u.current_tier,
                   'joinedAt', rp.joined_at
                 )
               ) as players
        FROM game_rooms gr
        LEFT JOIN room_players rp ON gr.id = rp.room_id
        LEFT JOIN users u ON rp.user_id = u.id
        WHERE gr.id = ?
        GROUP BY gr.id
      `

      const result = await query(pgQuery, [roomId])
      return result.rows[0] || null
    }
    const sqliteQuery = `
        SELECT gr.*,
               '[' || GROUP_CONCAT(
                 CASE WHEN u.id IS NOT NULL THEN
                   '{"userId":"' || u.id || '","username":"' || u.username || 
                   '","skill_rating":' || COALESCE(u.skill_rating, 1000) || 
                   ',"current_tier":"' || COALESCE(u.current_tier, 'Gold') || 
                   '","joinedAt":"' || rp.joined_at || '"}'
                 END
               ) || ']' as players
        FROM game_rooms gr
        LEFT JOIN room_players rp ON gr.id = rp.room_id
        LEFT JOIN users u ON rp.user_id = u.id
        WHERE gr.id = ?
        GROUP BY gr.id
      `

    const result = await query(sqliteQuery, [roomId])
    if (result.rows[0]) {
      const room = result.rows[0]
      if (room.players && room.players !== '[]') {
        try {
          room.players = JSON.parse(room.players)
        } catch {
          room.players = []
        }
      } else {
        room.players = []
      }
    }
    return result.rows[0] || null
  }

  async joinRoom(roomId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const client = await getClient()
    const isPostgres = process.env.DB_TYPE !== 'sqlite'
    const _param1 = isPostgres ? '$1' : '?'
    const _param2 = isPostgres ? '$2' : '?'

    try {
      if (isPostgres) {
        await client.query('BEGIN')
      } else {
        await client.query('BEGIN TRANSACTION')
      }

      const roomQuery = `SELECT * FROM game_rooms WHERE id = ?`
      const roomResult = await client.query(roomQuery, [roomId])

      if (roomResult.rows.length === 0) {
        throw new Error('Room not found')
      }

      const room = roomResult.rows[0]

      if (room.status !== 'waiting') {
        throw new Error('Room is not accepting new players')
      }

      const playerCountQuery = `SELECT COUNT(*) as count FROM room_players WHERE room_id = ?`
      const countResult = await client.query(playerCountQuery, [roomId])
      const currentPlayers = parseInt(countResult.rows[0].count, 10)

      if (currentPlayers >= room.max_players) {
        throw new Error('Room is full')
      }

      // Check skill rating gap for ranked games
      if (room.is_ranked) {
        // Get the user's skill rating
        const userQuery = `SELECT skill_rating FROM users WHERE id = ?`
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
          WHERE rp.room_id = ?
        `
        const playersResult = await client.query(playersQuery, [roomId])
        
        if (playersResult.rows[0].avg_rating) {
          const avgRating = parseFloat(playersResult.rows[0].avg_rating)
          const minRating = parseFloat(playersResult.rows[0].min_rating)
          const maxRating = parseFloat(playersResult.rows[0].max_rating)
          
          // Check if the skill gap is too large (500 points)
          if (Math.abs(userRating - avgRating) > 500) {
            throw new Error(`Skill rating difference too large. Your rating: ${userRating}, Room average: ${Math.round(avgRating)}`)
          }
          
          // Update room's average rating
          const newAvgRating = Math.round((avgRating * currentPlayers + userRating) / (currentPlayers + 1))
          const newMinRating = Math.min(minRating, userRating)
          const newMaxRating = Math.max(maxRating, userRating)
          
          const updateRoomQuery = `
            UPDATE game_rooms
            SET avg_skill_rating = ?,
                min_skill_rating = ?,
                max_skill_rating = ?
            WHERE id = ?
          `
          await client.query(updateRoomQuery, [newAvgRating, newMinRating, newMaxRating, roomId])
        } else {
          // First player joining, set initial ratings
          const updateRoomQuery = `
            UPDATE game_rooms
            SET avg_skill_rating = ?,
                min_skill_rating = ?,
                max_skill_rating = ?
            WHERE id = ?
          `
          await client.query(updateRoomQuery, [userRating, userRating, userRating, roomId])
        }
      }

      if (isPostgres) {
        const joinQuery = `
          INSERT INTO room_players (room_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (room_id, user_id) DO NOTHING
        `
        await client.query(joinQuery, [roomId, userId])
      } else {
        const joinQuery = `
          INSERT OR IGNORE INTO room_players (id, room_id, user_id)
          VALUES (?, ?, ?)
        `
        await client.query(joinQuery, [uuidv4(), roomId, userId])
      }

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
    const isPostgres = process.env.DB_TYPE !== 'sqlite'
    const _param1 = isPostgres ? '$1' : '?'
    const _param2 = isPostgres ? '$2' : '?'

    const deleteQuery = `DELETE FROM room_players WHERE room_id = ? AND user_id = ?`
    await query(deleteQuery, [roomId, userId])
  }
}
