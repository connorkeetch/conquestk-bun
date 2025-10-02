import dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
dotenv.config()

import { initDatabase } from '../config/database'
import { MigrationRunner } from '../utils/migrationRunner'
import { MigrationTracker } from '../utils/migrationTracker'

async function runMigration() {
  try {
    await initDatabase()

    // Create migration tracker and runner
    const migrationTracker = new MigrationTracker()
    const migrationRunner = new MigrationRunner(migrationTracker)

    // Run all pending migrations
    await migrationRunner.runPendingMigrations()
    process.exit(0)
  } catch (_error) {
    process.exit(1)
  }
}

// Run migration
runMigration()
