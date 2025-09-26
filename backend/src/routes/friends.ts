import { type Request, type Response, Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import {
  acceptFriendRequest,
  cancelOutgoingRequest,
  declineFriendRequest,
  FriendshipError,
  getRelationshipStatus,
  listFriends,
  listPendingRequests,
  removeFriend,
  sendFriendRequest,
} from '../services/friendService'
import { handleRouteError } from '../utils/routeErrorHandler'
import { query } from '../config/database'

const router = Router()

router.use(authenticateToken)

router.get('/', async (req: Request, res: Response) => {
  try {
    const friends = await listFriends(req.userId)
    return res.json({ friends })
  } catch (error) {
    handleRouteError(error, req, 'Failed to list friends')
    return res.status(500).json({ error: 'Failed to list friends' })
  }
})

router.get('/requests', async (req: Request, res: Response) => {
  try {
    const result = await listPendingRequests(req.userId)
    return res.json(result)
  } catch (error) {
    handleRouteError(error, req, 'Failed to list friend requests')
    return res.status(500).json({ error: 'Failed to list friend requests' })
  }
})

router.get('/status/:otherUserId', async (req: Request, res: Response) => {
  try {
    const { otherUserId } = req.params
    const status = await getRelationshipStatus(req.userId, otherUserId)
    let since: string | undefined
    if (status === 'friends') {
      try {
        const res2 = await query<{ accepted_at: Date }>(
          `SELECT accepted_at FROM friendships WHERE status = 'accepted' AND ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)) LIMIT 1`,
          [req.userId, otherUserId],
        )
        const acceptedAt = res2.rows[0]?.accepted_at
        if (acceptedAt instanceof Date) since = acceptedAt.toISOString()
      } catch {
        // ignore
      }
    }
    return res.json({ status, since })
  } catch (error) {
    handleRouteError(error, req, 'Failed to get relationship status')
    return res.status(500).json({ error: 'Failed to get relationship status' })
  }
})

router.post('/requests', async (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.body ?? {}
    if (!targetUserId || typeof targetUserId !== 'string') {
      return res.status(400).json({ error: 'targetUserId is required' })
    }

    const record = await sendFriendRequest(req.userId, targetUserId)
    return res.status(201).json({ request: record })
  } catch (error) {
    if (error instanceof FriendshipError) {
      const code = error.code
      const status =
        code === 'INVALID_TARGET'
          ? 400
          : code === 'BLOCKED'
            ? 403
            : code === 'ALREADY_FRIENDS' || code === 'ALREADY_REQUESTED'
              ? 409
              : 400
      return res.status(status).json({ error: error.message, code })
    }
    handleRouteError(error, req, 'Failed to send friend request')
    return res.status(500).json({ error: 'Failed to send friend request' })
  }
})

router.post('/requests/:requesterId/accept', async (req: Request, res: Response) => {
  try {
    const { requesterId } = req.params
    const record = await acceptFriendRequest(req.userId, requesterId)
    return res.json({ success: true, friendship: record })
  } catch (error) {
    if (error instanceof FriendshipError) {
      const code = error.code
      const status = code === 'NOT_FOUND' ? 404 : code === 'BLOCKED' ? 403 : 400
      return res.status(status).json({ error: error.message, code })
    }
    handleRouteError(error, req, 'Failed to accept friend request')
    return res.status(500).json({ error: 'Failed to accept friend request' })
  }
})

router.post('/requests/:requesterId/decline', async (req: Request, res: Response) => {
  try {
    const { requesterId } = req.params
    const removed = await declineFriendRequest(req.userId, requesterId)
    return res.json({ success: removed })
  } catch (error) {
    handleRouteError(error, req, 'Failed to decline friend request')
    return res.status(500).json({ error: 'Failed to decline friend request' })
  }
})

router.delete('/requests/:targetUserId', async (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.params
    const removed = await cancelOutgoingRequest(req.userId, targetUserId)
    return res.json({ success: removed })
  } catch (error) {
    handleRouteError(error, req, 'Failed to cancel friend request')
    return res.status(500).json({ error: 'Failed to cancel friend request' })
  }
})

router.delete('/:friendId', async (req: Request, res: Response) => {
  try {
    const { friendId } = req.params
    const removed = await removeFriend(req.userId, friendId)
    return res.json({ success: removed })
  } catch (error) {
    handleRouteError(error, req, 'Failed to remove friend')
    return res.status(500).json({ error: 'Failed to remove friend' })
  }
})

export default router
