import RedisPkg, { type Redis as IORedis, type RedisOptions } from 'ioredis'

// Typed constructors for common ioredis initialization patterns under NodeNext/ESM.
type RedisFromOptionsCtor = new (opts: RedisOptions) => IORedis
type RedisFromUrlCtor = new (url: string, opts?: RedisOptions) => IORedis

export function createRedisFromOptions(opts: RedisOptions): IORedis {
  const RedisCtor = RedisPkg as unknown as RedisFromOptionsCtor
  return new RedisCtor(opts)
}

export function createRedisFromUrl(url: string, opts?: RedisOptions): IORedis {
  const RedisCtor = RedisPkg as unknown as RedisFromUrlCtor
  return new RedisCtor(url, opts)
}
