/**
 * Shared TypeScript types between frontend and backend
 * These are the core types that both frontend and backend use
 */

import type { GameDelta } from '@risk-game/shared/types'
import type { ClanProgressionSocketPayload } from './clans'
import type { BattleResult, GameAction, SerializedGameState } from './game'
import type { Player as RoomPlayer } from './gameRoom'

export interface ConversationEventSummary {
  id: string
  kind: 'direct' | 'group' | 'game' | 'team'
  title: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  isArchived: boolean
  isReadOnly: boolean
  gameId: string | null
  metadata: Record<string, unknown>
  memberIds: string[]
}

export interface ConversationMemberEvent {
  userId: string
  role: 'owner' | 'admin' | 'member'
  username?: string
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

export interface ConversationMembersChangedPayload {
  conversationId: string
  members: ConversationMemberEvent[]
}

export interface ConversationUpdatedPayload {
  conversation: ConversationEventSummary
}

export interface MessageSendPayload {
  conversationId: string
  body: string
  clientMessageId?: string
  metadata?: Record<string, unknown>
}

export interface MessageSendAck {
  ok: boolean
  error?: string
  code?: string
  message?: ConversationMessageEventPayload
}

export interface ConversationCreatePayload {
  kind: ConversationEventSummary['kind']
  targetUserId?: string
  title?: string | null
  memberIds?: string[]
  metadata?: Record<string, unknown>
}

export interface ConversationCreateAck {
  ok: boolean
  error?: string
  code?: string
  conversation?: ConversationEventSummary & { memberIds: string[] }
}

export interface ConversationMembersUpdatePayload {
  conversationId: string
  add?: string[]
  remove?: string[]
  roleUpdates?: Array<{ userId: string; role: 'admin' | 'member' }>
  archive?: boolean
}

export interface ConversationMemberUpdateError {
  type: 'add' | 'remove' | 'role' | 'archive'
  userId?: string
  code: string
  error: string
}

export interface ConversationMembersUpdateAck {
  ok: boolean
  error?: string
  code?: string
  added?: ConversationMemberEvent[]
  removed?: string[]
  roleUpdates?: ConversationMemberEvent[]
  archived?: boolean
  conversation?: ConversationEventSummary
  errors?: ConversationMemberUpdateError[]
}

export interface TypingEventPayload {
  conversationId: string
}

export interface TypingEventResponse {
  conversationId: string
  userId: string
  username: string
}

export interface ReceiptReadPayload {
  conversationId: string
}

export interface ReceiptReadAck {
  ok: boolean
  error?: string
  code?: string
}

export interface ReceiptReadEventPayload {
  conversationId: string
  userId: string
  lastReadMessageId: string | null
  readAt: string
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

export type GamePhase = 'reinforcement' | 'attack' | 'fortify' | 'finished'
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
  aiDifficulty?: RoomPlayer['aiDifficulty']
  aiPersonalitySeed?: number | null
  selectedColor?: string | null
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
  'game-update': (gameState: SerializedGameState) => void
  'game-delta': (delta: GameDelta) => void // Delta update for efficient real-time broadcasting
  'game-delta-batch': (deltas: GameDelta[]) => void
  'clan:progress': (payload: ClanProgressionSocketPayload) => void
  'message.new': (payload: ConversationMessageEventPayload) => void
  'conversation.message.new': (payload: ConversationMessageEventPayload) => void
  'conversation.created': (payload: ConversationCreatedPayload) => void
  'conversation.updated': (payload: ConversationUpdatedPayload) => void
  'conversation.members.added': (payload: ConversationMembersAddedPayload) => void
  'conversation.members.removed': (payload: ConversationMembersRemovedPayload) => void
  'conversation.members.changed': (payload: ConversationMembersChangedPayload) => void
  'receipt.read': (payload: ReceiptReadEventPayload) => void
  'typing.start': (payload: TypingEventResponse) => void
  'typing.stop': (payload: TypingEventResponse) => void
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
  'ping:territory': (data: {
    roomId: string
    territoryId: string
    userId: string
    username?: string | null
    createdAt: string
  }) => void
  'notification:new': (payload: RealtimeNotification) => void
  // Friends events
  'friend.request.received': (payload: { requesterId: string; requestedAt: string }) => void
  'friend.request.accepted': (payload: { userId: string; acceptedAt: string }) => void
  'friend.request.declined': (payload: { userId: string; at: string }) => void
  'friend.request.cancelled': (payload: { userId: string; at: string }) => void
  'friend.added': (payload: { userId: string; at: string }) => void
  'friend.removed': (payload: { userId: string; at: string }) => void
  'lifecycle:update': (data: {
    roomId: string
    status: GameStatus
    lifecyclePhase: GamePhase | 'lobby' | 'initializing'
    turnNumber: number
    currentTurnUserId: string | null
    turnExpiresAt: string | null
    readyCheckStartedAt: string | null
    timeBankSecondsRemaining?: number | null
    usingTimeBank?: boolean
    replacementPendingUserId?: string | null
    statusMessage?: string
    statusMessageLevel?: 'error' | 'info' | 'warn'
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
    timeBankSecondsRemaining?: number | null
    readyCheckStartedAt?: string | null
    usingTimeBank?: boolean
    replacementPendingUserId?: string | null
    statusMessage?: string
    statusMessageLevel?: 'error' | 'info' | 'warn'
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
  'player:resign': (data: { roomId: string }) => void
  deployArmies: (
    data: { roomId: string; territoryId: string; armies: number },
    callback?: (response: { ok: boolean; queued?: boolean; version?: number }) => void,
  ) => void
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
  transferConquestArmies: (data: {
    roomId: string
    fromTerritoryId: string
    toTerritoryId: string
    armies: number
  }) => void
  undoFortify: (data: { roomId: string }) => void
  endTurn: (data: { roomId: string }) => void
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
  'ping:territory': (data: { roomId: string; territoryId: string }) => void
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
