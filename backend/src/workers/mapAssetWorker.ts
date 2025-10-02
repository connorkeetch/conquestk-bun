import { mapStagingService } from '../services/mapStagingService'
import { logger } from '../utils/logger'

interface PurgeOptions {
  batchSize?: number
  minAgeMinutes?: number
}

const DEFAULT_INTERVAL_MS = Number(process.env.MAP_ASSET_PURGE_INTERVAL_MS ?? 15 * 60 * 1000)

export class MapAssetWorker {
  private timer: NodeJS.Timeout | null = null

  async initialize(): Promise<void> {
    logger.info('🧹 Initializing MapAssetWorker', {
      intervalMs: DEFAULT_INTERVAL_MS,
    })

    // Kick off an initial purge in the background (non-blocking)
    this.runOnce('startup').catch((error) => {
      logger.error('❌ Initial map asset purge failed', { error })
    })

    if (DEFAULT_INTERVAL_MS > 0) {
      this.timer = setInterval(() => {
        this.runOnce('interval').catch((error) => {
          logger.error('❌ Scheduled map asset purge failed', { error })
        })
      }, DEFAULT_INTERVAL_MS)
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
  }
}

export const createMapAssetWorker = () => new MapAssetWorker()
