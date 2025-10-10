import { query } from '../config/database.js';
function isMissingColumnError(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    const potentialCode = error.code;
    const code = typeof potentialCode === 'string' ? potentialCode : undefined;
    return (error.message.toLowerCase().includes('column') ||
        code === '42703' ||
        code === 'ER_BAD_FIELD_ERROR');
}
export class UserService {
    async create(userData) {
        try {
            const insertQuery = `
        INSERT INTO users (username, email, password_hash, email_verified, verification_token)
        VALUES ($1, $2, $3, $4, $5)
      `;
            const values = [
                userData.username,
                userData.email,
                userData.password,
                userData.email_verified === true,
                userData.verification_token ?? null,
            ];
            await query(insertQuery, values);
            const result = await query('SELECT * FROM users WHERE email = $1', [userData.email]);
            if (!result.rows || result.rows.length === 0) {
                throw new Error('Failed to retrieve created user');
            }
            return result.rows[0];
        }
        catch (error) {
            if (isMissingColumnError(error)) {
                const basicQuery = `
          INSERT INTO users (username, email, password_hash)
          VALUES ($1, $2, $3)
        `;
                await query(basicQuery, [userData.username, userData.email, userData.password]);
                const result = await query('SELECT * FROM users WHERE email = $1', [userData.email]);
                if (!result.rows || result.rows.length === 0) {
                    throw new Error('Failed to retrieve created user');
                }
                return {
                    ...result.rows[0],
                    email_verified: false,
                };
            }
            throw error;
        }
    }
    async findById(id) {
        const result = await query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    }
    async findByEmail(email) {
        const result = await query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] || null;
    }
    async findByUsername(username) {
        const result = await query('SELECT * FROM users WHERE username = $1', [username]);
        return result.rows[0] || null;
    }
    async findByVerificationToken(token) {
        const result = await query('SELECT * FROM users WHERE verification_token = $1', [token]);
        return result.rows[0] || null;
    }
    async verifyEmail(userId) {
        const updateQuery = `
      UPDATE users 
      SET email_verified = true, 
          verification_token = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        await query(updateQuery, [userId]);
    }
    async updateVerificationToken(userId, token) {
        const updateQuery = `
      UPDATE users 
      SET verification_token = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
        await query(updateQuery, [token, userId]);
    }
    async logEmailVerification(data) {
        const insertQuery = `
      INSERT INTO email_verification_logs (user_id, email, token, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `;
        await query(insertQuery, [data.user_id, data.email, data.token]);
    }
    async updateEmailVerificationLog(token) {
        const updateQuery = `
      UPDATE email_verification_logs
      SET verified_at = CURRENT_TIMESTAMP
      WHERE token = $1
    `;
        await query(updateQuery, [token]);
    }
    async getEmailVerificationLogByToken(token) {
        const findQuery = `
      SELECT user_id, email, token, created_at
      FROM email_verification_logs
      WHERE token = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await query(findQuery, [token]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
        if (Number.isNaN(createdAt.getTime())) {
            return null;
        }
        return {
            ...row,
            created_at: createdAt,
        };
    }
    async getRecentVerificationAttempts(userId) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const countQuery = `
      SELECT COUNT(*) as count 
      FROM email_verification_logs 
      WHERE user_id = $1 AND created_at > $2
    `;
        const result = await query(countQuery, [userId, oneHourAgo]);
        return result.rows[0]?.count || 0;
    }
    async createPasswordResetToken(data) {
        const insertQuery = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
    `;
        await query(insertQuery, [data.user_id, data.token, data.expires_at]);
    }
    async findPasswordResetToken(token) {
        const findQuery = `
      SELECT * FROM password_reset_tokens 
      WHERE token = $1
    `;
        const result = await query(findQuery, [token]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return {
            ...row,
            used: row.used_at != null,
        };
    }
    async markPasswordResetTokenUsed(token) {
        const updateQuery = `
      UPDATE password_reset_tokens 
      SET used_at = CURRENT_TIMESTAMP
      WHERE token = $1
    `;
        await query(updateQuery, [token]);
    }
    async updatePassword(userId, hashedPassword) {
        const updateQuery = `
      UPDATE users 
      SET password_hash = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
        await query(updateQuery, [hashedPassword, userId]);
    }
    async getRecentPasswordResetAttempts(userId) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const countQuery = `
      SELECT COUNT(*) as count 
      FROM password_reset_tokens 
      WHERE user_id = $1 AND created_at > $2
    `;
        const result = await query(countQuery, [userId, oneHourAgo]);
        return result.rows[0]?.count || 0;
    }
    async deleteUser(userId) {
        const deleteQuery = `DELETE FROM users WHERE id = $1`;
        await query(deleteQuery, [userId]);
    }
    async updateLastLogin(userId) {
        const updateQuery = `
      UPDATE users 
      SET last_login = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        await query(updateQuery, [userId]);
    }
}
//# sourceMappingURL=userService.js.map