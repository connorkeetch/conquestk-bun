import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'
import { GameService } from './gameService.js'
import { ActionLockManager } from './locking/ActionLockManager.js'
import { GameLogPersister } from './persistence/GameLogPersister.js'

/**
 * Unified game action processor
 * Single code path for all game actions - handles queue vs inline internally
 *
 * Refactored to use specialized services for better separation of concerns:
 * - GameLogPersister: Manages game log persistence
 * - ActionLockManager: Handles Redis lock acquisition/release
 */
export class GameActionProcessor {
  private gameService: GameService
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
  ): Promise<void> {
    await this.processDeploymentInline(gameId, playerId, territoryId, armies)
    try {
      const { emitRevealSnapshot } = await import('./fogService.js')
      await emitRevealSnapshot(this.io, gameId, playerId)
    } catch (error) {
      logger.warn('Failed to emit targeted reveal after deployment', {
        gameId,
        playerId,
        territoryId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
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

    await this.gameService.processPlaceArmies(gameId, {
      territoryId,
      armies,
      playerId,
    })
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

    await this.gameService.processFortify(gameId, {
      fromTerritoryId,
      toTerritoryId,
      armies,
      playerId,
    })

    // Co-emit deltas + textual fortify in a single sweep
    try {
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
            { moves: [move] },
            updated,
          )
        }
      }
    } catch (error) {
      logger.warn('Failed to emit fortify log update', {
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
    await this.gameService.transferConquestArmies(
      gameId,
      playerId,
      fromTerritoryId,
      toTerritoryId,
      armies,
    )
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

    await this.gameService.processGoBackToReinforcement(gameId, playerId)
    try {
      const { emitRevealSnapshot } = await import('./fogService.js')
      await emitRevealSnapshot(this.io, gameId, playerId)
    } catch (error) {
      logger.warn('Failed to emit targeted reveal after go-back-to-reinforcement', {
        gameId,
        playerId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async processGoBackToAttack(gameId: string, playerId: string): Promise<void> {
    logger.info('Processing go-back-to-attack inline (no queue)', {
      gameId,
      playerId,
    })

    await this.gameService.processGoBackToAttack(gameId, playerId)
    try {
      const { emitRevealSnapshot } = await import('./fogService.js')
      await emitRevealSnapshot(this.io, gameId, playerId)
    } catch (error) {
      logger.warn('Failed to emit targeted reveal after go-back-to-attack', {
        gameId,
        playerId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
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
        await this.buildAndEmitBattleMoves(
          gameId,
          playerId,
          fromTerritoryId,
          toTerritoryId,
          last,
          updated,
        )
      }

      try {
        const { emitRevealSnapshot } = await import('./fogService.js')
        await emitRevealSnapshot(this.io, gameId, playerId)
      } catch (error) {
        logger.warn('Failed to emit targeted reveal after attack', {
          gameId,
          playerId,
          fromTerritoryId,
          toTerritoryId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
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
      await emitCombined(
        this.io as unknown as import('socket.io').Server<
          import('../types/shared.js').ClientToServerEvents,
          import('../types/shared.js').ServerToClientEvents,
          Record<string, unknown>,
          { userId?: string }
        >,
        gameId,
        { moves },
        updated as import('../types/game.js').GameState,
      )
    } catch (error) {
      logger.warn('Failed to emit battle log updates', {
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
    const result = await this.gameService.endTurn(gameId, playerId)

    // Broadcast treasure award log if applicable (snapshot/state updates handled via lockstep)
    if (result.treasureAwarded) {
      try {
        const { tryGetSocketServer } = await import('./socketRegistry.js')
        const io = tryGetSocketServer()
        if (io) {
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
            payload: { actorName: username, metal: result.treasureAwarded },
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
            { moves: [move] },
            state,
          )
        }
      } catch (error) {
        logger.warn('Failed to emit treasure award log', {
          gameId,
          playerId,
          treasureMetal: result.treasureAwarded,
          error: error instanceof Error ? error.message : String(error),
        })
      }
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
