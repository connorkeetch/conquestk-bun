import type Bull from 'bull'
import { CacheService } from '../services/cacheService'
import { GameService } from '../services/gameService'
import { type GameCleanupJob, queueService } from '../services/queueService'
import type { GameState } from '../types/game'
import { logger } from '../utils/logger'

// TODO: Fix import when territoryModifierService is implemented
// import { TerritoryModifierService } from '../services/territoryModifierService'

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

export class CleanupWorker {
  private queue: Bull.Queue<GameCleanupJob>
  private gameService: GameService
  private cacheService: CacheService

  constructor() {
    this.gameService = new GameService()
    this.cacheService = new CacheService()
    this.queue = queueService.getCleanupQueue()
  }

  async initialize(): Promise<void> {
    // Process cleanup jobs
    this.queue.process('cleanup-game', 2, async (job: Bull.Job<GameCleanupJob>) => {
      return this.cleanupGame(job.data)
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

  private async cleanupGame(jobData: GameCleanupJob): Promise<CleanupResult> {
    const { gameId, reason } = jobData

    try {
      logger.info('🧹 Cleaning up game', { gameId, reason })

      // Get game state before cleanup
      const gameState = await this.gameService.getGameState(gameId)
      if (!gameState) {
        logger.info('Cleanup skipped because game state already absent', { gameId })
        return { success: true, alreadyClean: true }
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
      return {
        success: true,
        reason,
        cleanedAt: new Date().toISOString(),
      }
    } catch (error) {
      logger.error('❌ Failed to cleanup game', {
        gameId,
        reason,
        error,
      })
      throw error
    }
  }

  private async cleanupFinishedGame(gameId: string, gameState: CleanupGameState): Promise<void> {
    // Archive game results
    await this.gameService.archiveGameResults(gameId, {
      winner: gameState.winner ?? null,
      endReason: 'finished',
      duration: this.getGameDuration(gameState) ?? null,
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

    await this.gameService.archiveGameResults(gameId, {
      winner,
      endReason: 'timeout',
      duration: this.getGameDuration(gameState) ?? null,
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
    await this.gameService.archiveGameResults(gameId, {
      winner: null,
      endReason: 'abandoned',
      duration: this.getGameDuration(gameState) ?? null,
      playerStats: this.calculatePlayerStats(gameState),
    })

    // No ELO changes for abandoned games
    logger.info('Game marked as abandoned without ELO changes', { gameId })
  }

  private async performCommonCleanup(gameId: string): Promise<void> {
    // Clean up Redis cache
    await this.cacheService.deleteGameState(gameId)

    // Clean up territory modifiers
    // await territoryModifierService.cleanupFinishedGameModifiers([gameId])

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
      const turnsPlayed =
        typeof (player as { turnsPlayed?: unknown }).turnsPlayed === 'number'
          ? (player as { turnsPlayed?: number }).turnsPlayed
          : 0

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
