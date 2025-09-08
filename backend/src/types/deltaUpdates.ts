/**
 * Delta update types for efficient real-time broadcasting
 * Instead of sending full game state, send only what changed
 */

export interface BaseDelta {
  type: string
  roomId: string
  timestamp: number
}

export interface TerritoryUpdateDelta extends BaseDelta {
  type: 'TERRITORY_UPDATE'
  territoryId: string
  changes: {
    armies?: number
    ownerId?: string
  }
}

export interface PlayerUpdateDelta extends BaseDelta {
  type: 'PLAYER_UPDATE'
  playerId: string
  changes: {
    armies?: number
    territories?: string[]
    isEliminated?: boolean
  }
}

export interface PhaseChangeDelta extends BaseDelta {
  type: 'PHASE_CHANGE'
  phase: string
  currentPlayer: string
  turn?: number
  reinforcementArmies?: number
}

export interface BattleResultDelta extends BaseDelta {
  type: 'BATTLE_RESULT'
  battleResult: {
    fromTerritory: {
      id: string
      armies: number
    }
    toTerritory: {
      id: string
      armies: number
      ownerId: string
    }
    conquered: boolean
    attackerDice: number[]
    defenderDice: number[]
    attackerLosses: number
    defenderLosses: number
    gameEnded?: boolean
    winner?: any
    eliminatedPlayers?: string[]
  }
}

export interface GameEndDelta extends BaseDelta {
  type: 'GAME_END'
  winner: any
  eliminatedPlayers: string[]
}

export interface CompoundDelta extends BaseDelta {
  type: 'COMPOUND'
  changes: GameDelta[]
}

export type GameDelta =
  | TerritoryUpdateDelta
  | PlayerUpdateDelta
  | PhaseChangeDelta
  | BattleResultDelta
  | GameEndDelta
  | CompoundDelta

/**
 * Delta builder utility for creating efficient updates
 */
export class DeltaBuilder {
  static territoryUpdate(
    roomId: string,
    territoryId: string,
    changes: { armies?: number; ownerId?: string },
  ): TerritoryUpdateDelta {
    return {
      type: 'TERRITORY_UPDATE',
      roomId,
      territoryId,
      changes,
      timestamp: Date.now(),
    }
  }

  static playerUpdate(
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
  }

  static phaseChange(
    roomId: string,
    phase: string,
    currentPlayer: string,
    turn?: number,
    reinforcementArmies?: number,
  ): PhaseChangeDelta {
    return {
      type: 'PHASE_CHANGE',
      roomId,
      phase,
      currentPlayer,
      turn,
      reinforcementArmies,
      timestamp: Date.now(),
    }
  }

  static battleResult(roomId: string, battleResult: any): BattleResultDelta {
    return {
      type: 'BATTLE_RESULT',
      roomId,
      battleResult,
      timestamp: Date.now(),
    }
  }

  static gameEnd(roomId: string, winner: any, eliminatedPlayers: string[]): GameEndDelta {
    return {
      type: 'GAME_END',
      roomId,
      winner,
      eliminatedPlayers,
      timestamp: Date.now(),
    }
  }
}
