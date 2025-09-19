#!/usr/bin/env node

/**
 * Deploy Consolidated Migration Script
 * Deploys the consolidated schema migration to production
 */

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const writeOut = (message = '') => {
  process.stdout.write(`${message}\n`)
}

const writeErr = (message = '') => {
  process.stderr.write(`${message}\n`)
}

// Get DATABASE_URL from environment
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  writeErr('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

const migrationFile = path.join(__dirname, '../migrations/010_consolidated_schema.sql')

if (!fs.existsSync(migrationFile)) {
  writeErr(`ERROR: Migration file not found: ${migrationFile}`)
  process.exit(1)
}

writeOut('🚀 Deploying consolidated migration to production...')
writeOut(`📁 Migration file: ${migrationFile}`)

try {
  // First, run the backup script
  writeOut('\n1️⃣ Creating backup of current data...')
  const backupScript = path.join(__dirname, 'backup-production.js')
  execSync(`node "${backupScript}"`, { stdio: 'inherit' })

  // Run the consolidated migration
  writeOut('\n2️⃣ Executing consolidated migration...')
  execSync(`psql "${DATABASE_URL}" -f "${migrationFile}"`, { stdio: 'inherit' })

  // Verify the migration by checking if key tables exist
  writeOut('\n3️⃣ Verifying migration success...')

  const verifyQuery = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('users', 'maps', 'game_rooms', 'admin_roles', 'achievements')
    ORDER BY table_name;
  `

  const result = execSync(`psql "${DATABASE_URL}" -t -c "${verifyQuery}"`, { encoding: 'utf8' })
  const tables = result
    .trim()
    .split('\n')
    .filter((line) => line.trim())

  writeOut(`📋 Created tables: ${tables.join(', ')}`)

  if (tables.length >= 5) {
    writeOut('✅ Migration completed successfully!')
    writeOut('🎯 All core tables created')

    // Check if any data was migrated
    writeOut('\n4️⃣ Checking migrated data...')
    const userCount = execSync(`psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM users;"`, {
      encoding: 'utf8',
    }).trim()
    writeOut(`👤 Users in database: ${userCount}`)

    if (parseInt(userCount, 10) > 0) {
      writeOut('✅ User data successfully migrated!')
    } else {
      writeOut('ℹ️  No user data found - this may be expected for clean install')
    }
  } else {
    throw new Error(`Expected at least 5 core tables, found ${tables.length}`)
  }

  writeOut('\n🎉 Consolidated migration deployment complete!')
  writeOut('💡 Next steps:')
  writeOut('   1. Test the application functionality')
  writeOut('   2. Verify user authentication works')
  writeOut('   3. Check admin panel functionality')
  writeOut('   4. Remove old migration files if everything works')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  writeErr(`❌ Migration deployment failed: ${message}`)
  writeErr('\n🚨 To rollback, restore from backup:')
  writeErr('   Check backup files in backend/backups/ directory')
  process.exit(1)
}
