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
  private io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, unknown>,
    { userId?: string }
  >

  constructor(
    io: Server<
      ClientToServerEvents,
      ServerToClientEvents,
      Record<string, unknown>,
      { userId?: string }
    >,
  ) {
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
    // Emit a consolidated fortify result delta for logging/UX parity with worker path
    try {
      const fortifyDelta: import('@conquestk/shared/types/delta').GameDelta = {
        type: 'FORTIFY_RESULT',
        roomId: gameId,
        timestamp: Date.now(),
        fromTerritoryId,
        toTerritoryId,
        movedArmies: armies,
        fromArmies: result.fromArmies ?? 0,
        toArmies: result.toArmies ?? 0,
        playerId,
      }
      const { emitFogFilteredDelta } = await import('./fogService.js')
      await emitFogFilteredDelta(this.io, gameId, fortifyDelta)
    } catch {
      // Non-fatal: fortify summary is best-effort
    }
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
      action: ((): import('../types/game.js').TransferConquestAction => ({
        type: 'transfer_conquest',
        roomId: gameId,
        playerId,
        payload: { fromTerritoryId, toTerritoryId, armies },
      }))(),
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
        this.io,
        gameId,
        DeltaBuilder.territoryUpdate(
          gameId,
          fromTerritoryId,
          { armies: result.fromArmies },
          result.gameState.version,
        ),
      )
      await emitFogFilteredDelta(
        this.io,
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
        const { DeltaBuilder } = await import('../types/deltaUpdates.js')
        const toPayload = (
          val: unknown,
        ): import('@conquestk/shared/types/delta').BattleResultDelta['battleResult'] | null => {
          if (!val || typeof val !== 'object') return null
          const obj = val as Record<string, unknown>
          const f = obj.fromTerritory
          const t = obj.toTerritory
          const aL = obj.attackerLosses
          const dL = obj.defenderLosses
          const aD = obj.attackerDice
          const dD = obj.defenderDice
          const c = obj.conquered
          const ok =
            typeof f === 'object' &&
            f !== null &&
            typeof (f as Record<string, unknown>).id === 'string' &&
            typeof (f as Record<string, unknown>).armies === 'number' &&
            typeof t === 'object' &&
            t !== null &&
            typeof (t as Record<string, unknown>).id === 'string' &&
            typeof (t as Record<string, unknown>).armies === 'number' &&
            Array.isArray(aD) &&
            aD.every((n) => typeof n === 'number') &&
            Array.isArray(dD) &&
            dD.every((n) => typeof n === 'number') &&
            typeof aL === 'number' &&
            typeof dL === 'number' &&
            typeof c === 'boolean'
          if (!ok) return null
          const tRec = t as Record<string, unknown>
          return {
            fromTerritory: {
              id: String((f as Record<string, unknown>).id),
              armies: Number((f as Record<string, unknown>).armies),
            },
            toTerritory: {
              id: String(tRec.id as string),
              armies: Number(tRec.armies as number),
              ...(typeof tRec.ownerId === 'string' || tRec.ownerId === null
                ? { ownerId: tRec.ownerId as string | null }
                : {}),
            },
            attackerLosses: Number(aL),
            defenderLosses: Number(dL),
            attackerDice: aD as number[],
            defenderDice: dD as number[],
            conquered: Boolean(c),
          }
        }
        const payload = toPayload(last)
        if (payload) {
          const battleDelta = DeltaBuilder.battleResult(gameId, payload, updated.version)
          const withChanges: import('@conquestk/shared/types/delta').BattleResultDelta & {
            changes?: import('@conquestk/shared/types/delta').GameDelta[]
          } = {
            ...battleDelta,
            changes: [
              DeltaBuilder.territoryUpdate(
                gameId,
                payload.fromTerritory.id,
                { armies: payload.fromTerritory.armies },
                updated.version,
              ),
              DeltaBuilder.territoryUpdate(
                gameId,
                payload.toTerritory.id,
                {
                  armies: payload.toTerritory.armies,
                  ownerId: payload.toTerritory.ownerId ?? undefined,
                },
                updated.version,
              ),
            ],
          }
          const { emitFogFilteredDelta } = await import('./fogService.js')
          await emitFogFilteredDelta(this.io, gameId, withChanges)
        }
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

    // Emit treasure awarded delta + textual card_award move when present
    try {
      if (result.treasureAwarded) {
        const { tryGetSocketServer } = await import('./socketRegistry.js')
        const io = tryGetSocketServer()
        if (io) {
          const delta: import('@conquestk/shared/types/delta').GameDelta = {
            type: 'TREASURE_AWARDED',
            roomId: gameId,
            timestamp: Date.now(),
            userId: playerId,
            metal: result.treasureAwarded,
          }
          const state = result.gameState
          const username = state?.players?.find((p) => p.id === playerId)?.username || playerId
          const move: import('./logEmitter.js').DbMove = {
            id: `${Date.now()}-award`,
            game_id: gameId,
            turn_number: state?.turn ?? 1,
            phase: state?.phase ?? 'reinforcement',
            move_type: 'card_award',
            actor_id: playerId,
            created_at: new Date(),
            payload: { actorName: username },
          }
          const { emitCombined } = await import('./realtimeEmitter.js')
          await emitCombined(
            io as unknown as import('socket.io').Server<
              import('../types/shared.js').ClientToServerEvents,
              import('../types/shared.js').ServerToClientEvents,
              Record<string, unknown>,
              { userId?: string }
            >,
            gameId,
            { deltas: [delta], moves: [move] },
            undefined,
          )
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
