import type { Server, Socket } from 'socket.io'
import { chatService } from '../services/chatService'
import { logger } from '../utils/logger'
import { query } from '../config/database'

export const setupChatHandlers = (io: Server, socket: Socket) => {
  // Send a message
  socket.on('chat:send', async (data: {
    message: string
    messageType: 'game' | 'team' | 'dm'
    gameId?: string
    teamId?: number
    recipientId?: string
  }) => {
    try {
      const userId = (socket as any).userId
      if (!userId) {
        socket.emit('chat:error', { error: 'Not authenticated' })
        return
      }
      
      // Basic validation
      if (!data.message || data.message.trim().length === 0) {
        socket.emit('chat:error', { error: 'Message cannot be empty' })
        return
      }
      
      if (data.message.length > 500) {
        socket.emit('chat:error', { error: 'Message too long (max 500 characters)' })
        return
      }
      
      // Send the message
      const message = await chatService.sendMessage({
        senderId: userId,
        message: data.message.trim(),
        messageType: data.messageType,
        gameId: data.gameId,
        teamId: data.teamId,
        recipientId: data.recipientId
      })
      
      // Get sender username
      const senderInfo = await getUserInfo(userId)
      const messageWithSender = {
        ...message,
        sender_username: senderInfo.username
      }
      
      // Emit to appropriate recipients
      if (data.messageType === 'game' && data.gameId) {
        // Emit to all players in the game room
        io.to(`game:${data.gameId}`).emit('chat:message', messageWithSender)
        
      } else if (data.messageType === 'team' && data.gameId && data.teamId) {
        // Emit to team members
        io.to(`team:${data.gameId}:${data.teamId}`).emit('chat:message', messageWithSender)
        
      } else if (data.messageType === 'dm' && data.recipientId) {
        // Emit to sender and recipient
        socket.emit('chat:message', messageWithSender)
        io.to(`user:${data.recipientId}`).emit('chat:message', messageWithSender)
        
        // Send push notification for DM
        await sendDMNotification(data.recipientId, userId, senderInfo.username, data.message)
      }
      
    } catch (error: any) {
      logger.error('Error sending message:', error)
      socket.emit('chat:error', { error: error.message || 'Failed to send message' })
    }
  })
  
  // Load chat history
  socket.on('chat:load-history', async (data: {
    messageType: 'game' | 'team' | 'dm'
    conversationId: string
    limit?: number
    offset?: number
  }) => {
    try {
      const userId = (socket as any).userId
      if (!userId) {
        socket.emit('chat:error', { error: 'Not authenticated' })
        return
      }
      
      const messages = await chatService.getChatHistory(
        data.messageType,
        data.conversationId,
        userId,
        data.limit || 50,
        data.offset || 0
      )
      
      socket.emit('chat:history', {
        conversationId: data.conversationId,
        messageType: data.messageType,
        messages
      })
      
    } catch (error: any) {
      logger.error('Error loading chat history:', error)
      socket.emit('chat:error', { error: 'Failed to load chat history' })
    }
  })
  
  // Get unread counts
  socket.on('chat:get-unread', async () => {
    try {
      const userId = (socket as any).userId
      if (!userId) {
        socket.emit('chat:error', { error: 'Not authenticated' })
        return
      }
      
      const unreadCounts = await chatService.getUnreadCounts(userId)
      socket.emit('chat:unread-counts', unreadCounts)
      
    } catch (error: any) {
      logger.error('Error getting unread counts:', error)
      socket.emit('chat:error', { error: 'Failed to get unread counts' })
    }
  })
  
  // Mark messages as read
  socket.on('chat:mark-read', async (data: {
    conversationType: 'game' | 'dm'
    conversationId: string
  }) => {
    try {
      const userId = (socket as any).userId
      if (!userId) {
        socket.emit('chat:error', { error: 'Not authenticated' })
        return
      }
      
      if (data.conversationType === 'dm') {
        await chatService.markMessagesAsRead(userId, data.conversationId)
      } else if (data.conversationType === 'game') {
        await chatService.markGameMessagesAsRead(userId, data.conversationId)
      }
      
      // Send updated unread counts
      const unreadCounts = await chatService.getUnreadCounts(userId)
      socket.emit('chat:unread-counts', unreadCounts)
      
    } catch (error: any) {
      logger.error('Error marking messages as read:', error)
    }
  })
  
  // Delete a message
  socket.on('chat:delete', async (data: { messageId: string }) => {
    try {
      const userId = (socket as any).userId
      if (!userId) {
        socket.emit('chat:error', { error: 'Not authenticated' })
        return
      }
      
      const deleted = await chatService.deleteMessage(data.messageId, userId)
      if (deleted) {
        socket.emit('chat:message-deleted', { messageId: data.messageId })
        // TODO: Emit to other users in the conversation
      } else {
        socket.emit('chat:error', { error: 'Cannot delete this message' })
      }
      
    } catch (error: any) {
      logger.error('Error deleting message:', error)
      socket.emit('chat:error', { error: 'Failed to delete message' })
    }
  })
  
  // Edit a message
  socket.on('chat:edit', async (data: { 
    messageId: string
    newMessage: string 
  }) => {
    try {
      const userId = (socket as any).userId
      if (!userId) {
        socket.emit('chat:error', { error: 'Not authenticated' })
        return
      }
      
      if (!data.newMessage || data.newMessage.trim().length === 0) {
        socket.emit('chat:error', { error: 'Message cannot be empty' })
        return
      }
      
      const edited = await chatService.editMessage(
        data.messageId, 
        userId, 
        data.newMessage.trim()
      )
      
      if (edited) {
        socket.emit('chat:message-edited', { 
          messageId: data.messageId,
          newMessage: data.newMessage.trim(),
          editedAt: new Date()
        })
        // TODO: Emit to other users in the conversation
      } else {
        socket.emit('chat:error', { error: 'Cannot edit this message' })
      }
      
    } catch (error: any) {
      logger.error('Error editing message:', error)
      socket.emit('chat:error', { error: 'Failed to edit message' })
    }
  })
  
  // Typing indicator
  socket.on('chat:typing', async (data: {
    conversationType: 'game' | 'dm'
    conversationId: string
    isTyping: boolean
  }) => {
    try {
      const userId = (socket as any).userId
      if (!userId) return
      
      const userInfo = await getUserInfo(userId)
      
      if (data.conversationType === 'game') {
        socket.to(`game:${data.conversationId}`).emit('chat:user-typing', {
          userId,
          username: userInfo.username,
          isTyping: data.isTyping,
          conversationType: 'game',
          conversationId: data.conversationId
        })
      } else if (data.conversationType === 'dm') {
        io.to(`user:${data.conversationId}`).emit('chat:user-typing', {
          userId,
          username: userInfo.username,
          isTyping: data.isTyping,
          conversationType: 'dm',
          conversationId: userId
        })
      }
    } catch (error) {
      logger.error('Error broadcasting typing indicator:', error)
    }
  })

  // Add reaction to message
  socket.on('chat:add-reaction', async (data: {
    messageId: string
    emoji: string
  }) => {
    try {
      const userId = (socket as any).userId
      if (!userId) {
        socket.emit('chat:error', { error: 'Not authenticated' })
        return
      }

      const success = await chatService.addReaction(data.messageId, userId, data.emoji)
      
      if (success) {
        const reactions = await chatService.getMessageReactions(data.messageId)
        
        // Get the message to find the conversation
        const messageResult = await query(
          `SELECT message_type, game_id, sender_id, recipient_id FROM chat_messages WHERE id = $1`,
          [data.messageId]
        )
        
        if (messageResult.rows.length > 0) {
          const message = messageResult.rows[0]
          
          // Broadcast to appropriate room/users
          if (message.message_type === 'game' && message.game_id) {
            io.to(`game:${message.game_id}`).emit('chat:reactions-updated', {
              messageId: data.messageId,
              reactions
            })
          } else if (message.message_type === 'dm') {
            // Send to both users in DM
            const userIds = [message.sender_id, message.recipient_id]
            userIds.forEach(uid => {
              const userSocket = Array.from(io.sockets.sockets.values())
                .find(s => (s as any).userId === uid)
              if (userSocket) {
                userSocket.emit('chat:reactions-updated', {
                  messageId: data.messageId,
                  reactions
                })
              }
            })
          }
        }
      }
    } catch (error) {
      logger.error('Error adding reaction:', error)
      socket.emit('chat:error', { error: 'Failed to add reaction' })
    }
  })

  // Remove reaction from message
  socket.on('chat:remove-reaction', async (data: {
    messageId: string
    emoji: string
  }) => {
    try {
      const userId = (socket as any).userId
      if (!userId) {
        socket.emit('chat:error', { error: 'Not authenticated' })
        return
      }

      const success = await chatService.removeReaction(data.messageId, userId, data.emoji)
      
      if (success) {
        const reactions = await chatService.getMessageReactions(data.messageId)
        
        // Get the message to find the conversation
        const messageResult = await query(
          `SELECT message_type, game_id, sender_id, recipient_id FROM chat_messages WHERE id = $1`,
          [data.messageId]
        )
        
        if (messageResult.rows.length > 0) {
          const message = messageResult.rows[0]
          
          // Broadcast to appropriate room/users
          if (message.message_type === 'game' && message.game_id) {
            io.to(`game:${message.game_id}`).emit('chat:reactions-updated', {
              messageId: data.messageId,
              reactions
            })
          } else if (message.message_type === 'dm') {
            // Send to both users in DM
            const userIds = [message.sender_id, message.recipient_id]
            userIds.forEach(uid => {
              const userSocket = Array.from(io.sockets.sockets.values())
                .find(s => (s as any).userId === uid)
              if (userSocket) {
                userSocket.emit('chat:reactions-updated', {
                  messageId: data.messageId,
                  reactions
                })
              }
            })
          }
        }
      }
    } catch (error) {
      logger.error('Error removing reaction:', error)
      socket.emit('chat:error', { error: 'Failed to remove reaction' })
    }
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
  message: string
): Promise<void> {
  // TODO: Implement push notification
  // For now, just add to the notifications table
  const { query } = require('../config/database')
  const { v4: uuidv4 } = require('uuid')
  
  await query(
    `INSERT INTO notifications (id, user_id, type, title, message, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
    [
      uuidv4(),
      recipientId,
      'chat_message',
      `New message from ${senderUsername}`,
      message.substring(0, 100), // Truncate for notification
      JSON.stringify({ senderId, senderUsername }),
    ]
  )
}