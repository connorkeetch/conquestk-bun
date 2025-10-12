import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import session from 'express-session';
import { getRedisClient } from '../config/redis.js';
import { getErrorMessage } from '../utils/errorHelpers.js';
import { logger } from '../utils/logger.js';
const requireCjs = createRequire(import.meta.url);
const { RedisStore } = requireCjs('connect-redis');
let currentSessionMiddleware = null;
let isRedisStoreActive = false;
const DEFAULT_DEV_SECRET = 'default-dev-secret-change-in-production';
const sessionSecret = resolveSessionSecret();
function resolveSessionSecret() {
    const configuredSecret = process.env.SESSION_SECRET;
    if (configuredSecret && configuredSecret !== DEFAULT_DEV_SECRET) {
        return configuredSecret;
    }
    if (process.env.NODE_ENV === 'production') {
        const errorMessage = 'SESSION_SECRET must be set to a strong, unique value in production. The insecure default fallback was detected.';
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }
    const generatedSecret = randomBytes(32).toString('hex');
    if (!configuredSecret) {
        logger.warn('⚠️ SESSION_SECRET is not set. Generating an ephemeral development secret. Sessions will reset on server restarts until SESSION_SECRET is configured.');
    }
    else {
        logger.warn('⚠️ Ignoring insecure default SESSION_SECRET value. Generating an ephemeral development secret instead. Sessions will reset on server restarts until SESSION_SECRET is configured.');
    }
    process.env.SESSION_SECRET = generatedSecret;
    return generatedSecret;
}
export function createSessionMiddleware() {
    const sessionConfig = {
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        },
        name: 'conquestk.sid',
    };
    const redisConfigured = tryConfigureRedisStore(sessionConfig);
    if (!redisConfigured) {
        const MemoryStore = session.MemoryStore;
        sessionConfig.store = new MemoryStore();
        if (process.env.REDIS_URL) {
            logger.warn('⚠️ Using temporary MemoryStore while Redis initializes (this is expected during startup)');
        }
        else {
            logger.info('ℹ️ Using MemoryStore for sessions (Redis not configured)');
        }
    }
    currentSessionMiddleware = session(sessionConfig);
    return currentSessionMiddleware;
}
function tryConfigureRedisStore(sessionConfig) {
    const redisClient = getRedisClient();
    if (redisClient && !isRedisStoreActive) {
        try {
            sessionConfig.store = new RedisStore({
                client: redisClient,
                prefix: 'session:',
                ttl: 60 * 60 * 24 * 7,
            });
            isRedisStoreActive = true;
            logger.info('✅ Using Redis for session storage');
            return true;
        }
        catch (error) {
            logger.error('Failed to create Redis session store:', getErrorMessage(error));
            logger.warn('⚠️ Falling back to in-memory session storage');
            isRedisStoreActive = false;
        }
    }
    else if (!redisClient) {
        logger.warn('⚠️ Redis not available, using in-memory session storage');
    }
    return false;
}
export function enableRedisSessionStore() {
    if (isRedisStoreActive) {
        logger.info('Redis session store already active');
        return true;
    }
    const redisClient = getRedisClient();
    if (redisClient) {
        try {
            const sessionConfig = {
                secret: sessionSecret,
                resave: false,
                saveUninitialized: false,
                cookie: {
                    secure: process.env.NODE_ENV === 'production',
                    httpOnly: true,
                    maxAge: 1000 * 60 * 60 * 24 * 7,
                    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
                },
                name: 'conquestk.sid',
                store: new RedisStore({
                    client: redisClient,
                    prefix: 'session:',
                    ttl: 60 * 60 * 24 * 7,
                }),
            };
            currentSessionMiddleware = session(sessionConfig);
            isRedisStoreActive = true;
            logger.info('✅ Session middleware reconfigured to use Redis store');
            return true;
        }
        catch (error) {
            logger.error('Failed to enable Redis session store:', getErrorMessage(error));
            return false;
        }
    }
    return false;
}
export function sessionMiddleware(req, res, next) {
    if (currentSessionMiddleware) {
        return currentSessionMiddleware(req, res, next);
    }
    logger.error('Session middleware not initialized!');
    return next();
}
//# sourceMappingURL=session.js.map