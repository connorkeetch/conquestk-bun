/**
 * Frontend delta update types (matching backend)
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

export type GameDelta = 
  | TerritoryUpdateDelta 
  | PlayerUpdateDelta 
  | PhaseChangeDelta 
  | BattleResultDelta
  | GameEndDelta