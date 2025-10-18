/**
 * Shared TypeScript types between frontend and backend
 * This ensures type consistency across the entire application
 */

export * from './delta.js'
export * from './lockstep.js'
export * from './messaging.js'
export * from './notifications.js'
export * from './themes.js'

import type { InputFrame, TickChecksum } from './lockstep.js'

// Import messaging types for internal references
import type {
  ConversationCreateAck,
  ConversationCreatedPayload,
  ConversationCreatePayload,
  ConversationMembersAddedPayload,
  ConversationMembersChangedPayload,
  ConversationMembersRemovedPayload,
  ConversationMembersUpdateAck,
  ConversationMembersUpdatePayload,
  ConversationMessageEventPayload,
  ConversationUpdatedPayload,
  MessageSendAck,
  MessageSendPayload,
  ReceiptReadAck,
  ReceiptReadEventPayload,
  ReceiptReadPayload,
  TypingEventPayload,
  TypingEventResponse,
} from './messaging.js'

// ============================================
// Chat Types
// ============================================

// Chat types moved to messaging.ts

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

export type GamePhase = 'reinforcement' | 'attack' | 'fortify' | 'finished'
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
  sector?: string
  sectorId?: string
  isCapital?: boolean
  capitalOwnerId?: string | null
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

export type Metal = 'bronze' | 'silver' | 'gold' | 'diamond'

export type TreasurePayoutMode = 'classic' | 'fixed' | 'none' | 'triangular'

export interface TreasureConfig {
  enabled: boolean
  diamondsPercent: number
  payoutMode: TreasurePayoutMode
  fixedValue?: number
  handCap: number
  diamondSetBonus: number
}

export interface TreasureState {
  totalSetsCashed: number
  nextPayoutIndex: number
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
  treasures?: Metal[]
  mustCashInTreasures?: boolean
}

export interface Card {
  id: string
  territoryId: string
  type: 'infantry' | 'cavalry' | 'artillery' | 'wild'
}

export interface KingOfTheHillConfig {
  targetPoints?: number
  neutralArmies?: number
  rotationInterval?: number | null
  previewTurns?: number
  eligibleTerritoryIds?: string[]
  rotationOrder?: string[]
}

export interface KingOfTheHillState {
  currentHillTerritoryId: string
  points: Record<string, number>
  targetPoints: number
  rotationInterval?: number | null
  turnsUntilRotation?: number | null
  upcomingHillTerritoryId?: string | null
  previewTurns?: number
  neutralArmies: number
  rotationQueue?: string[]
  eligibleTerritoryIds?: string[]
  lastScoreTurn?: number
  lastRotationTurn?: number
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
  assassinationTargets?: Record<string, string>
  status?: GameStatus
  winner?: string
  reinforcementArmies?: number
  startedAt?: Date | string
  endedAt?: Date | string
  lastAction?: GameAction
  settings?: GameConfiguration // Legacy alias for older consumers
  treasureState?: TreasureState
  mustCashInTreasures?: boolean
  conqueredDuringTurn?: boolean
  kingOfTheHillState?: KingOfTheHillState
  resumePhaseAfterReinforcement?: GamePhase | null
  resumeHasAttackedAfterReinforcement?: boolean
  reinforcementHistory?: Array<{
    playerId: string
    territoryId: string
    armies: number
    ts: number
  }>
  fortifyHistory?: Array<{
    playerId: string
    fromTerritoryId: string
    toTerritoryId: string
    armies: number
    ts: number
  }>
  reinforcementBaseline?: Record<string, number>
  rngSeed?: string
  rngState?: {
    a: number
    b: number
    c: number
    d: number
  }
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
  sectorBonuses?: SectorBonus[]
  useTerritoryModifiers?: boolean
  modifierDistribution?: ModifierDistribution
  turnTimer?: number
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  startingArmies?: number
  isRanked?: boolean
  isPrivate?: boolean
  movementSystem?: string
  treasureConfig?: TreasureConfig
  kingOfTheHill?: KingOfTheHillConfig
}

export type MovementType = 'classic_adjacent' | 'adjacent_multi' | 'path_single' | 'path_multi'

export interface SectorBonus {
  id: string
  name: string
  bonusArmies: number
  territories: string[]
}

export type ModifierDistribution = 'none' | 'sparse' | 'balanced' | 'abundant' | 'custom'

export type GameSettings = GameConfiguration

// Align GameAction and subtypes with backend/src/types/game.ts
export type GameAction =
  | DeployAction
  | AttackAction
  | FortifyAction
  | EndTurnAction
  | TradeCardsAction
  | GoBackToReinforcementAction
  | GoBackToAttackAction
  | TransferConquestAction
  | ResignAction

type GameActionType =
  | 'deploy'
  | 'attack'
  | 'fortify'
  | 'end_turn'
  | 'trade_cards'
  | 'go_back_to_reinforcement'
  | 'go_back_to_attack'
  | 'transfer_conquest'
  | 'resign'

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

export type TradeCardsAction = ActionBase<'trade_cards'> & {
  payload?: {
    cards?: string[]
    treasureSet?: [number, number, number] | number[]
  }
}

export type GoBackToReinforcementAction = ActionBase<'go_back_to_reinforcement'> & {
  payload?: undefined
}

export type GoBackToAttackAction = ActionBase<'go_back_to_attack'> & {
  payload?: undefined
}

export type TransferConquestAction = ActionBase<'transfer_conquest'> & {
  payload: {
    fromTerritoryId: string
    toTerritoryId: string
    armies: number
  }
}

export type ResignAction = ActionBase<'resign'> & {
  payload?: undefined
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
  pendingConquestFor?: string | null
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
  sectors: MapSector[]
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
  sectorId?: string
  boundaryCoords: { x: number; y: number }[]
  centerX: number
  centerY: number
  adjacentTerritories: string[]
  abilities?: TerritoryAbility[]
}

export interface MapSector {
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

export interface RealtimeNotification {
  id: string
  type: string
  title: string
  message: string
  createdAt: string
  read?: boolean
  icon?: string
  actionUrl?: string
  actionLabel?: string
  metadata?: Record<string, unknown>
}

import type { GameDelta } from './delta.js'

export interface ServerToClientEvents {
  'player-joined': (data: { roomId: string; player: RoomPlayerEvent }) => void
  'player-left': (data: PlayerLeftEvent) => void
  'player-disconnected': (data: { roomId: string; playerId: string; socketId?: string }) => void
  'game:snapshot': (gameState: GameState) => void
  'game-delta': (delta: GameDelta) => void
  'game-delta-batch': (deltas: GameDelta[]) => void
  'game-action:frame-committed': (frame: InputFrame) => void
  'game-action:checksum': (checksum: TickChecksum) => void
  'game-action:snapshot': (payload: {
    matchId: string
    seq: number
    state: Record<string, unknown>
    frames: InputFrame[]
  }) => void
  'turn:start': (payload: {
    roomId: string
    playerId: string
    username?: string | null
    phase: GamePhase
    turn: number
    reinforcementArmies?: number | null
  }) => void
  // Fog-aware textual logs (CP-only + lifecycle banners)
  'game-log:append': (payload: {
    roomId?: string
    id: string
    t: string
    turn: number
    phase: string
    kind: string
    actor: { id: string; name: string }
    text: string
  }) => void
  'game-log:batch': (payload: {
    roomId?: string
    items: Array<{
      id: string
      t: string
      turn: number
      phase: string
      kind: string
      actor: { id: string; name: string }
      text: string
    }>
  }) => void
  'game-log:reveal': () => void
  'clan:progress': (payload: ClanProgressionSocketPayload) => void
  'message.new': (payload: ConversationMessageEventPayload) => void
  'conversation.message.new': (payload: ConversationMessageEventPayload) => void
  // Live game log append events (windowed, server-emitted)
  'log:append': (payload: { roomId: string; entries: Array<Record<string, unknown>> }) => void
  'conversation.created': (payload: ConversationCreatedPayload) => void
  'conversation.updated': (payload: ConversationUpdatedPayload) => void
  'conversation.members.added': (payload: ConversationMembersAddedPayload) => void
  'conversation.members.removed': (payload: ConversationMembersRemovedPayload) => void
  'conversation.members.changed': (payload: ConversationMembersChangedPayload) => void
  'receipt.read': (payload: ReceiptReadEventPayload) => void
  'typing.start': (payload: TypingEventResponse) => void
  'typing.stop': (payload: TypingEventResponse) => void
  'notification:new': (payload: RealtimeNotification) => void
  // Friends events (align with backend)
  'friend.request.received': (payload: { requesterId: string; requestedAt: string }) => void
  'friend.request.accepted': (payload: { userId: string; acceptedAt: string }) => void
  'friend.request.declined': (payload: { userId: string; at: string }) => void
  'friend.request.cancelled': (payload: { userId: string; at: string }) => void
  'friend.added': (payload: { userId: string; at: string }) => void
  'friend.removed': (payload: { userId: string; at: string }) => void
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
  // Map ping: broadcast a transient territory ping marker
  'ping:territory': (data: {
    roomId: string
    territoryId: string
    userId: string
    username?: string | null
    createdAt: string
  }) => void
  'lifecycle:update': (data: {
    roomId: string
    status: GameLifecycleStatus
    lifecyclePhase: GameLifecyclePhase
    turnNumber: number
    currentTurnUserId: string | null
    turnExpiresAt: string | null
    readyCheckStartedAt: string | null
    timeBankSecondsRemaining?: number | null
    usingTimeBank?: boolean
    // Host replacement (if pending)
    replacementPendingUserId?: string | null
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
    timeBankSecondsRemaining?: number | null
    readyCheckStartedAt?: string | null
    usingTimeBank?: boolean
    // Host replacement (if pending)
    replacementPendingUserId?: string | null
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
  'join-room': (
    roomId: string,
    callback?: (response: {
      ok: boolean
      roomId?: string
      joinedAt?: number
      error?: string
      code?: string
    }) => void,
  ) => void
  // Subscribe as spectator for lifecycle/log streams without game deltas
  'spectate-room': (
    roomId: string,
    callback?: (response: {
      ok: boolean
      roomId?: string
      joinedAt?: number
      error?: string
      code?: string
    }) => void,
  ) => void
  'leave-room': (roomId: string) => void
  'game-action': (
    data: { roomId: string; action: GameAction; idempotencyKey?: string },
    callback?: (response: { ok: boolean; queued?: boolean; acceptedAt?: number }) => void,
  ) => void
  'game-action:resync-request': (
    data: { roomId: string; fromSeq?: number },
    callback?: (response: { ok: boolean; error?: string }) => void,
  ) => void
  checkCapitalAttack: (data: { roomId: string; targetTerritoryId: string }) => void
  'turn:begin': (data: { roomId: string }) => void
  goBackToReinforcement: (data: { roomId: string }) => void
  'host:replacement': (data: {
    roomId: string
    targetUserId: string
    choice: 'neutral' | 'ai'
    aiDifficulty?: 'recruit' | 'commander' | 'grandmaster'
  }) => void
  'chat-message': (data: { roomId: string; message: string }) => void
  'message.send': (
    payload: MessageSendPayload,
    callback?: (response: MessageSendAck) => void,
  ) => void
  'receipt.read': (
    payload: ReceiptReadPayload,
    callback?: (response: ReceiptReadAck) => void,
  ) => void
  'typing.start': (payload: TypingEventPayload) => void
  'typing.stop': (payload: TypingEventPayload) => void
  // Map ping: client emits territory ping
  'ping:territory': (data: { roomId: string; territoryId: string }) => void
  // Heartbeat ping for connection health monitoring
  ping: (callback?: () => void) => void
  // Request missing deltas for gap recovery
  'request-missing-deltas': (
    payload: { roomId: string; fromSeq: number; toSeq: number },
    callback?: (response: { ok: boolean; deltas?: unknown[]; error?: string }) => void,
  ) => void
  'conversation.create': (
    payload: ConversationCreatePayload,
    callback?: (response: ConversationCreateAck) => void,
  ) => void
  'conversation.members.update': (
    payload: ConversationMembersUpdatePayload,
    callback?: (response: ConversationMembersUpdateAck) => void,
  ) => void
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
