import { query } from '../config/database';
import { User } from '../types/user';
import { v4 as uuidv4 } from 'uuid';

export class UserService {
  async create(userData: any): Promise<User> {
    // MySQL and SQLite both use ? placeholders
    // Try with email verification columns first
    try {
      const insertQuery = `
        INSERT INTO users (username, email, password, email_verified, verification_token, verification_sent_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        userData.username,
        userData.email,
        userData.password,
        userData.email_verified === true ? true : false,
        userData.verification_token || null,
        userData.verification_sent_at || null
      ];
      
      await query(insertQuery, values);
      
      // Get the created user
      const result = await query('SELECT * FROM users WHERE email = ?', [userData.email]);
      
      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to retrieve created user');
      }
      
      return result.rows[0];
    } catch (error: any) {
      // If email verification columns don't exist, try basic insert
      if (error.message?.includes('column') || error.code === '42703' || error.code === 'ER_BAD_FIELD_ERROR') {
        console.log('Email verification columns not found, using basic insert');
        const basicQuery = `
          INSERT INTO users (username, email, password)
          VALUES (?, ?, ?)
        `;
        
        await query(basicQuery, [
          userData.username,
          userData.email,
          userData.password
        ]);
        
        // Get the created user
        const result = await query('SELECT * FROM users WHERE email = ?', [userData.email]);
        
        if (!result.rows || result.rows.length === 0) {
          throw new Error('Failed to retrieve created user');
        }
        
        // Add default values for missing fields
        return {
          ...result.rows[0],
          email_verified: false
        };
      }
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE email = ?', [email]);
    return result.rows[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE username = ?', [username]);
    return result.rows[0] || null;
  }

  async updateLastLogin(id: string): Promise<void> {
    const updateQuery = `UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await query(updateQuery, [id]);
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE verification_token = ?', [token]);
    return result.rows[0] || null;
  }

  async verifyEmail(userId: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET email_verified = true, 
          verification_token = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await query(updateQuery, [userId]);
  }

  async updateVerificationToken(userId: string, token: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET verification_token = ?,
          verification_sent_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await query(updateQuery, [token, userId]);
  }

  async logEmailVerification(data: {
    user_id: string;
    email: string;
    token: string;
  }): Promise<void> {
    const insertQuery = `
      INSERT INTO email_verification_logs (user_id, email, token, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;
    await query(insertQuery, [data.user_id, data.email, data.token]);
  }

  async updateEmailVerificationLog(token: string): Promise<void> {
    const updateQuery = `
      UPDATE email_verification_logs 
      SET verified_at = CURRENT_TIMESTAMP
      WHERE token = ?
    `;
    await query(updateQuery, [token]);
  }

  async getRecentVerificationAttempts(userId: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM email_verification_logs 
      WHERE user_id = ? AND created_at > ?
    `;
    const result = await query(countQuery, [userId, oneHourAgo]);
    return result.rows[0]?.count || 0;
  }

  async createPasswordResetToken(data: {
    user_id: string;
    token: string;
    expires_at: Date;
  }): Promise<void> {
    const insertQuery = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `;
    await query(insertQuery, [data.user_id, data.token, data.expires_at]);
  }

  async findPasswordResetToken(token: string): Promise<any> {
    const findQuery = `
      SELECT * FROM password_reset_tokens 
      WHERE token = ?
    `;
    const result = await query(findQuery, [token]);
    return result.rows[0] || null;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    const updateQuery = `
      UPDATE password_reset_tokens 
      SET used = true, 
          used_at = CURRENT_TIMESTAMP
      WHERE token = ?
    `;
    await query(updateQuery, [token]);
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET password = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await query(updateQuery, [hashedPassword, userId]);
  }

  async getRecentPasswordResetAttempts(userId: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM password_reset_tokens 
      WHERE user_id = ? AND created_at > ?
    `;
    const result = await query(countQuery, [userId, oneHourAgo]);
    return result.rows[0]?.count || 0;
  }
}