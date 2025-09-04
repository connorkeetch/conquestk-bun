import Redis from 'ioredis'
import { logger } from '../utils/logger'

let redisClient: Redis | null = null
let pubClient: Redis | null = null
let subClient: Redis | null = null

/**
 * Initialize Redis clients for different purposes
 */
export function initializeRedis(): {
  redisClient: Redis | null
  pubClient: Redis | null
  subClient: Redis | null
} {
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
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000, // 10 seconds
      lazyConnect: true, // Don't connect immediately
      retryStrategy: (times: number) => {
        if (times > 5) {
          logger.warn('Redis retry attempts exhausted, giving up')
          return null // Stop retrying
        }
        const delay = Math.min(times * 50, 2000)
        return delay
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY'
        if (err.message.includes(targetError)) {
          return true
        }
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

    // Test connection with timeout
    Promise.race([
      redisClient.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 5000))
    ]).then(() => {
      logger.info('✅ Redis ping successful')
    }).catch(err => {
      logger.error('Redis ping failed:', err)
      // Don't fail the app startup, just log the error
    })

    return { redisClient, pubClient, subClient }
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