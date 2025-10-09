import dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
// Keep quiet to avoid noisy logs in production
dotenv.config({ quiet: true })

import { initDatabase } from '../config/database.js'
import { MigrationRunner } from '../utils/migrationRunner.js'
import { MigrationTracker } from '../utils/migrationTracker.js'

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
