import { type Redis as IORedis } from 'ioredis';
export interface RedisClients {
    redisClient: IORedis | null;
    pubClient: IORedis | null;
    subClient: IORedis | null;
}
export declare function initializeRedis(): Promise<RedisClients>;
export declare function getRedisClient(): IORedis | null;
export declare function getPubSubClients(): {
    pubClient: IORedis | null;
    subClient: IORedis | null;
};
export declare function closeRedisConnections(): Promise<void>;
export declare function checkRedisHealth(): Promise<{
    healthy: boolean;
    message: string;
}>;
export declare function acquireLock(key: string, ttlMs?: number): Promise<string | null>;
export declare function releaseLock(key: string, token: string): Promise<void>;
//# sourceMappingURL=redis.d.ts.map