import type { GameDelta } from '@risk-game/shared/types'
import type Bull from 'bull'
import type { Server } from 'socket.io'
import { query } from '../config/database'
import { gameStateCache } from '../services/cacheService'
import { DeltaEmitter } from '../services/deltaEmitter'
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
  SerializedGameState,
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
  private deltaEmitter: DeltaEmitter
  private io: Server<ClientToServerEvents, ServerToClientEvents>

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.gameService = new GameService()
    this.deltaEmitter = new DeltaEmitter(io)
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

      // Special handling for AFK stages (grace scheduling/skip) before any validation
      if ((job.data as { afkStage?: 'start' | 'skip' }).afkStage === 'start') {
        try {
          const { GameLifecycleService } = await import('../services/gameLifecycleService')
          const lifecycle = new GameLifecycleService()
          await lifecycle.beginAfkGrace(gameId)
        } catch (e) {
          logger.warn('AFK grace start failed', {
            roomId: gameId,
            error: e instanceof Error ? e.message : e,
          })
        }
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
        return result
      }
      if ((job.data as { afkStage?: 'start' | 'skip' }).afkStage === 'skip') {
        try {
          const { GameLifecycleService } = await import('../services/gameLifecycleService')
          const lifecycle = new GameLifecycleService()
          await lifecycle.skipAfkTurn(gameId, job.data.playerId, 'auto')
        } catch (e) {
          logger.warn('AFK auto-skip failed', {
            roomId: gameId,
            error: e instanceof Error ? e.message : e,
          })
        }
        const result: ProcessGameActionResult = { success: true, delta: null, processed: true }
        await jobIdempotencyService.markProcessedJob(this.queue.name, idKey, result, 60 * 60)
        return result
      }

      // Get current game state for normal actions
      const currentState = await this.gameService.getGameState(gameId)
      if (!currentState) {
        throw new Error(`Game ${gameId} not found`)
      }

      // Validate player can perform action (non-AFK)
      if (!this.canPlayerPerformAction(currentState, playerId, action)) {
        throw new Error(`Player ${playerId} cannot perform action ${action.type}`)
      }

      let delta: GameDelta | null = null
      let shouldBroadcast = true

      // Process different action types
      switch (action.type) {
        case 'deploy':
          delta = await this.processPlaceArmies(gameId, playerId, action)
          // Record deployment move
          await this.recordMove(gameId, playerId, currentState.turn, 'deploy', action.payload)
          break

        case 'attack': {
          const attackAction = action as AttackAction
          // For attacks, we queue a battle simulation
          const attackingTerritoryState = currentState.board.find(
            (territory) => territory.id === attackAction.payload?.fromTerritoryId,
          )
          const defendingArmies =
            currentState.board.find(
              (territory) => territory.id === attackAction.payload?.toTerritoryId,
            )?.armies ?? 1
          const attackingArmiesAvailable = Math.max(0, attackingTerritoryState?.armies ?? 0)
          // Respect requested armies from client, capped by available
          const requested = (attackAction.payload as { armies?: number } | undefined)?.armies
          const attackingArmies = Math.max(
            1,
            Math.min(attackingArmiesAvailable, typeof requested === 'number' ? requested : attackingArmiesAvailable),
          )

          const battleJob: BattleSimulationJob = {
            gameId,
            attackingTerritory: attackAction.payload?.fromTerritoryId ?? '',
            defendingTerritory: attackAction.payload?.toTerritoryId ?? '',
            // Use current territory armies for dice calculation (max dice derived later)
            attackingArmies,
            defendingArmies,
            playerId,
            idempotencyKey: `${idKey}:battle:${attackAction.payload?.fromTerritoryId ?? 'unknown'}:${attackAction.payload?.toTerritoryId ?? 'unknown'}`,
          }

          await queueService.addBattleSimulation(battleJob)

          // Record attack move
          await this.recordMove(gameId, playerId, currentState.turn, 'attack', action.payload)

          // Don't broadcast immediately for attacks - wait for battle result
          shouldBroadcast = false
          break
        }

        case 'fortify':
          delta = await this.processFortify(gameId, playerId, action)
          // Record fortify move
          await this.recordMove(gameId, playerId, currentState.turn, 'fortify', action.payload)
          break

        case 'end_turn': {
          // Manual end-turn: just end immediately
          delta = await this.processEndTurn(gameId, playerId)
          // Record end turn
          await this.recordMove(gameId, playerId, currentState.turn, 'end_turn', {})
          break
        }

        case 'trade_cards': {
          // Log a lightweight move record so profile stats can aggregate trades
          try {
            const payload = (action as { payload?: { cards?: string[]; treasureSet?: unknown } })
              .payload
            const cards = Array.isArray(payload?.cards) ? payload?.cards : undefined
            const count =
              (cards?.length ?? 0) ||
              (Array.isArray(payload?.treasureSet) ? (payload?.treasureSet as unknown[]).length : 0)
            const moveData =
              cards && cards.length > 0
                ? { cards }
                : count > 0
                  ? { cardCount: count, treasureSet: payload?.treasureSet }
                  : { cardCount: 0 }

            await query(
              `
              INSERT INTO game_moves (room_id, player_id, turn_number, move_type, move_data)
              VALUES ($1, $2, $3, 'trade_cards', $4::jsonb)
            `,
              [gameId, playerId, currentState.turn, JSON.stringify(moveData)],
            )
          } catch (e) {
            // Non-fatal; trading still progresses even if analytics write fails
            logger.debug('Skipped logging trade_cards move', {
              roomId: gameId,
              playerId,
              error: e instanceof Error ? e.message : e,
            })
          }
          await this.gameService.processGameAction(action, playerId)
          const serialized = await gameStateCache.getGameState<SerializedGameState>(gameId)
          if (serialized) {
            this.io.to(`game:${gameId}`).emit('game-update', serialized)
          }
          shouldBroadcast = false
          delta = null
          break
        }
        case 'go_back_to_reinforcement': {
          const result = await this.gameService.processGoBackToReinforcement(gameId, playerId)
          // Emit phase change delta with version
          await this.deltaEmitter.emitPhaseChange(gameId, result)
          // Don't broadcast extra delta below
          shouldBroadcast = false
          break
        }

        case 'undo_fortify': {
          // Process undo fortify by delegating to the generic action path
          await this.gameService.processGameAction(
            { type: 'undo_fortify', roomId: gameId, playerId },
            playerId,
          )
          // Emit full state update since we don't have a lightweight delta
          const serialized = await gameStateCache.getGameState<SerializedGameState>(gameId)
          if (serialized) {
            this.io.to(`game:${gameId}`).emit('game-update', serialized)
          }
          // Avoid emitting an extra delta below
          shouldBroadcast = false
          break
        }

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

  private async recordMove(
    gameId: string,
    playerId: string,
    turnNumber: number,
    moveType: string,
    payload: unknown,
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO game_moves (room_id, player_id, turn_number, move_type, move_data)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [gameId, playerId, turnNumber, moveType, JSON.stringify(payload || {})],
      )
      logger.debug('Recorded game move', { gameId, playerId, turnNumber, moveType })
    } catch (error) {
      // Non-fatal: move recording is for analytics/troubleshooting
      logger.warn('Failed to record game move', {
        gameId,
        playerId,
        turnNumber,
        moveType,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  private async processPlaceArmies(
    gameId: string,
    playerId: string,
    action: DeployAction,
  ): Promise<GameDelta> {
    const territoryId = action.payload?.territoryId || ''
    const result = await this.gameService.processPlaceArmies(gameId, {
      territoryId,
      armies: action.payload?.armies || 0,
      playerId,
    })

    // Use unified delta emitter
    await this.deltaEmitter.emitDeploymentDeltas(gameId, playerId, territoryId, result)

    return DeltaBuilder.territoryUpdate(gameId, territoryId, {
      armies: result.armies,
    })
  }

  private async processFortify(
    gameId: string,
    playerId: string,
    action: FortifyAction,
  ): Promise<GameDelta> {
    const fromTerritoryId = action.payload?.fromTerritoryId || ''
    const toTerritoryId = action.payload?.toTerritoryId || ''

    // Process fortification
    const result = await this.gameService.processFortify(gameId, {
      fromTerritoryId,
      toTerritoryId,
      armies: action.payload?.armies || 0,
      playerId,
    })

    // Use unified delta emitter
    await this.deltaEmitter.emitFortifyDeltas(gameId, fromTerritoryId, toTerritoryId, result)

    // Emit a consolidated fortify result delta for logging/UX purposes
    try {
      const fortifyDelta: import('@risk-game/shared/types').GameDelta = {
        type: 'FORTIFY_RESULT',
        roomId: gameId,
        timestamp: Date.now(),
        fromTerritoryId,
        toTerritoryId,
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

    return DeltaBuilder.territoryUpdate(gameId, toTerritoryId, {
      armies: result.toArmies,
    })
  }

  private async processEndTurn(gameId: string, playerId: string): Promise<GameDelta> {
    const nextPlayer = await this.gameService.processEndTurn(gameId, playerId)

    // Schedule next AFK grace start at the end of next player's timer
    try {
      const { GameRoomService } = await import('../services/gameRoomService')
      const roomService = new GameRoomService()
      const room = await roomService.getRoomById(gameId)
      const seconds = room?.turnTimerSeconds ?? 0
      if (seconds && seconds > 0) {
        const idKey = `afk:${gameId}:turn:next:${Date.now()}`
        await queueService.addDelayedGameAction(
          {
            gameId,
            playerId: nextPlayer.id,
            action: { type: 'end_turn', playerId: nextPlayer.id, roomId: gameId },
            idempotencyKey: idKey,
            afkStage: 'start',
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
    action: Extract<GameAction, { type: 'trade_cards' | 'go_back_to_reinforcement' }>,
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
