import { type Request, type Response, Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import notificationService from '../services/notificationService'

const router = Router()

// Get VAPID public key for push subscription
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  res.json({
    publicKey: notificationService.getVapidPublicKey(),
    enabled: notificationService.isEnabled(),
  })
})

// Subscribe to push notifications
router.post('/subscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!notificationService.isEnabled()) {
      return res.status(503).json({
        error: 'Push notification service is not available',
        message: 'The notification service is currently disabled',
      })
    }

    const userId = Number(req.userId)

    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user identifier' })
    }
    const { subscription } = req.body

    if (!subscription) {
      return res.status(400).json({ error: 'Subscription data is required' })
    }

    await notificationService.saveSubscription(userId, subscription)

    return res.json({
      success: true,
      message: 'Successfully subscribed to push notifications',
    })
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to subscribe to notifications' })
  }
})

// Unsubscribe from push notifications
router.post('/unsubscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = Number(req.userId)

    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user identifier' })
    }

    await notificationService.removeSubscription(userId)

    return res.json({
      success: true,
      message: 'Successfully unsubscribed from push notifications',
    })
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to unsubscribe from notifications' })
  }
})

// Send test notification
router.post('/test', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!notificationService.isEnabled()) {
      return res.status(503).json({
        error: 'Push notification service is not available',
        message: 'The notification service is currently disabled',
      })
    }

    const userId = Number(req.userId)

    if (Number.isNaN(userId)) {
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
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to send test notification' })
  }
})

export default router
