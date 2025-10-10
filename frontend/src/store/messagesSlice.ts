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
} from '@conquestk/shared'
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
// Narrowed RootState for selectors in strict-optional scope to avoid importing the full store
type RootState = { messages: MessagesState }

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
  hiddenConversationIds: Record<string, boolean>
  // When we optimistically mark a conversation read, set a timestamp to suppress
  // stale unread updates racing in from server for a short grace window.
  pendingRead: Record<string, number>
  // Persistently suppress server unread overrides for a conversation until a
  // genuinely new message arrives (not from self). This avoids badges reappearing
  // without new activity when switching UI tabs.
  suppressServerUnread: Record<string, boolean>
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
  hiddenConversationIds: {},
  pendingRead: {},
  suppressServerUnread: {},
}

const adaptConversation = (item: ConversationListItem): ConversationEntity => ({
  ...item.conversation,
  createdAt: toIsoString(item.conversation.createdAt),
  updatedAt: toIsoString(item.conversation.updatedAt),
  memberRoles: item.conversation.memberRoles.map((member) => ({
    userId: member.userId,
    role: member.role,
    joinedAt: toIsoString(member.joinedAt),
    shadowMuted: Boolean(member.shadowMuted),
    ...(typeof member.username === 'string' ? { username: member.username } : {}),
  })),
  membership: {
    ...item.membership,
    joinedAt: toIsoString(item.membership.joinedAt),
    lastReadAt: item.membership.lastReadAt ? toIsoString(item.membership.lastReadAt) : null,
  },
  unreadCount: item.unreadCount,
  ...(item.lastMessage
    ? {
        lastMessage: {
          ...item.lastMessage,
          createdAt: toIsoString(item.lastMessage.createdAt),
          metadata: normalizeMetadata(item.lastMessage.metadata),
        },
      }
    : {}),
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
        ...(typeof addition.username === 'string' ? { username: addition.username } : {}),
      })
    } else {
      roleMap.set(addition.userId, {
        userId: addition.userId,
        role: addition.role,
        joinedAt: new Date().toISOString(),
        shadowMuted: false,
        ...(typeof addition.username === 'string' ? { username: addition.username } : {}),
      })
    }
  }

  for (const update of roleUpdates) {
    const existing = roleMap.get(update.userId)
    if (existing) {
      roleMap.set(update.userId, {
        ...existing,
        role: update.role,
        ...(typeof update.username === 'string' ? { username: update.username } : {}),
      })
    }
  }

  current.memberRoles = Array.from(roleMap.values())
  current.memberIds = current.memberRoles.map((member) => member.userId)
}

const applyConversationEntity = (state: MessagesState, incoming: ConversationEntity) => {
  if (state.hiddenConversationIds[incoming.id]) {
    return
  }
  let entity = incoming
  const current = state.conversations[entity.id]
  // Respect recent optimistic read within a short window
  const ts = state.pendingRead[entity.id]
  if ((ts && Date.now() - ts < 2000) || state.suppressServerUnread[entity.id]) {
    entity = { ...entity, unreadCount: 0 }
  }
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
      ...(entity.lastMessage
        ? { lastMessage: entity.lastMessage }
        : current.lastMessage
          ? { lastMessage: current.lastMessage }
          : {}),
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
    const opts = {
      ...(typeof payload.before === 'string' ? { before: payload.before } : {}),
      ...(typeof payload.limit === 'number' ? { limit: payload.limit } : {}),
    }
    const messages = await fetchConversationMessages(payload.conversationId, opts)
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
      if (action.payload && state.hiddenConversationIds[action.payload]) {
        state.activeConversationId = null
        return
      }
      state.activeConversationId = action.payload
      if (action.payload && state.conversations[action.payload]) {
        state.conversations[action.payload].unreadCount = 0
        delete state.pendingUnread[action.payload]
        state.pendingRead[action.payload] = Date.now()
        state.suppressServerUnread[action.payload] = true
      }
    },
    // Optimistically clear unread count and start grace window
    markReadOptimistic(state, action: PayloadAction<string>) {
      const id = action.payload
      if (state.conversations[id]) {
        state.conversations[id].unreadCount = 0
      }
      delete state.pendingUnread[id]
      state.pendingRead[id] = Date.now()
      state.suppressServerUnread[id] = true
    },
    // Remove a conversation and all associated local state (messages, typing, flags)
    removeConversationLocal(state, action: PayloadAction<string>) {
      const id = action.payload
      if (state.activeConversationId === id) {
        state.activeConversationId = null
      }
      delete state.messages[id]
      delete state.hasMore[id]
      delete state.loadingMessages[id]
      delete state.typing[id]
      delete state.pendingUnread[id]
      delete state.conversations[id]
    },
    // Prune archived conversations; optionally restrict to specific kinds
    pruneArchivedConversations(
      state,
      action: PayloadAction<{ kinds?: Array<ConversationSummary['kind']> } | undefined>,
    ) {
      const allowedKinds = action.payload?.kinds
      for (const [id, conv] of Object.entries(state.conversations)) {
        const isKindAllowed = !allowedKinds || allowedKinds.includes(conv.kind)
        if (conv.isArchived && isKindAllowed) {
          if (state.activeConversationId === id) {
            state.activeConversationId = null
          }
          delete state.messages[id]
          delete state.hasMore[id]
          delete state.loadingMessages[id]
          delete state.typing[id]
          delete state.pendingUnread[id]
          delete state.conversations[id]
        }
      }
    },
    messageReceived(
      state,
      action: PayloadAction<{ message: ConversationMessageEventPayload; currentUserId?: string }>,
    ) {
      const conversationId = action.payload.message.conversationId
      delete state.hiddenConversationIds[conversationId]
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
        if (!fromSelf) {
          if (state.activeConversationId !== normalized.conversationId) {
            conversation.unreadCount = (conversation.unreadCount ?? 0) + 1
            state.suppressServerUnread[normalized.conversationId] = false
          } else {
            // When viewing the conversation, keep unread at 0 and maintain suppression
            conversation.unreadCount = 0
            state.suppressServerUnread[normalized.conversationId] = true
          }
        } else {
          // Self-authored messages should never create unread; maintain suppression
          conversation.unreadCount = 0
          state.suppressServerUnread[normalized.conversationId] = true
        }
      } else if (
        !action.payload.currentUserId ||
        normalized.senderId !== action.payload.currentUserId
      ) {
        state.pendingUnread[normalized.conversationId] =
          (state.pendingUnread[normalized.conversationId] ?? 0) + 1
        state.suppressServerUnread[normalized.conversationId] = false
      }
    },
    // Optimistically update the lastMessage preview without inserting into the message list.
    // The server's message.new event will reconcile with the authoritative payload.
    updateLastMessagePreview(
      state,
      action: PayloadAction<{
        conversationId: string
        body: string
        senderId?: string | null
        createdAt?: string
        metadata?: Record<string, unknown>
      }>,
    ) {
      const { conversationId, body, senderId, createdAt, metadata } = action.payload
      const conversation = state.conversations[conversationId]
      if (!conversation) return
      const ts = createdAt ?? new Date().toISOString()
      conversation.updatedAt = ts
      conversation.lastMessage = {
        id: conversation.lastMessage?.id ?? `local-${Date.now()}`,
        body,
        senderId: senderId ?? null,
        createdAt: ts,
        metadata: metadata ?? {},
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
      delete state.hiddenConversationIds[summary.id]
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
          ...(typeof member.username === 'string' ? { username: member.username } : {}),
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
      delete state.hiddenConversationIds[action.payload.id]
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

      state.conversations[action.payload.conversation.id] = {
        ...conversation,
        ...action.payload.conversation,
        membership: conversation.membership,
        ...(conversation.lastMessage ? { lastMessage: conversation.lastMessage } : {}),
      }
    },
    archiveConversation(state, action: PayloadAction<{ conversationId: string }>) {
      const { conversationId } = action.payload
      state.hiddenConversationIds[conversationId] = true
      delete state.conversations[conversationId]
      delete state.messages[conversationId]
      delete state.typing[conversationId]
      delete state.hasMore[conversationId]
      delete state.loadingMessages[conversationId]
      delete state.pendingUnread[conversationId]
      delete state.suppressServerUnread[conversationId]
      if (state.activeConversationId === conversationId) {
        state.activeConversationId = null
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
        delete state.pendingRead[action.payload.payload.conversationId]
        state.suppressServerUnread[action.payload.payload.conversationId] = true
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
        if (state.hiddenConversationIds[entry.conversationId]) {
          continue
        }
        if (state.suppressServerUnread[entry.conversationId]) {
          if (state.conversations[entry.conversationId]) {
            state.conversations[entry.conversationId].unreadCount = 0
          } else {
            state.pendingUnread[entry.conversationId] = 0
          }
        } else if (state.conversations[entry.conversationId]) {
          state.conversations[entry.conversationId].unreadCount = entry.unreadCount
        } else {
          state.pendingUnread[entry.conversationId] = entry.unreadCount
        }
      }
      state.unreadSummaryFetched = true
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
          if (state.hiddenConversationIds[entry.conversationId]) {
            continue
          }
          const ts = state.pendingRead[entry.conversationId]
          const withinGrace = ts && Date.now() - ts < 2000
          const suppressed = state.suppressServerUnread[entry.conversationId]
          if (state.conversations[entry.conversationId]) {
            state.conversations[entry.conversationId].unreadCount =
              withinGrace || suppressed ? 0 : entry.unreadCount
          } else {
            state.pendingUnread[entry.conversationId] =
              withinGrace || suppressed ? 0 : entry.unreadCount
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
  // Default to false until we've fetched at least once and know there are older messages
  state.messages.hasMore[conversationId] ?? false

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

// Only counts unread for direct/group threads for the navbar Messages badge
export const selectTotalUnreadDirectGroup = (state: RootState): number => {
  let total = 0
  for (const conversation of Object.values(state.messages.conversations)) {
    if (
      (conversation.kind === 'direct' || conversation.kind === 'group') &&
      !conversation.isArchived
    ) {
      total += conversation.unreadCount ?? 0
    }
  }
  return total
}

export default messagesReducer
