/**
 * Shared TypeScript types between frontend and backend
 * These are the core types that both frontend and backend use
 */

import type { GameDelta } from './deltaUpdates'
import type { BattleResult, GameAction, SerializedGameState } from './game'

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

export interface ConversationEventSummary {
  id: string
  kind: 'direct' | 'group' | 'game'
  title: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  isArchived: boolean
  isReadOnly: boolean
  gameId: string | null
  metadata: Record<string, unknown>
}

export interface ConversationMemberEvent {
  userId: string
  role: 'owner' | 'admin' | 'member'
}

export interface ConversationCreatedPayload {
  conversation: ConversationEventSummary
  members: ConversationMemberEvent[]
}

export interface ConversationMembersAddedPayload {
  conversationId: string
  members: ConversationMemberEvent[]
}

export interface ConversationMembersRemovedPayload {
  conversationId: string
  members: Array<{ userId: string }>
}

export interface ConversationMessageEventPayload {
  conversationId: string
  id: string
  senderId: string | null
  body: string
  createdAt: string
  metadata: Record<string, unknown>
}

export interface ChatReactionSummary {
  emoji: string
  users: Array<{ id: string; username: string }>
  count: number
}

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
    conversationType: Extract<ChatConversationType, 'game' | 'dm'>
    conversationId: string
  }) => void
  'chat:reactions-updated': (data: { messageId: string; reactions: ChatReactionSummary[] }) => void
  'conversation.created': (payload: ConversationCreatedPayload) => void
  'conversation.members.added': (payload: ConversationMembersAddedPayload) => void
  'conversation.members.removed': (payload: ConversationMembersRemovedPayload) => void
  'conversation.message.new': (payload: ConversationMessageEventPayload) => void
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
  'notification:new': (payload: RealtimeNotification) => void
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
    conversationType: Extract<ChatConversationType, 'game' | 'dm'>
    conversationId: string
  }) => void
  'chat:delete': (data: { messageId: string }) => void
  'chat:edit': (data: { messageId: string; newMessage: string }) => void
  'chat:typing': (data: {
    conversationType: Extract<ChatConversationType, 'game' | 'dm'>
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
