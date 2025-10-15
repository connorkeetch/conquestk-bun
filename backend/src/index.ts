// IMPORTANT: Import Sentry instrumentation before anything else
import './instrument.js'

import os from 'node:os'
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

import { ENV_VARIABLES, validateEnvironmentVariables } from './config/validateEnv.js'
import { getJwtSecrets, hashSecret } from './utils/jwtHelpers.js'

try {
  validateEnvironmentVariables()
} catch (_error) {
  process.exit(1)
}

// Log concise env status for deploy logs (no secret values)
try {
  const env = process.env.NODE_ENV || 'development'
  const requiredMissing = ENV_VARIABLES.filter((v) => v.required && !process.env[v.name]).map(
    (v) => v.name,
  )
  const requiredInvalid = ENV_VARIABLES.filter((v) => {
    const raw = process.env[v.name]
    if (!raw) return false
    return typeof v.validator === 'function' ? !v.validator(raw) : false
  }).map((v) => v.name)

  const recommendedForEnv: string[] = []
  const recommend = (name: string, cond = true) => {
    if (cond && !process.env[name]) recommendedForEnv.push(name)
  }

  const isProdLike = env === 'production' || env === 'staging'
  // High-signal recommendations by environment
  recommend('FRONTEND_URL', isProdLike)
  recommend('CANONICAL_HOST', isProdLike)
  recommend('REDIS_URL', isProdLike)
  recommend('PUBLIC_ASSET_BASE_URL', true)
  recommend('VITE_ASSET_BASE_URL', true)
  recommend('SENTRY_DSN', isProdLike)
  recommend('RESEND_API_KEY', process.env.EMAIL_ENABLED !== 'false')

  logger.info('📋 Env status summary', {
    environment: env,
    requiredMissingCount: requiredMissing.length,
    requiredInvalidCount: requiredInvalid.length,
    recommendedMissingCount: recommendedForEnv.length,
    requiredMissing,
    requiredInvalid,
    recommendedMissing: recommendedForEnv,
  })
} catch (e) {
  // Non-fatal: best-effort logging only
  logger.debug('Env status logging skipped', { error: (e as Error)?.message })
}

// Log JWT secret fingerprints (no secret values)
try {
  const secrets = getJwtSecrets()
  const fingerprints = secrets.map((s) => hashSecret(s))
  logger.info('🔐 JWT secret fingerprints', {
    instancePid: process.pid,
    instanceHost: typeof os.hostname === 'function' ? os.hostname() : 'unknown',
    count: fingerprints.length,
    primary: fingerprints[0] ?? null,
    extras: fingerprints.slice(1),
  })
} catch (e) {
  logger.warn('Could not log JWT secret fingerprints', { error: (e as Error)?.message })
}

import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setEngine as setOddsEngine, setLogger as setOddsLogger } from '@conquestk/shared/odds'
import { createAdapter } from '@socket.io/redis-streams-adapter'
import cors from 'cors'
// Import types first
import type { NextFunction, Request, Response } from 'express'
import express from 'express'
import helmet from 'helmet'
import { Server } from 'socket.io'
import { getPool, initDatabase } from './config/database.js'
import type { RedisClients } from './config/redis.js'
import { initializeRedis } from './config/redis.js'
import { setAiEvalWasmAvailable } from './config/runtimeFlags.js'
import {
  logStartupDiagnostics,
  testDatabaseConnection,
  testMigrationFiles,
} from './debugStartup.js'
import { generalApiLimiter, suspiciousActivityTracker } from './middleware/rateLimiter.js'
import { createSessionMiddleware, sessionMiddleware } from './middleware/session.js'
import adminRoutes from './routes/admin.js'
import adminQueuesRoutes from './routes/adminQueues.js'
import { authRoutes } from './routes/auth.js'
import benchmarkRoutes from './routes/benchmarkRoutes.js'
import clanRoutes from './routes/clans.js'
import featureFlagsRoutes from './routes/featureFlags.js'
import friendsRoutes from './routes/friends.js'
import { gameRoutes } from './routes/game.js'
import mapApprovalRoutes from './routes/mapApproval.js'
import mapStagingRoutes from './routes/mapStaging.js'
import mapRoutes from './routes/maps.js'
import mapWorkflowRoutes from './routes/mapWorkflow.js'
import matchsvcRoutes from './routes/matchsvc.js'
import messagesRoutes from './routes/messages.js'
import notificationRoutes from './routes/notifications.js'
import oddsRoutes from './routes/odds.js'
import performanceRoutes from './routes/performanceRoutes.js'
import { createPreferencesRouter } from './routes/preferences.js'
import profileRoutes from './routes/profile.js'
import queueRoutes from './routes/queueRoutes.js'
import replayRoutes from './routes/replay.js'
import rumVitalsRoutes from './routes/rumVitals.js'
import skillsRoutes from './routes/skills.js'
import termsRoutes from './routes/terms.js'
import userRoutes from './routes/users.js'
import { cdnService } from './services/cdnService.js'
import { databaseClusterService } from './services/databaseClusterService.js'
import { memoryDiagnosticsService } from './services/memoryDiagnosticsService.js'
import { setupSocketHandlers } from './services/socketService.js'
import type { ClientToServerEvents, ServerToClientEvents } from './types/shared.js'
import { getErrorMessage, toKnownError } from './utils/errorHelpers.js'
import { ensureTablesExist } from './utils/initTables.js'
import { logger } from './utils/logger.js'
import { MigrationRunner } from './utils/migrationRunner.js'
import { createWorkerManager, setWorkerManagerInstance } from './workers/workerManager.js'

const app = express()
const server = createServer(app)

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Trust proxy for Railway deployment - required for rate limiting behind reverse proxy
// Set to 1 to trust first proxy (Railway's proxy)
app.set('trust proxy', 1)

// Enforce a canonical host in production to avoid split state across www/apex
// This prevents users from landing on different origins with separate localStorage/session state
// and ensures all requests (including /api) resolve under the same host.
app.use((req, res, next) => {
  try {
    const isProd = process.env.NODE_ENV === 'production'
    if (!isProd) return next()

    // Do not redirect Socket.IO handshake/upgrade requests; redirecting the
    // initial GET to /socket.io breaks Engine.IO upgrade and causes reconnect loops.
    if (req.path?.startsWith('/socket.io')) {
      return next()
    }

    const headerHost = (req.headers.host || '').toLowerCase()
    if (!headerHost) return next()

    const hostWithoutPort = headerHost.split(':')[0]
    const canonical = (process.env.CANONICAL_HOST || 'conquestk.com').toLowerCase()

    // Allow health checks or localhost during odd proxies
    if (
      hostWithoutPort === canonical ||
      hostWithoutPort === 'localhost' ||
      hostWithoutPort === '127.0.0.1'
    ) {
      return next()
    }

    // Only redirect GET/HEAD (safe to redirect); let non-idempotent requests proceed
    if (req.method === 'GET' || req.method === 'HEAD') {
      const target = `${req.protocol}://${canonical}${req.originalUrl}`
      return res.redirect(308, target)
    }

    return next()
  } catch {
    return next()
  }
})

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
const io: Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, unknown>,
  { userId?: string }
> = new Server(server, {
  cors: corsOptions,
  // Enable connection state recovery for client resilience on brief disconnects
  connectionStateRecovery: {
    // Make recovery window explicit; defaults are short but adequate
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
})

// Log Engine.IO handshake/upgrade issues to aid diagnosis
io.engine.on('connection_error', (err) => {
  try {
    logger.warn('Engine.IO connection error', {
      code: (err as unknown as { code?: string })?.code,
      message: (err as Error).message,
      context: (err as unknown as { context?: unknown })?.context,
    })
  } catch {
    // no-op: avoid throwing from logging path
  }
})

// Background Redis re-initialization with backoff (when not available at boot)
let redisRetryTimer: NodeJS.Timeout | null = null
let redisRetryAttempts = 0

async function enableRedisBackedFeatures(
  ioRef: Server<ClientToServerEvents, ServerToClientEvents>,
  redisClients: RedisClients,
) {
  const { redisClient } = redisClients

  // Set up Socket.io Redis Streams adapter if Redis is available
  if (redisClient) {
    try {
      ioRef.adapter(createAdapter(redisClient))
      logger.info('✅ Socket.io using Redis Streams adapter for multi-server support')
    } catch (error) {
      logger.warn(
        '⚠️ Failed to create Redis Streams adapter, using in-memory adapter:',
        getErrorMessage(error),
      )
    }
  } else {
    logger.warn('⚠️ Socket.io using in-memory adapter (single server only)')
  }

  // Enable Redis session store only if Redis is available
  if (redisClient) {
    const { enableRedisSessionStore } = await import('./middleware/session.js')
    if (enableRedisSessionStore()) {
      logger.info('✅ Session storage upgraded to Redis')
    } else {
      logger.warn('⚠️ Failed to upgrade session storage to Redis')
    }
  } else {
    logger.warn('⚠️ Using in-memory session store (Redis not available)')
  }

  // Create and initialize WorkerManager AFTER Redis is ready
  const workerManager = createWorkerManager(ioRef)
  setWorkerManagerInstance(workerManager)
  try {
    await workerManager.initialize()
    logger.info('✅ WorkerManager created and initialized after Redis connection')
  } catch (error) {
    logger.error('❌ Failed to initialize WorkerManager after Redis:', getErrorMessage(error))
  }

  // Start matchsvc subscriber after Redis is ready
  if (redisClient) {
    try {
      const { startMatchSvcSubscriber } = await import('./services/matchSvcIntegration.js')
      await startMatchSvcSubscriber(ioRef)
    } catch (e) {
      logger.warn('⚠️ Failed to start matchsvc subscriber', getErrorMessage(e))
    }
  }
}

function scheduleRedisRetry(ioRef: Server<ClientToServerEvents, ServerToClientEvents>) {
  if (redisRetryTimer) return
  const attempt = async () => {
    try {
      const clients = await initializeRedis()
      if (clients.redisClient) {
        logger.info('✅ Redis became available, enabling Redis-backed features')
        if (redisRetryTimer) {
          clearInterval(redisRetryTimer)
          redisRetryTimer = null
        }
        redisRetryAttempts = 0
        await enableRedisBackedFeatures(ioRef, clients)
        return
      }
    } catch (e) {
      logger.warn('Redis retry attempt failed:', getErrorMessage(e))
    }
    // Schedule next attempt with capped exponential backoff + jitter
    redisRetryAttempts += 1
    const base = Math.min(60_000, 5_000 * 2 ** Math.max(0, redisRetryAttempts - 1))
    const jitter = Math.floor(Math.random() * 1_000)
    const delay = base + jitter
    logger.info(`Next Redis retry in ${Math.round(delay / 1000)}s`)
    if (redisRetryTimer) clearTimeout(redisRetryTimer)
    redisRetryTimer = setTimeout(attempt, delay)
  }
  // start immediate attempt
  redisRetryTimer = setTimeout(attempt, 0)
}

// Configure odds engine (TS/WASM/SHADOW) based on environment
try {
  const oddsEnv = (process.env.ODDS_ENGINE || 'ts').toLowerCase()
  if (oddsEnv === 'ts' || oddsEnv === 'wasm' || oddsEnv === 'shadow') {
    setOddsEngine(oddsEnv as 'ts' | 'wasm' | 'shadow')
    setOddsLogger((entry) => logger.info('odds', entry as Record<string, unknown>))
    logger.info('🔧 Odds engine configured', { engine: oddsEnv })
  } else {
    setOddsEngine('ts')
    logger.warn('Unrecognized ODDS_ENGINE; defaulting to ts', { value: oddsEnv })
  }
} catch (e) {
  logger.warn('Failed to configure odds engine; using defaults', { error: (e as Error)?.message })
}

// Detect WASM availability once at startup for AI eval gating
void (async () => {
  try {
    const spec = '@conquestk/wasm-odds' as string
    const mod = (await import(spec)) as { loadWasm: () => Promise<{ version: () => string }> }
    const api = await mod.loadWasm()
    const version = typeof api?.version === 'function' ? api.version() : 'unknown'
    setAiEvalWasmAvailable(true)
    logger.info('🧠 AI eval: WASM available', { version })
  } catch (e) {
    // Ensure the flag is unset when unavailable
    setAiEvalWasmAvailable(false)
    logger.info('🧠 AI eval: WASM unavailable; will use TS', { error: (e as Error)?.message })
  }
})()

// Initialize ancillary monitoring services (non-blocking)
void (async () => {
  try {
    await databaseClusterService.initialize()
  } catch (e) {
    logger.warn(
      '⚠️ DatabaseClusterService init failed; health will show not_configured',
      getErrorMessage(e),
    )
  }
  try {
    await cdnService.initialize()
  } catch (e) {
    logger.warn('⚠️ CDN service init failed; health will show not_configured', getErrorMessage(e))
  }
})()

// Initialize Redis asynchronously and set up adapter if successful
initializeRedis()
  .then(async (redisClients: RedisClients) => {
    await enableRedisBackedFeatures(io, redisClients)
  })
  .catch((err) => {
    logger.warn('⚠️ Redis initialization failed, starting without Redis:', getErrorMessage(err))
    // Schedule background retries; features will be upgraded when Redis becomes available
    scheduleRedisRetry(io)
  })

const PORT = process.env.PORT || 5001

const assetBaseUrl = process.env.PUBLIC_ASSET_BASE_URL?.trim()
let assetOrigin: string | undefined
if (assetBaseUrl) {
  try {
    assetOrigin = new URL(assetBaseUrl).origin
  } catch (error) {
    logger?.warn?.('Invalid PUBLIC_ASSET_BASE_URL provided; falling back to self-hosted assets', {
      value: assetBaseUrl,
      error,
    })
  }
}

const addUniqueSources = (sources: string[], values: (string | undefined)[]) => {
  values.forEach((value) => {
    if (!value) return
    if (!sources.includes(value)) {
      sources.push(value)
    }
  })
}

const imgSources = ["'self'", 'data:', 'blob:']
const mediaSources = ["'self'", 'blob:']
const fontSources = ["'self'", 'data:']
const styleSources = ["'self'", "'unsafe-inline'"]
const scriptSources = ["'self'", "'unsafe-inline'"]
const connectSources = ["'self'", 'wss:', 'ws:']

if (assetOrigin) {
  addUniqueSources(imgSources, [assetOrigin])
  addUniqueSources(mediaSources, [assetOrigin])
  addUniqueSources(fontSources, [assetOrigin])
  addUniqueSources(connectSources, [assetOrigin])
}

const cloudflareScriptOrigins = ['https://static.cloudflareinsights.com']
const cloudflareConnectOrigins = [
  'https://cloudflareinsights.com',
  'https://static.cloudflareinsights.com',
]

addUniqueSources(scriptSources, cloudflareScriptOrigins)
addUniqueSources(connectSources, cloudflareConnectOrigins)

// Allow Google Fonts for theme heading fonts (Audiowide/Rye)
addUniqueSources(styleSources, ['https://fonts.googleapis.com'])
addUniqueSources(fontSources, ['https://fonts.gstatic.com'])

// Security middleware
app.use(
  helmet({
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
    dnsPrefetchControl: { allow: true },
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
createSessionMiddleware() // Initialize the session system
app.use(sessionMiddleware) // Use the wrapper that can handle Redis upgrades

// Apply suspicious activity tracker globally
app.use(suspiciousActivityTracker.middleware())

// Set strict content-type handling and prevent caching of API responses
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})

// Apply general rate limiting to all API routes, but skip lightweight admin status checks
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  // Skip rate limiting for admin status probe used by the frontend shell
  if (req.path === '/admin/status') {
    return next()
  }
  return generalApiLimiter(req, res, next)
})

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/game', gameRoutes)
app.use('/api/games', replayRoutes)
app.use('/api/maps', mapRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/skills', skillsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/admin/queues', adminQueuesRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/users', userRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/clans', clanRoutes)
app.use('/api/friends', friendsRoutes)
app.use('/api/workflow', mapWorkflowRoutes)
app.use('/api/map-approval', mapApprovalRoutes)
app.use('/api/terms', termsRoutes)
app.use('/api/staging', mapStagingRoutes)
app.use('/api/feature-flags', featureFlagsRoutes)
app.use('/api/queues', queueRoutes)
app.use('/api/performance', performanceRoutes)
app.use('/api/rum', rumVitalsRoutes)
app.use('/api/benchmark', benchmarkRoutes)
app.use('/api/odds', oddsRoutes)
app.use('/api/matchsvc', matchsvcRoutes)
app.use('/api/preferences', createPreferencesRouter(getPool()))

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

// Health endpoint (direct)
app.get('/health', async (_req: Request, res: Response) => {
  let databaseStatus = 'unknown'
  let databaseError = null
  let redisStatus = 'unknown'
  let redisError = null
  let queueStatus = 'unknown'
  let queueError = null

  try {
    const { query } = await import('./config/database.js')
    await query('SELECT 1')
    databaseStatus = 'connected'
  } catch (error) {
    databaseStatus = 'disconnected'
    databaseError = error instanceof Error ? error.message : 'Unknown error'
  }

  // Check Redis health
  try {
    const { checkRedisHealth } = await import('./config/redis.js')
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
    const { getWorkerManagerInstance } = await import('./workers/workerManager.js')
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

// Health endpoint under /api for production proxy compatibility
app.get('/api/health', async (_req: Request, res: Response) => {
  let databaseStatus = 'unknown'
  let databaseError = null
  let redisStatus = 'unknown'
  let redisError = null
  let queueStatus = 'unknown'
  let queueError = null

  try {
    const { query } = await import('./config/database.js')
    await query('SELECT 1')
    databaseStatus = 'connected'
  } catch (error) {
    databaseStatus = 'disconnected'
    databaseError = error instanceof Error ? error.message : 'Unknown error'
  }

  // Check Redis health
  try {
    const { checkRedisHealth } = await import('./config/redis.js')
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
    const { getWorkerManagerInstance } = await import('./workers/workerManager.js')
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
    const { query } = await import('./config/database.js')

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
  ;(async () => {
    const fsModule = await import('node:fs')
    const { existsSync, readdirSync } = fsModule
    const frontendPath = path.join(__dirname, '../public')

    logger.debug(`📁 Setting up static file serving from: ${frontendPath}`)
    logger.debug(`📁 Frontend path exists: ${existsSync(frontendPath)}`)

    if (existsSync(frontendPath)) {
      const files = readdirSync(frontendPath)
      logger.debug(`📁 Files in frontend directory: ${files.join(', ')}`)

      const indexExists = fsModule.existsSync(path.join(frontendPath, 'index.html'))
      logger.debug(`📁 index.html exists: ${indexExists}`)
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
          } else if (
            relativePath.startsWith('assets/') ||
            /^favicon-\d+x\d+\.png$/.test(relativePath) ||
            /^apple-touch-icon-\d+\.png$/.test(relativePath) ||
            /^icon-\d+\.png$/.test(relativePath) ||
            relativePath === 'safari-pinned-tab.svg' ||
            relativePath === 'conquest_k_logo.svg'
          ) {
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
      const indexPath = path.join(frontendPath, 'index.html')

      return res.sendFile(indexPath, (err) => {
        if (err) {
          logger.error(`Failed to serve index.html for root path`, { error: err.message })
          res.status(500).send('Error serving page')
        }
        // Success case - no logging needed, this happens constantly
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

      const indexPath = path.join(frontendPath, 'index.html')

      return res.sendFile(indexPath, (err) => {
        if (err) {
          logger.error(`Failed to serve index.html`, { path: req.path, error: err.message })
          res.status(500).send('Error serving page')
        }
        // Success case - no logging needed for normal SPA routing
      })
    })
  })().catch((e) => logger.warn('Static frontend setup failed', getErrorMessage(e)))
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

memoryDiagnosticsService.start()

// WorkerManager will be created AND initialized after Redis is ready (see Redis initialization block above)

async function startServer() {
  try {
    logger.info('🚀 Starting ConquestK server...')

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
            const { ensureOwnerAdmin } = await import('./scripts/ensureOwnerAdmin.js')
            await ensureOwnerAdmin()

            // Optionally enforce deploy accounts (owner + test users) on start
            if (process.env.RUN_DEPLOY_ACCOUNT_ENFORCEMENT_ON_START === 'true') {
              try {
                const { ensureDeployAccounts } = await import('./scripts/ensureDeployAccounts.js')
                logger.info('🔐 Enforcing deploy accounts (owner + tests)')
                await ensureDeployAccounts()
              } catch (e) {
                logger.warn('Failed to enforce deploy accounts on start:', getErrorMessage(e))
              }
            }

            // Optionally sync feature flags from code usage into DB
            if (process.env.SYNC_FEATURE_FLAGS_ON_START === 'true') {
              try {
                const { spawnSync } = await import('node:child_process')
                const scriptPath = path.join(__dirname, 'scripts', 'checkFeatureFlags.js')
                logger.info('🏁 Syncing feature flags from code usage into DB')
                const result = spawnSync(process.execPath, [scriptPath, '--apply'], {
                  stdio: 'ignore',
                  env: process.env,
                })
                if (result.status === 0) {
                  logger.info('✅ Feature flags sync completed')
                } else {
                  logger.warn('⚠️ Feature flags sync exited with non-zero status')
                }
              } catch (e) {
                logger.warn('Failed to sync feature flags on start:', getErrorMessage(e))
              }
            }

            // Background queue workers are now initialized after Redis connection (see Redis initialization block)

            // Lightweight stale session sweeper
            try {
              const { authTrackingService } = await import('./services/authTrackingService.js')
              const maxAgeHours = parseInt(process.env.SESSION_MAX_AGE_HOURS || '168', 10) // default 7 days
              const sweepMinutes = parseInt(process.env.SESSION_SWEEP_INTERVAL_MINUTES || '60', 10) // default hourly

              // Run once on startup
              await authTrackingService.closeStaleSessions(maxAgeHours)

              // Then schedule periodic sweeps
              setInterval(
                () => {
                  authTrackingService
                    .closeStaleSessions(maxAgeHours)
                    .catch((e) => logger.warn('Stale session sweep failed', getErrorMessage(e)))
                },
                Math.max(1, sweepMinutes) * 60 * 1000,
              )

              logger.info('🧹 Stale session sweeper enabled', {
                maxAgeHours,
                sweepMinutes,
              })
            } catch (e) {
              logger.warn('Failed to initialize stale session sweeper', getErrorMessage(e))
            }

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
