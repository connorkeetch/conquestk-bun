import { type Job, Worker } from 'bullmq'
import { mapStagingService } from '../services/mapStagingService.js'
import { queueService } from '../services/queueService.js'
import { logger } from '../utils/logger.js'

interface PurgeOptions {
  batchSize?: number
  minAgeMinutes?: number
}

// Default to once per week; can be overridden via MAP_ASSET_PURGE_INTERVAL_MS
const DEFAULT_INTERVAL_MS = Number(
  process.env.MAP_ASSET_PURGE_INTERVAL_MS ?? 7 * 24 * 60 * 60 * 1000,
)

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

    // Use BullMQ job scheduler for periodic purge (with retries)
    const retryDelays = [500, 1500, 3000]
    let initialized = false
    let lastError: unknown = null
    for (let attempt = 1; attempt <= retryDelays.length; attempt++) {
      try {
        const queue = queueService.getMapAssetQueue()
        await queue.upsertJobScheduler('map-assets:purge', { every: DEFAULT_INTERVAL_MS })

        // Worker to process purge jobs
        const Redis = (await import('ioredis')).default
        const redis = (await import('../config/redis.js')).getRedisClient()
        const baseOpts = (redis?.options ?? {}) as import('ioredis').RedisOptions
        const { commandTimeout: _omitCommandTimeout, ...withoutCommandTimeout } = baseOpts
        const connection = new Redis({
          ...withoutCommandTimeout,
          enableReadyCheck: false,
          lazyConnect: false,
          maxRetriesPerRequest: null,
          connectionName: 'map-assets-worker',
        })
        this.worker = new Worker(
          queue.name,
          async (job: Job<{ batchSize?: number; minAgeMinutes?: number }>) => {
            if (job.name && job.name !== 'map-assets:purge') return null
            await this.runOnce('interval', {
              ...(typeof job.data?.batchSize === 'number' ? { batchSize: job.data.batchSize } : {}),
              ...(typeof job.data?.minAgeMinutes === 'number'
                ? { minAgeMinutes: job.data.minAgeMinutes }
                : {}),
            })
            return { ok: true }
          },
          { connection },
        )

        logger.info('✅ Map assets scheduler and worker initialized', { attempt })
        initialized = true
        break
      } catch (e) {
        lastError = e
        if (attempt < retryDelays.length) {
          const delay = retryDelays[attempt - 1]
          logger.warn(
            `Failed to initialize map-assets scheduler (attempt ${attempt}/${retryDelays.length}), retrying in ${delay}ms`,
            { error: e instanceof Error ? e.message : e },
          )
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    if (!initialized) {
      logger.warn(
        'Failed to initialize map-assets scheduler after retries; falling back to setInterval',
        {
          error: lastError instanceof Error ? lastError.message : lastError,
        },
      )
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
      ...(typeof overrides?.batchSize === 'number' ? { batchSize: overrides.batchSize } : {}),
      ...(typeof overrides?.minAgeMinutes === 'number'
        ? { minAgeMinutes: overrides.minAgeMinutes }
        : {}),
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
