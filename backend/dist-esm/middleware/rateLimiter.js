import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';
import { getErrorMessage } from '../utils/errorHelpers.js';
import { logger } from '../utils/logger.js';
const createMessage = (endpoint, limit, window) => {
    return `Too many requests to ${endpoint}. Limited to ${limit} requests per ${window}. Please try again later.`;
};
const inMemoryPrefixes = new Set();
let scheduledAggregateLog = false;
function scheduleAggregateLog() {
    if (scheduledAggregateLog)
        return;
    scheduledAggregateLog = true;
    setImmediate(() => {
        if (inMemoryPrefixes.size > 0) {
            const list = Array.from(inMemoryPrefixes).sort().join(', ');
            logger.warn(`Using in-memory store for rate limiting (temporary) – Redis not available yet. Policies: ${list}`);
        }
        inMemoryPrefixes.clear();
        scheduledAggregateLog = false;
    });
}
function createRateLimitStore(prefix) {
    const redisClient = getRedisClient();
    if (redisClient) {
        try {
            const sendCommand = async (...args) => {
                const normalizedArgs = args.map((arg) => arg.toString());
                return redisClient.call(...normalizedArgs);
            };
            return new RedisStore({
                prefix: `rate-limit:${prefix}:`,
                sendCommand,
            });
        }
        catch (error) {
            logger.error(`Failed to create Redis store for ${prefix}:`, getErrorMessage(error));
            inMemoryPrefixes.add(prefix);
            scheduleAggregateLog();
            return undefined;
        }
    }
    inMemoryPrefixes.add(prefix);
    scheduleAggregateLog();
    return undefined;
}
let loginAttemptsStore = null;
function initLoginAttemptsStore() {
    const redisClient = getRedisClient();
    if (!redisClient) {
        loginAttemptsStore = new Map();
        return true;
    }
    return false;
}
const useInMemoryLogin = initLoginAttemptsStore();
let loginCleanupInterval = null;
if (useInMemoryLogin && loginAttemptsStore) {
    const interval = setInterval(() => {
        if (!loginAttemptsStore)
            return;
        const now = Date.now();
        const fifteenMinutes = 15 * 60 * 1000;
        loginAttemptsStore.forEach((attempts, key) => {
            const recentAttempts = attempts.filter((time) => now - time < fifteenMinutes);
            if (recentAttempts.length === 0) {
                loginAttemptsStore?.delete(key);
            }
            else {
                loginAttemptsStore?.set(key, recentAttempts);
            }
        });
    }, 60 * 1000);
    interval.unref();
    loginCleanupInterval = interval;
}
export function stopRateLimiterCleanup() {
    if (loginCleanupInterval) {
        clearInterval(loginCleanupInterval);
        loginCleanupInterval = null;
    }
}
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: createMessage('authentication endpoints', 5, '15 minutes'),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    store: createRateLimitStore('auth'),
});
export const loginSlowDown = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 2,
    delayMs: () => 1000,
    maxDelayMs: 5000,
    skipSuccessfulRequests: true,
});
export const gameCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: createMessage('game creation', 10, 'hour'),
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('game-creation'),
});
export const messageLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: createMessage('messaging', 30, 'minute'),
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true,
    store: createRateLimitStore('messages'),
});
export const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many password reset requests. Please check your email or try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('password-reset'),
});
export const mapUploadLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    message: createMessage('map uploads', 5, 'day'),
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('map-upload'),
});
export const generalApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests, please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: false,
    store: createRateLimitStore('general-api'),
});
export const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Admin operation rate limit exceeded.',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('admin'),
});
export const socketConnectionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many socket connection attempts.',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('socket-connection'),
});
export class SuspiciousActivityTracker {
    suspiciousIPs = new Map();
    blockedIPs = new Set();
    THRESHOLD = 10;
    BLOCK_DURATION = 60 * 60;
    getRedis() {
        return getRedisClient();
    }
    async recordViolation(ip) {
        const redisClient = this.getRedis();
        if (redisClient) {
            try {
                const key = `suspicious:${ip}`;
                const violations = await redisClient.incr(key);
                if (violations === 1) {
                    await redisClient.expire(key, this.BLOCK_DURATION);
                }
                if (violations >= this.THRESHOLD) {
                    await this.blockIP(ip);
                }
            }
            catch (error) {
                logger.error('Redis error in recordViolation:', error);
                this.recordViolationInMemory(ip);
            }
        }
        else {
            this.recordViolationInMemory(ip);
        }
    }
    recordViolationInMemory(ip) {
        const violations = (this.suspiciousIPs.get(ip) || 0) + 1;
        this.suspiciousIPs.set(ip, violations);
        if (violations >= this.THRESHOLD) {
            this.blockIPInMemory(ip);
        }
    }
    async blockIP(ip) {
        const redisClient = this.getRedis();
        if (redisClient) {
            try {
                const key = `blocked:${ip}`;
                await redisClient.setex(key, this.BLOCK_DURATION, '1');
                logger.warn(`Blocked IP ${ip} for suspicious activity`);
            }
            catch (error) {
                logger.error('Redis error in blockIP:', error);
                this.blockIPInMemory(ip);
            }
        }
        else {
            this.blockIPInMemory(ip);
        }
    }
    blockIPInMemory(ip) {
        this.blockedIPs.add(ip);
        const timeout = setTimeout(() => {
            this.blockedIPs.delete(ip);
            this.suspiciousIPs.delete(ip);
        }, this.BLOCK_DURATION * 1000);
        timeout.unref();
    }
    async isBlocked(ip) {
        const redisClient = this.getRedis();
        if (redisClient) {
            try {
                const key = `blocked:${ip}`;
                const result = await redisClient.get(key);
                return result === '1';
            }
            catch (error) {
                logger.error('Redis error in isBlocked:', error);
                return this.blockedIPs.has(ip);
            }
        }
        return this.blockedIPs.has(ip);
    }
    middleware() {
        const shouldEvaluateRequest = (req) => {
            const base = req.baseUrl ?? '';
            const path = req.path ?? '';
            const combined = `${base}${path}`;
            if (combined.startsWith('/api')) {
                return true;
            }
            if (combined.startsWith('/socket.io')) {
                return true;
            }
            return false;
        };
        return async (req, res, next) => {
            if (!shouldEvaluateRequest(req)) {
                next();
                return;
            }
            const ip = req.ip || 'unknown';
            if (await this.isBlocked(ip)) {
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Your IP has been temporarily blocked due to suspicious activity.',
                });
                return;
            }
            next();
        };
    }
}
export const suspiciousActivityTracker = new SuspiciousActivityTracker();
export const standardLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: false,
    store: createRateLimitStore('standard'),
});
//# sourceMappingURL=rateLimiter.js.map