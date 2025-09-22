import { type Request, type Response, Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { authenticateToken } from '../middleware/auth'
import {
  createBlock,
  getBlockRecords,
  getBlocksForUser,
  removeBlock,
} from '../services/userBlockService'
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

export default router
