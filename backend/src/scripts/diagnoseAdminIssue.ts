import { initDatabase, query } from '../config/database'
import { logger } from '../utils/logger'

async function diagnoseAdminIssue(email: string) {
  try {
    logger.info(`🔍 Diagnosing admin issue for: ${email}`)

    // Initialize database
    await initDatabase()

    // 1. Check if user exists
    console.log('\n=== USER CHECK ===')
    const userResult = await query('SELECT id, username, email FROM users WHERE email = $1', [
      email,
    ])

    if (userResult.rows.length === 0) {
      console.log(`❌ User not found with email: ${email}`)
      return
    }

    const user = userResult.rows[0]
    console.log(`✅ Found user: ${user.username} (${user.id})`)

    // 2. Check if admin_roles table exists
    console.log('\n=== ADMIN ROLES TABLE ===')
    try {
      const roleTableCheck = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'admin_roles'
        ORDER BY ordinal_position
      `)

      if (roleTableCheck.rows.length === 0) {
        console.log('❌ admin_roles table does not exist')
        return
      }
      console.log(
        '✅ admin_roles table exists with columns:',
        roleTableCheck.rows.map((r) => r.column_name).join(', '),
      )
    } catch (error: unknown) {
      console.log('❌ Error checking admin_roles table:', error.message)
      return
    }

    // 3. Check if user_admin_roles table exists
    console.log('\n=== USER ADMIN ROLES TABLE ===')
    try {
      const userRoleTableCheck = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'user_admin_roles'
        ORDER BY ordinal_position
      `)

      if (userRoleTableCheck.rows.length === 0) {
        console.log('❌ user_admin_roles table does not exist')
        return
      }
      console.log(
        '✅ user_admin_roles table exists with columns:',
        userRoleTableCheck.rows.map((r) => r.column_name).join(', '),
      )
    } catch (error: unknown) {
      console.log('❌ Error checking user_admin_roles table:', error.message)
      return
    }

    // 4. Check existing admin roles
    console.log('\n=== EXISTING ADMIN ROLES ===')
    const rolesResult = await query('SELECT id, name, description, is_super_admin FROM admin_roles')
    if (rolesResult.rows.length === 0) {
      console.log('⚠️  No admin roles exist')
    } else {
      console.log('Found admin roles:')
      rolesResult.rows.forEach((role) => {
        console.log(`  - ${role.name} (${role.id}) - Super: ${role.is_super_admin}`)
      })
    }

    // 5. Check user's admin roles
    console.log('\n=== USER ADMIN STATUS ===')
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
      console.log('❌ User has no admin roles assigned')
    } else {
      console.log('User admin roles:')
      userAdminResult.rows.forEach((role) => {
        console.log(`  - Role: ${role.role_name}`)
        console.log(`  - Active: ${role.is_active}`)
        console.log(`  - Expires: ${role.expires_at || 'Never'}`)
        console.log(`  - Super Admin: ${role.is_super_admin}`)
      })
    }

    // 6. Test the adminService.isAdmin function
    console.log('\n=== TESTING ADMIN SERVICE ===')
    const { AdminService } = await import('../services/adminService')
    const adminService = new AdminService()

    try {
      const isAdmin = await adminService.isAdmin(user.id)
      console.log(`adminService.isAdmin result: ${isAdmin}`)
    } catch (error: unknown) {
      console.log('❌ Error testing adminService.isAdmin:', error.message)
    }

    process.exit(0)
  } catch (error) {
    console.error('❌ Diagnosis failed:', error)
    process.exit(1)
  }
}

// Check command line arguments
const email = process.argv[2] || 'connorkeetch@gmail.com'

console.log(`
🔍 Admin Diagnosis Tool
======================

Checking admin setup for: ${email}

This will check:
1. User existence
2. Admin tables structure  
3. Existing admin roles
4. User's admin assignments
5. AdminService functionality
`)

// Run the script
diagnoseAdminIssue(email)
