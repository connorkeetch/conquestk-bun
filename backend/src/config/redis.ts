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

  logger.info(`Initializing Redis connection...`)
  logger.info(`Using Redis URL: ${redisUrl.replace(/:[^:]*@/, ':****@')}`)

  try {
    // Railway-specific Redis configuration
    // Railway uses IPv6 for internal networking, so we need dual-stack support
    let finalRedisUrl = redisUrl
    
    // Add family=0 for dual-stack IPv4/IPv6 support if not already present
    if (!redisUrl.includes('family=')) {
      const separator = redisUrl.includes('?') ? '&' : '?'
      finalRedisUrl = `${redisUrl}${separator}family=0`
    }

    const redisOptions: any = {
      family: 0, // Enable dual-stack IPv4/IPv6 lookups for Railway
      enableReadyCheck: false,
      connectTimeout: 10000, // 10 seconds for Railway startup
      commandTimeout: 5000,
      lazyConnect: true, // Don't connect immediately
      maxRetriesPerRequest: 3, // Allow some retries for Railway networking
      retryDelayOnFailover: 100,
      retryDelayOnClusterDown: 300,
      retryDelayOnClusterFailure: 100,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000)
        if (times > 3) {
          logger.error(`Redis connection failed after ${times} attempts, giving up`)
          return null
        }
        logger.warn(`Redis connection attempt ${times} failed, retrying in ${delay}ms`)
        return delay
      },
    }

    // Main Redis client for general use
    redisClient = new Redis(finalRedisUrl, {
      ...redisOptions,
      connectionName: 'main',
    })

    // Pub/Sub clients for Socket.io
    pubClient = new Redis(finalRedisUrl, {
      ...redisOptions,
      connectionName: 'pub',
    })

    subClient = new Redis(finalRedisUrl, {
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

    // Railway-specific startup delay for private network initialization
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
      if (redisUrl.includes('railway.internal')) {
        logger.info('Railway internal Redis detected, waiting for private network initialization...')
        await new Promise(resolve => setTimeout(resolve, 10000)) // 10 second delay for Railway
      }
    }

    // Test connection with extended timeout for Railway
    try {
      await Promise.race([
        redisClient.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 15s')), 15000))
      ])
      
      // Test basic operations
      await redisClient.ping()
      logger.info('✅ Redis connection established and verified')
      
      return { redisClient, pubClient, subClient }
    } catch (err) {
      logger.error('Redis connection failed:', err instanceof Error ? err.message : err)
      
      // Clean up failed clients properly
      const cleanup = async (client: Redis | null, name: string) => {
        if (client) {
          try {
            await client.disconnect()
          } catch (e) {
            logger.warn(`Failed to disconnect ${name} client:`, e instanceof Error ? e.message : e)
          }
        }
      }
      
      await Promise.all([
        cleanup(redisClient, 'main'),
        cleanup(pubClient, 'pub'), 
        cleanup(subClient, 'sub')
      ])
      
      logger.warn('Redis disabled, application will use in-memory fallbacks')
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