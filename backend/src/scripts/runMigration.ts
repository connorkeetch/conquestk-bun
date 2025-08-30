import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function runMigration() {
  // Use command line argument or environment variable
  const databaseUrl = process.argv[2] || process.env.DATABASE_URL
  
  if (!databaseUrl || databaseUrl === '${DATABASE_URL}') {
    console.error('❌ No DATABASE_URL provided')
    console.log('\nUsage:')
    console.log('  npm run migrate -- "postgresql://user:pass@host:port/db"')
    console.log('  OR')
    console.log('  Set DATABASE_URL environment variable')
    process.exit(1)
  }
  
  console.log('🔗 Connecting to database...')
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : false
  })

  try {
    console.log('🚀 Running database migration...')
    console.log('📍 Database:', databaseUrl?.split('@')[1]?.split('/')[0])
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '../../migrations/postgres/002_add_missing_tables.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('📄 Running migration: 002_add_missing_tables.sql')
    
    // Execute the migration
    await pool.query(migrationSQL)
    
    console.log('✅ Migration completed successfully!')
    
    // Verify the tables were created
    const tableCheckQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('map_usage_stats', 'map_ratings', 'map_comments', 'map_downloads', 'map_favorites')
      ORDER BY table_name;
    `
    
    const result = await pool.query(tableCheckQuery)
    console.log('\n📊 Verified tables:')
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`)
    })
    
    // Check if columns were added to users table
    const columnCheckQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('skill_rating', 'email_verified', 'email_verification_token', 'password_reset_token')
      ORDER BY column_name;
    `
    
    const columnResult = await pool.query(columnCheckQuery)
    console.log('\n📋 Verified user columns:')
    columnResult.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name}`)
    })
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run the migration
runMigration().catch(console.error)