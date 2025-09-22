import type Bull from 'bull'
import { CacheService } from '../services/cacheService'
import { GameService } from '../services/gameService'
import { jobIdempotencyService } from '../services/jobIdempotencyService'
import type { JobIdempotencyService } from '../services/jobIdempotencyService'
import { type GameCleanupJob, queueService } from '../services/queueService'
import territoryModifierService from '../services/territoryModifierService'
import type { GameState } from '../types/game'
import { logger } from '../utils/logger'

interface CleanupMetadata {
  winner?: string | null
  isRanked?: boolean
  startTime?: number | string | Date
}

type CleanupGameState = Omit<GameState, 'players' | 'board'> &
  CleanupMetadata & {
    players: Array<GameState['players'][number] & { turnsPlayed?: number }>
    board: Array<GameState['board'][number] & { owner?: string | null }>
  }

interface CleanupResult {
  success: true
  alreadyClean?: true
  reason?: GameCleanupJob['reason']
  cleanedAt?: string
}

interface PlayerStatsSnapshot {
  territoriesControlled: number
  totalArmies: number
  turnsPlayed: number
  eliminated: boolean
}

type CleanupWorkerDependencies = {
  gameService?: GameService
  cacheService?: CacheService
  queue?: Bull.Queue<GameCleanupJob>
  idempotencyService?: JobIdempotencyService
}

export class CleanupWorker {
  private queue: Bull.Queue<GameCleanupJob>
  private gameService: GameService
  private cacheService: CacheService
  private idempotencyService: JobIdempotencyService

  constructor(dependencies: CleanupWorkerDependencies = {}) {
    this.gameService = dependencies.gameService ?? new GameService()
    this.cacheService = dependencies.cacheService ?? new CacheService()
    this.queue = dependencies.queue ?? queueService.getCleanupQueue()
    this.idempotencyService = dependencies.idempotencyService ?? jobIdempotencyService
  }

  async initialize(): Promise<void> {
    // Process cleanup jobs
    this.queue.process('cleanup-game', 2, async (job: Bull.Job<GameCleanupJob>) => {
      return this.cleanupGame(job)
    })

    // Job event handlers
    this.queue.on('completed', (job, result) => {
      logger.info('🧹 Game cleanup job completed', {
        jobId: job.id,
        result,
      })
    })

    this.queue.on('failed', (job, error) => {
      logger.error('❌ Game cleanup job failed', {
        jobId: job.id,
        error,
      })
    })

    // Schedule periodic cleanup for abandoned games
    setInterval(() => this.scheduleAbandonedGameCleanup(), 5 * 60 * 1000) // Every 5 minutes

    logger.info('✅ CleanupWorker initialized')
  }

  private async cleanupGame(job: Bull.Job<GameCleanupJob>): Promise<CleanupResult> {
    const { gameId, reason, idempotencyKey } = job.data
    const idKey = idempotencyKey ?? (job.id !== undefined ? String(job.id) : gameId)

    const existing = await this.idempotencyService.getProcessedJob<CleanupResult>(
      this.queue.name,
      idKey,
    )
    if (existing.exists && existing.value) {
      logger.info('♻️ Skipping already processed cleanup job', {
        jobId: job.id,
        gameId,
      })
      return existing.value
    }

    try {
      logger.info('🧹 Cleaning up game', { gameId, reason })

      // Get game state before cleanup
      const gameState = await this.gameService.getGameState(gameId)
      if (!gameState) {
        logger.info('Cleanup skipped because game state already absent', { gameId })
        const result: CleanupResult = { success: true, alreadyClean: true }
        await this.idempotencyService.markProcessedJob(
          this.queue.name,
          idKey,
          result,
          24 * 60 * 60,
        )
        return result
      }

      const cleanupState: CleanupGameState = gameState

      // Perform cleanup based on reason
      switch (reason) {
        case 'finished':
          await this.cleanupFinishedGame(gameId, cleanupState)
          break

        case 'timeout':
          await this.cleanupTimedOutGame(gameId, cleanupState)
          break

        case 'abandoned':
          await this.cleanupAbandonedGame(gameId, cleanupState)
          break

        default:
          logger.warn('Unknown cleanup reason received', { gameId, reason })
      }

      // Common cleanup tasks
      await this.performCommonCleanup(gameId)

      logger.info('✅ Game cleanup completed', { gameId, reason })
      const result: CleanupResult = {
        success: true,
        reason,
        cleanedAt: new Date().toISOString(),
      }
      await this.idempotencyService.markProcessedJob(
        this.queue.name,
        idKey,
        result,
        24 * 60 * 60,
      )
      return result
    } catch (error) {
      logger.error('❌ Failed to cleanup game', {
        gameId,
        reason,
        error,
      })
      await this.idempotencyService.clearProcessedJob(this.queue.name, idKey).catch((cleanupError) => {
        logger.warn('Failed to clear idempotency state after cleanup failure', {
          gameId,
          error: cleanupError,
        })
      })
      throw error
    }
  }

  private async cleanupFinishedGame(gameId: string, gameState: CleanupGameState): Promise<void> {
    // Archive game results
    const duration = this.getGameDuration(gameState)
    const winnerId = 'winner' in gameState ? gameState.winner ?? null : null
    await this.gameService.archiveGameResults(gameId, {
      winner: winnerId,
      endReason: 'finished',
      duration: duration ?? 0,
      playerStats: this.calculatePlayerStats(gameState),
    })

    // Update player ELO ratings if ranked
    if (gameState.isRanked) {
      await this.gameService.updateEloRatings(gameId, gameState)
    }

    // Record game history
    await this.gameService.recordGameHistory(gameId, gameState)
  }

  private async cleanupTimedOutGame(gameId: string, gameState: CleanupGameState): Promise<void> {
    // Determine winner based on territories controlled
    const territoryCount = this.countTerritoriesByPlayer(gameState.board)
    const [leadingEntry] = Object.entries(territoryCount).sort(([, a], [, b]) => b - a)
    const winner = leadingEntry?.[0] ?? null

    const duration = this.getGameDuration(gameState)
    await this.gameService.archiveGameResults(gameId, {
      winner,
      endReason: 'timeout',
      duration: duration ?? 0,
      playerStats: this.calculatePlayerStats(gameState),
    })

    // Partial ELO updates for timeout
    if (gameState.isRanked && winner) {
      await this.gameService.updateEloRatings(gameId, {
        ...gameState,
        winner,
        isTimeout: true,
      })
    }
  }

  private async cleanupAbandonedGame(gameId: string, gameState: CleanupGameState): Promise<void> {
    // Mark as abandoned - no winner
    const duration = this.getGameDuration(gameState)
    await this.gameService.archiveGameResults(gameId, {
      winner: null,
      endReason: 'abandoned',
      duration: duration ?? 0,
      playerStats: this.calculatePlayerStats(gameState),
    })

    // No ELO changes for abandoned games
    logger.info('Game marked as abandoned without ELO changes', { gameId })
  }

  private async performCommonCleanup(gameId: string): Promise<void> {
    // Clean up Redis cache
    await this.cacheService.deleteGameState(gameId)

    // Clean up territory modifiers
    try {
      await territoryModifierService.cleanupFinishedGameModifiers([gameId])
    } catch (error) {
      logger.warn('Failed to clean up territory modifiers for game', {
        gameId,
        error,
      })
    }

    // Clean up any temporary files or resources
    await this.cleanupTempResources(gameId)

    // Remove from active games tracking
    await this.gameService.removeFromActiveGames(gameId)
  }

  private async cleanupTempResources(gameId: string): Promise<void> {
    // Clean up any temporary files, logs, or other resources
    // This could include battle logs, chat history, etc.
    // Implementation depends on what temporary resources you create
    logger.debug('Cleaned temporary resources for game', { gameId })
  }

  private calculatePlayerStats(gameState: CleanupGameState): Record<string, PlayerStatsSnapshot> {
    const stats: Record<string, PlayerStatsSnapshot> = {}

    for (const player of gameState.players) {
      const territories = gameState.board.filter(
        (territory) => this.getTerritoryOwnerId(territory) === player.id,
      )
      const totalArmies = territories.reduce((sum, territory) => sum + territory.armies, 0)
      const turnsPlayedRaw = (player as { turnsPlayed?: unknown }).turnsPlayed
      const turnsPlayed = typeof turnsPlayedRaw === 'number' ? turnsPlayedRaw : 0

      stats[player.id] = {
        territoriesControlled: territories.length,
        totalArmies,
        turnsPlayed,
        eliminated: territories.length === 0,
      }
    }

    return stats
  }

  private countTerritoriesByPlayer(board: CleanupGameState['board']): Record<string, number> {
    const counts: Record<string, number> = {}

    for (const territory of board) {
      const ownerId = this.getTerritoryOwnerId(territory)
      if (!ownerId) {
        continue
      }
      counts[ownerId] = (counts[ownerId] || 0) + 1
    }

    return counts
  }

  private getTerritoryOwnerId(territory: CleanupGameState['board'][number]): string | null {
    if (typeof territory.owner === 'string' && territory.owner.length > 0) {
      return territory.owner
    }
    return territory.ownerId ?? null
  }

  private getGameDuration(gameState: CleanupGameState): number | undefined {
    const { startTime } = gameState
    if (!startTime) {
      return undefined
    }

    if (typeof startTime === 'number') {
      return Date.now() - startTime
    }

    if (startTime instanceof Date) {
      return Date.now() - startTime.getTime()
    }

    const parsed = Date.parse(startTime)
    if (!Number.isNaN(parsed)) {
      return Date.now() - parsed
    }

    return undefined
  }

  private async scheduleAbandonedGameCleanup(): Promise<void> {
    try {
      // Find games that haven't been updated in over 30 minutes
      const abandonedGames = await this.gameService.findAbandonedGames(30 * 60 * 1000)

      for (const gameId of abandonedGames) {
        logger.info('📅 Scheduling cleanup for abandoned game', { gameId })
        await queueService.addGameCleanup({
          gameId,
          reason: 'abandoned',
        })
      }

      if (abandonedGames.length > 0) {
        logger.info('📅 Scheduled cleanup for abandoned games', {
          count: abandonedGames.length,
        })
      }
    } catch (error) {
      logger.error('❌ Failed to schedule abandoned game cleanup', { error })
    }
  }
}

// Export factory function
export const createCleanupWorker = () => new CleanupWorker()
