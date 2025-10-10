import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
export async function ensureOwnerAdmin() {
    const ownerEmail = 'connorkeetch@gmail.com';
    try {
        const pool = getPool();
        const userResult = await pool.query('SELECT id, is_admin FROM users WHERE LOWER(email) = LOWER($1)', [ownerEmail]);
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            if (!user.is_admin) {
                await pool.query(`UPDATE users 
           SET is_admin = true, 
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`, [user.id]);
                logger.info(`✅ Owner account (${ownerEmail}) elevated to admin`);
            }
            else {
                logger.info(`✅ Owner account (${ownerEmail}) already has admin privileges`);
            }
            const roleResult = await pool.query('SELECT id FROM admin_roles WHERE name = $1', [
                'super_admin',
            ]);
            if (roleResult.rows.length > 0) {
                const roleId = roleResult.rows[0].id;
                const userRoleResult = await pool.query('SELECT * FROM user_admin_roles WHERE user_id = $1 AND role_id = $2', [user.id, roleId]);
                if (userRoleResult.rows.length === 0) {
                    await pool.query(`INSERT INTO user_admin_roles (user_id, role_id, assigned_by, assigned_at)
             VALUES ($1, $2, $1, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id, role_id) DO NOTHING`, [user.id, roleId]);
                    logger.info(`✅ Super admin role assigned to owner account`);
                }
            }
        }
        else {
            logger.info(`ℹ️ Owner account (${ownerEmail}) not found - will be granted admin on registration`);
        }
    }
    catch (error) {
        logger.error('Error ensuring owner admin status:', error);
    }
}
//# sourceMappingURL=ensureOwnerAdmin.js.map