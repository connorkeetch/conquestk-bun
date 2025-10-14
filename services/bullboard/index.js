import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyBasicAuth from '@fastify/basic-auth'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'
import { Queue } from 'bullmq'
import Redis from 'ioredis'

// Environment variables
const PORT = parseInt(process.env.PORT || '3000', 10)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const BULL_PREFIX = process.env.BULL_PREFIX || 'bull'
const BB_USERNAME = process.env.BB_USERNAME || 'admin'
const BB_PASSWORD = process.env.BB_PASSWORD || 'admin'

// Log startup config (mask password)
console.log('🚀 Bull Board starting...')
console.log(`📊 Port: ${PORT}`)
console.log(`🔗 Redis: ${REDIS_URL.replace(/:[^:@]*@/, ':****@')}`)
console.log(`🔑 Username: ${BB_USERNAME}`)
console.log(`🏷️  Bull Prefix: ${BULL_PREFIX}`)

// Create Redis connection
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message)
})

redis.on('connect', () => {
  console.log('✅ Connected to Redis')
})

// Define your queue names (must match backend)
const QUEUE_NAMES = [
  'game-actions',
  'game-cleanup',
  'analytics-events',
  'maintenance',
  'map-assets',
]

// Queue descriptions for better UI
const QUEUE_DESCRIPTIONS = {
  'game-actions': 'Real-time game moves, attacks, fortifies, and AI turns',
  'game-cleanup': 'Cleanup tasks after games finish',
  'analytics-events': 'Analytics tracking and metrics',
  'maintenance': 'Scheduled maintenance and background tasks',
  'map-assets': 'Map image processing and optimization',
}

// Create BullMQ queue instances with enhanced configuration
const queues = QUEUE_NAMES.map((name) => {
  const queue = new Queue(name, {
    connection: redis,
    prefix: BULL_PREFIX,
  })

  console.log(`📋 Registered queue: ${name}`)

  // Create adapter with retry enabled and description
  const adapter = new BullMQAdapter(queue, {
    readOnlyMode: false,      // Allow all actions (retry, remove, etc.)
    allowRetries: true,       // Enable retry buttons in UI
    description: QUEUE_DESCRIPTIONS[name] || '',
  })

  // Add custom formatter to show job names with queue prefix
  adapter.setFormatter('name', (job) => `${name} → ${job.name}`)

  return adapter
})

// Create Fastify server
const server = Fastify({
  logger: process.env.NODE_ENV === 'production' ? true : {
    level: process.env.LOG_LEVEL || 'info',
  },
})

// Register cookie support (required for basic auth)
await server.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET || 'my-secret-key-change-me',
})

// Register basic auth
await server.register(fastifyBasicAuth, {
  validate: async (username, password, req, reply) => {
    if (username === BB_USERNAME && password === BB_PASSWORD) {
      return
    }
    throw new Error('Invalid credentials')
  },
  authenticate: { realm: 'Bull Board' },
})

// Create Bull Board
const serverAdapter = new FastifyAdapter()
serverAdapter.setBasePath('/')

createBullBoard({
  queues,
  serverAdapter,
})

// Apply basic auth to all routes
await server.register(serverAdapter.registerPlugin(), {
  prefix: '/',
  basePath: '/',
})

// Protect all routes with basic auth
server.addHook('onRequest', server.basicAuth)

// Health check endpoint (also requires auth)
server.get('/health', async (request, reply) => {
  try {
    await redis.ping()
    return { status: 'healthy', redis: 'connected' }
  } catch (error) {
    reply.code(503)
    return { status: 'unhealthy', redis: 'disconnected', error: error.message }
  }
})

// Custom metrics endpoint - aggregated stats across all queues
server.get('/metrics', async (request, reply) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      queues: {},
      totals: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      },
    }

    // Get stats from each queue
    for (const adapter of queues) {
      const queue = adapter.queue
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')

      const queueName = queue.name
      metrics.queues[queueName] = {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        isPaused: await queue.isPaused(),
      }

      // Add to totals
      metrics.totals.waiting += counts.waiting || 0
      metrics.totals.active += counts.active || 0
      metrics.totals.completed += counts.completed || 0
      metrics.totals.failed += counts.failed || 0
      metrics.totals.delayed += counts.delayed || 0
    }

    return metrics
  } catch (error) {
    reply.code(500)
    return { error: 'Failed to fetch metrics', message: error.message }
  }
})

// Auto-cleanup old jobs - runs every hour
const AUTO_CLEANUP_INTERVAL = 60 * 60 * 1000 // 1 hour
const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const CLEANUP_COUNT = 1000 // Keep at most 1000 completed jobs per queue

async function cleanupOldJobs() {
  console.log('🧹 Running auto-cleanup of old jobs...')

  for (const adapter of queues) {
    const queue = adapter.queue
    const queueName = queue.name

    try {
      // Clean completed jobs older than 7 days, keeping last 1000
      const completedCleaned = await queue.clean(CLEANUP_AGE_MS, CLEANUP_COUNT, 'completed')

      // Clean failed jobs older than 7 days, keeping last 1000
      const failedCleaned = await queue.clean(CLEANUP_AGE_MS, CLEANUP_COUNT, 'failed')

      const total = completedCleaned.length + failedCleaned.length
      if (total > 0) {
        console.log(`  ✅ ${queueName}: cleaned ${total} old jobs (${completedCleaned.length} completed, ${failedCleaned.length} failed)`)
      }
    } catch (error) {
      console.error(`  ❌ ${queueName}: cleanup failed -`, error.message)
    }
  }

  console.log('✅ Auto-cleanup complete')
}

// Start cleanup interval
const cleanupInterval = setInterval(cleanupOldJobs, AUTO_CLEANUP_INTERVAL)

// Run cleanup on startup after a short delay
setTimeout(cleanupOldJobs, 30000) // 30 seconds after startup

// Start server
const start = async () => {
  try {
    await server.listen({
      port: PORT,
      host: '0.0.0.0' // Important for Railway
    })
    console.log('✅ Bull Board is running!')
    console.log(`🌐 Access at: http://localhost:${PORT}`)
    console.log(`👤 Login with username: ${BB_USERNAME}`)
  } catch (err) {
    console.error('❌ Failed to start server:', err)
    process.exit(1)
  }
}

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n⚠️  ${signal} received, shutting down gracefully...`)

  try {
    // Clear cleanup interval
    clearInterval(cleanupInterval)

    await server.close()
    await redis.quit()
    console.log('✅ Shutdown complete')
    process.exit(0)
  } catch (err) {
    console.error('❌ Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start()
