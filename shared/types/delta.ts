/**
 * Shared delta update types for real-time game updates
 * Consolidated so frontend and backend share the same payload contracts
 */

export interface DeltaBase {
  type: string
  roomId: string
  timestamp: number
  /**
   * Version number from GameState at time of emission
   * Used for automatic desync detection on client
   */
  version?: number
}

export interface TerritoryDelta extends DeltaBase {
  type: 'TERRITORY_UPDATE'
  territoryId: string
  changes: {
    armies?: number
    ownerId?: string
  }
}

export interface PlayerDelta extends DeltaBase {
  type: 'PLAYER_UPDATE'
  playerId: string
  changes: {
    armies?: number
    territories?: string[]
    isEliminated?: boolean
    mustCashInTreasures?: boolean
  }
}

// Local copies to avoid circular type imports from './index' when used as a package
export type GamePhase = 'reinforcement' | 'attack' | 'fortify' | 'finished'

export interface PhaseChangeDelta extends DeltaBase {
  type: 'PHASE_CHANGE'
  phase: GamePhase
  currentPlayer: string
  turn?: number
  reinforcementArmies?: number
}

export interface BattleResultDelta extends DeltaBase {
  type: 'BATTLE_RESULT'
  battleResult: {
    attackerId?: string
    defenderId?: string | null
    fromTerritory: {
      id: string
      armies: number
    }
    toTerritory: {
      id: string
      armies: number
      ownerId?: string | null
    }
    conquered: boolean
    pendingConquestFor?: string | null
    attackerDice: number[]
    defenderDice: number[]
    attackerLosses: number
    defenderLosses: number
    initialFromArmies?: number
    initialToArmies?: number
    gameEnded?: boolean
    winner?: string
    eliminatedPlayers?: string[]
    capitalElimination?: {
      conqueror: string
      eliminated: string
      capitalTerritory: string
      territoriesGained: number
      troopsGained: number
    }
    gameState?: unknown
  }
}

export interface FortifyResultDelta extends DeltaBase {
  type: 'FORTIFY_RESULT'
  fromTerritoryId: string
  toTerritoryId: string
  movedArmies: number
  fromArmies: number
  toArmies: number
  playerId: string
}

export type Metal = 'bronze' | 'silver' | 'gold' | 'diamond'

export interface TreasureAwardedDelta extends DeltaBase {
  type: 'TREASURE_AWARDED'
  userId: string
  metal: Metal
}

export interface GameEndDelta extends DeltaBase {
  type: 'GAME_END'
  winner: string
  eliminatedPlayers: string[]
}

export interface SystemMessageDelta extends DeltaBase {
  type: 'SYSTEM_MESSAGE'
  text: string
  playerId?: string
}

export type GameDelta =
  | TerritoryDelta
  | PlayerDelta
  | PhaseChangeDelta
  | BattleResultDelta
  | GameEndDelta
  | FortifyResultDelta
  | TreasureAwardedDelta
  | SystemMessageDelta
