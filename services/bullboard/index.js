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

// Create BullMQ queue instances
const queues = QUEUE_NAMES.map((name) => {
  const queue = new Queue(name, {
    connection: redis,
    prefix: BULL_PREFIX,
  })

  console.log(`📋 Registered queue: ${name}`)

  return new BullMQAdapter(queue)
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
