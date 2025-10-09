"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./instrument.js");
const Sentry = __importStar(require("@sentry/node"));
const dotenv_1 = __importDefault(require("dotenv"));
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
    const result = dotenv_1.default.config();
    if (result.error) {
        throw result.error;
    }
}
const validateEnv_js_1 = require("./config/validateEnv.js");
try {
    (0, validateEnv_js_1.validateEnvironmentVariables)();
}
catch (_error) {
    process.exit(1);
}
const errorHelpers_js_1 = require("./utils/errorHelpers.js");
let createServer;
let path;
let cors;
let express;
let helmet;
let Server;
let initDatabase;
let logStartupDiagnostics;
let testDatabaseConnection;
let testMigrationFiles;
let generalApiLimiter;
let suspiciousActivityTracker;
let adminRoutes;
let adminQueuesRoutes;
let authRoutes;
let gameRoutes;
let mapRoutes;
let notificationRoutes;
let profileRoutes;
let skillsRoutes;
let userRoutes;
let messagesRoutes;
let clanRoutes;
let friendsRoutes;
let leaderboardRoutes;
let bullBoardRouterFactory;
let initializeRedis;
let setupSocketHandlers;
let ensureTablesExist;
let logger;
let MigrationRunner;
let memoryDiagnosticsService;
try {
    createServer = require('node:http').createServer;
    path = require('node:path');
    cors = require('cors');
    express = require('express');
    helmet = require('helmet');
    const socketIo = require('socket.io');
    Server = socketIo.Server;
    const dbModule = require('./config/database');
    initDatabase = dbModule.initDatabase;
    const redisModule = require('./config/redis');
    initializeRedis = redisModule.initializeRedis;
    const debugModule = require('./debugStartup');
    logStartupDiagnostics = debugModule.logStartupDiagnostics;
    testDatabaseConnection = debugModule.testDatabaseConnection;
    testMigrationFiles = debugModule.testMigrationFiles;
    const rateLimiterModule = require('./middleware/rateLimiter');
    generalApiLimiter = rateLimiterModule.generalApiLimiter;
    suspiciousActivityTracker = rateLimiterModule.suspiciousActivityTracker;
    adminRoutes = require('./routes/admin').default;
    adminQueuesRoutes = require('./routes/adminQueues').default;
    authRoutes = require('./routes/auth').authRoutes;
    gameRoutes = require('./routes/game').gameRoutes;
    mapRoutes = require('./routes/maps').default;
    notificationRoutes = require('./routes/notifications').default;
    profileRoutes = require('./routes/profile').default;
    skillsRoutes = require('./routes/skills').default;
    userRoutes = require('./routes/users').default;
    messagesRoutes = require('./routes/messages').default;
    clanRoutes = require('./routes/clans').default;
    friendsRoutes = require('./routes/friends').default;
    leaderboardRoutes = require('./routes/leaderboard').default;
    bullBoardRouterFactory = require('./routes/bullBoard').default;
    setupSocketHandlers = require('./services/socketService').setupSocketHandlers;
    ensureTablesExist = require('./utils/initTables').ensureTablesExist;
    logger = require('./utils/logger').logger;
    memoryDiagnosticsService = require('./services/memoryDiagnosticsService').memoryDiagnosticsService;
    try {
        MigrationRunner = require('./utils/migrationRunner').MigrationRunner;
        logger.debug('  ✓ MigrationRunner loaded');
    }
    catch (e) {
        logger.error('  ✗ Failed to load MigrationRunner:', e);
        throw e;
    }
    logger.info('✅ Utils loaded');
}
catch (error) {
    const normalized = (0, errorHelpers_js_1.toKnownError)(error);
    const message = normalized.message || 'Unknown startup error';
    process.stderr.write(`❌ Failed to initialize server: ${message}\n`);
    if (normalized.stack) {
        process.stderr.write(`${normalized.stack}\n`);
    }
    process.exit(1);
}
const app = express();
const server = createServer(app);
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
});
initializeRedis()
    .then(async (redisClients) => {
    const { pubClient, subClient, redisClient } = redisClients;
    if (pubClient && subClient) {
        try {
            const { createAdapter } = require('@socket.io/redis-adapter');
            io.adapter(createAdapter(pubClient, subClient));
            logger.info('✅ Socket.io using Redis adapter for multi-server support');
        }
        catch (error) {
            logger.warn('⚠️ Failed to create Redis adapter, using in-memory adapter:', (0, errorHelpers_js_1.getErrorMessage)(error));
        }
    }
    else {
        logger.warn('⚠️ Socket.io using in-memory adapter (single server only)');
    }
    if (redisClient) {
        const { enableRedisSessionStore } = require('./middleware/session');
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
    const workerManager = (0, workerManager_js_1.createWorkerManager)(io);
    (0, workerManager_js_1.setWorkerManagerInstance)(workerManager);
    try {
        await workerManager.initialize();
        logger.info('✅ WorkerManager created and initialized after Redis connection');
        try {
            const bullBoardRouter = bullBoardRouterFactory();
            app.use(bullBoardRouter);
            logger.info('✅ Bull Board mounted at /api/admin/queues/ui');
        }
        catch (e) {
            logger.warn('⚠️ Failed to mount Bull Board after init:', (0, errorHelpers_js_1.getErrorMessage)(e));
        }
    }
    catch (error) {
        logger.error('❌ Failed to initialize WorkerManager after Redis:', (0, errorHelpers_js_1.getErrorMessage)(error));
    }
})
    .catch((err) => {
    logger.warn('⚠️ Redis initialization failed, using in-memory adapters:', (0, errorHelpers_js_1.getErrorMessage)(err));
    const workerManager = (0, workerManager_js_1.createWorkerManager)(io);
    (0, workerManager_js_1.setWorkerManagerInstance)(workerManager);
    workerManager
        .initialize()
        .then(() => {
        logger.info('✅ WorkerManager initialized without Redis (degraded mode)');
    })
        .catch((error) => {
        logger.error('❌ Failed to initialize WorkerManager in degraded mode:', (0, errorHelpers_js_1.getErrorMessage)(error));
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
const { createSessionMiddleware, sessionMiddleware } = require('./middleware/session');
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
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/workflow', require('./routes/mapWorkflow').default);
app.use('/api/map-approval', require('./routes/mapApproval').default);
app.use('/api/terms', require('./routes/terms').default);
app.use('/api/staging', require('./routes/mapStaging').default);
app.use('/api/feature-flags', require('./routes/featureFlags').default);
app.use('/api/queues', require('./routes/queueRoutes').default);
app.use('/api/performance', require('./routes/performanceRoutes').default);
app.use('/api/benchmark', require('./routes/benchmarkRoutes').default);
try {
    const bullBoardRouter = bullBoardRouterFactory();
    app.use(bullBoardRouter);
}
catch (_e) {
}
app.use('/api/preferences', require('./routes/preferences').createPreferencesRouter(require('./config/database').getPool()));
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
    const fs = require('node:fs');
    const frontendPath = path.join(__dirname, '../public');
    logger.debug(`📁 Setting up static file serving from: ${frontendPath}`);
    logger.debug(`📁 Frontend path exists: ${fs.existsSync(frontendPath)}`);
    if (fs.existsSync(frontendPath)) {
        const files = fs.readdirSync(frontendPath);
        logger.debug(`📁 Files in frontend directory: ${files.join(', ')}`);
        const indexExists = fs.existsSync(path.join(frontendPath, 'index.html'));
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
}
Sentry.setupExpressErrorHandler(app);
app.use((err, _req, res, _next) => {
    const normalizedError = (0, errorHelpers_js_1.toKnownError)(err);
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
const workerManager_js_1 = require("./workers/workerManager.js");
async function startServer() {
    try {
        logger.info('🚀 Starting Risk Game server...');
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
                        const { ensureOwnerAdmin } = require('./scripts/ensureOwnerAdmin');
                        await ensureOwnerAdmin();
                        if (process.env.RUN_DEPLOY_ACCOUNT_ENFORCEMENT_ON_START === 'true') {
                            try {
                                const { ensureDeployAccounts } = await import('./scripts/ensureDeployAccounts.js');
                                logger.info('🔐 Enforcing deploy accounts (owner + tests)');
                                await ensureDeployAccounts();
                            }
                            catch (e) {
                                logger.warn('Failed to enforce deploy accounts on start:', (0, errorHelpers_js_1.getErrorMessage)(e));
                            }
                        }
                        if (process.env.SYNC_FEATURE_FLAGS_ON_START === 'true') {
                            try {
                                const { spawnSync } = require('node:child_process');
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
                                logger.warn('Failed to sync feature flags on start:', (0, errorHelpers_js_1.getErrorMessage)(e));
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
                                    .catch((e) => logger.warn('Stale session sweep failed', (0, errorHelpers_js_1.getErrorMessage)(e)));
                            }, Math.max(1, sweepMinutes) * 60 * 1000);
                            logger.info('🧹 Stale session sweeper enabled', {
                                maxAgeHours,
                                sweepMinutes,
                            });
                        }
                        catch (e) {
                            logger.warn('Failed to initialize stale session sweeper', (0, errorHelpers_js_1.getErrorMessage)(e));
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
                    const normalizedDbError = (0, errorHelpers_js_1.toKnownError)(dbError);
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