/**
 * Shared TypeScript types between frontend and backend
 * This ensures type consistency across the entire application
 */

// ============================================
// User & Authentication Types
// ============================================

export interface User {
  id: string
  username: string
  email: string
  emailVerified: boolean
  createdAt: Date | string
  updatedAt: Date | string
  lastActive?: Date | string
  skillRating: number
  totalGames: number
  totalWins: number
  totalRankedGames: number
  avatarUrl?: string
  country?: string
  bio?: string
  preferredColor?: string
}

export interface AuthUser extends Omit<User, 'createdAt' | 'updatedAt' | 'lastActive'> {
  token: string
}

export interface AdminRole {
  id: string
  userId: string
  role: 'super_admin' | 'moderator' | 'support'
  permissions: string[]
  grantedBy: string
  grantedAt: Date | string
}

// ============================================
// Game Types
// ============================================

export type GamePhase = 'setup' | 'reinforcement' | 'attack' | 'fortify' | 'finished'
export type GameStatus = 'waiting' | 'in_progress' | 'completed' | 'abandoned' | 'paused'
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

export interface Territory {
  id: string
  name: string
  ownerId: string | null
  armies: number
  continentId?: string
  isCapital?: boolean
  abilities?: TerritoryAbility[]
  adjacentTerritories: string[]
  coordinates?: {
    x: number
    y: number
  }
}

export interface TerritoryAbility {
  type:
    | 'fortress'
    | 'naval_base'
    | 'trade_hub'
    | 'capital'
    | 'artillery'
    | 'mountain_pass'
    | 'magical_nexus'
  name: string
  description: string
  effectType: 'defense' | 'attack' | 'economy' | 'movement' | 'special'
  effectValue: number
}

export interface Player {
  id: string
  userId: string
  username: string
  color: PlayerColor
  territories: string[]
  armies: number
  cards: Card[]
  isEliminated: boolean
  eliminatedAt?: Date | string
  position?: number
  capitalTerritory?: string
  isAI?: boolean
  turnTimeRemaining?: number
  teamId?: number // For team games
}

export interface Card {
  id: string
  territoryId: string
  type: 'infantry' | 'cavalry' | 'artillery' | 'wild'
}

export interface GameState {
  id: string
  roomId: string
  status: GameStatus
  phase: GamePhase
  currentPlayer: string
  players: Player[]
  board: Territory[]
  turn: number
  winner?: string
  startedAt?: Date | string
  endedAt?: Date | string
  settings: GameSettings
  lastAction?: GameAction
  reinforcementArmies?: number
  capitalAssignments?: Record<string, string>
}

export interface GameSettings {
  mapId: string
  gameMode: 'classic' | 'capitals' | 'domination' | 'mission'
  maxPlayers: number
  turnTimer?: number
  fogOfWar: 'off' | 'adjacent' | 'persistent'
  movementSystem: 'classic' | 'sea_routes' | 'airports' | 'unlimited'
  cardTradeMode: 'fixed' | 'progressive' | 'custom'
  startingArmies?: number
  isRanked: boolean
  isPrivate: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance' // Team game settings
  numberOfTeams?: number // Number of teams (2-4)
}

export interface GameAction {
  type: 'deploy' | 'attack' | 'fortify' | 'end_turn' | 'trade_cards'
  playerId: string
  timestamp: Date | string
  data: DeployAction | AttackAction | FortifyAction | EndTurnAction | TradeCardsAction
}

export interface DeployAction {
  territoryId: string
  armies: number
}

export interface AttackAction {
  fromTerritoryId: string
  toTerritoryId: string
  attackerDice?: number[]
  defenderDice?: number[]
  attackerLosses?: number
  defenderLosses?: number
  conquered?: boolean
}

export interface FortifyAction {
  fromTerritoryId: string
  toTerritoryId: string
  armies: number
}

export interface EndTurnAction {
  cardsEarned?: number
}

export interface TradeCardsAction {
  cardIds: string[]
  bonusArmies: number
}

// ============================================
// Battle & Combat Types
// ============================================

export interface BattleResult {
  attackerDice: number[]
  defenderDice: number[]
  attackerLosses: number
  defenderLosses: number
  conquered: boolean
  fromTerritory: string
  toTerritory: string
  capitalElimination?: {
    conqueror: string
    eliminated: string
    capitalTerritory: string
    territoriesGained: number
    troopsGained: number
  }
  gameEnded?: boolean
  gameState?: GameState
}

// ============================================
// Map Types
// ============================================

export interface Map {
  id: string
  name: string
  description?: string
  creatorId: string
  creatorUsername?: string
  imageUrl?: string
  imageWidth: number
  imageHeight: number
  isPublic: boolean
  isFeatured: boolean
  isOfficial: boolean
  tags: string[]
  territories: MapTerritory[]
  continents: MapContinent[]
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived'
  createdAt: Date | string
  updatedAt: Date | string
  rating?: number
  playCount?: number
}

export interface MapTerritory {
  id: string
  territoryId: string
  name: string
  continentId?: string
  boundaryCoords: { x: number; y: number }[]
  centerX: number
  centerY: number
  adjacentTerritories: string[]
  abilities?: TerritoryAbility[]
}

export interface MapContinent {
  id: string
  name: string
  bonusArmies: number
  color: string
  territories: string[]
}

// ============================================
// Room & Lobby Types
// ============================================

export interface GameRoom {
  id: string
  name: string
  hostId: string
  hostUsername?: string
  mapId: string
  mapName?: string
  settings: GameSettings
  players: RoomPlayer[]
  status: 'waiting' | 'starting' | 'in_progress' | 'finished'
  createdAt: Date | string
  startedAt?: Date | string
  gameId?: string
}

export interface RoomPlayer {
  userId: string
  username: string
  isReady: boolean
  color?: PlayerColor
  isHost: boolean
  joinedAt: Date | string
}

// ============================================
// Notification Types
// ============================================

export interface Notification {
  id: string
  userId: string
  type:
    | 'game_invite'
    | 'turn_reminder'
    | 'game_started'
    | 'game_ended'
    | 'friend_request'
    | 'achievement'
    | 'system'
    | 'map_approved'
    | 'map_rejected'
  title: string
  message: string
  data?: Record<string, unknown>
  isRead: boolean
  createdAt: Date | string
  expiresAt?: Date | string
}

// ============================================
// Socket.io Event Types
// ============================================

export interface ServerToClientEvents {
  'player-joined': (data: { userId: string; socketId: string }) => void
  'player-left': (data: { userId: string; socketId: string }) => void
  'player-disconnected': (data: { userId: string; socketId: string }) => void
  'game-update': (gameState: GameState) => void
  armiesDeployed: (result: { gameState: GameState }) => void
  attackResult: (result: BattleResult) => void
  territoriesFortified: (result: { gameState: GameState }) => void
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

export interface LoginResponse {
  user: AuthUser
  token: string
}

export interface RegisterResponse {
  user: AuthUser
  token: string
}

// ============================================
// Statistics Types
// ============================================

export interface UserStats {
  totalGames: number
  totalWins: number
  winRate: number
  averageGameDuration: number
  favoriteMap?: string
  territoriesConquered: number
  armiesDeployed: number
  battlesWon: number
  battlesLost: number
  currentStreak: number
  bestStreak: number
  rank: number
  percentile: number
}

export interface GameStats {
  id: string
  duration: number
  turns: number
  players: number
  winner: string
  winnerUsername: string
  mapName: string
  gameMode: string
  endedAt: Date | string
}

// ============================================
// Admin Types
// ============================================

export interface AdminDashboardStats {
  totalUsers: number
  activeUsers: number
  totalGames: number
  activeGames: number
  totalMaps: number
  pendingMaps: number
  reportedUsers: number
  systemHealth: 'healthy' | 'degraded' | 'down'
}

export interface AdminUserData extends User {
  isAdmin: boolean
  isBanned: boolean
  banReason?: string
  bannedAt?: Date | string
  reportCount: number
  lastReportedAt?: Date | string
}

// ============================================
// Feature Flag Types
// ============================================

export interface FeatureFlag {
  id: string
  flagName: string
  description: string
  isEnabled: boolean
  createdBy?: string
  createdAt: Date | string
  updatedAt: Date | string
}

// ============================================
// Database Query Types
// ============================================

export interface QueryResult<T = unknown> {
  rows: T[]
  rowCount: number | null
}

// Re-export for backward compatibility
export type { QueryResult as DatabaseQueryResult }
