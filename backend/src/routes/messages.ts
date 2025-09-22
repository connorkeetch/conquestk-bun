import { type Request, type Response, Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { authenticateToken } from '../middleware/auth'
import {
  createBlock,
  getBlockRecords,
  getBlocksForUser,
  removeBlock,
} from '../services/userBlockService'
import {
  ConversationError,
  addMembersToConversation,
  createGroupConversation,
  ensureDirectConversation,
  listMessages,
  sendMessage,
} from '../services/conversationService'
import { handleRouteError } from '../utils/routeErrorHandler'

const router = Router()

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

router.get('/blocks', authenticateToken, async (req: Request, res: Response) => {
  try {
    const records = await getBlocksForUser(req.userId)
    return res.json({ blocks: records, scope: 'self' })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch block records')
    return res.status(500).json({ error: 'Failed to fetch block records' })
  }
})

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

router.post(
  '/conversations/:conversationId/messages',
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
