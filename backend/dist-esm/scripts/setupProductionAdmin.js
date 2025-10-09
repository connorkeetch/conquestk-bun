"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_js_1 = require("../config/database.js");
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const logger_js_1 = require("../utils/logger.js");
async function setupProductionAdmin(email) {
    try {
        logger_js_1.logger.info(`🚀 Setting up production admin for: ${email}`);
        await (0, database_js_1.initDatabase)();
        const userResult = await (0, database_js_1.query)('SELECT id, username, email FROM users WHERE email = $1', [
            email,
        ]);
        if (userResult.rows.length === 0) {
            logger_js_1.logger.error(`❌ User not found with email: ${email}`);
            logger_js_1.logger.error('User must register first before becoming admin');
            process.exit(1);
        }
        const user = userResult.rows[0];
        logger_js_1.logger.info(`✅ Found user: ${user.username} (${user.id})`);
        logger_js_1.logger.info('🔧 Ensuring super_admin role exists...');
        const existingRoleResult = await (0, database_js_1.query)("SELECT id FROM admin_roles WHERE name = 'super_admin'");
        let roleId;
        if (existingRoleResult.rows.length === 0) {
            const createRoleResult = await (0, database_js_1.query)(`
        INSERT INTO admin_roles (name, description, permissions, is_super_admin, created_at, updated_at) 
        VALUES ('super_admin', 'Full system access', $1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
        RETURNING id
      `, [JSON.stringify(['*'])]);
            roleId = createRoleResult.rows[0].id;
            logger_js_1.logger.info('✅ Created super_admin role');
        }
        else {
            roleId = existingRoleResult.rows[0].id;
            logger_js_1.logger.info('✅ super_admin role already exists');
        }
        const existingUserRoleResult = await (0, database_js_1.query)('SELECT id FROM user_admin_roles WHERE user_id = $1 AND role_id = $2', [user.id, roleId]);
        if (existingUserRoleResult.rows.length > 0) {
            await (0, database_js_1.query)('UPDATE user_admin_roles SET is_active = true, expires_at = NULL WHERE user_id = $1 AND role_id = $2', [user.id, roleId]);
            logger_js_1.logger.info('✅ Updated existing admin role to active');
        }
        else {
            await (0, database_js_1.query)(`
        INSERT INTO user_admin_roles (user_id, role_id, assigned_by, assigned_at, is_active) 
        VALUES ($1, $2, $1, CURRENT_TIMESTAMP, true)
      `, [user.id, roleId]);
            logger_js_1.logger.info('✅ Assigned super_admin role to user');
        }
        try {
            const statusCheckResult = await (0, database_js_1.query)(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'user_account_status'
      `);
            if (statusCheckResult.rows.length > 0) {
                const statusResult = await (0, database_js_1.query)('SELECT id FROM user_account_status WHERE user_id = $1', [
                    user.id,
                ]);
                if (statusResult.rows.length === 0) {
                    await (0, database_js_1.query)(`
            INSERT INTO user_account_status (user_id, status, created_at, updated_at) 
            VALUES ($1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [user.id]);
                    logger_js_1.logger.info('✅ Created active account status');
                }
                else {
                    await (0, database_js_1.query)(`
            UPDATE user_account_status 
            SET status = 'active', expires_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
          `, [user.id]);
                    logger_js_1.logger.info('✅ Updated account status to active');
                }
            }
            else {
                logger_js_1.logger.info('ℹ️  user_account_status table not found, skipping status setup');
            }
        }
        catch (error) {
            logger_js_1.logger.warn('⚠️  Could not setup account status:', (0, errorHelpers_js_1.getErrorMessage)(error));
        }
        logger_js_1.logger.info('🔧 Setting is_admin flag in users table...');
        await (0, database_js_1.query)(`
      UPDATE users 
      SET is_admin = true 
      WHERE id = $1
    `, [user.id]);
        logger_js_1.logger.info('✅ Set is_admin = true in users table');
        logger_js_1.logger.info('🧪 Testing admin setup...');
        const testResult = await (0, database_js_1.query)(`
      SELECT 1 FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = $1 AND uar.is_active = TRUE
      AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
    `, [user.id]);
        if (testResult.rows.length > 0) {
            logger_js_1.logger.info(`
🎉 SUCCESS! User ${user.username} (${email}) is now a production admin!

Admin status: ✅ ACTIVE
Environment: PRODUCTION
Access URL: https://conquestk.com/admin

The user can now:
- Access the admin panel
- Manage users and games
- Moderate content
- Configure system settings
- View admin activity logs

Next steps:
1. User should refresh the page/clear browser cache
2. Click the Admin tab in the navigation
3. Verify admin panel loads successfully
      `);
        }
        else {
            logger_js_1.logger.error('❌ Setup completed but admin test failed');
            process.exit(1);
        }
        process.exit(0);
    }
    catch (error) {
        logger_js_1.logger.error('❌ Failed to setup production admin:', (0, errorHelpers_js_1.getErrorMessage)(error));
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
setupProductionAdmin(email);
//# sourceMappingURL=setupProductionAdmin.js.map