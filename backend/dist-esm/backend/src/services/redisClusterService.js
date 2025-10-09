import { Cluster } from 'ioredis';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
export class RedisClusterService {
    constructor() {
        this.cluster = null;
        this.fallbackClient = null;
        this.isClusterMode = false;
        this.metrics = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0,
            totalRequests: 0,
        };
        this.CACHE_TIERS = {
            CRITICAL: 30 * 60,
            STANDARD: 15 * 60,
            EXTENDED: 60 * 60,
            TEMPORARY: 5 * 60,
        };
    }
    async initialize() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const clusterNodes = process.env.REDIS_CLUSTER_NODES;
        try {
            if (clusterNodes) {
                await this.initializeCluster(clusterNodes);
            }
            else {
                await this.initializeFallback(redisUrl);
            }
            logger.info('✅ Redis Cluster Service initialized', {
                mode: this.isClusterMode ? 'cluster' : 'standalone',
                nodes: clusterNodes?.split(',').length || 1,
            });
        }
        catch (error) {
            logger.error('❌ Failed to initialize Redis Cluster Service:', error);
            throw error;
        }
    }
    async initializeCluster(nodesString) {
        const nodeArray = nodesString.split(',').map((node) => {
            const [host, port] = node.trim().split(':');
            return { host, port: parseInt(port, 10) || 6379 };
        });
        const config = {
            nodes: nodeArray,
            options: {
                enableReadyCheck: true,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
                clusterRetryDelayOnFailover: 100,
                enableOfflineQueue: false,
                redisOptions: {
                    password: process.env.REDIS_PASSWORD,
                    connectTimeout: 10000,
                    commandTimeout: 5000,
                },
            },
        };
        this.cluster = new Cluster(config.nodes, config.options);
        this.isClusterMode = true;
        this.cluster.on('connect', () => {
            logger.info('🔗 Redis Cluster connected');
        });
        this.cluster.on('error', (error) => {
            logger.error('❌ Redis Cluster error:', error);
            this.metrics.errors++;
        });
        this.cluster.on('node error', (error, node) => {
            const host = node.host ?? 'unknown-host';
            const port = node.port ?? 0;
            logger.warn(`⚠️ Redis node error (${host}:${port}):`, error);
        });
        await this.cluster.connect();
    }
    async initializeFallback(_redisUrl) {
        this.fallbackClient = getRedisClient();
        if (!this.fallbackClient) {
            logger.warn('Centralized Redis client not available, RedisClusterService will be disabled');
            return;
        }
        logger.info('🔗 RedisClusterService using centralized Redis client with Railway network support');
        this.fallbackClient.on('error', (error) => {
            logger.warn('RedisClusterService client error:', error.message);
            this.metrics.errors++;
        });
    }
    getClient() {
        return this.isClusterMode ? this.cluster : this.fallbackClient;
    }
    async setWithTier(key, value, tier = 'STANDARD') {
        const client = this.getClient();
        if (!client)
            return false;
        try {
            this.metrics.totalRequests++;
            this.metrics.sets++;
            const serializedValue = JSON.stringify({
                data: value,
                tier,
                timestamp: Date.now(),
                version: 1,
            });
            const ttl = this.CACHE_TIERS[tier];
            await client.setex(key, ttl, serializedValue);
            logger.debug(`📦 Cache SET: ${key} (${tier}, TTL: ${ttl}s)`);
            return true;
        }
        catch (error) {
            this.metrics.errors++;
            logger.error(`❌ Cache SET failed for key ${key}:`, error);
            return false;
        }
    }
    async get(key) {
        const client = this.getClient();
        if (!client)
            return null;
        try {
            this.metrics.totalRequests++;
            const result = await client.get(key);
            if (result === null) {
                this.metrics.misses++;
                logger.debug(`💨 Cache MISS: ${key}`);
                return null;
            }
            this.metrics.hits++;
            const parsed = JSON.parse(result);
            logger.debug(`🎯 Cache HIT: ${key} (${parsed.tier})`);
            return parsed.data;
        }
        catch (error) {
            this.metrics.errors++;
            logger.error(`❌ Cache GET failed for key ${key}:`, error);
            return null;
        }
    }
    async mget(keys) {
        const client = this.getClient();
        if (!client || keys.length === 0)
            return [];
        try {
            this.metrics.totalRequests += keys.length;
            const results = await client.mget(...keys);
            const parsed = results.map((result, index) => {
                if (result === null) {
                    this.metrics.misses++;
                    logger.debug(`💨 Cache MISS: ${keys[index]}`);
                    return null;
                }
                this.metrics.hits++;
                try {
                    const parsedValue = JSON.parse(result);
                    logger.debug(`🎯 Cache HIT: ${keys[index]} (${parsedValue.tier})`);
                    return parsedValue.data;
                }
                catch (parseError) {
                    logger.error(`❌ Failed to parse cached value for key ${keys[index]}:`, parseError);
                    return null;
                }
            });
            return parsed;
        }
        catch (error) {
            this.metrics.errors += keys.length;
            logger.error('❌ Cache MGET failed:', error);
            return keys.map(() => null);
        }
    }
    async mset(keyValuePairs) {
        const client = this.getClient();
        if (!client || keyValuePairs.length === 0)
            return false;
        try {
            this.metrics.totalRequests += keyValuePairs.length;
            const pipeline = client.pipeline();
            for (const { key, value, tier = 'STANDARD' } of keyValuePairs) {
                const serializedValue = JSON.stringify({
                    data: value,
                    tier,
                    timestamp: Date.now(),
                    version: 1,
                });
                const ttl = this.CACHE_TIERS[tier];
                pipeline.setex(key, ttl, serializedValue);
                this.metrics.sets++;
            }
            await pipeline.exec();
            logger.debug(`📦 Cache MSET: ${keyValuePairs.length} keys`);
            return true;
        }
        catch (error) {
            this.metrics.errors += keyValuePairs.length;
            logger.error('❌ Cache MSET failed:', error);
            return false;
        }
    }
    async deletePattern(pattern) {
        const client = this.getClient();
        if (!client)
            return 0;
        try {
            let cursor = '0';
            let deletedCount = 0;
            do {
                const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = nextCursor;
                if (keys.length > 0) {
                    await client.del(...keys);
                    deletedCount += keys.length;
                    this.metrics.deletes += keys.length;
                }
            } while (cursor !== '0');
            logger.info(`🗑️ Deleted ${deletedCount} keys matching pattern: ${pattern}`);
            return deletedCount;
        }
        catch (error) {
            this.metrics.errors++;
            logger.error(`❌ Failed to delete pattern ${pattern}:`, error);
            return 0;
        }
    }
    async warmCache(warmingTasks) {
        logger.info('🔥 Starting cache warming...');
        try {
            await Promise.allSettled(warmingTasks);
            logger.info('✅ Cache warming completed');
        }
        catch (error) {
            logger.error('❌ Cache warming failed:', error);
        }
    }
    getMetrics() {
        const hitRate = this.metrics.totalRequests > 0 ? (this.metrics.hits / this.metrics.totalRequests) * 100 : 0;
        const errorRate = this.metrics.totalRequests > 0 ? (this.metrics.errors / this.metrics.totalRequests) * 100 : 0;
        return {
            ...this.metrics,
            hitRate: Math.round(hitRate * 100) / 100,
            errorRate: Math.round(errorRate * 100) / 100,
        };
    }
    resetMetrics() {
        this.metrics = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0,
            totalRequests: 0,
        };
    }
    async healthCheck() {
        const client = this.getClient();
        if (!client) {
            return { status: 'unhealthy', details: { error: 'No Redis client available' } };
        }
        try {
            const pingResult = await client.ping();
            const info = await client.info('memory');
            const metrics = this.getMetrics();
            return {
                status: pingResult === 'PONG' ? 'healthy' : 'unhealthy',
                details: {
                    mode: this.isClusterMode ? 'cluster' : 'standalone',
                    ping: pingResult,
                    metrics,
                    memory: this.parseRedisInfo(info),
                },
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                details: { error: error.message },
            };
        }
    }
    parseRedisInfo(info) {
        const result = {};
        info.split('\r\n').forEach((line) => {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                result[key] = value;
            }
        });
        return result;
    }
    async shutdown() {
        logger.info('🔄 Shutting down Redis Cluster Service...');
        try {
            if (this.cluster) {
                await this.cluster.quit();
            }
            if (this.fallbackClient) {
                await this.fallbackClient.quit();
            }
            logger.info('✅ Redis Cluster Service shutdown complete');
        }
        catch (error) {
            logger.error('❌ Error during Redis Cluster Service shutdown:', error);
        }
    }
}
export const redisClusterService = new RedisClusterService();
//# sourceMappingURL=redisClusterService.js.map