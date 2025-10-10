import './instrument.js';
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
    const result = dotenv.config();
    if (result.error) {
        throw result.error;
    }
}
import { validateEnvironmentVariables } from './config/validateEnv.js';
try {
    validateEnvironmentVariables();
}
catch (_error) {
    process.exit(1);
}
import { getErrorMessage, toKnownError } from './utils/errorHelpers.js';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { initDatabase, getPool } from './config/database.js';
import { initializeRedis } from './config/redis.js';
import { logStartupDiagnostics, testDatabaseConnection, testMigrationFiles, } from './debugStartup.js';
import { generalApiLimiter, suspiciousActivityTracker } from './middleware/rateLimiter.js';
import adminRoutes from './routes/admin.js';
import adminQueuesRoutes from './routes/adminQueues.js';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/game.js';
import mapRoutes from './routes/maps.js';
import notificationRoutes from './routes/notifications.js';
import profileRoutes from './routes/profile.js';
import skillsRoutes from './routes/skills.js';
import userRoutes from './routes/users.js';
import messagesRoutes from './routes/messages.js';
import clanRoutes from './routes/clans.js';
import friendsRoutes from './routes/friends.js';
import bullBoardRouterFactory from './routes/bullBoard.js';
import { setupSocketHandlers } from './services/socketService.js';
import { ensureTablesExist } from './utils/initTables.js';
import { logger } from './utils/logger.js';
import { MigrationRunner } from './utils/migrationRunner.js';
import { memoryDiagnosticsService } from './services/memoryDiagnosticsService.js';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { createSessionMiddleware, sessionMiddleware } from './middleware/session.js';
import mapWorkflowRoutes from './routes/mapWorkflow.js';
import mapApprovalRoutes from './routes/mapApproval.js';
import termsRoutes from './routes/terms.js';
import mapStagingRoutes from './routes/mapStaging.js';
import featureFlagsRoutes from './routes/featureFlags.js';
import queueRoutes from './routes/queueRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import benchmarkRoutes from './routes/benchmarkRoutes.js';
import { createPreferencesRouter } from './routes/preferences.js';
import { createWorkerManager, setWorkerManagerInstance } from './workers/workerManager.js';
const app = express();
const server = createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set('trust proxy', 1);
app.use((req, res, next) => {
    try {
        const isProd = process.env.NODE_ENV === 'production';
        if (!isProd)
            return next();
        const headerHost = (req.headers.host || '').toLowerCase();
        if (!headerHost)
            return next();
        const hostWithoutPort = headerHost.split(':')[0];
        const canonical = (process.env.CANONICAL_HOST || 'conquestk.com').toLowerCase();
        if (hostWithoutPort === canonical ||
            hostWithoutPort === 'localhost' ||
            hostWithoutPort === '127.0.0.1') {
            return next();
        }
        if (req.method === 'GET' || req.method === 'HEAD') {
            const target = `${req.protocol}://${canonical}${req.originalUrl}`;
            return res.redirect(308, target);
        }
        return next();
    }
    catch {
        return next();
    }
});
const getAllowedOrigins = () => {
    if (process.env.NODE_ENV === 'production') {
        return ['https://conquestk.com', 'https://www.conquestk.com'];
    }
    const origins = ['http://localhost:5173', 'http://localhost:3000'];
    if (process.env.FRONTEND_URL) {
        origins.push(process.env.FRONTEND_URL);
    }
    return origins;
};
const corsOptions = {
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};
const io = new Server(server, {
    cors: corsOptions,
    connectionStateRecovery: {},
});
initializeRedis()
    .then(async (redisClients) => {
    const { redisClient } = redisClients;
    if (redisClient) {
        try {
            io.adapter(createAdapter(redisClient));
            logger.info('✅ Socket.io using Redis Streams adapter for multi-server support');
        }
        catch (error) {
            logger.warn('⚠️ Failed to create Redis Streams adapter, using in-memory adapter:', getErrorMessage(error));
        }
    }
    else {
        logger.warn('⚠️ Socket.io using in-memory adapter (single server only)');
    }
    if (redisClient) {
        const { enableRedisSessionStore } = await import('./middleware/session.js');
        if (enableRedisSessionStore()) {
            logger.info('✅ Session storage upgraded to Redis');
        }
        else {
            logger.warn('⚠️ Failed to upgrade session storage to Redis');
        }
    }
    else {
        logger.warn('⚠️ Using in-memory session store (Redis not available)');
    }
    const workerManager = createWorkerManager(io);
    setWorkerManagerInstance(workerManager);
    try {
        await workerManager.initialize();
        logger.info('✅ WorkerManager created and initialized after Redis connection');
        try {
            const bullBoardRouter = bullBoardRouterFactory();
            app.use(bullBoardRouter);
            logger.info('✅ Bull Board mounted at /api/admin/queues/ui');
        }
        catch (e) {
            logger.warn('⚠️ Failed to mount Bull Board after init:', getErrorMessage(e));
        }
    }
    catch (error) {
        logger.error('❌ Failed to initialize WorkerManager after Redis:', getErrorMessage(error));
    }
})
    .catch((err) => {
    logger.warn('⚠️ Redis initialization failed, using in-memory adapters:', getErrorMessage(err));
    const workerManager = createWorkerManager(io);
    setWorkerManagerInstance(workerManager);
    workerManager
        .initialize()
        .then(() => {
        logger.info('✅ WorkerManager initialized without Redis (degraded mode)');
    })
        .catch((error) => {
        logger.error('❌ Failed to initialize WorkerManager in degraded mode:', getErrorMessage(error));
    });
});
const PORT = process.env.PORT || 5001;
const assetBaseUrl = process.env.PUBLIC_ASSET_BASE_URL?.trim();
let assetOrigin;
if (assetBaseUrl) {
    try {
        assetOrigin = new URL(assetBaseUrl).origin;
    }
    catch (error) {
        logger?.warn?.('Invalid PUBLIC_ASSET_BASE_URL provided; falling back to self-hosted assets', {
            value: assetBaseUrl,
            error,
        });
    }
}
const addUniqueSources = (sources, values) => {
    values.forEach((value) => {
        if (!value)
            return;
        if (!sources.includes(value)) {
            sources.push(value);
        }
    });
};
const imgSources = ["'self'", 'data:', 'blob:'];
const mediaSources = ["'self'", 'blob:'];
const fontSources = ["'self'", 'data:'];
const styleSources = ["'self'", "'unsafe-inline'"];
const scriptSources = ["'self'", "'unsafe-inline'"];
const connectSources = ["'self'", 'wss:', 'ws:'];
if (assetOrigin) {
    addUniqueSources(imgSources, [assetOrigin]);
    addUniqueSources(mediaSources, [assetOrigin]);
    addUniqueSources(fontSources, [assetOrigin]);
    addUniqueSources(connectSources, [assetOrigin]);
}
const cloudflareScriptOrigins = ['https://static.cloudflareinsights.com'];
const cloudflareConnectOrigins = [
    'https://cloudflareinsights.com',
    'https://static.cloudflareinsights.com',
];
addUniqueSources(scriptSources, cloudflareScriptOrigins);
addUniqueSources(connectSources, cloudflareConnectOrigins);
addUniqueSources(styleSources, ['https://fonts.googleapis.com']);
addUniqueSources(fontSources, ['https://fonts.gstatic.com']);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: scriptSources,
            styleSrc: styleSources,
            imgSrc: imgSources,
            connectSrc: connectSources,
            fontSrc: fontSources,
            objectSrc: ["'none'"],
            mediaSrc: mediaSources,
            frameSrc: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
createSessionMiddleware();
app.use(sessionMiddleware);
app.use(suspiciousActivityTracker.middleware());
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
    }
    next();
});
app.use('/api', (req, res, next) => {
    if (req.path === '/admin/status') {
        return next();
    }
    return generalApiLimiter(req, res, next);
});
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/maps', mapRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/queues', adminQueuesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/clans', clanRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/workflow', mapWorkflowRoutes);
app.use('/api/map-approval', mapApprovalRoutes);
app.use('/api/terms', termsRoutes);
app.use('/api/staging', mapStagingRoutes);
app.use('/api/feature-flags', featureFlagsRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/benchmark', benchmarkRoutes);
try {
    const bullBoardRouter = bullBoardRouterFactory();
    app.use(bullBoardRouter);
}
catch (_e) {
}
app.use('/api/preferences', createPreferencesRouter(getPool()));
app.get('/test', (_req, res) => {
    res.json({
        message: 'Server is running!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'unknown',
        nodeVersion: process.version,
        memory: process.memoryUsage(),
    });
});
app.get('/health', async (_req, res) => {
    let databaseStatus = 'unknown';
    let databaseError = null;
    let redisStatus = 'unknown';
    let redisError = null;
    let queueStatus = 'unknown';
    let queueError = null;
    try {
        const { query } = await import('./config/database.js');
        await query('SELECT 1');
        databaseStatus = 'connected';
    }
    catch (error) {
        databaseStatus = 'disconnected';
        databaseError = error instanceof Error ? error.message : 'Unknown error';
    }
    try {
        const { checkRedisHealth } = await import('./config/redis.js');
        const redisHealth = await checkRedisHealth();
        redisStatus = redisHealth.healthy ? 'connected' : 'disconnected';
        if (!redisHealth.healthy) {
            redisError = redisHealth.message;
        }
    }
    catch (error) {
        redisStatus = 'disconnected';
        redisError = error instanceof Error ? error.message : 'Unknown error';
    }
    try {
        const { getWorkerManagerInstance } = await import('./workers/workerManager.js');
        const workerManagerInstance = getWorkerManagerInstance();
        if (workerManagerInstance) {
            const queueHealth = await workerManagerInstance.healthCheck();
            queueStatus = queueHealth.status;
            if (queueHealth.status !== 'healthy') {
                queueError = queueHealth.details?.error || 'Queue system unhealthy';
            }
        }
        else {
            queueStatus = 'not-initialized';
            queueError = 'WorkerManager not initialized';
        }
    }
    catch (error) {
        queueStatus = 'disconnected';
        queueError = error instanceof Error ? error.message : 'Unknown error';
    }
    res.json({
        status: 'OK',
        server: 'running',
        database: databaseStatus,
        redis: redisStatus,
        queues: queueStatus,
        environment: process.env.NODE_ENV || 'development',
        databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
        redisUrl: process.env.REDIS_URL ? 'configured' : 'missing',
        sentry: process.env.SENTRY_DSN ? 'configured' : 'disabled',
        timestamp: new Date().toISOString(),
        ...(databaseError && { databaseError }),
        ...(redisError && { redisError }),
        ...(queueError && { queueError }),
    });
});
app.get('/api/health', async (_req, res) => {
    let databaseStatus = 'unknown';
    let databaseError = null;
    let redisStatus = 'unknown';
    let redisError = null;
    let queueStatus = 'unknown';
    let queueError = null;
    try {
        const { query } = await import('./config/database.js');
        await query('SELECT 1');
        databaseStatus = 'connected';
    }
    catch (error) {
        databaseStatus = 'disconnected';
        databaseError = error instanceof Error ? error.message : 'Unknown error';
    }
    try {
        const { checkRedisHealth } = await import('./config/redis.js');
        const redisHealth = await checkRedisHealth();
        redisStatus = redisHealth.healthy ? 'connected' : 'disconnected';
        if (!redisHealth.healthy) {
            redisError = redisHealth.message;
        }
    }
    catch (error) {
        redisStatus = 'disconnected';
        redisError = error instanceof Error ? error.message : 'Unknown error';
    }
    try {
        const { getWorkerManagerInstance } = await import('./workers/workerManager.js');
        const workerManagerInstance = getWorkerManagerInstance();
        if (workerManagerInstance) {
            const queueHealth = await workerManagerInstance.healthCheck();
            queueStatus = queueHealth.status;
            if (queueHealth.status !== 'healthy') {
                queueError = queueHealth.details?.error || 'Queue system unhealthy';
            }
        }
        else {
            queueStatus = 'not-initialized';
            queueError = 'WorkerManager not initialized';
        }
    }
    catch (error) {
        queueStatus = 'disconnected';
        queueError = error instanceof Error ? error.message : 'Unknown error';
    }
    res.json({
        status: 'OK',
        server: 'running',
        database: databaseStatus,
        redis: redisStatus,
        queues: queueStatus,
        environment: process.env.NODE_ENV || 'development',
        databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
        redisUrl: process.env.REDIS_URL ? 'configured' : 'missing',
        sentry: process.env.SENTRY_DSN ? 'configured' : 'disabled',
        timestamp: new Date().toISOString(),
        ...(databaseError && { databaseError }),
        ...(redisError && { redisError }),
        ...(queueError && { queueError }),
    });
});
app.get('/debug/env', (_req, res) => {
    res.json({
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
        DB_HOST: process.env.DB_HOST || 'NOT_SET',
        DB_NAME: process.env.DB_NAME || 'NOT_SET',
        DB_USER: process.env.DB_USER || 'NOT_SET',
        PORT: process.env.PORT,
        timestamp: new Date().toISOString(),
    });
});
app.get('/debug/tables', async (_req, res) => {
    try {
        const { query } = await import('./config/database.js');
        const tableCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
        let userCount = null;
        let adminCount = null;
        try {
            const userCountResult = await query('SELECT COUNT(*) as count FROM users');
            userCount = userCountResult.rows[0]?.count || 0;
        }
        catch (_e) {
            userCount = 'Table does not exist';
        }
        try {
            const adminCountResult = await query(`
        SELECT COUNT(*) as count 
        FROM users u 
        JOIN user_admin_roles uar ON u.id = uar.user_id 
        WHERE uar.is_active = true
      `);
            adminCount = adminCountResult.rows[0]?.count || 0;
        }
        catch (_e) {
            adminCount = 'Admin tables do not exist';
        }
        let migrationStatus = null;
        try {
            const migrationRunner = new MigrationRunner();
            migrationStatus = await migrationRunner.getMigrationStatus();
        }
        catch (_e) {
            migrationStatus = 'Migration system not available';
        }
        res.json({
            status: 'OK',
            tables: tableCheck.rows.map((row) => row.table_name),
            tableCount: tableCheck.rows.length,
            userCount,
            adminCount,
            migrationStatus,
            databaseType: 'postgresql',
            databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
            databaseType: 'postgresql',
            databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set',
            timestamp: new Date().toISOString(),
        });
    }
});
app.get('/debug/migrations', async (_req, res) => {
    try {
        const migrationRunner = new MigrationRunner();
        const migrationStatus = await migrationRunner.getMigrationStatus();
        res.json({
            status: 'OK',
            migrations: migrationStatus,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
        });
    }
});
if (process.env.NODE_ENV !== 'production') {
    app.get('/debug-sentry', (_req, _res) => {
        throw new Error('Test Sentry error!');
    });
}
const isProductionLike = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
if (isProductionLike) {
    ;
    (async () => {
        const fsNs = (await import('node:fs'));
        const fsModule = 'default' in fsNs ? fsNs.default : fsNs;
        const { existsSync, readdirSync } = fsModule;
        const frontendPath = path.join(__dirname, '../public');
        logger.debug(`📁 Setting up static file serving from: ${frontendPath}`);
        logger.debug(`📁 Frontend path exists: ${existsSync(frontendPath)}`);
        if (existsSync(frontendPath)) {
            const files = readdirSync(frontendPath);
            logger.debug(`📁 Files in frontend directory: ${files.join(', ')}`);
            const indexExists = fsModule.existsSync(path.join(frontendPath, 'index.html'));
            logger.debug(`📁 index.html exists: ${indexExists}`);
        }
        app.use(express.static(frontendPath, {
            maxAge: 0,
            setHeaders: (res, filePath) => {
                logger.debug(`📦 Serving static file: ${filePath}`);
                const relativePath = path.relative(frontendPath, filePath);
                if (relativePath === 'index.html') {
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                }
                else if (relativePath === 'sw.js') {
                    res.setHeader('Cache-Control', 'no-cache');
                }
                else if (relativePath.startsWith('assets/')) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                }
                else {
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                }
                if (filePath.endsWith('.js')) {
                    res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
                }
                else if (filePath.endsWith('.css')) {
                    res.setHeader('Content-Type', 'text/css; charset=UTF-8');
                }
                else if (filePath.endsWith('.json')) {
                    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
                }
            },
            index: false,
        }));
        app.get('/', (_req, res) => {
            const indexPath = path.join(frontendPath, 'index.html');
            return res.sendFile(indexPath, (err) => {
                if (err) {
                    logger.error(`Failed to serve index.html for root path`, { error: err.message });
                    res.status(500).send('Error serving page');
                }
            });
        });
        app.use((req, res, next) => {
            if (req.path.startsWith('/api') ||
                req.path.startsWith('/assets') ||
                req.path.startsWith('/uploads')) {
                return next();
            }
            const indexPath = path.join(frontendPath, 'index.html');
            return res.sendFile(indexPath, (err) => {
                if (err) {
                    logger.error(`Failed to serve index.html`, { path: req.path, error: err.message });
                    res.status(500).send('Error serving page');
                }
            });
        });
    })().catch((e) => logger.warn('Static frontend setup failed', getErrorMessage(e)));
}
Sentry.setupExpressErrorHandler(app);
app.use((err, _req, res, _next) => {
    const normalizedError = toKnownError(err);
    const sentryResponse = res;
    const sentryId = sentryResponse.sentry;
    logger.error('Application error:', {
        error: normalizedError.message,
        stack: normalizedError.stack,
        isError: true,
        sentryId,
    });
    const statusCode = typeof normalizedError.status === 'number'
        ? normalizedError.status
        : typeof normalizedError.statusCode === 'number'
            ? normalizedError.statusCode
            : 500;
    res.status(statusCode).json({
        error: process.env.NODE_ENV === 'production'
            ? 'An error occurred processing your request'
            : normalizedError.message,
        ...(sentryId && { sentryId }),
        ...(process.env.NODE_ENV !== 'production' && normalizedError.stack
            ? { stack: normalizedError.stack }
            : {}),
    });
});
setupSocketHandlers(io);
memoryDiagnosticsService.start();
async function startServer() {
    try {
        logger.info('🚀 Starting ConquestK server...');
        logStartupDiagnostics();
        const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
        server.listen(portNumber, '0.0.0.0', () => {
            logger.info(`✅ HTTP Server successfully listening on 0.0.0.0:${portNumber}`);
            logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`📊 Test endpoint: http://localhost:${portNumber}/test`);
            logger.info(`📊 Health check: http://localhost:${portNumber}/health`);
            logger.info(`📅 Server started at: ${new Date().toISOString()}`);
            setImmediate(async () => {
                try {
                    logger.info('🔄 Testing database connection...');
                    const canConnect = await testDatabaseConnection();
                    if (!canConnect) {
                        logger.error('❌ Cannot connect to database - server running without database');
                        return;
                    }
                    await testMigrationFiles();
                    logger.info('🔄 Initializing database connection pool...');
                    await initDatabase();
                    logger.info('✅ Database connection pool established');
                    await ensureTablesExist();
                    logger.info('✅ Basic tables verified');
                    const migrationRunner = new MigrationRunner();
                    try {
                        await migrationRunner.runPendingMigrations();
                        const isValid = await migrationRunner.validateSchemaIntegrity();
                        if (!isValid) {
                            throw new Error('Schema validation failed after migrations');
                        }
                        logger.info('✅ All migrations completed and schema validated');
                        logger.info('🗄️  Database: PostgreSQL with migration tracking');
                        const { ensureOwnerAdmin } = await import('./scripts/ensureOwnerAdmin.js');
                        await ensureOwnerAdmin();
                        if (process.env.RUN_DEPLOY_ACCOUNT_ENFORCEMENT_ON_START === 'true') {
                            try {
                                const { ensureDeployAccounts } = await import('./scripts/ensureDeployAccounts.js');
                                logger.info('🔐 Enforcing deploy accounts (owner + tests)');
                                await ensureDeployAccounts();
                            }
                            catch (e) {
                                logger.warn('Failed to enforce deploy accounts on start:', getErrorMessage(e));
                            }
                        }
                        if (process.env.SYNC_FEATURE_FLAGS_ON_START === 'true') {
                            try {
                                const { spawnSync } = await import('node:child_process');
                                const scriptPath = path.join(__dirname, 'scripts', 'checkFeatureFlags.js');
                                logger.info('🏁 Syncing feature flags from code usage into DB');
                                const result = spawnSync(process.execPath, [scriptPath, '--apply'], {
                                    stdio: 'ignore',
                                    env: process.env,
                                });
                                if (result.status === 0) {
                                    logger.info('✅ Feature flags sync completed');
                                }
                                else {
                                    logger.warn('⚠️ Feature flags sync exited with non-zero status');
                                }
                            }
                            catch (e) {
                                logger.warn('Failed to sync feature flags on start:', getErrorMessage(e));
                            }
                        }
                        try {
                            const { authTrackingService } = await import('./services/authTrackingService.js');
                            const maxAgeHours = parseInt(process.env.SESSION_MAX_AGE_HOURS || '168', 10);
                            const sweepMinutes = parseInt(process.env.SESSION_SWEEP_INTERVAL_MINUTES || '60', 10);
                            await authTrackingService.closeStaleSessions(maxAgeHours);
                            setInterval(() => {
                                authTrackingService
                                    .closeStaleSessions(maxAgeHours)
                                    .catch((e) => logger.warn('Stale session sweep failed', getErrorMessage(e)));
                            }, Math.max(1, sweepMinutes) * 60 * 1000);
                            logger.info('🧹 Stale session sweeper enabled', {
                                maxAgeHours,
                                sweepMinutes,
                            });
                        }
                        catch (e) {
                            logger.warn('Failed to initialize stale session sweeper', getErrorMessage(e));
                        }
                        if (process.env.NODE_ENV === 'production') {
                            logger.info('🌐 Production deployment ready at https://conquestk.com');
                            logger.info('🎮 All game features and admin functionality should be available');
                        }
                    }
                    catch (migrationError) {
                        logger.error('❌ Migration system failed:', migrationError);
                        logger.warn('⚠️  Server running with potential schema issues...');
                        logger.error('💡 Some features may not work correctly until database is properly configured');
                    }
                }
                catch (dbError) {
                    const normalizedDbError = toKnownError(dbError);
                    logger.error('❌ Database initialization failed:', normalizedDbError);
                    logger.error(`  Error type: ${normalizedDbError.constructor.name}`);
                    logger.error(`  Error message: ${normalizedDbError.message}`);
                    if (normalizedDbError.stack) {
                        logger.error(`  Stack trace: ${normalizedDbError.stack}`);
                    }
                    logger.warn('⚠️  Server running without database connection');
                    logger.error('💡 Database features unavailable');
                    logger.error('💡 Check /test endpoint to verify server is running');
                    logger.error('💡 Check /debug/env for environment variables');
                    if (process.env.NODE_ENV === 'production') {
                        logger.info('🚧 Server in degraded mode - database unavailable');
                    }
                }
            });
        });
    }
    catch (startupError) {
        logger.error('💥 FATAL: Server startup failed completely:', startupError);
        if (startupError instanceof Error) {
            logger.error(`  Error: ${startupError.message}`);
            logger.error(`  Stack: ${startupError.stack}`);
        }
        if (process.env.NODE_ENV === 'production') {
            logger.error('Exiting with code 1 for Railway to restart...');
            process.exit(1);
        }
    }
}
process.on('uncaughtException', (error) => {
    logger.error('💥 UNCAUGHT EXCEPTION:', error);
    logger.error(`  Message: ${error.message}`);
    logger.error(`  Stack: ${error.stack}`);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 UNHANDLED REJECTION at:', promise);
    logger.error('  Reason:', reason);
    process.exit(1);
});
startServer();
//# sourceMappingURL=index.js.map