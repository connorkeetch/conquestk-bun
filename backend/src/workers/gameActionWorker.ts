import Bull from 'bull'
import { GameActionJob, queueService } from '@/services/queueService'
import { GameService } from '@/services/gameService'
import { GameDelta, DeltaBuilder, CompoundDelta } from '@/types/deltaUpdates'
import { Server } from 'socket.io'
import type { ServerToClientEvents, ClientToServerEvents } from '@/types/shared'

export class GameActionWorker {
  private queue: Bull.Queue<GameActionJob>
  private gameService: GameService
  private io: Server<ClientToServerEvents, ServerToClientEvents>

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.gameService = new GameService()
    this.io = io
    this.queue = queueService.getGameActionQueue()
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
      const currentState = await this.gameService.getGameState(gameId)
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
        case 'deploy':
          delta = await this.processPlaceArmies(gameId, playerId, action)
          break
          
        case 'attack':
          // For attacks, we queue a battle simulation
          const battleJob = {
            gameId,
            attackingTerritory: action.payload?.fromTerritory || '',
            defendingTerritory: action.payload?.toTerritory || '',
            attackingArmies: action.payload?.armies || 1,
            defendingArmies: currentState.board.find((t: any) => t.id === action.payload?.toTerritory)?.armies || 1,
            playerId,
          }
          
          await queueService.addBattleSimulation(battleJob)
          
          // Don't broadcast immediately for attacks - wait for battle result
          shouldBroadcast = false
          break
          
        case 'fortify':
          delta = await this.processFortify(gameId, playerId, action)
          break
          
        case 'end_turn':
          delta = await this.processEndTurn(gameId, playerId)
          break
          
        case 'begin_turn':
        case 'trade_cards':
        case 'go_back_to_reinforcement':
          delta = await this.processPhaseChange(gameId, playerId, action)
          break
          
        default:
          throw new Error(`Unknown action type: ${action.type}`)
      }

      // Broadcast delta update if needed
      if (shouldBroadcast && delta) {
        this.io.to(`game:${gameId}`).emit('game-delta', delta)
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
        this.io.to(socketId).emit('error', { 
          event: 'game:action:error',
          message: (error as Error).message,
          timestamp: new Date().toISOString(),
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
    const turnBasedActions = ['deploy', 'attack', 'fortify', 'end_turn']
    if (turnBasedActions.includes(action.type)) {
      return gameState.currentPlayer === playerId
    }

    return true
  }

  private async processPlaceArmies(gameId: string, playerId: string, action: any): Promise<GameDelta> {
    // Update territory armies
    const newArmyCount = await this.gameService.processPlaceArmies(gameId, {
      territoryId: action.payload?.territoryId || '',
      armies: action.payload?.armies || 0,
      playerId,
    })

    return DeltaBuilder.territoryUpdate(gameId, action.payload?.territoryId || '', {
      armies: newArmyCount,
    })
  }

  private async processFortify(gameId: string, playerId: string, action: any): Promise<GameDelta> {
    // Process fortification
    const result = await this.gameService.processFortify(gameId, {
      fromTerritoryId: action.payload?.fromTerritory || '',
      toTerritoryId: action.payload?.toTerritory || '',
      armies: action.payload?.armies || 0,
      playerId,
    })

    // Return compound delta for both territories
    const compoundDelta: CompoundDelta = {
      type: 'COMPOUND',
      roomId: gameId,
      timestamp: Date.now(),
      changes: [
        DeltaBuilder.territoryUpdate(gameId, action.payload?.fromTerritory || '', {
          armies: result.fromArmies,
        }),
        DeltaBuilder.territoryUpdate(gameId, action.payload?.toTerritory || '', {
          armies: result.toArmies,
        }),
      ],
    }
    return compoundDelta
  }

  private async processEndTurn(gameId: string, playerId: string): Promise<GameDelta> {
    const nextPlayer = await this.gameService.processEndTurn(gameId, playerId)
    
    return DeltaBuilder.phaseChange(gameId, 'reinforcement', nextPlayer.id, 0, 0)
  }

  private async processPhaseChange(gameId: string, playerId: string, action: any): Promise<GameDelta> {
    await this.gameService.processPhaseChange(gameId, playerId, action.payload?.phase || 'reinforcement')
    
    return DeltaBuilder.phaseChange(gameId, action.payload?.phase || 'reinforcement', playerId, 0, 0)
  }
}

// Export factory function
export const createGameActionWorker = (io: Server<ClientToServerEvents, ServerToClientEvents>) => new GameActionWorker(io)