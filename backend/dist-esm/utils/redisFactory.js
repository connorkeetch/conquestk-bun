import RedisPkg from 'ioredis';
export function createRedisFromOptions(opts) {
    const RedisCtor = RedisPkg;
    return new RedisCtor(opts);
}
export function createRedisFromUrl(url, opts) {
    const RedisCtor = RedisPkg;
    return new RedisCtor(url, opts);
}
//# sourceMappingURL=redisFactory.js.map