/**
 * ConquestK Server - Colyseus + Bun
 *
 * Single entry point that combines:
 * - Colyseus WebSocket server (@colyseus/ws-transport) for real-time game rooms
 * - Express REST API on Bun's native node:http (shared port with Colyseus)
 * - All middleware (CORS, helmet, session, rate limiting, etc.)
 */

// IMPORTANT: Import Sentry instrumentation before anything else
import './instrument.js'

import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { logger } from './utils/logger.js'

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
  recommend('FRONTEND_URL', isProdLike)
  recommend('CANONICAL_HOST', isProdLike)
  recommend('REDIS_URL', isProdLike)
  recommend('PUBLIC_ASSET_BASE_URL', true)
  recommend('VITE_ASSET_BASE_URL', true)
  recommend('SENTRY_DSN', isProdLike)
  recommend('RESEND_API_KEY', process.env.EMAIL_ENABLED !== 'false')

  logger.info('Env status summary', {
    environment: env,
    requiredMissingCount: requiredMissing.length,
    requiredInvalidCount: requiredInvalid.length,
    recommendedMissingCount: recommendedForEnv.length,
    requiredMissing,
    requiredInvalid,
    recommendedMissing: recommendedForEnv,
  })
} catch (e) {
  logger.debug('Env status logging skipped', { error: (e as Error)?.message })
}

// Log JWT secret fingerprints (no secret values)
try {
  const secrets = getJwtSecrets()
  const fingerprints = secrets.map((s) => hashSecret(s))
  logger.info('JWT secret fingerprints', {
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
import { RedisDriver } from '@colyseus/redis-driver'
import { RedisPresence } from '@colyseus/redis-presence'
import { WebSocketTransport } from '@colyseus/ws-transport'
// Utility imports
import { setEngine as setOddsEngine, setLogger as setOddsLogger } from '@conquestk/shared/odds'
// Colyseus imports
import { Server } from 'colyseus'
// Express middleware imports
import cors from 'cors'
import type { Application, NextFunction, Request, Response } from 'express'
import express from 'express'
import helmet from 'helmet'
// Config imports
import { getPool, initDatabase } from './config/database.js'
import type { RedisClients } from './config/redis.js'
import { initializeRedis } from './config/redis.js'
import { setAiEvalWasmAvailable } from './config/runtimeFlags.js'
import {
  logStartupDiagnostics,
  testDatabaseConnection,
  testMigrationFiles,
} from './debugStartup.js'
// Middleware imports
import { bunIpPolyfill } from './middleware/bunIpPolyfill.js'
import {
  generalApiLimiter,
  readHeavyLimiter,
  suspiciousActivityTracker,
} from './middleware/rateLimiter.js'
import { createSessionMiddleware, sessionMiddleware } from './middleware/session.js'
// Room imports
import { GameRoom } from './rooms/GameRoom.js'
// Route imports
import adminRoutes from './routes/admin.js'
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
import messagesRoutes from './routes/messages.js'
import metricsRoutes from './routes/metricsRoutes.js'
import notificationRoutes from './routes/notifications.js'
import oddsRoutes from './routes/odds.js'
import performanceRoutes from './routes/performanceRoutes.js'
import { createPreferencesRouter } from './routes/preferences.js'
import profileRoutes from './routes/profile.js'
import replayRoutes from './routes/replay.js'
import rumVitalsRoutes from './routes/rumVitals.js'
import skillsRoutes from './routes/skills.js'
import termsRoutes from './routes/terms.js'
import userRoutes from './routes/users.js'
// Service imports
import { cdnService } from './services/cdnService.js'
import { databaseClusterService } from './services/databaseClusterService.js'
import { memoryDiagnosticsService } from './services/memoryDiagnosticsService.js'
import { getErrorMessage, toKnownError } from './utils/errorHelpers.js'
import { ensureTablesExist } from './utils/initTables.js'
import { MigrationRunner } from './utils/migrationRunner.js'

// Declare Bun global for TypeScript (available at runtime when running under Bun)
declare const Bun: { version: string } | undefined

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = parseInt(process.env.PORT || '5001', 10)

// Configure allowed origins based on environment
const getAllowedOrigins = (): string[] => {
  const origins: string[] = []

  // Always add FRONTEND_URL if set (primary source of truth)
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL)
  }

  // Add CORS_ORIGIN if set (can be comma-separated)
  if (process.env.CORS_ORIGIN) {
    const corsOrigins = process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    origins.push(...corsOrigins)
  }

  // Add localhost for development
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
    origins.push('http://localhost:5173', 'http://localhost:3000')
  }

  // Deduplicate
  return [...new Set(origins)]
}

const corsOptions = {
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}

// Asset CSP configuration
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

// Allow Google Fonts for theme heading fonts
addUniqueSources(styleSources, ['https://fonts.googleapis.com'])
addUniqueSources(fontSources, ['https://fonts.gstatic.com'])

// Background Redis re-initialization with backoff
let redisRetryTimer: ReturnType<typeof setTimeout> | null = null
let redisRetryAttempts = 0

async function enableRedisBackedFeatures(redisClients: RedisClients) {
  const { redisClient } = redisClients

  if (redisClient) {
    const { enableRedisSessionStore } = await import('./middleware/session.js')
    if (enableRedisSessionStore()) {
      logger.info('Session storage upgraded to Redis')
    } else {
      logger.warn('Failed to upgrade session storage to Redis')
    }
  } else {
    logger.warn('Using in-memory session store (Redis not available)')
  }
}

function scheduleRedisRetry() {
  if (redisRetryTimer) return
  const attempt = async () => {
    try {
      const clients = await initializeRedis()
      if (clients.redisClient) {
        logger.info('Redis became available, enabling Redis-backed features')
        if (redisRetryTimer) {
          clearInterval(redisRetryTimer)
          redisRetryTimer = null
        }
        redisRetryAttempts = 0
        await enableRedisBackedFeatures(clients)
        return
      }
    } catch (e) {
      logger.warn('Redis retry attempt failed:', getErrorMessage(e))
    }
    redisRetryAttempts += 1
    const base = Math.min(60_000, 5_000 * 2 ** Math.max(0, redisRetryAttempts - 1))
    const jitter = Math.floor(Math.random() * 1_000)
    const delay = base + jitter
    logger.info(`Next Redis retry in ${Math.round(delay / 1000)}s`)
    if (redisRetryTimer) clearTimeout(redisRetryTimer)
    redisRetryTimer = setTimeout(attempt, delay)
  }
  redisRetryTimer = setTimeout(attempt, 0)
}

// Configure odds engine
try {
  const oddsEnv = (process.env.ODDS_ENGINE || 'ts').toLowerCase()
  if (oddsEnv === 'ts' || oddsEnv === 'wasm' || oddsEnv === 'shadow') {
    setOddsEngine(oddsEnv as 'ts' | 'wasm' | 'shadow')
    setOddsLogger((entry) => logger.info('odds', entry as Record<string, unknown>))
    logger.info('Odds engine configured', { engine: oddsEnv })
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
    logger.info('AI eval: WASM available', { version })
  } catch (e) {
    setAiEvalWasmAvailable(false)
    logger.info('AI eval: WASM unavailable; will use TS', { error: (e as Error)?.message })
  }
})()

// Initialize ancillary monitoring services (non-blocking)
void (async () => {
  try {
    await databaseClusterService.initialize()
  } catch (e) {
    logger.warn(
      'DatabaseClusterService init failed; health will show not_configured',
      getErrorMessage(e),
    )
  }
  try {
    await cdnService.initialize()
  } catch (e) {
    logger.warn('CDN service init failed; health will show not_configured', getErrorMessage(e))
  }
})()

// Initialize Redis asynchronously
initializeRedis()
  .then(async (redisClients: RedisClients) => {
    await enableRedisBackedFeatures(redisClients)
  })
  .catch((err) => {
    logger.warn('Redis initialization failed, starting without Redis:', getErrorMessage(err))
    scheduleRedisRetry()
  })

// Configure Express app with middleware
function configureExpressApp(app: Application) {
  // Trust proxy for Railway deployment
  app.set('trust proxy', 1)

  // Resolve the real client IP from proxy headers (Cloudflare cf-connecting-ip /
  // x-forwarded-for) — more reliable behind Cloudflare+Railway than Express's
  // trust-proxy chain. Must run before rate-limiting and audit logging.
  app.use(bunIpPolyfill)

  // Canonical host redirect in production
  app.use((req, res, next) => {
    try {
      const isProd = process.env.NODE_ENV === 'production'
      if (!isProd) return next()

      if (req.path?.startsWith('/socket.io') || req.path?.startsWith('/colyseus')) {
        return next()
      }

      const headerHost = (req.headers.host || '').toLowerCase()
      if (!headerHost) return next()

      const hostWithoutPort = headerHost.split(':')[0]
      // Only perform canonical redirect if CANONICAL_HOST is explicitly set
      const canonical = process.env.CANONICAL_HOST?.trim().toLowerCase()

      // Skip redirect if no canonical host configured
      if (!canonical) return next()

      if (
        hostWithoutPort === canonical ||
        hostWithoutPort === 'localhost' ||
        hostWithoutPort === '127.0.0.1'
      ) {
        return next()
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const target = `${req.protocol}://${canonical}${req.originalUrl}`
        return res.redirect(308, target)
      }

      return next()
    } catch {
      return next()
    }
  })

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

  // Session middleware
  createSessionMiddleware()
  app.use(sessionMiddleware)

  // Suspicious activity tracker
  app.use(suspiciousActivityTracker.middleware())

  // Content-type and cache-control headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store')
    }
    next()
  })

  // Rate limiting for API routes
  // Apply lenient rate limiting for read-heavy endpoints (maps, game state, rooms)
  app.use('/api/maps', readHeavyLimiter)
  app.use('/api/game', readHeavyLimiter)
  app.use('/api/games', readHeavyLimiter)

  // Apply general rate limiting to all other API routes
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
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
  app.use('/api/performance', performanceRoutes)
  app.use('/api/rum', rumVitalsRoutes)
  app.use('/api/benchmark', benchmarkRoutes)
  app.use('/api/odds', oddsRoutes)
  app.use('/api/metrics', metricsRoutes)
  app.use('/api/preferences', createPreferencesRouter(getPool()))

  // Test endpoint
  app.get('/test', (_req: Request, res: Response) => {
    res.json({
      message: 'ConquestK Server is running!',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      runtime: 'bun',
      nodeVersion: process.version,
      bunVersion: typeof Bun !== 'undefined' ? Bun.version : 'N/A',
      memory: process.memoryUsage(),
    })
  })

  // Health endpoints
  app.get('/health', async (_req: Request, res: Response) => {
    const healthData = await getHealthData()
    res.json(healthData)
  })

  app.get('/api/health', async (_req: Request, res: Response) => {
    const healthData = await getHealthData()
    res.json(healthData)
  })

  // Debug endpoints
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

      const tableCheck = await query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `)

      let userCount: number | string = 'Table does not exist'
      let adminCount: number | string = 'Admin tables do not exist'

      try {
        const userCountResult = await query('SELECT COUNT(*) as count FROM users')
        userCount = userCountResult.rows[0]?.count || 0
      } catch (_e) {
        // Keep default
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
        // Keep default
      }

      let migrationStatus: unknown = 'Migration system not available'
      try {
        const migrationRunner = new MigrationRunner()
        migrationStatus = await migrationRunner.getMigrationStatus()
      } catch (_e) {
        // Keep default
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

  // Sentry test endpoint (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.get('/debug-sentry', (_req: Request, _res: Response) => {
      throw new Error('Test Sentry error!')
    })
  }

  // Serve static frontend files in production-like environments
  const isProductionLike =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
  if (isProductionLike) {
    void (async () => {
      const fsModule = await import('node:fs')
      const { existsSync, readdirSync } = fsModule
      const frontendPath = path.join(__dirname, '../public')

      logger.debug(`Setting up static file serving from: ${frontendPath}`)
      logger.debug(`Frontend path exists: ${existsSync(frontendPath)}`)

      if (existsSync(frontendPath)) {
        const files = readdirSync(frontendPath)
        logger.debug(`Files in frontend directory: ${files.join(', ')}`)

        const indexExists = fsModule.existsSync(path.join(frontendPath, 'index.html'))
        logger.debug(`index.html exists: ${indexExists}`)
      }

      // Serve static files
      app.use(
        express.static(frontendPath, {
          maxAge: 0,
          setHeaders: (res: Response, filePath: string) => {
            const relativePath = path.relative(frontendPath, filePath)

            if (relativePath === 'index.html') {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
              res.setHeader('Pragma', 'no-cache')
              res.setHeader('Expires', '0')
            } else if (relativePath === 'sw.js') {
              res.setHeader('Cache-Control', 'no-cache')
            } else if (
              relativePath.startsWith('assets/') ||
              /^favicon-\d+x\d+(\.[a-f0-9]{8,})?\.png$/.test(relativePath) ||
              /^apple-touch-icon-\d+(\.[a-f0-9]{8,})?\.png$/.test(relativePath) ||
              /^icon-\d+(\.[a-f0-9]{8,})?\.png$/.test(relativePath) ||
              /^safari-pinned-tab(\.[a-f0-9]{8,})?\.svg$/.test(relativePath) ||
              /^conquest_k_logo(\.[a-f0-9]{8,})?\.svg$/.test(relativePath)
            ) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            } else if (/^screenshots\/.*\.[a-f0-9]{8,}\.png$/.test(relativePath)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            } else {
              res.setHeader('Cache-Control', 'public, max-age=86400')
            }

            if (filePath.endsWith('.js')) {
              res.setHeader('Content-Type', 'application/javascript; charset=UTF-8')
            } else if (filePath.endsWith('.css')) {
              res.setHeader('Content-Type', 'text/css; charset=UTF-8')
            } else if (filePath.endsWith('.json')) {
              res.setHeader('Content-Type', 'application/json; charset=UTF-8')
            }
          },
          index: false,
        }),
      )

      // Handle React Router - serve index.html for root
      app.get('/', (_req: Request, res: Response) => {
        const indexPath = path.join(frontendPath, 'index.html')

        return res.sendFile(indexPath, (err) => {
          if (err) {
            logger.error(`Failed to serve index.html for root path`, { error: err.message })
            res.status(500).send('Error serving page')
          }
        })
      })

      // Handle all other routes for React Router.
      // IMPORTANT: only serve the SPA shell for GET/HEAD navigations, and never
      // for Colyseus HTTP endpoints. The matchmaking seat-reservation request is
      // POST /matchmake/<method>/<room>; if it falls through to here it gets
      // index.html (200, text/html), and colyseus.js then reads `response.room.name`
      // on parsed HTML and throws "Cannot read properties of undefined (reading 'name')"
      // — surfacing as the persistent "Lost connection to game server" banner.
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return next()
        }
        if (
          req.path.startsWith('/api') ||
          req.path.startsWith('/assets') ||
          req.path.startsWith('/uploads') ||
          req.path.startsWith('/colyseus') ||
          req.path.startsWith('/matchmake')
        ) {
          return next()
        }

        const indexPath = path.join(frontendPath, 'index.html')

        return res.sendFile(indexPath, (err) => {
          if (err) {
            logger.error(`Failed to serve index.html`, { path: req.path, error: err.message })
            res.status(500).send('Error serving page')
          }
        })
      })
    })().catch((e) => logger.warn('Static frontend setup failed', getErrorMessage(e)))
  }

  // Sentry error handler (must be after all controllers)
  Sentry.setupExpressErrorHandler(app)

  // Custom error handler (after Sentry)
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
}

// Health check data
async function getHealthData() {
  let databaseStatus = 'unknown'
  let databaseError: string | null = null
  let redisStatus = 'unknown'
  let redisError: string | null = null

  try {
    const pool = getPool()
    await pool.query('SELECT 1')
    databaseStatus = 'connected'
  } catch (error) {
    databaseStatus = 'disconnected'
    databaseError = error instanceof Error ? error.message : 'Unknown error'
  }

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

  return {
    status: 'OK',
    server: 'running',
    runtime: 'bun',
    transport: 'colyseus',
    database: databaseStatus,
    redis: redisStatus,
    environment: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
    redisUrl: process.env.REDIS_URL ? 'configured' : 'missing',
    sentry: process.env.SENTRY_DSN ? 'configured' : 'disabled',
    timestamp: new Date().toISOString(),
    ...(databaseError && { databaseError }),
    ...(redisError && { redisError }),
  }
}

// Create Colyseus server (ws-transport + Express on Bun's native node:http)
async function createGameServer() {
  // Configure Redis for multi-instance scaling if available
  let presence: RedisPresence | undefined
  let driver: RedisDriver | undefined

  if (process.env.REDIS_URL) {
    try {
      presence = new RedisPresence(process.env.REDIS_URL)
      driver = new RedisDriver(process.env.REDIS_URL)
      logger.info('Redis configured for Colyseus scaling')
    } catch (error) {
      logger.warn('Failed to configure Redis for Colyseus:', error)
    }
  }

  // Real Express on Bun's native node:http (replaces the fragile bun-serve-express
  // shim that @colyseus/bun-websockets required). Ordering matters: create the HTTP
  // server with `app` as its request listener BEFORE `new Server({ transport })`,
  // so Colyseus's attachMatchMakingRoutes() captures and wraps the Express listener
  // and intercepts POST /matchmake itself before Express ever sees it — which makes
  // the old "SPA catch-all swallows /matchmake" failure structurally impossible.
  const app: Application = express()
  configureExpressApp(app)
  const httpServer = createServer(app)
  // maxPayload: @colyseus/ws-transport's source defaults this to 4KB and passes it
  // to the `ws` WebSocketServer, where Node's `ws` would 1009-close any larger frame
  // — fatal for board/schema syncs, which exceed 4KB. Verified empirically that
  // Bun's built-in `ws` shim IGNORES maxPayload entirely (a 2MB frame round-trips
  // even with a 1MB cap), so this is INERT on Bun today. We still set 1MB explicitly
  // because (a) it's the correct value if this ever runs on Node's real `ws` (the
  // 4KB default would silently break syncs) and (b) it documents intent. Do not rely
  // on it as an abuse ceiling on Bun — Bun.serve's own ~16MB frame limit applies there.
  const transport = new WebSocketTransport({ server: httpServer, maxPayload: 1024 * 1024 })

  const gameServer = new Server({
    presence,
    driver,
    transport,
  })

  // Register game rooms
  gameServer.define('game', GameRoom).filterBy(['gameId'])
  // gameServer.define('chat', ChatRoom) // TODO: Add ChatRoom later

  // Start listening (transport.listen() -> httpServer.listen(PORT))
  await gameServer.listen(PORT)

  return gameServer
}

// Initialize and start server
async function startServer() {
  logger.info('Starting ConquestK Server...')
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
  logger.info(`Runtime: Bun ${typeof Bun !== 'undefined' ? Bun.version : 'N/A'}`)

  // Log comprehensive diagnostics
  logStartupDiagnostics()

  // Initialize database in background
  setImmediate(async () => {
    try {
      logger.info('Testing database connection...')
      const canConnect = await testDatabaseConnection()

      if (!canConnect) {
        logger.error('Cannot connect to database - server running without database')
        return
      }

      await testMigrationFiles()

      logger.info('Initializing database connection pool...')
      await initDatabase()
      logger.info('Database connection pool established')

      await ensureTablesExist()
      logger.info('Basic tables verified')

      const migrationRunner = new MigrationRunner()

      try {
        await migrationRunner.runPendingMigrations()

        const isValid = await migrationRunner.validateSchemaIntegrity()
        if (!isValid) {
          throw new Error('Schema validation failed after migrations')
        }

        logger.info('All migrations completed and schema validated')
        logger.info('Database: PostgreSQL with migration tracking')

        const { ensureOwnerAdmin } = await import('./scripts/ensureOwnerAdmin.js')
        await ensureOwnerAdmin()

        if (process.env.RUN_DEPLOY_ACCOUNT_ENFORCEMENT_ON_START === 'true') {
          try {
            const { ensureDeployAccounts } = await import('./scripts/ensureDeployAccounts.js')
            logger.info('Enforcing deploy accounts (owner + tests)')
            await ensureDeployAccounts()
          } catch (e) {
            logger.warn('Failed to enforce deploy accounts on start:', getErrorMessage(e))
          }
        }

        if (process.env.SYNC_FEATURE_FLAGS_ON_START === 'true') {
          try {
            const { spawnSync } = await import('node:child_process')
            const scriptPath = path.join(__dirname, 'scripts', 'checkFeatureFlags.js')
            logger.info('Syncing feature flags from code usage into DB')
            const result = spawnSync(process.execPath, [scriptPath, '--apply'], {
              stdio: 'ignore',
              env: process.env,
            })
            if (result.status === 0) {
              logger.info('Feature flags sync completed')
            } else {
              logger.warn('Feature flags sync exited with non-zero status')
            }
          } catch (e) {
            logger.warn('Failed to sync feature flags on start:', getErrorMessage(e))
          }
        }

        // Stale session sweeper
        try {
          const { authTrackingService } = await import('./services/authTrackingService.js')
          const maxAgeHours = parseInt(process.env.SESSION_MAX_AGE_HOURS || '168', 10)
          const sweepMinutes = parseInt(process.env.SESSION_SWEEP_INTERVAL_MINUTES || '60', 10)

          await authTrackingService.closeStaleSessions(maxAgeHours)

          setInterval(
            () => {
              authTrackingService
                .closeStaleSessions(maxAgeHours)
                .catch((e) => logger.warn('Stale session sweep failed', getErrorMessage(e)))
            },
            Math.max(1, sweepMinutes) * 60 * 1000,
          )

          logger.info('Stale session sweeper enabled', { maxAgeHours, sweepMinutes })
        } catch (e) {
          logger.warn('Failed to initialize stale session sweeper', getErrorMessage(e))
        }

        if (process.env.NODE_ENV === 'production') {
          logger.info('Production deployment ready at https://conquestk.com')
        }
      } catch (migrationError) {
        logger.error('Migration system failed:', migrationError)
        logger.warn('Server running with potential schema issues...')
      }
    } catch (dbError) {
      const normalizedDbError = toKnownError(dbError)
      logger.error('Database initialization failed:', normalizedDbError)
      logger.warn('Server running without database connection')
    }
  })

  // Create and start Colyseus server
  try {
    await createGameServer()
    logger.info(`Server listening on port ${PORT}`)
    logger.info(`WebSocket endpoint: ws://localhost:${PORT}/colyseus`)
    logger.info(`Health check: http://localhost:${PORT}/health`)
    logger.info(`Test endpoint: http://localhost:${PORT}/test`)
    logger.info('Registered rooms: game')
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Start memory diagnostics
memoryDiagnosticsService.start()

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION:', error)
  logger.error(`Message: ${error.message}`)
  logger.error(`Stack: ${error.stack}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION at:', promise)
  logger.error('Reason:', reason)
  process.exit(1)
})

// Start the server
startServer()
