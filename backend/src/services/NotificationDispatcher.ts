import type { NotificationEvent, NotificationResult } from '@risk-game/shared/types/notifications'
import { SlackWebhookChannel } from './channels/SlackWebhookChannel'
import { logger } from '../utils/logger'

export type NotificationChannelName = 'webpush' | 'slack' | 'discord' | (string & {})

export interface NotificationChannel {
  name: NotificationChannelName
  send(event: NotificationEvent): Promise<NotificationResult>
  isAvailable?(): boolean | Promise<boolean>
}

interface NotificationDispatcherOptions {
  channels?: NotificationChannel[]
  loggerContext?: Record<string, unknown>
  enabledChannels?: string[]
  externalNotificationsEnabled?: boolean
}

const SERVICE_LOGGER = logger.child({ service: 'NotificationDispatcher' })

export class NotificationDispatcher {
  private logger = SERVICE_LOGGER

  private readonly configuredChannels: Set<string>

  private readonly externalNotificationsEnabled: boolean

  private readonly channels = new Map<string, NotificationChannel>()

  constructor(options: NotificationDispatcherOptions = {}) {
    if (options.loggerContext) {
      this.logger = SERVICE_LOGGER.child(options.loggerContext)
    }

    this.configuredChannels = this.parseConfiguredChannels(
      options.enabledChannels ?? process.env.NOTIFICATION_CHANNELS,
    )

    this.externalNotificationsEnabled =
      options.externalNotificationsEnabled ?? this.parseBoolean(process.env.ENABLE_EXTERNAL_NOTIFICATIONS)

    options.channels?.forEach((channel) => {
      this.registerChannel(channel)
    })
  }

  registerChannel(channel: NotificationChannel): void {
    const key = this.normalizeChannelName(channel.name)
    this.channels.set(key, channel)
    this.logger.debug('Registered notification channel', { channel: channel.name })
  }

  getRegisteredChannels(): NotificationChannel[] {
    return Array.from(this.channels.values())
  }

  getEnabledChannels(): NotificationChannel[] {
    return this.getRegisteredChannels().filter((channel) => this.shouldDispatchTo(channel.name))
  }

  async dispatch(event: NotificationEvent): Promise<NotificationResult[]> {
    const channels = this.getEnabledChannels()

    if (channels.length === 0) {
      this.logger.debug('No notification channels enabled for event', { eventType: event.type })
      return []
    }

    const deliveries = channels.map(async (channel) => {
      const channelLogger = this.logger.child({
        channel: channel.name,
        eventId: event.id,
        eventType: event.type,
      })

      try {
        const isAvailable = channel.isAvailable ? await channel.isAvailable() : true
        if (!isAvailable) {
          channelLogger.warn('Skipping notification channel because it is unavailable')
          return {
            channel: channel.name,
            ok: false,
            error: 'Channel unavailable',
          }
        }

        channelLogger.debug('Sending notification event to channel')
        const result = await channel.send(event)

        if (result.ok) {
          channelLogger.debug('Notification channel accepted event', { providerMessageId: result.id })
        } else {
          channelLogger.warn('Notification channel reported failure', {
            error: result.error,
            retryAfterMs: result.retryAfterMs,
          })
        }

        return result
      } catch (error) {
        channelLogger.error('Notification channel threw while sending event', { error })
        return {
          channel: channel.name,
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown channel error',
        }
      }
    })

    return Promise.all(deliveries)
  }

  private shouldDispatchTo(channelName: NotificationChannelName): boolean {
    const normalized = this.normalizeChannelName(channelName)

    if (this.configuredChannels.size > 0 && !this.configuredChannels.has(normalized)) {
      this.logger.debug('Skipping channel because it is not listed in NOTIFICATION_CHANNELS', {
        channel: channelName,
      })
      return false
    }

    if (normalized === 'webpush') {
      return true
    }

    if (!this.externalNotificationsEnabled) {
      this.logger.debug('Skipping channel because external notifications are disabled', {
        channel: channelName,
      })
      return false
    }

    if (!this.isChannelFlagEnabled(normalized)) {
      this.logger.debug('Skipping channel because it is disabled via env flag', {
        channel: channelName,
      })
      return false
    }

    return true
  }

  private isChannelFlagEnabled(channel: string): boolean {
    switch (channel) {
      case 'slack':
        return this.parseBoolean(process.env.SLACK_NOTIFICATIONS_ENABLED)
      case 'discord':
        return this.parseBoolean(process.env.DISCORD_NOTIFICATIONS_ENABLED)
      default:
        return true
    }
  }

  private parseConfiguredChannels(value?: string | string[] | null): Set<string> {
    if (!value) {
      return new Set()
    }

    const list = Array.isArray(value) ? value : value.split(',')

    const normalized = list
      .map((entry) => this.normalizeChannelName(entry))
      .filter((entry) => entry.length > 0)

    return new Set(normalized)
  }

  private normalizeChannelName(name: string | NotificationChannelName): string {
    return name.trim().toLowerCase()
  }

  private parseBoolean(value?: string | null, defaultValue = false): boolean {
    if (!value) {
      return defaultValue
    }

    return value.toLowerCase() === 'true'
  }
}

const defaultChannels: NotificationChannel[] = []

const slackChannel = SlackWebhookChannel.fromEnv()
if (slackChannel) {
  defaultChannels.push(slackChannel)
}

export const notificationDispatcher = new NotificationDispatcher({
  channels: defaultChannels,
})
