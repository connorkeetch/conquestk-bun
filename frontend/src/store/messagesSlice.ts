import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type {
  ConversationCreatedPayload,
  ConversationMemberEvent,
  ConversationMembersAddedPayload,
  ConversationMembersChangedPayload,
  ConversationMembersRemovedPayload,
  ConversationMessageEventPayload,
  ConversationUpdatedPayload,
  ReceiptReadEventPayload,
  TypingEventResponse,
} from '@shared/types'
import {
  ensureDirectConversation as ensureDirectConversationRequest,
  ensureGameConversation as ensureGameConversationRequest,
  ensureTeamConversation as ensureTeamConversationRequest,
  fetchConversationDetail,
  fetchConversationMessages,
  fetchConversations,
  fetchUnreadSummary,
} from '../services/messagesService'
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationMembership,
  ConversationMessage,
  ConversationMessageSummary,
  ConversationSummary,
  UnreadSummaryEntry,
} from '../types/messages'
import type { RootState } from './index'

const toIsoString = (value: string | Date | null | undefined): string => {
  if (!value) {
    return new Date().toISOString()
  }
  return value instanceof Date ? value.toISOString() : value
}

const normalizeMetadata = (metadata?: Record<string, unknown> | null): Record<string, unknown> => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }
  return metadata
}

interface ConversationEntity extends ConversationSummary {
  membership: ConversationMembership
  unreadCount: number
  lastMessage?: ConversationMessageSummary
}

interface MessagesState {
  conversations: Record<string, ConversationEntity>
  messages: Record<string, ConversationMessage[]>
  hasMore: Record<string, boolean>
  loadingMessages: Record<string, boolean>
  typing: Record<string, Record<string, string>>
  activeConversationId: string | null
  loadingInbox: boolean
  inboxError: string | null
  unreadSummaryFetched: boolean
  pendingUnread: Record<string, number>
}

const initialState: MessagesState = {
  conversations: {},
  messages: {},
  hasMore: {},
  loadingMessages: {},
  typing: {},
  activeConversationId: null,
  loadingInbox: false,
  inboxError: null,
  unreadSummaryFetched: false,
  pendingUnread: {},
}

const adaptConversation = (item: ConversationListItem): ConversationEntity => ({
  ...item.conversation,
  createdAt: toIsoString(item.conversation.createdAt),
  updatedAt: toIsoString(item.conversation.updatedAt),
  memberRoles: item.conversation.memberRoles.map((member) => ({
    ...member,
    joinedAt: toIsoString(member.joinedAt),
    shadowMuted: Boolean(member.shadowMuted),
    username: member.username,
  })),
  membership: {
    ...item.membership,
    joinedAt: toIsoString(item.membership.joinedAt),
    lastReadAt: item.membership.lastReadAt ? toIsoString(item.membership.lastReadAt) : null,
  },
  unreadCount: item.unreadCount,
  lastMessage: item.lastMessage
    ? {
        ...item.lastMessage,
        createdAt: toIsoString(item.lastMessage.createdAt),
        metadata: normalizeMetadata(item.lastMessage.metadata),
      }
    : undefined,
})

const adaptConversationDetail = (detail: ConversationDetail): ConversationEntity =>
  adaptConversation(detail)

const adaptMessage = (message: ConversationMessageEventPayload): ConversationMessage => ({
  id: message.id,
  conversationId: message.conversationId,
  senderId: message.senderId ?? null,
  body: message.body,
  createdAt: toIsoString(message.createdAt),
  metadata: normalizeMetadata(message.metadata),
})

const adaptFetchedMessage = (message: ConversationMessage): ConversationMessage => ({
  id: message.id,
  conversationId: message.conversationId,
  senderId: message.senderId,
  body: message.body,
  createdAt: toIsoString(message.createdAt),
  metadata: normalizeMetadata(message.metadata),
})

const ensureMessagesArray = (
  state: MessagesState,
  conversationId: string,
): ConversationMessage[] => {
  if (!state.messages[conversationId]) {
    state.messages[conversationId] = []
  }
  return state.messages[conversationId]
}

const insertMessageChronologically = (
  messages: ConversationMessage[],
  message: ConversationMessage,
) => {
  const exists = messages.some((entry) => entry.id === message.id)
  if (exists) {
    return
  }

  if (messages.length === 0) {
    messages.push(message)
    return
  }

  const insertIndex = messages.findIndex((entry) => entry.createdAt > message.createdAt)
  if (insertIndex === -1) {
    messages.push(message)
  } else {
    messages.splice(insertIndex, 0, message)
  }
}

const prependMessages = (messages: ConversationMessage[], batch: ConversationMessage[]) => {
  const deduped = batch.filter((message) => !messages.some((entry) => entry.id === message.id))
  messages.unshift(...deduped)
  messages.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
}

const mergeMembers = (
  current: ConversationEntity,
  additions: ConversationMemberEvent[],
  removals: string[],
  roleUpdates: ConversationMemberEvent[],
) => {
  if (additions.length === 0 && removals.length === 0 && roleUpdates.length === 0) {
    return
  }

  const roleMap = new Map(current.memberRoles.map((member) => [member.userId, member]))

  for (const removal of removals) {
    roleMap.delete(removal)
  }

  for (const addition of additions) {
    const existing = roleMap.get(addition.userId)
    if (existing) {
      roleMap.set(addition.userId, {
        ...existing,
        role: addition.role,
        username: addition.username ?? existing.username,
      })
    } else {
      roleMap.set(addition.userId, {
        userId: addition.userId,
        role: addition.role,
        joinedAt: new Date().toISOString(),
        shadowMuted: false,
        username: addition.username,
      })
    }
  }

  for (const update of roleUpdates) {
    const existing = roleMap.get(update.userId)
    if (existing) {
      roleMap.set(update.userId, {
        ...existing,
        role: update.role,
        username: update.username ?? existing.username,
      })
    }
  }

  current.memberRoles = Array.from(roleMap.values())
  current.memberIds = current.memberRoles.map((member) => member.userId)
}

const removeConversation = (state: MessagesState, conversationId: string) => {
  if (state.activeConversationId === conversationId) {
    state.activeConversationId = null
  }
  delete state.conversations[conversationId]
  delete state.messages[conversationId]
  delete state.hasMore[conversationId]
  delete state.loadingMessages[conversationId]
  delete state.typing[conversationId]
  delete state.pendingUnread[conversationId]
}

const applyConversationEntity = (state: MessagesState, entity: ConversationEntity) => {
  const current = state.conversations[entity.id]
  if (current) {
    state.conversations[entity.id] = {
      ...current,
      ...entity,
      memberRoles: entity.memberRoles,
      memberIds: entity.memberIds,
      membership: {
        ...current.membership,
        ...entity.membership,
      },
      unreadCount: entity.unreadCount ?? current.unreadCount,
      lastMessage: entity.lastMessage ?? current.lastMessage,
    }
  } else {
    const unread = state.pendingUnread[entity.id] ?? entity.unreadCount ?? 0
    delete state.pendingUnread[entity.id]
    state.conversations[entity.id] = {
      ...entity,
      unreadCount: unread,
    }
  }
}

export const loadInbox = createAsyncThunk<ConversationListItem[], void, { rejectValue: string }>(
  'messages/loadInbox',
  async (_payload, { rejectWithValue }) => {
    try {
      return await fetchConversations()
    } catch (_error) {
      return rejectWithValue('Failed to load conversations')
    }
  },
)

export const loadConversationMessages = createAsyncThunk<
  { conversationId: string; messages: ConversationMessage[]; hasMore: boolean },
  { conversationId: string; before?: string; limit?: number },
  { rejectValue: string }
>('messages/loadConversationMessages', async (payload, { rejectWithValue }) => {
  try {
    const messages = await fetchConversationMessages(payload.conversationId, {
      before: payload.before,
      limit: payload.limit,
    })
    const hasMore = messages.length === (payload.limit ?? 50)
    return { conversationId: payload.conversationId, messages, hasMore }
  } catch (_error) {
    return rejectWithValue('Failed to load messages')
  }
})

export const refreshConversation = createAsyncThunk<
  ConversationDetail,
  string,
  { rejectValue: string }
>('messages/refreshConversation', async (conversationId, { rejectWithValue }) => {
  try {
    return await fetchConversationDetail(conversationId, { markRead: false })
  } catch (_error) {
    return rejectWithValue('Failed to refresh conversation')
  }
})

export const loadUnreadSummary = createAsyncThunk<
  UnreadSummaryEntry[],
  void,
  { rejectValue: string }
>('messages/loadUnreadSummary', async (_payload, { rejectWithValue }) => {
  try {
    return await fetchUnreadSummary()
  } catch (_error) {
    return rejectWithValue('Failed to load unread summary')
  }
})
export const ensureDirectConversation = createAsyncThunk<
  ConversationDetail,
  string,
  { rejectValue: string }
>('messages/ensureDirectConversation', async (targetUserId, { rejectWithValue }) => {
  try {
    return await ensureDirectConversationRequest(targetUserId)
  } catch (_error) {
    return rejectWithValue('Failed to start direct conversation')
  }
})

export const ensureGameConversation = createAsyncThunk<
  ConversationDetail,
  string,
  { rejectValue: string }
>('messages/ensureGameConversation', async (gameId, { rejectWithValue }) => {
  try {
    return await ensureGameConversationRequest(gameId)
  } catch (_error) {
    return rejectWithValue('Failed to ensure game conversation')
  }
})

export const ensureTeamConversation = createAsyncThunk<
  ConversationDetail,
  { gameId: string; teamId: number },
  { rejectValue: string }
>('messages/ensureTeamConversation', async ({ gameId, teamId }, { rejectWithValue }) => {
  try {
    return await ensureTeamConversationRequest(gameId, teamId)
  } catch (_error) {
    return rejectWithValue('Failed to ensure team conversation')
  }
})

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    setActiveConversationId(state, action: PayloadAction<string | null>) {
      state.activeConversationId = action.payload
      if (action.payload && state.conversations[action.payload]) {
        state.conversations[action.payload].unreadCount = 0
        delete state.pendingUnread[action.payload]
      }
    },
    messageReceived(
      state,
      action: PayloadAction<{ message: ConversationMessageEventPayload; currentUserId?: string }>,
    ) {
      const normalized = adaptMessage(action.payload.message)
      const messages = ensureMessagesArray(state, normalized.conversationId)
      insertMessageChronologically(messages, normalized)

      const conversation = state.conversations[normalized.conversationId]
      if (conversation) {
        conversation.updatedAt = normalized.createdAt
        conversation.lastMessage = {
          id: normalized.id,
          body: normalized.body,
          senderId: normalized.senderId,
          createdAt: normalized.createdAt,
          metadata: normalized.metadata,
        }
        const fromSelf = normalized.senderId && normalized.senderId === action.payload.currentUserId
        if (!fromSelf && state.activeConversationId !== normalized.conversationId) {
          conversation.unreadCount = (conversation.unreadCount ?? 0) + 1
        }
      } else if (
        !action.payload.currentUserId ||
        normalized.senderId !== action.payload.currentUserId
      ) {
        state.pendingUnread[normalized.conversationId] =
          (state.pendingUnread[normalized.conversationId] ?? 0) + 1
      }
    },
    conversationCreated(
      state,
      action: PayloadAction<{
        payload: ConversationCreatedPayload
        membership: ConversationMembership
      }>,
    ) {
      const { conversation: summary, members } = action.payload.payload
      const normalizedSummary: ConversationSummary = {
        ...summary,
        createdAt: toIsoString(summary.createdAt),
        updatedAt: toIsoString(summary.updatedAt),
        metadata: normalizeMetadata(summary.metadata),
        memberIds: summary.memberIds,
        memberRoles: members.map((member) => ({
          userId: member.userId,
          role: member.role,
          joinedAt: new Date().toISOString(),
          shadowMuted: false,
          username: member.username,
        })),
      }

      const entity: ConversationEntity = {
        ...normalizedSummary,
        membership: action.payload.membership,
        unreadCount: state.pendingUnread[summary.id] ?? 0,
      }

      delete state.pendingUnread[summary.id]
      state.conversations[summary.id] = entity
    },
    conversationUpserted(state, action: PayloadAction<ConversationEntity>) {
      applyConversationEntity(state, action.payload)
    },
    conversationMembersAdded(state, action: PayloadAction<ConversationMembersAddedPayload>) {
      const conversation = state.conversations[action.payload.conversationId]
      if (!conversation) return

      mergeMembers(conversation, action.payload.members, [], [])
    },
    conversationMembersRemoved(state, action: PayloadAction<ConversationMembersRemovedPayload>) {
      const conversation = state.conversations[action.payload.conversationId]
      if (!conversation) return

      mergeMembers(
        conversation,
        [],
        action.payload.members.map((member) => member.userId),
        [],
      )
    },
    conversationMembersChanged(state, action: PayloadAction<ConversationMembersChangedPayload>) {
      const conversation = state.conversations[action.payload.conversationId]
      if (!conversation) return

      mergeMembers(conversation, [], [], action.payload.members)
    },
    conversationUpdated(state, action: PayloadAction<ConversationUpdatedPayload>) {
      const conversation = state.conversations[action.payload.conversation.id]
      if (!conversation) return

      const summary = action.payload.conversation

      state.conversations[summary.id] = {
        ...conversation,
        ...summary,
        createdAt: toIsoString(summary.createdAt),
        updatedAt: toIsoString(summary.updatedAt),
        metadata: normalizeMetadata(summary.metadata),
        memberIds: summary.memberIds,
        memberRoles: conversation.memberRoles,
        membership: conversation.membership,
        lastMessage: conversation.lastMessage,
      }
    },
    receiptReadReceived(
      state,
      action: PayloadAction<{ payload: ReceiptReadEventPayload; currentUserId?: string }>,
    ) {
      const conversation = state.conversations[action.payload.payload.conversationId]
      if (!conversation) return

      if (action.payload.payload.userId === action.payload.currentUserId) {
        conversation.unreadCount = 0
        delete state.pendingUnread[action.payload.payload.conversationId]
      }

      if (conversation.membership?.lastReadMessageId) {
        conversation.membership.lastReadMessageId = action.payload.payload.lastReadMessageId
        conversation.membership.lastReadAt = action.payload.payload.readAt
      }
    },
    typingStarted(state, action: PayloadAction<TypingEventResponse>) {
      const existing = state.typing[action.payload.conversationId] ?? {}
      existing[action.payload.userId] = action.payload.username
      state.typing[action.payload.conversationId] = existing
    },
    typingStopped(state, action: PayloadAction<TypingEventResponse>) {
      const existing = state.typing[action.payload.conversationId]
      if (!existing) return
      delete existing[action.payload.userId]
      if (Object.keys(existing).length === 0) {
        delete state.typing[action.payload.conversationId]
      }
    },
    unreadSummaryApplied(state, action: PayloadAction<UnreadSummaryEntry[]>) {
      for (const entry of action.payload) {
        if (state.conversations[entry.conversationId]) {
          state.conversations[entry.conversationId].unreadCount = entry.unreadCount
        } else {
          state.pendingUnread[entry.conversationId] = entry.unreadCount
        }
      }
      state.unreadSummaryFetched = true
    },
    conversationRemoved(state, action: PayloadAction<string>) {
      removeConversation(state, action.payload)
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadInbox.pending, (state) => {
        state.loadingInbox = true
        state.inboxError = null
      })
      .addCase(loadInbox.fulfilled, (state, action) => {
        state.loadingInbox = false
        for (const item of action.payload) {
          const entity = adaptConversation(item)
          applyConversationEntity(state, entity)
        }
      })
      .addCase(loadInbox.rejected, (state, action) => {
        state.loadingInbox = false
        state.inboxError = action.payload ?? 'Failed to load conversations'
      })
      .addCase(loadConversationMessages.pending, (state, action) => {
        state.loadingMessages[action.meta.arg.conversationId] = true
      })
      .addCase(loadConversationMessages.fulfilled, (state, action) => {
        state.loadingMessages[action.payload.conversationId] = false
        state.hasMore[action.payload.conversationId] = action.payload.hasMore
        const messages = ensureMessagesArray(state, action.payload.conversationId)
        const normalized = action.payload.messages.map(adaptFetchedMessage)
        prependMessages(messages, normalized)
      })
      .addCase(loadConversationMessages.rejected, (state, action) => {
        state.loadingMessages[action.meta.arg.conversationId] = false
        state.inboxError = action.payload ?? 'Failed to load messages'
      })
      .addCase(refreshConversation.fulfilled, (state, action) => {
        const entity = adaptConversationDetail(action.payload)
        applyConversationEntity(state, entity)
      })
      .addCase(loadUnreadSummary.fulfilled, (state, action) => {
        for (const entry of action.payload) {
          if (state.conversations[entry.conversationId]) {
            state.conversations[entry.conversationId].unreadCount = entry.unreadCount
          } else {
            state.pendingUnread[entry.conversationId] = entry.unreadCount
          }
        }
        state.unreadSummaryFetched = true
      })
      .addCase(ensureDirectConversation.fulfilled, (state, action) => {
        const entity = adaptConversationDetail(action.payload)
        applyConversationEntity(state, entity)
      })
      .addCase(ensureGameConversation.fulfilled, (state, action) => {
        const entity = adaptConversationDetail(action.payload)
        applyConversationEntity(state, entity)
      })
      .addCase(ensureTeamConversation.fulfilled, (state, action) => {
        const entity = adaptConversationDetail(action.payload)
        applyConversationEntity(state, entity)
      })
  },
})

export const messagesActions = messagesSlice.actions

export const messagesReducer = messagesSlice.reducer

export const selectAllConversations = (state: RootState): ConversationEntity[] =>
  Object.values(state.messages.conversations)

export const selectConversationById = (
  state: RootState,
  conversationId: string,
): ConversationEntity | undefined => state.messages.conversations[conversationId]

export const selectMessagesForConversation = (
  state: RootState,
  conversationId: string,
): ConversationMessage[] => state.messages.messages[conversationId] ?? []

export const selectTypingUsers = (
  state: RootState,
  conversationId: string,
): Record<string, string> => state.messages.typing[conversationId] ?? {}

export const selectHasMoreMessages = (state: RootState, conversationId: string): boolean =>
  state.messages.hasMore[conversationId] ?? true

export const selectActiveConversationId = (state: RootState): string | null =>
  state.messages.activeConversationId

export const selectMessagesInboxLoading = (state: RootState): boolean => state.messages.loadingInbox

export const selectMessagesInboxError = (state: RootState): string | null =>
  state.messages.inboxError

export const selectTotalUnreadMessages = (state: RootState): number => {
  const conversationUnread = Object.values(state.messages.conversations).reduce(
    (total, conversation) => total + (conversation.unreadCount ?? 0),
    0,
  )
  const pendingUnread = Object.values(state.messages.pendingUnread).reduce(
    (total, count) => total + count,
    0,
  )
  return conversationUnread + pendingUnread
}

export default messagesReducer
