import { randomUUID } from 'node:crypto'
import Bull from 'bull'
import type Redis from 'ioredis'
import type { RedisOptions } from 'ioredis'
import { getRedisClient } from '../config/redis'
import type { GameAction } from '../types/game'
import { logger } from '../utils/logger'

type QueueInspectionOptions = {
  excludeData?: boolean
}

interface WaitingJobSnapshot {
  timestamp?: number
}

interface CompletedJobSnapshot {
  finishedOn?: number
  processedOn?: number
}

interface FailedJobSnapshot {
  id?: string
  failedReason?: string
  finishedOn?: number
  processedOn?: number
  timestamp?: number
}

type InspectableQueue<JobData> = Bull.Queue<JobData> & {
  getWaiting(
    start?: number,
    end?: number,
    opts?: QueueInspectionOptions,
  ): Promise<WaitingJobSnapshot[]>
  getCompleted(
    start?: number,
    end?: number,
    opts?: QueueInspectionOptions,
  ): Promise<CompletedJobSnapshot[]>
  getStalledCount(): Promise<number>
  getFailed(
    start?: number,
    end?: number,
    opts?: QueueInspectionOptions,
  ): Promise<FailedJobSnapshot[]>
}

// Queue job types
export interface GameActionJob {
  gameId: string
  playerId: string
  action: GameAction
  socketId?: string
  idempotencyKey?: string
  afkSkip?: boolean
  afkStage?: 'start' | 'skip'
}

export interface BattleSimulationJob {
  gameId: string
  attackingTerritory: string
  defendingTerritory: string
  attackingArmies: number
  defendingArmies: number
  playerId: string
  idempotencyKey?: string
}

export interface GameCleanupJob {
  gameId: string
  reason: 'finished' | 'timeout' | 'abandoned'
  idempotencyKey?: string
}

type QueueConfigKey = keyof typeof QUEUE_CONFIGS

const QUEUE_LATENCY_WARNING_MS = 2 * 60 * 1000 // 2 minutes
const DEAD_LETTER_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

type DeadLetterJobPayload = {
  originalQueue: string
  jobId: string | number | null
  jobName: string
  attemptsMade: number
  failedReason: string
  failedAt: string
  data: unknown
  stacktrace?: string[] | null
}

// Queue configurations
const QUEUE_CONFIGS = {
  gameActions: {
    name: 'game-actions',
    concurrency: 10,
    priority: 'high' as const,
  },
  battleSimulations: {
    name: 'battle-simulations',
    concurrency: 5,
    priority: 'medium' as const,
  },
  gameCleanup: {
    name: 'game-cleanup',
    concurrency: 2,
    priority: 'low' as const,
  },
} as const

export interface QueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  isPaused: boolean
  deadLetter: number
  stalled: number
  oldestWaitingMs: number | null
  avgProcessingMs: number | null
  lastFailedJob?: {
    id: string | number
    reason: string
    failedAt: string
  }
  warnings: string[]
}

type QueueHealthDisabled = {
  status: 'disabled'
  details: {
    message: string
    initialized: boolean
  }
}

type QueueHealthOperational = {
  status: 'healthy' | 'unhealthy'
  details: {
    redis: string
    queues: Record<string, QueueStats>
    initialized: boolean
  }
}

export type QueueHealthResult = QueueHealthOperational | QueueHealthDisabled

export class QueueService {
  private redis: Redis | null = null
  private queues: Map<string, Bull.Queue> = new Map()
  private deadLetterQueues: Map<string, Bull.Queue> = new Map()
  private queueDisplayNames: Map<string, string> = new Map()
  private queueErrorState: Map<
    string,
    {
      message: string
      lastLoggedAt: number
      occurrences: number
    }
  > = new Map()
  private isInitialized = false
  private readonly queueReadyTimeoutMs = Number(process.env.QUEUE_READY_TIMEOUT_MS ?? 15000)

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Use centralized Redis client that has proper Railway network wait
      this.redis = getRedisClient()

      if (!this.redis) {
        logger.warn('Redis not available, QueueService will be disabled')
        // Don't throw error - gracefully degrade functionality
        return
      }

      logger.info('QueueService using centralized Redis client with Railway network support')

      const redisClient = this.redis

      const {
        // Strip commandTimeout so Bull's blocking commands (e.g. BRPOP) don't trigger false timeouts
        commandTimeout: _ignoredCommandTimeout,
        ...redisClientOptions
      } = redisClient.options as RedisOptions

      const baseRedisOptions: RedisOptions = {
        ...redisClientOptions,
        // Ensure Bull queue connections inherit the same resilience tuning as our main client
        enableReadyCheck: false,
        lazyConnect: false,
        maxRetriesPerRequest: null,
        // Explicitly disable per-command timeouts for Bull-managed connections
        commandTimeout: undefined,
      }

      // Initialize all queues using dedicated duplicates of the centralized Redis connection
      for (const [key, config] of Object.entries(QUEUE_CONFIGS)) {
        const queue = new Bull(config.name, {
          createClient: (type) => {
            const client = redisClient.duplicate({
              ...baseRedisOptions,
              connectionName: `bull:${config.name}:${type}`,
            })

            client.on('error', (err) =>
              logger.warn(
                `Redis client error for ${config.name} (${type}): ${
                  err instanceof Error ? err.message : err
                }`,
              ),
            )

            return client
          },
          defaultJobOptions: {
            removeOnComplete: 10,
            removeOnFail: 5,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        })

        const deadLetterQueue = new Bull(`${config.name}:dead-letter`, {
          createClient: (type) => {
            const client = redisClient.duplicate({
              ...baseRedisOptions,
              connectionName: `bull:${config.name}:dlq:${type}`,
            })

            client.on('error', (err) =>
              logger.warn(
                `Redis client error for ${config.name}:dead-letter (${type}): ${
                  err instanceof Error ? err.message : err
                }`,
              ),
            )

            return client
          },
          defaultJobOptions: {
            removeOnComplete: false,
            removeOnFail: false,
            attempts: 1,
          },
        })

        const queueKey = key as QueueConfigKey
        this.queues.set(queueKey, queue)
        this.deadLetterQueues.set(queueKey, deadLetterQueue)
        this.queueDisplayNames.set(queueKey, config.name)

        this.attachQueueEventHandlers(queueKey, queue, deadLetterQueue)

        try {
          await Promise.all([
            this.waitForQueueReady(queue, config.name),
            this.waitForQueueReady(deadLetterQueue, `${config.name}:dead-letter`),
          ])
        } catch (queueReadyError) {
          const formatted = this.formatQueueError(queueReadyError)
          logger.error('❌ Queue failed to become ready', {
            queue: config.name,
            ...formatted,
          })
          throw queueReadyError
        }

        logger.info(`✅ Queue initialized: ${config.name}`)
      }

      this.isInitialized = true
      logger.info('✅ QueueService initialized successfully')
    } catch (error) {
      logger.error('❌ Failed to initialize QueueService:', error)
      // Don't throw error in production - gracefully degrade
      if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
        logger.warn('QueueService initialization failed but continuing without queues')
      } else {
        throw error
      }
    }
  }

  // Game Action Queue
  async addGameAction(job: GameActionJob): Promise<Bull.Job<GameActionJob> | null> {
    if (!this.redis || !this.isInitialized) {
      logger.warn('QueueService not available, skipping game action queue')
      return null
    }

    const queue = this.queues.get('gameActions')
    if (!queue) throw new Error('Game actions queue not initialized')

    const idempotencyKey = job.idempotencyKey ?? randomUUID()
    const payload: GameActionJob = {
      ...job,
      idempotencyKey,
    }

    return queue.add('process-game-action', payload, {
      jobId: idempotencyKey,
      priority: this.getActionPriority(job.action),
      delay: 0,
    })
  }

  // Schedule a delayed game action (e.g., auto end-turn). Attempts set to 1 by default.
  async addDelayedGameAction(
    job: GameActionJob,
    delayMs: number,
    options?: { idempotencyKey?: string; priority?: number },
  ): Promise<Bull.Job<GameActionJob> | null> {
    if (!this.redis || !this.isInitialized) {
      logger.warn('QueueService not available, skipping delayed game action')
      return null
    }

    const queue = this.queues.get('gameActions')
    if (!queue) throw new Error('Game actions queue not initialized')

    const idempotencyKey = options?.idempotencyKey ?? job.idempotencyKey ?? randomUUID()
    const payload: GameActionJob = {
      ...job,
      idempotencyKey,
    }

    return queue.add('process-game-action', payload, {
      jobId: idempotencyKey,
      delay: Math.max(0, Math.trunc(delayMs)),
      attempts: 1,
      removeOnFail: true,
      removeOnComplete: 10,
      priority: options?.priority ?? this.getActionPriority(job.action),
    })
  }

  // Battle Simulation Queue
  async addBattleSimulation(
    job: BattleSimulationJob,
  ): Promise<Bull.Job<BattleSimulationJob> | null> {
    if (!this.redis || !this.isInitialized) {
      logger.warn('QueueService not available, skipping battle simulation queue')
      return null
    }

    const queue = this.queues.get('battleSimulations')
    if (!queue) throw new Error('Battle simulations queue not initialized')

    const idempotencyKey = job.idempotencyKey ?? randomUUID()
    const payload: BattleSimulationJob = {
      ...job,
      idempotencyKey,
    }

    return queue.add('simulate-battle', payload, {
      jobId: idempotencyKey,
      priority: 5, // Medium priority
      delay: 0,
    })
  }

  // Game Cleanup Queue
  async addGameCleanup(job: GameCleanupJob): Promise<Bull.Job<GameCleanupJob> | null> {
    if (!this.redis || !this.isInitialized) {
      logger.warn('QueueService not available, skipping game cleanup queue')
      return null
    }

    const queue = this.queues.get('gameCleanup')
    if (!queue) throw new Error('Game cleanup queue not initialized')

    const idempotencyKey = job.idempotencyKey ?? job.gameId
    const payload: GameCleanupJob = {
      ...job,
      idempotencyKey,
    }

    return queue.add('cleanup-game', payload, {
      jobId: idempotencyKey,
      priority: 1, // Low priority
      delay: job.reason === 'timeout' ? 30000 : 0, // 30s delay for timeouts
    })
  }

  // Queue monitoring
  async getQueueStats(): Promise<Record<string, QueueStats>> {
    const stats: Record<string, QueueStats> = {}
    const now = Date.now()

    for (const [key, queue] of this.queues) {
      const inspectableQueue = queue as InspectableQueue<unknown>
      const [jobCounts, isPaused, waitingSamples, completedSamples, stalledCount, failedSamples] =
        await Promise.all([
          queue.getJobCounts(),
          queue.isPaused(),
          inspectableQueue.getWaiting(0, 19, { excludeData: true }),
          inspectableQueue.getCompleted(0, 9, { excludeData: true }),
          inspectableQueue.getStalledCount(),
          inspectableQueue.getFailed(0, 0, { excludeData: true }),
        ])

      const deadLetterQueue = this.deadLetterQueues.get(key)
      let deadLetterCount = 0
      if (deadLetterQueue) {
        const deadLetterCounts = await deadLetterQueue.getJobCounts()
        deadLetterCount = Object.values(deadLetterCounts).reduce<number>((sum, count) => {
          const numeric = typeof count === 'number' ? count : Number(count ?? 0)
          return sum + numeric
        }, 0)
      }

      const oldestWaiting = waitingSamples.reduce<number>((max, job) => {
        if (typeof job.timestamp === 'number') {
          return Math.max(max, now - job.timestamp)
        }
        return max
      }, 0)

      const completedDurations = completedSamples
        .map((job) => {
          if (typeof job.finishedOn === 'number' && typeof job.processedOn === 'number') {
            return job.finishedOn - job.processedOn
          }
          return null
        })
        .filter((value): value is number => value !== null && value >= 0)

      const avgProcessingMs =
        completedDurations.length > 0
          ? Math.round(
              completedDurations.reduce((sum, duration) => sum + duration, 0) /
                completedDurations.length,
            )
          : null

      const lastFailedJob = failedSamples[0]
      const lastFailed = lastFailedJob
        ? {
            id: lastFailedJob.id ?? 'unknown',
            reason: lastFailedJob.failedReason || 'Unknown failure',
            failedAt: new Date(
              (lastFailedJob.finishedOn ?? lastFailedJob.processedOn ?? lastFailedJob.timestamp) ||
                Date.now(),
            ).toISOString(),
          }
        : undefined

      const warnings: string[] = []
      if (isPaused) {
        warnings.push('queue paused')
      }
      if (stalledCount > 0) {
        warnings.push(`${stalledCount} stalled job${stalledCount === 1 ? '' : 's'}`)
      }
      if (deadLetterCount > 0) {
        warnings.push(`${deadLetterCount} dead-letter job${deadLetterCount === 1 ? '' : 's'}`)
      }
      if (oldestWaiting > QUEUE_LATENCY_WARNING_MS) {
        const seconds = Math.round(oldestWaiting / 1000)
        warnings.push(`oldest waiting job is ${seconds}s old`)
      }

      stats[key] = {
        waiting: jobCounts.waiting,
        active: jobCounts.active,
        completed: jobCounts.completed,
        failed: jobCounts.failed,
        delayed: jobCounts.delayed,
        isPaused,
        deadLetter: deadLetterCount,
        stalled: stalledCount,
        oldestWaitingMs: oldestWaiting > 0 ? oldestWaiting : null,
        avgProcessingMs,
        lastFailedJob: lastFailed,
        warnings,
      }
    }

    return stats
  }

  // Priority system for game actions
  private getActionPriority(action: GameAction): number {
    switch (action.type) {
      case 'end_turn':
      case 'begin_turn':
        return 10 // Highest priority
      case 'attack':
      case 'fortify':
        return 7 // High priority
      case 'deploy':
        return 5 // Medium priority
      case 'trade_cards':
        return 3 // Medium priority
      case 'go_back_to_reinforcement':
        return 2 // Low priority
      default:
        return 5 // Default medium priority
    }
  }

  private formatQueueError(error: unknown): {
    message: string
    code?: string
    name?: string
    stack?: string
    errno?: number | string
    address?: string
    port?: number
  } {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException & { address?: string; port?: number }
      return {
        message: nodeError.message,
        code: nodeError.code ? String(nodeError.code) : undefined,
        name: nodeError.name,
        stack: nodeError.stack,
        errno: nodeError.errno,
        address: nodeError.address,
        port: nodeError.port,
      }
    }

    return {
      message: typeof error === 'string' ? error : JSON.stringify(error),
    }
  }

  private shouldLogQueueError(
    queueName: string,
    message: string,
  ): {
    logNow: boolean
    occurrences: number
    lastLoggedAt: number
  } {
    const now = Date.now()
    const existing = this.queueErrorState.get(queueName)

    if (!existing || existing.message !== message) {
      this.queueErrorState.set(queueName, {
        message,
        lastLoggedAt: now,
        occurrences: 1,
      })

      return { logNow: true, occurrences: 1, lastLoggedAt: now }
    }

    const occurrences = existing.occurrences + 1

    // Only emit every 10th repeat within the quiet window to reduce log noise
    const quietWindowMs = 30000
    const shouldLogRepeat = occurrences % 10 === 0 || now - existing.lastLoggedAt > quietWindowMs

    this.queueErrorState.set(queueName, {
      message,
      lastLoggedAt: shouldLogRepeat ? now : existing.lastLoggedAt,
      occurrences,
    })

    return {
      logNow: shouldLogRepeat,
      occurrences,
      lastLoggedAt: shouldLogRepeat ? now : existing.lastLoggedAt,
    }
  }

  private async waitForQueueReady(queue: Bull.Queue, name: string): Promise<void> {
    const waitUntilReady = (queue as { waitUntilReady?: () => Promise<unknown> }).waitUntilReady

    const readinessPromise = (waitUntilReady ? waitUntilReady.call(queue) : queue.isReady()).then(
      () => undefined,
    )

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Queue ${name} readiness timed out after ${this.queueReadyTimeoutMs}ms`))
      }, this.queueReadyTimeoutMs)

      readinessPromise
        .finally(() => clearTimeout(timer))
        .catch(() => {
          // noop - rejection handled by outer await
        })
    })

    await Promise.race([readinessPromise, timeoutPromise])
  }

  private attachQueueEventHandlers(
    queueKey: QueueConfigKey,
    queue: Bull.Queue,
    deadLetterQueue: Bull.Queue,
  ): void {
    queue.on('failed', async (job, error) => {
      const attemptsMade = job.attemptsMade ?? 0
      const maxAttempts =
        typeof job.opts?.attempts === 'number' && job.opts.attempts > 0 ? job.opts.attempts : 1

      if (attemptsMade >= maxAttempts) {
        try {
          await this.moveToDeadLetter(queueKey, deadLetterQueue, job, error)
        } catch (deadLetterError) {
          logger.error('❌ Failed to move job to dead-letter queue', {
            queue: queue.name,
            jobId: job.id,
            error: deadLetterError,
          })
        }
      }
    })

    queue.on('stalled', (job) => {
      logger.warn('⚠️ Detected stalled queue job', {
        queue: queue.name,
        jobId: job?.id,
      })
    })

    queue.on('error', (queueError) => {
      const normalized = this.formatQueueError(queueError)
      const { logNow, occurrences } = this.shouldLogQueueError(queue.name, normalized.message)

      if (!logNow) {
        logger.debug('Suppressed repetitive queue error', {
          queue: queue.name,
          message: normalized.message,
          occurrences,
        })
        return
      }

      logger.error('❌ Queue error detected', {
        queue: queue.name,
        ...normalized,
        occurrences,
      })
    })
  }

  private async moveToDeadLetter(
    queueKey: QueueConfigKey,
    deadLetterQueue: Bull.Queue,
    job: Bull.Job,
    error: unknown,
  ): Promise<void> {
    const queueName = this.queueDisplayNames.get(queueKey) ?? job.queue?.name ?? String(queueKey)
    const payload: DeadLetterJobPayload = {
      originalQueue: queueName,
      jobId: job.id ?? null,
      jobName: job.name || 'unnamed-job',
      attemptsMade: job.attemptsMade ?? 0,
      failedReason:
        job.failedReason || (error instanceof Error ? error.message : 'Unknown failure reason'),
      failedAt: new Date().toISOString(),
      data: job.data,
      stacktrace: job.stacktrace,
    }

    await deadLetterQueue.add('dead-letter', payload, {
      jobId: `${job.id ?? randomUUID()}::${Date.now()}`,
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 1,
      delay: 0,
      lifo: true,
      timeout: undefined,
      backoff: undefined,
    })

    await deadLetterQueue.clean(DEAD_LETTER_TTL_SECONDS * 1000, 'completed')
    await deadLetterQueue.clean(DEAD_LETTER_TTL_SECONDS * 1000, 'failed')

    logger.warn('Moved job to dead-letter queue', {
      queue: queueName,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
    })
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down QueueService...')

    const activeQueues = Array.from(this.queues.values())
    const deadLetterQueues = Array.from(this.deadLetterQueues.values())

    await Promise.all([...activeQueues, ...deadLetterQueues].map((queue) => queue.close()))

    // Only disconnect if redis is available (it's managed by the central config)
    if (this.redis) {
      logger.info('QueueService shutdown - Redis connection managed by central config')
    }

    this.isInitialized = false

    logger.info('✅ QueueService shutdown complete')
  }

  // Health check
  async healthCheck(): Promise<QueueHealthResult> {
    try {
      if (!this.redis) {
        return {
          status: 'disabled',
          details: {
            message: 'Redis not available, queue service disabled',
            initialized: this.isInitialized,
          },
        }
      }

      const pingResult = await this.redis.ping()
      const stats = await this.getQueueStats()
      const hasWarnings = Object.values(stats).some((queueStats) => queueStats.warnings.length > 0)

      return {
        status: pingResult === 'PONG' && !hasWarnings ? 'healthy' : 'unhealthy',
        details: {
          redis: pingResult,
          queues: stats,
          initialized: this.isInitialized,
        },
      }
    } catch (error) {
      logger.error('❌ QueueService health check failed', error)
      return {
        status: 'unhealthy',
        details: {
          redis: 'ERROR',
          queues: {},
          initialized: this.isInitialized,
        },
      }
    }
  }

  private getQueue(name: QueueConfigKey): Bull.Queue {
    const queue = this.queues.get(name)
    if (!queue) {
      throw new Error(`Queue ${name} not found. Make sure initialize() was called first.`)
    }
    return queue
  }

  getBattleQueue(): Bull.Queue<BattleSimulationJob> {
    return this.getQueue('battleSimulations') as Bull.Queue<BattleSimulationJob>
  }

  getGameActionQueue(): Bull.Queue<GameActionJob> {
    return this.getQueue('gameActions') as Bull.Queue<GameActionJob>
  }

  getCleanupQueue(): Bull.Queue<GameCleanupJob> {
    return this.getQueue('gameCleanup') as Bull.Queue<GameCleanupJob>
  }
}

// Export singleton instance
export const queueService = new QueueService()
