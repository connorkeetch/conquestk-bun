import fs from 'node:fs/promises'
import path from 'node:path'
import { query } from '../config/database'

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../../migrations')

  try {
    // Create migrations tracking table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Get list of migration files
    const files = await fs.readdir(migrationsDir)
    const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort()

    // Get executed migrations
    const executed = await query('SELECT filename FROM migrations')
    const executedFiles = new Set(executed.rows.map((r: any) => r.filename))

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
          } catch (err: any) {
            // SQLite doesn't support IF NOT EXISTS for ALTER TABLE
            // Skip errors about duplicate columns
            if (
              err.message?.includes('duplicate column') ||
              (err.message?.includes('syntax error') && statement.includes('IF NOT EXISTS'))
            ) {
            } else {
              throw err
            }
          }
        }

        // Record migration as executed
        await query('INSERT INTO migrations (filename) VALUES (?)', [file])
      }
    }
  } catch (_error) {
    process.exit(1)
  }
}

// Run migrations if called directly
if (require.main === module) {
  runMigrations().then(() => process.exit(0))
}

export default runMigrations
