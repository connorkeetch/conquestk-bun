import { queueService } from '@/services/queueService'
import { gameActionWorker } from './gameActionWorker'
import { battleWorker } from './battleWorker'
import { cleanupWorker } from './cleanupWorker'

export class WorkerManager {
  private isInitialized = false

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      console.log('🔄 Initializing WorkerManager...')

      // Initialize queue service first
      await queueService.initialize()

      // Initialize all workers
      await Promise.all([
        gameActionWorker.initialize(),
        battleWorker.initialize(),
        cleanupWorker.initialize(),
      ])

      this.isInitialized = true
      console.log('✅ WorkerManager initialized successfully')

      // Log initial queue stats
      const stats = await queueService.getQueueStats()
      console.log('📊 Initial queue stats:', stats)

    } catch (error) {
      console.error('❌ Failed to initialize WorkerManager:', error)
      throw error
    }
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
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

// Export singleton instance
export const workerManager = new WorkerManager()