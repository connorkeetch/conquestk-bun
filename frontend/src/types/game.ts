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
  GameTerritoryModifier,
  PlayerColor,
  BattleResult as SharedBattleResult,
  Card as SharedCard,
  GameConfiguration as SharedGameConfiguration,
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
}

export interface BattleTerritorySnapshot {
  id: string
  name: string
  armies: number
  ownerId?: string | null
}

type BattleTerritoryRef = string | BattleTerritorySnapshot

export interface BattleResult
  extends Omit<SharedBattleResult, 'fromTerritory' | 'toTerritory'> {
  fromTerritory: BattleTerritoryRef
  toTerritory: BattleTerritoryRef
}

// Extend shared types with frontend-specific properties
export interface GameState extends SharedGameState {
  territoryModifiers?:
    | Record<string, GameTerritoryModifier>
    | { [territoryId: string]: TerritoryModifier }
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

// Frontend-specific types
export type TerritoryModifier = GameTerritoryModifier & {
  type?: string
}

export type GameConfiguration = SharedGameConfiguration & {
  modifierDistribution?: string
  movementSystem?: string
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
