const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load production environment if available
if (fs.existsSync('.env.production.local')) {
  dotenv.config({ path: '.env.production.local' });
  console.log('📁 Loaded .env.production.local');
}

// IMPORTANT: This script runs migrations on PRODUCTION database
// Make sure you have the production DATABASE_URL set

async function runProductionMigration() {
  // Check for production database URL
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    console.error('Please set the production DATABASE_URL from Railway');
    process.exit(1);
  }

  // Safety check - confirm this is intentional
  console.log('⚠️  WARNING: This will run migrations on the PRODUCTION database!');
  console.log('📍 Database URL starts with:', databaseUrl.substring(0, 30) + '...');
  console.log('');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // Required for Railway PostgreSQL
    }
  });

  try {
    console.log('🔌 Connecting to production PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    // Check existing tables
    const existingTables = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    console.log(`\n📊 Found ${existingTables.rows.length} existing tables:`);
    existingTables.rows.forEach(row => console.log(`  - ${row.tablename}`));
    
    // Choose migration based on existing tables
    let migrationFile = '001_complete_schema.sql';
    if (existingTables.rows.length > 0) {
      // Production already has tables, use update migration
      migrationFile = '002_production_update.sql';
      console.log('📌 Detected existing tables, using update migration');
    }
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'postgres', migrationFile);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log(`\n🚀 Running migration: ${migrationFile}`);
    console.log('📝 This will create/update all necessary tables...');
    
    // Run migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // List tables after migration
    const tablesAfter = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    console.log(`\n📊 After migration - ${tablesAfter.rows.length} tables:`);
    tablesAfter.rows.forEach(row => console.log(`  ✅ ${row.tablename}`));
    
    // Check if admin roles were created
    const adminRoles = await client.query('SELECT name FROM admin_roles');
    console.log(`\n👥 Admin roles created: ${adminRoles.rows.length}`);
    adminRoles.rows.forEach(row => console.log(`  - ${row.name}`));
    
    await client.end();
    console.log('\n🎉 Production database migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Details:', error);
    await client.end();
    process.exit(1);
  }
}

// Check if we have production DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.log(`
⚠️  Production DATABASE_URL not found in environment!

To run this migration, you need to:

1. Get the production DATABASE_URL from Railway:
   - Go to your Railway project
   - Click on the PostgreSQL service
   - Go to "Variables" tab
   - Copy the DATABASE_URL value

2. Set it as an environment variable:
   - Windows: set DATABASE_URL=postgresql://...
   - Mac/Linux: export DATABASE_URL=postgresql://...

3. Run this script again:
   node run-prod-migration.js

Alternatively, create a .env.production.local file with:
DATABASE_URL=your_production_database_url
  `);
  process.exit(1);
}

runProductionMigration();