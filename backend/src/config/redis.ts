import Redis from 'ioredis'
import { logger } from '../utils/logger'

let redisClient: Redis | null = null
let pubClient: Redis | null = null
let subClient: Redis | null = null

/**
 * Initialize Redis clients for different purposes
 */
export async function initializeRedis(): Promise<{
  redisClient: Redis | null
  pubClient: Redis | null
  subClient: Redis | null
}> {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL

  if (!redisUrl) {
    logger.warn('Redis URL not configured, using in-memory fallback')
    return { redisClient: null, pubClient: null, subClient: null }
  }

  // In production, if Redis fails to connect, gracefully degrade
  if (process.env.NODE_ENV === 'production') {
    logger.info('Production mode: Redis connection will be attempted but failures will be handled gracefully')
  }

  try {
    // Parse Redis URL
    const redisOptions: any = {
      enableReadyCheck: false,
      maxRetriesPerRequest: null, // Disable retries to prevent unhandled rejections
      connectTimeout: 5000, // 5 seconds
      lazyConnect: true, // Don't connect immediately
      retryStrategy: () => {
        // Don't retry connections - fail fast
        logger.warn('Redis connection failed, disabling Redis functionality')
        return null
      },
      reconnectOnError: () => {
        // Don't reconnect automatically
        return false
      },
    }

    // Main Redis client for general use
    redisClient = new Redis(redisUrl, {
      ...redisOptions,
      connectionName: 'main',
    })

    // Pub/Sub clients for Socket.io
    pubClient = new Redis(redisUrl, {
      ...redisOptions,
      connectionName: 'pub',
    })

    subClient = new Redis(redisUrl, {
      ...redisOptions,
      connectionName: 'sub',
    })

    // Event handlers with graceful degradation
    redisClient.on('connect', () => {
      logger.info('✅ Redis client connected')
    })

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err.message)
      if (process.env.NODE_ENV === 'production') {
        // In production, don't crash the app on Redis errors
        logger.warn('Redis errors are being handled gracefully in production')
      }
    })

    redisClient.on('ready', () => {
      logger.info('✅ Redis client ready')
    })

    redisClient.on('close', () => {
      logger.warn('Redis client connection closed')
    })

    pubClient.on('connect', () => {
      logger.info('✅ Redis pub client connected')
    })

    pubClient.on('error', (err) => {
      logger.error('Redis pub client error:', err.message)
    })

    pubClient.on('close', () => {
      logger.warn('Redis pub client connection closed')
    })

    subClient.on('connect', () => {
      logger.info('✅ Redis sub client connected')
    })

    subClient.on('error', (err) => {
      logger.error('Redis sub client error:', err.message)
    })

    subClient.on('close', () => {
      logger.warn('Redis sub client connection closed')
    })

    // Test connection with timeout - if it fails, disable Redis entirely
    try {
      await Promise.race([
        redisClient.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
      ])
      logger.info('✅ Redis connection established')
      return { redisClient, pubClient, subClient }
    } catch (err) {
      logger.error('Redis connection failed, disabling Redis functionality:', err)
      // Clean up failed clients
      try {
        await redisClient?.quit()
        await pubClient?.quit()
        await subClient?.quit()
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      return { redisClient: null, pubClient: null, subClient: null }
    }
  } catch (error) {
    logger.error('Failed to initialize Redis:', error)
    return { redisClient: null, pubClient: null, subClient: null }
  }
}

/**
 * Get the Redis client instance
 */
export function getRedisClient(): Redis | null {
  return redisClient
}

/**
 * Get pub/sub clients for Socket.io
 */
export function getPubSubClients(): { pubClient: Redis | null; subClient: Redis | null } {
  return { pubClient, subClient }
}

/**
 * Graceful shutdown
 */
export async function closeRedisConnections(): Promise<void> {
  const clients = [redisClient, pubClient, subClient].filter(Boolean)
  
  await Promise.all(
    clients.map(client => 
      client?.quit().catch(err => 
        logger.error('Error closing Redis connection:', err)
      )
    )
  )
  
  logger.info('Redis connections closed')
}

/**
 * Health check for Redis
 */
export async function checkRedisHealth(): Promise<{ healthy: boolean; message: string }> {
  if (!redisClient) {
    return { healthy: false, message: 'Redis not configured' }
  }

  try {
    const result = await redisClient.ping()
    return { 
      healthy: result === 'PONG', 
      message: result === 'PONG' ? 'Redis is healthy' : 'Redis ping failed' 
    }
  } catch (error) {
    return { 
      healthy: false, 
      message: `Redis health check failed: ${error}` 
    }
  }
}