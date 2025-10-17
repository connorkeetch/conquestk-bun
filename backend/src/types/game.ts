import type {
  AIDifficulty,
  KingOfTheHillConfig,
  KingOfTheHillState,
  Metal,
  SectorBonus,
  TreasureConfig,
  TreasureState,
} from '@conquestk/shared/types'

export type {
  AIDifficulty,
  KingOfTheHillConfig,
  KingOfTheHillState,
  Metal,
  TreasureConfig,
  TreasureState,
} from '@conquestk/shared/types'

export type GamePhase = 'reinforcement' | 'attack' | 'fortify' | 'finished'

export interface GameTerritoryModifier {
  territory_id: string
  defense_bonus: number
  attack_bonus: number
  troop_generation_bonus: number
  movement_restriction: boolean
  supply_line_bonus: boolean
  icon: string
  color: string
  name: string
}

export interface GameState {
  roomId: string
  players: GamePlayer[]
  currentPlayer: string
  phase: GamePhase
  turn: number
  /**
   * Version number - increments on every state mutation
   * Used for automatic desync detection on client
   */
  version?: number
  board: Territory[]
  cards: Card[]
  hasAttackedThisTurn?: boolean
  lastBattleResult?: BattleResult
  gameConfig: GameConfiguration
  movementTracking?: Record<string, boolean>
  territoryModifiers?: Map<string, GameTerritoryModifier>
  capitalAssignments?: Record<string, string>
  treasureState?: TreasureState
  mustCashInTreasures?: boolean
  conqueredDuringTurn?: boolean
  assassinationTargets?: Record<string, string>
  kingOfTheHillState?: KingOfTheHillState
  /**
   * Snapshot of armies at the start of the reinforcement phase for the current player.
   * Used to safely allow client "undo last placement" by preventing reductions below baseline.
   */
  reinforcementBaseline?: Record<string, number>
  /**
   * History of reinforcement placements (positive) and undos (negative) in the current reinforcement phase.
   * Entries are appended in order and cleared when leaving reinforcement or the turn advances.
   */
  reinforcementHistory?: Array<{
    playerId: string
    territoryId: string
    armies: number
    ts: number
  }>
  /**
   * When treasures are cashed in outside the normal reinforcement start, we temporarily
   * return to reinforcement to place the bonus troops. Track the phase/attack state to
   * restore afterwards.
   */
  resumePhaseAfterReinforcement?: GamePhase | null
  resumeHasAttackedAfterReinforcement?: boolean
  /**
   * History of fortify moves in the current fortify phase.
   * Allows undo of the last fortify action. Cleared when turn ends.
   */
  fortifyHistory?: Array<{
    playerId: string
    fromTerritoryId: string
    toTerritoryId: string
    armies: number
    ts: number
  }>
  /**
   * Auditable, seeded RNG state for combat dice.
   * Seed is recorded in the game log, and state advances per die roll.
   */
  combatRngSeed?: string
  combatRngState?: {
    a: number
    b: number
    c: number
    d: number
  }
}

export interface GamePlayer {
  id: string
  username: string
  color: string
  armies: number
  territories: string[]
  cards: Card[]
  isEliminated: boolean
  // Competitive rating (CP/ELO). Optional for backwards compatibility.
  skillRating?: number
  capitalTerritory?: string
  teamId?: number | null
  isAi?: boolean
  aiDifficulty?: AIDifficulty | null
  aiPersonalitySeed?: number | null
  treasures?: Metal[]
  mustCashInTreasures?: boolean
}

export interface Territory {
  id: string
  name: string
  sector: string
  ownerId: string | null
  armies: number
  adjacentTerritories: string[]
  isCapital?: boolean
  capitalOwnerId?: string | null
  coordinates?: {
    x: number
    y: number
  }
}

export interface Card {
  id: string
  type: 'infantry' | 'cavalry' | 'artillery' | 'wild'
  territory?: string
}

export type GameAction =
  | DeployAction
  | AttackAction
  | FortifyAction
  | UndoFortifyAction
  | EndTurnAction
  | TradeCardsAction
  | GoBackToReinforcementAction
  | TransferConquestAction

type GameActionType =
  | 'deploy'
  | 'attack'
  | 'fortify'
  | 'undo_fortify'
  | 'end_turn'
  | 'trade_cards'
  | 'go_back_to_reinforcement'
  | 'transfer_conquest'

type ActionBase<T extends GameActionType> = {
  type: T
  roomId: string
  playerId: string
}

export type DeployAction = ActionBase<'deploy'> & {
  payload: {
    territoryId: string
    armies: number
  }
}

export type AttackAction = ActionBase<'attack'> & {
  payload: {
    fromTerritoryId: string
    toTerritoryId: string
    armies?: number
  }
}

export type FortifyAction = ActionBase<'fortify'> & {
  payload: {
    fromTerritoryId: string
    toTerritoryId: string
    armies: number
  }
}

export type UndoFortifyAction = ActionBase<'undo_fortify'> & {
  payload?: undefined
}

export type EndTurnAction = ActionBase<'end_turn'> & {
  payload?: undefined
}

export type TradeCardsAction = ActionBase<'trade_cards'> & {
  payload?: {
    cards?: string[]
    treasureSet?: [number, number, number] | number[]
  }
}

export type GoBackToReinforcementAction = ActionBase<'go_back_to_reinforcement'> & {
  payload?: undefined
}

export type TransferConquestAction = ActionBase<'transfer_conquest'> & {
  payload: {
    fromTerritoryId: string
    toTerritoryId: string
    armies: number
  }
}

export interface BattleResult {
  attackerDice: number[]
  defenderDice: number[]
  attackerLosses: number
  defenderLosses: number
  conquered: boolean
  fromTerritory: {
    id: string
    name: string
    armies: number
  }
  toTerritory: {
    id: string
    name: string
    armies: number
    ownerId: string
  }
  pendingConquestFor?: string | null
  gameEnded?: boolean
  winner?: GamePlayer | null
  eliminatedPlayers?: string[]
}

export interface GameConfiguration {
  movementType: MovementType
  allowTeamPlay?: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance'
  numberOfTeams?: number | null
  teamAssignments?: Record<number, string[]>
  maxPlayers: number
  mapId?: string
  gameMode?: string
  sectorBonuses?: SectorBonus[]
  useTerritoryModifiers?: boolean
  modifierDistribution?: ModifierDistribution
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  treasureConfig?: TreasureConfig
  kingOfTheHill?: KingOfTheHillConfig
}

export type MovementType = 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi'

export type ModifierDistribution = 'none' | 'sparse' | 'balanced' | 'abundant' | 'custom'

export type SerializedGameState = Omit<GameState, 'territoryModifiers'> & {
  territoryModifiers?: Record<string, GameTerritoryModifier>
  roundNumber?: number
}

export type ProcessActionResult = {
  gameState: GameState
  battleResult?: BattleResult
}
