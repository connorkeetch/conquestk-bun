import type { Server } from 'socket.io'
import { DeltaBuilder } from '../types/deltaUpdates.js'
import type { GameState } from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { logger } from '../utils/logger.js'

/**
 * Result from a game action that needs delta emission
 */
export interface ActionResult {
  armies?: number
  territoryId?: string
  playerArmies?: number
  playerId?: string
  fromArmies?: number
  toArmies?: number
  fromTerritoryId?: string
  toTerritoryId?: string
  phaseChanged?: {
    phase: string
    currentPlayer: string
    turn: number
    reinforcementArmies?: number
  }
  version?: number
}

/**
 * Unified delta emission service
 * Handles all delta broadcasts in a consistent way across worker and inline paths
 */
export class DeltaEmitter {
  // Socket.io server with typed SocketData (for userId on sockets)
  private io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, unknown>,
    { userId?: string }
  >
  // Lazily-loaded fog emitter kept as optional, resolved via getEmitter()
  private emitFogFilteredDelta?: typeof import('./fogService.js')['emitFogFilteredDelta']

  constructor(
    io: Server<
      ClientToServerEvents,
      ServerToClientEvents,
      Record<string, unknown>,
      { userId?: string }
    >,
  ) {
    this.io = io
  }

  private async getEmitter(): Promise<typeof import('./fogService.js')['emitFogFilteredDelta']> {
    if (!this.emitFogFilteredDelta) {
      const { emitFogFilteredDelta } = await import('./fogService.js')
      this.emitFogFilteredDelta = emitFogFilteredDelta
    }
    return this.emitFogFilteredDelta
  }

  /**
   * Emit deltas for a deployment action
   */
  async emitDeploymentDeltas(
    gameId: string,
    playerId: string,
    territoryId: string,
    result: ActionResult,
  ): Promise<void> {
    try {
      const emitter = await this.getEmitter()

      // Emit player armies update
      if (typeof result.playerArmies === 'number') {
        const playerDelta = DeltaBuilder.playerUpdate(
          gameId,
          playerId,
          {
            armies: result.playerArmies,
          },
          result.version,
        )
        await emitter(this.io, gameId, playerDelta)
      }

      // Emit phase change if occurred
      if (result.phaseChanged) {
        const phaseDelta = DeltaBuilder.phaseChange(
          gameId,
          result.phaseChanged.phase as 'reinforcement' | 'attack' | 'fortify' | 'finished',
          result.phaseChanged.currentPlayer,
          result.phaseChanged.turn,
          result.phaseChanged.reinforcementArmies,
          result.version,
        )
        await emitter(this.io, gameId, phaseDelta)
      }

      // Emit territory update
      if (typeof result.armies === 'number') {
        const territoryDelta = DeltaBuilder.territoryUpdate(
          gameId,
          territoryId,
          {
            armies: result.armies,
          },
          result.version,
        )
        await emitter(this.io, gameId, territoryDelta)
      }
    } catch (error) {
      logger.warn('Failed to emit deployment deltas', {
        gameId,
        playerId,
        territoryId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  /**
   * Emit phase change delta
   */
  async emitPhaseChange(
    gameId: string,
    result: {
      phase: string
      currentPlayer: string
      turn: number
      reinforcementArmies?: number
      version?: number
    },
  ): Promise<void> {
    try {
      const emitter = await this.getEmitter()

      const phaseDelta = DeltaBuilder.phaseChange(
        gameId,
        result.phase as 'reinforcement' | 'attack' | 'fortify' | 'finished',
        result.currentPlayer,
        result.turn,
        result.reinforcementArmies,
        result.version,
      )

      await emitter(this.io, gameId, phaseDelta)
    } catch (error) {
      logger.warn('Failed to emit phase change delta', {
        gameId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  /**
   * Emit deltas for a fortify action
   */
  async emitFortifyDeltas(
    gameId: string,
    fromTerritoryId: string,
    toTerritoryId: string,
    result: ActionResult,
  ): Promise<void> {
    try {
      const emitter = await this.getEmitter()

      // Emit from territory update
      if (typeof result.fromArmies === 'number') {
        const fromDelta = DeltaBuilder.territoryUpdate(
          gameId,
          fromTerritoryId,
          {
            armies: result.fromArmies,
          },
          result.version,
        )
        await emitter(this.io, gameId, fromDelta)
      }

      // Emit to territory update
      if (typeof result.toArmies === 'number') {
        const toDelta = DeltaBuilder.territoryUpdate(
          gameId,
          toTerritoryId,
          {
            armies: result.toArmies,
          },
          result.version,
        )
        await emitter(this.io, gameId, toDelta)
      }

      // Emit phase change if occurred
      if (result.phaseChanged) {
        const phaseDelta = DeltaBuilder.phaseChange(
          gameId,
          result.phaseChanged.phase as 'reinforcement' | 'attack' | 'fortify' | 'finished',
          result.phaseChanged.currentPlayer,
          result.phaseChanged.turn,
          result.phaseChanged.reinforcementArmies,
          result.version,
        )
        await emitter(this.io, gameId, phaseDelta)
      }
    } catch (error) {
      logger.warn('Failed to emit fortify deltas', {
        gameId,
        fromTerritoryId,
        toTerritoryId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  /**
   * Emit a full-state snapshot to a single viewer as a targeted convergence fallback.
   * Useful when clients might have missed deltas (e.g., on initial join or slow connections).
   */
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
