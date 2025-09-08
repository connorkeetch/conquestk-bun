import Bull from 'bull'
import Redis from 'ioredis'
import { GameState, GameAction, BattleResult, GameDelta } from '@/types/game'

// Queue job types
export interface GameActionJob {
  gameId: string
  playerId: string
  action: GameAction
  socketId?: string
}

export interface BattleSimulationJob {
  gameId: string
  attackingTerritory: string
  defendingTerritory: string
  attackingArmies: number
  defendingArmies: number
  playerId: string
}

export interface GameCleanupJob {
  gameId: string
  reason: 'finished' | 'timeout' | 'abandoned'
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

export class QueueService {
  private redis: Redis
  private queues: Map<string, Bull.Queue> = new Map()
  private isInitialized = false

  constructor() {
    // Use existing Redis connection or create new one
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailure: 100,
      lazyConnect: true,
    })
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      await this.redis.connect()
      
      // Initialize all queues
      for (const [key, config] of Object.entries(QUEUE_CONFIGS)) {
        const queue = new Bull(config.name, {
          redis: this.redis.options,
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

        this.queues.set(key, queue)
        console.log(`✅ Queue initialized: ${config.name}`)
      }

      this.isInitialized = true
      console.log('✅ QueueService initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize QueueService:', error)
      throw error
    }
  }

  // Game Action Queue
  async addGameAction(job: GameActionJob): Promise<Bull.Job<GameActionJob>> {
    const queue = this.queues.get('gameActions')
    if (!queue) throw new Error('Game actions queue not initialized')

    return queue.add('process-game-action', job, {
      priority: this.getActionPriority(job.action),
      delay: 0,
    })
  }

  // Battle Simulation Queue
  async addBattleSimulation(job: BattleSimulationJob): Promise<Bull.Job<BattleSimulationJob>> {
    const queue = this.queues.get('battleSimulations')
    if (!queue) throw new Error('Battle simulations queue not initialized')

    return queue.add('simulate-battle', job, {
      priority: 5, // Medium priority
      delay: 0,
    })
  }

  // Game Cleanup Queue  
  async addGameCleanup(job: GameCleanupJob): Promise<Bull.Job<GameCleanupJob>> {
    const queue = this.queues.get('gameCleanup')
    if (!queue) throw new Error('Game cleanup queue not initialized')

    return queue.add('cleanup-game', job, {
      priority: 1, // Low priority
      delay: job.reason === 'timeout' ? 30000 : 0, // 30s delay for timeouts
    })
  }

  // Queue monitoring
  async getQueueStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {}

    for (const [key, queue] of this.queues) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ])

      stats[key] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        isPaused: await queue.isPaused(),
      }
    }

    return stats
  }

  // Priority system for game actions
  private getActionPriority(action: GameAction): number {
    switch (action.type) {
      case 'PHASE_CHANGE':
      case 'END_TURN':
        return 10 // Highest priority
      case 'ATTACK':
      case 'FORTIFY':
        return 7  // High priority
      case 'PLACE_ARMIES':
        return 5  // Medium priority
      case 'CHAT_MESSAGE':
        return 2  // Low priority
      default:
        return 5  // Default medium priority
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down QueueService...')
    
    const shutdownPromises = Array.from(this.queues.values()).map(queue =>
      queue.close()
    )
    
    await Promise.all(shutdownPromises)
    await this.redis.disconnect()
    
    console.log('✅ QueueService shutdown complete')
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const pingResult = await this.redis.ping()
      const stats = await this.getQueueStats()
      
      return {
        status: pingResult === 'PONG' ? 'healthy' : 'unhealthy',
        details: {
          redis: pingResult,
          queues: stats,
          initialized: this.isInitialized,
        },
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: (error as Error).message },
      }
    }
  }
}

// Export singleton instance
export const queueService = new QueueService()