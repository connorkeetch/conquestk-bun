import { initDatabase, query } from '../config/database.js'
import { logger } from '../utils/logger.js'

async function diagnoseAdminIssue(email: string) {
  try {
    logger.info(`🔍 Diagnosing admin issue for: ${email}`)

    // Initialize database
    await initDatabase()
    const userResult = await query('SELECT id, username, email FROM users WHERE email = $1', [
      email,
    ])

    if (userResult.rows.length === 0) {
      logger.warn('⚠️  No user found with the provided email')
      process.exit(1)
      return
    }

    const user = userResult.rows[0]
    try {
      const roleTableCheck = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'admin_roles'
        ORDER BY ordinal_position
      `)

      if (roleTableCheck.rows.length === 0) {
        logger.error('❌ admin_roles table exists but has no columns')
        process.exit(1)
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('❌ Failed to inspect admin_roles table', { message })
      process.exit(1)
      return
    }
    try {
      const userRoleTableCheck = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'user_admin_roles'
        ORDER BY ordinal_position
      `)

      if (userRoleTableCheck.rows.length === 0) {
        logger.error('❌ user_admin_roles table exists but has no columns')
        process.exit(1)
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('❌ Failed to inspect user_admin_roles table', { message })
      process.exit(1)
      return
    }
    const rolesResult = await query('SELECT id, name, description, is_super_admin FROM admin_roles')
    if (rolesResult.rows.length === 0) {
      logger.warn('⚠️  No admin roles defined in admin_roles table')
    } else {
      logger.info('✅ Admin roles detected:', {
        roles: rolesResult.rows.map((role) => ({
          id: role.id,
          name: role.name,
          isSuperAdmin: role.is_super_admin,
        })),
      })
    }
    const userAdminResult = await query(
      `
      SELECT uar.*, ar.name as role_name, ar.is_super_admin
      FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = $1
    `,
      [user.id],
    )

    if (userAdminResult.rows.length === 0) {
      logger.warn('⚠️  User has no admin roles assigned')
    } else {
      logger.info('✅ User admin role assignments:', {
        roles: userAdminResult.rows.map((role) => ({
          roleId: role.role_id,
          roleName: role.role_name,
          isSuperAdmin: role.is_super_admin,
        })),
      })
    }
    const { AdminService } = await import('../services/adminService.js')
    const adminService = new AdminService()

    try {
      const isAdmin = await adminService.isAdmin(user.id)
      logger.info(`ℹ️  Admin service reports user is admin: ${isAdmin}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('❌ Failed to verify admin status via service', { message })
    }

    process.exit(0)
  } catch (_error) {
    process.exit(1)
  }
}

// Check command line arguments
const email = process.argv[2] || 'connorkeetch@gmail.com'

// Run the script
diagnoseAdminIssue(email)
