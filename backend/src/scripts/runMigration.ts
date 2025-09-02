import dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
dotenv.config()

import { initDatabase } from '../config/database'
import { MigrationRunner } from '../utils/migrationRunner'
import { MigrationTracker } from '../utils/migrationTracker'
import { logger } from '../utils/logger'

async function runMigration() {
  try {
    console.log('🔗 Initializing database connection...')
    await initDatabase()
    
    console.log('🚀 Starting migration system...')
    
    // Create migration tracker and runner
    const migrationTracker = new MigrationTracker()
    const migrationRunner = new MigrationRunner(migrationTracker)
    
    // Run all pending migrations
    await migrationRunner.runPendingMigrations()
    
    console.log('✅ All migrations completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
runMigration()