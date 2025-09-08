import { getRedisClient } from '../config/redis'
import { logger } from '../utils/logger'

/**
 * Generic caching service with Redis backend
 */
export class CacheService {
  private redisClient = getRedisClient()
  private inMemoryCache = new Map<string, { data: any; expires: number }>()

  /**
   * Get value from cache
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
   * Set value in cache with TTL
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

  private setInMemory<T>(key: string, value: T, ttlSeconds: number) {
    this.inMemoryCache.set(key, {
      data: value,
      expires: Date.now() + ttlSeconds * 1000
    })

    // Clean up expired entries periodically
    if (this.inMemoryCache.size > 1000) {
      this.cleanupInMemoryCache()
    }
  }

  /**
   * Delete value from cache
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
   * Delete game state from cache (alias for delete with game key prefix)
   */
  async deleteGameState(gameId: string): Promise<void> {
    await this.delete(`game:${gameId}`)
  }

  /**
   * Clear all cache entries with a specific prefix
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
    this.inMemoryCache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach(key => this.inMemoryCache.delete(key))
  }

  /**
   * Cache wrapper for expensive operations
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds = 300
  ): Promise<T> {
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
   * Invalidate related cache entries
   */
  async invalidate(patterns: string[]): Promise<void> {
    for (const pattern of patterns) {
      await this.clearPrefix(pattern)
    }
  }

  private cleanupInMemoryCache() {
    const now = Date.now()
    const keysToDelete: string[] = []
    
    this.inMemoryCache.forEach((value, key) => {
      if (value.expires <= now) {
        keysToDelete.push(key)
      }
    })
    
    keysToDelete.forEach(key => this.inMemoryCache.delete(key))
  }
}

// Singleton instance
export const cacheService = new CacheService()

/**
 * Specific cache services for different domains
 */

// Game state caching
export class GameStateCache {
  private cache = new CacheService()
  private readonly DEFAULT_TTL = 3600 // 1 hour for active games
  private readonly INACTIVE_TTL = 86400 // 24 hours for inactive games

  async getGameState(gameId: string): Promise<any | null> {
    return this.cache.get(`game:state:${gameId}`)
  }

  async setGameState(gameId: string, state: any, ttl?: number) {
    const cacheTime = ttl || this.DEFAULT_TTL
    return this.cache.set(`game:state:${gameId}`, state, cacheTime)
  }

  async setInactiveGameState(gameId: string, state: any) {
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

// User profile caching
export class UserCache {
  private cache = new CacheService()
  private readonly TTL = 600 // 10 minutes

  async getUser(userId: string) {
    return this.cache.get(`user:${userId}`)
  }

  async setUser(userId: string, userData: any) {
    return this.cache.set(`user:${userId}`, userData, this.TTL)
  }

  async invalidateUser(userId: string) {
    return this.cache.delete(`user:${userId}`)
  }

  async getUserStats(userId: string) {
    return this.cache.get(`user:stats:${userId}`)
  }

  async setUserStats(userId: string, stats: any) {
    return this.cache.set(`user:stats:${userId}`, stats, this.TTL)
  }
}

// Leaderboard caching
export class LeaderboardCache {
  private cache = new CacheService()
  private readonly TTL = 300 // 5 minutes

  async getLeaderboard(page = 1) {
    return this.cache.get(`leaderboard:page:${page}`)
  }

  async setLeaderboard(page: number, data: any) {
    return this.cache.set(`leaderboard:page:${page}`, data, this.TTL)
  }

  async invalidateLeaderboard() {
    return this.cache.clearPrefix('leaderboard:')
  }
}

// Map data caching
export class MapCache {
  private cache = new CacheService()
  private readonly TTL = 3600 // 1 hour

  async getMap(mapId: string) {
    return this.cache.get(`map:${mapId}`)
  }

  async setMap(mapId: string, mapData: any) {
    return this.cache.set(`map:${mapId}`, mapData, this.TTL)
  }

  async getMapList() {
    return this.cache.get('maps:list')
  }

  async setMapList(maps: any[]) {
    return this.cache.set('maps:list', maps, this.TTL)
  }
}

/**
 * Territory modifier cache with optimized batch operations
 */
export class TerritoryModifierCache extends CacheService {
  private readonly CACHE_PREFIX = 'territory_modifiers'
  private readonly TEMPLATES_KEY = 'modifier_templates'
  private readonly DEFAULT_TTL = 1800 // 30 minutes

  /**
   * Get cached modifier templates
   */
  async getTemplates() {
    return this.get(`${this.CACHE_PREFIX}:${this.TEMPLATES_KEY}`)
  }

  /**
   * Cache modifier templates
   */
  async setTemplates(templates: any[]) {
    await this.set(`${this.CACHE_PREFIX}:${this.TEMPLATES_KEY}`, templates, this.DEFAULT_TTL)
  }

  /**
   * Get cached game modifiers
   */
  async getGameModifiers(gameId: string) {
    return this.get(`${this.CACHE_PREFIX}:game:${gameId}`)
  }

  /**
   * Cache game modifiers
   */
  async setGameModifiers(gameId: string, modifiers: Map<string, any>) {
    const serializedModifiers = Object.fromEntries(modifiers)
    await this.set(`${this.CACHE_PREFIX}:game:${gameId}`, serializedModifiers, this.DEFAULT_TTL * 2) // 1 hour
  }

  /**
   * Remove game modifiers from cache
   */
  async removeGameModifiers(gameId: string) {
    await this.delete(`${this.CACHE_PREFIX}:game:${gameId}`)
  }

  /**
   * Cache map modifiers
   */
  async setMapModifiers(mapId: string, modifiers: any[]) {
    await this.set(`${this.CACHE_PREFIX}:map:${mapId}`, modifiers, this.DEFAULT_TTL * 4) // 2 hours
  }

  /**
   * Get cached map modifiers
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