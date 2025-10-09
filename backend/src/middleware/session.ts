import { randomBytes } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import session from 'express-session'
import { getRedisClient } from '../config/redis'
import { getErrorMessage } from '../utils/errorHelpers'
import { logger } from '../utils/logger'

const { RedisStore } = require('connect-redis')

/**
 * Session middleware that can reconfigure itself when Redis becomes available
 */
let currentSessionMiddleware: RequestHandler | null = null
let isRedisStoreActive = false

const DEFAULT_DEV_SECRET = 'default-dev-secret-change-in-production'

const sessionSecret = resolveSessionSecret()

function resolveSessionSecret(): string {
  const configuredSecret = process.env.SESSION_SECRET

  if (configuredSecret && configuredSecret !== DEFAULT_DEV_SECRET) {
    return configuredSecret
  }

  if (process.env.NODE_ENV === 'production') {
    const errorMessage =
      'SESSION_SECRET must be set to a strong, unique value in production. The insecure default fallback was detected.'
    logger.error(errorMessage)
    throw new Error(errorMessage)
  }

  const generatedSecret = randomBytes(32).toString('hex')

  if (!configuredSecret) {
    logger.warn(
      '⚠️ SESSION_SECRET is not set. Generating an ephemeral development secret. Sessions will reset on server restarts until SESSION_SECRET is configured.',
    )
  } else {
    logger.warn(
      '⚠️ Ignoring insecure default SESSION_SECRET value. Generating an ephemeral development secret instead. Sessions will reset on server restarts until SESSION_SECRET is configured.',
    )
  }

  process.env.SESSION_SECRET = generatedSecret
  return generatedSecret
}

/**
 * Create initial session middleware (may use in-memory store initially)
 */
export function createSessionMiddleware() {
  // Base session configuration
  const sessionConfig: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    },
    name: 'conquestk.sid', // Custom session name
  }

  // Try to use Redis immediately if available
  const redisConfigured = tryConfigureRedisStore(sessionConfig)

  // Always explicitly set MemoryStore if Redis is not configured to suppress warning
  if (!redisConfigured) {
    const MemoryStore = session.MemoryStore
    sessionConfig.store = new MemoryStore()

    if (process.env.REDIS_URL) {
      logger.warn(
        '⚠️ Using temporary MemoryStore while Redis initializes (this is expected during startup)',
      )
    } else {
      logger.info('ℹ️ Using MemoryStore for sessions (Redis not configured)')
    }
  }

  // Create the session middleware
  currentSessionMiddleware = session(sessionConfig)

  return currentSessionMiddleware
}

/**
 * Try to configure Redis store for sessions
 */
function tryConfigureRedisStore(sessionConfig: session.SessionOptions): boolean {
  const redisClient = getRedisClient()

  if (redisClient && !isRedisStoreActive) {
    try {
      sessionConfig.store = new RedisStore({
        client: redisClient,
        prefix: 'session:',
        ttl: 60 * 60 * 24 * 7, // 7 days in seconds
      })
      isRedisStoreActive = true
      logger.info('✅ Using Redis for session storage')
      return true
    } catch (error) {
      logger.error('Failed to create Redis session store:', getErrorMessage(error))
      logger.warn('⚠️ Falling back to in-memory session storage')
      isRedisStoreActive = false
    }
  } else if (!redisClient) {
    logger.warn('⚠️ Redis not available, using in-memory session storage')
  }

  return false
}

/**
 * Reconfigure session middleware to use Redis when it becomes available
 * This should be called after Redis initialization completes
 */
export function enableRedisSessionStore(): boolean {
  if (isRedisStoreActive) {
    logger.info('Redis session store already active')
    return true
  }

  const redisClient = getRedisClient()

  if (redisClient) {
    try {
      // Create new session configuration with Redis store
      const sessionConfig: session.SessionOptions = {
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
          maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        },
        name: 'conquestk.sid',
        store: new RedisStore({
          client: redisClient,
          prefix: 'session:',
          ttl: 60 * 60 * 24 * 7, // 7 days in seconds
        }),
      }

      // Replace the current middleware
      currentSessionMiddleware = session(sessionConfig)
      isRedisStoreActive = true
      logger.info('✅ Session middleware reconfigured to use Redis store')
      return true
    } catch (error) {
      logger.error('Failed to enable Redis session store:', getErrorMessage(error))
      return false
    }
  }

  return false
}

/**
 * Middleware wrapper that uses the current session middleware
 */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (currentSessionMiddleware) {
    return currentSessionMiddleware(req, res, next)
  }
  // Fallback - this shouldn't happen
  logger.error('Session middleware not initialized!')
  return next()
}

/**
 * Session types augmentation
 */
declare module 'express-session' {
  interface SessionData {
    userId?: string
    username?: string
    lastActivity?: Date
    gameRoom?: string
    socketId?: string
  }
}
