import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'
import { DeltaEmitter } from './deltaEmitter.js'
import { BattleResultEmitter } from './emission/BattleResultEmitter.js'
import { GameService } from './gameService.js'
import { ActionLockManager } from './locking/ActionLockManager.js'
import { GameLogPersister } from './persistence/GameLogPersister.js'

/**
 * Unified game action processor
 * Single code path for all game actions - handles queue vs inline internally
 *
 * Refactored to use specialized services for better separation of concerns:
 * - BattleResultEmitter: Handles battle delta emission and transformation
 * - GameLogPersister: Manages game log persistence
 * - ActionLockManager: Handles Redis lock acquisition/release
 */
export class GameActionProcessor {
  private gameService: GameService
  private deltaEmitter: DeltaEmitter
  private battleResultEmitter: BattleResultEmitter
  private logPersister: GameLogPersister
  private lockManager: ActionLockManager
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
    this.battleResultEmitter = new BattleResultEmitter(io)
    this.logPersister = new GameLogPersister()
    this.lockManager = new ActionLockManager()
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
    } catch (error) {
      logger.warn('Failed to emit fortify combined deltas - client may need manual refresh', {
        gameId,
        playerId,
        fromTerritoryId,
        toTerritoryId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
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
    } catch (error) {
      logger.warn('Failed to emit transfer_conquest deltas - client may be desynced', {
        gameId,
        playerId,
        fromTerritoryId,
        toTerritoryId,
        armies,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
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
   * Refactored to use specialized services for cleaner separation of concerns.
   */
  async processAttack(
    gameId: string,
    playerId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    armies?: number,
  ): Promise<void> {
    // Use ActionLockManager to serialize attack processing
    await this.lockManager.withLock(gameId, async () => {
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
          // Use BattleResultEmitter to handle delta emission
          await this.battleResultEmitter.emitBattleResult(gameId, last, updated.version ?? 0)

          // Build and emit battle moves
          await this.buildAndEmitBattleMoves(
            gameId,
            playerId,
            fromTerritoryId,
            toTerritoryId,
            last,
            updated,
          )
        } catch (error) {
          logger.warn('Failed to emit fog-filtered battle delta - client may be desynced', {
            gameId,
            playerId,
            fromTerritoryId,
            toTerritoryId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
        }
      }

      await this.deltaEmitter.emitRevealTo(gameId, playerId)
    })
  }

  /**
   * Build battle moves and emit them via combined delta
   * Extracted from processAttack for better readability
   */
  private async buildAndEmitBattleMoves(
    gameId: string,
    playerId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    battleResult: unknown,
    updated: {
      players: Array<{ id: string; username?: string }>
      board: Array<{ id: string; name?: string }>
      turn: number
      phase: string
      version?: number
      lastBattleResult?: unknown
    },
  ): Promise<void> {
    try {
      const { emitCombined } = await import('./realtimeEmitter.js')
      const { DeltaBuilder } = await import('../types/deltaUpdates.js')

      // Get battle result payload (already validated by BattleResultEmitter)
      const obj = battleResult as Record<string, unknown>
      const conquered = Boolean(obj.conquered)
      const attackerLosses = Number(obj.attackerLosses || 0)
      const defenderLosses = Number(obj.defenderLosses || 0)

      const now = new Date()
      const attacker = updated.players.find((p) => p.id === playerId)
      const actorName = attacker?.username || playerId
      const fromT = updated.board.find((t) => t.id === fromTerritoryId)
      const toT = updated.board.find((t) => t.id === toTerritoryId)

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
            fromId: fromTerritoryId,
            toId: toTerritoryId,
            fromName: fromT?.name,
            toName: toT?.name,
            fromOwnerName: actorName,
            toOwnerName: undefined,
            kills: defenderLosses,
            losses: attackerLosses,
          },
        },
      ]

      if (conquered) {
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
            fromId: fromTerritoryId,
            toId: toTerritoryId,
            fromName: fromT?.name,
            toName: toT?.name,
            fromOwnerName: actorName,
            toOwnerName: undefined,
          },
        })
      }

      if (Array.isArray((obj as { eliminatedPlayers?: unknown[] }).eliminatedPlayers)) {
        const eliminated = (obj as { eliminatedPlayers?: string[] }).eliminatedPlayers ?? []
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

      // Persist moves using GameLogPersister
      await this.logPersister.persistBattleMoves(gameId, moves)

      // Get the battle result payload for emitCombined
      const fromTerritory = (obj.fromTerritory as Record<string, unknown>) || {}
      const toTerritory = (obj.toTerritory as Record<string, unknown>) || {}
      const battleDelta = DeltaBuilder.battleResult(
        gameId,
        {
          fromTerritory: {
            id: String(fromTerritory.id),
            armies: Number(fromTerritory.armies),
          },
          toTerritory: {
            id: String(toTerritory.id),
            armies: Number(toTerritory.armies),
            ...(typeof toTerritory.ownerId === 'string' || toTerritory.ownerId === null
              ? { ownerId: toTerritory.ownerId as string | null }
              : {}),
          },
          attackerLosses,
          defenderLosses,
          attackerDice: (obj.attackerDice as number[]) || [],
          defenderDice: (obj.defenderDice as number[]) || [],
          conquered,
        },
        updated.version,
      )

      const withChanges = {
        ...battleDelta,
        changes: [
          DeltaBuilder.territoryUpdate(
            gameId,
            fromTerritoryId,
            { armies: Number(fromTerritory.armies) },
            updated.version,
          ),
          DeltaBuilder.territoryUpdate(
            gameId,
            toTerritoryId,
            {
              armies: Number(toTerritory.armies),
              ownerId: (toTerritory.ownerId as string | null) ?? undefined,
            },
            updated.version,
          ),
        ],
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
        updated as import('../types/game.js').GameState,
      )
    } catch (error) {
      logger.warn('Failed to emit combined battle deltas and moves', {
        gameId,
        playerId,
        fromTerritoryId,
        toTerritoryId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
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
    } catch (error) {
      logger.warn('Failed to emit treasure awarded delta', {
        gameId,
        playerId,
        treasureMetal: result.treasureAwarded,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
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
