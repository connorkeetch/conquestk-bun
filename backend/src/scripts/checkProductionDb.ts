import { Pool } from 'pg'

const pool = new Pool({
  connectionString: 'postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway',
  ssl: { rejectUnauthorized: false }
})

async function checkDatabase() {
  try {
    console.log('🔗 Connecting to production database...')
    
    // List all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    
    console.log('\n📋 Tables in database:')
    for (const row of tablesResult.rows) {
      console.log(`  - ${row.table_name}`)
    }
    
    // Check if specific tables exist
    const criticalTables = ['users', 'maps', 'user_preferences', 'user_account_status']
    console.log('\n🔍 Checking critical tables:')
    
    for (const tableName of criticalTables) {
      const exists = tablesResult.rows.some(r => r.table_name === tableName)
      console.log(`  - ${tableName}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`)
    }
    
    // Check columns in users table
    const userColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `)
    
    console.log('\n📊 Columns in users table:')
    for (const col of userColumns.rows) {
      console.log(`  - ${col.column_name} (${col.data_type})`)
    }
    
    // Check columns in user_preferences table
    const prefColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_preferences' 
      ORDER BY ordinal_position
    `)
    
    console.log('\n📊 Columns in user_preferences table:')
    for (const col of prefColumns.rows) {
      console.log(`  - ${col.column_name} (${col.data_type})`)
    }
    
    // Check if maps table has status column
    const mapColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'maps' 
      ORDER BY ordinal_position
    `)
    
    console.log('\n📊 Columns in maps table:')
    for (const col of mapColumns.rows) {
      console.log(`  - ${col.column_name} (${col.data_type})`)
    }
    
    const hasStatus = mapColumns.rows.some(c => c.column_name === 'status')
    const hasTheme = userColumns.rows.some(c => c.column_name === 'theme')
    
    console.log('\n⚠️  Critical column checks:')
    console.log(`  - maps.status: ${hasStatus ? '✅ EXISTS' : '❌ MISSING'}`)
    console.log(`  - users.theme: ${hasTheme ? '✅ EXISTS' : '❌ MISSING (should be in user_preferences)'}`)
    
    // Check migration_history
    const migrationsResult = await pool.query(`
      SELECT name, executed_at 
      FROM migration_history 
      ORDER BY executed_at DESC 
      LIMIT 10
    `).catch(() => null)
    
    if (migrationsResult) {
      console.log('\n🔄 Recent migrations:')
      for (const row of migrationsResult.rows) {
        console.log(`  - ${row.name} (${new Date(row.executed_at).toLocaleString()})`)
      }
    } else {
      console.log('\n❌ migration_history table not found!')
    }
    
  } catch (error) {
    console.error('❌ Database error:', error)
  } finally {
    await pool.end()
  }
}

checkDatabase()