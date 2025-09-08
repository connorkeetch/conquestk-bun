#!/usr/bin/env node

/**
 * Deploy Consolidated Migration Script
 * Deploys the consolidated schema migration to production
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// Get DATABASE_URL from environment
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

const migrationFile = path.join(__dirname, '../migrations/010_consolidated_schema.sql')

if (!fs.existsSync(migrationFile)) {
  console.error(`ERROR: Migration file not found: ${migrationFile}`)
  process.exit(1)
}

console.log('🚀 Deploying consolidated migration to production...')
console.log(`📁 Migration file: ${migrationFile}`)

try {
  // First, run the backup script
  console.log('\n1️⃣ Creating backup of current data...')
  const backupScript = path.join(__dirname, 'backup-production.js')
  execSync(`node "${backupScript}"`, { stdio: 'inherit' })

  // Run the consolidated migration
  console.log('\n2️⃣ Executing consolidated migration...')
  execSync(`psql "${DATABASE_URL}" -f "${migrationFile}"`, { stdio: 'inherit' })

  // Verify the migration by checking if key tables exist
  console.log('\n3️⃣ Verifying migration success...')

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

  console.log('📋 Created tables:', tables.join(', '))

  if (tables.length >= 5) {
    console.log('✅ Migration completed successfully!')
    console.log('🎯 All core tables created')

    // Check if any data was migrated
    console.log('\n4️⃣ Checking migrated data...')
    const userCount = execSync(`psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM users;"`, {
      encoding: 'utf8',
    }).trim()
    console.log(`👤 Users in database: ${userCount}`)

    if (parseInt(userCount) > 0) {
      console.log('✅ User data successfully migrated!')
    } else {
      console.log('ℹ️  No user data found - this may be expected for clean install')
    }
  } else {
    throw new Error(`Expected at least 5 core tables, found ${tables.length}`)
  }

  console.log('\n🎉 Consolidated migration deployment complete!')
  console.log('💡 Next steps:')
  console.log('   1. Test the application functionality')
  console.log('   2. Verify user authentication works')
  console.log('   3. Check admin panel functionality')
  console.log('   4. Remove old migration files if everything works')
} catch (error) {
  console.error('❌ Migration deployment failed:', error.message)
  console.error('\n🚨 To rollback, restore from backup:')
  console.error('   Check backup files in backend/backups/ directory')
  process.exit(1)
}
