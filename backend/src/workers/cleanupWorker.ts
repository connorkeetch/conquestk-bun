import Bull from 'bull'
import { GameCleanupJob, queueService } from '../services/queueService'
import { GameService } from '../services/gameService'
import { CacheService } from '../services/cacheService'
// TODO: Fix import when territoryModifierService is implemented
// import { TerritoryModifierService } from '../services/territoryModifierService'

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
      console.log(`🧹 Game cleanup completed: ${job.id}`)
    })

    this.queue.on('failed', (job, error) => {
      console.error(`❌ Game cleanup failed: ${job.id}`, error)
    })

    // Schedule periodic cleanup for abandoned games
    setInterval(() => this.scheduleAbandonedGameCleanup(), 5 * 60 * 1000) // Every 5 minutes

    console.log('✅ CleanupWorker initialized')
  }

  private async cleanupGame(jobData: GameCleanupJob): Promise<any> {
    const { gameId, reason } = jobData

    try {
      console.log(`🧹 Cleaning up game ${gameId}, reason: ${reason}`)

      // Get game state before cleanup
      const gameState = await this.gameService.getGameState(gameId)
      if (!gameState) {
        console.log(`Game ${gameId} already cleaned up`)
        return { success: true, alreadyClean: true }
      }

      // Perform cleanup based on reason
      switch (reason) {
        case 'finished':
          await this.cleanupFinishedGame(gameId, gameState)
          break
          
        case 'timeout':
          await this.cleanupTimedOutGame(gameId, gameState)
          break
          
        case 'abandoned':
          await this.cleanupAbandonedGame(gameId, gameState)
          break
          
        default:
          console.warn(`Unknown cleanup reason: ${reason}`)
      }

      // Common cleanup tasks
      await this.performCommonCleanup(gameId)

      console.log(`✅ Game ${gameId} cleanup completed`)
      return { 
        success: true, 
        reason, 
        cleanedAt: new Date().toISOString(),
      }

    } catch (error) {
      console.error(`❌ Failed to cleanup game ${gameId}:`, error)
      throw error
    }
  }

  private async cleanupFinishedGame(gameId: string, gameState: any): Promise<void> {
    // Archive game results
    await this.gameService.archiveGameResults(gameId, {
      winner: gameState.winner,
      endReason: 'finished',
      duration: Date.now() - gameState.startTime,
      playerStats: this.calculatePlayerStats(gameState),
    })

    // Update player ELO ratings if ranked
    if (gameState.isRanked) {
      await this.gameService.updateEloRatings(gameId, gameState)
    }

    // Record game history
    await this.gameService.recordGameHistory(gameId, gameState)
  }

  private async cleanupTimedOutGame(gameId: string, gameState: any): Promise<void> {
    // Determine winner based on territories controlled
    const territoryCount = this.countTerritoriesByPlayer(gameState.board)
    const winner = Object.entries(territoryCount)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0][0]

    await this.gameService.archiveGameResults(gameId, {
      winner,
      endReason: 'timeout',
      duration: Date.now() - gameState.startTime,
      playerStats: this.calculatePlayerStats(gameState),
    })

    // Partial ELO updates for timeout
    if (gameState.isRanked) {
      await this.gameService.updateEloRatings(gameId, { 
        ...gameState, 
        winner,
        isTimeout: true,
      })
    }
  }

  private async cleanupAbandonedGame(gameId: string, gameState: any): Promise<void> {
    // Mark as abandoned - no winner
    await this.gameService.archiveGameResults(gameId, {
      winner: null,
      endReason: 'abandoned',
      duration: Date.now() - gameState.startTime,
      playerStats: this.calculatePlayerStats(gameState),
    })

    // No ELO changes for abandoned games
    console.log(`Game ${gameId} marked as abandoned - no ELO changes`)
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
    console.log(`Cleaned temp resources for game ${gameId}`)
  }

  private calculatePlayerStats(gameState: any): Record<string, any> {
    const stats: Record<string, any> = {}
    
    for (const player of gameState.players) {
      const territories = gameState.board.filter((t: any) => t.owner === player.id)
      const totalArmies = territories.reduce((sum: number, t: any) => sum + t.armies, 0)
      
      stats[player.id] = {
        territoriesControlled: territories.length,
        totalArmies,
        turnsPlayed: player.turnsPlayed || 0,
        eliminated: territories.length === 0,
      }
    }
    
    return stats
  }

  private countTerritoriesByPlayer(board: any[]): Record<string, number> {
    const counts: Record<string, number> = {}
    
    for (const territory of board) {
      counts[territory.owner] = (counts[territory.owner] || 0) + 1
    }
    
    return counts
  }

  private async scheduleAbandonedGameCleanup(): Promise<void> {
    try {
      // Find games that haven't been updated in over 30 minutes
      const abandonedGames = await this.gameService.findAbandonedGames(30 * 60 * 1000)
      
      for (const gameId of abandonedGames) {
        console.log(`📅 Scheduling cleanup for abandoned game: ${gameId}`)
        await queueService.addGameCleanup({
          gameId,
          reason: 'abandoned',
        })
      }
      
      if (abandonedGames.length > 0) {
        console.log(`📅 Scheduled cleanup for ${abandonedGames.length} abandoned games`)
      }
    } catch (error) {
      console.error('❌ Failed to schedule abandoned game cleanup:', error)
    }
  }
}

// Export factory function
export const createCleanupWorker = () => new CleanupWorker()