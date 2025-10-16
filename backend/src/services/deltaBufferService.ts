import type { GameDelta } from '@conquestk/shared/types/delta'
import { getRedisClient } from '../config/redis.js'
import { logger } from '../utils/logger.js'
import { deltaSequenceService } from './deltaSequenceService.js'

const DEFAULT_RING_SIZE = Number.parseInt(process.env.DELTA_RING_SIZE || '100', 10)

class DeltaBufferService {
  private inMemory: Map<string, GameDelta[]> = new Map()

  private key(roomId: string): string {
    return `delta:ring:${roomId}`
  }

  private getMax(): number {
    const n = Number.parseInt(process.env.DELTA_RING_SIZE || '', 10)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_RING_SIZE
  }

  /**
   * Append deltas to the per-room ring buffer (Redis if available; otherwise in-memory)
   */
  async append(roomId: string, deltas: GameDelta[]): Promise<void> {
    if (!Array.isArray(deltas) || deltas.length === 0) return
    const redis = getRedisClient()
    const ensureVersioned: GameDelta[] = []
    for (const d of deltas) {
      // Ensure delta has a monotonically increasing version number
      if (typeof d.version !== 'number') {
        try {
          d.version = await deltaSequenceService.getNextSequence(roomId)
        } catch {
          // fallback leave undefined
        }
      }
      ensureVersioned.push(d)
    }

    if (redis) {
      try {
        const k = this.key(roomId)
        const max = this.getMax()
        const multi = redis.multi()
        for (const d of ensureVersioned) {
          multi.rpush(k, JSON.stringify(d))
        }
        // Keep only the last `max` entries
        // Using negative index keeps tail efficiently
        multi.ltrim(k, -max, -1)
        await multi.exec()
        return
      } catch (error) {
        logger.warn('Failed to append to Redis delta ring; falling back to memory', {
          roomId,
          error,
        })
      }
    }

    // In-memory fallback
    const max = this.getMax()
    const arr = this.inMemory.get(roomId) ?? []
    arr.push(...ensureVersioned.map((d) => ({ ...d })))
    if (arr.length > max) arr.splice(0, arr.length - max)
    this.inMemory.set(roomId, arr)
  }

  /**
   * Retrieve deltas in the inclusive [fromSeq, toSeq] range
   */
  async getRange(roomId: string, fromSeq: number, toSeq: number): Promise<GameDelta[]> {
    if (fromSeq > toSeq) return []
    const redis = getRedisClient()
    if (redis) {
      try {
        const k = this.key(roomId)
        const max = this.getMax()
        // Fetch last `max` entries and filter in-process
        const raw = await redis.lrange(k, -max, -1)
        const items: GameDelta[] = []
        for (const s of raw) {
          try {
            const d = JSON.parse(s) as GameDelta
            items.push(d)
          } catch {
            // skip bad entries
          }
        }
        return items
          .filter(
            (d) => typeof d.version === 'number' && d.version >= fromSeq && d.version <= toSeq,
          )
          .sort((a, b) => {
            const av = typeof a.version === 'number' ? a.version : Number.NEGATIVE_INFINITY
            const bv = typeof b.version === 'number' ? b.version : Number.NEGATIVE_INFINITY
            return av - bv
          })
      } catch (error) {
        logger.warn('Failed to read Redis delta ring; falling back to memory', { roomId, error })
      }
    }
    const arr = this.inMemory.get(roomId) ?? []
    return arr
      .filter((d) => typeof d.version === 'number' && d.version >= fromSeq && d.version <= toSeq)
      .sort((a, b) => {
        const av = typeof a.version === 'number' ? a.version : Number.NEGATIVE_INFINITY
        const bv = typeof b.version === 'number' ? b.version : Number.NEGATIVE_INFINITY
        return av - bv
      })
  }
}

export const deltaBufferService = new DeltaBufferService()
