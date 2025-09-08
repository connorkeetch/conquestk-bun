#!/usr/bin/env node

/**
 * Deploy Consolidated Migration Script (Node.js version)
 * Uses the existing database connection instead of psql
 */

const fs = require('fs')
const path = require('path')

// Load environment variables first
require('dotenv').config({ path: path.join(__dirname, '../.env') })

// Import database configuration
const dbPath = path.join(__dirname, '../src/config/database.ts')
const configPath = path.join(__dirname, '../dist/config/database.js')

// Check if we need to compile TypeScript first
if (!fs.existsSync(configPath)) {
  console.log('📦 Compiling TypeScript files...')
  const { execSync } = require('child_process')
  execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' })
}

const { getClient, query } = require(configPath)

const migrationFile = path.join(__dirname, '../migrations/010_consolidated_schema.sql')

if (!fs.existsSync(migrationFile)) {
  console.error(`ERROR: Migration file not found: ${migrationFile}`)
  process.exit(1)
}

async function backupUserData() {
  console.log('🔄 Creating backup of user data...')

  try {
    // Check if users table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `)

    if (!tableCheck.rows[0].exists) {
      console.log('ℹ️  No users table found - skipping backup (clean install)')
      return { users: [], settings: [] }
    }

    // Backup users
    const users = await query(`
      SELECT id, username, email, password, email_verified, skill_rating, 
             games_played, games_won, peak_rating, last_login, is_admin,
             created_at, updated_at
      FROM users 
      WHERE deleted_at IS NULL
    `)

    // Backup user settings if table exists
    let settings = { rows: [] }
    try {
      const settingsCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'user_settings'
        );
      `)

      if (settingsCheck.rows[0].exists) {
        settings = await query(`
          SELECT us.* FROM user_settings us
          JOIN users u ON us.user_id = u.id
          WHERE u.deleted_at IS NULL
        `)
      }
    } catch (e) {
      console.log('ℹ️  No user_settings table found - skipping')
    }

    console.log(`📊 Backed up ${users.rows.length} users and ${settings.rows.length} user settings`)
    return { users: users.rows, settings: settings.rows }
  } catch (error) {
    console.error('❌ Backup failed:', error.message)
    throw error
  }
}

async function restoreUserData(backup) {
  if (backup.users.length === 0) {
    console.log('ℹ️  No user data to restore')
    return
  }

  console.log('📥 Restoring user data...')

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Restore users
    for (const user of backup.users) {
      await client.query(
        `
        INSERT INTO users (id, username, email, password, email_verified, skill_rating,
                          games_played, games_won, peak_rating, last_login, is_admin,
                          created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING
      `,
        [
          user.id,
          user.username,
          user.email,
          user.password,
          user.email_verified,
          user.skill_rating,
          user.games_played,
          user.games_won,
          user.peak_rating,
          user.last_login,
          user.is_admin,
          user.created_at,
          user.updated_at,
        ],
      )
    }

    // Restore user settings
    for (const setting of backup.settings) {
      await client.query(
        `
        INSERT INTO user_settings (id, user_id, theme, preferred_color, show_online_status,
                                 direct_messages, notifications, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id) DO UPDATE SET
          theme = EXCLUDED.theme,
          preferred_color = EXCLUDED.preferred_color,
          show_online_status = EXCLUDED.show_online_status,
          direct_messages = EXCLUDED.direct_messages,
          notifications = EXCLUDED.notifications,
          updated_at = EXCLUDED.updated_at
      `,
        [
          setting.id,
          setting.user_id,
          setting.theme,
          setting.preferred_color,
          setting.show_online_status,
          setting.direct_messages,
          setting.notifications,
          setting.created_at,
          setting.updated_at,
        ],
      )
    }

    await client.query('COMMIT')
    console.log(
      `✅ Restored ${backup.users.length} users and ${backup.settings.length} user settings`,
    )
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('❌ Restore failed:', error.message)
    throw error
  } finally {
    if (client.release) client.release()
  }
}

async function createDefaultMapIfNeeded() {
  try {
    console.log('🗺️ Creating default map...')

    // Check if any maps exist
    const mapCount = await query('SELECT COUNT(*) as count FROM maps')
    if (mapCount.rows[0].count > 0) {
      console.log('ℹ️  Maps already exist, skipping default map creation')
      return
    }

    // Get first user for created_by
    const firstUser = await query('SELECT id FROM users LIMIT 1')
    if (firstUser.rows.length === 0) {
      console.log('⚠️  No users found, skipping default map creation')
      return
    }

    // Create default map using SQL function
    await query(
      `
      INSERT INTO maps (id, name, description, territories_count, is_official, created_by, created_at, updated_at, version)
      VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        'World Map',
        'Classic Risk world map with 42 territories',
        42,
        true,
        firstUser.rows[0].id,
        new Date().toISOString(),
        new Date().toISOString(),
        1,
      ],
    )

    console.log('✅ Default map created successfully')
  } catch (error) {
    console.error('❌ Failed to create default map:', error.message)
    // Don't throw - this is not critical for migration success
  }
}

async function deployMigration() {
  console.log('🚀 Deploying consolidated migration...')
  console.log(`📁 Migration file: ${migrationFile}`)

  try {
    // Step 1: Backup existing data
    const backup = await backupUserData()

    // Step 2: Run the consolidated migration
    console.log('🗃️ Executing consolidated migration...')
    const migrationSQL = fs.readFileSync(migrationFile, 'utf8')

    const client = await getClient()
    try {
      await client.query(migrationSQL)
      console.log('✅ Migration executed successfully')
    } finally {
      if (client.release) client.release()
    }

    // Step 3: Restore user data
    await restoreUserData(backup)

    // Step 3.5: Create default map now that users exist
    await createDefaultMapIfNeeded()

    // Step 4: Verify migration
    console.log('🔍 Verifying migration...')
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'maps', 'game_rooms', 'admin_roles', 'achievements')
      ORDER BY table_name
    `)

    console.log('📋 Core tables created:', tables.rows.map((t) => t.table_name).join(', '))

    if (tables.rows.length >= 5) {
      console.log('✅ Migration completed successfully!')

      // Check restored data
      const userCount = await query('SELECT COUNT(*) as count FROM users')
      console.log(`👤 Users in database: ${userCount.rows[0].count}`)

      console.log('\n🎉 Consolidated migration deployment complete!')
      console.log('💡 Next steps:')
      console.log('   1. Test application functionality')
      console.log('   2. Verify user login works')
      console.log('   3. Check admin panel')
      console.log('   4. Test profile pages')
    } else {
      throw new Error(`Expected at least 5 core tables, found ${tables.rows.length}`)
    }
  } catch (error) {
    console.error('❌ Migration deployment failed:', error.message)
    console.error('\n🚨 Migration failed - check error details above')
    process.exit(1)
  }
}

// Run the deployment
deployMigration().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
