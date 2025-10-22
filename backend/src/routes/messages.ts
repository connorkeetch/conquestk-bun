/**
 * @fileoverview This file defines the Express routes for handling user blocking and the conversation/messaging system.
 * It includes endpoints for creating and managing user blocks, creating and managing conversations (DMs, groups, games),
 * sending messages, and listing conversations and messages.
 * @module routes/messages
 */
import { type Request, type Response, Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import { messageLimiter } from '../middleware/rateLimiter.js'
import {
  addMembersToConversation,
  ConversationError,
  createGroupConversation,
  ensureDirectConversation,
  ensureGameConversation,
  ensureTeamConversation,
  getConversationDetail,
  getUnreadSummary,
  leaveConversation,
  listConversationsForUser,
  listMessages,
  markConversationRead,
  removeConversationMember,
  sendMessage,
} from '../services/conversationService.js'
import {
  createBlock,
  getBlockRecords,
  getBlocksForUser,
  removeBlock,
} from '../services/userBlockService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

const router = Router()

/**
 * Route to create a block between the authenticated user and another user.
 * @name POST /messages/blocks
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, containing the `blockedUserId` in the body.
 * @param {Response} res - The Express response object, returning the created block record.
 * @returns {Promise<void>}
 */
router.post('/blocks', authenticateToken, async (req: Request, res: Response) => {
  try {
    const blockerId = req.userId
    const { blockedUserId } = req.body ?? {}

    if (!blockedUserId || typeof blockedUserId !== 'string') {
      return res.status(400).json({ error: 'blockedUserId is required' })
    }

    const record = await createBlock(blockerId, blockedUserId)

    return res.status(200).json({
      success: true,
      block: record,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Cannot block yourself') {
      return res.status(400).json({ error: 'You cannot block yourself' })
    }

    handleRouteError(error, req, 'Failed to create block')
    return res.status(500).json({ error: 'Failed to create block' })
  }
})

/**
 * Route to remove a block between the authenticated user and another user.
 * @name DELETE /messages/blocks/:blockedUserId
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, with `blockedUserId` as a URL parameter.
 * @param {Response} res - The Express response object, indicating the success of the removal.
 * @returns {Promise<void>}
 */
router.delete('/blocks/:blockedUserId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const blockerId = req.userId
    const { blockedUserId } = req.params

    const removed = await removeBlock(blockerId, blockedUserId)

    return res.status(200).json({
      success: true,
      removed,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to remove block')
    return res.status(500).json({ error: 'Failed to remove block' })
  }
})

/**
 * Route to get a list of all users blocked by the authenticated user.
 * @name GET /messages/blocks
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object, containing the list of block records.
 * @returns {Promise<void>}
 */
router.get('/blocks', authenticateToken, async (req: Request, res: Response) => {
  try {
    const records = await getBlocksForUser(req.userId)
    return res.json({ blocks: records, scope: 'self' })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch block records')
    return res.status(500).json({ error: 'Failed to fetch block records' })
  }
})

/**
 * Route for admins to get a list of all block records.
 * This endpoint is protected by admin authentication and supports filtering by blocker or blocked user, with pagination.
 * @name GET /messages/blocks/admin
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, which can contain query parameters for filtering and pagination.
 * @param {Response} res - The Express response object, containing the list of block records.
 * @returns {Promise<void>}
 */
router.get(
  '/blocks/admin',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { blockerId, blockedId, limit, offset } = req.query
      const parsedLimit = limit ? Number(limit) : undefined
      const parsedOffset = offset ? Number(offset) : undefined

      if (
        (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) ||
        (parsedOffset !== undefined && (!Number.isFinite(parsedOffset) || parsedOffset < 0))
      ) {
        return res.status(400).json({ error: 'limit and offset must be positive numbers' })
      }

      const records = await getBlockRecords({
        blockerId: typeof blockerId === 'string' ? blockerId : undefined,
        blockedId: typeof blockedId === 'string' ? blockedId : undefined,
        limit: parsedLimit,
        offset: parsedOffset,
      })

      return res.json({ blocks: records, scope: 'admin' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to fetch block records')
      return res.status(500).json({ error: 'Failed to fetch block records' })
    }
  },
)

/**
 * Maps a ConversationError to an appropriate HTTP status code.
 * @param {ConversationError} error - The conversation error to map.
 * @returns {number} The corresponding HTTP status code.
 */
const mapConversationErrorToStatus = (error: ConversationError): number => {
  switch (error.code) {
    case 'INVALID_TARGET':
    case 'EMPTY_MESSAGE':
    case 'MESSAGE_TOO_LONG':
    case 'INVALID_PAGINATION':
      return 400
    case 'BLOCKED':
    case 'NOT_MEMBER':
      return 403
    case 'NOT_FOUND':
      return 404
    default:
      return 500
  }
}

/**
 * Route to ensure a direct message (DM) conversation exists between the authenticated user and a target user.
 * If a conversation doesn't exist, it will be created.
 * @name POST /messages/dm
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, containing the `targetUserId` in the body.
 * @param {Response} res - The Express response object, returning the DM conversation details.
 * @returns {Promise<void>}
 */
router.post('/dm', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.body ?? {}
    if (!targetUserId || typeof targetUserId !== 'string') {
      return res.status(400).json({ error: 'targetUserId is required' })
    }

    const conversation = await ensureDirectConversation(req.userId, targetUserId)
    return res.status(200).json({ conversation })
  } catch (error) {
    if (error instanceof ConversationError) {
      const status = mapConversationErrorToStatus(error)
      return res.status(status).json({ error: error.message, code: error.code })
    }

    handleRouteError(error, req, 'Failed to create or fetch DM conversation')
    return res.status(500).json({ error: 'Failed to create DM conversation' })
  }
})

/**
 * Route to create a new group conversation.
 * @name POST /messages/conversations
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, containing the conversation details (kind, title, memberIds, metadata).
 * @param {Response} res - The Express response object, returning the newly created conversation.
 * @returns {Promise<void>}
 */
router.post('/conversations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { kind, title, memberIds, metadata } = req.body ?? {}

    if (kind !== 'group') {
      return res.status(400).json({ error: 'Only group conversations are supported at this stage' })
    }

    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ error: 'memberIds must be an array of user IDs' })
    }

    if (metadata !== undefined) {
      if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
        return res.status(400).json({ error: 'metadata must be an object when provided' })
      }
    }

    const conversation = await createGroupConversation({
      creatorId: req.userId,
      title: typeof title === 'string' ? title : undefined,
      memberIds,
      metadata: metadata as Record<string, unknown> | undefined,
    })

    return res.status(201).json({ conversation })
  } catch (error) {
    if (error instanceof ConversationError) {
      const status = mapConversationErrorToStatus(error)
      return res.status(status).json({ error: error.message, code: error.code })
    }

    handleRouteError(error, req, 'Failed to create group conversation')
    return res.status(500).json({ error: 'Failed to create conversation' })
  }
})

/**
 * Route to add one or more members to a conversation.
 * @name POST /messages/conversations/:conversationId/members
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, with `conversationId` as a URL parameter and `memberIds` in the body.
 * @param {Response} res - The Express response object, returning the updated list of members.
 * @returns {Promise<void>}
 */
router.post(
  '/conversations/:conversationId/members',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.params
      const { memberIds } = req.body ?? {}

      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({ error: 'memberIds must be a non-empty array' })
      }

      const members = await addMembersToConversation({
        actorId: req.userId,
        conversationId,
        memberIds,
      })

      return res.status(200).json({ members })
    } catch (error) {
      if (error instanceof ConversationError) {
        const status = mapConversationErrorToStatus(error)
        return res.status(status).json({ error: error.message, code: error.code })
      }

      handleRouteError(error, req, 'Failed to update conversation members')
      return res.status(500).json({ error: 'Failed to update conversation members' })
    }
  },
)

/**
 * Route for the authenticated user to leave a conversation.
 * @name POST /messages/conversations/:conversationId/leave
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, with `conversationId` as a URL parameter.
 * @param {Response} res - The Express response object, indicating the success of the operation.
 * @returns {Promise<void>}
 */
router.post(
  '/conversations/:conversationId/leave',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.params
      await leaveConversation(conversationId, req.userId)
      return res.status(200).json({ success: true })
    } catch (error) {
      if (error instanceof ConversationError) {
        const status = mapConversationErrorToStatus(error)
        return res.status(status).json({ error: error.message, code: error.code })
      }

      handleRouteError(error, req, 'Failed to leave conversation')
      return res.status(500).json({ error: 'Failed to leave conversation' })
    }
  },
)

/**
 * Route to remove a member from a conversation.
 * This is typically an admin or group owner action.
 * @name DELETE /messages/conversations/:conversationId/members/:memberId
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, with `conversationId` and `memberId` as URL parameters.
 * @param {Response} res - The Express response object, indicating the success of the removal.
 * @returns {Promise<void>}
 */
router.delete(
  '/conversations/:conversationId/members/:memberId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { conversationId, memberId } = req.params
      await removeConversationMember({
        actorId: req.userId,
        conversationId,
        targetUserId: memberId,
      })

      return res.status(200).json({ success: true })
    } catch (error) {
      if (error instanceof ConversationError) {
        const status = mapConversationErrorToStatus(error)
        return res.status(status).json({ error: error.message, code: error.code })
      }

      handleRouteError(error, req, 'Failed to remove conversation member')
      return res.status(500).json({ error: 'Failed to remove conversation member' })
    }
  },
)

/**
 * Route to get a summary of unread conversations for the authenticated user.
 * @name GET /messages/conversations/unread
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object, containing the unread conversation summary.
 * @returns {Promise<void>}
 */
router.get('/conversations/unread', authenticateToken, async (req: Request, res: Response) => {
  try {
    const summary = await getUnreadSummary(req.userId)
    return res.json({ conversations: summary })
  } catch (error) {
    handleRouteError(error, req, 'Failed to load unread summary')
    return res.status(500).json({ error: 'Failed to load unread summary' })
  }
})

/**
 * Route to get the details of a specific conversation.
 * It can also mark the conversation as read.
 * @name GET /messages/conversations/:conversationId
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, with `conversationId` as a URL parameter.
 * @param {Response} res - The Express response object, containing the conversation details.
 * @returns {Promise<void>}
 */
router.get(
  '/conversations/:conversationId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.params
      const markReadParam = req.query.markRead
      const shouldMarkRead =
        markReadParam === undefined ||
        (Array.isArray(markReadParam) ? markReadParam[0] !== 'false' : markReadParam !== 'false')

      if (shouldMarkRead) {
        await markConversationRead(conversationId, req.userId)
      }

      const detail = await getConversationDetail(conversationId, req.userId, {
        allowSpectatorGameAccess: true,
      })
      return res.json(detail)
    } catch (error) {
      if (error instanceof ConversationError) {
        const status = mapConversationErrorToStatus(error)
        return res.status(status).json({ error: error.message, code: error.code })
      }

      handleRouteError(error, req, 'Failed to load conversation detail')
      return res.status(500).json({ error: 'Failed to load conversation detail' })
    }
  },
)

/**
 * Route to send a message to a conversation.
 * This endpoint is rate-limited.
 * @name POST /messages/conversations/:conversationId/messages
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, with `conversationId` as a URL parameter and message data in the body.
 * @param {Response} res - The Express response object, returning the sent message.
 * @returns {Promise<void>}
 */
router.post(
  '/conversations/:conversationId/messages',
  messageLimiter,
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.params
      const { body, clientMessageId, metadata } = req.body ?? {}

      if (!body || typeof body !== 'string') {
        return res.status(400).json({ error: 'Message body is required' })
      }

      if (metadata !== undefined) {
        if (typeof metadata !== 'object' || Array.isArray(metadata)) {
          return res.status(400).json({ error: 'metadata must be an object when provided' })
        }
      }

      const message = await sendMessage({
        conversationId,
        senderId: req.userId,
        body,
        clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : undefined,
        metadata: metadata ?? undefined,
      })

      return res.status(200).json({ message })
    } catch (error) {
      if (error instanceof ConversationError) {
        const status = mapConversationErrorToStatus(error)
        return res.status(status).json({ error: error.message, code: error.code })
      }

      handleRouteError(error, req, 'Failed to send message')
      return res.status(500).json({ error: 'Failed to send message' })
    }
  },
)

/**
 * Route to ensure a game conversation exists for a given game ID.
 * If a conversation doesn't exist, it will be created.
 * @name POST /messages/conversations/game
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, containing the `gameId` in the body.
 * @param {Response} res - The Express response object, returning the game conversation details.
 * @returns {Promise<void>}
 */
router.post('/conversations/game', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { gameId } = req.body ?? {}

    if (!gameId || typeof gameId !== 'string') {
      return res.status(400).json({ error: 'gameId is required' })
    }

    const conversation = await ensureGameConversation(gameId)
    const detail = await getConversationDetail(conversation.id, req.userId, {
      allowSpectatorGameAccess: true,
    })
    return res.status(200).json(detail)
  } catch (error) {
    if (error instanceof ConversationError) {
      const status = mapConversationErrorToStatus(error)
      return res.status(status).json({ error: error.message, code: error.code })
    }

    handleRouteError(error, req, 'Failed to ensure game conversation')
    return res.status(500).json({ error: 'Failed to ensure game conversation' })
  }
})

/**
 * Route to ensure a team conversation exists for a given game and team ID.
 * If a conversation doesn't exist, it will be created.
 * @name POST /messages/conversations/team
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, containing the `gameId` and `teamId` in the body.
 * @param {Response} res - The Express response object, returning the team conversation details.
 * @returns {Promise<void>}
 */
router.post('/conversations/team', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { gameId, teamId } = req.body ?? {}

    if (!gameId || typeof gameId !== 'string') {
      return res.status(400).json({ error: 'gameId is required' })
    }

    const parsedTeamId = Number(teamId)
    if (!Number.isFinite(parsedTeamId)) {
      return res.status(400).json({ error: 'teamId must be a number' })
    }

    const conversation = await ensureTeamConversation(gameId, parsedTeamId)
    const detail = await getConversationDetail(conversation.id, req.userId)
    return res.status(200).json(detail)
  } catch (error) {
    if (error instanceof ConversationError) {
      const status = mapConversationErrorToStatus(error)
      return res.status(status).json({ error: error.message, code: error.code })
    }

    handleRouteError(error, req, 'Failed to ensure team conversation')
    return res.status(500).json({ error: 'Failed to ensure team conversation' })
  }
})

/**
 * Route to list all conversations for the authenticated user, with pagination.
 * @name GET /messages/conversations
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, which can contain `limit` and `offset` query parameters.
 * @param {Response} res - The Express response object, containing the list of conversations.
 * @returns {Promise<void>}
 */
router.get('/conversations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { limit, offset } = req.query

    const parsedLimit = limit ? Number(limit) : undefined
    const parsedOffset = offset ? Number(offset) : undefined

    if (
      (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) ||
      (parsedOffset !== undefined && (!Number.isFinite(parsedOffset) || parsedOffset < 0))
    ) {
      return res.status(400).json({ error: 'limit and offset must be positive numbers' })
    }

    const conversations = await listConversationsForUser(req.userId, {
      limit: parsedLimit,
      offset: parsedOffset,
    })

    return res.json({ conversations })
  } catch (error) {
    handleRouteError(error, req, 'Failed to list conversations')
    return res.status(500).json({ error: 'Failed to list conversations' })
  }
})

/**
 * Route to list messages in a conversation, with pagination.
 * @name GET /messages/conversations/:conversationId/messages
 * @function
 * @memberof module:routes/messages
 * @param {Request} req - The Express request object, with `conversationId` as a URL parameter and optional `before` and `limit` query parameters.
 * @param {Response} res - The Express response object, containing the list of messages.
 * @returns {Promise<void>}
 */
router.get(
  '/conversations/:conversationId/messages',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.params
      const { before, limit } = req.query

      const parsedLimit = limit ? Number(limit) : undefined
      if (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
        return res.status(400).json({ error: 'limit must be a positive number' })
      }

      const messages = await listMessages(
        conversationId,
        req.userId,
        parsedLimit ?? 50,
        typeof before === 'string' ? before : undefined,
      )

      return res.json({ messages })
    } catch (error) {
      if (error instanceof ConversationError) {
        const status = mapConversationErrorToStatus(error)
        return res.status(status).json({ error: error.message, code: error.code })
      }

      handleRouteError(error, req, 'Failed to fetch messages')
      return res.status(500).json({ error: 'Failed to fetch messages' })
    }
  },
)

export default router
