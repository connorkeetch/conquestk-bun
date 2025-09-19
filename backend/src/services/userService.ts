import { query } from '../config/database'
import type { User } from '../types/user'

export class UserService {
  async create(userData: any): Promise<User> {
    // Try with email verification columns first
    try {
      const insertQuery = `
        INSERT INTO users (username, email, password_hash, email_verified, verification_token)
        VALUES ($1, $2, $3, $4, $5)
      `

      const values = [
        userData.username,
        userData.email,
        userData.password,
        userData.email_verified === true,
        userData.verification_token || null,
        // userData.verification_sent_at || null, // Column doesn't exist in schema
      ]

      await query(insertQuery, values)

      // Get the created user
      const result = await query('SELECT * FROM users WHERE email = $1', [userData.email])

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to retrieve created user')
      }

      return result.rows[0] as User
    } catch (error: any) {
      // If email verification columns don't exist, try basic insert
      if (
        error.message?.includes('column') ||
        error.code === '42703' ||
        error.code === 'ER_BAD_FIELD_ERROR'
      ) {
        const basicQuery = `
          INSERT INTO users (username, email, password_hash)
          VALUES ($1, $2, $3)
        `

        await query(basicQuery, [userData.username, userData.email, userData.password])

        // Get the created user
        const result = await query('SELECT * FROM users WHERE email = $1', [userData.email])

        if (!result.rows || result.rows.length === 0) {
          throw new Error('Failed to retrieve created user')
        }

        // Add default values for missing fields
        return {
          ...(result.rows[0] as User),
          email_verified: false,
        }
      }
      throw error
    }
  }

  async findById(id: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE id = $1', [id])
    return (result.rows[0] as User) || null
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE email = $1', [email])
    return (result.rows[0] as User) || null
  }

  async findByUsername(username: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE username = $1', [username])
    return (result.rows[0] as User) || null
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE verification_token = $1', [token])
    return (result.rows[0] as User) || null
  }

  async verifyEmail(userId: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET email_verified = true, 
          verification_token = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `
    await query(updateQuery, [userId])
  }

  async updateVerificationToken(userId: string, token: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET verification_token = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `
    await query(updateQuery, [token, userId])
  }

  async logEmailVerification(data: {
    user_id: string
    email: string
    token: string
  }): Promise<void> {
    const insertQuery = `
      INSERT INTO email_verification_logs (user_id, email, token, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `
    await query(insertQuery, [data.user_id, data.email, data.token])
  }

  async updateEmailVerificationLog(token: string): Promise<void> {
    const updateQuery = `
      UPDATE email_verification_logs 
      SET verified_at = CURRENT_TIMESTAMP
      WHERE token = $1
    `
    await query(updateQuery, [token])
  }

  async getRecentVerificationAttempts(userId: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM email_verification_logs 
      WHERE user_id = $1 AND created_at > $2
    `
    const result = await query(countQuery, [userId, oneHourAgo])
    return result.rows[0]?.count || 0
  }

  async createPasswordResetToken(data: {
    user_id: string
    token: string
    expires_at: Date
  }): Promise<void> {
    const insertQuery = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
    `
    await query(insertQuery, [data.user_id, data.token, data.expires_at])
  }

  async findPasswordResetToken(token: string): Promise<any> {
    const findQuery = `
      SELECT * FROM password_reset_tokens 
      WHERE token = $1
    `
    const result = await query(findQuery, [token])
    return result.rows[0] || null
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    const updateQuery = `
      UPDATE password_reset_tokens 
      SET used = true, 
          used_at = CURRENT_TIMESTAMP
      WHERE token = $1
    `
    await query(updateQuery, [token])
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET password_hash = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `
    await query(updateQuery, [hashedPassword, userId])
  }

  async getRecentPasswordResetAttempts(userId: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM password_reset_tokens 
      WHERE user_id = $1 AND created_at > $2
    `
    const result = await query(countQuery, [userId, oneHourAgo])
    return result.rows[0]?.count || 0
  }

  async deleteUser(userId: string): Promise<void> {
    // Delete user and all related data (cascade delete should handle most references)
    const deleteQuery = `DELETE FROM users WHERE id = $1`
    await query(deleteQuery, [userId])
  }

  async updateLastLogin(userId: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET last_login = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `
    await query(updateQuery, [userId])
  }
}
