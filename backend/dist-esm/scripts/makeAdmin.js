"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
async function makeUserAdmin(email) {
    try {
        logger_js_1.logger.info(`🔑 Making user admin: ${email}`);
        await (0, database_js_1.initDatabase)();
        const userResult = await (0, database_js_1.query)('SELECT id, username, email FROM users WHERE email = $1', [
            email,
        ]);
        if (userResult.rows.length === 0) {
            logger_js_1.logger.error(`❌ User not found with email: ${email}`);
            process.exit(1);
        }
        const user = userResult.rows[0];
        logger_js_1.logger.info(`✅ Found user: ${user.username} (${user.id})`);
        const roleResult = await (0, database_js_1.query)("SELECT id FROM admin_roles WHERE name = 'super_admin'");
        let roleId;
        if (roleResult.rows.length === 0) {
            logger_js_1.logger.info('📝 Creating super_admin role...');
            const createRoleResult = await (0, database_js_1.query)(`INSERT INTO admin_roles (name, description, permissions, is_super_admin) 
         VALUES ('super_admin', 'Full system access', '["*"]', true) 
         RETURNING id`);
            roleId = createRoleResult.rows[0].id;
        }
        else {
            roleId = roleResult.rows[0].id;
        }
        const existingRoleResult = await (0, database_js_1.query)('SELECT id FROM user_admin_roles WHERE user_id = $1 AND role_id = $2', [user.id, roleId]);
        if (existingRoleResult.rows.length > 0) {
            logger_js_1.logger.info('⚠️  User already has super_admin role');
            await (0, database_js_1.query)('UPDATE user_admin_roles SET is_active = true WHERE user_id = $1 AND role_id = $2', [user.id, roleId]);
            logger_js_1.logger.info('✅ Ensured admin role is active');
        }
        else {
            await (0, database_js_1.query)(`INSERT INTO user_admin_roles (user_id, role_id, assigned_by, is_active) 
         VALUES ($1, $2, $1, true)`, [user.id, roleId]);
            logger_js_1.logger.info('✅ Assigned super_admin role to user');
        }
        const statusResult = await (0, database_js_1.query)('SELECT id FROM user_account_status WHERE user_id = $1', [
            user.id,
        ]);
        if (statusResult.rows.length === 0) {
            await (0, database_js_1.query)(`INSERT INTO user_account_status (user_id, status) 
         VALUES ($1, 'active')`, [user.id]);
            logger_js_1.logger.info('✅ Created active account status');
        }
        else {
            await (0, database_js_1.query)(`UPDATE user_account_status 
         SET status = 'active', expires_at = NULL 
         WHERE user_id = $1`, [user.id]);
            logger_js_1.logger.info('✅ Updated account status to active');
        }
        logger_js_1.logger.info(`
🎉 Success! User ${user.username} (${email}) is now a super admin!

You can now access the admin panel at:
- Local: http://localhost:5173/admin
- Production: https://conquestk.com/admin

Admin capabilities include:
- User management (view, ban, suspend users)
- Game management (pause, resume, end games)
- Content moderation (approve/reject maps)
- System administration (feature flags, metrics)
- View admin activity logs
    `);
        process.exit(0);
    }
    catch (error) {
        logger_js_1.logger.error('❌ Failed to make user admin:', error);
        process.exit(1);
    }
}
const email = process.argv[2];
if (!email) {
    process.exit(1);
}
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
    process.exit(1);
}
makeUserAdmin(email);
//# sourceMappingURL=makeAdmin.js.map