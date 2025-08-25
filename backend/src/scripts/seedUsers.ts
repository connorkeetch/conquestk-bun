import { query, initDatabase } from '../config/database';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

// Test users to seed
const TEST_USERS = [
  {
    username: 'testuser1',
    email: 'test1@example.com',
    password: 'password123',
    description: 'Test User 1 - Basic user for testing'
  },
  {
    username: 'testuser2', 
    email: 'test2@example.com',
    password: 'password123',
    description: 'Test User 2 - Another test user'
  },
  {
    username: 'admin',
    email: 'admin@example.com', 
    password: 'admin123',
    description: 'Admin User - For testing admin features'
  },
  {
    username: 'player1',
    email: 'player1@example.com',
    password: 'player123',
    description: 'Player 1 - For multiplayer testing'
  },
  {
    username: 'player2',
    email: 'player2@example.com',
    password: 'player123',
    description: 'Player 2 - For multiplayer testing'
  }
];

async function seedUsers() {
  try {
    logger.info('🌱 Starting user seeding...');
    
    // Initialize database
    await initDatabase();
    
    // Check current users
    const existingUsers = await query('SELECT username, email FROM users');
    const existingEmails = new Set(existingUsers.rows.map((u: any) => u.email));
    const existingUsernames = new Set(existingUsers.rows.map((u: any) => u.username));
    
    logger.info(`📊 Found ${existingUsers.rows.length} existing users`);
    
    let created = 0;
    let skipped = 0;
    
    for (const user of TEST_USERS) {
      // Skip if user already exists
      if (existingEmails.has(user.email) || existingUsernames.has(user.username)) {
        logger.info(`⏭️  Skipping ${user.username} - already exists`);
        skipped++;
        continue;
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      // Insert user
      const isPostgres = process.env.DB_TYPE !== 'sqlite';
      
      if (isPostgres) {
        await query(
          `INSERT INTO users (username, email, password) 
           VALUES ($1, $2, $3)`,
          [user.username, user.email, hashedPassword]
        );
      } else {
        await query(
          `INSERT INTO users (username, email, password) 
           VALUES (?, ?, ?)`,
          [user.username, user.email, hashedPassword]
        );
      }
      
      logger.info(`✅ Created user: ${user.username} (${user.description})`);
      created++;
    }
    
    logger.info(`
🎉 Seeding complete!
   - Created: ${created} users
   - Skipped: ${skipped} users (already existed)
   
📝 Test User Credentials:
${TEST_USERS.map(u => `   - ${u.username} / ${u.password} (${u.email})`).join('\n')}
    `);
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedUsers();
}

export { seedUsers };