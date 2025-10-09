"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.standardLimiter = exports.suspiciousActivityTracker = exports.SuspiciousActivityTracker = exports.socketConnectionLimiter = exports.adminLimiter = exports.generalApiLimiter = exports.mapUploadLimiter = exports.passwordResetLimiter = exports.messageLimiter = exports.gameCreationLimiter = exports.loginSlowDown = exports.authLimiter = void 0;
exports.stopRateLimiterCleanup = stopRateLimiterCleanup;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const express_slow_down_1 = __importDefault(require("express-slow-down"));
const rate_limit_redis_1 = __importDefault(require("rate-limit-redis"));
const redis_js_1 = require("../config/redis.js");
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const logger_js_1 = require("../utils/logger.js");
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
            logger_js_1.logger.warn(`Using in-memory store for rate limiting (temporary) – Redis not available yet. Policies: ${list}`);
        }
        inMemoryPrefixes.clear();
        scheduledAggregateLog = false;
    });
}
function createRateLimitStore(prefix) {
    const redisClient = (0, redis_js_1.getRedisClient)();
    if (redisClient) {
        try {
            const sendCommand = async (...args) => {
                const normalizedArgs = args.map((arg) => arg.toString());
                return redisClient.call(...normalizedArgs);
            };
            return new rate_limit_redis_1.default({
                prefix: `rate-limit:${prefix}:`,
                sendCommand,
            });
        }
        catch (error) {
            logger_js_1.logger.error(`Failed to create Redis store for ${prefix}:`, (0, errorHelpers_js_1.getErrorMessage)(error));
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
    const redisClient = (0, redis_js_1.getRedisClient)();
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
function stopRateLimiterCleanup() {
    if (loginCleanupInterval) {
        clearInterval(loginCleanupInterval);
        loginCleanupInterval = null;
    }
}
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: createMessage('authentication endpoints', 5, '15 minutes'),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    store: createRateLimitStore('auth'),
});
exports.loginSlowDown = (0, express_slow_down_1.default)({
    windowMs: 15 * 60 * 1000,
    delayAfter: 2,
    delayMs: () => 1000,
    maxDelayMs: 5000,
    skipSuccessfulRequests: true,
});
exports.gameCreationLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: createMessage('game creation', 10, 'hour'),
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('game-creation'),
});
exports.messageLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    message: createMessage('messaging', 30, 'minute'),
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true,
    store: createRateLimitStore('messages'),
});
exports.passwordResetLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many password reset requests. Please check your email or try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('password-reset'),
});
exports.mapUploadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    message: createMessage('map uploads', 5, 'day'),
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('map-upload'),
});
exports.generalApiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests, please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: false,
    store: createRateLimitStore('general-api'),
});
exports.adminLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Admin operation rate limit exceeded.',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('admin'),
});
exports.socketConnectionLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many socket connection attempts.',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('socket-connection'),
});
class SuspiciousActivityTracker {
    constructor() {
        this.suspiciousIPs = new Map();
        this.blockedIPs = new Set();
        this.THRESHOLD = 10;
        this.BLOCK_DURATION = 60 * 60;
    }
    getRedis() {
        return (0, redis_js_1.getRedisClient)();
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
                logger_js_1.logger.error('Redis error in recordViolation:', error);
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
                logger_js_1.logger.warn(`Blocked IP ${ip} for suspicious activity`);
            }
            catch (error) {
                logger_js_1.logger.error('Redis error in blockIP:', error);
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
                logger_js_1.logger.error('Redis error in isBlocked:', error);
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
exports.SuspiciousActivityTracker = SuspiciousActivityTracker;
exports.suspiciousActivityTracker = new SuspiciousActivityTracker();
exports.standardLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: false,
    store: createRateLimitStore('standard'),
});
//# sourceMappingURL=rateLimiter.js.map