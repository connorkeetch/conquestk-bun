/**
 * @fileoverview This file defines a generic caching service with a Redis backend and an in-memory fallback.
 * It also provides several specialized cache classes for different domains like game state, user profiles, leaderboards, and maps.
 * @module services/cacheService
 */
import { getRedisClient } from '../config/redis.js'
import { logger } from '../utils/logger.js'

/**
 * A generic caching service that uses Redis if available, otherwise falls back to an in-memory cache.
 * @class CacheService
 */
export class CacheService {
  private redisClient = getRedisClient()
  private inMemoryCache = new Map<string, { data: unknown; expires: number }>()

  /**
   * Retrieves a value from the cache.
   * @template T
   * @param {string} key - The cache key.
   * @returns {Promise<T | null>} A promise that resolves to the cached value, or null if not found or an error occurs.
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.redisClient) {
      try {
        const value = await this.redisClient.get(key)
        if (value) {
          return JSON.parse(value) as T
        }
      } catch (error) {
        logger.error(`Cache get error for key ${key}:`, error)
      }
    } else {
      // Fallback to in-memory cache
      const cached = this.inMemoryCache.get(key)
      if (cached && cached.expires > Date.now()) {
        return cached.data as T
      }
      this.inMemoryCache.delete(key)
    }
    return null
  }

  /**
   * Sets a value in the cache with a specified time-to-live (TTL).
   * @template T
   * @param {string} key - The cache key.
   * @param {T} value - The value to cache.
   * @param {number} [ttlSeconds=300] - The TTL in seconds.
   * @returns {Promise<void>} A promise that resolves when the value has been set.
   */
  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.setex(key, ttlSeconds, JSON.stringify(value))
      } catch (error) {
        logger.error(`Cache set error for key ${key}:`, error)
        // Fallback to in-memory
        this.setInMemory(key, value, ttlSeconds)
      }
    } else {
      this.setInMemory(key, value, ttlSeconds)
    }
  }

  /**
   * Sets a value in the in-memory fallback cache.
   * @private
   * @template T
   * @param {string} key - The cache key.
   * @param {T} value - The value to cache.
   * @param {number} ttlSeconds - The TTL in seconds.
   */
  private setInMemory<T>(key: string, value: T, ttlSeconds: number) {
    this.inMemoryCache.set(key, {
      data: value,
      expires: Date.now() + ttlSeconds * 1000,
    })

    // Clean up expired entries periodically
    if (this.inMemoryCache.size > 1000) {
      this.cleanupInMemoryCache()
    }
  }

  /**
   * Deletes a value from the cache.
   * @param {string} key - The cache key to delete.
   * @returns {Promise<void>} A promise that resolves when the key has been deleted.
   */
  async delete(key: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.del(key)
      } catch (error) {
        logger.error(`Cache delete error for key ${key}:`, error)
      }
    }
    this.inMemoryCache.delete(key)
  }

  /**
   * Deletes a game state from the cache. This is an alias for `delete` with a game-specific key prefix.
   * @param {string} gameId - The ID of the game whose state is to be deleted.
   * @returns {Promise<void>} A promise that resolves when the game state has been deleted.
   */
  async deleteGameState(gameId: string): Promise<void> {
    await this.delete(`game:${gameId}`)
  }

  /**
   * Clears all cache entries that match a specific prefix.
   * @param {string} prefix - The prefix to match.
   * @returns {Promise<void>} A promise that resolves when the matching entries have been cleared.
   */
  async clearPrefix(prefix: string): Promise<void> {
    if (this.redisClient) {
      try {
        const keys = await this.redisClient.keys(`${prefix}*`)
        if (keys.length > 0) {
          await this.redisClient.del(...keys)
        }
      } catch (error) {
        logger.error(`Cache clear error for prefix ${prefix}:`, error)
      }
    }

    // Clear from in-memory cache
    const keysToDelete: string[] = []
    for (const key of this.inMemoryCache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key)
      }
    }
    for (const key of keysToDelete) {
      this.inMemoryCache.delete(key)
    }
  }

  /**
   * A cache-aside implementation that retrieves a value from the cache if it exists,
   * otherwise it generates the value using a factory function, caches it, and then returns it.
   * @template T
   * @param {string} key - The cache key.
   * @param {() => Promise<T>} factory - A function that generates the value if it's not in the cache.
   * @param {number} [ttlSeconds=300] - The TTL for the newly cached value.
   * @returns {Promise<T>} A promise that resolves to the cached or newly generated value.
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    // Generate new value
    const value = await factory()

    // Store in cache
    await this.set(key, value, ttlSeconds)

    return value
  }

  /**
   * Invalidates cache entries by clearing all keys that match the given patterns (prefixes).
   * @param {string[]} patterns - An array of key patterns (prefixes) to invalidate.
   * @returns {Promise<void>} A promise that resolves when the invalidation is complete.
   */
  async invalidate(patterns: string[]): Promise<void> {
    for (const pattern of patterns) {
      await this.clearPrefix(pattern)
    }
  }

  /**
   * Cleans up expired entries from the in-memory cache.
   * @private
   */
  private cleanupInMemoryCache() {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, value] of this.inMemoryCache) {
      if (value.expires <= now) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.inMemoryCache.delete(key)
    }
  }
}

// Singleton instance
export const cacheService = new CacheService()

/**
 * A specialized cache service for managing game state.
 * @class GameStateCache
 */
export class GameStateCache {
  private cache = new CacheService()
  private readonly DEFAULT_TTL = 3600 // 1 hour for active games
  private readonly INACTIVE_TTL = 86400 // 24 hours for inactive games

  async getGameState<T = unknown>(gameId: string): Promise<T | null> {
    return this.cache.get<T>(`game:state:${gameId}`)
  }

  async setGameState<T>(gameId: string, state: T, ttl?: number) {
    const cacheTime = ttl || this.DEFAULT_TTL
    return this.cache.set(`game:state:${gameId}`, state, cacheTime)
  }

  async setInactiveGameState<T>(gameId: string, state: T) {
    // Longer TTL for finished or inactive games to prevent immediate cleanup
    return this.cache.set(`game:state:${gameId}`, state, this.INACTIVE_TTL)
  }

  async invalidateGame(gameId: string) {
    return this.cache.delete(`game:state:${gameId}`)
  }

  async deleteGameState(gameId: string) {
    return this.invalidateGame(gameId)
  }

  async cleanupFinishedGames(gameIds: string[]) {
    // Batch cleanup of finished games
    for (const gameId of gameIds) {
      await this.invalidateGame(gameId)
    }
    logger.info(`Cleaned up ${gameIds.length} finished games from cache`)
  }
}

/**
 * A specialized cache service for managing user profiles and stats.
 * @class UserCache
 */
export class UserCache {
  private cache = new CacheService()
  private readonly TTL = 600 // 10 minutes

  async getUser<T = unknown>(userId: string) {
    return this.cache.get<T>(`user:${userId}`)
  }

  async setUser<T>(userId: string, userData: T) {
    return this.cache.set(`user:${userId}`, userData, this.TTL)
  }

  async invalidateUser(userId: string) {
    return this.cache.delete(`user:${userId}`)
  }

  async getUserStats<T = unknown>(userId: string) {
    return this.cache.get<T>(`user:stats:${userId}`)
  }

  async setUserStats<T>(userId: string, stats: T) {
    return this.cache.set(`user:stats:${userId}`, stats, this.TTL)
  }
}

/**
 * A specialized cache service for managing leaderboards.
 * @class LeaderboardCache
 */
export class LeaderboardCache {
  private cache = new CacheService()
  private readonly TTL = 300 // 5 minutes

  async getLeaderboard<T = unknown>(page = 1) {
    return this.cache.get<T>(`leaderboard:page:${page}`)
  }

  async setLeaderboard<T>(page: number, data: T) {
    return this.cache.set(`leaderboard:page:${page}`, data, this.TTL)
  }

  async invalidateLeaderboard() {
    return this.cache.clearPrefix('leaderboard:')
  }
}

/**
 * A specialized cache service for managing map data.
 * @class MapCache
 */
export class MapCache {
  private cache = new CacheService()
  private readonly TTL = 3600 // 1 hour

  async getMap(mapId: string) {
    return this.cache.get(`map:${mapId}`)
  }

  async setMap<T>(mapId: string, mapData: T) {
    return this.cache.set(`map:${mapId}`, mapData, this.TTL)
  }

  async getMapList() {
    return this.cache.get('maps:list')
  }

  async setMapList<T>(maps: T[]) {
    return this.cache.set('maps:list', maps, this.TTL)
  }
}

/**
 * A specialized cache service for territory modifiers, with optimized batch operations.
 * @class TerritoryModifierCache
 * @extends {CacheService}
 */
export class TerritoryModifierCache extends CacheService {
  private readonly CACHE_PREFIX = 'territory_modifiers'
  private readonly TEMPLATES_KEY = 'modifier_templates'
  private readonly DEFAULT_TTL = 1800 // 30 minutes

  /**
   * Gets the cached modifier templates.
   * @returns {Promise<unknown>} A promise that resolves to the cached templates.
   */
  async getTemplates() {
    return this.get(`${this.CACHE_PREFIX}:${this.TEMPLATES_KEY}`)
  }

  /**
   * Caches the modifier templates.
   * @template T
   * @param {T[]} templates - The templates to cache.
   * @returns {Promise<void>}
   */
  async setTemplates<T>(templates: T[]) {
    await this.set(`${this.CACHE_PREFIX}:${this.TEMPLATES_KEY}`, templates, this.DEFAULT_TTL)
  }

  /**
   * Gets the cached modifiers for a specific game.
   * @param {string} gameId - The ID of the game.
   * @returns {Promise<unknown>} A promise that resolves to the cached game modifiers.
   */
  async getGameModifiers(gameId: string) {
    return this.get(`${this.CACHE_PREFIX}:game:${gameId}`)
  }

  /**
   * Caches the modifiers for a specific game.
   * @template T
   * @param {string} gameId - The ID of the game.
   * @param {Map<string, T>} modifiers - A map of territory modifiers to cache.
   * @returns {Promise<void>}
   */
  async setGameModifiers<T>(gameId: string, modifiers: Map<string, T>) {
    const serializedModifiers = Object.fromEntries(modifiers)
    await this.set(`${this.CACHE_PREFIX}:game:${gameId}`, serializedModifiers, this.DEFAULT_TTL * 2) // 1 hour
  }

  /**
   * Removes the modifiers for a specific game from the cache.
   * @param {string} gameId - The ID of the game.
   * @returns {Promise<void>}
   */
  async removeGameModifiers(gameId: string) {
    await this.delete(`${this.CACHE_PREFIX}:game:${gameId}`)
  }

  /**
   * Caches the modifiers for a specific map.
   * @template T
   * @param {string} mapId - The ID of the map.
   * @param {T[]} modifiers - The map modifiers to cache.
   * @returns {Promise<void>}
   */
  async setMapModifiers<T>(mapId: string, modifiers: T[]) {
    await this.set(`${this.CACHE_PREFIX}:map:${mapId}`, modifiers, this.DEFAULT_TTL * 4) // 2 hours
  }

  /**
   * Gets the cached modifiers for a specific map.
   * @param {string} mapId - The ID of the map.
   * @returns {Promise<unknown>} A promise that resolves to the cached map modifiers.
   */
  async getMapModifiers(mapId: string) {
    return this.get(`${this.CACHE_PREFIX}:map:${mapId}`)
  }
}

// Export instances
export const gameStateCache = new GameStateCache()
export const userCache = new UserCache()
export const leaderboardCache = new LeaderboardCache()
export const mapCache = new MapCache()
export const territoryModifierCache = new TerritoryModifierCache()
