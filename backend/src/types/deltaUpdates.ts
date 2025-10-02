/**
 * Delta builder for efficient real-time broadcasting.
 * Use shared types from @risk-game/shared/types to avoid drift.
 */
import type {
  BattleResultDelta,
  GameEndDelta,
  PhaseChangeDelta,
  PlayerDelta as PlayerUpdateDelta,
  TerritoryDelta as TerritoryUpdateDelta,
} from '@risk-game/shared/types'

/**
 * Delta builder utility for creating efficient updates
 */
type BattleResultPayload = BattleResultDelta['battleResult']

export const DeltaBuilder = {
  territoryUpdate(
    roomId: string,
    territoryId: string,
    changes: { armies?: number; ownerId?: string },
  ): TerritoryUpdateDelta {
    const normalizedArmies =
      typeof changes.armies === 'number' && Number.isFinite(changes.armies)
        ? Math.max(0, Math.trunc(changes.armies))
        : undefined
    const normalizedOwner =
      typeof changes.ownerId === 'string' && changes.ownerId.trim().length > 0
        ? changes.ownerId
        : undefined
    return {
      type: 'TERRITORY_UPDATE',
      roomId,
      territoryId,
      changes: {
        ...(normalizedArmies !== undefined ? { armies: normalizedArmies } : {}),
        ...(normalizedOwner !== undefined ? { ownerId: normalizedOwner } : {}),
      },
      timestamp: Date.now(),
    }
  },

  playerUpdate(
    roomId: string,
    playerId: string,
    changes: { armies?: number; territories?: string[]; isEliminated?: boolean },
  ): PlayerUpdateDelta {
    return {
      type: 'PLAYER_UPDATE',
      roomId,
      playerId,
      changes,
      timestamp: Date.now(),
    }
  },

  phaseChange(
    roomId: string,
    phase: PhaseChangeDelta['phase'],
    currentPlayer: string,
    turn?: number,
    reinforcementArmies?: number,
  ): PhaseChangeDelta {
    const safeTurn =
      typeof turn === 'number' && Number.isFinite(turn) ? Math.max(0, Math.trunc(turn)) : undefined
    const safeReinforce =
      typeof reinforcementArmies === 'number' && Number.isFinite(reinforcementArmies)
        ? Math.max(0, Math.trunc(reinforcementArmies))
        : undefined
    return {
      type: 'PHASE_CHANGE',
      roomId,
      phase,
      currentPlayer,
      turn: safeTurn,
      reinforcementArmies: safeReinforce,
      timestamp: Date.now(),
    }
  },

  battleResult(roomId: string, battleResult: BattleResultPayload): BattleResultDelta {
    return {
      type: 'BATTLE_RESULT',
      roomId,
      battleResult,
      timestamp: Date.now(),
    }
  },

  gameEnd(roomId: string, winner: string, eliminatedPlayers: string[]): GameEndDelta {
    return {
      type: 'GAME_END',
      roomId,
      winner,
      eliminatedPlayers,
      timestamp: Date.now(),
    }
  },
} as const
