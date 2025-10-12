import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'
import { DeltaEmitter } from './deltaEmitter.js'
import { GameService } from './gameService.js'
import { queueService } from './queueService.js'

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
  ): Promise<{ mode: 'queued' | 'inline'; result?: import('./deltaEmitter.js').ActionResult }> {
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
  ): Promise<import('./deltaEmitter.js').ActionResult> {
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
   * Process post-conquest transfer (during attack phase)
   */
  async processTransferConquest(
    gameId: string,
    playerId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies: number,
    socketId?: string,
  ): Promise<void> {
    const job = await queueService.addGameAction({
      gameId,
      playerId,
      action: {
        type: 'transfer_conquest',
        roomId: gameId,
        playerId,
        payload: { fromTerritoryId, toTerritoryId, armies },
      } as unknown as import('../types/game.js').TransferConquestAction,
      socketId,
    })

    if (job) {
      const hasWorkers = await queueService.hasActiveWorkers('gameActions')
      if (hasWorkers) {
        logger.info('Queued transfer_conquest for worker processing', {
          gameId,
          jobId: job.id,
          fromTerritoryId,
          toTerritoryId,
          armies,
        })
        return
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

    // Inline fallback: use GameService and emit deltas
    const result = await this.gameService.transferConquestArmies(
      gameId,
      playerId,
      fromTerritoryId,
      toTerritoryId,
      armies,
    )

    // Emit pair of territory updates (no snapshot)
    try {
      const { DeltaBuilder } = await import('../types/deltaUpdates.js')
      const { emitFogFilteredDelta } = await import('./fogService.js')
      await emitFogFilteredDelta(
        this.io as unknown as Server,
        gameId,
        DeltaBuilder.territoryUpdate(
          gameId,
          fromTerritoryId,
          { armies: result.fromArmies },
          result.gameState.version,
        ),
      )
      await emitFogFilteredDelta(
        this.io as unknown as Server,
        gameId,
        DeltaBuilder.territoryUpdate(
          gameId,
          toTerritoryId,
          { armies: result.toArmies },
          result.gameState.version,
        ),
      )
    } catch (e) {
      logger.debug('Failed to emit transfer_conquest deltas (inline)', {
        gameId,
        error: e instanceof Error ? e.message : e,
      })
    }
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
    const { acquireLock, releaseLock } = await import('../config/redis.js')
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
        const battleDelta: import('@conquestk/shared/types/delta').GameDelta = (
          await import('../types/deltaUpdates.js')
        ).DeltaBuilder.battleResult(
          gameId,
          last as unknown as import('@conquestk/shared/types/delta').BattleResultDelta['battleResult'],
          updated.version,
        )
        // Attach concise territory updates so clients immediately reflect armies/ownership
        // biome-ignore lint/suspicious/noExplicitAny: extending delta payload for client convenience
        ;(battleDelta as any).changes = [
          (await import('../types/deltaUpdates.js')).DeltaBuilder.territoryUpdate(
            gameId,
            last.fromTerritory.id,
            { armies: last.fromTerritory.armies },
            updated.version,
          ),
          (await import('../types/deltaUpdates.js')).DeltaBuilder.territoryUpdate(
            gameId,
            last.toTerritory.id,
            { armies: last.toTerritory.armies, ownerId: last.toTerritory.ownerId ?? undefined },
            updated.version,
          ),
        ]
        const { emitFogFilteredDelta } = await import('./fogService.js')
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

  /**
   * Process an end turn action. Queues when workers available; otherwise inline via GameService.
   */
  async processEndTurn(
    gameId: string,
    playerId: string,
    socketId?: string,
  ): Promise<{ mode: 'queued' | 'inline' }> {
    const job = await queueService.addGameAction({
      gameId,
      playerId,
      action: {
        type: 'end_turn',
        roomId: gameId,
        playerId,
      },
      socketId,
    })

    if (job) {
      const hasWorkers = await queueService.hasActiveWorkers('gameActions')
      if (hasWorkers) {
        logger.info('Queued endTurn action for worker processing', {
          gameId,
          jobId: job.id,
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

    // Inline fallback: end the turn and emit a phase change delta
    const result = await this.gameService.endTurn(gameId, playerId)
    await this.deltaEmitter.emitPhaseChange(gameId, {
      phase: result.gameState.phase,
      currentPlayer: result.gameState.currentPlayer,
      turn: result.gameState.turn,
      reinforcementArmies: result.reinforcementArmies,
      version: (result.gameState as { version?: number }).version,
    })

    // Emit treasure awarded delta first when present for UI logs
    try {
      if (result.treasureAwarded) {
        const { tryGetSocketServer } = await import('./socketRegistry.js')
        const io = tryGetSocketServer()
        if (io) {
          io.to(`game:${gameId}`).emit('game-delta', {
            type: 'TREASURE_AWARDED',
            roomId: gameId,
            timestamp: Date.now(),
            userId: playerId,
            metal: result.treasureAwarded,
          } as import('@conquestk/shared/types/delta').GameDelta)
        }
      }
    } catch {
      // best-effort
    }

    // Schedule next player's timer and potential AI turn
    try {
      const { GameLifecycleService } = await import('./gameLifecycleService.js')
      const lifecycle = new GameLifecycleService()
      await lifecycle.scheduleTurnTimeout(gameId)
      await lifecycle.scheduleAiTurn(gameId)
    } catch (e) {
      logger.warn('Failed to schedule timers after inline endTurn', {
        gameId,
        error: e instanceof Error ? e.message : e,
      })
    }

    return { mode: 'inline' }
  }
}
