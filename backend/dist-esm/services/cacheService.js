"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.territoryModifierCache = exports.mapCache = exports.leaderboardCache = exports.userCache = exports.gameStateCache = exports.TerritoryModifierCache = exports.MapCache = exports.LeaderboardCache = exports.UserCache = exports.GameStateCache = exports.cacheService = exports.CacheService = void 0;
const redis_js_1 = require("../config/redis.js");
const logger_js_1 = require("../utils/logger.js");
class CacheService {
    constructor() {
        this.redisClient = (0, redis_js_1.getRedisClient)();
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
                logger_js_1.logger.error(`Cache get error for key ${key}:`, error);
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
                logger_js_1.logger.error(`Cache set error for key ${key}:`, error);
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
                logger_js_1.logger.error(`Cache delete error for key ${key}:`, error);
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
                logger_js_1.logger.error(`Cache clear error for prefix ${prefix}:`, error);
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
exports.CacheService = CacheService;
exports.cacheService = new CacheService();
class GameStateCache {
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
        logger_js_1.logger.info(`Cleaned up ${gameIds.length} finished games from cache`);
    }
}
exports.GameStateCache = GameStateCache;
class UserCache {
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
exports.UserCache = UserCache;
class LeaderboardCache {
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
exports.LeaderboardCache = LeaderboardCache;
class MapCache {
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
exports.MapCache = MapCache;
class TerritoryModifierCache extends CacheService {
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
exports.TerritoryModifierCache = TerritoryModifierCache;
exports.gameStateCache = new GameStateCache();
exports.userCache = new UserCache();
exports.leaderboardCache = new LeaderboardCache();
exports.mapCache = new MapCache();
exports.territoryModifierCache = new TerritoryModifierCache();
//# sourceMappingURL=cacheService.js.map