"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDeployAccounts = run;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const logger_js_1 = require("../utils/logger.js");
const OWNER_EMAIL = 'connorkeetch@gmail.com';
const SUPER_ADMIN_ROLE = 'super_admin';
const REQUIRED_TEST_ACCOUNTS = 12;
const TEST_ACCOUNT_PASSWORD = 'Password123!';
const targetEnvironments = new Set(['production', 'staging']);
function shouldRunEnforcement() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        return { run: false, reason: 'DATABASE_URL not set' };
    }
    if (process.env.SKIP_DEPLOY_ACCOUNT_ENFORCEMENT === 'true') {
        return { run: false, reason: 'SKIP_DEPLOY_ACCOUNT_ENFORCEMENT=true' };
    }
    if (process.env.ENFORCE_DEPLOY_ACCOUNT_CHECK === 'true') {
        return { run: true, reason: 'explicit override' };
    }
    const candidates = [
        process.env.NODE_ENV,
        process.env.APP_ENV,
        process.env.RAILWAY_ENVIRONMENT_NAME,
        process.env.DEPLOY_ENV,
    ]
        .map((value) => value?.toLowerCase())
        .filter((value) => Boolean(value));
    const matched = candidates.some((value) => targetEnvironments.has(value));
    if (matched) {
        return { run: true, reason: `environment match (${candidates.join(', ')})` };
    }
    return {
        run: false,
        reason: 'environment not targeted (use ENFORCE_DEPLOY_ACCOUNT_CHECK=true to force)',
    };
}
function buildTestAccounts() {
    return Array.from({ length: REQUIRED_TEST_ACCOUNTS }, (_, index) => {
        const number = index + 1;
        const username = `test${number}`;
        const email = `test${number}@test.com`;
        return { username, email };
    });
}
async function ensureOwnerSuperAdmin(query) {
    const userColumns = await getUserColumns(query);
    const adminRoleSchema = await getAdminRoleSchema(query);
    const ownerResult = await query(`SELECT id, password_hash${userColumns.has('is_admin') ? ', is_admin' : ''}${userColumns.has('email_verified') ? ', email_verified' : ''}${userColumns.has('is_verified') ? ', is_verified' : ''}
     FROM users WHERE LOWER(email) = LOWER($1)`, [OWNER_EMAIL]);
    if (ownerResult.rows.length === 0) {
        logger_js_1.logger.warn(`Owner account ${OWNER_EMAIL} not found. Register the user to grant access.`);
        return;
    }
    const owner = ownerResult.rows[0];
    const ownerUpdates = [];
    const ownerUpdateValues = [];
    const ownerParamIndex = 1;
    if (userColumns.has('is_admin') && !owner.is_admin) {
        ownerUpdates.push(`is_admin = true`);
    }
    if (userColumns.has('email_verified') && !owner.email_verified) {
        ownerUpdates.push(`email_verified = true`);
    }
    if (userColumns.has('is_verified') && !owner.is_verified) {
        ownerUpdates.push(`is_verified = true`);
    }
    if (userColumns.has('verification_token')) {
        ownerUpdates.push(`verification_token = NULL`);
    }
    if (ownerUpdates.length > 0) {
        const updateSql = `UPDATE users
       SET ${ownerUpdates.join(', ')},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $${ownerParamIndex}`;
        ownerUpdateValues.push(owner.id);
        await query(updateSql, ownerUpdateValues);
        logger_js_1.logger.info(`Elevated owner account privileges for ${OWNER_EMAIL}`);
    }
    else {
        logger_js_1.logger.info(`Owner account ${OWNER_EMAIL} already has required flags`);
    }
    const roleResult = await query('SELECT id FROM admin_roles WHERE name = $1', [
        SUPER_ADMIN_ROLE,
    ]);
    let roleId;
    if (roleResult.rows.length === 0) {
        const permissionsParam = adminRoleSchema.permissionsType === 'jsonb' ? JSON.stringify(['*']) : '{"*"}';
        const permissionsCast = adminRoleSchema.permissionsType === 'jsonb' ? '::jsonb' : '::text[]';
        const createdRole = await query(`INSERT INTO admin_roles (name, description, permissions, is_super_admin)
       VALUES ($1, $2, $3${permissionsCast}, true)
       RETURNING id`, [SUPER_ADMIN_ROLE, 'Full system access', permissionsParam]);
        roleId = createdRole.rows[0].id;
        logger_js_1.logger.info('Created missing super_admin role');
    }
    else {
        roleId = roleResult.rows[0].id;
    }
    const userAdminRoleColumns = await getUserAdminRoleColumns(query);
    const adminInsertColumns = ['user_id', 'role_id'];
    const adminInsertValues = [owner.id, roleId];
    const adminPlaceholders = ['$1', '$2'];
    let adminParamCounter = 3;
    if (userAdminRoleColumns.has('assigned_by')) {
        adminInsertColumns.push('assigned_by');
        adminInsertValues.push(owner.id);
        adminPlaceholders.push(`$${adminParamCounter}`);
        adminParamCounter += 1;
    }
    if (userAdminRoleColumns.has('assigned_at')) {
        adminInsertColumns.push('assigned_at');
        adminInsertValues.push(new Date());
        adminPlaceholders.push(`$${adminParamCounter}`);
        adminParamCounter += 1;
    }
    if (userAdminRoleColumns.has('is_active')) {
        adminInsertColumns.push('is_active');
        adminInsertValues.push(true);
        adminPlaceholders.push(`$${adminParamCounter}`);
        adminParamCounter += 1;
    }
    const adminUpdateParts = [];
    if (userAdminRoleColumns.has('is_active')) {
        adminUpdateParts.push('is_active = true');
    }
    if (userAdminRoleColumns.has('expires_at')) {
        adminUpdateParts.push('expires_at = NULL');
    }
    if (userAdminRoleColumns.has('updated_at')) {
        adminUpdateParts.push('updated_at = CURRENT_TIMESTAMP');
    }
    const adminInsertSql = `INSERT INTO user_admin_roles (${adminInsertColumns.join(', ')})
     VALUES (${adminPlaceholders.join(', ')})
     ON CONFLICT (user_id, role_id)
     DO ${adminUpdateParts.length > 0 ? `UPDATE SET ${adminUpdateParts.join(', ')}` : 'NOTHING'}`;
    await query(adminInsertSql, adminInsertValues);
    logger_js_1.logger.info(`Ensured ${OWNER_EMAIL} is assigned to super_admin role`);
}
async function ensureTestAccounts(query) {
    const userColumns = await getUserColumns(query);
    const testAccounts = buildTestAccounts();
    let created = 0;
    let updated = 0;
    for (const account of testAccounts) {
        const result = await query(`SELECT id, password_hash${userColumns.has('is_admin') ? ', is_admin' : ''}${userColumns.has('email_verified') ? ', email_verified' : ''}${userColumns.has('is_verified') ? ', is_verified' : ''}
       FROM users
       WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)`, [account.username, account.email]);
        if (result.rows.length === 0) {
            const hashedPassword = await bcryptjs_1.default.hash(TEST_ACCOUNT_PASSWORD, 12);
            const insertColumns = ['username', 'email', 'password_hash'];
            const insertValues = [account.username, account.email, hashedPassword];
            const placeholders = ['$1', '$2', '$3'];
            let paramCounter = 4;
            if (userColumns.has('is_admin')) {
                insertColumns.push('is_admin');
                insertValues.push(false);
                placeholders.push(`$${paramCounter}`);
                paramCounter += 1;
            }
            if (userColumns.has('is_verified')) {
                insertColumns.push('is_verified');
                insertValues.push(true);
                placeholders.push(`$${paramCounter}`);
                paramCounter += 1;
            }
            if (userColumns.has('email_verified')) {
                insertColumns.push('email_verified');
                insertValues.push(true);
                placeholders.push(`$${paramCounter}`);
                paramCounter += 1;
            }
            if (userColumns.has('verification_token')) {
                insertColumns.push('verification_token');
                insertValues.push(null);
                placeholders.push(`$${paramCounter}`);
                paramCounter += 1;
            }
            insertColumns.push('created_at', 'updated_at');
            insertValues.push(new Date());
            insertValues.push(new Date());
            placeholders.push(`$${paramCounter}`, `$${paramCounter + 1}`);
            paramCounter += 2;
            const insertSql = `INSERT INTO users (${insertColumns.join(', ')})
         VALUES (${placeholders.join(', ')})`;
            await query(insertSql, insertValues);
            created += 1;
            logger_js_1.logger.info(`Created test account ${account.username}`);
        }
        else {
            const existing = result.rows[0];
            const updates = [];
            const params = [];
            let paramIndex = 1;
            if (userColumns.has('is_admin') && existing.is_admin) {
                updates.push(`is_admin = false`);
            }
            if (userColumns.has('email_verified') && !existing.email_verified) {
                updates.push(`email_verified = true`);
            }
            if (userColumns.has('is_verified') && !existing.is_verified) {
                updates.push(`is_verified = true`);
            }
            const passwordMatches = await bcryptjs_1.default.compare(TEST_ACCOUNT_PASSWORD, existing.password_hash);
            if (!passwordMatches) {
                const hashedPassword = await bcryptjs_1.default.hash(TEST_ACCOUNT_PASSWORD, 12);
                updates.push(`password_hash = $${paramIndex}`);
                params.push(hashedPassword);
                paramIndex += 1;
            }
            if (userColumns.has('verification_token')) {
                updates.push('verification_token = NULL');
            }
            if (updates.length > 0) {
                const baseQuery = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`;
                params.push(existing.id);
                await query(baseQuery, params);
                updated += 1;
                logger_js_1.logger.info(`Normalized test account ${account.username}`);
            }
        }
    }
    const verificationResult = await query(`SELECT COUNT(*)::int AS count
     FROM users
     WHERE username LIKE 'test%' AND email LIKE 'test%@test.com'`);
    const actualCount = Number(verificationResult.rows[0]?.count ?? 0);
    if (!Number.isFinite(actualCount)) {
        logger_js_1.logger.warn('Could not interpret test account count from database response');
        return;
    }
    if (actualCount !== REQUIRED_TEST_ACCOUNTS) {
        logger_js_1.logger.warn(`Expected ${REQUIRED_TEST_ACCOUNTS} test accounts but found ${actualCount}. Verify manually if this is intentional.`);
    }
    logger_js_1.logger.info(`Test account check complete (created ${created}, normalized ${updated})`);
}
let userColumnsCache = null;
let adminRoleSchemaCache = null;
let userAdminRoleColumnsCache = null;
async function getUserColumns(query) {
    if (userColumnsCache) {
        return userColumnsCache;
    }
    const result = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
    userColumnsCache = new Set(result.rows.map((row) => row.column_name));
    return userColumnsCache;
}
async function getAdminRoleSchema(query) {
    if (adminRoleSchemaCache) {
        return adminRoleSchemaCache;
    }
    const result = await query(`SELECT data_type, udt_name FROM information_schema.columns
     WHERE table_name = 'admin_roles' AND column_name = 'permissions'`);
    const row = result.rows[0];
    if (!row) {
        adminRoleSchemaCache = { permissionsType: 'jsonb' };
        return adminRoleSchemaCache;
    }
    if (row.data_type === 'ARRAY' || row.udt_name === '_text') {
        adminRoleSchemaCache = { permissionsType: 'text_array' };
    }
    else {
        adminRoleSchemaCache = { permissionsType: 'jsonb' };
    }
    return adminRoleSchemaCache;
}
async function getUserAdminRoleColumns(query) {
    if (userAdminRoleColumnsCache) {
        return userAdminRoleColumnsCache;
    }
    const result = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'user_admin_roles'`);
    userAdminRoleColumnsCache = new Set(result.rows.map((row) => row.column_name));
    return userAdminRoleColumnsCache;
}
async function run() {
    const { run, reason } = shouldRunEnforcement();
    if (!run) {
        logger_js_1.logger.info(`Skipping deploy account enforcement: ${reason}`);
        return;
    }
    logger_js_1.logger.info(`Running deploy account enforcement (${reason})`);
    let databaseModule;
    try {
        databaseModule = await import('../config/database.js');
    }
    catch (error) {
        logger_js_1.logger.error('Failed to load database module', error);
        throw error;
    }
    const { initDatabase, query, closeDatabase } = databaseModule;
    try {
        await initDatabase();
        await ensureOwnerSuperAdmin(query);
        await ensureTestAccounts(query);
    }
    finally {
        try {
            await closeDatabase();
        }
        catch (closeError) {
            logger_js_1.logger.warn('Failed to close database pool cleanly', closeError);
        }
    }
}
if (require.main === module) {
    run()
        .then(() => {
        logger_js_1.logger.info('Deploy account enforcement completed');
    })
        .catch((error) => {
        logger_js_1.logger.error('Deploy account enforcement failed', error);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=ensureDeployAccounts.js.map