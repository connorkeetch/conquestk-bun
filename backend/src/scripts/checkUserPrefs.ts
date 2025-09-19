import { Pool } from 'pg'

const pool = new Pool({
  connectionString:
    'postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway',
  ssl: { rejectUnauthorized: false },
})

async function checkUserPreferences() {
  try {
    // Check columns in user_preferences table
    const prefColumns = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_preferences' 
      ORDER BY ordinal_position
    `)
    const columnNames = prefColumns.rows.map((column) => column.column_name)
    const hasTheme = columnNames.includes('theme')

    if (!hasTheme) {
      // Try to add the column
      try {
        await pool.query(`
          ALTER TABLE user_preferences 
          ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default'
        `)
        columnNames.push('theme')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`❌ Failed to add theme column: ${message}\n`)
      }
    }

    // Check a sample of user preferences
    const sample = await pool.query(`
      SELECT * FROM user_preferences LIMIT 1
    `)
    const sampleRow = sample.rows[0] ?? null

    const report = {
      columns: columnNames,
      hasTheme,
      sample: sampleRow,
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`❌ User preferences check failed: ${message}\n`)
  } finally {
    await pool.end()
  }
}

checkUserPreferences()
