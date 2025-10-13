import RedisPkg, { type Redis as IORedis, type RedisOptions } from 'ioredis'
import { getErrorMessage, toKnownError } from '../utils/errorHelpers.js'
import { logger } from '../utils/logger.js'

let redisClient: IORedis | null = null

export interface RedisClients {
  redisClient: IORedis | null
}

/**
 * Initialize Redis clients for different purposes
 */
export async function initializeRedis(): Promise<RedisClients> {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL

  if (!redisUrl) {
    logger.warn('Redis URL not configured, using in-memory fallback')
    return { redisClient: null }
  }

  logger.debug(`Initializing Redis connection...`)
  logger.debug(`Using Redis URL: ${redisUrl.replace(/:[^:]*@/, ':****@')}`)

  // Enhanced Railway detection and network wait logic
  const isRailwayEnvironment =
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging' ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    redisUrl.includes('railway.internal') ||
    redisUrl.includes('.railway.app') ||
    redisUrl.includes('.railway.') ||
    redisUrl.includes('redis-')

  if (isRailwayEnvironment) {
    const waitTime = 15000 // 15 seconds for Railway network initialization
    logger.info(
      `🚂 Railway environment detected - waiting ${waitTime / 1000}s for private network initialization...`,
    )
    logger.debug(
      `Environment indicators: NODE_ENV=${process.env.NODE_ENV}, RAILWAY_ENV=${process.env.RAILWAY_ENVIRONMENT}, PROJECT_ID=${process.env.RAILWAY_PROJECT_ID}`,
    )
    await new Promise((resolve) => setTimeout(resolve, waitTime))
    logger.info(`🚂 Railway network wait complete, proceeding with Redis connection...`)
  }

  try {
    // Railway-specific Redis configuration
    // Railway uses IPv6 for internal networking, so we need dual-stack support
    let finalRedisUrl = redisUrl

    // Add family=0 for dual-stack IPv4/IPv6 support if not already present
    if (!redisUrl.includes('family=')) {
      const separator = redisUrl.includes('?') ? '&' : '?'
      finalRedisUrl = `${redisUrl}${separator}family=0`
    }

    const redisOptions: RedisOptions = {
      family: 0, // Enable dual-stack IPv4/IPv6 lookups for Railway
      enableReadyCheck: false,
      connectTimeout: 10000, // 10 seconds for Railway startup
      commandTimeout: 5000,
      lazyConnect: true, // Don't connect immediately
      maxRetriesPerRequest: 3, // Allow some retries for Railway networking
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
    const RedisCtor = RedisPkg as unknown as new (url: string, options?: RedisOptions) => IORedis
    redisClient = new RedisCtor(finalRedisUrl, {
      ...redisOptions,
      connectionName: 'main',
    })

    // Event handlers with graceful degradation
    redisClient?.on('connect', () => {
      logger.info('✅ Redis client connected')
    })

    redisClient?.on('error', (err) => {
      const errorDetails = toKnownError(err)
      const errorMsg = errorDetails.message
      const errorCode =
        typeof errorDetails.code === 'string'
          ? errorDetails.code
          : errorDetails.code !== undefined
            ? String(errorDetails.code)
            : undefined

      if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
        // In production/staging, log Redis errors less verbosely to avoid log spam
        logger.warn(`Redis client error (${errorCode || 'unknown'}): ${errorMsg}`)

        // Only log full details for certain error types that indicate real issues
        if (
          errorCode &&
          !['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(errorCode)
        ) {
          logger.error('Redis client detailed error:', errorDetails)
        }
      } else {
        // In development, log all errors with full details
        logger.error('Redis client error:', errorMsg)
        logger.debug('Redis client error details:', errorDetails)
      }
    })

    const rc = redisClient as IORedis
    rc.on('ready', () => {
      logger.info('✅ Redis client ready')
    })

    rc.on('close', () => {
      logger.warn('Redis client connection closed')
    })

    // Pub/Sub clients removed: Redis Streams adapter uses a single client

    // Additional Railway-specific diagnostics
    logger.debug(`Redis connection attempt details:`)
    logger.debug(`  - Final Redis URL: ${finalRedisUrl.replace(/:[^:]*@/, ':****@')}`)
    logger.debug(`  - Connection timeout: ${redisOptions.connectTimeout}ms`)
    logger.debug(`  - Command timeout: ${redisOptions.commandTimeout}ms`)
    logger.debug(`  - Railway environment: ${isRailwayEnvironment}`)

    // Test connection with extended timeout for Railway
    try {
      await Promise.race([
        rc.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout after 15s')), 15000),
        ),
      ])

      // Test basic operations
      await rc.ping()
      logger.info('✅ Redis connection established and verified')

      return { redisClient }
    } catch (err) {
      const errorDetails = toKnownError(err)
      logger.error('🔴 Redis connection failed with detailed error:')
      logger.error(`  - Error type: ${errorDetails.name || 'Unknown'}`)
      logger.error(`  - Error message: ${errorDetails.message || 'No message'}`)
      logger.error(`  - Error code: ${errorDetails.code || 'No code'}`)
      logger.error(`  - System call: ${errorDetails.syscall || 'No syscall'}`)
      logger.error(`  - Hostname: ${errorDetails.hostname || 'No hostname'}`)
      logger.error(`  - Full error details:`, errorDetails)

      // Additional Railway-specific diagnostics
      if (isRailwayEnvironment) {
        logger.error(`🚂 Railway-specific diagnostics:`)
        logger.error(
          `  - Railway environment variables: RAILWAY_ENVIRONMENT=${process.env.RAILWAY_ENVIRONMENT}, PROJECT_ID=${process.env.RAILWAY_PROJECT_ID}`,
        )
        logger.error(`  - Network wait was applied: 15 seconds`)
        logger.error(`  - This error occurred AFTER the network wait period`)

        // Try to determine if this is a DNS resolution issue
        if (errorDetails.code === 'ENOTFOUND' || errorDetails.syscall === 'getaddrinfo') {
          logger.error(`  - 🔍 This appears to be a DNS resolution issue`)
          logger.error(`  - 🔍 Railway private network may still be initializing`)
          logger.error(`  - 🔍 Consider increasing wait time or checking Railway service status`)
        }
      }

      // Clean up failed clients properly
      const cleanup = async (client: IORedis | null, name: string) => {
        if (client) {
          try {
            await client.disconnect()
          } catch (e) {
            logger.warn(`Failed to disconnect ${name} client:`, getErrorMessage(e))
          }
        }
      }

      await Promise.all([cleanup(redisClient, 'main')])

      logger.warn('Redis disabled, application will use in-memory fallbacks')
      return { redisClient: null }
    }
  } catch (error) {
    logger.error('Failed to initialize Redis:', toKnownError(error))
    return { redisClient: null }
  }
}

/**
 * Get the Redis client instance
 */
export function getRedisClient(): IORedis | null {
  return redisClient
}

/**
 * Get pub/sub clients for Socket.io
 */
// Pub/Sub clients removed; single client is used for Streams adapter

/**
 * Graceful shutdown
 */
export async function closeRedisConnections(): Promise<void> {
  const clients = [redisClient].filter(Boolean)

  await Promise.all(
    clients.map((client) =>
      client?.quit().catch((err) => logger.error('Error closing Redis connection:', err)),
    ),
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
      message: result === 'PONG' ? 'Redis is healthy' : 'Redis ping failed',
    }
  } catch (error) {
    return {
      healthy: false,
      message: `Redis health check failed: ${error}`,
    }
  }
}

/**
 * Acquire a distributed lock using Redis
 * @param key Lock key (e.g., 'lock:game:room123')
 * @param ttlMs Lock TTL in milliseconds (default 5000ms)
 * @returns Lock token if acquired, null otherwise
 */
export async function acquireLock(key: string, ttlMs = 5000): Promise<string | null> {
  if (!redisClient) {
    logger.warn('Redis not available, skipping lock acquisition')
    return null
  }

  const token = `${Date.now()}-${Math.random()}`
  const result = await redisClient.set(key, token, 'PX', ttlMs, 'NX')
  return result === 'OK' ? token : null
}

/**
 * Release a distributed lock using Redis
 * @param key Lock key
 * @param token Lock token returned from acquireLock
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  if (!redisClient) {
    return
  }

  // Use Lua script to ensure atomic check-and-delete
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `
  await redisClient.eval(script, 1, key, token)
}
