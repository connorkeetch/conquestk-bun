import Redis from 'ioredis';
import { getErrorMessage, toKnownError } from '../utils/errorHelpers.js';
import { logger } from '../utils/logger.js';
let redisClient = null;
let pubClient = null;
let subClient = null;
export async function initializeRedis() {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (!redisUrl) {
        logger.warn('Redis URL not configured, using in-memory fallback');
        return { redisClient: null, pubClient: null, subClient: null };
    }
    logger.debug(`Initializing Redis connection...`);
    logger.debug(`Using Redis URL: ${redisUrl.replace(/:[^:]*@/, ':****@')}`);
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
        logger.info(`🚂 Railway environment detected - waiting ${waitTime / 1000}s for private network initialization...`);
        logger.debug(`Environment indicators: NODE_ENV=${process.env.NODE_ENV}, RAILWAY_ENV=${process.env.RAILWAY_ENVIRONMENT}, PROJECT_ID=${process.env.RAILWAY_PROJECT_ID}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        logger.info(`🚂 Railway network wait complete, proceeding with Redis connection...`);
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
                    logger.error(`Redis connection failed after ${times} attempts, giving up`);
                    return null;
                }
                logger.warn(`Redis connection attempt ${times} failed, retrying in ${delay}ms`);
                return delay;
            },
        };
        redisClient = new Redis(finalRedisUrl, {
            ...redisOptions,
            connectionName: 'main',
        });
        pubClient = new Redis(finalRedisUrl, {
            ...redisOptions,
            connectionName: 'pub',
        });
        subClient = new Redis(finalRedisUrl, {
            ...redisOptions,
            connectionName: 'sub',
        });
        redisClient.on('connect', () => {
            logger.info('✅ Redis client connected');
        });
        redisClient.on('error', (err) => {
            const errorDetails = toKnownError(err);
            const errorMsg = errorDetails.message;
            const errorCode = typeof errorDetails.code === 'string'
                ? errorDetails.code
                : errorDetails.code !== undefined
                    ? String(errorDetails.code)
                    : undefined;
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
                logger.warn(`Redis client error (${errorCode || 'unknown'}): ${errorMsg}`);
                if (errorCode &&
                    !['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(errorCode)) {
                    logger.error('Redis client detailed error:', errorDetails);
                }
            }
            else {
                logger.error('Redis client error:', errorMsg);
                logger.debug('Redis client error details:', errorDetails);
            }
        });
        redisClient.on('ready', () => {
            logger.info('✅ Redis client ready');
        });
        redisClient.on('close', () => {
            logger.warn('Redis client connection closed');
        });
        pubClient.on('connect', () => {
            logger.info('✅ Redis pub client connected');
        });
        pubClient.on('error', (err) => {
            const errorDetails = toKnownError(err);
            const errorMsg = errorDetails.message;
            const errorCode = typeof errorDetails.code === 'string'
                ? errorDetails.code
                : errorDetails.code !== undefined
                    ? String(errorDetails.code)
                    : undefined;
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
                logger.warn(`Redis pub client error (${errorCode || 'unknown'}): ${errorMsg}`);
            }
            else {
                logger.error('Redis pub client error:', errorMsg);
            }
        });
        pubClient.on('close', () => {
            logger.warn('Redis pub client connection closed');
        });
        subClient.on('connect', () => {
            logger.info('✅ Redis sub client connected');
        });
        subClient.on('error', (err) => {
            const errorDetails = toKnownError(err);
            const errorMsg = errorDetails.message;
            const errorCode = typeof errorDetails.code === 'string'
                ? errorDetails.code
                : errorDetails.code !== undefined
                    ? String(errorDetails.code)
                    : undefined;
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
                logger.warn(`Redis sub client error (${errorCode || 'unknown'}): ${errorMsg}`);
            }
            else {
                logger.error('Redis sub client error:', errorMsg);
            }
        });
        subClient.on('close', () => {
            logger.warn('Redis sub client connection closed');
        });
        logger.debug(`Redis connection attempt details:`);
        logger.debug(`  - Final Redis URL: ${finalRedisUrl.replace(/:[^:]*@/, ':****@')}`);
        logger.debug(`  - Connection timeout: ${redisOptions.connectTimeout}ms`);
        logger.debug(`  - Command timeout: ${redisOptions.commandTimeout}ms`);
        logger.debug(`  - Railway environment: ${isRailwayEnvironment}`);
        try {
            await Promise.race([
                redisClient.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 15s')), 15000)),
            ]);
            await redisClient.ping();
            logger.info('✅ Redis connection established and verified');
            return { redisClient, pubClient, subClient };
        }
        catch (err) {
            const errorDetails = toKnownError(err);
            logger.error('🔴 Redis connection failed with detailed error:');
            logger.error(`  - Error type: ${errorDetails.name || 'Unknown'}`);
            logger.error(`  - Error message: ${errorDetails.message || 'No message'}`);
            logger.error(`  - Error code: ${errorDetails.code || 'No code'}`);
            logger.error(`  - System call: ${errorDetails.syscall || 'No syscall'}`);
            logger.error(`  - Hostname: ${errorDetails.hostname || 'No hostname'}`);
            logger.error(`  - Full error details:`, errorDetails);
            if (isRailwayEnvironment) {
                logger.error(`🚂 Railway-specific diagnostics:`);
                logger.error(`  - Railway environment variables: RAILWAY_ENVIRONMENT=${process.env.RAILWAY_ENVIRONMENT}, PROJECT_ID=${process.env.RAILWAY_PROJECT_ID}`);
                logger.error(`  - Network wait was applied: 15 seconds`);
                logger.error(`  - This error occurred AFTER the network wait period`);
                if (errorDetails.code === 'ENOTFOUND' || errorDetails.syscall === 'getaddrinfo') {
                    logger.error(`  - 🔍 This appears to be a DNS resolution issue`);
                    logger.error(`  - 🔍 Railway private network may still be initializing`);
                    logger.error(`  - 🔍 Consider increasing wait time or checking Railway service status`);
                }
            }
            const cleanup = async (client, name) => {
                if (client) {
                    try {
                        await client.disconnect();
                    }
                    catch (e) {
                        logger.warn(`Failed to disconnect ${name} client:`, getErrorMessage(e));
                    }
                }
            };
            await Promise.all([
                cleanup(redisClient, 'main'),
                cleanup(pubClient, 'pub'),
                cleanup(subClient, 'sub'),
            ]);
            logger.warn('Redis disabled, application will use in-memory fallbacks');
            return { redisClient: null, pubClient: null, subClient: null };
        }
    }
    catch (error) {
        logger.error('Failed to initialize Redis:', toKnownError(error));
        return { redisClient: null, pubClient: null, subClient: null };
    }
}
export function getRedisClient() {
    return redisClient;
}
export function getPubSubClients() {
    return { pubClient, subClient };
}
export async function closeRedisConnections() {
    const clients = [redisClient, pubClient, subClient].filter(Boolean);
    await Promise.all(clients.map((client) => client?.quit().catch((err) => logger.error('Error closing Redis connection:', err))));
    logger.info('Redis connections closed');
}
export async function checkRedisHealth() {
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
export async function acquireLock(key, ttlMs = 5000) {
    if (!redisClient) {
        logger.warn('Redis not available, skipping lock acquisition');
        return null;
    }
    const token = `${Date.now()}-${Math.random()}`;
    const result = await redisClient.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
}
export async function releaseLock(key, token) {
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