import { getRedisClient } from '../config/redis'
import { logger } from '../utils/logger'

type StoredJobValue<T> = {
  storedAt: string
  value?: T
}

const DEFAULT_TTL_SECONDS = 60 * 60 // 1 hour

const IN_MEMORY_MAX_SIZE = 5000

export class JobIdempotencyService {
  private inMemoryStore = new Map<string, { expiresAt: number; payload: string | null }>()

  private buildKey(queueName: string, jobKey: string): string {
    return `queue:idempotency:${queueName}:${jobKey}`
  }

  private getRedis() {
    return getRedisClient()
  }

  private cleanupInMemoryStore() {
    if (this.inMemoryStore.size === 0) return

    const now = Date.now()
    for (const [key, entry] of this.inMemoryStore.entries()) {
      if (entry.expiresAt <= now) {
        this.inMemoryStore.delete(key)
      }
    }

    if (this.inMemoryStore.size > IN_MEMORY_MAX_SIZE) {
      const overflow = this.inMemoryStore.size - IN_MEMORY_MAX_SIZE
      const keysToRemove = Array.from(this.inMemoryStore.keys()).slice(0, overflow)
      for (const key of keysToRemove) {
        this.inMemoryStore.delete(key)
      }
    }
  }

  async getProcessedJob<T>(
    queueName: string,
    jobKey: string,
  ): Promise<{ exists: boolean; value?: T }> {
    const redis = this.getRedis()
    const storageKey = this.buildKey(queueName, jobKey)

    if (redis) {
      try {
        const raw = await redis.get(storageKey)
        if (!raw) {
          return { exists: false }
        }

        if (raw === '1') {
          return { exists: true }
        }

        try {
          const parsed = JSON.parse(raw) as StoredJobValue<T>
          return parsed && typeof parsed === 'object'
            ? { exists: true, value: parsed.value }
            : { exists: true }
        } catch (parseError) {
          logger.warn('Failed to parse idempotency payload from Redis', {
            queueName,
            jobKey,
            error: parseError instanceof Error ? parseError.message : parseError,
          })
          return { exists: true }
        }
      } catch (error) {
        logger.error('Redis error while reading job idempotency state', {
          queueName,
          jobKey,
          error,
        })
      }
    }

    const fallback = this.inMemoryStore.get(storageKey)
    if (!fallback) {
      return { exists: false }
    }

    if (fallback.expiresAt <= Date.now()) {
      this.inMemoryStore.delete(storageKey)
      return { exists: false }
    }

    if (fallback.payload === null) {
      return { exists: true }
    }

    try {
      const parsed = JSON.parse(fallback.payload) as StoredJobValue<T>
      return parsed && typeof parsed === 'object'
        ? { exists: true, value: parsed.value }
        : { exists: true }
    } catch (error) {
      logger.warn('Failed to parse in-memory idempotency payload', {
        queueName,
        jobKey,
        error,
      })
      return { exists: true }
    }
  }

  async markProcessedJob<T>(
    queueName: string,
    jobKey: string,
    value?: T,
    ttlSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    const redis = this.getRedis()
    const storageKey = this.buildKey(queueName, jobKey)
    const payload: string =
      value === undefined
        ? '1'
        : JSON.stringify({ storedAt: new Date().toISOString(), value } satisfies StoredJobValue<T>)

    if (redis) {
      try {
        await redis.set(storageKey, payload, 'EX', ttlSeconds)
        return
      } catch (error) {
        logger.error('Redis error while writing job idempotency state, falling back to memory', {
          queueName,
          jobKey,
          error,
        })
      }
    }

    this.inMemoryStore.set(storageKey, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      payload,
    })
    this.cleanupInMemoryStore()
  }

  async clearProcessedJob(queueName: string, jobKey: string): Promise<void> {
    const redis = this.getRedis()
    const storageKey = this.buildKey(queueName, jobKey)

    if (redis) {
      try {
        await redis.del(storageKey)
      } catch (error) {
        logger.error('Redis error while clearing job idempotency state', {
          queueName,
          jobKey,
          error,
        })
      }
    }

    this.inMemoryStore.delete(storageKey)
  }
}

export const jobIdempotencyService = new JobIdempotencyService()
