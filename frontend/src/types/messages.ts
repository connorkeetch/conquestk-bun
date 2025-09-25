import type { ConversationMemberEvent } from '@shared/types'

export type ConversationKind = 'direct' | 'group' | 'game'

export interface ConversationMemberRole extends ConversationMemberEvent {
  joinedAt: string
  shadowMuted: boolean
}

export interface ConversationSummary {
  id: string
  kind: ConversationKind
  title: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  isArchived: boolean
  isReadOnly: boolean
  gameId: string | null
  metadata: Record<string, unknown>
  memberIds: string[]
  memberRoles: ConversationMemberRole[]
}

export interface ConversationMembership {
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  isMuted: boolean
  isPinned: boolean
  shadowMuted: boolean
  lastReadMessageId: string | null
  lastReadAt: string | null
}

export interface ConversationMessageSummary {
  id: string
  body: string
  senderId: string | null
  createdAt: string
  metadata: Record<string, unknown>
}

export interface ConversationListItem {
  conversation: ConversationSummary
  membership: ConversationMembership
  unreadCount: number
  lastMessage?: ConversationMessageSummary
}

export interface ConversationDetail extends ConversationListItem {}

export interface ConversationMessage {
  id: string
  conversationId: string
  senderId: string | null
  body: string
  createdAt: string
  metadata: Record<string, unknown>
}

export interface UnreadSummaryEntry {
  conversationId: string
  unreadCount: number
}
