import Bull from 'bull'
import { GameActionJob, queueService } from '@/services/queueService'
import { gameService } from '@/services/GameService'
import { GameDelta, DeltaBuilder } from '@/types/deltaUpdates'
import { io } from '@/socket'

export class GameActionWorker {
  private queue: Bull.Queue<GameActionJob>

  constructor() {
    // Get the queue from the service
    this.queue = (queueService as any).queues.get('gameActions')
    if (!this.queue) {
      throw new Error('Game actions queue not available')
    }
  }

  async initialize(): Promise<void> {
    // Process game action jobs
    this.queue.process('process-game-action', 10, async (job: Bull.Job<GameActionJob>) => {
      return this.processGameAction(job.data)
    })

    // Job event handlers
    this.queue.on('completed', (job, result) => {
      console.log(`✅ Game action completed: ${job.id}`, result)
    })

    this.queue.on('failed', (job, error) => {
      console.error(`❌ Game action failed: ${job.id}`, error)
    })

    this.queue.on('stalled', (job) => {
      console.warn(`⚠️ Game action stalled: ${job.id}`)
    })

    console.log('✅ GameActionWorker initialized')
  }

  private async processGameAction(jobData: GameActionJob): Promise<any> {
    const { gameId, playerId, action, socketId } = jobData
    
    try {
      console.log(`🎮 Processing game action: ${action.type} for game ${gameId}`)
      
      // Get current game state
      const currentState = await gameService.getGameState(gameId)
      if (!currentState) {
        throw new Error(`Game ${gameId} not found`)
      }

      // Validate player can perform action
      if (!this.canPlayerPerformAction(currentState, playerId, action)) {
        throw new Error(`Player ${playerId} cannot perform action ${action.type}`)
      }

      let delta: GameDelta | null = null
      let shouldBroadcast = true

      // Process different action types
      switch (action.type) {
        case 'PLACE_ARMIES':
          delta = await this.processPlaceArmies(gameId, playerId, action)
          break
          
        case 'ATTACK':
          // For attacks, we queue a battle simulation
          const battleJob = {
            gameId,
            attackingTerritory: action.fromTerritory,
            defendingTerritory: action.toTerritory,
            attackingArmies: action.armies || 1,
            defendingArmies: currentState.board.find(t => t.id === action.toTerritory)?.armies || 1,
            playerId,
          }
          
          await queueService.addBattleSimulation(battleJob)
          
          // Don't broadcast immediately for attacks - wait for battle result
          shouldBroadcast = false
          break
          
        case 'FORTIFY':
          delta = await this.processFortify(gameId, playerId, action)
          break
          
        case 'END_TURN':
          delta = await this.processEndTurn(gameId, playerId)
          break
          
        case 'PHASE_CHANGE':
          delta = await this.processPhaseChange(gameId, playerId, action)
          break
          
        case 'CHAT_MESSAGE':
          // Chat messages are processed immediately and don't affect game state
          shouldBroadcast = true
          delta = null
          break
          
        default:
          throw new Error(`Unknown action type: ${action.type}`)
      }

      // Broadcast delta update if needed
      if (shouldBroadcast && delta) {
        io.to(`game:${gameId}`).emit('game:delta', delta)
      }

      // For chat messages, emit directly
      if (action.type === 'CHAT_MESSAGE') {
        io.to(`game:${gameId}`).emit('game:chat', {
          playerId,
          message: action.message,
          timestamp: Date.now(),
        })
      }

      return { 
        success: true, 
        delta: delta || null,
        processed: true,
      }

    } catch (error) {
      console.error(`❌ Failed to process game action:`, error)
      
      // Emit error to specific socket if available
      if (socketId) {
        io.to(socketId).emit('error', { 
          message: (error as Error).message,
          action: action.type,
        })
      }
      
      throw error
    }
  }

  private canPlayerPerformAction(gameState: any, playerId: string, action: any): boolean {
    // Basic validation - extend as needed
    if (!gameState.players.find((p: any) => p.id === playerId)) {
      return false
    }

    // Check if it's player's turn for turn-based actions
    const turnBasedActions = ['PLACE_ARMIES', 'ATTACK', 'FORTIFY', 'END_TURN']
    if (turnBasedActions.includes(action.type)) {
      return gameState.currentPlayer === playerId
    }

    return true
  }

  private async processPlaceArmies(gameId: string, playerId: string, action: any): Promise<GameDelta> {
    // Update territory armies
    const newArmyCount = await gameService.processPlaceArmies(gameId, {
      territoryId: action.territoryId,
      armies: action.armies,
      playerId,
    })

    return DeltaBuilder.territoryUpdate(gameId, action.territoryId, {
      armies: newArmyCount,
    })
  }

  private async processFortify(gameId: string, playerId: string, action: any): Promise<GameDelta> {
    // Process fortification
    const result = await gameService.processFortify(gameId, {
      fromTerritoryId: action.fromTerritory,
      toTerritoryId: action.toTerritory,
      armies: action.armies,
      playerId,
    })

    // Return compound delta for both territories
    return {
      type: 'COMPOUND',
      gameId,
      timestamp: Date.now(),
      changes: [
        DeltaBuilder.territoryUpdate(gameId, action.fromTerritory, {
          armies: result.fromArmies,
        }),
        DeltaBuilder.territoryUpdate(gameId, action.toTerritory, {
          armies: result.toArmies,
        }),
      ],
    }
  }

  private async processEndTurn(gameId: string, playerId: string): Promise<GameDelta> {
    const nextPlayer = await gameService.processEndTurn(gameId, playerId)
    
    return DeltaBuilder.phaseChange(gameId, 'PLACE_ARMIES', nextPlayer.id)
  }

  private async processPhaseChange(gameId: string, playerId: string, action: any): Promise<GameDelta> {
    await gameService.processPhaseChange(gameId, playerId, action.phase)
    
    return DeltaBuilder.phaseChange(gameId, action.phase, playerId)
  }
}

// Export singleton instance
export const gameActionWorker = new GameActionWorker()