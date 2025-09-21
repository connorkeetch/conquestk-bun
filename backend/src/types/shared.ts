/**
 * Shared TypeScript types between frontend and backend
 * These are the core types that both frontend and backend use
 */

import type { GameDelta } from './deltaUpdates'
import type { BattleResult, GameAction, SerializedGameState } from './game'

// ============================================
// User & Authentication Types
// ============================================

export interface SharedUser {
  id: string
  username: string
  email: string
  emailVerified?: boolean
  createdAt?: Date | string
  updatedAt?: Date | string
  lastActive?: Date | string
  skillRating?: number
  totalGames?: number
  totalWins?: number
  totalRankedGames?: number
  avatarUrl?: string
  country?: string
  bio?: string
  preferredColor?: string
}

// ============================================
// Game Types
// ============================================

export type GamePhase = 'setup' | 'reinforcement' | 'attack' | 'fortify' | 'finished'
export type GameStatus = 'lobby' | 'initializing' | 'active' | 'completed' | 'paused' | 'abandoned'
export type PlayerColor =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'cyan'
  | 'pink'
  | 'brown'
  | 'lime'
  | 'indigo'
  | 'teal'

// ============================================
// Socket.io Event Types
// ============================================

export interface ServerToClientEvents {
  'player-joined': (data: {
    roomId: string
    player: {
      userId: string
      username: string
      joinedAt: string
      isReady: boolean
      readyAt: string | null
    }
  }) => void
  'player-left': (data: { roomId: string; playerId: string }) => void
  'player-disconnected': (data: { roomId: string; playerId: string; socketId?: string }) => void
  'game-update': (gameState: SerializedGameState) => void
  'game-delta': (delta: GameDelta) => void // Delta update for efficient real-time broadcasting
  armiesDeployed: (result: { gameState: SerializedGameState }) => void
  attackResult: (result: BattleResult) => void
  territoriesFortified: (result: { gameState: SerializedGameState }) => void
  phaseChanged: (data: {
    phase: GamePhase
    currentPlayer: string
    turn: number
    reinforcementArmies?: number
  }) => void
  capitalElimination: (data: {
    conqueror: string
    eliminated: string
    capitalTerritory: string
    territoriesGained: number
    troopsGained: number
  }) => void
  capitalAttackCheck: (data: { territoryId: string; isCapital: boolean }) => void
  ratingUpdate: (data: {
    changes: Array<{ userId: string; oldRating: number; newRating: number; change: number }>
  }) => void
  'chat-message': (data: {
    roomId: string
    userId: string
    message: string
    timestamp: string
  }) => void
  'lifecycle:update': (data: {
    roomId: string
    status: GameStatus
    lifecyclePhase: GamePhase | 'lobby' | 'initializing'
    turnNumber: number
    currentTurnUserId: string | null
    turnExpiresAt: string | null
    readyCheckStartedAt: string | null
    readyStates: Array<{ userId: string; isReady: boolean; readyAt: string | null }>
    players?: Array<{
      userId: string
      username: string
      joinedAt: string
      isReady: boolean
      readyAt: string | null
    }>
  }) => void
  'room-update': (data: {
    id: string
    status: GameStatus
    lifecyclePhase?: GamePhase | 'lobby' | 'initializing' | null
    turnNumber?: number | null
    currentTurnUserId?: string | null
    turnExpiresAt?: string | null
    readyCheckStartedAt?: string | null
    players?: Array<{
      userId: string
      username: string
      joinedAt: string | Date
      isReady: boolean
      readyAt: string | null
    }>
  }) => void
  error: (data: { event: string; message: string; timestamp: string }) => void
  gameError: (data: { message: string }) => void
}

export interface ClientToServerEvents {
  'join-room': (roomId: string) => void
  'leave-room': (roomId: string) => void
  'game-action': (data: { roomId: string; action: GameAction }) => void
  deployArmies: (data: { roomId: string; territoryId: string; armies: number }) => void
  attack: (data: {
    roomId: string
    fromTerritoryId: string
    toTerritoryId: string
    armies?: number
  }) => void
  checkCapitalAttack: (data: { roomId: string; targetTerritoryId: string }) => void
  fortify: (data: {
    roomId: string
    fromTerritoryId: string
    toTerritoryId: string
    armies: number
  }) => void
  endTurn: (data: { roomId: string }) => void
  'chat-message': (data: { roomId: string; message: string }) => void
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
