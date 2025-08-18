// Simple database connection test script
require('dotenv').config();

const { Pool } = require('pg');

async function testConnection() {
  console.log('🔧 Testing Database Connection...');
  console.log('Environment Variables:');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  console.log('- DB_TYPE:', process.env.DB_TYPE);
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT_SET');
  console.log('- DB_HOST:', process.env.DB_HOST || 'NOT_SET');
  console.log('- DB_NAME:', process.env.DB_NAME || 'NOT_SET');
  console.log('');

  if (process.env.DB_TYPE === 'sqlite') {
    console.log('✅ Using SQLite - skipping PostgreSQL test');
    return;
  }

  try {
    let pool;
    
    if (process.env.DATABASE_URL) {
      console.log('🔗 Using DATABASE_URL connection string');
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });
    } else {
      console.log('🔗 Using individual connection parameters');
      pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'risk_game',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
      });
    }

    // Test connection
    const client = await pool.connect();
    console.log('✅ PostgreSQL connection successful');

    // Test query
    const result = await client.query('SELECT NOW()');
    console.log('✅ Test query successful:', result.rows[0]);

    // Check if tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('📋 Existing tables:', tablesResult.rows.map(r => r.table_name));

    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Error details:', error);
  }
}

testConnection().catch(console.error);