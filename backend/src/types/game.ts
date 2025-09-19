export type GamePhase = 'setup' | 'reinforcement' | 'attack' | 'fortify' | 'finished'

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
  board: Territory[]
  cards: Card[]
  hasAttackedThisTurn?: boolean
  lastBattleResult?: BattleResult
  gameConfig: GameConfiguration
  movementTracking?: Record<string, boolean>
  territoryModifiers?: Map<string, GameTerritoryModifier>
  capitalAssignments?: Record<string, string>
}

export interface GamePlayer {
  id: string
  username: string
  color: string
  armies: number
  territories: string[]
  cards: Card[]
  isEliminated: boolean
  capitalTerritory?: string
}

export interface Territory {
  id: string
  name: string
  continent: string
  ownerId: string | null
  armies: number
  adjacentTerritories: string[]
  isCapital?: boolean
  capitalOwnerId?: string | null
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
  | EndTurnAction
  | BeginTurnAction
  | TradeCardsAction
  | GoBackToReinforcementAction

type GameActionType =
  | 'deploy'
  | 'attack'
  | 'fortify'
  | 'end_turn'
  | 'begin_turn'
  | 'trade_cards'
  | 'go_back_to_reinforcement'

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

export type EndTurnAction = ActionBase<'end_turn'> & {
  payload?: undefined
}

export type BeginTurnAction = ActionBase<'begin_turn'> & {
  payload?: undefined
}

export type TradeCardsAction = ActionBase<'trade_cards'> & {
  payload?: {
    cards?: string[]
  }
}

export type GoBackToReinforcementAction = ActionBase<'go_back_to_reinforcement'> & {
  payload?: undefined
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
  gameEnded?: boolean
  winner?: GamePlayer | null
  eliminatedPlayers?: string[]
}

export interface GameConfiguration {
  movementType: MovementType
  allowTeamPlay?: boolean
  maxPlayers: number
  mapId?: string
  gameMode?: string
  continentBonuses?: ContinentBonus[]
  useTerritoryModifiers?: boolean
  modifierDistribution?: ModifierDistribution
}

export interface ContinentBonus {
  id: string
  name: string
  bonusArmies: number
  territories: string[]
}

export type MovementType = 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi'

export type ModifierDistribution = 'none' | 'sparse' | 'balanced' | 'abundant' | 'custom'

export type SerializedGameState = Omit<GameState, 'territoryModifiers'> & {
  territoryModifiers?: Record<string, GameTerritoryModifier>
}

export type ProcessActionResult = {
  gameState: GameState
  battleResult?: BattleResult
}
