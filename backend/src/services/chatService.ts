import { query } from '../config/database'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'

export interface ChatMessage {
  id: string
  sender_id: string
  sender_username?: string
  message: string
  message_type: 'game' | 'team' | 'dm'
  game_id?: string
  team_id?: number
  recipient_id?: string
  created_at: Date
  edited_at?: Date
  deleted_at?: Date
  is_read: boolean
}

export interface SendMessageData {
  senderId: string
  message: string
  messageType: 'game' | 'team' | 'dm'
  gameId?: string
  teamId?: number
  recipientId?: string
}

class ChatService {
  /**
   * Send a message
   */
  async sendMessage(data: SendMessageData): Promise<ChatMessage> {
    const messageId = uuidv4()
    
    try {
      // Check DM privacy settings if it's a DM
      if (data.messageType === 'dm' && data.recipientId) {
        const canSendDM = await this.canSendDMTo(data.senderId, data.recipientId)
        if (!canSendDM) {
          throw new Error('User has restricted direct messages')
        }
      }
      
      const result = await query(
        `INSERT INTO chat_messages (
          id, sender_id, message, message_type, 
          game_id, team_id, recipient_id, created_at, is_read
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, FALSE)
        RETURNING *`,
        [
          messageId,
          data.senderId,
          data.message,
          data.messageType,
          data.gameId || null,
          data.teamId || null,
          data.recipientId || null
        ]
      )
      
      // Update unread count for recipient
      if (data.messageType === 'dm' && data.recipientId) {
        await this.incrementUnreadCount(data.recipientId, 'dm', data.senderId)
      } else if (data.messageType === 'game' && data.gameId) {
        // We'll track game unread counts per user
        await this.incrementGameUnreadForAllPlayers(data.gameId, data.senderId)
      }
      
      return result.rows[0]
    } catch (error) {
      logger.error('Error sending message:', error)
      throw error
    }
  }
  
  /**
   * Get chat history
   */
  async getChatHistory(
    messageType: 'game' | 'team' | 'dm',
    conversationId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ChatMessage[]> {
    try {
      let queryText: string
      let queryParams: any[]
      
      if (messageType === 'game') {
        queryText = `
          SELECT m.*, u.username as sender_username
          FROM chat_messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.message_type = 'game' 
            AND m.game_id = $1
            AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC
          LIMIT $2 OFFSET $3`
        queryParams = [conversationId, limit, offset]
        
      } else if (messageType === 'dm') {
        queryText = `
          SELECT m.*, u.username as sender_username
          FROM chat_messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.message_type = 'dm'
            AND m.deleted_at IS NULL
            AND (
              (m.sender_id = $1 AND m.recipient_id = $2)
              OR (m.sender_id = $2 AND m.recipient_id = $1)
            )
          ORDER BY m.created_at DESC
          LIMIT $3 OFFSET $4`
        queryParams = [userId, conversationId, limit, offset]
        
      } else {
        // Team chat - not implemented in MVP
        return []
      }
      
      const result = await query(queryText, queryParams)
      
      // Mark messages as read
      if (messageType === 'dm') {
        await this.markMessagesAsRead(userId, conversationId)
      } else if (messageType === 'game') {
        await this.markGameMessagesAsRead(userId, conversationId)
      }
      
      return result.rows.reverse() // Reverse to get chronological order
    } catch (error) {
      logger.error('Error getting chat history:', error)
      throw error
    }
  }
  
  /**
   * Check if user can send DM based on privacy settings
   */
  async canSendDMTo(senderId: string, recipientId: string): Promise<boolean> {
    try {
      // Get recipient's privacy setting
      const privacyResult = await query(
        `SELECT dm_privacy FROM user_preferences WHERE user_id = $1`,
        [recipientId]
      )
      
      if (privacyResult.rows.length === 0 || !privacyResult.rows[0].dm_privacy) {
        // Default to 'friends' if no preference set
        return this.areUsersFriends(senderId, recipientId)
      }
      
      const dmPrivacy = privacyResult.rows[0].dm_privacy
      
      if (dmPrivacy === 'anyone') {
        return true
      } else if (dmPrivacy === 'nobody') {
        return false
      } else if (dmPrivacy === 'friends') {
        return this.areUsersFriends(senderId, recipientId)
      }
      
      return false
    } catch (error) {
      logger.error('Error checking DM permissions:', error)
      return false
    }
  }
  
  /**
   * Check if two users are friends
   */
  async areUsersFriends(userId1: string, userId2: string): Promise<boolean> {
    try {
      const result = await query(
        `SELECT 1 FROM friendships 
         WHERE status = 'accepted'
           AND ((user_id = $1 AND friend_id = $2) 
                OR (user_id = $2 AND friend_id = $1))`,
        [userId1, userId2]
      )
      
      return result.rows.length > 0
    } catch (error) {
      logger.error('Error checking friendship:', error)
      return false
    }
  }
  
  /**
   * Mark messages as read in a DM conversation
   */
  async markMessagesAsRead(userId: string, otherUserId: string): Promise<void> {
    try {
      await query(
        `UPDATE chat_messages 
         SET is_read = TRUE 
         WHERE message_type = 'dm'
           AND recipient_id = $1 
           AND sender_id = $2
           AND is_read = FALSE`,
        [userId, otherUserId]
      )
      
      // Reset unread count
      await query(
        `UPDATE unread_message_counts 
         SET unread_count = 0, last_read_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 
           AND conversation_type = 'dm' 
           AND conversation_id = $2`,
        [userId, otherUserId]
      )
    } catch (error) {
      logger.error('Error marking messages as read:', error)
    }
  }
  
  /**
   * Mark game messages as read
   */
  async markGameMessagesAsRead(userId: string, gameId: string): Promise<void> {
    try {
      await query(
        `UPDATE unread_message_counts 
         SET unread_count = 0, last_read_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 
           AND conversation_type = 'game' 
           AND conversation_id = $2`,
        [userId, gameId]
      )
    } catch (error) {
      logger.error('Error marking game messages as read:', error)
    }
  }
  
  /**
   * Increment unread count for DMs
   */
  async incrementUnreadCount(
    userId: string, 
    conversationType: 'dm' | 'game', 
    conversationId: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO unread_message_counts (user_id, conversation_type, conversation_id, unread_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (user_id, conversation_type, conversation_id)
         DO UPDATE SET unread_count = unread_message_counts.unread_count + 1`,
        [userId, conversationType, conversationId]
      )
    } catch (error) {
      logger.error('Error incrementing unread count:', error)
    }
  }
  
  /**
   * Increment game unread for all players except sender
   */
  async incrementGameUnreadForAllPlayers(gameId: string, senderId: string): Promise<void> {
    try {
      // Get all players in the game
      const playersResult = await query(
        `SELECT player_id FROM room_players WHERE room_id = $1 AND player_id != $2`,
        [gameId, senderId]
      )
      
      // Increment unread for each player
      for (const player of playersResult.rows) {
        await this.incrementUnreadCount(player.player_id, 'game', gameId)
      }
    } catch (error) {
      logger.error('Error incrementing game unread counts:', error)
    }
  }
  
  /**
   * Get unread counts for a user
   */
  async getUnreadCounts(userId: string): Promise<any> {
    try {
      const result = await query(
        `SELECT conversation_type, conversation_id, unread_count 
         FROM unread_message_counts 
         WHERE user_id = $1 AND unread_count > 0`,
        [userId]
      )
      
      return result.rows
    } catch (error) {
      logger.error('Error getting unread counts:', error)
      return []
    }
  }
  
  /**
   * Delete a message (soft delete)
   */
  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    try {
      const result = await query(
        `UPDATE chat_messages 
         SET deleted_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [messageId, userId]
      )
      
      return result.rows.length > 0
    } catch (error) {
      logger.error('Error deleting message:', error)
      return false
    }
  }
  
  /**
   * Edit a message
   */
  async editMessage(messageId: string, userId: string, newMessage: string): Promise<boolean> {
    try {
      const result = await query(
        `UPDATE chat_messages 
         SET message = $1, edited_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND sender_id = $3 AND deleted_at IS NULL
         RETURNING id`,
        [newMessage, messageId, userId]
      )
      
      return result.rows.length > 0
    } catch (error) {
      logger.error('Error editing message:', error)
      return false
    }
  }
}

export const chatService = new ChatService()