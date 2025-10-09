import bcrypt from 'bcryptjs';
import { initDatabase, query } from '../config/database.js';
import { logger } from '../utils/logger.js';
const TEST_USERS = [
    {
        username: 'testuser1',
        email: 'test1@example.com',
        password: 'password123',
        description: 'Test User 1 - Basic user for testing',
    },
    {
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'password123',
        description: 'Test User 2 - Another test user',
    },
    {
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        description: 'Admin User - For testing admin features',
    },
    {
        username: 'player1',
        email: 'player1@example.com',
        password: 'player123',
        description: 'Player 1 - For multiplayer testing',
    },
    {
        username: 'player2',
        email: 'player2@example.com',
        password: 'player123',
        description: 'Player 2 - For multiplayer testing',
    },
];
async function seedUsers() {
    try {
        logger.info('🌱 Starting user seeding...');
        await initDatabase();
        const existingUsers = await query('SELECT username, email FROM users');
        const existingEmails = new Set(existingUsers.rows.map((user) => user.email));
        const existingUsernames = new Set(existingUsers.rows.map((user) => user.username));
        logger.info(`📊 Found ${existingUsers.rows.length} existing users`);
        let created = 0;
        let skipped = 0;
        for (const user of TEST_USERS) {
            if (existingEmails.has(user.email) || existingUsernames.has(user.username)) {
                logger.info(`⏭️  Skipping ${user.username} - already exists`);
                skipped++;
                continue;
            }
            const hashedPassword = await bcrypt.hash(user.password, 10);
            await query(`INSERT INTO users (username, email, password_hash) 
         VALUES ($1, $2, $3)`, [user.username, user.email, hashedPassword]);
            logger.info(`✅ Created user: ${user.username} (${user.description})`);
            created++;
        }
        logger.info(`
🎉 Seeding complete!
   - Created: ${created} users
   - Skipped: ${skipped} users (already existed)
   
📝 Test User Credentials:
${TEST_USERS.map((u) => `   - ${u.username} / ${u.password} (${u.email})`).join('\n')}
    `);
        process.exit(0);
    }
    catch (error) {
        logger.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    seedUsers();
}
export { seedUsers };
//# sourceMappingURL=seedUsers.js.map