import session from 'express-session'
import { getRedisClient } from '../config/redis'
import { logger } from '../utils/logger'

// Import connect-redis v9 style
const RedisStore = require('connect-redis').default

/**
 * Create session middleware with Redis store if available
 */
export function createSessionMiddleware() {
  const sessionSecret = process.env.SESSION_SECRET || 'default-dev-secret-change-in-production'
  const redisClient = getRedisClient()

  // Session configuration
  const sessionConfig: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
    },
    name: 'conquestk.sid', // Custom session name
  }

  // Use Redis store if available
  if (redisClient) {
    try {
      sessionConfig.store = new RedisStore({
        client: redisClient,
        prefix: 'session:',
        ttl: 60 * 60 * 24 * 7, // 7 days in seconds
      })
      logger.info('✅ Using Redis for session storage')
    } catch (error) {
      logger.error('Failed to create Redis session store:', error)
      logger.warn('⚠️ Falling back to in-memory session storage')
    }
  } else {
    logger.warn('⚠️ Using in-memory session storage (not recommended for production)')
  }

  return session(sessionConfig)
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