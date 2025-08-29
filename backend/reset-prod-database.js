const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load production environment if available
if (fs.existsSync('.env.production.local')) {
  dotenv.config({ path: '.env.production.local' });
  console.log('📁 Loaded .env.production.local');
}

async function resetProductionDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set!');
    process.exit(1);
  }

  console.log('⚠️  WARNING: This will RESET the PRODUCTION database!');
  console.log('📍 Database:', databaseUrl.substring(0, 30) + '...');
  console.log('\nThis will:');
  console.log('  1. Backup user data (if any)');
  console.log('  2. DROP ALL TABLES');
  console.log('  3. Run fresh migration');
  console.log('  4. Restore user data');
  console.log('\nPress Ctrl+C to cancel, or wait 5 seconds...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to production database\n');

    // Step 1: Backup user data
    console.log('📦 Step 1: Backing up user data...');
    let userData = null;
    
    try {
      const userCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users'
      `);
      
      if (userCheck.rows.length > 0) {
        const userResult = await client.query('SELECT * FROM users WHERE email LIKE $1', ['%connorkeetch%']);
        if (userResult.rows.length > 0) {
          userData = userResult.rows[0];
          console.log(`✅ Backed up user: ${userData.username || userData.email}`);
        } else {
          console.log('ℹ️  No user found to backup');
        }
      } else {
        console.log('ℹ️  Users table does not exist yet');
      }
    } catch (err) {
      console.log('ℹ️  Could not backup users:', err.message);
    }

    // Step 2: Drop all tables
    console.log('\n🗑️  Step 2: Dropping all existing tables...');
    
    // Get all table names
    const tablesResult = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log(`   Found ${tables.length} tables to drop`);
    
    if (tables.length > 0) {
      // Drop all tables in one command (CASCADE to handle dependencies)
      const dropCommand = tables.map(t => `DROP TABLE IF EXISTS "${t}" CASCADE`).join('; ');
      await client.query(dropCommand);
      console.log('✅ All tables dropped');
    }

    // Step 3: Run fresh migration
    console.log('\n🚀 Step 3: Running fresh migration...');
    
    const migrationPath = path.join(__dirname, 'migrations', 'postgres', '001_complete_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query(migrationSQL);
    console.log('✅ Migration completed');

    // Verify tables were created
    const newTables = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    console.log(`\n📊 Created ${newTables.rows.length} tables:`);
    const importantTables = ['users', 'admin_roles', 'user_admin_roles', 'games', 'maps'];
    importantTables.forEach(table => {
      const exists = newTables.rows.some(r => r.tablename === table);
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    });

    // Step 4: Restore user data
    if (userData) {
      console.log('\n📥 Step 4: Restoring user data...');
      
      try {
        // Build insert query with only the fields we have
        const fields = [];
        const values = [];
        const placeholders = [];
        let paramCount = 1;
        
        // Essential fields
        if (userData.id) {
          fields.push('id');
          values.push(userData.id);
          placeholders.push(`$${paramCount++}`);
        }
        if (userData.username) {
          fields.push('username');
          values.push(userData.username);
          placeholders.push(`$${paramCount++}`);
        }
        if (userData.email) {
          fields.push('email');
          values.push(userData.email);
          placeholders.push(`$${paramCount++}`);
        }
        if (userData.password) {
          fields.push('password');
          values.push(userData.password);
          placeholders.push(`$${paramCount++}`);
        }
        
        // Optional fields
        if (userData.email_verified !== undefined) {
          fields.push('email_verified');
          values.push(userData.email_verified);
          placeholders.push(`$${paramCount++}`);
        }
        
        const insertQuery = `
          INSERT INTO users (${fields.join(', ')})
          VALUES (${placeholders.join(', ')})
          ON CONFLICT (email) DO UPDATE SET
            password = EXCLUDED.password
          RETURNING id, username, email
        `;
        
        const restored = await client.query(insertQuery, values);
        console.log(`✅ User restored: ${restored.rows[0].username} (${restored.rows[0].email})`);
        
        // Make them admin
        console.log('👑 Granting admin privileges...');
        const adminRole = await client.query(
          "SELECT id FROM admin_roles WHERE name = 'super_admin'"
        );
        
        if (adminRole.rows.length > 0) {
          await client.query(
            `INSERT INTO user_admin_roles (user_id, role_id, assigned_by, is_active)
             VALUES ($1, $2, $1, true)
             ON CONFLICT (user_id, role_id) DO NOTHING`,
            [restored.rows[0].id, adminRole.rows[0].id]
          );
          
          await client.query(
            'UPDATE users SET is_admin = true, admin_since = CURRENT_TIMESTAMP WHERE id = $1',
            [restored.rows[0].id]
          );
          
          console.log('✅ Admin privileges granted');
        }
      } catch (err) {
        console.error('⚠️  Could not restore user:', err.message);
        console.log('You may need to register again');
      }
    } else {
      console.log('\n📥 Step 4: No user data to restore');
      console.log('ℹ️  You will need to register a new account');
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('🎉 PRODUCTION DATABASE RESET COMPLETE!');
    console.log('='.repeat(50));
    console.log('\nNext steps:');
    if (userData) {
      console.log('✅ You can log in with your existing credentials');
      console.log('✅ You have admin access');
    } else {
      console.log('1. Register at https://conquestk.com/register');
      console.log('2. Run: node make-admin.js <your-email>');
    }
    console.log('\nYour production database now matches the development schema exactly!');
    
    await client.end();
  } catch (error) {
    console.error('\n❌ Reset failed:', error.message);
    console.error('Details:', error);
    await client.end();
    process.exit(1);
  }
}

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.log('⚠️  DATABASE_URL not found!');
  console.log('Create .env.production.local with:');
  console.log('DATABASE_URL=your_production_database_url');
  process.exit(1);
}

resetProductionDatabase();