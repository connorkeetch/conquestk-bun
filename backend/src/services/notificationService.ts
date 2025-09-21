import { randomUUID } from 'node:crypto'
import webpush from 'web-push'
import { query } from '../config/database'
import { logger } from '../utils/logger'
import { emitNotificationToUsers } from './realtimeNotificationService'

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

const webpushLogger =
  typeof logger.child === 'function' ? logger.child({ channel: 'webpush' }) : logger
const retryableStatusCodes = new Set([429, 500, 502, 503, 504])
const retryDelaysMs = [250, 1000, 3000]

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type EventLogger = {
  context: Record<string, unknown>
  debug: (message: string, extra?: Record<string, unknown>) => void
  info: (message: string, extra?: Record<string, unknown>) => void
  warn: (message: string, extra?: Record<string, unknown>) => void
  error: (message: string, extra?: Record<string, unknown>) => void
}

const createEventLogger = (
  metadata: Record<string, unknown>,
  parentContext?: Record<string, unknown>,
): EventLogger => {
  const context = parentContext
    ? { ...parentContext, ...metadata }
    : { eventId: randomUUID(), ...metadata }
  const supportsChild = typeof webpushLogger.child === 'function'
  const baseLogger = (supportsChild ? webpushLogger.child(context) : webpushLogger) as Pick<
    typeof logger,
    LogLevel
  >

  const log = (level: LogLevel, message: string, extra: Record<string, unknown> = {}) => {
    const metadata = supportsChild ? extra : { ...context, ...extra }
    baseLogger[level](message, metadata)
  }

  return {
    context,
    debug: (message: string, extra?: Record<string, unknown>) => log('debug', message, extra ?? {}),
    info: (message: string, extra?: Record<string, unknown>) => log('info', message, extra ?? {}),
    warn: (message: string, extra?: Record<string, unknown>) => log('warn', message, extra ?? {}),
    error: (message: string, extra?: Record<string, unknown>) => log('error', message, extra ?? {}),
  }
}

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
  gameId?: string | number
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

interface PruneOptions {
  failureThreshold?: number
  failureAgeDays?: number
  staleRegistrationDays?: number
}

export interface PruneResult {
  removedExpired: number
  removedFailed: number
  removedStale: number
  totalRemoved: number
  remainingSubscriptions: number
  ranAt: string
}

export interface CreateInAppNotificationOptions {
  type: string
  title: string
  message: string
  data?: Record<string, unknown>
  actionUrl?: string
  actionLabel?: string
  icon?: string
  read?: boolean
  sendPush?: boolean
  pushPayload?: NotificationPayload
}

export interface InAppNotificationRecord {
  id: string
  createdAt: Date
}

const defaultPruneOptions: Required<PruneOptions> = {
  failureThreshold: 3,
  failureAgeDays: 14,
  staleRegistrationDays: 90,
}

class NotificationService {
  async saveSubscription(userId: string, subscription: webpush.PushSubscription): Promise<void> {
    const { endpoint, expirationTime = null, keys } = subscription

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('Invalid push subscription payload')
    }

    const eventLogger = createEventLogger({ userId, endpoint })

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

    eventLogger.debug('Saved web push subscription')
  }

  async removeSubscription(
    userId: string,
    endpoint?: string,
    parentContext?: Record<string, unknown>,
  ): Promise<number> {
    if (endpoint) {
      const eventLogger = createEventLogger({ userId, endpoint }, parentContext)
      const result = await query<{ count: string }>(
        'DELETE FROM web_push_subscriptions WHERE user_id = $1 AND endpoint = $2 RETURNING 1 as count',
        [userId, endpoint],
      )
      if (result.rowCount === 0) {
        eventLogger.debug('No matching subscription to remove')
      } else {
        eventLogger.info('Removed web push subscription', {
          removed: Number(result.rowCount ?? 0),
        })
      }
      return Number(result.rowCount ?? 0)
    }

    const eventLogger = createEventLogger({ userId, scope: 'all' }, parentContext)
    const result = await query<{ count: string }>(
      'DELETE FROM web_push_subscriptions WHERE user_id = $1 RETURNING 1 as count',
      [userId],
    )
    if (result.rowCount && result.rowCount > 0) {
      eventLogger.info('Removed all subscriptions for user', {
        removed: Number(result.rowCount ?? 0),
      })
    } else {
      eventLogger.debug('No web push subscriptions found for user')
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
    parentLogger: EventLogger,
  ): Promise<boolean> {
    const { user_id: userId, endpoint, subscription } = subscriptionRow
    const eventLogger = createEventLogger({ endpoint }, parentLogger.context)

    for (let attempt = 1; attempt <= retryDelaysMs.length + 1; attempt++) {
      try {
        await webpush.sendNotification(subscription, payload)
        await this.markDeliverySuccess(userId, endpoint)
        eventLogger.debug('Delivered web push notification', { attempt })
        return true
      } catch (error) {
        const statusCode = isWebPushError(error) ? error.statusCode : undefined

        if (statusCode === 404 || statusCode === 410) {
          eventLogger.info('Removing expired web push subscription', { statusCode })
          await this.removeSubscription(userId, endpoint, eventLogger.context)
          return false
        }

        const shouldRetry =
          statusCode !== undefined &&
          retryableStatusCodes.has(statusCode) &&
          attempt <= retryDelaysMs.length

        if (shouldRetry) {
          const delayMs = retryDelaysMs[attempt - 1]
          eventLogger.warn('Retrying transient web push failure', {
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
        eventLogger.error('Failed to deliver web push notification', {
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
    const baseMetadata = {
      userId,
      notificationTag: payload.tag,
      notificationTitle: payload.title,
    }

    if (!isNotificationServiceEnabled) {
      const eventLogger = createEventLogger({ ...baseMetadata, reason: 'service-disabled' })
      eventLogger.debug('Web push service disabled; skipping delivery')
      return false
    }

    const eventLogger = createEventLogger(baseMetadata)
    const subscriptions = await this.getSubscriptions(userId)
    if (subscriptions.length === 0) {
      eventLogger.debug('No web push subscriptions found for user')
      return false
    }

    const serializedPayload = JSON.stringify(payload)
    let delivered = false

    eventLogger.debug('Attempting web push delivery', {
      subscriptionCount: subscriptions.length,
    })

    for (const subscription of subscriptions) {
      const success = await this.sendToSubscription(subscription, serializedPayload, eventLogger)
      delivered = delivered || success
    }

    if (delivered) {
      eventLogger.info('Web push delivered to at least one subscription', {
        subscriptionCount: subscriptions.length,
      })
    } else {
      eventLogger.warn('Web push delivery failed for all subscriptions', {
        subscriptionCount: subscriptions.length,
      })
    }

    return delivered
  }

  async sendToUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
    await Promise.all(
      userIds.map(async (userId) => {
        try {
          await this.sendToUser(userId, payload)
        } catch (error) {
          const eventLogger = createEventLogger({
            userId,
            notificationTag: payload.tag,
            notificationTitle: payload.title,
          })
          eventLogger.error('Failed to send web push notification to user', {
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

  async pruneStaleSubscriptions(options: PruneOptions = {}): Promise<PruneResult> {
    const { failureThreshold, failureAgeDays, staleRegistrationDays } = {
      ...defaultPruneOptions,
      ...options,
    }

    if (failureThreshold <= 0) {
      throw new Error('failureThreshold must be greater than zero')
    }

    if (failureAgeDays <= 0) {
      throw new Error('failureAgeDays must be greater than zero')
    }

    if (staleRegistrationDays <= 0) {
      throw new Error('staleRegistrationDays must be greater than zero')
    }

    const failureAgeInterval = `${failureAgeDays} days`
    const staleInterval = `${staleRegistrationDays} days`

    const pruneResult = await query<{
      expired_removed: string
      failed_removed: string
      stale_removed: string
    }>(
      `
        WITH expired AS (
          DELETE FROM web_push_subscriptions
          WHERE expiration_time IS NOT NULL
            AND expiration_time < NOW()
          RETURNING 1
        ), failed AS (
          DELETE FROM web_push_subscriptions
          WHERE failure_count >= $1
            AND last_failure_at IS NOT NULL
            AND last_failure_at < NOW() - ($2::interval)
          RETURNING 1
        ), stale AS (
          DELETE FROM web_push_subscriptions
          WHERE last_success_at IS NULL
            AND last_failure_at IS NULL
            AND expiration_time IS NULL
            AND created_at < NOW() - ($3::interval)
          RETURNING 1
        )
        SELECT
          (SELECT COUNT(*) FROM expired) AS expired_removed,
          (SELECT COUNT(*) FROM failed) AS failed_removed,
          (SELECT COUNT(*) FROM stale) AS stale_removed
      `,
      [failureThreshold, failureAgeInterval, staleInterval],
    )

    const row = pruneResult.rows[0] ?? {
      expired_removed: '0',
      failed_removed: '0',
      stale_removed: '0',
    }

    const removedExpired = Number(row.expired_removed ?? 0)
    const removedFailed = Number(row.failed_removed ?? 0)
    const removedStale = Number(row.stale_removed ?? 0)
    const totalRemoved = removedExpired + removedFailed + removedStale

    const remainingResult = await query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM web_push_subscriptions',
    )
    const remainingSubscriptions = Number(remainingResult.rows[0]?.total ?? 0)

    const ranAt = new Date().toISOString()

    const summary: PruneResult = {
      removedExpired,
      removedFailed,
      removedStale,
      totalRemoved,
      remainingSubscriptions,
      ranAt,
    }

    const metadata = {
      ...summary,
      options: { failureThreshold, failureAgeDays, staleRegistrationDays },
    }

    const pruneLogger = createEventLogger({ operation: 'prune-webpush-subscriptions' })

    if (totalRemoved > 0) {
      pruneLogger.info('Pruned web push subscriptions', metadata)
    } else {
      pruneLogger.debug('Pruned web push subscriptions', metadata)
    }

    return summary
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

  async createInAppNotification(
    userId: string,
    options: CreateInAppNotificationOptions,
  ): Promise<InAppNotificationRecord> {
    const id = randomUUID()
    const createdAt = new Date()

    const mergedData = {
      ...(options.data ?? {}),
      actionUrl: options.actionUrl,
      actionLabel: options.actionLabel,
      icon: options.icon,
    }

    await query(
      `
        INSERT INTO notifications (id, user_id, type, title, message, data, created_at, read_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        userId,
        options.type,
        options.title,
        options.message,
        JSON.stringify(mergedData),
        createdAt,
        options.read ? createdAt : null,
      ],
    )

    emitNotificationToUsers([
      userId,
    ], {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      createdAt: createdAt.toISOString(),
      read: options.read ?? false,
      actionUrl: options.actionUrl,
      actionLabel: options.actionLabel,
      icon: options.icon,
      metadata: options.data,
    })

    if (options.sendPush && this.isEnabled()) {
      const payload: NotificationPayload =
        options.pushPayload ??
        ({
          title: options.title,
          body: options.message,
          data: {
            url: options.actionUrl,
            type: options.type,
            ...options.data,
          },
        } as NotificationPayload)

      await this.sendToUser(userId, payload)
    }

    return { id, createdAt }
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
