export interface DeltaBase {
  type: string
  roomId: string
  timestamp: number
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
import type { GamePhase } from './index'
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
import type { Metal } from './index'
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
//# sourceMappingURL=delta.d.ts.map
