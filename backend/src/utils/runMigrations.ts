import fs from 'node:fs/promises'
import path, { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

import { query } from '../config/database.js'

async function runMigrations() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  const migrationsDir = path.join(__dirname, '../../migrations')

  try {
    // Create migrations tracking table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Get list of migration files
    const files = await fs.readdir(migrationsDir)
    const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort()

    // Get executed migrations
    const executed = await query('SELECT filename FROM migrations')
    const executedFiles = new Set(executed.rows.map((r) => r.filename))

    // Run pending migrations
    for (const file of sqlFiles) {
      if (!executedFiles.has(file)) {
        const sqlContent = await fs.readFile(path.join(migrationsDir, file), 'utf-8')

        // Split by semicolon and execute each statement
        const statements = sqlContent
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

        for (const statement of statements) {
          try {
            await query(statement)
          } catch (error) {
            if (error instanceof Error) {
              const message = error.message ?? ''
              const isIgnorable =
                message.includes('duplicate column') ||
                message.includes('already exists') ||
                (message.includes('syntax error') && statement.includes('IF NOT EXISTS'))

              if (isIgnorable) {
                continue
              }
            }

            throw error
          }
        }

        // Record migration as executed
        await query('INSERT INTO migrations (filename) VALUES ($1)', [file])
      }
    }
  } catch (_error) {
    process.exit(1)
  }
}

// Run migrations if called directly
try {
  const entryUrl = pathToFileURL(process.argv[1]).href
  if (import.meta.url === entryUrl) {
    runMigrations().then(() => process.exit(0))
  }
} catch {
  // ignore if argv[1] is unavailable
}

export default runMigrations
