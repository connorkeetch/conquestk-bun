import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'
import { DeltaEmitter } from './deltaEmitter.js'
import { GameService } from './gameService.js'

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
  ): Promise<import('./deltaEmitter.js').ActionResult> {
    // Process inline and emit deltas + actor snapshot fallback
    const result = await this.processDeploymentInline(gameId, playerId, territoryId, armies)
    await this.deltaEmitter.emitDeploymentDeltas(gameId, playerId, territoryId, result)
    await this.deltaEmitter.emitRevealTo(gameId, playerId)
    return result
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
  ): Promise<void> {
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

    // Co-emit deltas + textual fortify in a single sweep
    try {
      const deltas: import('@conquestk/shared/types/delta').GameDelta[] = []
      if (typeof result.fromArmies === 'number') {
        const { DeltaBuilder } = await import('../types/deltaUpdates.js')
        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, fromTerritoryId, { armies: result.fromArmies }),
        )
      }
      if (typeof result.toArmies === 'number') {
        const { DeltaBuilder } = await import('../types/deltaUpdates.js')
        deltas.push(
          DeltaBuilder.territoryUpdate(gameId, toTerritoryId, { armies: result.toArmies }),
        )
      }
      deltas.push({
        type: 'FORTIFY_RESULT',
        roomId: gameId,
        timestamp: Date.now(),
        fromTerritoryId,
        toTerritoryId,
        movedArmies: armies,
        fromArmies: Number(result.fromArmies || 0),
        toArmies: Number(result.toArmies || 0),
        playerId,
      } as import('@conquestk/shared/types/delta').FortifyResultDelta)

      // Fortify does not change phase; no PHASE_CHANGE delta here

      const updated = await this.gameService.getGameState(gameId)
      if (updated) {
        const actorName = updated.players.find((p) => p.id === playerId)?.username || playerId
        const fromT = updated.board.find((t) => t.id === fromTerritoryId)
        const toT = updated.board.find((t) => t.id === toTerritoryId)
        const move: import('./logEmitter.js').DbMove = {
          id: `${Date.now()}-fortify`,
          game_id: gameId,
          turn_number: updated.turn,
          phase: updated.phase,
          move_type: 'fortify',
          actor_id: playerId,
          created_at: new Date(),
          payload: {
            actorName,
            fromId: fromTerritoryId,
            toId: toTerritoryId,
            fromName: fromT?.name,
            toName: toT?.name,
            fromOwnerName: actorName,
            toOwnerName: actorName,
            armies,
          },
        }
        const { emitCombined } = await import('./realtimeEmitter.js')
        const { tryGetSocketServer } = await import('./socketRegistry.js')
        const io = tryGetSocketServer()
        if (io) {
          await emitCombined(
            io as unknown as import('socket.io').Server<
              import('../types/shared.js').ClientToServerEvents,
              import('../types/shared.js').ServerToClientEvents,
              Record<string, unknown>,
              { userId?: string }
            >,
            gameId,
            { deltas, moves: [move] },
            updated,
          )
        }
      }
    } catch {
      // Non-fatal: fortify combined emission is best-effort
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
  ): Promise<void> {
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
  async processGoBackToReinforcement(gameId: string, playerId: string): Promise<void> {
    // Process inline and emit deltas
    await this.processGoBackToReinforcementInline(gameId, playerId)
  }

  /**
   * Process go-back inline (synchronously)
   */
  private async processGoBackToReinforcementInline(
    gameId: string,
    playerId: string,
  ): Promise<void> {
    logger.info('Processing go-back inline (no queue)', {
      gameId,
      playerId,
    })

    const result = await this.gameService.processGoBackToReinforcement(gameId, playerId)

    // Emit single phase change delta (no nested complexity)
    await this.deltaEmitter.emitPhaseChange(gameId, result)
  }

  async processGoBackToAttack(gameId: string, playerId: string): Promise<void> {
    logger.info('Processing go-back-to-attack inline (no queue)', {
      gameId,
      playerId,
    })

    const result = await this.gameService.processGoBackToAttack(gameId, playerId)
    await this.deltaEmitter.emitPhaseChange(gameId, {
      ...result,
      reinforcementArmies: undefined,
    })
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
  ): Promise<void> {
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

          // Build textual moves for this battle and co-emit with deltas
          try {
            const { emitCombined } = await import('./realtimeEmitter.js')
            const now = new Date()
            const attacker = updated.players.find((p) => p.id === playerId)
            const actorName = attacker?.username || playerId
            const fromId = payload.fromTerritory.id
            const toId = payload.toTerritory.id
            const fromT = updated.board.find((t) => t.id === fromId)
            const toT = updated.board.find((t) => t.id === toId)
            const moves: Array<import('./logEmitter.js').DbMove> = [
              {
                id: `${now.getTime()}-atk`,
                game_id: gameId,
                turn_number: updated.turn,
                phase: updated.phase,
                move_type: 'attack',
                actor_id: playerId,
                created_at: now,
                payload: {
                  actorName,
                  fromId,
                  toId,
                  fromName: fromT?.name,
                  toName: toT?.name,
                  fromOwnerName: actorName,
                  toOwnerName: undefined,
                  kills: payload.defenderLosses,
                  losses: payload.attackerLosses,
                },
              },
            ]
            if (payload.conquered) {
              moves.push({
                id: `${now.getTime()}-conq`,
                game_id: gameId,
                turn_number: updated.turn,
                phase: updated.phase,
                move_type: 'conquer',
                actor_id: playerId,
                created_at: now,
                payload: {
                  actorName,
                  fromId,
                  toId,
                  fromName: fromT?.name,
                  toName: toT?.name,
                  fromOwnerName: actorName,
                  toOwnerName: undefined,
                },
              })
            }
            if (Array.isArray((last as { eliminatedPlayers?: unknown[] }).eliminatedPlayers)) {
              const eliminated = (last as { eliminatedPlayers?: string[] }).eliminatedPlayers ?? []
              for (const pid of eliminated) {
                const defeatedName = updated.players.find((p) => p.id === pid)?.username || pid
                moves.push({
                  id: `${now.getTime()}-elim-${pid}`,
                  game_id: gameId,
                  turn_number: updated.turn,
                  phase: updated.phase,
                  move_type: 'player_eliminated',
                  actor_id: pid,
                  created_at: now,
                  payload: { playerName: defeatedName, byName: actorName },
                })
              }
            }
            try {
              const { persistMoves } = await import('./logEmitter.js')
              await persistMoves(gameId, moves)
            } catch {
              // best-effort persistence of textual moves
            }
            await emitCombined(
              this.io as unknown as import('socket.io').Server<
                import('../types/shared.js').ClientToServerEvents,
                import('../types/shared.js').ServerToClientEvents,
                Record<string, unknown>,
                { userId?: string }
              >,
              gameId,
              { deltas: [withChanges], moves },
              updated,
            )
          } catch {
            // best-effort text emission
          }
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
  }

  /**
   * Process an end turn action. Queues when workers available; otherwise inline via GameService.
   */
  async processEndTurn(gameId: string, playerId: string): Promise<void> {
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
  }
}
