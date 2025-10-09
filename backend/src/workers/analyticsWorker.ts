import { type Job, Worker } from 'bullmq'
import { GameService } from '../services/gameService'
import { queueService } from '../services/queueService'
import { startWorkerHeartbeat } from '../services/workerHeartbeat'
import { logger } from '../utils/logger'

type AnalyticsJob = {
  event: 'append_log' | 'append_turn_stats'
  gameId: string
  data: unknown
}

export class AnalyticsWorker {
  private worker: Worker | null = null
  private gameService: GameService

  constructor() {
    this.gameService = new GameService()
  }

  async initialize(): Promise<void> {
    const queueName = queueService.getAnalyticsQueue().name

    this.worker = new Worker(
      queueName,
      async (job: Job<AnalyticsJob>) => {
        const { event, gameId, data } = job.data
        try {
          if (event === 'append_log') {
            const entries = Array.isArray(data) ? (data as unknown[]) : []
            await this.gameService.appendLog(
              gameId,
              entries as Parameters<GameService['appendLog']>[1],
            )
          } else if (event === 'append_turn_stats') {
            await this.gameService.appendTurnStats(
              gameId,
              data as Parameters<GameService['appendTurnStats']>[1],
            )
          } else {
            logger.warn('Unknown analytics event', { event })
          }
        } catch (error) {
          logger.warn('Failed to process analytics-event', {
            event,
            gameId,
            error: error instanceof Error ? error.message : error,
          })
          throw error
        }
      },
      {
        concurrency: 5,
        // Prefer using the Redis client instance
        connection: ((await import('../config/redis')).getRedisClient() ??
          ({} as unknown)) as unknown as import('bullmq').ConnectionOptions,
      },
    )

    this.worker.on('completed', (job) => {
      logger.debug('📈 Analytics job completed', { jobId: job.id })
    })

    this.worker.on('failed', (job, error) => {
      logger.warn('📉 Analytics job failed', {
        jobId: job?.id,
        error: error instanceof Error ? error.message : error,
      })
    })

    startWorkerHeartbeat(queueName)

    logger.info('✅ AnalyticsWorker initialized')
  }
}

export const createAnalyticsWorker = () => new AnalyticsWorker()
