"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobIdempotencyService = exports.JobIdempotencyService = void 0;
const redis_js_1 = require("../config/redis.js");
const logger_js_1 = require("../utils/logger.js");
const DEFAULT_TTL_SECONDS = 60 * 60;
const IN_MEMORY_MAX_SIZE = 5000;
class JobIdempotencyService {
    constructor() {
        this.inMemoryStore = new Map();
    }
    buildKey(queueName, jobKey) {
        return `queue:idempotency:${queueName}:${jobKey}`;
    }
    getRedis() {
        return (0, redis_js_1.getRedisClient)();
    }
    cleanupInMemoryStore() {
        if (this.inMemoryStore.size === 0)
            return;
        const now = Date.now();
        for (const [key, entry] of this.inMemoryStore.entries()) {
            if (entry.expiresAt <= now) {
                this.inMemoryStore.delete(key);
            }
        }
        if (this.inMemoryStore.size > IN_MEMORY_MAX_SIZE) {
            const overflow = this.inMemoryStore.size - IN_MEMORY_MAX_SIZE;
            const keysToRemove = Array.from(this.inMemoryStore.keys()).slice(0, overflow);
            for (const key of keysToRemove) {
                this.inMemoryStore.delete(key);
            }
        }
    }
    async getProcessedJob(queueName, jobKey) {
        const redis = this.getRedis();
        const storageKey = this.buildKey(queueName, jobKey);
        if (redis) {
            try {
                const raw = await redis.get(storageKey);
                if (!raw) {
                    return { exists: false };
                }
                if (raw === '1') {
                    return { exists: true };
                }
                try {
                    const parsed = JSON.parse(raw);
                    return parsed && typeof parsed === 'object'
                        ? { exists: true, value: parsed.value }
                        : { exists: true };
                }
                catch (parseError) {
                    logger_js_1.logger.warn('Failed to parse idempotency payload from Redis', {
                        queueName,
                        jobKey,
                        error: parseError instanceof Error ? parseError.message : parseError,
                    });
                    return { exists: true };
                }
            }
            catch (error) {
                logger_js_1.logger.error('Redis error while reading job idempotency state', {
                    queueName,
                    jobKey,
                    error,
                });
            }
        }
        const fallback = this.inMemoryStore.get(storageKey);
        if (!fallback) {
            return { exists: false };
        }
        if (fallback.expiresAt <= Date.now()) {
            this.inMemoryStore.delete(storageKey);
            return { exists: false };
        }
        if (fallback.payload === null) {
            return { exists: true };
        }
        try {
            const parsed = JSON.parse(fallback.payload);
            return parsed && typeof parsed === 'object'
                ? { exists: true, value: parsed.value }
                : { exists: true };
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to parse in-memory idempotency payload', {
                queueName,
                jobKey,
                error,
            });
            return { exists: true };
        }
    }
    async markProcessedJob(queueName, jobKey, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
        const redis = this.getRedis();
        const storageKey = this.buildKey(queueName, jobKey);
        const payload = value === undefined
            ? '1'
            : JSON.stringify({ storedAt: new Date().toISOString(), value });
        if (redis) {
            try {
                await redis.set(storageKey, payload, 'EX', ttlSeconds);
                return;
            }
            catch (error) {
                logger_js_1.logger.error('Redis error while writing job idempotency state, falling back to memory', {
                    queueName,
                    jobKey,
                    error,
                });
            }
        }
        this.inMemoryStore.set(storageKey, {
            expiresAt: Date.now() + ttlSeconds * 1000,
            payload,
        });
        this.cleanupInMemoryStore();
    }
    async clearProcessedJob(queueName, jobKey) {
        const redis = this.getRedis();
        const storageKey = this.buildKey(queueName, jobKey);
        if (redis) {
            try {
                await redis.del(storageKey);
            }
            catch (error) {
                logger_js_1.logger.error('Redis error while clearing job idempotency state', {
                    queueName,
                    jobKey,
                    error,
                });
            }
        }
        this.inMemoryStore.delete(storageKey);
    }
}
exports.JobIdempotencyService = JobIdempotencyService;
exports.jobIdempotencyService = new JobIdempotencyService();
//# sourceMappingURL=jobIdempotencyService.js.map