import type { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'

/**
 * Rate limiting configurations for different endpoint types
 */

// Helper to create custom error messages
const createMessage = (endpoint: string, limit: number, window: string) => {
  return `Too many requests to ${endpoint}. Limited to ${limit} requests per ${window}. Please try again later.`
}

// Store for tracking attempts (in production, use Redis)
const loginAttemptsStore = new Map<string, number[]>()

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  const fifteenMinutes = 15 * 60 * 1000

  loginAttemptsStore.forEach((attempts, key) => {
    const recentAttempts = attempts.filter((time) => now - time < fifteenMinutes)
    if (recentAttempts.length === 0) {
      loginAttemptsStore.delete(key)
    } else {
      loginAttemptsStore.set(key, recentAttempts)
    }
  })
}, 60 * 1000) // Clean every minute

/**
 * Strict rate limiter for authentication endpoints
 * 5 attempts per 15 minutes per IP
 */
// TEMPORARILY DISABLED FOR TESTING - RE-ENABLE AFTER TESTING
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // TEMPORARILY INCREASED FROM 5 TO 500 FOR TESTING
  message: createMessage('authentication endpoints', 5, '15 minutes'),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
})

/**
 * Progressive slow down for failed login attempts
 * Adds delay after 2 failed attempts
 */
export const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 2, // Start slowing after 2 requests
  delayMs: 1000, // Add 1 second delay per attempt
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
})

/**
 * Custom rate limiter for tracking suspicious activity
 * Blocks IPs that repeatedly hit rate limits
 */
export class SuspiciousActivityTracker {
  private suspiciousIPs = new Map<string, number>()
  private blockedIPs = new Set<string>()
  private readonly THRESHOLD = 10 // 10 rate limit violations
  private readonly BLOCK_DURATION = 60 * 60 * 1000 // 1 hour block

  recordViolation(ip: string) {
    const violations = (this.suspiciousIPs.get(ip) || 0) + 1
    this.suspiciousIPs.set(ip, violations)

    if (violations >= this.THRESHOLD) {
      this.blockIP(ip)
    }
  }

  blockIP(ip: string) {
    this.blockedIPs.add(ip)

    // Automatically unblock after duration
    setTimeout(() => {
      this.blockedIPs.delete(ip)
      this.suspiciousIPs.delete(ip)
    }, this.BLOCK_DURATION)
  }

  isBlocked(ip: string): boolean {
    return this.blockedIPs.has(ip)
  }

  middleware() {
    return (req: Request, res: Response, next: Function): any => {
      const ip = req.ip || 'unknown'

      if (this.isBlocked(ip)) {
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
})
