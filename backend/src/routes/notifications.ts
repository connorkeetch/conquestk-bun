/**
 * @fileoverview This file defines the Express routes for handling web push notifications.
 * It includes endpoints for subscribing, unsubscribing, testing notifications,
 * and retrieving the VAPID public key. It also includes an admin endpoint for pruning stale subscriptions.
 * @module routes/notifications
 */
import { type Request, type Response, Router } from 'express'
import { logAdminActivity, requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import notificationService from '../services/notificationService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

const router = Router()

/**
 * Route to get the VAPID public key for web push notifications.
 * @name GET /notifications/vapid-public-key
 * @function
 * @memberof module:routes/notifications
 * @param {Request} _req - The Express request object (unused).
 * @param {Response} res - The Express response object, containing the VAPID public key and an enabled flag.
 */
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  res.json({
    publicKey: notificationService.getVapidPublicKey(),
    enabled: notificationService.isEnabled(),
  })
})

/**
 * Route to subscribe a user to push notifications.
 * @name POST /notifications/subscribe
 * @function
 * @memberof module:routes/notifications
 * @param {Request} req - The Express request object, containing the push subscription object in the body.
 * @param {Response} res - The Express response object, indicating the success of the subscription.
 * @returns {Promise<void>}
 */
router.post('/subscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!notificationService.isEnabled()) {
      return res.status(503).json({
        error: 'Push notification service is not available',
        message: 'The notification service is currently disabled',
      })
    }

    const userId = req.userId
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user identifier' })
    }

    const { subscription } = req.body
    if (!subscription) {
      return res.status(400).json({ error: 'Subscription data is required' })
    }

    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription payload' })
    }

    await notificationService.saveSubscription(userId, subscription)

    return res.json({
      success: true,
      message: 'Successfully subscribed to push notifications',
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to subscribe to notifications')
    return res.status(500).json({ error: 'Failed to subscribe to notifications' })
  }
})

/**
 * Route to unsubscribe a user from push notifications.
 * @name POST /notifications/unsubscribe
 * @function
 * @memberof module:routes/notifications
 * @param {Request} req - The Express request object, which can contain the subscription endpoint to be removed.
 * @param {Response} res - The Express response object, indicating the success of the unsubscription.
 * @returns {Promise<void>}
 */
router.post('/unsubscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user identifier' })
    }

    const { endpoint, subscription } = req.body
    const targetEndpoint: string | undefined = endpoint ?? subscription?.endpoint

    const removed = await notificationService.removeSubscription(userId, targetEndpoint)

    return res.json({
      success: true,
      message:
        removed > 0
          ? 'Successfully unsubscribed from push notifications'
          : 'No push subscription found to remove',
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to unsubscribe from notifications')
    return res.status(500).json({ error: 'Failed to unsubscribe from notifications' })
  }
})

/**
 * Route to send a test push notification to the authenticated user.
 * @name POST /notifications/test
 * @function
 * @memberof module:routes/notifications
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object, indicating whether the test notification was sent.
 * @returns {Promise<void>}
 */
router.post('/test', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!notificationService.isEnabled()) {
      return res.status(503).json({
        error: 'Push notification service is not available',
        message: 'The notification service is currently disabled',
      })
    }

    const userId = req.userId
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user identifier' })
    }

    const success = await notificationService.sendTestNotification(userId)

    if (success) {
      return res.json({
        success: true,
        message: 'Test notification sent successfully',
      })
    }

    return res.status(404).json({
      error: 'No push subscription found. Please enable notifications first.',
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to send test notification')
    return res.status(500).json({ error: 'Failed to send test notification' })
  }
})

/**
 * Route for admins to prune stale or invalid push notification subscriptions from the database.
 * @name POST /notifications/admin/prune-subscriptions
 * @function
 * @memberof module:routes/notifications
 * @param {Request} req - The Express request object, which can contain pruning criteria in the body.
 * @param {Response} res - The Express response object, returning the result of the pruning operation.
 * @returns {Promise<void>}
 */
router.post(
  '/admin/prune-subscriptions',
  authenticateToken,
  requireAdmin,
  logAdminActivity('notifications.prune_subscriptions'),
  async (req: Request, res: Response) => {
    try {
      const { failureThreshold, failureAgeDays, staleRegistrationDays } = req.body ?? {}

      const normalizeOptionalNumber = (value: unknown, field: string): number | undefined => {
        if (value === undefined) return undefined
        const parsed = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`${field} must be a positive number`)
        }
        return parsed
      }

      const result = await notificationService.pruneStaleSubscriptions({
        failureThreshold: normalizeOptionalNumber(failureThreshold, 'failureThreshold'),
        failureAgeDays: normalizeOptionalNumber(failureAgeDays, 'failureAgeDays'),
        staleRegistrationDays: normalizeOptionalNumber(
          staleRegistrationDays,
          'staleRegistrationDays',
        ),
      })

      return res.json({
        success: true,
        result,
      })
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('must be a positive number') ||
          error.message.includes('must be greater than zero'))
      ) {
        return res.status(400).json({ error: error.message })
      }

      handleRouteError(error, req, 'Failed to prune notification subscriptions')
      return res.status(500).json({ error: 'Failed to prune notification subscriptions' })
    }
  },
)

export default router
