/**
 * Game-related types for the frontend
 * Re-exports from shared types and adds frontend-specific extensions
 */

import type {
  AttackAction,
  DeployAction,
  EndTurnAction,
  FortifyAction,
  GamePhase,
  GameStatus,
  PlayerColor,
  BattleResult as SharedBattleResult,
  Card as SharedCard,
  GameAction as SharedGameAction,
  GameState as SharedGameState,
  Player as SharedPlayer,
  Territory as SharedTerritory,
  TerritoryAbility,
  TradeCardsAction,
} from '../../../shared/types'

// Re-export shared types
export type {
  GamePhase,
  GameStatus,
  PlayerColor,
  TerritoryAbility,
  DeployAction,
  AttackAction,
  FortifyAction,
  EndTurnAction,
  TradeCardsAction,
  SharedBattleResult as BattleResult,
}

// Extend shared types with frontend-specific properties
export interface GameState extends SharedGameState {
  hasAttackedThisTurn?: boolean
  lastBattleResult?: SharedBattleResult
  movementTracking?: { [territoryId: string]: boolean }
  territoryModifiers?: { [territoryId: string]: TerritoryModifier }
}

export interface GamePlayer extends SharedPlayer {
  // Frontend might have additional display properties
  isCurrentPlayer?: boolean
  isLocalPlayer?: boolean
}

export interface Territory extends SharedTerritory {
  // Frontend might have UI-specific properties
  isHighlighted?: boolean
  isSelectable?: boolean
  continent?: string // Legacy property for backward compatibility
}

export interface Card extends SharedCard {
  // Frontend might have display properties
  isSelected?: boolean
}

export interface GameAction extends SharedGameAction {
  // Frontend might have optimistic update properties
  optimisticId?: string
  isPending?: boolean
}

// Frontend-specific types
export interface TerritoryModifier {
  type: 'fortress' | 'port' | 'airport' | 'capital'
  name: string
  description: string
  icon: string
  color: string
  effectType: 'defense' | 'movement' | 'economy'
  effectValue: number
}

export interface GameConfiguration {
  mapType: 'world' | 'custom'
  maxPlayers: number
  turnTimer: boolean
  turnTimeLimit: number // seconds
  fogOfWar: 'off' | 'adjacent' | 'persistent'
  cardTradeMode: 'fixed' | 'progressive' | 'random'
  startingArmies: number
  movementSystem: 'classic' | 'limited' | 'unlimited' | 'sequential'
  capitalMode: boolean
  territories: string[]
}

export interface AttackOptions {
  fromTerritoryId: string
  toTerritoryId: string
  numDice?: number
  autoRoll?: boolean
}

export interface DeployOptions {
  territoryId: string
  armies: number
  isAutomatic?: boolean
}

export interface FortifyOptions {
  fromTerritoryId: string
  toTerritoryId: string
  armies: number
  path?: string[]
}

// UI State types
export interface GameUIState {
  selectedTerritory: string | null
  hoveredTerritory: string | null
  attackSource: string | null
  fortifySource: string | null
  selectedCards: string[]
  showBattleModal: boolean
  showGameOverModal: boolean
  showSettings: boolean
  animatingTerritories: string[]
  isSoundEnabled: boolean
  gameSpeed: 'slow' | 'normal' | 'fast'
}

// Map selection types
export interface MapOption {
  id: string
  name: string
  description: string
  imageUrl?: string
  territoryCount: number
  playerRange: {
    min: number
    max: number
  }
  difficulty: 'easy' | 'medium' | 'hard'
  isOfficial: boolean
  isFeatured: boolean
}

// Re-export with backward compatibility aliases
export type GameRoom = SharedGameState
export type Player = GamePlayer
