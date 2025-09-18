import type { Server } from 'socket.io'
import { queueService } from '../services/queueService'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { createBattleWorker } from './battleWorker'
import { createCleanupWorker } from './cleanupWorker'
import { createGameActionWorker } from './gameActionWorker'

export class WorkerManager {
  private isInitialized = false
  private gameActionWorker: unknown
  private battleWorker: unknown
  private cleanupWorker: unknown
  private io: Server<ClientToServerEvents, ServerToClientEvents>

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      console.log('🔄 Initializing WorkerManager...')

      // Initialize queue service first
      await queueService.initialize()

      // Initialize all workers
      this.gameActionWorker = createGameActionWorker(this.io)
      this.battleWorker = createBattleWorker(this.io)
      this.cleanupWorker = createCleanupWorker()

      await Promise.all([
        this.gameActionWorker.initialize(),
        this.battleWorker.initialize(),
        this.cleanupWorker.initialize(),
      ])

      this.isInitialized = true
      console.log('✅ WorkerManager initialized successfully')

      // Log initial queue stats without failing initialization if Redis is still warming up
      try {
        const stats = await queueService.getQueueStats()
        console.log('📊 Initial queue stats:', stats)
      } catch (statsError) {
        console.warn(
          '⚠️ Unable to retrieve initial queue stats:',
          statsError instanceof Error ? statsError.message : statsError,
        )
      }
    } catch (error) {
      console.error('❌ Failed to initialize WorkerManager:', error)
      throw error
    }
  }

  async healthCheck(): Promise<{ status: string; details: unknown }> {
    try {
      const queueHealth = await queueService.healthCheck()

      return {
        status: queueHealth.status === 'healthy' && this.isInitialized ? 'healthy' : 'unhealthy',
        details: {
          workers: {
            initialized: this.isInitialized,
          },
          queues: queueHealth.details,
        },
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: (error as Error).message },
      }
    }
  }

  async getStats(): Promise<Record<string, any>> {
    const queueStats = await queueService.getQueueStats()

    return {
      initialized: this.isInitialized,
      queues: queueStats,
      timestamp: new Date().toISOString(),
    }
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down WorkerManager...')

    try {
      await queueService.shutdown()
      this.isInitialized = false
      console.log('✅ WorkerManager shutdown complete')
    } catch (error) {
      console.error('❌ Error during WorkerManager shutdown:', error)
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
