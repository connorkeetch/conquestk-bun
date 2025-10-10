import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
export class CacheService {
    constructor() {
        this.redisClient = getRedisClient();
        this.inMemoryCache = new Map();
    }
    async get(key) {
        if (this.redisClient) {
            try {
                const value = await this.redisClient.get(key);
                if (value) {
                    return JSON.parse(value);
                }
            }
            catch (error) {
                logger.error(`Cache get error for key ${key}:`, error);
            }
        }
        else {
            const cached = this.inMemoryCache.get(key);
            if (cached && cached.expires > Date.now()) {
                return cached.data;
            }
            this.inMemoryCache.delete(key);
        }
        return null;
    }
    async set(key, value, ttlSeconds = 300) {
        if (this.redisClient) {
            try {
                await this.redisClient.setex(key, ttlSeconds, JSON.stringify(value));
            }
            catch (error) {
                logger.error(`Cache set error for key ${key}:`, error);
                this.setInMemory(key, value, ttlSeconds);
            }
        }
        else {
            this.setInMemory(key, value, ttlSeconds);
        }
    }
    setInMemory(key, value, ttlSeconds) {
        this.inMemoryCache.set(key, {
            data: value,
            expires: Date.now() + ttlSeconds * 1000,
        });
        if (this.inMemoryCache.size > 1000) {
            this.cleanupInMemoryCache();
        }
    }
    async delete(key) {
        if (this.redisClient) {
            try {
                await this.redisClient.del(key);
            }
            catch (error) {
                logger.error(`Cache delete error for key ${key}:`, error);
            }
        }
        this.inMemoryCache.delete(key);
    }
    async deleteGameState(gameId) {
        await this.delete(`game:${gameId}`);
    }
    async clearPrefix(prefix) {
        if (this.redisClient) {
            try {
                const keys = await this.redisClient.keys(`${prefix}*`);
                if (keys.length > 0) {
                    await this.redisClient.del(...keys);
                }
            }
            catch (error) {
                logger.error(`Cache clear error for prefix ${prefix}:`, error);
            }
        }
        const keysToDelete = [];
        for (const key of this.inMemoryCache.keys()) {
            if (key.startsWith(prefix)) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            this.inMemoryCache.delete(key);
        }
    }
    async getOrSet(key, factory, ttlSeconds = 300) {
        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }
        const value = await factory();
        await this.set(key, value, ttlSeconds);
        return value;
    }
    async invalidate(patterns) {
        for (const pattern of patterns) {
            await this.clearPrefix(pattern);
        }
    }
    cleanupInMemoryCache() {
        const now = Date.now();
        const keysToDelete = [];
        for (const [key, value] of this.inMemoryCache) {
            if (value.expires <= now) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            this.inMemoryCache.delete(key);
        }
    }
}
export const cacheService = new CacheService();
export class GameStateCache {
    constructor() {
        this.cache = new CacheService();
        this.DEFAULT_TTL = 3600;
        this.INACTIVE_TTL = 86400;
    }
    async getGameState(gameId) {
        return this.cache.get(`game:state:${gameId}`);
    }
    async setGameState(gameId, state, ttl) {
        const cacheTime = ttl || this.DEFAULT_TTL;
        return this.cache.set(`game:state:${gameId}`, state, cacheTime);
    }
    async setInactiveGameState(gameId, state) {
        return this.cache.set(`game:state:${gameId}`, state, this.INACTIVE_TTL);
    }
    async invalidateGame(gameId) {
        return this.cache.delete(`game:state:${gameId}`);
    }
    async deleteGameState(gameId) {
        return this.invalidateGame(gameId);
    }
    async cleanupFinishedGames(gameIds) {
        for (const gameId of gameIds) {
            await this.invalidateGame(gameId);
        }
        logger.info(`Cleaned up ${gameIds.length} finished games from cache`);
    }
}
export class UserCache {
    constructor() {
        this.cache = new CacheService();
        this.TTL = 600;
    }
    async getUser(userId) {
        return this.cache.get(`user:${userId}`);
    }
    async setUser(userId, userData) {
        return this.cache.set(`user:${userId}`, userData, this.TTL);
    }
    async invalidateUser(userId) {
        return this.cache.delete(`user:${userId}`);
    }
    async getUserStats(userId) {
        return this.cache.get(`user:stats:${userId}`);
    }
    async setUserStats(userId, stats) {
        return this.cache.set(`user:stats:${userId}`, stats, this.TTL);
    }
}
export class LeaderboardCache {
    constructor() {
        this.cache = new CacheService();
        this.TTL = 300;
    }
    async getLeaderboard(page = 1) {
        return this.cache.get(`leaderboard:page:${page}`);
    }
    async setLeaderboard(page, data) {
        return this.cache.set(`leaderboard:page:${page}`, data, this.TTL);
    }
    async invalidateLeaderboard() {
        return this.cache.clearPrefix('leaderboard:');
    }
}
export class MapCache {
    constructor() {
        this.cache = new CacheService();
        this.TTL = 3600;
    }
    async getMap(mapId) {
        return this.cache.get(`map:${mapId}`);
    }
    async setMap(mapId, mapData) {
        return this.cache.set(`map:${mapId}`, mapData, this.TTL);
    }
    async getMapList() {
        return this.cache.get('maps:list');
    }
    async setMapList(maps) {
        return this.cache.set('maps:list', maps, this.TTL);
    }
}
export class TerritoryModifierCache extends CacheService {
    constructor() {
        super(...arguments);
        this.CACHE_PREFIX = 'territory_modifiers';
        this.TEMPLATES_KEY = 'modifier_templates';
        this.DEFAULT_TTL = 1800;
    }
    async getTemplates() {
        return this.get(`${this.CACHE_PREFIX}:${this.TEMPLATES_KEY}`);
    }
    async setTemplates(templates) {
        await this.set(`${this.CACHE_PREFIX}:${this.TEMPLATES_KEY}`, templates, this.DEFAULT_TTL);
    }
    async getGameModifiers(gameId) {
        return this.get(`${this.CACHE_PREFIX}:game:${gameId}`);
    }
    async setGameModifiers(gameId, modifiers) {
        const serializedModifiers = Object.fromEntries(modifiers);
        await this.set(`${this.CACHE_PREFIX}:game:${gameId}`, serializedModifiers, this.DEFAULT_TTL * 2);
    }
    async removeGameModifiers(gameId) {
        await this.delete(`${this.CACHE_PREFIX}:game:${gameId}`);
    }
    async setMapModifiers(mapId, modifiers) {
        await this.set(`${this.CACHE_PREFIX}:map:${mapId}`, modifiers, this.DEFAULT_TTL * 4);
    }
    async getMapModifiers(mapId) {
        return this.get(`${this.CACHE_PREFIX}:map:${mapId}`);
    }
}
export const gameStateCache = new GameStateCache();
export const userCache = new UserCache();
export const leaderboardCache = new LeaderboardCache();
export const mapCache = new MapCache();
export const territoryModifierCache = new TerritoryModifierCache();
//# sourceMappingURL=cacheService.js.map