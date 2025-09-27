import type { GameDelta } from '@risk-game/shared/types'
import type Bull from 'bull'
import type { Server } from 'socket.io'
import { GameService } from '../services/gameService'
import { jobIdempotencyService } from '../services/jobIdempotencyService'
import {
  type BattleSimulationJob,
  type GameActionJob,
  queueService,
} from '../services/queueService'
import { DeltaBuilder } from '../types/deltaUpdates'
import type {
  AttackAction,
  DeployAction,
  FortifyAction,
  GameAction,
  GamePhase,
  GameState,
} from '../types/game'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { logger } from '../utils/logger'

interface ProcessGameActionResult {
  success: true
  delta: GameDelta | null
  processed: boolean
}

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
      return this.processGameAction(job)
    })

    // Job event handlers
    this.queue.on('completed', (job, result) => {
      logger.info('✅ Game action job completed', {
        jobId: job.id,
        result,
      })
    })

    this.queue.on('failed', (job, error) => {
      logger.error('❌ Game action job failed', {
        jobId: job.id,
        error,
      })
    })

    this.queue.on('stalled', (job) => {
      logger.warn('⚠️ Game action job stalled', { jobId: job.id })
    })

    logger.info('✅ GameActionWorker initialized')
  }

  private async processGameAction(job: Bull.Job<GameActionJob>): Promise<ProcessGameActionResult> {
    const { gameId, playerId, action, socketId, idempotencyKey } = job.data
    const idKey =
      idempotencyKey ??
      (job.id !== undefined ? String(job.id) : `${gameId}:${playerId}:${action.type}`)

    const cached = await jobIdempotencyService.getProcessedJob<ProcessGameActionResult>(
      this.queue.name,
      idKey,
    )
    if (cached.exists && cached.value) {
      logger.info('♻️ Skipping already processed game action job', {
        gameId,
        playerId,
        actionType: action.type,
        jobId: job.id,
      })
      return { ...cached.value, processed: false }
    }

    try {
      logger.debug('Processing game action', {
        gameId,
        playerId,
        actionType: action.type,
      })

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

        case 'attack': {
          const attackAction = action as AttackAction
          // For attacks, we queue a battle simulation
          const defendingArmies =
            currentState.board.find(
              (territory) => territory.id === attackAction.payload?.toTerritoryId,
            )?.armies ?? 1

          const battleJob: BattleSimulationJob = {
            gameId,
            attackingTerritory: attackAction.payload?.fromTerritoryId ?? '',
            defendingTerritory: attackAction.payload?.toTerritoryId ?? '',
            attackingArmies: attackAction.payload?.armies ?? 1,
            defendingArmies,
            playerId,
            idempotencyKey: `${idKey}:battle:${attackAction.payload?.fromTerritoryId ?? 'unknown'}:${attackAction.payload?.toTerritoryId ?? 'unknown'}`,
          }

          await queueService.addBattleSimulation(battleJob)

          // Don't broadcast immediately for attacks - wait for battle result
          shouldBroadcast = false
          break
        }

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

        default: {
          const _exhaustive: never = action
          throw new Error('Unknown action type received in game action worker')
        }
      }

      // Broadcast delta update if needed
      if (shouldBroadcast && delta) {
        const { emitFogFilteredDelta } = await import('../services/fogService')
        await emitFogFilteredDelta(this.io as unknown as Server, gameId, delta)
      }

      const result: ProcessGameActionResult = {
        success: true,
        delta: delta || null,
        processed: true,
      }
      await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
      return result
    } catch (error) {
      logger.error('❌ Failed to process game action', {
        gameId,
        playerId,
        actionType: action.type,
        error,
      })

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

  private canPlayerPerformAction(
    gameState: GameState,
    playerId: string,
    action: GameAction,
  ): boolean {
    // Basic validation - extend as needed
    if (!gameState.players.some((player) => player.id === playerId)) {
      return false
    }

    // Check if it's player's turn for turn-based actions
    const turnBasedActions = ['deploy', 'attack', 'fortify', 'end_turn']
    if (turnBasedActions.includes(action.type)) {
      return gameState.currentPlayer === playerId
    }

    return true
  }

  private async processPlaceArmies(
    gameId: string,
    playerId: string,
    action: DeployAction,
  ): Promise<GameDelta> {
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

  private async processFortify(
    gameId: string,
    playerId: string,
    action: FortifyAction,
  ): Promise<GameDelta> {
    // Process fortification
    const result = await this.gameService.processFortify(gameId, {
      fromTerritoryId: action.payload?.fromTerritoryId || '',
      toTerritoryId: action.payload?.toTerritoryId || '',
      armies: action.payload?.armies || 0,
      playerId,
    })

    // Emit separate territory updates to align with shared GameDelta union
    const fromDelta = DeltaBuilder.territoryUpdate(gameId, action.payload?.fromTerritoryId || '', {
      armies: result.fromArmies,
    })
    const toDelta = DeltaBuilder.territoryUpdate(gameId, action.payload?.toTerritoryId || '', {
      armies: result.toArmies,
    })

    // Broadcast first update immediately; caller will broadcast returned delta
    {
      const { emitFogFilteredDelta } = await import('../services/fogService')
      await emitFogFilteredDelta(this.io as unknown as Server, gameId, fromDelta)
    }
    // Emit a consolidated fortify result delta for logging/UX purposes
    try {
      const fortifyDelta: import('@risk-game/shared/types').GameDelta = {
        type: 'FORTIFY_RESULT',
        roomId: gameId,
        timestamp: Date.now(),
        fromTerritoryId: action.payload?.fromTerritoryId || '',
        toTerritoryId: action.payload?.toTerritoryId || '',
        movedArmies: action.payload?.armies || 0,
        fromArmies: result.fromArmies,
        toArmies: result.toArmies,
        playerId,
      }
      const { emitFogFilteredDelta } = await import('../services/fogService')
      await emitFogFilteredDelta(this.io as unknown as Server, gameId, fortifyDelta)
    } catch (_e) {
      // Non-fatal: fortify summary is best-effort
    }
    return toDelta
  }

  private async processEndTurn(gameId: string, playerId: string): Promise<GameDelta> {
    const nextPlayer = await this.gameService.processEndTurn(gameId, playerId)

    // Schedule next auto end-turn if timer configured
    try {
      const { GameRoomService } = await import('../services/gameRoomService')
      const roomService = new GameRoomService()
      const room = await roomService.getRoomById(gameId)
      const seconds = room?.turnTimerSeconds ?? 0
      if (seconds && seconds > 0) {
        const idKey = `auto-end:${gameId}:turn:next:${Date.now()}`
        await queueService.addDelayedGameAction(
          {
            gameId,
            playerId: nextPlayer.id,
            action: { type: 'end_turn', playerId: nextPlayer.id, roomId: gameId },
            idempotencyKey: idKey,
          },
          seconds * 1000,
          { idempotencyKey: idKey, priority: 10 },
        )
      }
    } catch (error) {
      logger.warn('Failed to schedule auto end-turn for next player', {
        roomId: gameId,
        error: error instanceof Error ? error.message : error,
      })
    }

    return DeltaBuilder.phaseChange(gameId, 'reinforcement', nextPlayer.id, 0, 0)
  }

  private async processPhaseChange(
    gameId: string,
    playerId: string,
    action: Extract<
      GameAction,
      { type: 'begin_turn' | 'trade_cards' | 'go_back_to_reinforcement' }
    >,
  ): Promise<GameDelta> {
    const phase = ((action as { payload?: { phase?: GamePhase } }).payload?.phase ??
      'reinforcement') as GamePhase
    await this.gameService.processPhaseChange(gameId, playerId, phase)

    return DeltaBuilder.phaseChange(gameId, phase, playerId, 0, 0)
  }
}

// Export factory function
export const createGameActionWorker = (io: Server<ClientToServerEvents, ServerToClientEvents>) =>
  new GameActionWorker(io)
