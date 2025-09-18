import webpush from 'web-push'

// Check if VAPID keys are configured
const isNotificationServiceEnabled = !!(
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
)

// Only configure web-push if VAPID keys are available
if (isNotificationServiceEnabled) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || 'mailto:admin@conquestk.com',
      process.env.VAPID_PUBLIC_KEY!, // We know these exist because of the check above
      process.env.VAPID_PRIVATE_KEY!,
    )
  } catch (_error) {}
} else {
}

// Store subscriptions in memory for now (should be in database in production)
const subscriptions = new Map<number, webpush.PushSubscription>()

export interface NotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: {
    gameId?: number
    url?: string
    [key: string]: unknown
  }
  actions?: Array<{
    action: string
    title: string
  }>
}

class NotificationService {
  // Save subscription for a user
  async saveSubscription(userId: number, subscription: webpush.PushSubscription): Promise<void> {
    // In production, save to database
    subscriptions.set(userId, subscription)
  }

  // Remove subscription for a user
  async removeSubscription(userId: number): Promise<void> {
    subscriptions.delete(userId)
  }

  // Get subscription for a user
  async getSubscription(userId: number): Promise<webpush.PushSubscription | undefined> {
    return subscriptions.get(userId)
  }

  // Send notification to a specific user
  async sendToUser(userId: number, payload: NotificationPayload): Promise<boolean> {
    // Skip if notification service is not enabled
    if (!isNotificationServiceEnabled) {
      return false
    }

    const subscription = await this.getSubscription(userId)
    if (!subscription) {
      return false
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload))
      return true
    } catch (error) {
      // If subscription is invalid, remove it
      if ((error as unknown).statusCode === 410) {
        await this.removeSubscription(userId)
      }

      return false
    }
  }

  // Send notification to multiple users
  async sendToUsers(userIds: number[], payload: NotificationPayload): Promise<void> {
    const promises = userIds.map((userId) => this.sendToUser(userId, payload))
    await Promise.allSettled(promises)
  }

  // Notification event handlers
  async notifyGameStart(gameId: number, playerIds: number[]): Promise<void> {
    const payload: NotificationPayload = {
      title: '🎮 Game Started!',
      body: 'Your Risk game has begun. Join now to start conquering!',
      tag: `game-start-${gameId}`,
      data: {
        gameId,
        url: `/game/${gameId}`,
      },
      actions: [
        { action: 'view', title: 'Join Game' },
        { action: 'close', title: 'Later' },
      ],
    }

    await this.sendToUsers(playerIds, payload)
  }

  async notifyTurnStart(gameId: number, userId: number, _username: string): Promise<void> {
    const payload: NotificationPayload = {
      title: "⚔️ It's Your Turn!",
      body: `It's your turn in the Risk game. Make your move!`,
      tag: `turn-${gameId}`,
      data: {
        gameId,
        url: `/game/${gameId}`,
      },
      actions: [
        { action: 'view', title: 'Play Now' },
        { action: 'close', title: 'Later' },
      ],
    }

    await this.sendToUser(userId, payload)
  }

  async notifyGameEnd(gameId: number, winnerId: number, playerIds: number[]): Promise<void> {
    // In production, fetch winner name from database
    const winnerName = `Player ${winnerId}`

    const payloadForWinner: NotificationPayload = {
      title: '🏆 Victory!',
      body: 'Congratulations! You have conquered the world!',
      tag: `game-end-${gameId}`,
      data: {
        gameId,
        url: `/game/${gameId}`,
      },
    }

    const payloadForOthers: NotificationPayload = {
      title: '🎮 Game Over',
      body: `${winnerName} has won the game. Better luck next time!`,
      tag: `game-end-${gameId}`,
      data: {
        gameId,
        url: `/game/${gameId}`,
      },
    }

    // Send different notifications to winner and other players
    for (const playerId of playerIds) {
      const payload = playerId === winnerId ? payloadForWinner : payloadForOthers
      await this.sendToUser(playerId, payload)
    }
  }

  async notifyGameInvite(userId: number, inviterName: string, gameId: number): Promise<void> {
    const payload: NotificationPayload = {
      title: '📨 Game Invitation',
      body: `${inviterName} has invited you to play Risk!`,
      tag: `invite-${gameId}`,
      data: {
        gameId,
        url: `/game/${gameId}`,
      },
      actions: [
        { action: 'view', title: 'Accept' },
        { action: 'close', title: 'Decline' },
      ],
    }

    await this.sendToUser(userId, payload)
  }

  // Test notification
  async sendTestNotification(userId: number): Promise<boolean> {
    const payload: NotificationPayload = {
      title: '🔔 Test Notification',
      body: "Push notifications are working! You'll receive game updates here.",
      tag: 'test-notification',
      data: {
        url: '/settings',
      },
    }

    return await this.sendToUser(userId, payload)
  }

  // Get VAPID public key for client
  getVapidPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || ''
  }

  // Check if notification service is enabled
  isEnabled(): boolean {
    return isNotificationServiceEnabled
  }
}

export const notificationService = new NotificationService()
export default notificationService
