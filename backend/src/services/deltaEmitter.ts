import type { Server } from 'socket.io'
import type { GameState } from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'

/**
 * Minimal compatibility shim for the legacy DeltaEmitter.
 * The lockstep transport no longer broadcasts incremental deltas, so these
 * methods now no-op or fall back to targeted reveal snapshots when helpful.
 */
export class DeltaEmitter {
  constructor(
    private readonly io: Server<
      ClientToServerEvents,
      ServerToClientEvents,
      Record<string, unknown>,
      { userId?: string }
    >,
  ) {}

  async emitDeploymentDeltas(
    _gameId: string,
    _playerId: string,
    _territoryId: string,
    _result: unknown,
  ): Promise<void> {
    // Legacy delta path removed — lockstep frames carry state updates.
  }

  async emitPhaseChange(
    _gameId: string,
    _result: {
      phase: string
      currentPlayer: string
      turn: number
      reinforcementArmies?: number
      version?: number
    },
  ): Promise<void> {
    // Legacy delta path removed — lockstep frames carry state updates.
  }

  async emitFortifyDeltas(
    _gameId: string,
    _fromTerritoryId: string,
    _toTerritoryId: string,
    _result: unknown,
  ): Promise<void> {
    // Legacy delta path removed — lockstep frames carry state updates.
  }

  async emitRevealTo(gameId: string, viewerId: string, state?: GameState): Promise<void> {
    try {
      const { emitRevealSnapshot } = await import('./fogService.js')
      await emitRevealSnapshot(this.io, gameId, viewerId, state)
    } catch (error) {
      logger.warn('Failed to emit targeted reveal snapshot', {
        gameId,
        viewerId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }
}
