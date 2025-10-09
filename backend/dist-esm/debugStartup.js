"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logStartupDiagnostics = logStartupDiagnostics;
exports.testDatabaseConnection = testDatabaseConnection;
exports.testMigrationFiles = testMigrationFiles;
const logger_js_1 = require("./utils/logger.js");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function isVerbose() {
    const lvl = (process.env.LOG_LEVEL || 'info').toLowerCase();
    return process.env.STARTUP_VERBOSE === 'true' || lvl === 'debug' || lvl === 'silly';
}
function logStartupDiagnostics() {
    const verbose = isVerbose();
    if (!verbose) {
        logger_js_1.logger.info(`Startup: Node ${process.version}, env=${process.env.NODE_ENV || 'development'}, cwd=${process.cwd()}`);
        logger_js_1.logger.info(`Env: PORT=${process.env.PORT || '5001'}, DB=${process.env.DATABASE_URL ? 'SET' : 'MISSING'}, REDIS=${process.env.REDIS_URL ? 'SET' : 'MISSING'}`);
        return;
    }
    logger_js_1.logger.info('========================================');
    logger_js_1.logger.info('🔍 RAILWAY STARTUP DIAGNOSTICS');
    logger_js_1.logger.info('========================================');
    logger_js_1.logger.info('📍 System Information:');
    logger_js_1.logger.info(`  Node version: ${process.version}`);
    logger_js_1.logger.info(`  Platform: ${process.platform}`);
    logger_js_1.logger.info(`  Architecture: ${process.arch}`);
    logger_js_1.logger.info(`  Current directory: ${process.cwd()}`);
    logger_js_1.logger.info(`  Script directory: ${__dirname}`);
    logger_js_1.logger.info(`  Memory: ${JSON.stringify({
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    })}`);
    logger_js_1.logger.info('📋 Environment Variables:');
    logger_js_1.logger.info(`  NODE_ENV: "${process.env.NODE_ENV || 'undefined'}"`);
    logger_js_1.logger.info(`  PORT: "${process.env.PORT || 'undefined'}"`);
    logger_js_1.logger.info(`  DATABASE_URL: ${process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.length} chars)` : 'NOT SET'}`);
    if (process.env.DATABASE_URL) {
        try {
            const dbUrl = new URL(process.env.DATABASE_URL);
            logger_js_1.logger.info(`  Database parsed:`);
            logger_js_1.logger.info(`    Protocol: ${dbUrl.protocol}`);
            logger_js_1.logger.info(`    Host: ${dbUrl.hostname}`);
            logger_js_1.logger.info(`    Port: ${dbUrl.port || 'default'}`);
            logger_js_1.logger.info(`    Database: ${dbUrl.pathname.slice(1)}`);
            logger_js_1.logger.info(`    Username: ${dbUrl.username ? 'SET' : 'NOT SET'}`);
        }
        catch (urlError) {
            logger_js_1.logger.error(`  DATABASE_URL parse error: ${urlError}`);
            logger_js_1.logger.error(`  Raw URL (first 50 chars): ${process.env.DATABASE_URL.substring(0, 50)}`);
        }
    }
    logger_js_1.logger.info(`  CLIENT_URL: "${process.env.CLIENT_URL || 'undefined'}"`);
    logger_js_1.logger.info(`  FRONTEND_URL: "${process.env.FRONTEND_URL || 'undefined'}"`);
    logger_js_1.logger.info(`  CORS_ORIGIN: "${process.env.CORS_ORIGIN || 'undefined'}"`);
    logger_js_1.logger.info(`  JWT_SECRET: ${process.env.JWT_SECRET ? 'SET' : 'NOT SET'}`);
    logger_js_1.logger.info('🚂 Railway Variables:');
    logger_js_1.logger.info(`  RAILWAY_ENVIRONMENT: "${process.env.RAILWAY_ENVIRONMENT || 'undefined'}"`);
    logger_js_1.logger.info(`  RAILWAY_PROJECT_ID: "${process.env.RAILWAY_PROJECT_ID || 'undefined'}"`);
    logger_js_1.logger.info(`  RAILWAY_SERVICE_ID: "${process.env.RAILWAY_SERVICE_ID || 'undefined'}"`);
    logger_js_1.logger.info('========================================');
}
async function testDatabaseConnection() {
    const verbose = isVerbose();
    if (verbose) {
        logger_js_1.logger.info('🔌 Testing database connection...');
    }
    else {
        logger_js_1.logger.debug('🔌 Testing database connection...');
    }
    if (!process.env.DATABASE_URL) {
        logger_js_1.logger.error('❌ DATABASE_URL is not set!');
        return false;
    }
    try {
        const { query } = await import('./config/database.js');
        logger_js_1.logger.debug('  Testing SELECT 1...');
        const result = await query('SELECT 1 as test');
        logger_js_1.logger.debug(`  ✅ Basic query successful: ${JSON.stringify(result.rows[0])}`);
        logger_js_1.logger.debug('  Testing PostgreSQL version...');
        const versionResult = await query('SELECT version()');
        logger_js_1.logger.debug(`  ✅ PostgreSQL version: ${versionResult.rows[0].version}`);
        logger_js_1.logger.debug('  Testing table creation...');
        await query(`
      CREATE TABLE IF NOT EXISTS startup_test (
        id SERIAL PRIMARY KEY,
        test_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        logger_js_1.logger.debug('  ✅ Can create tables');
        await query('DROP TABLE IF EXISTS startup_test');
        if (verbose)
            logger_js_1.logger.info('✅ Database connectivity check passed');
        else
            logger_js_1.logger.debug('✅ Database connectivity check passed');
        return true;
    }
    catch (error) {
        logger_js_1.logger.error(`❌ Database connection test failed: ${error}`);
        if (error instanceof Error) {
            logger_js_1.logger.error(`  Error name: ${error.name}`);
            logger_js_1.logger.error(`  Error message: ${error.message}`);
            logger_js_1.logger.error(`  Error stack: ${error.stack}`);
        }
        return false;
    }
}
async function testMigrationFiles() {
    const verbose = isVerbose();
    if (verbose)
        logger_js_1.logger.info('📁 Checking migration files...');
    else
        logger_js_1.logger.debug('📁 Checking migration files...');
    try {
        const migrationsPath = node_path_1.default.join(__dirname, '../migrations');
        if (verbose)
            logger_js_1.logger.info(`  Looking for migrations in: ${migrationsPath}`);
        else
            logger_js_1.logger.debug(`  Looking for migrations in: ${migrationsPath}`);
        if (!node_fs_1.default.existsSync(migrationsPath)) {
            logger_js_1.logger.error(`  ❌ Migrations directory does not exist!`);
            return false;
        }
        const files = node_fs_1.default.readdirSync(migrationsPath);
        const sqlFiles = files.filter((f) => f.endsWith('.sql'));
        if (verbose) {
            logger_js_1.logger.info(`  ✅ Found ${sqlFiles.length} migration files:`);
            sqlFiles.forEach((file) => {
                const filePath = node_path_1.default.join(migrationsPath, file);
                const stats = node_fs_1.default.statSync(filePath);
                logger_js_1.logger.info(`    - ${file} (${stats.size} bytes)`);
            });
        }
        else {
            logger_js_1.logger.debug(`  ✅ Found ${sqlFiles.length} migration files`);
        }
        return true;
    }
    catch (error) {
        logger_js_1.logger.error(`❌ Migration files check failed: ${error}`);
        return false;
    }
}
//# sourceMappingURL=debugStartup.js.map