import { initDatabase, query } from '../config/database'
import { logger } from '../utils/logger'

async function makeUserAdmin(email: string) {
  try {
    logger.info(`🔑 Making user admin: ${email}`)

    // Initialize database
    await initDatabase()

    // Check if user exists
    const userResult = await query('SELECT id, username, email FROM users WHERE email = $1', [
      email,
    ])

    if (userResult.rows.length === 0) {
      logger.error(`❌ User not found with email: ${email}`)
      process.exit(1)
    }

    const user = userResult.rows[0]
    logger.info(`✅ Found user: ${user.username} (${user.id})`)

    // Check if super_admin role exists
    const roleResult = await query("SELECT id FROM admin_roles WHERE name = 'super_admin'")

    let roleId: string

    if (roleResult.rows.length === 0) {
      // Create super_admin role if it doesn't exist
      logger.info('📝 Creating super_admin role...')
      const createRoleResult = await query(
        `INSERT INTO admin_roles (name, description, permissions, is_super_admin) 
         VALUES ('super_admin', 'Full system access', '["*"]', true) 
         RETURNING id`,
      )
      roleId = createRoleResult.rows[0].id
    } else {
      roleId = roleResult.rows[0].id
    }

    // Check if user already has admin role
    const existingRoleResult = await query(
      'SELECT id FROM user_admin_roles WHERE user_id = $1 AND role_id = $2',
      [user.id, roleId],
    )

    if (existingRoleResult.rows.length > 0) {
      logger.info('⚠️  User already has super_admin role')

      // Update to ensure it's active
      await query(
        'UPDATE user_admin_roles SET is_active = true WHERE user_id = $1 AND role_id = $2',
        [user.id, roleId],
      )
      logger.info('✅ Ensured admin role is active')
    } else {
      // Assign super_admin role to user
      await query(
        `INSERT INTO user_admin_roles (user_id, role_id, assigned_by, is_active) 
         VALUES ($1, $2, $1, true)`,
        [user.id, roleId],
      )
      logger.info('✅ Assigned super_admin role to user')
    }

    // Also ensure user account status is active
    const statusResult = await query('SELECT id FROM user_account_status WHERE user_id = $1', [
      user.id,
    ])

    if (statusResult.rows.length === 0) {
      await query(
        `INSERT INTO user_account_status (user_id, status) 
         VALUES ($1, 'active')`,
        [user.id],
      )
      logger.info('✅ Created active account status')
    } else {
      await query(
        `UPDATE user_account_status 
         SET status = 'active', expires_at = NULL 
         WHERE user_id = $1`,
        [user.id],
      )
      logger.info('✅ Updated account status to active')
    }

    logger.info(`
🎉 Success! User ${user.username} (${email}) is now a super admin!

You can now access the admin panel at:
- Local: http://localhost:5173/admin
- Production: https://conquestk.com/admin

Admin capabilities include:
- User management (view, ban, suspend users)
- Game management (pause, resume, end games)
- Content moderation (approve/reject maps)
- System administration (feature flags, metrics)
- View admin activity logs
    `)

    process.exit(0)
  } catch (error) {
    logger.error('❌ Failed to make user admin:', error)
    process.exit(1)
  }
}

// Check command line arguments
const email = process.argv[2]

if (!email) {
  process.exit(1)
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
if (!emailRegex.test(email)) {
  process.exit(1)
}

// Run the script
makeUserAdmin(email)
