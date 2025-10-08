import type Bull from 'bull'
import { GameService } from '../services/gameService'
import { queueService } from '../services/queueService'
import { logger } from '../utils/logger'

type AnalyticsJob = {
  event: 'append_log' | 'append_turn_stats'
  gameId: string
  data: unknown
}

export class AnalyticsWorker {
  private queue: Bull.Queue
  private gameService: GameService

  constructor() {
    // Untyped queue acceptable (heterogeneous events)
    this.queue = queueService.getAnalyticsQueue()
    this.gameService = new GameService()
  }

  async initialize(): Promise<void> {
    this.queue.process('analytics-event', 5, async (job: Bull.Job<AnalyticsJob>) => {
      const { event, gameId, data } = job.data
      try {
        if (event === 'append_log') {
          const entries = Array.isArray(data) ? (data as any[]) : []
          await this.gameService.appendLog(gameId, entries as any)
        } else if (event === 'append_turn_stats') {
          await this.gameService.appendTurnStats(gameId, data as any)
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
    })

    this.queue.on('completed', (job) => {
      logger.debug('📈 Analytics job completed', { jobId: job.id })
    })

    this.queue.on('failed', (job, error) => {
      logger.warn('📉 Analytics job failed', {
        jobId: job.id,
        error: error instanceof Error ? error.message : error,
      })
    })

    logger.info('✅ AnalyticsWorker initialized')
  }
}

export const createAnalyticsWorker = () => new AnalyticsWorker()
