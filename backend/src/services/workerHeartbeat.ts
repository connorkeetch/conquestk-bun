import type Redis from 'ioredis'
import { getRedisClient } from '../config/redis.js'
import { logger } from '../utils/logger.js'

const DEFAULT_TTL_SECONDS = 10
const DEFAULT_INTERVAL_MS = 5000

export type HeartbeatHandle = {
  stop: () => void
  key: string
}

export function startWorkerHeartbeat(
  queueName: string,
  options?: { ttlSeconds?: number; intervalMs?: number },
): HeartbeatHandle | null {
  const redis: Redis | null = getRedisClient()
  if (!redis) return null

  const ttl = Math.max(2, Math.trunc(options?.ttlSeconds ?? DEFAULT_TTL_SECONDS))
  const interval = Math.max(1000, Math.trunc(options?.intervalMs ?? DEFAULT_INTERVAL_MS))

  const instanceId = `${process.pid}`
  const key = `worker:hb:${queueName}:${instanceId}`

  let timer: NodeJS.Timeout | null = null

  const send = async () => {
    try {
      await redis.set(key, String(Date.now()), 'EX', ttl)
    } catch (e) {
      logger.debug('Failed to send worker heartbeat', {
        queue: queueName,
        error: e instanceof Error ? e.message : e,
      })
    }
  }

  // Kick once then interval
  void send()
  timer = setInterval(send, interval)
  if (typeof timer.unref === 'function') timer.unref()

  return {
    key,
    stop: () => {
      if (timer) clearInterval(timer)
      timer = null
      // Let TTL expire naturally; no need to delete the key immediately
    },
  }
}
