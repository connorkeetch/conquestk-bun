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

    console.log('📊 Columns in user_preferences table:')
    for (const col of prefColumns.rows) {
      console.log(
        `  - ${col.column_name} (${col.data_type}) default: ${col.column_default || 'none'}`,
      )
    }

    const hasTheme = prefColumns.rows.some((c) => c.column_name === 'theme')
    console.log(`\n⚠️  Theme column: ${hasTheme ? '✅ EXISTS' : '❌ MISSING'}`)

    if (!hasTheme) {
      console.log('\n🔧 Migration 004 needs to run to add theme column!')
      console.log('Checking if migration 004 can be applied...')

      // Try to add the column
      try {
        await pool.query(`
          ALTER TABLE user_preferences 
          ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default'
        `)
        console.log('✅ Theme column added successfully!')
      } catch (err: unknown) {
        console.log('❌ Failed to add theme column:', err.message)
      }
    }

    // Check a sample of user preferences
    const sample = await pool.query(`
      SELECT * FROM user_preferences LIMIT 1
    `)

    if (sample.rows.length > 0) {
      console.log('\n📋 Sample user_preferences row:')
      console.log(JSON.stringify(sample.rows[0], null, 2))
    }
  } catch (error) {
    console.error('❌ Database error:', error)
  } finally {
    await pool.end()
  }
}

checkUserPreferences()
