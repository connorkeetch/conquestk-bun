import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface LinkPreview {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

export interface ChatMessage {
  id: string
  sender_id: string
  sender_username?: string
  message: string
  message_type: 'game' | 'team' | 'dm'
  game_id?: string
  team_id?: number
  recipient_id?: string
  created_at: string
  edited_at?: string
  deleted_at?: string
  is_read: boolean
  link_previews?: LinkPreview[]
}

export interface ChatConversation {
  id: string
  type: 'game' | 'team' | 'dm'
  messages: ChatMessage[]
  unreadCount: number
  isLoading: boolean
  hasMore: boolean
  typingUsers: { userId: string; username: string }[]
}

interface ChatState {
  conversations: Record<string, ChatConversation>
  totalUnreadDMs: number
  totalUnreadGames: number
  activeConversation: string | null
  isConnected: boolean
}

const initialState: ChatState = {
  conversations: {},
  totalUnreadDMs: 0,
  totalUnreadGames: 0,
  activeConversation: null,
  isConnected: false,
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // Connection status
    setConnected(state, action: PayloadAction<boolean>) {
      state.isConnected = action.payload
    },

    // Set active conversation
    setActiveConversation(state, action: PayloadAction<string | null>) {
      state.activeConversation = action.payload
      // Clear unread count for active conversation
      if (action.payload && state.conversations[action.payload]) {
        state.conversations[action.payload].unreadCount = 0
      }
    },

    // Add a new message
    addMessage(
      state,
      action: PayloadAction<{ message: ChatMessage; currentUserId?: string | null }>,
    ) {
      const { message, currentUserId } = action.payload
      let conversationId: string

      // Determine conversation ID based on message type
      if (message.message_type === 'game' && message.game_id) {
        conversationId = `game:${message.game_id}`
      } else if (message.message_type === 'team' && message.game_id && message.team_id) {
        conversationId = `team:${message.game_id}:${message.team_id}`
      } else if (message.message_type === 'dm') {
        if (!currentUserId) {
          return
        }
        const otherUserId =
          message.sender_id === currentUserId ? message.recipient_id : message.sender_id
        if (!otherUserId) {
          return
        }
        conversationId = `dm:${otherUserId}`
      } else {
        return // Invalid message type
      }

      // Initialize conversation if it doesn't exist
      if (!state.conversations[conversationId]) {
        state.conversations[conversationId] = {
          id: conversationId,
          type: message.message_type,
          messages: [],
          unreadCount: 0,
          isLoading: false,
          hasMore: true,
          typingUsers: [],
        }
      }

      // Add message if it doesn't already exist
      const exists = state.conversations[conversationId].messages.some((m) => m.id === message.id)
      if (!exists) {
        state.conversations[conversationId].messages.push(message)

        // Increment unread if not the active conversation
        if (state.activeConversation !== conversationId && !message.is_read) {
          state.conversations[conversationId].unreadCount++
        }
      }
    },

    // Load chat history
    loadChatHistory(
      state,
      action: PayloadAction<{
        conversationId: string
        messages: ChatMessage[]
        hasMore: boolean
      }>,
    ) {
      const { conversationId, messages, hasMore } = action.payload

      if (!state.conversations[conversationId]) {
        let type: 'game' | 'team' | 'dm'
        if (conversationId.startsWith('game:')) {
          type = 'game'
        } else if (conversationId.startsWith('team:')) {
          type = 'team'
        } else {
          type = 'dm'
        }
        state.conversations[conversationId] = {
          id: conversationId,
          type,
          messages: [],
          unreadCount: 0,
          isLoading: false,
          hasMore: true,
          typingUsers: [],
        }
      }

      // Prepend older messages (history comes in reverse chronological)
      state.conversations[conversationId].messages = [
        ...messages,
        ...state.conversations[conversationId].messages,
      ]
      state.conversations[conversationId].hasMore = hasMore
      state.conversations[conversationId].isLoading = false
    },

    // Set loading state for conversation
    setConversationLoading(
      state,
      action: PayloadAction<{
        conversationId: string
        isLoading: boolean
      }>,
    ) {
      const { conversationId, isLoading } = action.payload
      if (state.conversations[conversationId]) {
        state.conversations[conversationId].isLoading = isLoading
      }
    },

    // Update typing users
    setTypingUser(
      state,
      action: PayloadAction<{
        conversationId: string
        userId: string
        username: string
        isTyping: boolean
      }>,
    ) {
      const { conversationId, userId, username, isTyping } = action.payload

      if (!state.conversations[conversationId]) {
        return
      }

      const typingUsers = state.conversations[conversationId].typingUsers
      const existingIndex = typingUsers.findIndex((u) => u.userId === userId)

      if (isTyping && existingIndex === -1) {
        typingUsers.push({ userId, username })
      } else if (!isTyping && existingIndex !== -1) {
        typingUsers.splice(existingIndex, 1)
      }
    },

    // Update unread counts
    setUnreadCounts(
      state,
      action: PayloadAction<
        {
          conversationType: 'game' | 'team' | 'dm'
          conversationId: string
          unreadCount: number
        }[]
      >,
    ) {
      let totalDMs = 0
      let totalGames = 0

      action.payload.forEach(({ conversationType, conversationId, unreadCount }) => {
        const convId = `${conversationType}:${conversationId}`

        if (state.conversations[convId]) {
          state.conversations[convId].unreadCount = unreadCount
        }

        if (conversationType === 'dm') {
          totalDMs += unreadCount
        } else {
          totalGames += unreadCount
        }
      })

      state.totalUnreadDMs = totalDMs
      state.totalUnreadGames = totalGames
    },

    // Mark messages as read
    markMessagesAsRead(state, action: PayloadAction<string>) {
      const conversationId = action.payload
      if (state.conversations[conversationId]) {
        const previousUnread = state.conversations[conversationId].unreadCount
        state.conversations[conversationId].messages.forEach((msg) => {
          msg.is_read = true
        })
        state.conversations[conversationId].unreadCount = 0

        // Update total counts
        if (conversationId.startsWith('dm:')) {
          state.totalUnreadDMs = Math.max(0, state.totalUnreadDMs - previousUnread)
        } else if (conversationId.startsWith('game:') || conversationId.startsWith('team:')) {
          state.totalUnreadGames = Math.max(0, state.totalUnreadGames - previousUnread)
        }
      }
    },

    // Edit a message
    editMessage(
      state,
      action: PayloadAction<{
        messageId: string
        newMessage: string
        editedAt: string
      }>,
    ) {
      const { messageId, newMessage, editedAt } = action.payload

      // Find and update the message in all conversations
      Object.values(state.conversations).forEach((conv) => {
        const message = conv.messages.find((m) => m.id === messageId)
        if (message) {
          message.message = newMessage
          message.edited_at = editedAt
        }
      })
    },

    // Delete a message
    deleteMessage(state, action: PayloadAction<string>) {
      const messageId = action.payload

      // Mark as deleted in all conversations
      Object.values(state.conversations).forEach((conv) => {
        const message = conv.messages.find((m) => m.id === messageId)
        if (message) {
          message.deleted_at = new Date().toISOString()
        }
      })
    },

    // Clear conversation
    clearConversation(state, action: PayloadAction<string>) {
      const conversationId = action.payload
      if (state.conversations[conversationId]) {
        state.conversations[conversationId].messages = []
        state.conversations[conversationId].unreadCount = 0
      }
    },
  },
})

export const {
  setConnected,
  setActiveConversation,
  addMessage,
  loadChatHistory,
  setConversationLoading,
  setTypingUser,
  setUnreadCounts,
  markMessagesAsRead,
  editMessage,
  deleteMessage,
  clearConversation,
} = chatSlice.actions

export default chatSlice.reducer
