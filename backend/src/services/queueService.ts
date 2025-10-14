import { randomUUID } from 'node:crypto'
import { type Job, type JobsOptions, Queue, QueueEvents } from 'bullmq'
import type { Redis as IORedis, RedisOptions } from 'ioredis'
import { getRedisClient } from '../config/redis.js'
import type { GameAction } from '../types/game.js'
import { logger } from '../utils/logger.js'
import { createRedisFromOptions } from '../utils/redisFactory.js'

// Note: BullMQ sampling uses getJobs on states; no extra inspection types needed.

// (removed unused FailedJobSnapshot interface)

// BullMQ does not expose the same inspect helpers as Bull.
// We'll use getJobs with specific states for sampling where needed.
type InspectableQueue<JobData> = Queue<JobData>

// Queue job types
export interface GameActionJob {
  gameId: string
  playerId: string
  action: GameAction
  socketId?: string
  idempotencyKey?: string
  afkSkip?: boolean
  turnTimeoutStage?: 'expire'
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
  gameCleanup: {
    name: 'game-cleanup',
    concurrency: 2,
    priority: 'low' as const,
  },
  analyticsEvents: {
    name: 'analytics-events',
    concurrency: 5,
    priority: 'low' as const,
  },
  maintenance: {
    name: 'maintenance',
    concurrency: 1,
    priority: 'low' as const,
  },
  mapAssets: {
    name: 'map-assets',
    concurrency: 1,
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
  events?: {
    completed: number
    failed: number
    stalled: number
  }
  eventsSince?: string
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
  private redis: IORedis | null = null
  private queues: Map<string, Queue> = new Map()
  private deadLetterQueues: Map<string, Queue> = new Map()
  private queueDisplayNames: Map<string, string> = new Map()
  private queueEvents: Map<string, QueueEvents> = new Map()
  private queueEventCounters: Map<string, { completed: number; failed: number; stalled: number }> =
    new Map()
  private eventCountersSince: string | null = null
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

  // BullMQ prohibits ":" in custom job IDs because it interferes with key names.
  // Normalize any potentially unsafe characters to "_" for Redis key safety.
  private sanitizeJobId(id: string): string {
    try {
      // Keep alphanumerics, dash and underscore; replace others with underscore
      return String(id).replace(/[^a-zA-Z0-9_-]/g, '_')
    } catch {
      return `job_${Date.now()}`
    }
  }

  // Generic job listing by state (admin diagnostics)
  async listJobsByState(
    key: QueueConfigKey,
    state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    opts?: { offset?: number; limit?: number },
  ): Promise<
    Array<{
      id: string
      name: string
      state: typeof state
      timestamp: string
      attemptsMade: number
      returnvalue?: unknown
      failedReason?: string
      progress?: number | Record<string, unknown>
    }>
  > {
    const queue = this.queues.get(key)
    if (!queue) return []
    const offset = Math.max(0, Math.trunc(opts?.offset ?? 0))
    const limit = Math.max(1, Math.min(200, Math.trunc(opts?.limit ?? 50)))
    const end = offset + limit - 1
    try {
      const jobs = await queue.getJobs([state], offset, end)
      return jobs.map((j) => ({
        id: String(j.id ?? ''),
        name: j.name || 'job',
        state,
        timestamp: new Date((j.timestamp as number) || Date.now()).toISOString(),
        attemptsMade: (j.attemptsMade as number) ?? 0,
        returnvalue: (j as { returnvalue?: unknown }).returnvalue,
        failedReason: (j as { failedReason?: string }).failedReason,
        progress: j.progress as number | Record<string, unknown>,
      }))
    } catch (e) {
      logger.warn('Failed to list jobs by state', {
        queue: queue.name,
        state,
        error: e instanceof Error ? e.message : e,
      })
      return []
    }
  }

  // Retry a failed job by id on a given queue
  async retryJob(
    key: QueueConfigKey,
    id: string | number,
  ): Promise<{ retried: boolean; message?: string }> {
    const queue = this.queues.get(key)
    if (!queue) return { retried: false, message: 'Queue not found' }
    try {
      const job = await queue.getJob(String(id))
      if (!job) return { retried: false, message: 'Job not found' }
      // BullMQ requires job to be in failed/delayed state to retry
      await job.retry()
      return { retried: true }
    } catch (e) {
      logger.warn('Failed to retry job', {
        queue: queue.name,
        id,
        error: e instanceof Error ? e.message : e,
      })
      return { retried: false, message: e instanceof Error ? e.message : String(e) }
    }
  }

  private resolveQueue<Key extends QueueConfigKey>(key: Key): Queue | null {
    return (this.queues.get(key) as Queue | undefined) ?? null
  }

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
        // Strip commandTimeout so BullMQ's blocking commands don't trigger false timeouts
        commandTimeout: _ignoredCommandTimeout,
        ..._redisClientOptions
      } = redisClient.options as RedisOptions

      const bullPrefix = process.env.BULL_PREFIX?.trim() || 'bull'

      // Initialize all queues using the centralized Redis connection
      for (const [key, config] of Object.entries(QUEUE_CONFIGS)) {
        // Base defaults, may be overridden per-queue below
        const defaultJobOptions: JobsOptions =
          config.name === 'analytics-events'
            ? {
                // Retain fewer analytics jobs and for shorter time
                removeOnComplete: { age: 600, count: 100 }, // 10 minutes or last 100
                removeOnFail: { age: 3600, count: 50 }, // 1 hour or last 50
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
              }
            : {
                removeOnComplete: 10,
                removeOnFail: 5,
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
              }

        const queue = new Queue(config.name, {
          connection: redisClient,
          prefix: bullPrefix,
          defaultJobOptions,
        })

        // Avoid colon in queue names (BullMQ prohibits ":" in names)
        const deadLetterQueue = new Queue(`${config.name}-dead-letter`, {
          connection: redisClient,
          prefix: bullPrefix,
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
            this.waitForQueueReady(deadLetterQueue, `${config.name}-dead-letter`),
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
      this.eventCountersSince = new Date().toISOString()
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
  async addGameAction(job: GameActionJob): Promise<Job<GameActionJob> | null> {
    if (!this.redis || !this.isInitialized) {
      logger.warn('QueueService not available, skipping game action queue')
      return null
    }

    const queue = this.resolveQueue('gameActions')
    if (!queue) throw new Error('Game actions queue not initialized')

    const idempotencyKey = job.idempotencyKey ?? randomUUID()
    const payload: GameActionJob = {
      ...job,
      idempotencyKey,
    }

    return queue.add('process-game-action', payload, {
      jobId: this.sanitizeJobId(idempotencyKey),
      priority: this.getActionPriority(job.action),
      delay: 0,
      attempts: 1, // Real-time actions shouldn't retry on validation errors
      removeOnFail: true,
      removeOnComplete: 10,
    })
  }

  // Remove a scheduled or waiting game action by its jobId (idempotencyKey)
  async removeGameActionJob(jobId: string): Promise<boolean> {
    if (!this.redis || !this.isInitialized) {
      return false
    }

    const queue = this.resolveQueue('gameActions')
    if (!queue) return false

    try {
      const job = await queue.getJob(this.sanitizeJobId(jobId))
      if (job) {
        await job.remove()
        return true
      }
    } catch (error) {
      logger.warn('Failed to remove game action job', {
        jobId,
        error: error instanceof Error ? error.message : error,
      })
    }
    return false
  }

  // Schedule a delayed game action (e.g., auto end-turn). Attempts set to 1 by default.
  async addDelayedGameAction(
    job: GameActionJob,
    delayMs: number,
    options?: { idempotencyKey?: string; priority?: number },
  ): Promise<Job<GameActionJob> | null> {
    if (!this.redis || !this.isInitialized) {
      logger.warn('QueueService not available, skipping delayed game action')
      return null
    }

    const queue = this.resolveQueue('gameActions')
    if (!queue) throw new Error('Game actions queue not initialized')

    const idempotencyKey = options?.idempotencyKey ?? job.idempotencyKey ?? randomUUID()
    const payload: GameActionJob = {
      ...job,
      idempotencyKey,
    }

    return queue.add('process-game-action', payload, {
      jobId: this.sanitizeJobId(idempotencyKey),
      delay: Math.max(0, Math.trunc(delayMs)),
      attempts: 1,
      removeOnFail: true,
      removeOnComplete: 10,
      priority: options?.priority ?? this.getActionPriority(job.action),
    })
  }

  // Game Cleanup Queue
  async addGameCleanup(job: GameCleanupJob): Promise<Job<GameCleanupJob> | null> {
    if (!this.redis || !this.isInitialized) {
      logger.warn('QueueService not available, skipping game cleanup queue')
      return null
    }

    const queue = this.resolveQueue('gameCleanup')
    if (!queue) throw new Error('Game cleanup queue not initialized')

    const idempotencyKey = job.idempotencyKey ?? job.gameId
    const payload: GameCleanupJob = {
      ...job,
      idempotencyKey,
    }

    return queue.add('cleanup-game', payload, {
      jobId: this.sanitizeJobId(idempotencyKey),
      priority: 1, // Low priority
      delay: job.reason === 'timeout' ? 30000 : 0, // 30s delay for timeouts
    })
  }

  // Change delay on an existing delayed game-action by jobId
  async changeDelayedGameActionDelay(jobId: string, delayMs: number): Promise<boolean> {
    if (!this.redis || !this.isInitialized) return false
    const queue = this.resolveQueue('gameActions')
    if (!queue) return false
    try {
      const job = await queue.getJob(this.sanitizeJobId(jobId))
      if (!job) return false
      await job.changeDelay(Math.max(0, Math.trunc(delayMs)))
      return true
    } catch (e) {
      logger.warn('Failed to change delay for game action job', {
        jobId,
        delayMs,
        error: e instanceof Error ? e.message : e,
      })
      return false
    }
  }

  // Analytics/Event Queue (fire-and-forget)
  async addAnalyticsEvent(job: {
    event: string
    gameId: string
    data: unknown
  }): Promise<Job | null> {
    if (!this.redis || !this.isInitialized) {
      return null
    }
    const queue = this.resolveQueue('analyticsEvents')
    if (!queue) return null
    try {
      return queue.add('analytics-event', job, { priority: 1 })
    } catch {
      return null
    }
  }

  // Bulk analytics events (more efficient under load)
  async addAnalyticsEventsBulk(
    jobs: Array<{ event: string; gameId: string; data: unknown }>,
  ): Promise<Array<Pick<Job, 'id' | 'name'>> | null> {
    if (!this.redis || !this.isInitialized) return null
    const queue = this.resolveQueue('analyticsEvents')
    if (!queue) return null
    try {
      const added = await queue.addBulk(
        jobs.map((j) => ({ name: 'analytics-event', data: j, opts: { priority: 1 } })),
      )
      return added.map((j) => ({ id: j.id as string, name: j.name }))
    } catch (e) {
      logger.warn('Failed to add analytics events in bulk', {
        count: jobs.length,
        error: e instanceof Error ? e.message : e,
      })
      return null
    }
  }

  // Queue monitoring
  async getQueueStats(): Promise<Record<string, QueueStats>> {
    const stats: Record<string, QueueStats> = {}
    const now = Date.now()

    for (const [key, queue] of this.queues) {
      const inspectableQueue = queue as InspectableQueue<unknown>
      const [jobCounts, isPaused, waitingJobs, completedJobs, failedJobs] = await Promise.all([
        queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed'),
        queue.isPaused(),
        inspectableQueue.getJobs(['wait'], 0, 19),
        inspectableQueue.getJobs(['completed'], 0, 9),
        inspectableQueue.getJobs(['failed'], 0, 0),
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

      const oldestWaiting = waitingJobs.reduce<number>((max, j) => {
        if (typeof j.timestamp === 'number') {
          return Math.max(max, now - j.timestamp)
        }
        return max
      }, 0)

      const completedDurations = completedJobs
        .map((j) => {
          if (typeof j.finishedOn === 'number' && typeof j.processedOn === 'number') {
            return j.finishedOn - j.processedOn
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

      const lastFailedJob = failedJobs[0]
      const lastFailed = lastFailedJob
        ? {
            id: lastFailedJob.id ?? 'unknown',
            reason: ((): string => {
              const r = (lastFailedJob as { failedReason?: unknown }).failedReason
              return typeof r === 'string' && r.length > 0 ? r : 'Unknown failure'
            })(),
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
      if (deadLetterCount > 0) {
        warnings.push(`${deadLetterCount} dead-letter job${deadLetterCount === 1 ? '' : 's'}`)
      }
      if (oldestWaiting > QUEUE_LATENCY_WARNING_MS) {
        const seconds = Math.round(oldestWaiting / 1000)
        warnings.push(`oldest waiting job is ${seconds}s old`)
      }

      const counters = this.queueEventCounters.get(key) ?? {
        completed: 0,
        failed: 0,
        stalled: 0,
      }

      stats[key] = {
        waiting: Number(jobCounts.wait ?? jobCounts.waiting ?? 0),
        active: Number(jobCounts.active ?? 0),
        completed: Number(jobCounts.completed ?? 0),
        failed: Number(jobCounts.failed ?? 0),
        delayed: Number(jobCounts.delayed ?? 0),
        isPaused,
        deadLetter: deadLetterCount,
        stalled: 0,
        oldestWaitingMs: oldestWaiting > 0 ? oldestWaiting : null,
        avgProcessingMs,
        lastFailedJob: lastFailed,
        warnings,
        events: counters,
        eventsSince: this.eventCountersSince ?? undefined,
      }
    }

    return stats
  }

  async hasActiveWorkers(queueName: QueueConfigKey): Promise<boolean> {
    if (!this.redis || !this.isInitialized) {
      return false
    }

    const queue = this.resolveQueue(queueName)
    if (!queue) {
      return false
    }

    const queueRealName = this.queueDisplayNames.get(queueName) ?? queueName

    // Prefer heartbeat detection for precision
    try {
      const prefix = `worker:hb:${queueRealName}:`
      const hasHb = await this.scanForAnyKey(prefix)
      if (hasHb) return true
    } catch (_e) {
      // Fall back to recent-completion heuristic
    }

    try {
      const completed = await queue.getJobs(['completed'], 0, 1)
      const last = Array.isArray(completed) && completed.length > 0 ? completed[0] : null
      const finishedOn = (last?.finishedOn ?? last?.processedOn ?? 0) as number
      if (!finishedOn) {
        return false
      }
      const RECENT_MS = 30_000
      return Date.now() - finishedOn < RECENT_MS
    } catch (error) {
      logger.warn('Failed to inspect queue workers', {
        queue: queueRealName,
        error: error instanceof Error ? error.message : error,
      })
      return false
    }
  }

  private async scanForAnyKey(prefix: string): Promise<boolean> {
    if (!this.redis) return false
    let cursor = '0'
    do {
      // COUNT small to reduce blocking; MATCH by prefix
      // eslint-disable-next-line no-await-in-loop
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100)
      if (Array.isArray(keys) && keys.length > 0) return true
      cursor = next
    } while (cursor !== '0')
    return false
  }

  // Priority system for game actions
  private getActionPriority(action: GameAction): number {
    switch (action.type) {
      case 'end_turn':
        return 10 // Highest priority
      case 'attack':
      case 'fortify':
      case 'transfer_conquest':
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

  private async waitForQueueReady(queue: Queue, name: string): Promise<void> {
    const waitUntilReady = (queue as unknown as { waitUntilReady?: () => Promise<unknown> })
      .waitUntilReady

    const readinessPromise = (waitUntilReady ? waitUntilReady.call(queue) : Promise.resolve()).then(
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
    queue: Queue,
    deadLetterQueue: Queue,
  ): void {
    // BullMQ does not emit job events on Queue directly; those are available via QueueEvents or Worker.
    // Create QueueEvents listener for failed jobs so we can implement DLQ semantics globally.
    try {
      const baseOpts = (this.redis?.options ?? {}) as RedisOptions
      // IMPORTANT: BullMQ QueueEvents uses blocking XREAD. ioredis `commandTimeout`
      // will incorrectly time out these long‑polling commands and emit noisy errors.
      // Strip it for the dedicated events connection.
      const { commandTimeout: _omitCommandTimeout, ...withoutCommandTimeout } = baseOpts

      const eventsConn = createRedisFromOptions({
        ...withoutCommandTimeout,
        // Give this connection a distinct name for diagnostics
        connectionName: `queue-events:${queue.name}`,
        enableReadyCheck: false,
        lazyConnect: false,
        // Critical for BullMQ blocking commands
        maxRetriesPerRequest: null,
      })
      const bullPrefix = process.env.BULL_PREFIX?.trim() || 'bull'
      const events = new QueueEvents(queue.name, {
        connection: eventsConn,
        prefix: bullPrefix,
      })

      events.on('failed', async ({ jobId, failedReason }) => {
        try {
          const job = jobId ? await queue.getJob(jobId) : null
          if (!job) return
          const attemptsMade = (job as Job).attemptsMade ?? 0
          const opts = (job as Job).opts as JobsOptions | undefined
          const maxAttempts =
            typeof opts?.attempts === 'number' && opts.attempts > 0 ? opts.attempts : 1
          if (attemptsMade >= maxAttempts) {
            await this.moveToDeadLetter(queueKey, deadLetterQueue, job as Job, failedReason)
          }
        } catch (deadLetterError) {
          logger.error('❌ Failed handling failed event for DLQ', {
            queue: queue.name,
            jobId,
            error: deadLetterError,
          })
        }
      })

      events.on('error', (err) => {
        const normalized = this.formatQueueError(err)
        // Deduplicate noisy repeating errors (e.g., transient disconnects)
        const { logNow, occurrences } = this.shouldLogQueueError(
          `${queue.name}:events`,
          normalized.message,
        )
        if (!logNow) {
          logger.debug('Suppressed repetitive queue events error', {
            queue: queue.name,
            message: normalized.message,
            occurrences,
          })
          return
        }
        logger.warn('QueueEvents error', {
          queue: queue.name,
          ...normalized,
          occurrences,
        })
      })

      this.queueEvents.set(queueKey, events)
    } catch (e) {
      logger.warn('Failed to attach QueueEvents for queue', {
        queue: queue.name,
        error: e instanceof Error ? e.message : e,
      })
    }
    // We keep error logging on the Queue instance if available.
    const maybeOn = (queue as { on?: (event: string, cb: (err: unknown) => void) => void }).on
    if (typeof maybeOn === 'function') {
      maybeOn.call(queue, 'error', (queueError: unknown) => {
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
  }

  private async moveToDeadLetter(
    queueKey: QueueConfigKey,
    deadLetterQueue: Queue,
    job: Job,
    error: unknown,
  ): Promise<void> {
    const queueName = this.queueDisplayNames.get(queueKey) ?? String(queueKey)
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
    })

    await deadLetterQueue.clean(DEAD_LETTER_TTL_SECONDS * 1000, 1000, 'completed')
    await deadLetterQueue.clean(DEAD_LETTER_TTL_SECONDS * 1000, 1000, 'failed')

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
    const events = Array.from(this.queueEvents.values())

    await Promise.all([
      ...[...activeQueues, ...deadLetterQueues].map((queue) => queue.close()),
      ...events.map((ev) => ev.close()),
    ])

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

  // Dead Letter Queue utilities (admin)
  async listDeadLetters(
    key: QueueConfigKey,
    opts?: { offset?: number; limit?: number },
  ): Promise<
    Array<{
      id: string
      failedReason: string
      failedAt: string
      jobName: string
      attemptsMade: number
    }>
  > {
    const dlq = this.deadLetterQueues.get(key)
    if (!dlq) return []
    const offset = Math.max(0, Math.trunc(opts?.offset ?? 0))
    const limit = Math.max(1, Math.min(200, Math.trunc(opts?.limit ?? 50)))
    const end = offset + limit - 1
    // DLQ jobs stay in 'wait' (no worker). Also include 'delayed' just in case.
    const jobs = await dlq.getJobs(['wait', 'delayed'], offset, end)
    return jobs
      .map((j) => {
        const data = j.data as Partial<DeadLetterJobPayload>
        const failedAt = data?.failedAt || new Date().toISOString()
        const failedReason = data?.failedReason || 'Unknown'
        return {
          id: String(j.id ?? ''),
          failedReason,
          failedAt: String(failedAt),
          jobName: data?.jobName || 'unknown',
          attemptsMade: typeof data?.attemptsMade === 'number' ? data.attemptsMade : 0,
        }
      })
      .filter((row) => row.id.length > 0)
  }

  async requeueDeadLetter(
    key: QueueConfigKey,
    dlqJobId: string | number,
  ): Promise<{ requeued: boolean; newJobId?: string | number }> {
    const dlq = this.deadLetterQueues.get(key)
    const queue = this.queues.get(key)
    if (!dlq || !queue) return { requeued: false }
    const job = await dlq.getJob(String(dlqJobId))
    if (!job) return { requeued: false }
    const payload = job.data as DeadLetterJobPayload
    try {
      const added = await queue.add(payload.jobName || 'requeued-job', payload.data, {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 1,
        priority: 1,
      })
      await job.remove()
      return { requeued: true, newJobId: added.id }
    } catch (e) {
      logger.warn('Failed to requeue DLQ job', {
        queue: queue.name,
        dlqJobId,
        error: e instanceof Error ? e.message : e,
      })
      return { requeued: false }
    }
  }

  private requireQueue(name: QueueConfigKey): Queue {
    const queue = this.queues.get(name)
    if (!queue) {
      throw new Error(`Queue ${name} not found. Make sure initialize() was called first.`)
    }
    return queue
  }

  // Return untyped queue here because the game-actions queue can carry
  // multiple job payload shapes (e.g., process-game-action, execute-ai-turn).
  // Call sites that add strongly-typed jobs should validate their own payloads.
  getGameActionQueue(): Queue {
    return this.requireQueue('gameActions') as Queue
  }

  getCleanupQueue(): Queue<GameCleanupJob> {
    return this.requireQueue('gameCleanup') as Queue<GameCleanupJob>
  }

  getAnalyticsQueue(): Queue {
    return this.requireQueue('analyticsEvents') as Queue
  }

  getMaintenanceQueue(): Queue {
    return this.requireQueue('maintenance') as Queue
  }

  getMapAssetQueue(): Queue {
    return this.requireQueue('mapAssets') as Queue
  }
}

// Export singleton instance
export const queueService = new QueueService()
