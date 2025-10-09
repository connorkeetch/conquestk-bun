import { type Job, Worker } from 'bullmq'
import { mapStagingService } from '../services/mapStagingService.js'
import { queueService } from '../services/queueService.js'
import { logger } from '../utils/logger.js'

interface PurgeOptions {
  batchSize?: number
  minAgeMinutes?: number
}

const DEFAULT_INTERVAL_MS = Number(process.env.MAP_ASSET_PURGE_INTERVAL_MS ?? 15 * 60 * 1000)

export class MapAssetWorker {
  private timer: NodeJS.Timeout | null = null
  private worker: Worker | null = null

  async initialize(): Promise<void> {
    logger.info('🧹 Initializing MapAssetWorker', {
      intervalMs: DEFAULT_INTERVAL_MS,
    })

    // Kick off an initial purge in the background (non-blocking)
    this.runOnce('startup').catch((error) => {
      logger.error('❌ Initial map asset purge failed', { error })
    })

    // Use BullMQ job scheduler for periodic purge
    try {
      const queue = queueService.getMapAssetQueue()
      await queue.upsertJobScheduler('map-assets:purge', { every: DEFAULT_INTERVAL_MS })

      // Worker to process purge jobs
      const Redis = (await import('ioredis')).default
      const redis = (await import('../config/redis.js')).getRedisClient()
      const baseOpts = (redis?.options ?? {}) as import('ioredis').RedisOptions
      const connection = new Redis({
        ...baseOpts,
        enableReadyCheck: false,
        lazyConnect: false,
        maxRetriesPerRequest: null,
        commandTimeout: undefined,
      })
      this.worker = new Worker(
        queue.name,
        async (job: Job<{ batchSize?: number; minAgeMinutes?: number }>) => {
          if (job.name && job.name !== 'map-assets:purge') return null
          await this.runOnce('interval', {
            batchSize: job.data?.batchSize,
            minAgeMinutes: job.data?.minAgeMinutes,
          })
          return { ok: true }
        },
        { connection },
      )
    } catch (e) {
      logger.warn('Failed to initialize map-assets scheduler; falling back to setInterval', {
        error: e instanceof Error ? e.message : e,
      })
      if (DEFAULT_INTERVAL_MS > 0) {
        this.timer = setInterval(() => {
          this.runOnce('interval').catch((error) => {
            logger.error('❌ Scheduled map asset purge failed', { error })
          })
        }, DEFAULT_INTERVAL_MS)
      }
    }

    logger.info('✅ MapAssetWorker initialized')
  }

  async runOnce(source: 'startup' | 'interval' | 'manual', overrides?: PurgeOptions) {
    logger.info('🧹 Running map asset purge', { source, overrides })
    const summary = await mapStagingService.purgeDeletedImages({
      batchSize: overrides?.batchSize,
      minAgeMinutes: overrides?.minAgeMinutes,
    })
    logger.info('🧹 Map asset purge complete', { source, summary })
    return summary
  }

  shutdown(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.worker) {
      this.worker
        .close()
        .catch((e) => logger.warn('Failed to close MapAsset worker', { error: String(e) }))
      this.worker = null
    }
  }
}

export const createMapAssetWorker = () => new MapAssetWorker()
