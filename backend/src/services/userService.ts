import { query } from '../config/database.js'
import type { User } from '../types/user.js'

type CreateUserInput = {
  username: string
  email: string
  password: string
  email_verified?: boolean
  verification_token?: string | null
}

type DatabaseError = Error & { code?: string }

type PasswordResetTokenRow = {
  id: string
  user_id: string
  token: string
  expires_at: Date
  used_at: Date | null
  created_at: Date
}

type PasswordResetToken = PasswordResetTokenRow & { used: boolean }

type EmailVerificationLogRow = {
  user_id: string
  email: string
  token: string
  created_at: Date | string
}

export type EmailVerificationLog = {
  user_id: string
  email: string
  token: string
  created_at: Date
}

function isMissingColumnError(error: unknown): error is DatabaseError {
  if (!(error instanceof Error)) {
    return false
  }

  const potentialCode = (error as { code?: unknown }).code
  const code = typeof potentialCode === 'string' ? potentialCode : undefined

  return (
    error.message.toLowerCase().includes('column') ||
    code === '42703' ||
    code === 'ER_BAD_FIELD_ERROR'
  )
}

/**
 * The UserService class is responsible for managing user data, including
 * creation, retrieval, and updates. It also handles email verification and
 * password reset functionality.
 *
 * @class UserService
 */
export class UserService {
  /**
   * Creates a new user.
   *
   * @param {CreateUserInput} userData - The data for the new user.
   * @returns {Promise<User>} A promise that resolves to the created user.
   */
  async create(userData: CreateUserInput): Promise<User> {
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
        userData.verification_token ?? null,
        // userData.verification_sent_at || null, // Column doesn't exist in schema
      ] satisfies [string, string, string, boolean, string | null]

      await query(insertQuery, values)

      // Get the created user
      const result = await query('SELECT * FROM users WHERE email = $1', [userData.email])

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Failed to retrieve created user')
      }

      return result.rows[0] as User
    } catch (error) {
      // If email verification columns don't exist, try basic insert
      if (isMissingColumnError(error)) {
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

  /**
   * Finds a user by their ID.
   *
   * @param {string} id - The ID of the user to find.
   * @returns {Promise<User | null>} A promise that resolves to the user, or `null` if not found.
   */
  async findById(id: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE id = $1', [id])
    return (result.rows[0] as User) || null
  }

  /**
   * Finds a user by their email address.
   *
   * @param {string} email - The email address of the user to find.
   * @returns {Promise<User | null>} A promise that resolves to the user, or `null` if not found.
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE email = $1', [email])
    return (result.rows[0] as User) || null
  }

  /**
   * Finds a user by their username.
   *
   * @param {string} username - The username of the user to find.
   * @returns {Promise<User | null>} A promise that resolves to the user, or `null` if not found.
   */
  async findByUsername(username: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE username = $1', [username])
    return (result.rows[0] as User) || null
  }

  /**
   * Finds a user by their email verification token.
   *
   * @param {string} token - The verification token to search for.
   * @returns {Promise<User | null>} A promise that resolves to the user, or `null` if not found.
   */
  async findByVerificationToken(token: string): Promise<User | null> {
    const result = await query('SELECT * FROM users WHERE verification_token = $1', [token])
    return (result.rows[0] as User) || null
  }

  /**
   * Verifies a user's email address.
   *
   * @param {string} userId - The ID of the user to verify.
   */
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

  /**
   * Updates a user's email verification token.
   *
   * @param {string} userId - The ID of the user to update.
   * @param {string} token - The new verification token.
   */
  async updateVerificationToken(userId: string, token: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET verification_token = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `
    await query(updateQuery, [token, userId])
  }

  /**
   * Logs an email verification attempt.
   *
   * @param {{ user_id: string; email: string; token: string; }} data - The data for the email verification log entry.
   */
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

  /**
   * Updates an email verification log entry to mark it as verified.
   *
   * @param {string} token - The verification token.
   */
  async updateEmailVerificationLog(token: string): Promise<void> {
    const updateQuery = `
      UPDATE email_verification_logs
      SET verified_at = CURRENT_TIMESTAMP
      WHERE token = $1
    `
    await query(updateQuery, [token])
  }

  /**
   * Gets an email verification log entry by token.
   *
   * @param {string} token - The verification token.
   * @returns {Promise<EmailVerificationLog | null>} A promise that resolves to the email verification log entry, or `null` if not found.
   */
  async getEmailVerificationLogByToken(token: string): Promise<EmailVerificationLog | null> {
    const findQuery = `
      SELECT user_id, email, token, created_at
      FROM email_verification_logs
      WHERE token = $1
      ORDER BY created_at DESC
      LIMIT 1
    `

    const result = await query(findQuery, [token])
    const row = result.rows[0] as EmailVerificationLogRow | undefined

    if (!row) {
      return null
    }

    const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at)

    if (Number.isNaN(createdAt.getTime())) {
      return null
    }

    return {
      ...row,
      created_at: createdAt,
    }
  }

  /**
   * Gets the number of recent email verification attempts for a user.
   *
   * @param {string} userId - The ID of the user.
   * @returns {Promise<number>} A promise that resolves to the number of recent verification attempts.
   */
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

  /**
   * Creates a password reset token for a user.
   *
   * @param {{ user_id: string; token: string; expires_at: Date; }} data - The data for the password reset token.
   */
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

  /**
   * Finds a password reset token.
   *
   * @param {string} token - The password reset token to find.
   * @returns {Promise<PasswordResetToken | null>} A promise that resolves to the password reset token, or `null` if not found.
   */
  async findPasswordResetToken(token: string): Promise<PasswordResetToken | null> {
    const findQuery = `
      SELECT * FROM password_reset_tokens 
      WHERE token = $1
    `
    const result = await query(findQuery, [token])
    const row = result.rows[0] as PasswordResetTokenRow | undefined

    if (!row) {
      return null
    }

    return {
      ...row,
      used: row.used_at != null,
    }
  }

  /**
   * Marks a password reset token as used.
   *
   * @param {string} token - The password reset token to mark as used.
   */
  async markPasswordResetTokenUsed(token: string): Promise<void> {
    const updateQuery = `
      UPDATE password_reset_tokens 
      SET used_at = CURRENT_TIMESTAMP
      WHERE token = $1
    `
    await query(updateQuery, [token])
  }

  /**
   * Updates a user's password.
   *
   * @param {string} userId - The ID of the user to update.
   * @param {string} hashedPassword - The user's new hashed password.
   */
  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    const updateQuery = `
      UPDATE users 
      SET password_hash = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `
    await query(updateQuery, [hashedPassword, userId])
  }

  /**
   * Gets the number of recent password reset attempts for a user.
   *
   * @param {string} userId - The ID of the user.
   * @returns {Promise<number>} A promise that resolves to the number of recent password reset attempts.
   */
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

  /**
   * Deletes a user.
   *
   * @param {string} userId - The ID of the user to delete.
   */
  async deleteUser(userId: string): Promise<void> {
    // Delete user and all related data (cascade delete should handle most references)
    const deleteQuery = `DELETE FROM users WHERE id = $1`
    await query(deleteQuery, [userId])
  }

  /**
   * Updates a user's last login timestamp.
   *
   * @param {string} userId - The ID of the user to update.
   */
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
