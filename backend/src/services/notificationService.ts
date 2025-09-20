import webpush from 'web-push'
import { query } from '../config/database'
import { logger } from '../utils/logger'

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const isNotificationServiceEnabled = Boolean(vapidPublicKey && vapidPrivateKey)

if (isNotificationServiceEnabled && vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || 'mailto:admin@conquestk.com',
      vapidPublicKey,
      vapidPrivateKey,
    )
  } catch (error) {
    logger.error('Failed to configure web-push VAPID details', error)
  }
}

const webpushLogger = logger.child({ channel: 'webpush' })
const retryableStatusCodes = new Set([429, 500, 502, 503, 504])
const retryDelaysMs = [250, 1000, 3000]

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface NotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: NotificationPayloadData
  actions?: Array<{
    action: string
    title: string
  }>
}

interface NotificationPayloadData {
  gameId?: number
  url?: string
  [key: string]: unknown
}

interface PushSubscriptionRow {
  user_id: string
  endpoint: string
  subscription: webpush.PushSubscription
  failure_count: number
}

type WebPushError = {
  statusCode?: number
}

function isWebPushError(error: unknown): error is WebPushError {
  return typeof error === 'object' && error !== null && 'statusCode' in error
}

class NotificationService {
  async saveSubscription(userId: string, subscription: webpush.PushSubscription): Promise<void> {
    const { endpoint, expirationTime = null, keys } = subscription

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('Invalid push subscription payload')
    }

    const normalizedSubscription: webpush.PushSubscription = {
      endpoint,
      expirationTime,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    }

    await query(
      `
        INSERT INTO web_push_subscriptions (
          user_id,
          endpoint,
          subscription,
          expiration_time,
          p256dh_key,
          auth_key
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, endpoint) DO UPDATE SET
          subscription = EXCLUDED.subscription,
          expiration_time = EXCLUDED.expiration_time,
          p256dh_key = EXCLUDED.p256dh_key,
          auth_key = EXCLUDED.auth_key,
          failure_count = 0,
          last_failure_at = NULL,
          last_failure_reason = NULL,
          updated_at = NOW()
      `,
      [
        userId,
        endpoint,
        normalizedSubscription,
        expirationTime ? new Date(expirationTime) : null,
        keys.p256dh,
        keys.auth,
      ],
    )

    webpushLogger.debug('Saved web push subscription', { userId, endpoint })
  }

  async removeSubscription(userId: string, endpoint?: string): Promise<number> {
    if (endpoint) {
      const result = await query<{ count: string }>(
        'DELETE FROM web_push_subscriptions WHERE user_id = $1 AND endpoint = $2 RETURNING 1 as count',
        [userId, endpoint],
      )
      if (result.rowCount === 0) {
        webpushLogger.debug('No matching subscription to remove', { userId, endpoint })
      }
      return Number(result.rowCount ?? 0)
    }

    const result = await query<{ count: string }>(
      'DELETE FROM web_push_subscriptions WHERE user_id = $1 RETURNING 1 as count',
      [userId],
    )
    if (result.rowCount) {
      webpushLogger.debug('Removed all subscriptions for user', {
        userId,
        removed: result.rowCount,
      })
    }
    return Number(result.rowCount ?? 0)
  }

  private async getSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
    const result = await query<PushSubscriptionRow>(
      `
        SELECT
          user_id,
          endpoint,
          subscription,
          failure_count
        FROM web_push_subscriptions
        WHERE user_id = $1
      `,
      [userId],
    )

    return result.rows
  }

  private async markDeliverySuccess(userId: string, endpoint: string): Promise<void> {
    await query(
      `
        UPDATE web_push_subscriptions
        SET
          failure_count = 0,
          last_failure_at = NULL,
          last_failure_reason = NULL,
          last_success_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1 AND endpoint = $2
      `,
      [userId, endpoint],
    )
  }

  private async markDeliveryFailure(
    userId: string,
    endpoint: string,
    reason: string | null,
  ): Promise<void> {
    await query(
      `
        UPDATE web_push_subscriptions
        SET
          failure_count = failure_count + 1,
          last_failure_at = NOW(),
          last_failure_reason = $3,
          updated_at = NOW()
        WHERE user_id = $1 AND endpoint = $2
      `,
      [userId, endpoint, reason],
    )
  }

  private async sendToSubscription(
    subscriptionRow: PushSubscriptionRow,
    payload: string,
  ): Promise<boolean> {
    const { user_id: userId, endpoint, subscription } = subscriptionRow
    const context = { userId, endpoint }

    for (let attempt = 1; attempt <= retryDelaysMs.length + 1; attempt++) {
      try {
        await webpush.sendNotification(subscription, payload)
        await this.markDeliverySuccess(userId, endpoint)
        webpushLogger.debug('Delivered web push notification', { ...context, attempt })
        return true
      } catch (error) {
        const statusCode = isWebPushError(error) ? error.statusCode : undefined

        if (statusCode === 404 || statusCode === 410) {
          webpushLogger.info('Removing expired web push subscription', { ...context, statusCode })
          await this.removeSubscription(userId, endpoint)
          return false
        }

        const shouldRetry =
          statusCode !== undefined &&
          retryableStatusCodes.has(statusCode) &&
          attempt <= retryDelaysMs.length

        if (shouldRetry) {
          const delayMs = retryDelaysMs[attempt - 1]
          webpushLogger.warn('Retrying transient web push failure', {
            ...context,
            statusCode,
            attempt,
            delayMs,
          })
          await sleep(delayMs)
          continue
        }

        const reason = error instanceof Error ? error.message : 'Unknown error'
        await this.markDeliveryFailure(
          userId,
          endpoint,
          statusCode ? `${reason} (status ${statusCode})` : reason,
        )
        webpushLogger.error('Failed to deliver web push notification', {
          ...context,
          statusCode,
          attempt,
          reason,
        })
        return false
      }
    }

    return false
  }

  async sendToUser(userId: string, payload: NotificationPayload): Promise<boolean> {
    if (!isNotificationServiceEnabled) {
      return false
    }

    const subscriptions = await this.getSubscriptions(userId)
    if (subscriptions.length === 0) {
      webpushLogger.debug('No web push subscriptions found for user', { userId })
      return false
    }

    const serializedPayload = JSON.stringify(payload)
    let delivered = false

    for (const subscription of subscriptions) {
      const success = await this.sendToSubscription(subscription, serializedPayload)
      delivered = delivered || success
    }

    return delivered
  }

  async sendToUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
    await Promise.all(
      userIds.map(async (userId) => {
        try {
          await this.sendToUser(userId, payload)
        } catch (error) {
          webpushLogger.error('Failed to send web push notification to user', {
            userId,
            error: error instanceof Error ? error.message : error,
          })
        }
      }),
    )
  }

  async notifyGameStart(gameId: string, playerIds: string[]): Promise<void> {
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

  async notifyTurnStart(gameId: string, userId: string, _username: string): Promise<void> {
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

  async notifyGameEnd(gameId: string, winnerId: string, playerIds: string[]): Promise<void> {
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

    for (const playerId of playerIds) {
      const payload = playerId === winnerId ? payloadForWinner : payloadForOthers
      await this.sendToUser(playerId, payload)
    }
  }

  async notifyGameInvite(userId: string, inviterName: string, gameId: string): Promise<void> {
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

  async sendTestNotification(userId: string): Promise<boolean> {
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

  getVapidPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || ''
  }

  isEnabled(): boolean {
    return isNotificationServiceEnabled
  }
}

export const notificationService = new NotificationService()
export default notificationService
