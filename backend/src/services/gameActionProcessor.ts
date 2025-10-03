import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { logger } from '../utils/logger'
import { DeltaEmitter } from './deltaEmitter'
import { GameService } from './gameService'
import { queueService } from './queueService'

/**
 * Unified game action processor
 * Single code path for all game actions - handles queue vs inline internally
 */
export class GameActionProcessor {
  private gameService: GameService
  private deltaEmitter: DeltaEmitter

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io
    this.gameService = new GameService()
    this.deltaEmitter = new DeltaEmitter(io)
  }

  /**
   * Process a deployment action
   * Attempts to queue, falls back to inline if no workers
   */
  async processDeployment(
    gameId: string,
    playerId: string,
    territoryId: string,
    armies: number,
    socketId?: string,
  ): Promise<void> {
    // Try to queue the action
    const job = await queueService.addGameAction({
      gameId,
      playerId,
      action: {
        type: 'deploy',
        roomId: gameId,
        playerId,
        payload: { territoryId, armies },
      },
      socketId,
    })

    // If queued successfully and workers are available, let worker handle it
    if (job) {
      const hasWorkers = await queueService.hasActiveWorkers('gameActions')
      if (hasWorkers) {
        logger.info('Queued deployment action for worker processing', {
          gameId,
          jobId: job.id,
          territoryId,
          armies,
        })
        return
      }

      // No workers available - remove job and process inline
      try {
        await job.remove()
      } catch (err) {
        logger.warn('Failed to remove queued job for inline fallback', {
          gameId,
          jobId: job.id,
          error: err instanceof Error ? err.message : err,
        })
      }
    }

    // Process inline and emit deltas
    await this.processDeploymentInline(gameId, playerId, territoryId, armies)
  }

  /**
   * Process deployment inline (synchronously)
   */
  private async processDeploymentInline(
    gameId: string,
    playerId: string,
    territoryId: string,
    armies: number,
  ): Promise<void> {
    logger.info('Processing deployment inline (no queue)', {
      gameId,
      playerId,
      territoryId,
      armies,
    })

    const result = await this.gameService.processPlaceArmies(gameId, {
      territoryId,
      armies,
      playerId,
    })

    await this.deltaEmitter.emitDeploymentDeltas(gameId, playerId, territoryId, result)
  }

  /**
   * Process a fortify action
   * Attempts to queue, falls back to inline if no workers
   */
  async processFortify(
    gameId: string,
    playerId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
    socketId?: string,
  ): Promise<void> {
    // Try to queue the action
    const job = await queueService.addGameAction({
      gameId,
      playerId,
      action: {
        type: 'fortify',
        roomId: gameId,
        playerId,
        payload: { fromTerritoryId, toTerritoryId, armies },
      },
      socketId,
    })

    // If queued successfully and workers are available, let worker handle it
    if (job) {
      const hasWorkers = await queueService.hasActiveWorkers('gameActions')
      if (hasWorkers) {
        logger.info('Queued fortify action for worker processing', {
          gameId,
          jobId: job.id,
          fromTerritoryId,
          toTerritoryId,
          armies,
        })
        return
      }

      // No workers available - remove job and process inline
      try {
        await job.remove()
      } catch (err) {
        logger.warn('Failed to remove queued job for inline fallback', {
          gameId,
          jobId: job.id,
          error: err instanceof Error ? err.message : err,
        })
      }
    }

    // Process inline and emit deltas
    await this.processFortifyInline(gameId, playerId, fromTerritoryId, toTerritoryId, armies)
  }

  /**
   * Process fortify inline (synchronously)
   */
  private async processFortifyInline(
    gameId: string,
    playerId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
  ): Promise<void> {
    logger.info('Processing fortify inline (no queue)', {
      gameId,
      playerId,
      fromTerritoryId,
      toTerritoryId,
      armies,
    })

    const result = await this.gameService.processFortify(gameId, {
      fromTerritoryId,
      toTerritoryId,
      armies,
      playerId,
    })

    await this.deltaEmitter.emitFortifyDeltas(gameId, fromTerritoryId, toTerritoryId, result)
  }

  /**
   * Process a go-back-to-reinforcement action
   * Attempts to queue, falls back to inline if no workers
   */
  async processGoBack(gameId: string, playerId: string, socketId?: string): Promise<void> {
    // Try to queue the action
    const job = await queueService.addGameAction({
      gameId,
      playerId,
      action: {
        type: 'go_back_to_reinforcement',
        roomId: gameId,
        playerId,
      },
      socketId,
    })

    // If queued successfully and workers are available, let worker handle it
    if (job) {
      const hasWorkers = await queueService.hasActiveWorkers('gameActions')
      if (hasWorkers) {
        logger.info('Queued go-back action for worker processing', {
          gameId,
          jobId: job.id,
        })
        return
      }

      // No workers available - remove job and process inline
      try {
        await job.remove()
      } catch (err) {
        logger.warn('Failed to remove queued job for inline fallback', {
          gameId,
          jobId: job.id,
          error: err instanceof Error ? err.message : err,
        })
      }
    }

    // Process inline and emit deltas
    await this.processGoBackInline(gameId, playerId)
  }

  /**
   * Process go-back inline (synchronously)
   */
  private async processGoBackInline(gameId: string, playerId: string): Promise<void> {
    logger.info('Processing go-back inline (no queue)', {
      gameId,
      playerId,
    })

    const result = await this.gameService.processGoBackToReinforcement(gameId, playerId)

    // Emit single phase change delta (no nested complexity)
    await this.deltaEmitter.emitPhaseChange(gameId, result)
  }

  /**
   * Get the delta emitter for use by workers
   */
  getDeltaEmitter(): DeltaEmitter {
    return this.deltaEmitter
  }
}
