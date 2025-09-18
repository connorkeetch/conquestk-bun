import type { NextFunction, Request, Response } from 'express'
import session from 'express-session'
import { getRedisClient } from '../config/redis'
import { logger } from '../utils/logger'

// Import connect-redis v9 - try multiple import patterns for compatibility
let RedisStore: unknown = null
try {
  // Method 1: CommonJS with .default (what we were using)
  RedisStore = require('connect-redis').default
} catch (e1) {
  try {
    // Method 2: Direct CommonJS require
    RedisStore = require('connect-redis')
  } catch (e2) {
    logger.error('Failed to import connect-redis:', e2)
  }
}

/**
 * Session middleware that can reconfigure itself when Redis becomes available
 */
let currentSessionMiddleware: unknown = null
let isRedisStoreActive = false

/**
 * Create initial session middleware (may use in-memory store initially)
 */
export function createSessionMiddleware() {
  const sessionSecret = process.env.SESSION_SECRET || 'default-dev-secret-change-in-production'

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
    const MemoryStore = require('express-session').MemoryStore
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

  if (redisClient && RedisStore && !isRedisStoreActive) {
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
      logger.error(
        'Failed to create Redis session store:',
        error instanceof Error ? error.message : error,
      )
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

  if (redisClient && RedisStore) {
    try {
      // Create new session configuration with Redis store
      const sessionSecret = process.env.SESSION_SECRET || 'default-dev-secret-change-in-production'

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
      logger.error(
        'Failed to enable Redis session store:',
        error instanceof Error ? error.message : error,
      )
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
