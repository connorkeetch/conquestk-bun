import { Pool } from 'pg'

const pool = new Pool({
  connectionString:
    'postgresql://USER:PASSWORD@HOST:PORT/DATABASE',
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
    for (const _col of prefColumns.rows) {
    }

    const hasTheme = prefColumns.rows.some((c) => c.column_name === 'theme')

    if (!hasTheme) {
      // Try to add the column
      try {
        await pool.query(`
          ALTER TABLE user_preferences 
          ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default'
        `)
      } catch (_err: any) {}
    }

    // Check a sample of user preferences
    const sample = await pool.query(`
      SELECT * FROM user_preferences LIMIT 1
    `)

    if (sample.rows.length > 0) {
    }
  } catch (_error) {
  } finally {
    await pool.end()
  }
}

checkUserPreferences()
