import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import notificationService from '../services/notificationService';

const router = Router();

// Get VAPID public key for push subscription
router.get('/vapid-public-key', (req: Request, res: Response) => {
  res.json({
    publicKey: notificationService.getVapidPublicKey(),
  });
});

// Subscribe to push notifications
router.post('/subscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { subscription } = req.body;

    if (!subscription) {
      return res.status(400).json({ error: 'Subscription data is required' });
    }

    await notificationService.saveSubscription(userId, subscription);

    return res.json({ 
      success: true, 
      message: 'Successfully subscribed to push notifications' 
    });
  } catch (error) {
    console.error('Error subscribing to notifications:', error);
    return res.status(500).json({ error: 'Failed to subscribe to notifications' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    await notificationService.removeSubscription(userId);

    return res.json({ 
      success: true, 
      message: 'Successfully unsubscribed from push notifications' 
    });
  } catch (error) {
    console.error('Error unsubscribing from notifications:', error);
    return res.status(500).json({ error: 'Failed to unsubscribe from notifications' });
  }
});

// Send test notification
router.post('/test', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const success = await notificationService.sendTestNotification(userId);

    if (success) {
      return res.json({ 
        success: true, 
        message: 'Test notification sent successfully' 
      });
    } else {
      return res.status(404).json({ 
        error: 'No push subscription found. Please enable notifications first.' 
      });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    return res.status(500).json({ error: 'Failed to send test notification' });
  }
});

export default router;