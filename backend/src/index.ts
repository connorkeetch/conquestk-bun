// IMPORTANT: Import Sentry instrumentation before anything else
import './instrument'

import * as Sentry from '@sentry/node'
import dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
// Only load .env file in development - production/staging uses Railway's environment variables
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
  const result = dotenv.config()
  if (result.error) {
    throw result.error
  }
}

import { validateEnvironmentVariables } from './config/validateEnv'

try {
  validateEnvironmentVariables()
} catch (_error) {
  process.exit(1)
}

// Import types first
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express'
import type { Logger } from 'winston'
import type { RedisClients } from './config/redis'
import type { SuspiciousActivityTracker } from './middleware/rateLimiter'
import { getErrorMessage, toKnownError } from './utils/errorHelpers'

// Wrap all imports in try-catch to identify which one is failing
let createServer: typeof import('node:http')['createServer']
let path: typeof import('node:path')
let cors: typeof import('cors')
let express: typeof import('express')
let helmet: typeof import('helmet')['default']
let Server: typeof import('socket.io').Server
let initDatabase: typeof import('./config/database').initDatabase
let logStartupDiagnostics: typeof import('./debugStartup').logStartupDiagnostics
let testDatabaseConnection: typeof import('./debugStartup').testDatabaseConnection
let testMigrationFiles: typeof import('./debugStartup').testMigrationFiles
let generalApiLimiter: RequestHandler
let suspiciousActivityTracker: SuspiciousActivityTracker
let adminRoutes: Router
let authRoutes: Router
let gameRoutes: Router
let mapRoutes: Router
let notificationRoutes: Router
let profileRoutes: Router
let skillsRoutes: Router
let userRoutes: Router
let initializeRedis: typeof import('./config/redis').initializeRedis
let setupSocketHandlers: typeof import('./services/socketService').setupSocketHandlers
let ensureTablesExist: typeof import('./utils/initTables').ensureTablesExist
let logger: Logger
let MigrationRunner: typeof import('./utils/migrationRunner').MigrationRunner

try {
  createServer = require('node:http').createServer
  path = require('node:path')
  cors = require('cors')
  express = require('express')
  helmet = require('helmet')
  const socketIo = require('socket.io')
  Server = socketIo.Server
  const dbModule = require('./config/database')
  initDatabase = dbModule.initDatabase
  const redisModule = require('./config/redis') as typeof import('./config/redis')
  initializeRedis = redisModule.initializeRedis
  const debugModule = require('./debugStartup')
  logStartupDiagnostics = debugModule.logStartupDiagnostics
  testDatabaseConnection = debugModule.testDatabaseConnection
  testMigrationFiles = debugModule.testMigrationFiles
  const rateLimiterModule = require('./middleware/rateLimiter')
  generalApiLimiter = rateLimiterModule.generalApiLimiter
  suspiciousActivityTracker = rateLimiterModule.suspiciousActivityTracker
  adminRoutes = require('./routes/admin').default
  authRoutes = require('./routes/auth').authRoutes
  gameRoutes = require('./routes/game').gameRoutes
  mapRoutes = require('./routes/maps').default
  notificationRoutes = require('./routes/notifications').default
  profileRoutes = require('./routes/profile').default
  skillsRoutes = require('./routes/skills').default
  userRoutes = require('./routes/users').default
  setupSocketHandlers = require('./services/socketService').setupSocketHandlers
  ensureTablesExist = require('./utils/initTables').ensureTablesExist
  logger = require('./utils/logger').logger

  // Now that logger is available, use it for all subsequent logging
  try {
    MigrationRunner = require('./utils/migrationRunner').MigrationRunner
    logger.debug('  ✓ MigrationRunner loaded')
  } catch (e) {
    logger.error('  ✗ Failed to load MigrationRunner:', e)
    throw e
  }
  logger.info('✅ Utils loaded')
} catch (error) {
  const normalized = toKnownError(error)
  const message = normalized.message || 'Unknown startup error'
  process.stderr.write(`❌ Failed to initialize server: ${message}\n`)
  if (normalized.stack) {
    process.stderr.write(`${normalized.stack}\n`)
  }
  process.exit(1)
}

const app = express()
const server = createServer(app)

// Trust proxy for Railway deployment - required for rate limiting behind reverse proxy
// Set to 1 to trust first proxy (Railway's proxy)
app.set('trust proxy', 1)

// Configure allowed origins based on environment
const getAllowedOrigins = (): string[] => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://conquestk.com', 'https://www.conquestk.com']
  }
  const origins = ['http://localhost:5173', 'http://localhost:3000']
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL)
  }
  return origins
}

const corsOptions = {
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}

// Initialize Socket.io first
const io = new Server(server, {
  cors: corsOptions,
})

// Initialize Redis asynchronously and set up adapter if successful
initializeRedis()
  .then(async (redisClients: RedisClients) => {
    const { pubClient, subClient, redisClient } = redisClients

    // Set up Socket.io Redis adapter only if clients are valid and connected
    if (pubClient && subClient) {
      try {
        const { createAdapter } = require('@socket.io/redis-adapter')
        io.adapter(createAdapter(pubClient, subClient))
        logger.info('✅ Socket.io using Redis adapter for multi-server support')
      } catch (error) {
        logger.warn(
          '⚠️ Failed to create Redis adapter, using in-memory adapter:',
          getErrorMessage(error),
        )
      }
    } else {
      logger.warn('⚠️ Socket.io using in-memory adapter (single server only)')
    }

    // Enable Redis session store only if Redis is available
    if (redisClient) {
      const { enableRedisSessionStore } = require('./middleware/session')
      if (enableRedisSessionStore()) {
        logger.info('✅ Session storage upgraded to Redis')
      } else {
        logger.warn('⚠️ Failed to upgrade session storage to Redis')
      }
    } else {
      logger.warn('⚠️ Using in-memory session store (Redis not available)')
    }

    // Create and initialize WorkerManager AFTER Redis is ready
    const workerManager = createWorkerManager(io)
    setWorkerManagerInstance(workerManager)
    try {
      await workerManager.initialize()
      logger.info('✅ WorkerManager created and initialized after Redis connection')
    } catch (error) {
      logger.error('❌ Failed to initialize WorkerManager after Redis:', getErrorMessage(error))
    }
  })
  .catch((err) => {
    logger.warn('⚠️ Redis initialization failed, using in-memory adapters:', getErrorMessage(err))

    // Create and initialize WorkerManager even if Redis failed (graceful degradation)
    const workerManager = createWorkerManager(io)
    setWorkerManagerInstance(workerManager)
    workerManager
      .initialize()
      .then(() => {
        logger.info('✅ WorkerManager initialized without Redis (degraded mode)')
      })
      .catch((error) => {
        logger.error(
          '❌ Failed to initialize WorkerManager in degraded mode:',
          getErrorMessage(error),
        )
      })
  })

const PORT = process.env.PORT || 5001

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
)
app.use(cors(corsOptions))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Initialize session middleware after app is created (starts with in-memory, upgrades to Redis later)
const { createSessionMiddleware, sessionMiddleware } = require('./middleware/session')
createSessionMiddleware() // Initialize the session system
app.use(sessionMiddleware) // Use the wrapper that can handle Redis upgrades

// Apply suspicious activity tracker globally
app.use(suspiciousActivityTracker.middleware())

// Apply general rate limiting to all API routes
app.use('/api', generalApiLimiter)

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/game', gameRoutes)
app.use('/api/maps', mapRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/skills', skillsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/users', userRoutes)
app.use('/api/workflow', require('./routes/mapWorkflow').default)
app.use('/api/terms', require('./routes/terms').default)
app.use('/api/staging', require('./routes/mapStaging').default)
app.use('/api/feature-flags', require('./routes/featureFlags').default)
app.use('/api/queues', require('./routes/queueRoutes').default)
app.use('/api/performance', require('./routes/performanceRoutes').default)
app.use('/api/benchmark', require('./routes/benchmarkRoutes').default)
app.use(
  '/api/preferences',
  require('./routes/preferences').createPreferencesRouter(require('./config/database').getPool()),
)

// Simple test endpoint that doesn't require database
app.get('/test', (_req: Request, res: Response) => {
  res.json({
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    nodeVersion: process.version,
    memory: process.memoryUsage(),
  })
})

app.get('/health', async (_req: Request, res: Response) => {
  let databaseStatus = 'unknown'
  let databaseError = null
  let redisStatus = 'unknown'
  let redisError = null
  let queueStatus = 'unknown'
  let queueError = null

  try {
    const { query } = await import('./config/database')
    await query('SELECT 1')
    databaseStatus = 'connected'
  } catch (error) {
    databaseStatus = 'disconnected'
    databaseError = error instanceof Error ? error.message : 'Unknown error'
  }

  // Check Redis health
  try {
    const { checkRedisHealth } = await import('./config/redis')
    const redisHealth = await checkRedisHealth()
    redisStatus = redisHealth.healthy ? 'connected' : 'disconnected'
    if (!redisHealth.healthy) {
      redisError = redisHealth.message
    }
  } catch (error) {
    redisStatus = 'disconnected'
    redisError = error instanceof Error ? error.message : 'Unknown error'
  }

  // Check queue system health
  try {
    const { getWorkerManagerInstance } = await import('./workers/workerManager')
    const workerManagerInstance = getWorkerManagerInstance()
    if (workerManagerInstance) {
      const queueHealth = await workerManagerInstance.healthCheck()
      queueStatus = queueHealth.status
      if (queueHealth.status !== 'healthy') {
        queueError = queueHealth.details?.error || 'Queue system unhealthy'
      }
    } else {
      queueStatus = 'not-initialized'
      queueError = 'WorkerManager not initialized'
    }
  } catch (error) {
    queueStatus = 'disconnected'
    queueError = error instanceof Error ? error.message : 'Unknown error'
  }

  // Always return 200 OK for server health, but include database, Redis, and queue status
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
  })
})

app.get('/debug/env', (_req: Request, res: Response) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
    DB_HOST: process.env.DB_HOST || 'NOT_SET',
    DB_NAME: process.env.DB_NAME || 'NOT_SET',
    DB_USER: process.env.DB_USER || 'NOT_SET',
    PORT: process.env.PORT,
    timestamp: new Date().toISOString(),
  })
})

app.get('/debug/tables', async (_req: Request, res: Response) => {
  try {
    const { query } = await import('./config/database')

    // Check if tables exist
    const tableCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    let userCount = null
    let adminCount = null
    try {
      const userCountResult = await query('SELECT COUNT(*) as count FROM users')
      userCount = userCountResult.rows[0]?.count || 0
    } catch (_e) {
      userCount = 'Table does not exist'
    }

    try {
      const adminCountResult = await query(`
        SELECT COUNT(*) as count 
        FROM users u 
        JOIN user_admin_roles uar ON u.id = uar.user_id 
        WHERE uar.is_active = true
      `)
      adminCount = adminCountResult.rows[0]?.count || 0
    } catch (_e) {
      adminCount = 'Admin tables do not exist'
    }

    // Get migration status
    let migrationStatus = null
    try {
      const migrationRunner = new MigrationRunner()
      migrationStatus = await migrationRunner.getMigrationStatus()
    } catch (_e) {
      migrationStatus = 'Migration system not available'
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
    })
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
      databaseType: 'postgresql',
      databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set',
      timestamp: new Date().toISOString(),
    })
  }
})

app.get('/debug/migrations', async (_req: Request, res: Response) => {
  try {
    const migrationRunner = new MigrationRunner()
    const migrationStatus = await migrationRunner.getMigrationStatus()

    res.json({
      status: 'OK',
      migrations: migrationStatus,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })
  }
})

// Add Sentry test endpoint (only in development/staging)
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', (_req: Request, _res: Response) => {
    throw new Error('Test Sentry error!')
  })
}

// Serve static frontend files in production-like environments
// Staging should behave exactly like production for testing
const isProductionLike = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
if (isProductionLike) {
  const fs = require('node:fs')
  const frontendPath = path.join(__dirname, '../public')

  logger.info(`📁 Setting up static file serving from: ${frontendPath}`)
  logger.info(`📁 Frontend path exists: ${fs.existsSync(frontendPath)}`)

  if (fs.existsSync(frontendPath)) {
    const files = fs.readdirSync(frontendPath)
    logger.info(`📁 Files in frontend directory: ${files.join(', ')}`)

    const indexExists = fs.existsSync(path.join(frontendPath, 'index.html'))
    logger.info(`📁 index.html exists: ${indexExists}`)
  }

  // IMPORTANT: Serve static files with explicit options
  // This MUST come before the catch-all route
  app.use(
    express.static(frontendPath, {
      maxAge: 0,
      setHeaders: (res: Response, filePath: string) => {
        logger.debug(`📦 Serving static file: ${filePath}`)
        const relativePath = path.relative(frontendPath, filePath)

        // Enforce correct caching behaviour per asset type
        if (relativePath === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
        } else if (relativePath === 'sw.js') {
          res.setHeader('Cache-Control', 'no-cache')
        } else if (relativePath.startsWith('assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400')
        }

        // Set proper content types for assets
        if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=UTF-8')
        } else if (filePath.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css; charset=UTF-8')
        } else if (filePath.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json; charset=UTF-8')
        }
      },
      index: false, // Don't automatically serve index.html
    }),
  )

  // Handle React Router - serve index.html for all non-API and non-asset routes
  // This catch-all route MUST come after static middleware
  app.get('/', (_req: Request, res: Response) => {
    logger.info(`🌐 Root request`)
    const indexPath = path.join(frontendPath, 'index.html')
    logger.info(`📄 Serving index.html from: ${indexPath}`)
    logger.info(`📄 index.html exists: ${fs.existsSync(indexPath)}`)

    return res.sendFile(indexPath, (err) => {
      if (err) {
        logger.error(`❌ Error serving index.html:`, err)
        res.status(500).send('Error serving page')
      } else {
        logger.info(`✅ Successfully served index.html for root`)
      }
    })
  })

  // Handle all other routes for React Router
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Don't interfere with API routes or static assets
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/assets') ||
      req.path.startsWith('/uploads')
    ) {
      return next()
    }

    logger.info(`🌐 Request to: ${req.path}`)
    const indexPath = path.join(frontendPath, 'index.html')

    return res.sendFile(indexPath, (err) => {
      if (err) {
        logger.error(`❌ Error serving index.html:`, err)
        res.status(500).send('Error serving page')
      } else {
        logger.info(`✅ Successfully served index.html for: ${req.path}`)
      }
    })
  })
}

// IMPORTANT: Sentry error handler must be registered AFTER all controllers
// and BEFORE any other error middleware
Sentry.setupExpressErrorHandler(app)

// Custom error handler (comes after Sentry)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const normalizedError = toKnownError(err)
  const sentryResponse = res as Response & { sentry?: string }
  const sentryId = sentryResponse.sentry

  logger.error('Application error:', {
    error: normalizedError.message,
    stack: normalizedError.stack,
    isError: true,
    sentryId,
  })

  const statusCode =
    typeof normalizedError.status === 'number'
      ? normalizedError.status
      : typeof normalizedError.statusCode === 'number'
        ? normalizedError.statusCode
        : 500

  res.status(statusCode).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'An error occurred processing your request'
        : normalizedError.message,
    ...(sentryId && { sentryId }),
    ...(process.env.NODE_ENV !== 'production' && normalizedError.stack
      ? { stack: normalizedError.stack }
      : {}),
  })
})

setupSocketHandlers(io)

// WorkerManager will be created AND initialized after Redis is ready (see Redis initialization block above)
import { createWorkerManager, setWorkerManagerInstance } from './workers/workerManager'

async function startServer() {
  try {
    logger.info('🚀 Starting Risk Game server...')

    // Log comprehensive diagnostics
    logStartupDiagnostics()

    // Start the HTTP server first (should always work)
    // IMPORTANT: Bind to 0.0.0.0 for Railway deployment
    const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT
    server.listen(portNumber, '0.0.0.0', () => {
      logger.info(`✅ HTTP Server successfully listening on 0.0.0.0:${portNumber}`)
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
      logger.info(`📊 Test endpoint: http://localhost:${portNumber}/test`)
      logger.info(`📊 Health check: http://localhost:${portNumber}/health`)
      logger.info(`📅 Server started at: ${new Date().toISOString()}`)

      // Don't await database setup - let it happen in background
      setImmediate(async () => {
        try {
          // First, test if we can even connect to the database
          logger.info('🔄 Testing database connection...')
          const canConnect = await testDatabaseConnection()

          if (!canConnect) {
            logger.error('❌ Cannot connect to database - server running without database')
            return
          }

          // Check migration files exist
          await testMigrationFiles()

          // Now try the actual initialization
          logger.info('🔄 Initializing database connection pool...')
          await initDatabase()
          logger.info('✅ Database connection pool established')

          // Ensure basic tables exist (fallback)
          await ensureTablesExist()
          logger.info('✅ Basic tables verified')

          // Run our enhanced migration system
          const migrationRunner = new MigrationRunner()
          logger.info('🔄 Starting migration system...')

          try {
            await migrationRunner.runPendingMigrations()

            // Validate schema integrity after migrations
            const isValid = await migrationRunner.validateSchemaIntegrity()
            if (!isValid) {
              throw new Error('Schema validation failed after migrations')
            }

            logger.info('✅ All migrations completed and schema validated')
            logger.info('🗄️  Database: PostgreSQL with migration tracking')

            // Ensure owner has admin privileges
            const { ensureOwnerAdmin } = require('./scripts/ensureOwnerAdmin')
            await ensureOwnerAdmin()

            // Background queue workers are now initialized after Redis connection (see Redis initialization block)

            if (process.env.NODE_ENV === 'production') {
              logger.info('🌐 Production deployment ready at https://conquestk.com')
              logger.info('🎮 All game features and admin functionality should be available')
            }
          } catch (migrationError) {
            logger.error('❌ Migration system failed:', migrationError)
            logger.warn('⚠️  Server running with potential schema issues...')
            logger.error(
              '💡 Some features may not work correctly until database is properly configured',
            )
          }
        } catch (dbError) {
          const normalizedDbError = toKnownError(dbError)
          logger.error('❌ Database initialization failed:', normalizedDbError)
          logger.error(`  Error type: ${normalizedDbError.constructor.name}`)
          logger.error(`  Error message: ${normalizedDbError.message}`)
          if (normalizedDbError.stack) {
            logger.error(`  Stack trace: ${normalizedDbError.stack}`)
          }
          logger.warn('⚠️  Server running without database connection')
          logger.error('💡 Database features unavailable')
          logger.error('💡 Check /test endpoint to verify server is running')
          logger.error('💡 Check /debug/env for environment variables')

          if (process.env.NODE_ENV === 'production') {
            logger.info('🚧 Server in degraded mode - database unavailable')
          }
        }
      })
    })
  } catch (startupError) {
    logger.error('💥 FATAL: Server startup failed completely:', startupError)
    if (startupError instanceof Error) {
      logger.error(`  Error: ${startupError.message}`)
      logger.error(`  Stack: ${startupError.stack}`)
    }
    // In production, exit so Railway can restart
    if (process.env.NODE_ENV === 'production') {
      logger.error('Exiting with code 1 for Railway to restart...')
      process.exit(1)
    }
  }
}

// Catch any uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('💥 UNCAUGHT EXCEPTION:', error)
  logger.error(`  Message: ${error.message}`)
  logger.error(`  Stack: ${error.stack}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 UNHANDLED REJECTION at:', promise)
  logger.error('  Reason:', reason)
  process.exit(1)
})

startServer()
