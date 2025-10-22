/**
 * @fileoverview Processor for handling game actions, such as deployments, attacks, and fortifications.
 * @module services/gameActionProcessor
 */
import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'
import { GameService } from './gameService.js'
import { ActionLockManager } from './locking/ActionLockManager.js'
import { GameLogPersister } from './persistence/GameLogPersister.js'

/**
 * @class GameActionProcessor
 * @description Processes game actions, handling locking, persistence, and real-time updates.
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
   * Processes a deployment action.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player making the deployment.
   * @param {string} territoryId - The ID of the territory to deploy to.
   * @param {number} armies - The number of armies to deploy.
   * @returns {Promise<void>}
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
   * Processes a deployment action inline.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @param {string} territoryId - The ID of the territory.
   * @param {number} armies - The number of armies.
   * @returns {Promise<void>}
   * @private
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
   * Processes a fortify action.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @param {string} fromTerritoryId - The ID of the source territory.
   * @param {string} toTerritoryId - The ID of the target territory.
   * @param {number} armies - The number of armies to move.
   * @returns {Promise<void>}
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
   * Processes a fortify action inline.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @param {string} fromTerritoryId - The ID of the source territory.
   * @param {string} toTerritoryId - The ID of the target territory.
   * @param {number} armies - The number of armies.
   * @returns {Promise<void>}
   * @private
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
   * Processes the transfer of armies after a conquest.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @param {string} fromTerritoryId - The ID of the source territory.
   * @param {string} toTerritoryId - The ID of the conquered territory.
   * @param {number} armies - The number of armies to transfer.
   * @returns {Promise<void>}
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
   * Processes an action to go back to the reinforcement phase.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @returns {Promise<void>}
   */
  async processGoBackToReinforcement(gameId: string, playerId: string): Promise<void> {
    // Process inline and emit deltas
    await this.processGoBackToReinforcementInline(gameId, playerId)
  }

  /**
   * Processes a go-back-to-reinforcement action inline.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @returns {Promise<void>}
   * @private
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

  /**
   * Processes an action to go back to the attack phase.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @returns {Promise<void>}
   */
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
   * Processes an attack action.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player.
   * @param {string} fromTerritoryId - The ID of the attacking territory.
   * @param {string} toTerritoryId - The ID of the defending territory.
   * @param {number} [armies] - The number of armies to attack with.
   * @returns {Promise<void>}
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
   * Builds and emits battle moves based on the result of an attack.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the attacking player.
   * @param {string} fromTerritoryId - The ID of the attacking territory.
   * @param {string} toTerritoryId - The ID of the defending territory.
   * @param {unknown} battleResult - The result of the battle.
   * @param {object} updated - The updated game state.
   * @returns {Promise<void>}
   * @private
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

      const battleCtx = updated.lastBattleResult as {
        initialFromArmies?: number
        initialToArmies?: number
        defenderPlayerId?: string | null
        fromTerritory?: { armies?: number }
        toTerritory?: { armies?: number }
      }
      const defenderId =
        typeof battleCtx?.defenderPlayerId === 'string' && battleCtx.defenderPlayerId.length > 0
          ? battleCtx.defenderPlayerId
          : null
      const defender =
        defenderId && defenderId !== playerId
          ? updated.players.find((p) => p.id === defenderId)
          : undefined
      const defenderName = defender?.username || defenderId || undefined
      const movedArmies =
        conquered && typeof battleCtx?.toTerritory?.armies === 'number'
          ? Math.max(0, battleCtx.toTerritory.armies)
          : undefined
      const initialFromArmies =
        typeof battleCtx?.initialFromArmies === 'number'
          ? battleCtx.initialFromArmies
          : typeof battleCtx?.fromTerritory?.armies === 'number'
            ? battleCtx.fromTerritory.armies + attackerLosses + (movedArmies ?? 0)
            : undefined
      const initialToArmies =
        typeof battleCtx?.initialToArmies === 'number' ? battleCtx.initialToArmies : undefined

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
            toOwnerName: defenderName,
            kills: defenderLosses,
            losses: attackerLosses,
            defenderName,
            defenderId: defenderId ?? undefined,
            initialFromArmies,
            initialToArmies,
            conquered,
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
            occupyArmies:
              typeof movedArmies === 'number'
                ? movedArmies
                : typeof battleCtx?.toTerritory?.armies === 'number'
                  ? battleCtx.toTerritory.armies
                  : undefined,
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
            payload: { playerName: defeatedName, byName: actorName, actorName: defeatedName },
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
   * Processes an end-turn action.
   * @param {string} gameId - The ID of the game.
   * @param {string} playerId - The ID of the player ending their turn.
   * @returns {Promise<void>}
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
