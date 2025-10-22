import type { NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import RedisStore, { type RedisReply, type SendCommandFn } from 'rate-limit-redis'
import { getRedisClient } from '../config/redis.js'
import { getErrorMessage } from '../utils/errorHelpers.js'
import { logger } from '../utils/logger.js'

/**
 * This file contains rate limiting configurations for different endpoint types.
 * It uses `express-rate-limit` and `express-slow-down` to protect the application from abuse.
 * It also includes a custom `SuspiciousActivityTracker` to block IPs that repeatedly hit rate limits.
 */

/**
 * Rate limiting configurations for different endpoint types
 */

// Helper to create custom error messages
const createMessage = (endpoint: string, limit: number, window: string) => {
  return `Too many requests to ${endpoint}. Limited to ${limit} requests per ${window}. Please try again later.`
}

// Create Redis store if available, otherwise use memory store
// Aggregate noisy fallback logs into a single message per tick
const inMemoryPrefixes = new Set<string>()
let scheduledAggregateLog = false
function scheduleAggregateLog() {
  if (scheduledAggregateLog) return
  scheduledAggregateLog = true
  setImmediate(() => {
    if (inMemoryPrefixes.size > 0) {
      const list = Array.from(inMemoryPrefixes).sort().join(', ')
      logger.warn(
        `Using in-memory store for rate limiting (temporary) – Redis not available yet. Policies: ${list}`,
      )
    }
    inMemoryPrefixes.clear()
    scheduledAggregateLog = false
  })
}

function createRateLimitStore(prefix: string): RedisStore | undefined {
  const redisClient = getRedisClient()
  if (redisClient) {
    try {
      const sendCommand: SendCommandFn = async (...args) => {
        const normalizedArgs = args.map((arg) => arg.toString())
        return redisClient.call(...(normalizedArgs as [string, ...string[]])) as Promise<RedisReply>
      }

      return new RedisStore({
        prefix: `rate-limit:${prefix}:`,
        sendCommand,
      })
    } catch (error) {
      logger.error(`Failed to create Redis store for ${prefix}:`, getErrorMessage(error))
      inMemoryPrefixes.add(prefix)
      scheduleAggregateLog()
      return undefined
    }
  }
  inMemoryPrefixes.add(prefix)
  scheduleAggregateLog()
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
let loginCleanupInterval: NodeJS.Timeout | null = null
if (useInMemoryLogin && loginAttemptsStore) {
  const interval = setInterval(() => {
    if (!loginAttemptsStore) return

    const now = Date.now()
    const fifteenMinutes = 15 * 60 * 1000

    loginAttemptsStore.forEach((attempts, key) => {
      const recentAttempts = attempts.filter((time) => now - time < fifteenMinutes)
      if (recentAttempts.length === 0) {
        loginAttemptsStore?.delete(key)
      } else {
        loginAttemptsStore?.set(key, recentAttempts)
      }
    })
  }, 60 * 1000) // Clean every minute

  // Ensure this timer does not keep the process alive (important for tests)
  interval.unref()
  loginCleanupInterval = interval
}

/**
 * Stops the background cleanup interval for the in-memory login attempts store.
 * This is primarily used in tests to prevent timers from keeping the process alive.
 */
export function stopRateLimiterCleanup(): void {
  if (loginCleanupInterval) {
    clearInterval(loginCleanupInterval)
    loginCleanupInterval = null
  }
}

/**
 * Strict rate limiter for authentication endpoints
 * 5 attempts per 15 minutes per IP
 */
const authStore = createRateLimitStore('auth')
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: createMessage('authentication endpoints', 5, '15 minutes'),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  ...(authStore ? { store: authStore } : {}),
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
const gameCreationStore = createRateLimitStore('game-creation')
export const gameCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 games per hour
  message: createMessage('game creation', 10, 'hour'),
  standardHeaders: true,
  legacyHeaders: false,
  ...(gameCreationStore ? { store: gameCreationStore } : {}),
})

/**
 * Rate limiter for messaging/chat
 * 30 messages per minute per user
 */
const messageStore = createRateLimitStore('messages')
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: createMessage('messaging', 30, 'minute'),
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed requests
  ...(messageStore ? { store: messageStore } : {}),
})

/**
 * Strict limiter for password reset requests
 * 3 requests per hour per email
 */
const passwordResetStore = createRateLimitStore('password-reset')
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: 'Too many password reset requests. Please check your email or try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  ...(passwordResetStore ? { store: passwordResetStore } : {}),
})

/**
 * Rate limiter for map uploads
 * 5 maps per day per user
 */
const mapUploadStore = createRateLimitStore('map-upload')
export const mapUploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // 5 maps per day
  message: createMessage('map uploads', 5, 'day'),
  standardHeaders: true,
  legacyHeaders: false,
  ...(mapUploadStore ? { store: mapUploadStore } : {}),
})

/**
 * General API rate limiter
 * 100 requests per minute for general endpoints
 */
const generalApiStore = createRateLimitStore('general-api')
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  ...(generalApiStore ? { store: generalApiStore } : {}),
})

/**
 * Strict rate limiter for admin operations
 * 30 requests per minute for admin endpoints
 */
const adminStore = createRateLimitStore('admin')
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Admin operation rate limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
  ...(adminStore ? { store: adminStore } : {}),
})

/**
 * Socket connection rate limiter
 * 5 connection attempts per minute per IP
 */
const socketConnStore = createRateLimitStore('socket-connection')
export const socketConnectionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 connection attempts
  message: 'Too many socket connection attempts.',
  standardHeaders: true,
  legacyHeaders: false,
  ...(socketConnStore ? { store: socketConnStore } : {}),
})

/**
 * Tracks suspicious activity and blocks IPs that repeatedly hit rate limits.
 */
export class SuspiciousActivityTracker {
  private suspiciousIPs = new Map<string, number>()
  private blockedIPs = new Set<string>()
  private readonly THRESHOLD = 10 // 10 rate limit violations
  private readonly BLOCK_DURATION = 60 * 60 // 1 hour in seconds for Redis

  private getRedis() {
    return getRedisClient()
  }

  /**
   * Records a rate limit violation for a given IP address.
   * @param {string} ip - The IP address to record a violation for.
   */
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

  /**
   * Blocks an IP address for a configured duration.
   * @param {string} ip - The IP address to block.
   */
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
    const timeout = setTimeout(() => {
      this.blockedIPs.delete(ip)
      this.suspiciousIPs.delete(ip)
    }, this.BLOCK_DURATION * 1000) // Convert to milliseconds for setTimeout
    // Don't hold the process open for long timeouts
    timeout.unref()
  }

  /**
   * Checks if an IP address is currently blocked.
   * @param {string} ip - The IP address to check.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the IP is blocked, otherwise `false`.
   */
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

  /**
   * Returns an Express middleware function that checks for and blocks suspicious IPs.
   * @returns {RequestHandler} The Express middleware function.
   */
  middleware() {
    const shouldEvaluateRequest = (req: Request) => {
      const base = req.baseUrl ?? ''
      const path = req.path ?? ''
      const combined = `${base}${path}`

      if (combined.startsWith('/api')) {
        return true
      }

      if (combined.startsWith('/socket.io')) {
        return true
      }

      return false
    }

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!shouldEvaluateRequest(req)) {
        next()
        return
      }

      const ip = req.ip || 'unknown'

      if (await this.isBlocked(ip)) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Your IP has been temporarily blocked due to suspicious activity.',
        })
        return
      }

      next()
    }
  }
}

export const suspiciousActivityTracker = new SuspiciousActivityTracker()

/**
 * Standard rate limiter for general protected routes
 * 60 requests per minute
 */
const standardStore = createRateLimitStore('standard')
export const standardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  ...(standardStore ? { store: standardStore } : {}),
})
