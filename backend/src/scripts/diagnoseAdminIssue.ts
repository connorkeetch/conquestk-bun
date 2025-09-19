import { initDatabase, query } from '../config/database'
import { logger } from '../utils/logger'

async function diagnoseAdminIssue(email: string) {
  try {
    logger.info(`🔍 Diagnosing admin issue for: ${email}`)

    // Initialize database
    await initDatabase()
    const userResult = await query('SELECT id, username, email FROM users WHERE email = $1', [
      email,
    ])

    if (userResult.rows.length === 0) {
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
        return
      }
    } catch (_error: any) {
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
        return
      }
    } catch (_error: any) {
      return
    }
    const rolesResult = await query('SELECT id, name, description, is_super_admin FROM admin_roles')
    if (rolesResult.rows.length === 0) {
    } else {
      rolesResult.rows.forEach((_role) => {})
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
    } else {
      userAdminResult.rows.forEach((_role) => {})
    }
    const { AdminService } = await import('../services/adminService')
    const adminService = new AdminService()

    try {
      const _isAdmin = await adminService.isAdmin(user.id)
    } catch (_error: any) {}

    process.exit(0)
  } catch (_error) {
    process.exit(1)
  }
}

// Check command line arguments
const email = process.argv[2] || 'connorkeetch@gmail.com'

// Run the script
diagnoseAdminIssue(email)
