import { initDatabase, query } from '../config/database'
import { logger } from '../utils/logger'

async function setupProductionAdmin(email: string) {
  try {
    logger.info(`🚀 Setting up production admin for: ${email}`)

    // Initialize database
    await initDatabase()

    // 1. Check if user exists
    const userResult = await query('SELECT id, username, email FROM users WHERE email = $1', [
      email,
    ])

    if (userResult.rows.length === 0) {
      logger.error(`❌ User not found with email: ${email}`)
      logger.error('User must register first before becoming admin')
      process.exit(1)
    }

    const user = userResult.rows[0]
    logger.info(`✅ Found user: ${user.username} (${user.id})`)

    // 2. Ensure admin_roles table has super_admin role
    logger.info('🔧 Ensuring super_admin role exists...')

    const existingRoleResult = await query("SELECT id FROM admin_roles WHERE name = 'super_admin'")

    let roleId: string
    if (existingRoleResult.rows.length === 0) {
      // Create super_admin role
      const createRoleResult = await query(
        `
        INSERT INTO admin_roles (name, description, permissions, is_super_admin, created_at, updated_at) 
        VALUES ('super_admin', 'Full system access', $1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
        RETURNING id
      `,
        [JSON.stringify(['*'])],
      )

      roleId = createRoleResult.rows[0].id
      logger.info('✅ Created super_admin role')
    } else {
      roleId = existingRoleResult.rows[0].id
      logger.info('✅ super_admin role already exists')
    }

    // 3. Check if user already has admin role
    const existingUserRoleResult = await query(
      'SELECT id FROM user_admin_roles WHERE user_id = $1 AND role_id = $2',
      [user.id, roleId],
    )

    if (existingUserRoleResult.rows.length > 0) {
      // Update to ensure it's active
      await query(
        'UPDATE user_admin_roles SET is_active = true, expires_at = NULL WHERE user_id = $1 AND role_id = $2',
        [user.id, roleId],
      )
      logger.info('✅ Updated existing admin role to active')
    } else {
      // Assign super_admin role to user
      await query(
        `
        INSERT INTO user_admin_roles (user_id, role_id, assigned_by, assigned_at, is_active) 
        VALUES ($1, $2, $1, CURRENT_TIMESTAMP, true)
      `,
        [user.id, roleId],
      )
      logger.info('✅ Assigned super_admin role to user')
    }

    // 4. Ensure user account status is active if table exists
    try {
      const statusCheckResult = await query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'user_account_status'
      `)

      if (statusCheckResult.rows.length > 0) {
        const statusResult = await query('SELECT id FROM user_account_status WHERE user_id = $1', [
          user.id,
        ])

        if (statusResult.rows.length === 0) {
          await query(
            `
            INSERT INTO user_account_status (user_id, status, created_at, updated_at) 
            VALUES ($1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `,
            [user.id],
          )
          logger.info('✅ Created active account status')
        } else {
          await query(
            `
            UPDATE user_account_status 
            SET status = 'active', expires_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
          `,
            [user.id],
          )
          logger.info('✅ Updated account status to active')
        }
      } else {
        logger.info('ℹ️  user_account_status table not found, skipping status setup')
      }
    } catch (error: any) {
      logger.warn('⚠️  Could not setup account status:', error.message)
    }

    // 5. Ensure is_admin flag in users table is also true (keep both systems consistent)
    logger.info('🔧 Setting is_admin flag in users table...')
    await query(
      `
      UPDATE users 
      SET is_admin = true 
      WHERE id = $1
    `,
      [user.id],
    )
    logger.info('✅ Set is_admin = true in users table')

    // 6. Test the setup
    logger.info('🧪 Testing admin setup...')
    const testResult = await query(
      `
      SELECT 1 FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = $1 AND uar.is_active = TRUE
      AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
    `,
      [user.id],
    )

    if (testResult.rows.length > 0) {
      logger.info(`
🎉 SUCCESS! User ${user.username} (${email}) is now a production admin!

Admin status: ✅ ACTIVE
Environment: PRODUCTION
Access URL: https://conquestk.com/admin

The user can now:
- Access the admin panel
- Manage users and games
- Moderate content
- Configure system settings
- View admin activity logs

Next steps:
1. User should refresh the page/clear browser cache
2. Click the Admin tab in the navigation
3. Verify admin panel loads successfully
      `)
    } else {
      logger.error('❌ Setup completed but admin test failed')
      process.exit(1)
    }

    process.exit(0)
  } catch (error: any) {
    logger.error('❌ Failed to setup production admin:', error)
    process.exit(1)
  }
}

// Check command line arguments
const email = process.argv[2]

if (!email) {
  console.log(`
Usage: npm run setup-production-admin <email>

Example:
  npm run setup-production-admin connorkeetch@gmail.com

This script will:
1. Find the user by email
2. Create/ensure super_admin role exists  
3. Assign super_admin role to the user
4. Set account status to active
5. Test the admin setup

⚠️  PRODUCTION SCRIPT - Use with caution!
  `)
  process.exit(1)
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
if (!emailRegex.test(email)) {
  console.error('❌ Invalid email format')
  process.exit(1)
}

// Run the script
setupProductionAdmin(email)
