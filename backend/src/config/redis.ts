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
  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    logger.warn('Redis URL not configured, using in-memory fallback')
    return { redisClient: null, pubClient: null, subClient: null }
  }

  try {
    // Parse Redis URL
    const redisOptions: any = {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000)
        return delay
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY'
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
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

    // Event handlers
    redisClient.on('connect', () => {
      logger.info('✅ Redis client connected')
    })

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err)
    })

    redisClient.on('ready', () => {
      logger.info('✅ Redis client ready')
    })

    pubClient.on('connect', () => {
      logger.info('✅ Redis pub client connected')
    })

    subClient.on('connect', () => {
      logger.info('✅ Redis sub client connected')
    })

    // Test connection
    redisClient.ping().then(() => {
      logger.info('✅ Redis ping successful')
    }).catch(err => {
      logger.error('Redis ping failed:', err)
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