import { maintenanceService } from '../services/maintenanceService'
import { logger } from '../utils/logger'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_DAILY_MS = ONE_DAY_MS
const DEFAULT_WEEKLY_MS = 7 * ONE_DAY_MS
const DEFAULT_ARCHIVE_BATCH = 25

function getIntervalMs(): number {
  const value = process.env.MAINTENANCE_PRUNE_INTERVAL_MS
  if (!value) return DEFAULT_WEEKLY_MS
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_MS
}

function getNotificationRetentionDays(): number {
  const value = process.env.NOTIFICATION_RETENTION_DAYS
  if (!value) return 60
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60
}

function getIncludeUnread(): boolean {
  const value = (process.env.PRUNE_NOTIFICATIONS_INCLUDE_UNREAD || '').toLowerCase().trim()
  if (value === '1' || value === 'true' || value === 'yes') return true
  return false
}

function getMoveArchiveBatchSize(): number {
  const value = process.env.GAME_MOVE_ARCHIVE_BATCH_SIZE
  if (!value) return DEFAULT_ARCHIVE_BATCH
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ARCHIVE_BATCH
}

export class MaintenanceWorker {
  private timer: NodeJS.Timeout | null = null

  async initialize(): Promise<void> {
    const intervalMs = getIntervalMs()
    const retentionDays = getNotificationRetentionDays()
    const includeUnread = getIncludeUnread()
    const moveArchiveBatchSize = getMoveArchiveBatchSize()

    logger.info('🧹 Initializing MaintenanceWorker', {
      intervalMs,
      retentionDays,
      includeUnread,
      moveArchiveBatchSize,
    })

    // Run once on startup (non-blocking)
    this.runOnce('startup').catch((error) => {
      logger.error('❌ Initial maintenance prune failed', { error })
    })

    if (intervalMs > 0) {
      this.timer = setInterval(() => {
        this.runOnce('interval').catch((error) => {
          logger.error('❌ Scheduled maintenance prune failed', { error })
        })
      }, intervalMs)
    }

    logger.info('✅ MaintenanceWorker initialized')
  }

  async runOnce(source: 'startup' | 'interval' | 'manual') {
    const retentionDays = getNotificationRetentionDays()
    const includeUnread = getIncludeUnread()
    const moveArchiveBatchSize = getMoveArchiveBatchSize()

    logger.info('🧹 Running maintenance prune', {
      source,
      retentionDays,
      includeUnread,
      moveArchiveBatchSize,
    })

    const [notifSummary, tokenSummary, archiveSummary] = await Promise.all([
      maintenanceService.pruneNotifications({ retentionDays, includeUnread }),
      maintenanceService.prunePasswordResetTokens(),
      maintenanceService.archiveCompletedGameMoves({ gameLimit: moveArchiveBatchSize }),
    ])

    const summary = {
      notifications: notifSummary,
      passwordResetTokens: tokenSummary,
      archivedMoves: archiveSummary,
    }
    logger.info('🧹 Maintenance prune complete', { source, summary })
    return summary
  }

  shutdown(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}

export const createMaintenanceWorker = () => new MaintenanceWorker()
