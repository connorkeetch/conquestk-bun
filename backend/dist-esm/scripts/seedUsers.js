"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedUsers = seedUsers;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
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
        logger_js_1.logger.info('🌱 Starting user seeding...');
        await (0, database_js_1.initDatabase)();
        const existingUsers = await (0, database_js_1.query)('SELECT username, email FROM users');
        const existingEmails = new Set(existingUsers.rows.map((user) => user.email));
        const existingUsernames = new Set(existingUsers.rows.map((user) => user.username));
        logger_js_1.logger.info(`📊 Found ${existingUsers.rows.length} existing users`);
        let created = 0;
        let skipped = 0;
        for (const user of TEST_USERS) {
            if (existingEmails.has(user.email) || existingUsernames.has(user.username)) {
                logger_js_1.logger.info(`⏭️  Skipping ${user.username} - already exists`);
                skipped++;
                continue;
            }
            const hashedPassword = await bcryptjs_1.default.hash(user.password, 10);
            await (0, database_js_1.query)(`INSERT INTO users (username, email, password_hash) 
         VALUES ($1, $2, $3)`, [user.username, user.email, hashedPassword]);
            logger_js_1.logger.info(`✅ Created user: ${user.username} (${user.description})`);
            created++;
        }
        logger_js_1.logger.info(`
🎉 Seeding complete!
   - Created: ${created} users
   - Skipped: ${skipped} users (already existed)
   
📝 Test User Credentials:
${TEST_USERS.map((u) => `   - ${u.username} / ${u.password} (${u.email})`).join('\n')}
    `);
        process.exit(0);
    }
    catch (error) {
        logger_js_1.logger.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    seedUsers();
}
//# sourceMappingURL=seedUsers.js.map