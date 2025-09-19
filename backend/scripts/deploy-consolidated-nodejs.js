#!/usr/bin/env node

/**
 * Deploy Consolidated Migration Script (Node.js version)
 * Uses the existing database connection instead of psql
 */

const fs = require('node:fs')
const path = require('node:path')

const writeOut = (message = '') => {
  process.stdout.write(`${message}\n`)
}

const writeErr = (message = '') => {
  process.stderr.write(`${message}\n`)
}

const formatError = (error) => (error instanceof Error ? error.message : String(error))

// Load environment variables first
require('dotenv').config({ path: path.join(__dirname, '../.env') })

// Import database configuration
const configPath = path.join(__dirname, '../dist/config/database.js')

// Check if we need to compile TypeScript first
if (!fs.existsSync(configPath)) {
  writeOut('📦 Compiling TypeScript files...')
  const { execSync } = require('node:child_process')
  execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' })
}

const { getClient, query } = require(configPath)

const migrationFile = path.join(__dirname, '../migrations/010_consolidated_schema.sql')

if (!fs.existsSync(migrationFile)) {
  writeErr(`ERROR: Migration file not found: ${migrationFile}`)
  process.exit(1)
}

async function backupUserData() {
  writeOut('🔄 Creating backup of user data...')

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
      writeOut('ℹ️  No users table found - skipping backup (clean install)')
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
    } catch (_error) {
      writeOut('ℹ️  No user_settings table found - skipping')
    }

    writeOut(`📊 Backed up ${users.rows.length} users and ${settings.rows.length} user settings`)
    return { users: users.rows, settings: settings.rows }
  } catch (error) {
    writeErr(`❌ Backup failed: ${formatError(error)}`)
    throw error
  }
}

async function restoreUserData(backup) {
  if (backup.users.length === 0) {
    writeOut('ℹ️  No user data to restore')
    return
  }

  writeOut('📥 Restoring user data...')

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
    writeOut(`✅ Restored ${backup.users.length} users and ${backup.settings.length} user settings`)
  } catch (error) {
    await client.query('ROLLBACK')
    writeErr(`❌ Restore failed: ${formatError(error)}`)
    throw error
  } finally {
    if (client.release) client.release()
  }
}

async function createDefaultMapIfNeeded() {
  try {
    writeOut('🗺️ Creating default map...')

    // Check if any maps exist
    const mapCount = await query('SELECT COUNT(*) as count FROM maps')
    if (mapCount.rows[0].count > 0) {
      writeOut('ℹ️  Maps already exist, skipping default map creation')
      return
    }

    // Get first user for created_by
    const firstUser = await query('SELECT id FROM users LIMIT 1')
    if (firstUser.rows.length === 0) {
      writeOut('⚠️  No users found, skipping default map creation')
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

    writeOut('✅ Default map created successfully')
  } catch (error) {
    writeErr(`❌ Failed to create default map: ${formatError(error)}`)
    // Don't throw - this is not critical for migration success
  }
}

async function deployMigration() {
  writeOut('🚀 Deploying consolidated migration...')
  writeOut(`📁 Migration file: ${migrationFile}`)

  try {
    // Step 1: Backup existing data
    const backup = await backupUserData()

    // Step 2: Run the consolidated migration
    writeOut('🗃️ Executing consolidated migration...')
    const migrationSQL = fs.readFileSync(migrationFile, 'utf8')

    const client = await getClient()
    try {
      await client.query(migrationSQL)
      writeOut('✅ Migration executed successfully')
    } finally {
      if (client.release) client.release()
    }

    // Step 3: Restore user data
    await restoreUserData(backup)

    // Step 3.5: Create default map now that users exist
    await createDefaultMapIfNeeded()

    // Step 4: Verify migration
    writeOut('🔍 Verifying migration...')
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'maps', 'game_rooms', 'admin_roles', 'achievements')
      ORDER BY table_name
    `)

    writeOut(`📋 Core tables created: ${tables.rows.map((t) => t.table_name).join(', ')}`)

    if (tables.rows.length >= 5) {
      writeOut('✅ Migration completed successfully!')

      // Check restored data
      const userCount = await query('SELECT COUNT(*) as count FROM users')
      writeOut(`👤 Users in database: ${userCount.rows[0].count}`)

      writeOut('\n🎉 Consolidated migration deployment complete!')
      writeOut('💡 Next steps:')
      writeOut('   1. Test application functionality')
      writeOut('   2. Verify user login works')
      writeOut('   3. Check admin panel')
      writeOut('   4. Test profile pages')
    } else {
      throw new Error(`Expected at least 5 core tables, found ${tables.rows.length}`)
    }
  } catch (error) {
    writeErr(`❌ Migration deployment failed: ${formatError(error)}`)
    writeErr('\n🚨 Migration failed - check error details above')
    process.exit(1)
  }
}

// Run the deployment
deployMigration().catch((error) => {
  writeErr(`Fatal error: ${formatError(error)}`)
  process.exit(1)
})
