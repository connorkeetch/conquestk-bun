/**
 * Shared TypeScript types between frontend and backend
 * This ensures type consistency across the entire application
 */

export * from './notifications'

// ============================================
// Chat Types
// ============================================

export type ChatConversationType = 'game' | 'team' | 'dm'

export interface ChatMessagePayload {
  id: string
  sender_id: string
  sender_username?: string
  message: string
  message_type: ChatConversationType
  game_id?: string | null
  team_id?: number | null
  recipient_id?: string | null
  created_at: string | Date
  edited_at?: string | Date | null
  deleted_at?: string | Date | null
  link_previews?: Array<{
    url: string
    title?: string
    description?: string
    image?: string
    siteName?: string
  }>
}

export interface ChatHistoryPayload {
  conversationId: string
  messageType: ChatConversationType
  messages: ChatMessagePayload[]
}

export interface ChatUnreadCount {
  conversation_type: ChatConversationType
  conversation_id: string
  unread_count: number
}

export interface ChatReactionSummary {
  emoji: string
  users: Array<{ id: string; username: string }>
  count: number
}

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
export type AIDifficulty = 'recruit' | 'commander' | 'grandmaster'
export type GameStatus = 'waiting' | 'in_progress' | 'completed' | 'abandoned' | 'paused'
export type GameLifecycleStatus =
  | 'lobby'
  | 'initializing'
  | 'active'
  | 'completed'
  | 'paused'
  | 'abandoned'
export type GameLifecyclePhase = GamePhase | 'lobby' | 'initializing'
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
  continent?: string
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
  isAi?: boolean
  aiDifficulty?: AIDifficulty | null
  aiPersonalitySeed?: number | null
  turnTimeRemaining?: number
  teamId?: number // For team games
}

export interface Card {
  id: string
  territoryId: string
  type: 'infantry' | 'cavalry' | 'artillery' | 'wild'
}

export interface GameState {
  roomId: string
  players: Player[]
  currentPlayer: string
  phase: GamePhase
  turn: number
  board: Territory[]
  cards: Card[]
  hasAttackedThisTurn?: boolean
  lastBattleResult?: BattleResult
  gameConfig: GameConfiguration
  movementTracking?: Record<string, boolean>
  territoryModifiers?: Record<string, GameTerritoryModifier>
  capitalAssignments?: Record<string, string>
  pendingCapitalAttack?: string | null
  capitalElimination?: {
    conqueror: string
    eliminated: string
    capitalTerritory: string
    territoriesGained: number
    troopsGained: number
  }
  status?: GameStatus
  winner?: string
  reinforcementArmies?: number
  startedAt?: Date | string
  endedAt?: Date | string
  lastAction?: GameAction
  settings?: GameConfiguration // Legacy alias for older consumers
}

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

export interface GameConfiguration {
  movementType: MovementType
  allowTeamPlay?: boolean
  teamMode?: 'none' | 'teams' | 'auto_balance'
  numberOfTeams?: number | null
  teamAssignments?: Record<number, string[]>
  maxPlayers: number
  mapId?: string
  gameMode?: string
  continentBonuses?: ContinentBonus[]
  useTerritoryModifiers?: boolean
  modifierDistribution?: ModifierDistribution
  turnTimer?: number
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  cardTradeMode?: 'fixed' | 'progressive' | 'custom'
  startingArmies?: number
  isRanked?: boolean
  isPrivate?: boolean
  movementSystem?: string
}

export type MovementType = 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi'

export interface ContinentBonus {
  id: string
  name: string
  bonusArmies: number
  territories: string[]
}

export type ModifierDistribution = 'none' | 'sparse' | 'balanced' | 'abundant' | 'custom'

export type GameSettings = GameConfiguration

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
  settings: GameConfiguration
  players: RoomPlayer[]
  status: 'waiting' | 'starting' | 'in_progress' | 'finished'
  createdAt: Date | string
  startedAt?: Date | string
  gameId?: string
}

export interface RoomPlayer {
  id: string
  userId?: string
  aiPlayerId?: string | null
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
// Clan Progression Events
// ============================================

export const CLAN_PROGRESS_EVENT = 'clan:progress' as const

export interface ClanProgressionSocketPayload {
  clanId: string
  gameId: string
  userId: string
  xpAwarded: number
  matchesPlayed: number
  matchesWon: number
  placement: number
  territories: number
  armies: number
  eliminated: boolean
  progression: {
    totalXp: number
    level: number
    currentLevelXp: number
    nextLevelXp: number
    xpIntoLevel: number
    xpToNextLevel: number
    progressPercent: number
  }
  objectiveUpdates: Array<{
    objectiveId: string
    progressValue: number
    completed: boolean
  }>
}

export type ClanProgressEventHandler = (payload: ClanProgressionSocketPayload) => void

export interface SocketEventBridge {
  on(event: string, handler: (...args: unknown[]) => unknown): unknown
  off?(event: string, handler: (...args: unknown[]) => unknown): unknown
}

export const subscribeToClanProgress = (
  socket: SocketEventBridge,
  handler: ClanProgressEventHandler,
): (() => void) => {
  const wrappedHandler: (...args: unknown[]) => void = (...args) => {
    const [payload] = args
    if (payload && typeof payload === 'object') {
      handler(payload as ClanProgressionSocketPayload)
    }
  }

  socket.on(CLAN_PROGRESS_EVENT, wrappedHandler)
  return () => {
    if (typeof socket.off === 'function') {
      socket.off(CLAN_PROGRESS_EVENT, wrappedHandler)
    }
  }
}

// ============================================
// Socket.io Event Types
// ============================================

export interface RoomPlayerEvent {
  id: string
  userId?: string | null
  aiPlayerId?: string | null
  username: string
  joinedAt: string
  isReady: boolean
  readyAt: string | null
  teamId?: number | null
  isAi: boolean
  aiDifficulty?: AIDifficulty | null
  aiPersonalitySeed?: number | null
}

export interface PlayerLeftEvent {
  roomId: string
  playerSlotId: string
  userId?: string | null
  aiPlayerId?: string | null
  isAi: boolean
}

export interface ServerToClientEvents {
  'player-joined': (data: { roomId: string; player: RoomPlayerEvent }) => void
  'player-left': (data: PlayerLeftEvent) => void
  'player-disconnected': (data: { roomId: string; playerId: string; socketId?: string }) => void
  'game-update': (gameState: GameState) => void
  'game-delta': (delta: Record<string, unknown>) => void
  armiesDeployed: (result: { gameState: GameState }) => void
  attackResult: (result: BattleResult) => void
  territoriesFortified: (result: { gameState: GameState }) => void
  'chat:message': (message: ChatMessagePayload) => void
  'chat:error': (data: { error: string }) => void
  'chat:history': (payload: ChatHistoryPayload) => void
  'chat:unread-counts': (counts: ChatUnreadCount[]) => void
  'chat:message-deleted': (data: { messageId: string }) => void
  'chat:message-edited': (data: {
    messageId: string
    newMessage: string
    editedAt: Date | string
  }) => void
  'chat:user-typing': (data: {
    userId: string
    username: string
    isTyping: boolean
    conversationType: ChatConversationType
    conversationId: string
  }) => void
  'chat:reactions-updated': (data: { messageId: string; reactions: ChatReactionSummary[] }) => void
  'clan:progress': (payload: ClanProgressionSocketPayload) => void
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
    status: GameLifecycleStatus
    lifecyclePhase: GameLifecyclePhase
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
    status: GameLifecycleStatus
    lifecyclePhase?: GameLifecyclePhase
    turnNumber?: number | null
    currentTurnUserId?: string | null
    turnExpiresAt?: string | null
    readyCheckStartedAt?: string | null
    players?: Array<{
      userId: string
      username: string
      joinedAt: string
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
  'chat:send': (data: {
    message: string
    messageType: ChatConversationType
    gameId?: string
    teamId?: number
    recipientId?: string
  }) => void
  'chat:load-history': (data: {
    messageType: ChatConversationType
    conversationId: string
    limit?: number
    offset?: number
  }) => void
  'chat:get-unread': () => void
  'chat:mark-read': (data: {
    conversationType: ChatConversationType
    conversationId: string
  }) => void
  'chat:delete': (data: { messageId: string }) => void
  'chat:edit': (data: { messageId: string; newMessage: string }) => void
  'chat:typing': (data: {
    conversationType: ChatConversationType
    conversationId: string
    isTyping: boolean
  }) => void
  'chat:add-reaction': (data: { messageId: string; emoji: string }) => void
  'chat:remove-reaction': (data: { messageId: string; emoji: string }) => void
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
