import { v4 as uuidv4 } from 'uuid'
import { query } from '../config/database'
import { logger } from '../utils/logger'
import { type LinkPreview, linkPreviewService } from './linkPreviewService'

// Profanity filter - lazy loaded to handle ESM module
let profanityFilter: any = null

async function getProfanityFilter() {
  if (!profanityFilter) {
    try {
      // Dynamic import for ESM module compatibility
      const { Filter } = await import('bad-words')
      profanityFilter = new Filter()
      // Add custom words if needed
      // profanityFilter.addWords('customword1', 'customword2')
    } catch (error) {
      logger.error('Failed to load profanity filter:', error)
      // Create a no-op filter if module fails to load
      profanityFilter = {
        clean: (text: string) => text,
        isProfane: () => false,
      }
    }
  }
  return profanityFilter
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
  created_at: Date
  edited_at?: Date
  deleted_at?: Date
  is_read: boolean
  link_previews?: LinkPreview[]
}

export interface SendMessageData {
  senderId: string
  message: string
  messageType: 'game' | 'team' | 'dm'
  gameId?: string
  teamId?: number
  recipientId?: string
}

interface MessageLinkPreviewRow {
  url: string
  title: string | null
  description: string | null
  image: string | null
  site_name: string | null
}

interface PrivacyPreferenceRow {
  dm_privacy: 'anyone' | 'friends' | 'nobody' | null
}

interface PlayerIdRow {
  player_id: string
}

interface UnreadMessageCountRow {
  conversation_type: 'game' | 'team' | 'dm'
  conversation_id: string
  unread_count: number
}

interface MessageReactionRow {
  emoji: string
  user_id: string
  username: string
}

interface MessageReactionUser {
  id: string
  username: string
}

interface MessageReaction {
  emoji: string
  users: MessageReactionUser[]
  count: number
}

class ChatService {
  /**
   * Send a message
   */
  async sendMessage(data: SendMessageData): Promise<ChatMessage> {
    const messageId = uuidv4()

    try {
      // Check if user has profanity filter enabled
      let filteredMessage = data.message
      const shouldFilter = await this.shouldFilterProfanity(data.senderId)

      if (shouldFilter) {
        const filter = await getProfanityFilter()
        filteredMessage = filter.clean(data.message)
      }

      // Check DM privacy settings if it's a DM
      if (data.messageType === 'dm' && data.recipientId) {
        const canSendDM = await this.canSendDMTo(data.senderId, data.recipientId)
        if (!canSendDM) {
          throw new Error('User has restricted direct messages')
        }
      }

      // Extract link previews
      const links = await linkPreviewService.extractLinks(filteredMessage)
      const linkPreviews =
        links.length > 0
          ? await linkPreviewService.getMultiplePreviews(links.slice(0, 3)) // Limit to 3 previews
          : []

      const result = await query<ChatMessage>(
        `INSERT INTO chat_messages (
          id, sender_id, message, message_type, 
          game_id, team_id, recipient_id, created_at, is_read
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, FALSE)
        RETURNING *`,
        [
          messageId,
          data.senderId,
          filteredMessage, // Use filtered message
          data.messageType,
          data.gameId || null,
          data.teamId || null,
          data.recipientId || null,
        ],
      )

      // Add link previews to the message object
      const message = result.rows[0]
      if (!message) {
        throw new Error('Failed to persist chat message')
      }

      const sanitizedPreviews = linkPreviews.filter(
        (preview): preview is LinkPreview => preview !== null,
      )

      if (sanitizedPreviews.length > 0) {
        message.link_previews = sanitizedPreviews

        // Store link previews in database
        for (const preview of sanitizedPreviews) {
          await query(
            `INSERT INTO message_link_previews (
              message_id, url, title, description, image, site_name
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              messageId,
              preview.url,
              preview.title || null,
              preview.description || null,
              preview.image || null,
              preview.siteName || null,
            ],
          ).catch((err) => logger.error('Error storing link preview:', err))
        }
      }

      // Update unread count for recipient
      if (data.messageType === 'dm' && data.recipientId) {
        await this.incrementUnreadCount(data.recipientId, 'dm', data.senderId)
      } else if (data.messageType === 'game' && data.gameId) {
        // We'll track game unread counts per user
        await this.incrementGameUnreadForAllPlayers(data.gameId, data.senderId)
      }

      return message
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
    offset: number = 0,
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
      } else if (messageType === 'team') {
        // Team chat - conversationId format: "gameId:teamId"
        const [gameId, teamId] = conversationId.split(':')
        queryText = `
          SELECT m.*, u.username as sender_username
          FROM chat_messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.message_type = 'team' 
            AND m.game_id = $1
            AND m.team_id = $2
            AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC
          LIMIT $3 OFFSET $4`
        queryParams = [gameId, parseInt(teamId, 10), limit, offset]
      } else {
        return []
      }

      const result = await query<ChatMessage>(queryText, queryParams)

      // Fetch link previews for messages
      const messages = result.rows
      for (const message of messages) {
        const previewsResult = await query<MessageLinkPreviewRow>(
          `SELECT url, title, description, image, site_name
           FROM message_link_previews
           WHERE message_id = $1`,
          [message.id],
        )
        if (previewsResult.rows.length > 0) {
          message.link_previews = previewsResult.rows.map((row) => ({
            url: row.url,
            title: row.title ?? undefined,
            description: row.description ?? undefined,
            image: row.image ?? undefined,
            siteName: row.site_name ?? undefined,
          }))
        }
      }

      // Mark messages as read
      if (messageType === 'dm') {
        await this.markMessagesAsRead(userId, conversationId)
      } else if (messageType === 'game') {
        await this.markGameMessagesAsRead(userId, conversationId)
      }

      return messages.reverse() // Reverse to get chronological order
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
      const privacyResult = await query<PrivacyPreferenceRow>(
        `SELECT dm_privacy FROM user_preferences WHERE user_id = $1`,
        [recipientId],
      )

      if (privacyResult.rows.length === 0 || !privacyResult.rows[0].dm_privacy) {
        // Default to 'friends' if no preference set
        return this.areUsersFriends(senderId, recipientId)
      }

      const dmPrivacy = privacyResult.rows[0].dm_privacy

      if (dmPrivacy === 'anyone') {
        return true
      }
      if (dmPrivacy === 'nobody') {
        return false
      }
      if (dmPrivacy === 'friends') {
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
      const result = await query<{ match_exists: number }>(
        `SELECT 1 AS match_exists FROM friendships 
         WHERE status = 'accepted'
           AND ((user_id = $1 AND friend_id = $2) 
                OR (user_id = $2 AND friend_id = $1))`,
        [userId1, userId2],
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
        [userId, otherUserId],
      )

      // Reset unread count
      await query(
        `UPDATE unread_message_counts 
         SET unread_count = 0, last_read_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 
           AND conversation_type = 'dm' 
           AND conversation_id = $2`,
        [userId, otherUserId],
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
        [userId, gameId],
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
    conversationId: string,
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO unread_message_counts (user_id, conversation_type, conversation_id, unread_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (user_id, conversation_type, conversation_id)
         DO UPDATE SET unread_count = unread_message_counts.unread_count + 1`,
        [userId, conversationType, conversationId],
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
      const playersResult = await query<PlayerIdRow>(
        `SELECT player_id FROM room_players WHERE room_id = $1 AND player_id != $2`,
        [gameId, senderId],
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
  async getUnreadCounts(userId: string): Promise<UnreadMessageCountRow[]> {
    try {
      const result = await query<UnreadMessageCountRow>(
        `SELECT conversation_type, conversation_id, unread_count 
         FROM unread_message_counts 
         WHERE user_id = $1 AND unread_count > 0`,
        [userId],
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
      const result = await query<{ id: string }>(
        `UPDATE chat_messages 
         SET deleted_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [messageId, userId],
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
      // Apply profanity filter if enabled
      let filteredMessage = newMessage
      const shouldFilter = await this.shouldFilterProfanity(userId)

      if (shouldFilter) {
        const filter = await getProfanityFilter()
        filteredMessage = filter.clean(newMessage)
      }

      const result = await query<{ id: string }>(
        `UPDATE chat_messages 
         SET message = $1, edited_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND sender_id = $3 AND deleted_at IS NULL
         RETURNING id`,
        [filteredMessage, messageId, userId],
      )

      return result.rows.length > 0
    } catch (error) {
      logger.error('Error editing message:', error)
      return false
    }
  }

  /**
   * Check if profanity filter is enabled for user
   */
  async shouldFilterProfanity(userId: string): Promise<boolean> {
    try {
      const result = await query<{ profanity_filter: boolean | null }>(
        `SELECT profanity_filter FROM user_preferences WHERE user_id = $1`,
        [userId],
      )

      // Default to true if no preference set
      if (result.rows.length === 0) {
        return true
      }

      return result.rows[0].profanity_filter !== false
    } catch (error) {
      logger.error('Error checking profanity filter preference:', error)
      return true // Default to filtering on error
    }
  }

  /**
   * Add or update a reaction to a message
   */
  async addReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    try {
      // Check if user already reacted with this emoji
      const existing = await query<{ match_exists: number }>(
        `SELECT 1 AS match_exists FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, userId, emoji],
      )

      if (existing.rows.length > 0) {
        // Already reacted with this emoji, remove it instead
        return this.removeReaction(messageId, userId, emoji)
      }

      // Add the reaction
      await query(
        `INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
        [messageId, userId, emoji],
      )

      return true
    } catch (error) {
      logger.error('Error adding reaction:', error)
      return false
    }
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    try {
      const result = await query<{ message_id: string }>(
        `DELETE FROM message_reactions 
         WHERE message_id = $1 AND user_id = $2 AND emoji = $3
         RETURNING message_id`,
        [messageId, userId, emoji],
      )

      return result.rows.length > 0
    } catch (error) {
      logger.error('Error removing reaction:', error)
      return false
    }
  }

  /**
   * Get reactions for a message
   */
  async getMessageReactions(messageId: string): Promise<MessageReaction[]> {
    try {
      const result = await query<MessageReactionRow>(
        `SELECT r.emoji, r.user_id, u.username
         FROM message_reactions r
         JOIN users u ON r.user_id = u.id
         WHERE r.message_id = $1
         ORDER BY r.created_at`,
        [messageId],
      )

      // Group reactions by emoji
      const reactionMap = new Map<string, MessageReactionUser[]>()

      for (const row of result.rows) {
        if (!reactionMap.has(row.emoji)) {
          reactionMap.set(row.emoji, [])
        }
        reactionMap.get(row.emoji)!.push({
          id: row.user_id,
          username: row.username,
        })
      }

      // Convert to array format
      return Array.from(reactionMap.entries()).map(([emoji, users]) => ({
        emoji,
        users,
        count: users.length,
      }))
    } catch (error) {
      logger.error('Error getting message reactions:', error)
      return []
    }
  }
}

export const chatService = new ChatService()
