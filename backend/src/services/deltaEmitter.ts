import type { Server } from 'socket.io'
import { DeltaBuilder } from '../types/deltaUpdates'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { logger } from '../utils/logger'

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
}

/**
 * Unified delta emission service
 * Handles all delta broadcasts in a consistent way across worker and inline paths
 */
export class DeltaEmitter {
  private io: Server<ClientToServerEvents, ServerToClientEvents>
  private emitFogFilteredDelta:
    | ((
        io: Server,
        roomId: string,
        delta: import('@risk-game/shared/types').GameDelta,
      ) => Promise<void>)
    | null = null

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io
  }

  private async getEmitter() {
    if (!this.emitFogFilteredDelta) {
      const { emitFogFilteredDelta } = await import('./fogService')
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
        const playerDelta = DeltaBuilder.playerUpdate(gameId, playerId, {
          armies: result.playerArmies,
        })
        await emitter(this.io as unknown as Server, gameId, playerDelta)
      }

      // Emit phase change if occurred
      if (result.phaseChanged) {
        const phaseDelta = DeltaBuilder.phaseChange(
          gameId,
          result.phaseChanged.phase as
            | 'reinforcement'
            | 'attack'
            | 'fortify'
            | 'finished'
            | 'waiting',
          result.phaseChanged.currentPlayer,
          result.phaseChanged.turn,
          result.phaseChanged.reinforcementArmies,
        )
        await emitter(this.io as unknown as Server, gameId, phaseDelta)
      }

      // Emit territory update
      if (typeof result.armies === 'number') {
        const territoryDelta = DeltaBuilder.territoryUpdate(gameId, territoryId, {
          armies: result.armies,
        })
        await emitter(this.io as unknown as Server, gameId, territoryDelta)
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
        const fromDelta = DeltaBuilder.territoryUpdate(gameId, fromTerritoryId, {
          armies: result.fromArmies,
        })
        await emitter(this.io as unknown as Server, gameId, fromDelta)
      }

      // Emit to territory update
      if (typeof result.toArmies === 'number') {
        const toDelta = DeltaBuilder.territoryUpdate(gameId, toTerritoryId, {
          armies: result.toArmies,
        })
        await emitter(this.io as unknown as Server, gameId, toDelta)
      }

      // Emit phase change if occurred
      if (result.phaseChanged) {
        const phaseDelta = DeltaBuilder.phaseChange(
          gameId,
          result.phaseChanged.phase as
            | 'reinforcement'
            | 'attack'
            | 'fortify'
            | 'finished'
            | 'waiting',
          result.phaseChanged.currentPlayer,
          result.phaseChanged.turn,
          result.phaseChanged.reinforcementArmies,
        )
        await emitter(this.io as unknown as Server, gameId, phaseDelta)
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
}
