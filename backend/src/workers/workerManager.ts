import type { Server } from 'socket.io'
import { type QueueStats, queueService } from '../services/queueService'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { logger } from '../utils/logger'
import { createBattleWorker } from './battleWorker'
import { createCleanupWorker } from './cleanupWorker'
import { createGameActionWorker } from './gameActionWorker'
import { createMaintenanceWorker, type MaintenanceWorker } from './maintenanceWorker'
import { createMapAssetWorker, type MapAssetWorker } from './mapAssetWorker'

export class WorkerManager {
  private isInitialized = false
  private io: Server<ClientToServerEvents, ServerToClientEvents>
  private mapAssetWorker: MapAssetWorker | null = null
  private maintenanceWorker: MaintenanceWorker | null = null

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      logger.info('🔄 Initializing WorkerManager...')

      // Initialize queue service first
      await queueService.initialize()

      // Initialize all workers
      const gameActionWorker = createGameActionWorker(this.io)
      const battleWorker = createBattleWorker(this.io)
      const cleanupWorker = createCleanupWorker()
      const mapAssetWorker = createMapAssetWorker()
      const maintenanceWorker = createMaintenanceWorker()

      await Promise.all([
        gameActionWorker.initialize(),
        battleWorker.initialize(),
        cleanupWorker.initialize(),
        mapAssetWorker.initialize(),
        maintenanceWorker.initialize(),
      ])

      this.mapAssetWorker = mapAssetWorker
      this.maintenanceWorker = maintenanceWorker

      this.isInitialized = true
      logger.info('✅ WorkerManager initialized successfully')

      // Log initial queue stats without failing initialization if Redis is still warming up
      try {
        const stats = await queueService.getQueueStats()
        logger.info('📊 Initial queue stats:', stats)
      } catch (statsError) {
        logger.warn(
          '⚠️ Unable to retrieve initial queue stats:',
          statsError instanceof Error ? statsError.message : statsError,
        )
      }
    } catch (error) {
      logger.error('❌ Failed to initialize WorkerManager:', error)
      throw error
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy' | 'disabled'
    details: Record<string, unknown>
  }> {
    try {
      const queueHealth = await queueService.healthCheck()

      if (queueHealth.status === 'disabled') {
        return {
          status: 'disabled',
          details: {
            workers: {
              initialized: this.isInitialized,
            },
            queues: {},
          },
        }
      }

      return {
        status: queueHealth.status === 'healthy' && this.isInitialized ? 'healthy' : 'unhealthy',
        details: {
          workers: {
            initialized: this.isInitialized,
          },
          queues: queueHealth.details.queues,
        },
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: (error as Error).message },
      }
    }
  }

  async getStats(): Promise<{
    initialized: boolean
    queues: Record<string, QueueStats>
    timestamp: string
  }> {
    const queueStats = await queueService.getQueueStats()

    return {
      initialized: this.isInitialized,
      queues: queueStats,
      timestamp: new Date().toISOString(),
    }
  }

  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down WorkerManager...')

    try {
      await queueService.shutdown()
      this.mapAssetWorker?.shutdown()
      this.maintenanceWorker?.shutdown()
      this.mapAssetWorker = null
      this.maintenanceWorker = null
      this.isInitialized = false
      logger.info('✅ WorkerManager shutdown complete')
    } catch (error) {
      logger.error('❌ Error during WorkerManager shutdown:', error)
      throw error
    }
  }
}

// Export factory function
export const createWorkerManager = (io: Server<ClientToServerEvents, ServerToClientEvents>) =>
  new WorkerManager(io)

// Singleton instance (will be set by index.ts)
let workerManagerInstance: WorkerManager | null = null

export const setWorkerManagerInstance = (instance: WorkerManager) => {
  workerManagerInstance = instance
}

export const getWorkerManagerInstance = () => workerManagerInstance
