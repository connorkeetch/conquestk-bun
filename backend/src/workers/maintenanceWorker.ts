import {
  getEngine as getOddsEngine,
  setEngine as setOddsEngine,
  setLogger as setOddsLogger,
  simulateBattle as simulateBattleOdds,
} from '@conquestk/shared/odds'
import { type Job, Worker } from 'bullmq'
import { maintenanceService } from '../services/maintenanceService.js'
import { oddsMetrics } from '../services/metricsService.js'
import { queueService } from '../services/queueService.js'
import { logger } from '../utils/logger.js'

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
  private leaderboardTimer: NodeJS.Timeout | null = null
  private worker: Worker | null = null

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

    // Schedule BullMQ Job Schedulers for periodic maintenance (with retries)
    const retryDelays = [500, 1500, 3000]
    let initialized = false
    let lastError: unknown = null
    for (let attempt = 1; attempt <= retryDelays.length; attempt++) {
      try {
        const queue = queueService.getMaintenanceQueue()
        await queue.upsertJobScheduler('maintenance:prune', { every: intervalMs })
        await queue.upsertJobScheduler('maintenance:refresh-skill-leaderboard', {
          pattern: '0 4 * * *',
        } as unknown as { pattern?: string; every?: number })
        // Turn-timeout watchdog: scans for overdue turns and triggers skip as a safety net
        await queue.upsertJobScheduler('maintenance:turn-timeout-watchdog', {
          every: Math.max(30_000, Number(process.env.TURN_TIMEOUT_WATCHDOG_EVERY_MS ?? 60_000)),
        })
        // Nightly odds shadow verification if enabled
        await queue.upsertJobScheduler('maintenance:odds-shadow-verify', {
          pattern: process.env.ODDS_SHADOW_CRON || '30 3 * * *',
        } as unknown as { pattern?: string; every?: number })

        const Redis = (await import('ioredis')).default
        const redis = (await import('../config/redis.js')).getRedisClient()
        const baseOpts = (redis?.options ?? {}) as import('ioredis').RedisOptions
        const { commandTimeout: _omitCommandTimeout, ...withoutCommandTimeout } = baseOpts
        const connection = new Redis({
          ...withoutCommandTimeout,
          enableReadyCheck: false,
          lazyConnect: false,
          maxRetriesPerRequest: null,
          connectionName: 'maintenance-worker',
        })
        this.worker = new Worker(
          queue.name,
          async (job: Job) => {
            switch (job.name) {
              case 'maintenance:prune':
                await this.runOnce('interval')
                return { ok: true }
              case 'maintenance:refresh-skill-leaderboard':
                await maintenanceService.refreshSkillLeaderboardCache()
                return { ok: true }
              case 'maintenance:turn-timeout-watchdog': {
                const summary = await this.runTurnTimeoutWatchdog()
                return { ok: true, ...summary }
              }
              case 'maintenance:odds-shadow-verify':
                await this.runOddsShadowVerify()
                return { ok: true }
              default:
                return null
            }
          },
          { connection },
        )

        logger.info('✅ Maintenance scheduler and worker initialized', { attempt })
        initialized = true
        break
      } catch (e) {
        lastError = e
        if (attempt < retryDelays.length) {
          const delay = retryDelays[attempt - 1]
          logger.warn(
            `Failed to initialize maintenance scheduler (attempt ${attempt}/${retryDelays.length}), retrying in ${delay}ms`,
            { error: e instanceof Error ? e.message : e },
          )
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    if (!initialized) {
      logger.warn(
        'Failed to initialize maintenance scheduler after retries; falling back to setInterval',
        {
          error: lastError instanceof Error ? lastError.message : lastError,
        },
      )
      // Fallback interval
      if (intervalMs > 0) {
        this.timer = setInterval(() => {
          this.runOnce('interval').catch((error) => {
            logger.error('❌ Scheduled maintenance prune failed', { error })
          })
        }, intervalMs)
      }
      // Also fallback-schedule the turn-timeout watchdog so AFK turns still progress
      try {
        const watchdogEvery = Math.max(
          30_000,
          Number(process.env.TURN_TIMEOUT_WATCHDOG_EVERY_MS ?? 60_000),
        )
        setInterval(() => {
          this.runTurnTimeoutWatchdog().catch((error) => {
            logger.warn('Turn-timeout watchdog (fallback) error', {
              error: error instanceof Error ? error.message : error,
            })
          })
        }, watchdogEvery)
        logger.info('✅ Turn-timeout watchdog fallback interval scheduled', {
          everyMs: watchdogEvery,
        })
      } catch (e) {
        logger.warn('Failed to schedule watchdog fallback interval', {
          error: e instanceof Error ? e.message : e,
        })
      }
      // Nightly fallback: 24h cadence starting one hour from now
      const ONE_DAY_MS = 24 * 60 * 60 * 1000
      this.leaderboardTimer = setTimeout(
        () => {
          maintenanceService
            .refreshSkillLeaderboardCache()
            .catch((error) =>
              logger.warn('Failed to refresh leaderboard cache (fallback)', { error }),
            )
          this.leaderboardTimer = setInterval(() => {
            maintenanceService
              .refreshSkillLeaderboardCache()
              .catch((error) =>
                logger.warn('Failed to refresh leaderboard cache (interval fallback)', { error }),
              )
          }, ONE_DAY_MS) as unknown as NodeJS.Timeout
        },
        60 * 60 * 1000,
      ) as unknown as NodeJS.Timeout
    }

    // Run once on startup (non-blocking)
    this.runOnce('startup').catch((error) => {
      logger.error('❌ Initial maintenance prune failed', { error })
    })

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

  /**
   * Safety net: if a turn's expiry passed but no queue job fired (or a job did a no-op),
   * trigger the normal timeout handler to advance play.
   */
  private async runTurnTimeoutWatchdog(): Promise<{
    scanned: number
    triggered: number
    ranAt: string
  }> {
    const ranAt = new Date().toISOString()
    try {
      const overdue = await maintenanceService.listExpiredTurnRooms(100)
      let triggered = 0
      if (overdue.length > 0) {
        const { GameLifecycleService } = await import('../services/gameLifecycleService.js')
        const lifecycle = new GameLifecycleService()
        for (const r of overdue) {
          try {
            await lifecycle.handleTurnTimeout(r.roomId)
            triggered += 1
          } catch (e) {
            logger.warn('Watchdog: failed to handle turn timeout', {
              roomId: r.roomId,
              error: e instanceof Error ? e.message : e,
            })
          }
        }
      }
      if (triggered > 0) {
        logger.info('🕒 Turn-timeout watchdog triggered timeouts', {
          scanned: overdue.length,
          triggered,
          ranAt,
        })
      } else {
        logger.debug('Turn-timeout watchdog: no overdue turns found', {
          scanned: overdue.length,
          ranAt,
        })
      }
      return { scanned: overdue.length, triggered, ranAt }
    } catch (e) {
      logger.warn('Turn-timeout watchdog encountered an error', {
        error: e instanceof Error ? e.message : e,
        ranAt,
      })
      return { scanned: 0, triggered: 0, ranAt }
    }
  }

  private async runOddsShadowVerify() {
    try {
      const enabled = (process.env.ODDS_SHADOW_SCHEDULED || '').toLowerCase()
      if (!(enabled === '1' || enabled === 'true' || enabled === 'yes')) {
        return
      }
      const prevEngine = getOddsEngine()
      let divergences = 0
      const trials = Number(process.env.ODDS_SHADOW_TRIALS || '100000')
      const attMin = Number(process.env.ODDS_SHADOW_ATT_MIN || '5')
      const attMax = Number(process.env.ODDS_SHADOW_ATT_MAX || '40')
      const defMin = Number(process.env.ODDS_SHADOW_DEF_MIN || '5')
      const defMax = Number(process.env.ODDS_SHADOW_DEF_MAX || '35')
      const seedHi = Number(process.env.ODDS_SHADOW_SEED_HI || '0xA1B2C3D4') >>> 0
      const seedLo = Number(process.env.ODDS_SHADOW_SEED_LO || '0x0F1E2D3C') >>> 0
      const passThrough = (entry: unknown) => logger.info('odds', entry as Record<string, unknown>)
      setOddsLogger((entry) => {
        try {
          const e = entry as { tag?: unknown }
          if ((e.tag as string | undefined) === 'odds-divergence') divergences++
        } catch {
          // ignore log parse issues
        }
        passThrough(entry)
      })
      setOddsEngine('shadow')
      const started = Date.now()
      for (let i = 0; i < trials; i++) {
        const att = attMin + (i % Math.max(1, attMax - attMin + 1))
        const def = defMin + (i % Math.max(1, defMax - defMin + 1))
        const sh = (seedHi ^ i) >>> 0
        const sl = (seedLo ^ (i * 2654435761)) >>> 0
        // eslint-disable-next-line no-await-in-loop
        await simulateBattleOdds({ seedHi: sh, seedLo: sl, attArmies: att, defArmies: def })
      }
      const durationMs = Date.now() - started
      const environment = process.env.NODE_ENV || 'development'
      oddsMetrics.recordBatch(environment, 'battle', trials, divergences)
      setOddsEngine(prevEngine)
      setOddsLogger((entry) => passThrough(entry))
      logger.info('✅ Nightly odds shadow verify complete', {
        trials,
        divergences,
        divergenceRate: trials > 0 ? divergences / trials : 0,
        durationMs,
      })
    } catch (e) {
      logger.warn('⚠️ Nightly odds shadow verify failed', {
        error: e instanceof Error ? e.message : e,
      })
    }
  }

  shutdown(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.leaderboardTimer) {
      clearInterval(this.leaderboardTimer)
      this.leaderboardTimer = null
    }
    if (this.worker) {
      // Close worker connection gracefully
      this.worker
        .close()
        .catch((e) => logger.warn('Failed to close Maintenance worker', { error: String(e) }))
      this.worker = null
    }
  }
}

export const createMaintenanceWorker = () => new MaintenanceWorker()
