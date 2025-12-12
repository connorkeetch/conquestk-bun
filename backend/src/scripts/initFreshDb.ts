/**
 * Initialize a fresh database with the baseline schema
 * Strips psql-specific commands and runs pure SQL
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import dotenv from 'dotenv'

// Load env
dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))

async function initFreshDb() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  console.log('Connecting to database...')
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  })

  try {
    // Read baseline migration
    const baselinePath = join(__dirname, '../../migrations/001_baseline_schema.sql')
    console.log(`Reading baseline from: ${baselinePath}`)
    let sql = readFileSync(baselinePath, 'utf8')

    // Drop any tables that were created by earlier migration attempts
    console.log('Dropping any previously created migration tables...')
    await pool.query('DROP TABLE IF EXISTS schema_migrations CASCADE')

    // Strip psql-specific commands and problematic statements
    sql = sql
      .split('\n')
      .filter(line => {
        const trimmed = line.trim().toUpperCase()
        // Skip psql commands
        if (trimmed.startsWith('\\')) return false
        // Skip DROP statements (we're starting fresh)
        if (trimmed.startsWith('DROP ')) return false
        // Skip ALTER ... DROP statements
        if (trimmed.includes(' DROP CONSTRAINT')) return false
        if (trimmed.includes(' DROP DEFAULT')) return false
        // Skip CREATE SCHEMA public (already exists) - may be quoted
        if (trimmed.includes('CREATE SCHEMA') && trimmed.includes('PUBLIC')) return false
        // Skip ALTER SCHEMA public OWNER
        if (trimmed.includes('ALTER SCHEMA') && trimmed.includes('PUBLIC')) return false
        return true
      })
      .join('\n')

    console.log('Running baseline schema (this may take a moment)...')

    // Run the SQL
    await pool.query(sql)

    console.log('✅ Baseline schema applied successfully!')

    // Verify tables were created
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)

    console.log(`\n📊 Created ${result.rows.length} tables:`)
    for (const row of result.rows) {
      console.log(`  - ${row.table_name}`)
    }

  } catch (error) {
    console.error('❌ Failed to apply baseline:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

initFreshDb()
