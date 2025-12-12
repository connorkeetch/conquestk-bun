/**
 * ConquestK Server - Colyseus + Bun
 *
 * This is the new entry point that replaces the Express/Socket.io setup.
 * Uses Bun's native HTTP server with Colyseus for WebSocket game rooms.
 */

import dotenv from 'dotenv'

// Load environment variables in development
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
  const result = dotenv.config()
  if (result.error) {
    console.error('Failed to load .env file:', result.error)
  }
}

import { Server } from 'colyseus'
import { BunWebSockets } from '@colyseus/bun-websockets'
import { RedisPresence } from '@colyseus/redis-presence'
import { RedisDriver } from '@colyseus/redis-driver'
import { GameRoom } from './rooms/GameRoom.js'
import { logger } from './utils/logger.js'
import { initDatabase, getPool } from './config/database.js'
import { MigrationRunner } from './utils/migrationRunner.js'

const PORT = parseInt(process.env.PORT || '5001', 10)

// Create Colyseus server with Bun transport
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

  // BunWebSockets handles Bun.serve() internally and provides Express-like routing
  const transport = new BunWebSockets({})

  const gameServer = new Server({
    presence,
    driver,
    transport,
  })

  // Register game rooms
  gameServer.define('game', GameRoom)
  // gameServer.define('chat', ChatRoom) // TODO: Add ChatRoom later

  // Start listening
  await gameServer.listen(PORT)

  // Add REST routes using the transport's Express app
  // @ts-expect-error - expressApp is available on BunWebSockets
  const app = transport.expressApp

  // Health check
  app.get('/health', async (_req: unknown, res: { json: (data: unknown) => void }) => {
    const healthData = await getHealthData()
    res.json(healthData)
  })

  app.get('/api/health', async (_req: unknown, res: { json: (data: unknown) => void }) => {
    const healthData = await getHealthData()
    res.json(healthData)
  })

  // Test endpoint
  app.get('/test', (_req: unknown, res: { json: (data: unknown) => void }) => {
    res.json({
      message: 'ConquestK Colyseus Server is running!',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      runtime: 'bun',
    })
  })

  return gameServer
}

// Health check data
async function getHealthData() {
  let databaseStatus = 'unknown'
  let databaseError: string | null = null

  try {
    const pool = getPool()
    await pool.query('SELECT 1')
    databaseStatus = 'connected'
  } catch (error) {
    databaseStatus = 'disconnected'
    databaseError = error instanceof Error ? error.message : 'Unknown error'
  }

  return {
    status: 'OK',
    server: 'running',
    runtime: 'bun',
    transport: 'colyseus',
    database: databaseStatus,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    ...(databaseError && { databaseError }),
  }
}


// Initialize and start server
async function startServer() {
  logger.info('Starting ConquestK Colyseus Server...')
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
  logger.info(`Runtime: Bun ${Bun.version}`)

  // Initialize database
  try {
    logger.info('Initializing database connection...')
    await initDatabase()
    logger.info('Database connection established')

    // Run migrations
    const migrationRunner = new MigrationRunner()
    await migrationRunner.runPendingMigrations()
    logger.info('Database migrations complete')
  } catch (error) {
    logger.error('Database initialization failed:', error)
    logger.warn('Server will start without database - some features may not work')
  }

  // Create and start Colyseus server
  try {
    await createGameServer()
    logger.info(`Colyseus server listening on port ${PORT}`)
    logger.info(`WebSocket endpoint: ws://localhost:${PORT}/colyseus`)
    logger.info(`Health check: http://localhost:${PORT}/health`)
    logger.info('Registered rooms: game')
  } catch (error) {
    logger.error('Failed to start Colyseus server:', error)
    process.exit(1)
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION at:', promise, 'reason:', reason)
  process.exit(1)
})

// Start the server
startServer()
