export declare class CacheService {
    private redisClient;
    private inMemoryCache;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    private setInMemory;
    delete(key: string): Promise<void>;
    deleteGameState(gameId: string): Promise<void>;
    clearPrefix(prefix: string): Promise<void>;
    getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T>;
    invalidate(patterns: string[]): Promise<void>;
    private cleanupInMemoryCache;
}
export declare const cacheService: CacheService;
export declare class GameStateCache {
    private cache;
    private readonly DEFAULT_TTL;
    private readonly INACTIVE_TTL;
    getGameState<T = unknown>(gameId: string): Promise<T | null>;
    setGameState<T>(gameId: string, state: T, ttl?: number): Promise<void>;
    setInactiveGameState<T>(gameId: string, state: T): Promise<void>;
    invalidateGame(gameId: string): Promise<void>;
    deleteGameState(gameId: string): Promise<void>;
    cleanupFinishedGames(gameIds: string[]): Promise<void>;
}
export declare class UserCache {
    private cache;
    private readonly TTL;
    getUser<T = unknown>(userId: string): Promise<T | null>;
    setUser<T>(userId: string, userData: T): Promise<void>;
    invalidateUser(userId: string): Promise<void>;
    getUserStats<T = unknown>(userId: string): Promise<T | null>;
    setUserStats<T>(userId: string, stats: T): Promise<void>;
}
export declare class LeaderboardCache {
    private cache;
    private readonly TTL;
    getLeaderboard<T = unknown>(page?: number): Promise<T | null>;
    setLeaderboard<T>(page: number, data: T): Promise<void>;
    invalidateLeaderboard(): Promise<void>;
}
export declare class MapCache {
    private cache;
    private readonly TTL;
    getMap(mapId: string): Promise<unknown>;
    setMap<T>(mapId: string, mapData: T): Promise<void>;
    getMapList(): Promise<unknown>;
    setMapList<T>(maps: T[]): Promise<void>;
}
export declare class TerritoryModifierCache extends CacheService {
    private readonly CACHE_PREFIX;
    private readonly TEMPLATES_KEY;
    private readonly DEFAULT_TTL;
    getTemplates(): Promise<unknown>;
    setTemplates<T>(templates: T[]): Promise<void>;
    getGameModifiers(gameId: string): Promise<unknown>;
    setGameModifiers<T>(gameId: string, modifiers: Map<string, T>): Promise<void>;
    removeGameModifiers(gameId: string): Promise<void>;
    setMapModifiers<T>(mapId: string, modifiers: T[]): Promise<void>;
    getMapModifiers(mapId: string): Promise<unknown>;
}
export declare const gameStateCache: GameStateCache;
export declare const userCache: UserCache;
export declare const leaderboardCache: LeaderboardCache;
export declare const mapCache: MapCache;
export declare const territoryModifierCache: TerritoryModifierCache;
//# sourceMappingURL=cacheService.d.ts.map