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
  private io: Server<ClientToServerEvents, ServerToClientEvents>

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.gameService = new GameService()
    this.deltaEmitter = new DeltaEmitter(io)
    this.io = io
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
  ): Promise<{ mode: 'queued' | 'inline'; result?: import('./deltaEmitter').ActionResult }> {
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
        return { mode: 'queued' }
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

    // Process inline and emit deltas + actor snapshot fallback
    const result = await this.processDeploymentInline(gameId, playerId, territoryId, armies)
    await this.deltaEmitter.emitDeploymentDeltas(gameId, playerId, territoryId, result)
    await this.deltaEmitter.emitRevealTo(gameId, playerId)
    return { mode: 'inline', result }
  }

  /**
   * Process deployment inline (synchronously)
   */
  private async processDeploymentInline(
    gameId: string,
    playerId: string,
    territoryId: string,
    armies: number,
  ): Promise<import('./deltaEmitter').ActionResult> {
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
    return result
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

  /**
   * Process an attack action. Queues when workers available; otherwise inline via GameEngine.
   */
  async processAttack(
    gameId: string,
    playerId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies?: number,
    socketId?: string,
  ): Promise<{ mode: 'queued' | 'inline' }> {
    const job = await queueService.addGameAction({
      gameId,
      playerId,
      action: {
        type: 'attack',
        roomId: gameId,
        playerId,
        payload: {
          fromTerritoryId,
          toTerritoryId,
          ...(typeof armies === 'number' ? { armies } : {}),
        },
      },
      socketId,
    })

    if (job) {
      const hasWorkers = await queueService.hasActiveWorkers('gameActions')
      if (hasWorkers) {
        logger.info('Queued attack action for worker processing', {
          gameId,
          jobId: job.id,
          fromTerritoryId,
          toTerritoryId,
          armies,
        })
        return { mode: 'queued' }
      }
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

    // Inline fallback: process through GameService/GameEngine and emit battle result delta
    // Serialize inline path too to avoid double-apply in non-queue environments
    let lockToken: string | null = null
    const { acquireLock, releaseLock } = await import('../config/redis')
    const lockKey = `lock:game-actions:${gameId}`
    const startWait = Date.now()
    lockToken = await acquireLock(lockKey, 5000)
    while (!lockToken) {
      if (Date.now() - startWait > 1500) break
      await new Promise((r) => setTimeout(r, 25))
      lockToken = await acquireLock(lockKey, 5000)
    }
    const updated = await this.gameService.processGameAction(
      {
        type: 'attack',
        roomId: gameId,
        playerId,
        payload: {
          fromTerritoryId,
          toTerritoryId,
          ...(typeof armies === 'number' ? { armies } : {}),
        },
      },
      playerId,
    )
    const last = updated.lastBattleResult
    if (last) {
      try {
        const battleDelta: import('@risk-game/shared/types').GameDelta = (
          await import('../types/deltaUpdates')
        ).DeltaBuilder.battleResult(
          gameId,
          last as unknown as import('@risk-game/shared/types').BattleResultDelta['battleResult'],
          updated.version,
        )
        // Attach concise territory updates so clients immediately reflect armies/ownership
        // biome-ignore lint/suspicious/noExplicitAny: extending delta payload for client convenience
        ;(battleDelta as any).changes = [
          (await import('../types/deltaUpdates')).DeltaBuilder.territoryUpdate(
            gameId,
            last.fromTerritory.id,
            { armies: last.fromTerritory.armies },
            updated.version,
          ),
          (await import('../types/deltaUpdates')).DeltaBuilder.territoryUpdate(
            gameId,
            last.toTerritory.id,
            { armies: last.toTerritory.armies, ownerId: last.toTerritory.ownerId ?? undefined },
            updated.version,
          ),
        ]
        const { emitFogFilteredDelta } = await import('./fogService')
        await emitFogFilteredDelta(this.io as unknown as Server, gameId, battleDelta)
      } catch (e) {
        logger.debug('Failed to emit fog-filtered battle delta in inline attack', {
          gameId,
          error: e instanceof Error ? e.message : e,
        })
      }
    }
    await this.deltaEmitter.emitRevealTo(gameId, playerId)
    if (lockToken) {
      try {
        await releaseLock(lockKey, lockToken)
      } catch {
        // best-effort
      }
    }
    return { mode: 'inline' }
  }
}
