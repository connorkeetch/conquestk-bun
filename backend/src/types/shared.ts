/**
 * Shared TypeScript types between frontend and backend
 * These are the core types that both frontend and backend use
 */

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
export type GameStatus = 'waiting' | 'in_progress' | 'completed' | 'abandoned'
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
  'player-joined': (data: { userId: string; socketId: string }) => void
  'player-left': (data: { userId: string; socketId: string }) => void
  'player-disconnected': (data: { userId: string; socketId: string }) => void
  'game-update': (gameState: any) => void
  'game-delta': (delta: any) => void // Delta update for efficient real-time broadcasting
  armiesDeployed: (result: { gameState: any }) => void
  attackResult: (result: any) => void
  territoriesFortified: (result: { gameState: any }) => void
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
  'chat-message': (data: { userId: string; message: string; timestamp: string }) => void
  error: (data: { event: string; message: string; timestamp: string }) => void
  gameError: (data: { message: string }) => void
}

export interface ClientToServerEvents {
  'join-room': (roomId: string) => void
  'leave-room': (roomId: string) => void
  'game-action': (data: { roomId: string; action: any }) => void
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

export interface ApiResponse<T = any> {
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
