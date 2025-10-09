interface CacheMetrics {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    totalRequests: number;
}
export declare class RedisClusterService {
    private cluster;
    private fallbackClient;
    private isClusterMode;
    private metrics;
    private readonly CACHE_TIERS;
    initialize(): Promise<void>;
    private initializeCluster;
    private initializeFallback;
    private getClient;
    setWithTier(key: string, value: unknown, tier?: 'CRITICAL' | 'STANDARD' | 'EXTENDED' | 'TEMPORARY'): Promise<boolean>;
    get<T = unknown>(key: string): Promise<T | null>;
    mget<T = unknown>(keys: string[]): Promise<(T | null)[]>;
    mset(keyValuePairs: Array<{
        key: string;
        value: unknown;
        tier?: 'CRITICAL' | 'STANDARD' | 'EXTENDED' | 'TEMPORARY';
    }>): Promise<boolean>;
    deletePattern(pattern: string): Promise<number>;
    warmCache(warmingTasks: Array<() => Promise<void>>): Promise<void>;
    getMetrics(): CacheMetrics & {
        hitRate: number;
        errorRate: number;
    };
    resetMetrics(): void;
    healthCheck(): Promise<{
        status: string;
        details: Record<string, unknown>;
    }>;
    private parseRedisInfo;
    shutdown(): Promise<void>;
}
export declare const redisClusterService: RedisClusterService;
export {};
//# sourceMappingURL=redisClusterService.d.ts.map