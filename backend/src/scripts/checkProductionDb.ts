import { Pool } from 'pg'

const pool = new Pool({
  connectionString:
    'postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway',
  ssl: { rejectUnauthorized: false },
})

async function checkDatabase() {
  try {
    // List all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    for (const _row of tablesResult.rows) {
    }

    // Check if specific tables exist
    const criticalTables = ['users', 'maps', 'user_preferences', 'user_account_status']

    for (const tableName of criticalTables) {
      const _exists = tablesResult.rows.some((r) => r.table_name === tableName)
    }

    // Check columns in users table
    const userColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `)
    for (const _col of userColumns.rows) {
    }

    // Check columns in user_preferences table
    const prefColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_preferences' 
      ORDER BY ordinal_position
    `)
    for (const _col of prefColumns.rows) {
    }

    // Check if maps table has status column
    const mapColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'maps' 
      ORDER BY ordinal_position
    `)
    for (const _col of mapColumns.rows) {
    }

    const _hasStatus = mapColumns.rows.some((c) => c.column_name === 'status')
    const _hasTheme = userColumns.rows.some((c) => c.column_name === 'theme')

    // Check migration_history
    const migrationsResult = await pool
      .query(`
      SELECT name, executed_at 
      FROM migration_history 
      ORDER BY executed_at DESC 
      LIMIT 10
    `)
      .catch(() => null)

    if (migrationsResult) {
      for (const _row of migrationsResult.rows) {
      }
    } else {
    }
  } catch (_error) {
  } finally {
    await pool.end()
  }
}

checkDatabase()
