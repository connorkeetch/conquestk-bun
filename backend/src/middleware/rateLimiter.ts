import type { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import RedisStore from 'rate-limit-redis'
import { getRedisClient } from '../config/redis'
import { logger } from '../utils/logger'

/**
 * Rate limiting configurations for different endpoint types
 */

// Helper to create custom error messages
const createMessage = (endpoint: string, limit: number, window: string) => {
  return `Too many requests to ${endpoint}. Limited to ${limit} requests per ${window}. Please try again later.`
}

// Create Redis store if available, otherwise use memory store
function createRateLimitStore(prefix: string) {
  const redisClient = getRedisClient()
  if (redisClient) {
    try {
      return new RedisStore({
        client: redisClient as unknown,
        prefix: `rate-limit:${prefix}:`,
      } as unknown)
    } catch (error) {
      logger.error(
        `Failed to create Redis store for ${prefix}:`,
        error instanceof Error ? error.message : error,
      )
      logger.warn(
        `Using in-memory store for rate limiting (${prefix}) - Redis store creation failed`,
      )
      return undefined
    }
  }
  logger.warn(`Using in-memory store for rate limiting (${prefix}) - Redis not available`)
  return undefined // Uses default memory store
}

// Store for tracking attempts (uses Redis if available)
let loginAttemptsStore: Map<string, number[]> | null = null

// Initialize login attempts store
function initLoginAttemptsStore() {
  const redisClient = getRedisClient()
  if (!redisClient) {
    loginAttemptsStore = new Map<string, number[]>()
    return true
  }
  return false
}

// Initialize the store
const useInMemoryLogin = initLoginAttemptsStore()

// Clean up old entries periodically (only needed for in-memory store)
if (useInMemoryLogin && loginAttemptsStore) {
  setInterval(() => {
    if (!loginAttemptsStore) return

    const now = Date.now()
    const fifteenMinutes = 15 * 60 * 1000

    loginAttemptsStore.forEach((attempts, key) => {
      const recentAttempts = attempts.filter((time) => now - time < fifteenMinutes)
      if (recentAttempts.length === 0) {
        loginAttemptsStore!.delete(key)
      } else {
        loginAttemptsStore!.set(key, recentAttempts)
      }
    })
  }, 60 * 1000) // Clean every minute
}

/**
 * Strict rate limiter for authentication endpoints
 * 5 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: createMessage('authentication endpoints', 5, '15 minutes'),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  store: createRateLimitStore('auth'),
})

/**
 * Progressive slow down for failed login attempts
 * Adds delay after 2 failed attempts
 */
export const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 2, // Start slowing after 2 requests
  delayMs: () => 1000, // Add 1 second delay per attempt (v2 format)
  maxDelayMs: 5000, // Maximum 5 second delay
  skipSuccessfulRequests: true, // Only count failed attempts
})

/**
 * Rate limiter for game creation
 * 10 games per hour per user
 */
export const gameCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 games per hour
  message: createMessage('game creation', 10, 'hour'),
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('game-creation'),
})

/**
 * Rate limiter for messaging/chat
 * 30 messages per minute per user
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: createMessage('messaging', 30, 'minute'),
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed requests
  store: createRateLimitStore('messages'),
})

/**
 * Strict limiter for password reset requests
 * 3 requests per hour per email
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: 'Too many password reset requests. Please check your email or try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('password-reset'),
})

/**
 * Rate limiter for map uploads
 * 5 maps per day per user
 */
export const mapUploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // 5 maps per day
  message: createMessage('map uploads', 5, 'day'),
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('map-upload'),
})

/**
 * General API rate limiter
 * 100 requests per minute for general endpoints
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  store: createRateLimitStore('general-api'),
})

/**
 * Strict rate limiter for admin operations
 * 30 requests per minute for admin endpoints
 */
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Admin operation rate limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('admin'),
})

/**
 * Socket connection rate limiter
 * 5 connection attempts per minute per IP
 */
export const socketConnectionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 connection attempts
  message: 'Too many socket connection attempts.',
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('socket-connection'),
})

/**
 * Custom rate limiter for tracking suspicious activity
 * Blocks IPs that repeatedly hit rate limits
 */
export class SuspiciousActivityTracker {
  private suspiciousIPs = new Map<string, number>()
  private blockedIPs = new Set<string>()
  private readonly THRESHOLD = 10 // 10 rate limit violations
  private readonly BLOCK_DURATION = 60 * 60 // 1 hour in seconds for Redis

  private getRedis() {
    return getRedisClient()
  }

  async recordViolation(ip: string): Promise<void> {
    const redisClient = this.getRedis()
    if (redisClient) {
      try {
        const key = `suspicious:${ip}`
        const violations = await redisClient.incr(key)

        // Set expiry on first violation
        if (violations === 1) {
          await redisClient.expire(key, this.BLOCK_DURATION)
        }

        if (violations >= this.THRESHOLD) {
          await this.blockIP(ip)
        }
      } catch (error) {
        logger.error('Redis error in recordViolation:', error)
        // Fallback to in-memory
        this.recordViolationInMemory(ip)
      }
    } else {
      this.recordViolationInMemory(ip)
    }
  }

  private recordViolationInMemory(ip: string) {
    const violations = (this.suspiciousIPs.get(ip) || 0) + 1
    this.suspiciousIPs.set(ip, violations)

    if (violations >= this.THRESHOLD) {
      this.blockIPInMemory(ip)
    }
  }

  async blockIP(ip: string): Promise<void> {
    const redisClient = this.getRedis()
    if (redisClient) {
      try {
        const key = `blocked:${ip}`
        await redisClient.setex(key, this.BLOCK_DURATION, '1')
        logger.warn(`Blocked IP ${ip} for suspicious activity`)
      } catch (error) {
        logger.error('Redis error in blockIP:', error)
        this.blockIPInMemory(ip)
      }
    } else {
      this.blockIPInMemory(ip)
    }
  }

  private blockIPInMemory(ip: string) {
    this.blockedIPs.add(ip)

    // Automatically unblock after duration
    setTimeout(() => {
      this.blockedIPs.delete(ip)
      this.suspiciousIPs.delete(ip)
    }, this.BLOCK_DURATION * 1000) // Convert to milliseconds for setTimeout
  }

  async isBlocked(ip: string): Promise<boolean> {
    const redisClient = this.getRedis()
    if (redisClient) {
      try {
        const key = `blocked:${ip}`
        const result = await redisClient.get(key)
        return result === '1'
      } catch (error) {
        logger.error('Redis error in isBlocked:', error)
        return this.blockedIPs.has(ip)
      }
    }
    return this.blockedIPs.has(ip)
  }

  middleware() {
    return async (req: Request, res: Response, next: Function): Promise<any> => {
      const ip = req.ip || 'unknown'

      if (await this.isBlocked(ip)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Your IP has been temporarily blocked due to suspicious activity.',
        })
      }

      return next()
    }
  }
}

export const suspiciousActivityTracker = new SuspiciousActivityTracker()

/**
 * Standard rate limiter for general protected routes
 * 60 requests per minute
 */
export const standardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  store: createRateLimitStore('standard'),
})
