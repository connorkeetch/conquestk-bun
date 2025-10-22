import { type Request, type Response, Router } from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import {
  acceptFriendRequest,
  cancelOutgoingRequest,
  declineFriendRequest,
  FriendshipError,
  getMutualFriends,
  getRelationshipStatus,
  listFriends,
  listPendingRequests,
  removeFriend,
  sendFriendRequest,
} from '../services/friendService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

/**
 * This file contains the routes for managing friendships.
 * It includes routes for listing friends, managing friend requests, and viewing friendship status.
 * All routes in this file are protected by the `authenticateToken` middleware.
 */

const router = Router()

router.use(authenticateToken)

/**
 * @api {get} /friends List all friends
 * @apiName ListFriends
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiSuccess {Object[]} friends The list of friends.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const friends = await listFriends(req.userId)
    return res.json({ friends })
  } catch (error) {
    handleRouteError(error, req, 'Failed to list friends')
    return res.status(500).json({ error: 'Failed to list friends' })
  }
})

/**
 * @api {get} /friends/requests List pending friend requests
 * @apiName ListFriendRequests
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiSuccess {Object} result The list of pending friend requests.
 */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const result = await listPendingRequests(req.userId)
    return res.json(result)
  } catch (error) {
    handleRouteError(error, req, 'Failed to list friend requests')
    return res.status(500).json({ error: 'Failed to list friend requests' })
  }
})

/**
 * @api {get} /friends/status/:otherUserId Get the friendship status with another user
 * @apiName GetFriendshipStatus
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiParam {String} otherUserId The ID of the other user.
 *
 * @apiSuccess {String} status The friendship status.
 * @apiSuccess {String} [since] The date the friendship was accepted.
 */
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

/**
 * @api {get} /friends/mutual/:otherUserId Get mutual friends with another user
 * @apiName GetMutualFriends
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiParam {String} otherUserId The ID of the other user.
 * @apiParam {Number} [limit=6] The maximum number of mutual friends to return.
 *
 * @apiSuccess {Object} result The list of mutual friends.
 */
router.get('/mutual/:otherUserId', async (req: Request, res: Response) => {
  try {
    const { otherUserId } = req.params
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 6, 25))
    const result = await getMutualFriends(req.userId, otherUserId, limit)
    return res.json(result)
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch mutual friends')
    return res.status(500).json({ error: 'Failed to fetch mutual friends' })
  }
})

/**
 * @api {post} /friends/requests Send a friend request
 * @apiName SendFriendRequest
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiBody {String} targetUserId The ID of the user to send the request to.
 *
 * @apiSuccess {Object} request The created friend request.
 */
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

/**
 * @api {post} /friends/requests/:requesterId/accept Accept a friend request
 * @apiName AcceptFriendRequest
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiParam {String} requesterId The ID of the user who sent the request.
 *
 * @apiSuccess {Boolean} success Whether the request was successful.
 * @apiSuccess {Object} friendship The created friendship.
 */
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

/**
 * @api {post} /friends/requests/:requesterId/decline Decline a friend request
 * @apiName DeclineFriendRequest
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiParam {String} requesterId The ID of the user who sent the request.
 *
 * @apiSuccess {Boolean} success Whether the request was successful.
 */
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

/**
 * @api {delete} /friends/requests/:targetUserId Cancel an outgoing friend request
 * @apiName CancelFriendRequest
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiParam {String} targetUserId The ID of the user to whom the request was sent.
 *
 * @apiSuccess {Boolean} success Whether the request was successful.
 */
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

/**
 * @api {delete} /friends/:friendId Remove a friend
 * @apiName RemoveFriend
 * @apiGroup Friends
 * @apiPermission user
 *
 * @apiParam {String} friendId The ID of the friend to remove.
 *
 * @apiSuccess {Boolean} success Whether the request was successful.
 */
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
