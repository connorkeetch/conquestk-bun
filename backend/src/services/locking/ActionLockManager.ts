import { logger } from '../../utils/logger.js'

/**
 * Options for lock acquisition
 */
export interface LockOptions {
  /** Lock timeout in milliseconds (default: 5000) */
  timeout?: number
  /** Max wait time for lock acquisition in milliseconds (default: 1500) */
  waitMs?: number
  /** Retry interval in milliseconds (default: 25) */
  retryInterval?: number
}

/**
 * Manages Redis locks for game action serialization
 * Extracted from GameActionProcessor to centralize lock management
 */
export class ActionLockManager {
  private readonly DEFAULT_TIMEOUT = 5000
  private readonly DEFAULT_WAIT_MS = 1500
  private readonly DEFAULT_RETRY_INTERVAL = 25

  /**
   * Execute an operation with a Redis lock
   * Automatically acquires and releases the lock
   *
   * @throws Error if lock cannot be acquired within waitMs
   */
  async withLock<T>(
    gameId: string,
    operation: () => Promise<T>,
    options: LockOptions = {},
  ): Promise<T> {
    const { acquireLock, releaseLock } = await import('../../config/redis.js')

    const timeout = options.timeout ?? this.DEFAULT_TIMEOUT
    const waitMs = options.waitMs ?? this.DEFAULT_WAIT_MS
    const retryInterval = options.retryInterval ?? this.DEFAULT_RETRY_INTERVAL

    const lockKey = `lock:game-actions:${gameId}`
    const startWait = Date.now()

    let lockToken: string | null = null

    // Try to acquire lock with retries
    lockToken = await acquireLock(lockKey, timeout)
    while (!lockToken) {
      const elapsed = Date.now() - startWait
      if (elapsed > waitMs) {
        logger.error('Failed to acquire game action lock', {
          gameId,
          lockKey,
          waitedMs: elapsed,
          maxWaitMs: waitMs,
        })
        throw new Error(`Failed to acquire game action lock for ${gameId} after ${elapsed}ms`)
      }

      await new Promise((resolve) => setTimeout(resolve, retryInterval))
      lockToken = await acquireLock(lockKey, timeout)
    }

    const acquireTime = Date.now() - startWait
    logger.debug('Acquired game action lock', {
      gameId,
      lockKey,
      acquireTimeMs: acquireTime,
    })

    try {
      const result = await operation()
      return result
    } finally {
      // Always release the lock, even if operation throws
      if (lockToken) {
        try {
          await releaseLock(lockKey, lockToken)
          logger.debug('Released game action lock', { gameId, lockKey })
        } catch (error) {
          logger.warn('Failed to release Redis lock - may cause lock contention', {
            gameId,
            lockKey,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
          // Note: We don't throw here because the operation already succeeded
          // Lock will eventually expire via Redis TTL
        }
      }
    }
  }

  /**
   * Try to execute an operation with a lock, but don't fail if lock cannot be acquired
   * Returns null if lock acquisition times out
   */
  async tryWithLock<T>(
    gameId: string,
    operation: () => Promise<T>,
    options: LockOptions = {},
  ): Promise<T | null> {
    try {
      return await this.withLock(gameId, operation, options)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to acquire')) {
        logger.warn('Lock acquisition timeout, skipping operation', { gameId })
        return null
      }
      throw error
    }
  }
}
