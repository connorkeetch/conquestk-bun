"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeRedis = initializeRedis;
exports.getRedisClient = getRedisClient;
exports.getPubSubClients = getPubSubClients;
exports.closeRedisConnections = closeRedisConnections;
exports.checkRedisHealth = checkRedisHealth;
exports.acquireLock = acquireLock;
exports.releaseLock = releaseLock;
const ioredis_1 = __importDefault(require("ioredis"));
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const logger_js_1 = require("../utils/logger.js");
let redisClient = null;
let pubClient = null;
let subClient = null;
async function initializeRedis() {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (!redisUrl) {
        logger_js_1.logger.warn('Redis URL not configured, using in-memory fallback');
        return { redisClient: null, pubClient: null, subClient: null };
    }
    logger_js_1.logger.debug(`Initializing Redis connection...`);
    logger_js_1.logger.debug(`Using Redis URL: ${redisUrl.replace(/:[^:]*@/, ':****@')}`);
    const isRailwayEnvironment = process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        redisUrl.includes('railway.internal') ||
        redisUrl.includes('.railway.app') ||
        redisUrl.includes('.railway.') ||
        redisUrl.includes('redis-');
    if (isRailwayEnvironment) {
        const waitTime = 15000;
        logger_js_1.logger.info(`🚂 Railway environment detected - waiting ${waitTime / 1000}s for private network initialization...`);
        logger_js_1.logger.debug(`Environment indicators: NODE_ENV=${process.env.NODE_ENV}, RAILWAY_ENV=${process.env.RAILWAY_ENVIRONMENT}, PROJECT_ID=${process.env.RAILWAY_PROJECT_ID}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        logger_js_1.logger.info(`🚂 Railway network wait complete, proceeding with Redis connection...`);
    }
    try {
        let finalRedisUrl = redisUrl;
        if (!redisUrl.includes('family=')) {
            const separator = redisUrl.includes('?') ? '&' : '?';
            finalRedisUrl = `${redisUrl}${separator}family=0`;
        }
        const redisOptions = {
            family: 0,
            enableReadyCheck: false,
            connectTimeout: 10000,
            commandTimeout: 5000,
            lazyConnect: true,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                if (times > 3) {
                    logger_js_1.logger.error(`Redis connection failed after ${times} attempts, giving up`);
                    return null;
                }
                logger_js_1.logger.warn(`Redis connection attempt ${times} failed, retrying in ${delay}ms`);
                return delay;
            },
        };
        redisClient = new ioredis_1.default(finalRedisUrl, {
            ...redisOptions,
            connectionName: 'main',
        });
        pubClient = new ioredis_1.default(finalRedisUrl, {
            ...redisOptions,
            connectionName: 'pub',
        });
        subClient = new ioredis_1.default(finalRedisUrl, {
            ...redisOptions,
            connectionName: 'sub',
        });
        redisClient.on('connect', () => {
            logger_js_1.logger.info('✅ Redis client connected');
        });
        redisClient.on('error', (err) => {
            const errorDetails = (0, errorHelpers_js_1.toKnownError)(err);
            const errorMsg = errorDetails.message;
            const errorCode = typeof errorDetails.code === 'string'
                ? errorDetails.code
                : errorDetails.code !== undefined
                    ? String(errorDetails.code)
                    : undefined;
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
                logger_js_1.logger.warn(`Redis client error (${errorCode || 'unknown'}): ${errorMsg}`);
                if (errorCode &&
                    !['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(errorCode)) {
                    logger_js_1.logger.error('Redis client detailed error:', errorDetails);
                }
            }
            else {
                logger_js_1.logger.error('Redis client error:', errorMsg);
                logger_js_1.logger.debug('Redis client error details:', errorDetails);
            }
        });
        redisClient.on('ready', () => {
            logger_js_1.logger.info('✅ Redis client ready');
        });
        redisClient.on('close', () => {
            logger_js_1.logger.warn('Redis client connection closed');
        });
        pubClient.on('connect', () => {
            logger_js_1.logger.info('✅ Redis pub client connected');
        });
        pubClient.on('error', (err) => {
            const errorDetails = (0, errorHelpers_js_1.toKnownError)(err);
            const errorMsg = errorDetails.message;
            const errorCode = typeof errorDetails.code === 'string'
                ? errorDetails.code
                : errorDetails.code !== undefined
                    ? String(errorDetails.code)
                    : undefined;
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
                logger_js_1.logger.warn(`Redis pub client error (${errorCode || 'unknown'}): ${errorMsg}`);
            }
            else {
                logger_js_1.logger.error('Redis pub client error:', errorMsg);
            }
        });
        pubClient.on('close', () => {
            logger_js_1.logger.warn('Redis pub client connection closed');
        });
        subClient.on('connect', () => {
            logger_js_1.logger.info('✅ Redis sub client connected');
        });
        subClient.on('error', (err) => {
            const errorDetails = (0, errorHelpers_js_1.toKnownError)(err);
            const errorMsg = errorDetails.message;
            const errorCode = typeof errorDetails.code === 'string'
                ? errorDetails.code
                : errorDetails.code !== undefined
                    ? String(errorDetails.code)
                    : undefined;
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
                logger_js_1.logger.warn(`Redis sub client error (${errorCode || 'unknown'}): ${errorMsg}`);
            }
            else {
                logger_js_1.logger.error('Redis sub client error:', errorMsg);
            }
        });
        subClient.on('close', () => {
            logger_js_1.logger.warn('Redis sub client connection closed');
        });
        logger_js_1.logger.debug(`Redis connection attempt details:`);
        logger_js_1.logger.debug(`  - Final Redis URL: ${finalRedisUrl.replace(/:[^:]*@/, ':****@')}`);
        logger_js_1.logger.debug(`  - Connection timeout: ${redisOptions.connectTimeout}ms`);
        logger_js_1.logger.debug(`  - Command timeout: ${redisOptions.commandTimeout}ms`);
        logger_js_1.logger.debug(`  - Railway environment: ${isRailwayEnvironment}`);
        try {
            await Promise.race([
                redisClient.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 15s')), 15000)),
            ]);
            await redisClient.ping();
            logger_js_1.logger.info('✅ Redis connection established and verified');
            return { redisClient, pubClient, subClient };
        }
        catch (err) {
            const errorDetails = (0, errorHelpers_js_1.toKnownError)(err);
            logger_js_1.logger.error('🔴 Redis connection failed with detailed error:');
            logger_js_1.logger.error(`  - Error type: ${errorDetails.name || 'Unknown'}`);
            logger_js_1.logger.error(`  - Error message: ${errorDetails.message || 'No message'}`);
            logger_js_1.logger.error(`  - Error code: ${errorDetails.code || 'No code'}`);
            logger_js_1.logger.error(`  - System call: ${errorDetails.syscall || 'No syscall'}`);
            logger_js_1.logger.error(`  - Hostname: ${errorDetails.hostname || 'No hostname'}`);
            logger_js_1.logger.error(`  - Full error details:`, errorDetails);
            if (isRailwayEnvironment) {
                logger_js_1.logger.error(`🚂 Railway-specific diagnostics:`);
                logger_js_1.logger.error(`  - Railway environment variables: RAILWAY_ENVIRONMENT=${process.env.RAILWAY_ENVIRONMENT}, PROJECT_ID=${process.env.RAILWAY_PROJECT_ID}`);
                logger_js_1.logger.error(`  - Network wait was applied: 15 seconds`);
                logger_js_1.logger.error(`  - This error occurred AFTER the network wait period`);
                if (errorDetails.code === 'ENOTFOUND' || errorDetails.syscall === 'getaddrinfo') {
                    logger_js_1.logger.error(`  - 🔍 This appears to be a DNS resolution issue`);
                    logger_js_1.logger.error(`  - 🔍 Railway private network may still be initializing`);
                    logger_js_1.logger.error(`  - 🔍 Consider increasing wait time or checking Railway service status`);
                }
            }
            const cleanup = async (client, name) => {
                if (client) {
                    try {
                        await client.disconnect();
                    }
                    catch (e) {
                        logger_js_1.logger.warn(`Failed to disconnect ${name} client:`, (0, errorHelpers_js_1.getErrorMessage)(e));
                    }
                }
            };
            await Promise.all([
                cleanup(redisClient, 'main'),
                cleanup(pubClient, 'pub'),
                cleanup(subClient, 'sub'),
            ]);
            logger_js_1.logger.warn('Redis disabled, application will use in-memory fallbacks');
            return { redisClient: null, pubClient: null, subClient: null };
        }
    }
    catch (error) {
        logger_js_1.logger.error('Failed to initialize Redis:', (0, errorHelpers_js_1.toKnownError)(error));
        return { redisClient: null, pubClient: null, subClient: null };
    }
}
function getRedisClient() {
    return redisClient;
}
function getPubSubClients() {
    return { pubClient, subClient };
}
async function closeRedisConnections() {
    const clients = [redisClient, pubClient, subClient].filter(Boolean);
    await Promise.all(clients.map((client) => client?.quit().catch((err) => logger_js_1.logger.error('Error closing Redis connection:', err))));
    logger_js_1.logger.info('Redis connections closed');
}
async function checkRedisHealth() {
    if (!redisClient) {
        return { healthy: false, message: 'Redis not configured' };
    }
    try {
        const result = await redisClient.ping();
        return {
            healthy: result === 'PONG',
            message: result === 'PONG' ? 'Redis is healthy' : 'Redis ping failed',
        };
    }
    catch (error) {
        return {
            healthy: false,
            message: `Redis health check failed: ${error}`,
        };
    }
}
async function acquireLock(key, ttlMs = 5000) {
    if (!redisClient) {
        logger_js_1.logger.warn('Redis not available, skipping lock acquisition');
        return null;
    }
    const token = `${Date.now()}-${Math.random()}`;
    const result = await redisClient.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
}
async function releaseLock(key, token) {
    if (!redisClient) {
        return;
    }
    const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
    await redisClient.eval(script, 1, key, token);
}
//# sourceMappingURL=redis.js.map