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
    const tableNames = tablesResult.rows.map((row) => row.table_name)

    // Check if specific tables exist
    const criticalTables = ['users', 'maps', 'user_preferences', 'user_account_status']
    const missingTables = criticalTables.filter((tableName) => !tableNames.includes(tableName))

    // Check columns in users table
    const userColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `)
    const userColumnNames = userColumns.rows.map((column) => column.column_name)

    // Check columns in user_preferences table
    const prefColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_preferences' 
      ORDER BY ordinal_position
    `)
    const prefColumnNames = prefColumns.rows.map((column) => column.column_name)

    // Check if maps table has status column
    const mapColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'maps' 
      ORDER BY ordinal_position
    `)
    const mapColumnNames = mapColumns.rows.map((column) => column.column_name)
    const hasStatusColumn = mapColumnNames.includes('status')
    const hasThemeColumn = userColumnNames.includes('theme')

    // Check migration_history
    const migrationsResult = await pool
      .query(`
      SELECT name, executed_at 
      FROM migration_history 
      ORDER BY executed_at DESC 
      LIMIT 10
    `)
      .catch(() => null)
    const recentMigrations =
      migrationsResult?.rows.map((row) => ({
        name: row.name,
        executedAt: row.executed_at,
      })) ?? []

    const report = {
      tables: tableNames,
      missingTables,
      userColumns: userColumnNames,
      userPreferencesColumns: prefColumnNames,
      mapColumns: mapColumnNames,
      hasStatusColumn,
      hasThemeColumn,
      recentMigrations,
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`❌ Database check failed: ${message}\n`)
  } finally {
    await pool.end()
  }
}

checkDatabase()
