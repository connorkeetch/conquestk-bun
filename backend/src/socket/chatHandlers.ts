import type { Server, Socket } from 'socket.io'
import {
  type ConversationMessageRecord,
  type ConversationWithMembers,
  ensureDirectConversation,
  getConversationDetail,
  getUnreadSummary,
  listMessages as listConversationMessages,
  markConversationRead,
  sendMessage as sendConversationMessage,
} from '../services/conversationService'
import notificationService from '../services/notificationService'
import type {
  ChatHistoryPayload,
  ChatMessagePayload,
  ChatUnreadCount,
  ClientToServerEvents,
  ServerToClientEvents,
} from '../types/shared'
import { logger } from '../utils/logger'

type SocketWithUser = Socket<ClientToServerEvents, ServerToClientEvents> & {
  userId?: string
  username?: string
}

export const setupChatHandlers = (
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: SocketWithUser,
) => {
  const requireUserId = (): string | null => {
    const { userId } = socket
    if (!userId) {
      socket.emit('chat:error', { error: 'Not authenticated' })
      return null
    }
    return userId
  }

  const sendUnreadCounts = async (userId: string) => {
    const summary = await getUnreadSummary(userId)
    const counts: ChatUnreadCount[] = []

    for (const entry of summary) {
      try {
        const detail = await getConversationDetail(entry.conversationId, userId)
        if (detail.conversation.kind !== 'direct') continue
        const partnerId = detail.conversation.memberIds.find((id) => id !== userId)
        if (!partnerId) continue
        counts.push({
          conversation_type: 'dm',
          conversation_id: partnerId,
          unread_count: entry.unreadCount,
        })
      } catch (error) {
        logger.warn('Failed to compute unread summary entry', {
          conversationId: entry.conversationId,
          error,
        })
      }
    }

    socket.emit('chat:unread-counts', counts)
  }

  const toChatMessagePayload = (
    message: ConversationMessageRecord,
    senderUsername: string,
    partnerId: string,
  ): ChatMessagePayload => {
    const createdAt =
      message.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : new Date(message.createdAt).toISOString()
    const editedAt = message.editedAt
      ? message.editedAt instanceof Date
        ? message.editedAt.toISOString()
        : new Date(message.editedAt).toISOString()
      : null
    const deletedAt = message.deletedAt
      ? message.deletedAt instanceof Date
        ? message.deletedAt.toISOString()
        : new Date(message.deletedAt).toISOString()
      : null

    return {
      id: message.id,
      sender_id: message.senderId ?? 'system',
      sender_username: senderUsername,
      message: message.body,
      message_type: 'dm',
      game_id: null,
      team_id: null,
      recipient_id: partnerId,
      created_at: createdAt,
      edited_at: editedAt,
      deleted_at: deletedAt,
      link_previews: [],
    }
  }

  const ensureDmConversation = async (
    userId: string,
    partnerId: string,
  ): Promise<ConversationWithMembers> => {
    const conversation = await ensureDirectConversation(userId, partnerId)
    await socket.join(`conversation:${conversation.id}`)
    return conversation
  }

  socket.on('chat:send', async (data) => {
    try {
      const userId = requireUserId()
      if (!userId) return

      if (data.messageType !== 'dm') {
        socket.emit('chat:error', { error: 'Legacy game/team chat is no longer supported' })
        return
      }

      const recipientId = data.recipientId
      if (!recipientId) {
        socket.emit('chat:error', { error: 'recipientId is required for DMs' })
        return
      }

      const trimmed = data.message?.trim()
      if (!trimmed) {
        socket.emit('chat:error', { error: 'Message cannot be empty' })
        return
      }

      const conversation = await ensureDmConversation(userId, recipientId)

      const message = await sendConversationMessage({
        conversationId: conversation.id,
        senderId: userId,
        body: trimmed,
      })

      const senderInfo = await getUserInfo(userId)
      const payload = toChatMessagePayload(message, senderInfo.username, recipientId)

      socket.emit('chat:message', payload)
      io.to(`user:${recipientId}`).emit('chat:message', payload)

      await sendDMNotification(recipientId, userId, senderInfo.username, trimmed)
    } catch (error) {
      logger.error('Error sending DM message via socket', error)
      socket.emit('chat:error', { error: 'Failed to send message' })
    }
  })

  socket.on('chat:load-history', async (data) => {
    try {
      const userId = requireUserId()
      if (!userId) return

      if (data.messageType !== 'dm') {
        socket.emit('chat:error', { error: 'Legacy game/team chat history is not supported' })
        return
      }

      const partnerId = data.conversationId
      if (!partnerId) {
        socket.emit('chat:error', { error: 'conversationId is required for DMs' })
        return
      }

      const conversation = await ensureDmConversation(userId, partnerId)
      const messages = await listConversationMessages(conversation.id, userId, data.limit ?? 50)

      const usernameCache = new Map<string, string>()
      const getUsername = async (id: string | null): Promise<string> => {
        if (!id) return 'System'
        if (!usernameCache.has(id)) {
          const info = await getUserInfo(id)
          usernameCache.set(id, info.username)
        }
        return usernameCache.get(id) ?? 'Unknown User'
      }

      const historyMessages: ChatMessagePayload[] = []
      for (const message of messages) {
        const senderUsername = await getUsername(message.senderId)
        historyMessages.push(toChatMessagePayload(message, senderUsername, partnerId))
      }

      const historyPayload: ChatHistoryPayload = {
        conversationId: partnerId,
        messageType: 'dm',
        messages: historyMessages,
      }

      socket.emit('chat:history', historyPayload)
    } catch (error) {
      logger.error('Error loading DM history via socket', error)
      socket.emit('chat:error', { error: 'Failed to load chat history' })
    }
  })

  socket.on('chat:get-unread', async () => {
    try {
      const userId = requireUserId()
      if (!userId) return
      await sendUnreadCounts(userId)
    } catch (error) {
      logger.error('Error fetching unread summary via socket', error)
      socket.emit('chat:error', { error: 'Failed to get unread counts' })
    }
  })

  socket.on('chat:mark-read', async (data) => {
    try {
      const userId = requireUserId()
      if (!userId) return

      if (data.conversationType !== 'dm') {
        socket.emit('chat:error', { error: 'Legacy game/team mark-read is not supported' })
        return
      }

      const partnerId = data.conversationId
      if (!partnerId) {
        socket.emit('chat:error', { error: 'conversationId is required for DMs' })
        return
      }

      const conversation = await ensureDmConversation(userId, partnerId)
      await markConversationRead(conversation.id, userId)
      await sendUnreadCounts(userId)
    } catch (error) {
      logger.error('Error marking DM conversation read via socket', error)
    }
  })

  socket.on('chat:typing', async (data) => {
    try {
      const userId = requireUserId()
      if (!userId) return

      if (data.conversationType !== 'dm') {
        socket.emit('chat:error', { error: 'Legacy game/team typing is not supported' })
        return
      }

      const partnerId = data.conversationId
      if (!partnerId) return

      const userInfo = await getUserInfo(userId)
      io.to(`user:${partnerId}`).emit('chat:user-typing', {
        userId,
        username: userInfo.username,
        isTyping: Boolean(data.isTyping),
        conversationType: 'dm',
        conversationId: userId,
      })
    } catch (error) {
      logger.error('Error broadcasting typing indicator', error)
    }
  })

  socket.on('chat:delete', () => {
    socket.emit('chat:error', {
      error: 'Message deletion is not supported in the new chat system yet',
    })
  })

  socket.on('chat:edit', () => {
    socket.emit('chat:error', {
      error: 'Message editing is not supported in the new chat system yet',
    })
  })

  socket.on('chat:add-reaction', () => {
    socket.emit('chat:error', {
      error: 'Message reactions are not supported in the new chat system yet',
    })
  })

  socket.on('chat:remove-reaction', () => {
    socket.emit('chat:error', {
      error: 'Message reactions are not supported in the new chat system yet',
    })
  })
}

// Helper function to get user info
async function getUserInfo(userId: string): Promise<{ username: string }> {
  const { query } = require('../config/database')
  const result = await query('SELECT username FROM users WHERE id = $1', [userId])
  return result.rows[0] || { username: 'Unknown User' }
}

// Helper function to send DM notification
async function sendDMNotification(
  recipientId: string,
  senderId: string,
  senderUsername: string,
  message: string,
): Promise<void> {
  const preview = message.length > 140 ? `${message.substring(0, 137)}...` : message
  const sendPush = await notificationService.shouldSendDMPush(recipientId)

  await notificationService.createInAppNotification(recipientId, {
    type: 'chat_message',
    title: `New message from ${senderUsername}`,
    message: preview || 'You received a new message',
    data: { senderId, senderUsername },
    actionUrl: `/messages/${senderId}`,
    actionLabel: 'Open chat',
    sendPush,
    pushPayload: {
      title: `💬 ${senderUsername} sent a message`,
      body: preview || 'Open ConquestK to read the message',
      data: {
        url: `/messages/${senderId}`,
        senderId,
      },
    },
  })
}
