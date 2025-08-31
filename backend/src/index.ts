// First, log the very start of the application
console.log('🚀 Starting application...')
console.log(`NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`Current directory: ${process.cwd()}`)
console.log(`Script directory: ${__dirname}`)

import dotenv from 'dotenv'

// Load environment variables FIRST before any other imports
// Only load .env file in development - production uses Railway's environment variables
if (process.env.NODE_ENV !== 'production') {
  console.log('📋 Loading .env file (development mode)')
  const result = dotenv.config()
  if (result.error) {
    console.error('❌ Error loading .env file:', result.error)
  } else {
    console.log(`✅ Loaded .env file with ${Object.keys(result.parsed || {}).length} variables`)
  }
} else {
  console.log('🏭 Production mode - using Railway environment variables')
  console.log('Environment variables available:')
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? 'SET (' + process.env.DATABASE_URL.length + ' chars)' : 'NOT SET'}`)
  console.log(`  JWT_SECRET: ${process.env.JWT_SECRET ? 'SET' : 'NOT SET'}`)
  console.log(`  SESSION_SECRET: ${process.env.SESSION_SECRET ? 'SET' : 'NOT SET'}`)
  console.log(`  PORT: ${process.env.PORT || 'NOT SET'}`)
}

// Validate environment variables immediately after loading
console.log('🔍 Starting environment validation...')
import { validateEnvironmentVariables } from './config/validateEnv'
try {
  validateEnvironmentVariables()
  console.log('✅ Environment validation completed')
} catch (error) {
  console.error('❌ Environment validation failed:', error)
  process.exit(1)
}

// Import types first
import type { Request, Response } from 'express'

// Wrap all imports in try-catch to identify which one is failing
let createServer: any, path: any, cors: any, express: any, helmet: any, Server: any
let initDatabase: any, logStartupDiagnostics: any, testDatabaseConnection: any, testMigrationFiles: any
let generalApiLimiter: any, suspiciousActivityTracker: any
let adminRoutes: any, authRoutes: any, gameRoutes: any, mapRoutes: any
let notificationRoutes: any, profileRoutes: any, skillsRoutes: any, userRoutes: any
let setupSocketHandlers: any, ensureTablesExist: any, logger: any, MigrationRunner: any

try {
  console.log('📦 Loading core modules...')
  createServer = require('node:http').createServer
  path = require('node:path')
  cors = require('cors')
  express = require('express')
  helmet = require('helmet')
  const socketIo = require('socket.io')
  Server = socketIo.Server
  console.log('✅ Core modules loaded')
  
  console.log('📦 Loading config modules...')
  const dbModule = require('./config/database')
  initDatabase = dbModule.initDatabase
  const debugModule = require('./debugStartup')
  logStartupDiagnostics = debugModule.logStartupDiagnostics
  testDatabaseConnection = debugModule.testDatabaseConnection
  testMigrationFiles = debugModule.testMigrationFiles
  console.log('✅ Config modules loaded')
  
  console.log('📦 Loading middleware...')
  const rateLimiterModule = require('./middleware/rateLimiter')
  generalApiLimiter = rateLimiterModule.generalApiLimiter
  suspiciousActivityTracker = rateLimiterModule.suspiciousActivityTracker
  console.log('✅ Middleware loaded')
  
  console.log('📦 Loading routes...')
  adminRoutes = require('./routes/admin').default
  authRoutes = require('./routes/auth').authRoutes
  gameRoutes = require('./routes/game').gameRoutes
  mapRoutes = require('./routes/maps').default
  notificationRoutes = require('./routes/notifications').default
  profileRoutes = require('./routes/profile').default
  skillsRoutes = require('./routes/skills').default
  userRoutes = require('./routes/users').default
  console.log('✅ Routes loaded')
  
  console.log('📦 Loading services...')
  setupSocketHandlers = require('./services/socketService').setupSocketHandlers
  console.log('✅ Services loaded')
  
  console.log('📦 Loading utils...')
  try {
    ensureTablesExist = require('./utils/initTables').ensureTablesExist
    console.log('  ✓ initTables loaded')
  } catch (e) {
    console.error('  ✗ Failed to load initTables:', e)
    throw e
  }
  try {
    logger = require('./utils/logger').logger
    console.log('  ✓ logger loaded')
  } catch (e) {
    console.error('  ✗ Failed to load logger:', e)
    throw e
  }
  try {
    MigrationRunner = require('./utils/migrationRunner').MigrationRunner
    console.log('  ✓ MigrationRunner loaded')
  } catch (e) {
    console.error('  ✗ Failed to load MigrationRunner:', e)
    throw e
  }
  console.log('✅ Utils loaded')
} catch (error) {
  console.error('❌ FATAL: Failed to load modules:', error)
  if (error instanceof Error) {
    console.error('  Error:', error.message)
    console.error('  Stack:', error.stack)
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

const io = new Server(server, {
  cors: corsOptions,
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

// Apply suspicious activity tracker globally
app.use(suspiciousActivityTracker.middleware())

// Apply general rate limiting to all API routes
app.use('/api', generalApiLimiter as any)

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

  try {
    const { query } = await import('./config/database')
    await query('SELECT 1')
    databaseStatus = 'connected'
  } catch (error) {
    databaseStatus = 'disconnected'
    databaseError = error instanceof Error ? error.message : 'Unknown error'
  }

  // Always return 200 OK for server health, but include database status
  res.json({
    status: 'OK',
    server: 'running',
    database: databaseStatus,
    environment: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
    timestamp: new Date().toISOString(),
    ...(databaseError && { databaseError }),
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

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../public')

  // IMPORTANT: Serve static files with explicit options
  // This MUST come before the catch-all route
  app.use(
    express.static(frontendPath, {
      maxAge: '1d',
      setHeaders: (res: Response, filePath: string) => {
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

  // Explicitly handle asset requests to ensure they don't fall through
  app.get('/assets/*', (_req: Request, res: Response) => {
    // If we reach here, the asset wasn't found
    res.status(404).send('Asset not found')
  })

  // Handle React Router - serve index.html for all non-API and non-asset routes
  app.get('*', (req: Request, res: Response) => {
    // Don't serve index.html for API routes or assets
    if (req.path.startsWith('/api') || req.path.startsWith('/assets')) {
      return res.status(404).send('Not found')
    }

    const indexPath = path.join(frontendPath, 'index.html')
    return res.sendFile(indexPath)
  })
}

setupSocketHandlers(io)

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
        } catch (dbError: any) {
          logger.error('❌ Database initialization failed:', dbError)
          logger.error(`  Error type: ${dbError.constructor.name}`)
          logger.error(`  Error message: ${dbError.message}`)
          if (dbError.stack) {
            logger.error(`  Stack trace: ${dbError.stack}`)
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
