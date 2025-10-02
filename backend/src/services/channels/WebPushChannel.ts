import type { NotificationEvent, NotificationResult } from '@risk-game/shared/types/notifications'
import { logger } from '../../utils/logger'
import type { NotificationChannel } from '../NotificationDispatcher'
import notificationService, { type NotificationPayload } from '../notificationService'

export type WebPushService = Pick<typeof notificationService, 'isEnabled' | 'sendToUsers'>

interface WebPushChannelOptions {
  service?: WebPushService
}

const channelLogger =
  typeof logger.child === 'function' ? logger.child({ channel: 'webpush' }) : logger

const MAX_ACTIONS = 2

export class WebPushChannel implements NotificationChannel {
  readonly name = 'webpush' as const

  private readonly service: WebPushService

  constructor(options: WebPushChannelOptions = {}) {
    this.service = options.service ?? notificationService
  }

  isAvailable(): boolean {
    return this.service.isEnabled()
  }

  async send(event: NotificationEvent): Promise<NotificationResult> {
    if (!this.service.isEnabled()) {
      channelLogger.debug('Web push service disabled; skipping notification', {
        eventType: event.type,
      })
      return {
        channel: this.name,
        ok: false,
        error: 'Web push service disabled',
      }
    }

    const userIds = event.recipients?.userIds?.filter(
      (id) => typeof id === 'string' && id.trim().length > 0,
    )

    if (!userIds || userIds.length === 0) {
      channelLogger.debug(
        'Skipping web push notification because no user recipients were provided',
        {
          eventType: event.type,
        },
      )

      return {
        channel: this.name,
        ok: true,
      }
    }

    const payload = this.buildPayload(event)

    try {
      await this.service.sendToUsers(userIds, payload)
      return {
        channel: this.name,
        ok: true,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown web push error'
      channelLogger.error('Failed to send web push notification', {
        eventType: event.type,
        userIds,
        error: message,
      })

      return {
        channel: this.name,
        ok: false,
        error: message,
      }
    }
  }

  private buildPayload(event: NotificationEvent): NotificationPayload {
    const primaryCta = event.cta?.[0]

    const data: Record<string, unknown> = {
      eventType: event.type,
      severity: event.severity,
    }

    if (primaryCta?.url) {
      data.url = primaryCta.url
    }

    if (primaryCta?.label) {
      data.actionLabel = primaryCta.label
    }

    if (event.context && Object.keys(event.context).length > 0) {
      data.context = event.context
    }

    if (event.recipients?.roles?.length) {
      data.recipientRoles = event.recipients.roles
    }

    if (event.recipients?.userIds?.length) {
      data.recipientUserIds = event.recipients.userIds
    }

    const actions = event.cta?.slice(0, MAX_ACTIONS).map((cta, index) => ({
      action: `cta-${index + 1}`,
      title: cta.label,
    }))

    return {
      title: event.title,
      body: event.body && event.body.trim().length > 0 ? event.body : event.title,
      tag: event.type,
      data,
      actions,
    }
  }
}

export const webPushChannel = new WebPushChannel()
