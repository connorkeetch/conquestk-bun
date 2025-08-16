import { query, getClient } from '../config/database';
import { GameRoom } from '../types/gameRoom';
import { v4 as uuidv4 } from 'uuid';

export class GameRoomService {
  async createRoom(roomData: Omit<GameRoom, 'id' | 'createdAt' | 'players'>): Promise<GameRoom> {
    const id = uuidv4();
    const isPostgres = process.env.DB_TYPE !== 'sqlite';
    
    if (isPostgres) {
      const pgQuery = `
        INSERT INTO game_rooms (name, host_id, max_players, is_private, status)
        VALUES ($1, $2, $3, $4, 'waiting')
        RETURNING *
      `;
      
      const result = await query(pgQuery, [
        roomData.name,
        roomData.hostId,
        roomData.maxPlayers,
        roomData.isPrivate
      ]);
      
      return result.rows[0];
    } else {
      const sqliteQuery = `
        INSERT INTO game_rooms (id, name, host_id, max_players, is_private, status)
        VALUES (?, ?, ?, ?, ?, 'waiting')
      `;
      
      await query(sqliteQuery, [
        id,
        roomData.name,
        roomData.hostId,
        roomData.maxPlayers,
        roomData.isPrivate
      ]);
      
      const result = await query('SELECT * FROM game_rooms WHERE id = ?', [id]);
      return result.rows[0];
    }
  }

  async getActiveRooms(): Promise<GameRoom[]> {
    const getQuery = `
      SELECT gr.*, COUNT(rp.user_id) as player_count
      FROM game_rooms gr
      LEFT JOIN room_players rp ON gr.id = rp.room_id
      WHERE gr.status IN ('waiting', 'in_progress')
      GROUP BY gr.id
      ORDER BY gr.created_at DESC
    `;
    
    const result = await query(getQuery);
    return result.rows;
  }

  async getRoomById(roomId: string): Promise<GameRoom | null> {
    const isPostgres = process.env.DB_TYPE !== 'sqlite';
    const paramPlaceholder = isPostgres ? '$1' : '?';
    
    if (isPostgres) {
      const pgQuery = `
        SELECT gr.*, 
               json_agg(
                 json_build_object(
                   'userId', u.id,
                   'username', u.username,
                   'joinedAt', rp.joined_at
                 )
               ) as players
        FROM game_rooms gr
        LEFT JOIN room_players rp ON gr.id = rp.room_id
        LEFT JOIN users u ON rp.user_id = u.id
        WHERE gr.id = ${paramPlaceholder}
        GROUP BY gr.id
      `;
      
      const result = await query(pgQuery, [roomId]);
      return result.rows[0] || null;
    } else {
      const sqliteQuery = `
        SELECT gr.*,
               '[' || GROUP_CONCAT(
                 CASE WHEN u.id IS NOT NULL THEN
                   '{"userId":"' || u.id || '","username":"' || u.username || '","joinedAt":"' || rp.joined_at || '"}'
                 END
               ) || ']' as players
        FROM game_rooms gr
        LEFT JOIN room_players rp ON gr.id = rp.room_id
        LEFT JOIN users u ON rp.user_id = u.id
        WHERE gr.id = ${paramPlaceholder}
        GROUP BY gr.id
      `;
      
      const result = await query(sqliteQuery, [roomId]);
      if (result.rows[0]) {
        const room = result.rows[0];
        if (room.players && room.players !== '[]') {
          try {
            room.players = JSON.parse(room.players);
          } catch {
            room.players = [];
          }
        } else {
          room.players = [];
        }
      }
      return result.rows[0] || null;
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const client = await getClient();
    const isPostgres = process.env.DB_TYPE !== 'sqlite';
    const param1 = isPostgres ? '$1' : '?';
    const param2 = isPostgres ? '$2' : '?';
    
    try {
      if (isPostgres) {
        await client.query('BEGIN');
      } else {
        await client.query('BEGIN TRANSACTION');
      }
      
      const roomQuery = `SELECT * FROM game_rooms WHERE id = ${param1}`;
      const roomResult = await client.query(roomQuery, [roomId]);
      
      if (roomResult.rows.length === 0) {
        throw new Error('Room not found');
      }
      
      const room = roomResult.rows[0];
      
      if (room.status !== 'waiting') {
        throw new Error('Room is not accepting new players');
      }
      
      const playerCountQuery = `SELECT COUNT(*) as count FROM room_players WHERE room_id = ${param1}`;
      const countResult = await client.query(playerCountQuery, [roomId]);
      const currentPlayers = parseInt(countResult.rows[0].count);
      
      if (currentPlayers >= room.max_players) {
        throw new Error('Room is full');
      }
      
      if (isPostgres) {
        const joinQuery = `
          INSERT INTO room_players (room_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (room_id, user_id) DO NOTHING
        `;
        await client.query(joinQuery, [roomId, userId]);
      } else {
        const joinQuery = `
          INSERT OR IGNORE INTO room_players (id, room_id, user_id)
          VALUES (?, ?, ?)
        `;
        await client.query(joinQuery, [uuidv4(), roomId, userId]);
      }
      
      await client.query('COMMIT');
      return { success: true, message: 'Joined room successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const isPostgres = process.env.DB_TYPE !== 'sqlite';
    const param1 = isPostgres ? '$1' : '?';
    const param2 = isPostgres ? '$2' : '?';
    
    const deleteQuery = `DELETE FROM room_players WHERE room_id = ${param1} AND user_id = ${param2}`;
    await query(deleteQuery, [roomId, userId]);
  }
}