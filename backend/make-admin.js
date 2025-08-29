const { Client } = require('pg')
require('dotenv').config()

async function makeUserAdmin(email) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    console.log(`🔑 Making user admin: ${email}`)
    await client.connect()

    // Check if user exists
    const userResult = await client.query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email],
    )

    if (userResult.rows.length === 0) {
      console.error(`❌ User not found with email: ${email}`)
      process.exit(1)
    }

    const user = userResult.rows[0]
    console.log(`✅ Found user: ${user.username} (${user.id})`)

    // Get super_admin role
    const roleResult = await client.query("SELECT id FROM admin_roles WHERE name = 'super_admin'")

    if (roleResult.rows.length === 0) {
      console.error('❌ Super admin role not found! Run migrations first.')
      process.exit(1)
    }

    const roleId = roleResult.rows[0].id

    // Check if already admin
    const existingRole = await client.query(
      'SELECT id FROM user_admin_roles WHERE user_id = $1 AND role_id = $2',
      [user.id, roleId],
    )

    if (existingRole.rows.length > 0) {
      // Update to ensure active
      await client.query(
        'UPDATE user_admin_roles SET is_active = true WHERE user_id = $1 AND role_id = $2',
        [user.id, roleId],
      )
      console.log('✅ Admin role updated to active')
    } else {
      // Assign admin role
      await client.query(
        'INSERT INTO user_admin_roles (user_id, role_id, assigned_by, is_active) VALUES ($1, $2, $1, true)',
        [user.id, roleId],
      )
      console.log('✅ Admin role assigned')
    }

    // Update user table
    await client.query(
      'UPDATE users SET is_admin = true, admin_since = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id],
    )

    // Ensure account is active
    await client.query(
      "INSERT INTO user_account_status (user_id, status) VALUES ($1, 'active') ON CONFLICT (user_id) DO UPDATE SET status = 'active'",
      [user.id],
    )

    console.log(`
🎉 Success! ${user.username} is now a super admin!

You can access the admin panel at:
- Local: http://localhost:5173/admin
- Production: https://conquestk.com/admin
    `)

    await client.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error.message)
    await client.end()
    process.exit(1)
  }
}

// Run with email from command line
const email = process.argv[2]
if (!email) {
  console.log('Usage: node make-admin.js <email>')
  process.exit(1)
}

makeUserAdmin(email)
