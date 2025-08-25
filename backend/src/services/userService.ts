import { query } from '../config/database';
import { User } from '../types/user';
import { v4 as uuidv4 } from 'uuid';

export class UserService {
  async create(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const id = uuidv4();
    const isPostgres = process.env.DB_TYPE !== 'sqlite';
    
    if (isPostgres) {
      const pgQuery = `
        INSERT INTO users (username, email, password)
        VALUES ($1, $2, $3)
        RETURNING id, username, email, created_at, updated_at
      `;
      
      const result = await query(pgQuery, [
        userData.username,
        userData.email,
        userData.password
      ]);
      
      return result.rows[0];
    } else {
      // SQLite uses auto-generated UUID, don't provide one
      const sqliteQuery = `
        INSERT INTO users (username, email, password)
        VALUES (?, ?, ?)
      `;
      
      const insertResult = await query(sqliteQuery, [
        userData.username,
        userData.email,
        userData.password
      ]);
      
      // For SQLite, we need to get the last inserted row
      const result = await query('SELECT * FROM users WHERE email = ?', [userData.email]);
      
      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to retrieve created user');
      }
      
      return result.rows[0];
    }
  }

  async findById(id: string): Promise<User | null> {
    const paramPlaceholder = process.env.DB_TYPE === 'sqlite' ? '?' : '$1';
    const findQuery = `SELECT * FROM users WHERE id = ${paramPlaceholder}`;
    const result = await query(findQuery, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const paramPlaceholder = process.env.DB_TYPE === 'sqlite' ? '?' : '$1';
    const findQuery = `SELECT * FROM users WHERE email = ${paramPlaceholder}`;
    const result = await query(findQuery, [email]);
    return result.rows[0] || null;
  }

  async updateLastLogin(id: string): Promise<void> {
    const isPostgres = process.env.DB_TYPE !== 'sqlite';
    const paramPlaceholder = isPostgres ? '$1' : '?';
    const timeFunction = isPostgres ? 'NOW()' : "datetime('now')";
    
    const updateQuery = `UPDATE users SET updated_at = ${timeFunction} WHERE id = ${paramPlaceholder}`;
    await query(updateQuery, [id]);
  }
}