"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionMiddleware = createSessionMiddleware;
exports.enableRedisSessionStore = enableRedisSessionStore;
exports.sessionMiddleware = sessionMiddleware;
const node_crypto_1 = require("node:crypto");
const express_session_1 = __importDefault(require("express-session"));
const redis_js_1 = require("../config/redis.js");
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const logger_js_1 = require("../utils/logger.js");
const { RedisStore } = require('connect-redis');
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
        logger_js_1.logger.error(errorMessage);
        throw new Error(errorMessage);
    }
    const generatedSecret = (0, node_crypto_1.randomBytes)(32).toString('hex');
    if (!configuredSecret) {
        logger_js_1.logger.warn('⚠️ SESSION_SECRET is not set. Generating an ephemeral development secret. Sessions will reset on server restarts until SESSION_SECRET is configured.');
    }
    else {
        logger_js_1.logger.warn('⚠️ Ignoring insecure default SESSION_SECRET value. Generating an ephemeral development secret instead. Sessions will reset on server restarts until SESSION_SECRET is configured.');
    }
    process.env.SESSION_SECRET = generatedSecret;
    return generatedSecret;
}
function createSessionMiddleware() {
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
        const MemoryStore = express_session_1.default.MemoryStore;
        sessionConfig.store = new MemoryStore();
        if (process.env.REDIS_URL) {
            logger_js_1.logger.warn('⚠️ Using temporary MemoryStore while Redis initializes (this is expected during startup)');
        }
        else {
            logger_js_1.logger.info('ℹ️ Using MemoryStore for sessions (Redis not configured)');
        }
    }
    currentSessionMiddleware = (0, express_session_1.default)(sessionConfig);
    return currentSessionMiddleware;
}
function tryConfigureRedisStore(sessionConfig) {
    const redisClient = (0, redis_js_1.getRedisClient)();
    if (redisClient && !isRedisStoreActive) {
        try {
            sessionConfig.store = new RedisStore({
                client: redisClient,
                prefix: 'session:',
                ttl: 60 * 60 * 24 * 7,
            });
            isRedisStoreActive = true;
            logger_js_1.logger.info('✅ Using Redis for session storage');
            return true;
        }
        catch (error) {
            logger_js_1.logger.error('Failed to create Redis session store:', (0, errorHelpers_js_1.getErrorMessage)(error));
            logger_js_1.logger.warn('⚠️ Falling back to in-memory session storage');
            isRedisStoreActive = false;
        }
    }
    else if (!redisClient) {
        logger_js_1.logger.warn('⚠️ Redis not available, using in-memory session storage');
    }
    return false;
}
function enableRedisSessionStore() {
    if (isRedisStoreActive) {
        logger_js_1.logger.info('Redis session store already active');
        return true;
    }
    const redisClient = (0, redis_js_1.getRedisClient)();
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
            currentSessionMiddleware = (0, express_session_1.default)(sessionConfig);
            isRedisStoreActive = true;
            logger_js_1.logger.info('✅ Session middleware reconfigured to use Redis store');
            return true;
        }
        catch (error) {
            logger_js_1.logger.error('Failed to enable Redis session store:', (0, errorHelpers_js_1.getErrorMessage)(error));
            return false;
        }
    }
    return false;
}
function sessionMiddleware(req, res, next) {
    if (currentSessionMiddleware) {
        return currentSessionMiddleware(req, res, next);
    }
    logger_js_1.logger.error('Session middleware not initialized!');
    return next();
}
//# sourceMappingURL=session.js.map