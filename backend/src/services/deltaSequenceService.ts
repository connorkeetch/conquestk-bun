/**
 * Delta Sequence Service
 *
 * Manages monotonically increasing sequence numbers for game deltas per room.
 * Ensures clients can detect missing/out-of-order deltas and request replay.
 */

import { getRedisClient } from '../config/redis.js'
import { logger } from '../utils/logger.js'

class DeltaSequenceService {
  private inMemorySequences: Map<string, number> = new Map()

  /**
   * Get the next sequence number for a room
   * Uses Redis if available, falls back to in-memory
   */
  async getNextSequence(roomId: string): Promise<number> {
    const redis = getRedisClient()

    if (redis) {
      try {
        // Use Redis INCR for atomic increment across multiple servers
        const seq = await redis.incr(`delta:seq:${roomId}`)
        return seq
      } catch (error) {
        logger.warn('Failed to increment delta sequence in Redis, using in-memory fallback', {
          roomId,
          error,
        })
        // Fall through to in-memory
      }
    }

    // In-memory fallback for local development or Redis outage
    const current = this.inMemorySequences.get(roomId) ?? 0
    const next = current + 1
    this.inMemorySequences.set(roomId, next)
    return next
  }

  /**
   * Get the current sequence number for a room (without incrementing)
   */
  async getCurrentSequence(roomId: string): Promise<number> {
    const redis = getRedisClient()

    if (redis) {
      try {
        const seq = await redis.get(`delta:seq:${roomId}`)
        return seq ? Number.parseInt(seq, 10) : 0
      } catch (error) {
        logger.warn('Failed to get delta sequence from Redis', { roomId, error })
      }
    }

    return this.inMemorySequences.get(roomId) ?? 0
  }

  /**
   * Reset sequence counter when a game ends
   * This keeps Redis clean and prevents unbounded growth
   */
  async resetSequence(roomId: string): Promise<void> {
    const redis = getRedisClient()

    if (redis) {
      try {
        await redis.del(`delta:seq:${roomId}`)
      } catch (error) {
        logger.warn('Failed to reset delta sequence in Redis', { roomId, error })
      }
    }

    this.inMemorySequences.delete(roomId)
  }
}

export const deltaSequenceService = new DeltaSequenceService()
