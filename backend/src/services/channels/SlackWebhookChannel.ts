import type { NotificationEvent, NotificationResult } from '@conquestk/shared/types/notifications'
import { DeterministicRng } from '@conquestk/shared/utils/deterministicRng'
import { logger } from '../../utils/logger.js'
import type { NotificationChannel } from '../NotificationDispatcher.js'
import { formatSlackWebhookPayload, type SlackWebhookPayload } from './slackFormatting.js'

interface SlackWebhookChannelOptions {
  webhookUrls: string[]
  defaultChannel?: string
  additionalChannels?: string[]
  username?: string
  iconEmoji?: string
  failureThreshold?: number
  cooldownMs?: number
  maxAttempts?: number
}

interface SlackDestination {
  webhookUrl: string
  channel?: string
}

interface SlackDeliveryResult {
  ok: boolean
  error?: string
  retryAfterMs?: number
}

const DEFAULT_FAILURE_THRESHOLD = 5
const DEFAULT_COOLDOWN_MS = 60_000
const DEFAULT_MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 500
const JITTER_MS = 250

const channelLogger = logger.child({ channel: 'slack' })

export class SlackWebhookChannel implements NotificationChannel {
  readonly name = 'slack' as const

  private readonly webhookUrls: string[]
  private readonly defaultChannel?: string
  private readonly additionalChannels: string[]
  private readonly username?: string
  private readonly iconEmoji?: string
  private readonly failureThreshold: number
  private readonly cooldownMs: number
  private readonly maxAttempts: number

  private consecutiveFailures = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private nextAttemptAfter = 0

  constructor(options: SlackWebhookChannelOptions) {
    if (options.webhookUrls.length === 0) {
      throw new Error('SlackWebhookChannel requires at least one webhook URL')
    }

    this.webhookUrls = options.webhookUrls
    this.defaultChannel = options.defaultChannel
    this.additionalChannels = options.additionalChannels?.filter(Boolean) ?? []
    this.username = options.username
    this.iconEmoji = options.iconEmoji
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  }

  static fromEnv(): SlackWebhookChannel | null {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    const additionalWebhookUrls = splitCsv(process.env.SLACK_WEBHOOK_URLS)

    const webhookUrls = [webhookUrl, ...additionalWebhookUrls].filter((value): value is string =>
      Boolean(value && value.trim().length > 0),
    )

    if (webhookUrls.length === 0) {
      return null
    }

    const defaultChannel = process.env.SLACK_DEFAULT_CHANNEL?.trim()
    const additionalChannels = splitCsv(process.env.SLACK_ADDITIONAL_CHANNELS)

    return new SlackWebhookChannel({
      webhookUrls,
      defaultChannel,
      additionalChannels,
      username: process.env.SLACK_USERNAME?.trim(),
      iconEmoji: process.env.SLACK_ICON_EMOJI?.trim(),
    })
  }

  isAvailable(): boolean {
    if (this.webhookUrls.length === 0) {
      return false
    }

    if (this.state === 'open') {
      if (Date.now() >= this.nextAttemptAfter) {
        this.state = 'half-open'
        return true
      }

      return false
    }

    return true
  }

  async send(event: NotificationEvent): Promise<NotificationResult> {
    const destinations = this.buildDestinations()

    if (destinations.length === 0) {
      channelLogger.warn('No Slack destinations configured; skipping send')
      return {
        channel: this.name,
        ok: false,
        error: 'No Slack webhook destinations configured',
      }
    }

    let overallOk = true
    const errors: string[] = []
    let maxRetryAfter: number | undefined

    for (const destination of destinations) {
      const result = await this.sendToDestination(event, destination)

      if (!result.ok) {
        overallOk = false
        if (result.error) {
          errors.push(`${redactWebhook(destination.webhookUrl)}: ${result.error}`)
        } else {
          errors.push(`${redactWebhook(destination.webhookUrl)}: unknown error`)
        }
      }

      if (typeof result.retryAfterMs === 'number') {
        maxRetryAfter = Math.max(maxRetryAfter ?? 0, result.retryAfterMs)
      }
    }

    if (overallOk) {
      this.recordSuccess()
      return {
        channel: this.name,
        ok: true,
      }
    }

    this.recordFailure(maxRetryAfter)

    return {
      channel: this.name,
      ok: false,
      error: errors.join('; '),
      retryAfterMs: maxRetryAfter,
    }
  }

  private buildDestinations(): SlackDestination[] {
    const uniqueChannels = new Set<string>()
    if (this.defaultChannel) {
      uniqueChannels.add(this.defaultChannel)
    }
    this.additionalChannels.forEach((channel) => {
      if (channel.trim().length > 0) {
        uniqueChannels.add(channel.trim())
      }
    })

    const channels = Array.from(uniqueChannels)

    if (channels.length === 0) {
      return this.webhookUrls.map((webhookUrl) => ({ webhookUrl }))
    }

    const destinations: SlackDestination[] = []

    for (const webhookUrl of this.webhookUrls) {
      channels.forEach((channel) => {
        destinations.push({ webhookUrl, channel })
      })
    }

    return destinations
  }

  private async sendToDestination(
    event: NotificationEvent,
    destination: SlackDestination,
  ): Promise<SlackDeliveryResult> {
    const payload = this.buildPayload(event, destination.channel)
    const webhookLabel = redactWebhook(destination.webhookUrl)

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await fetch(destination.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        const body = await response.text()
        if (response.ok && body.trim().toLowerCase() === 'ok') {
          channelLogger.debug('Delivered Slack notification', {
            attempt,
            webhook: webhookLabel,
            channel: destination.channel,
          })
          return { ok: true }
        }

        const retryAfterHeader = response.headers.get('retry-after')
        const retryAfterMs = parseRetryAfter(retryAfterHeader)

        if (shouldRetry(response.status)) {
          const delay = this.computeDelay(attempt, retryAfterHeader)
          channelLogger.warn('Retrying Slack webhook after transient failure', {
            status: response.status,
            attempt,
            delayMs: delay,
            webhook: webhookLabel,
            channel: destination.channel,
            responseBody: truncateForLog(body),
          })

          if (attempt < this.maxAttempts) {
            await sleep(delay)
            continue
          }

          return {
            ok: false,
            error: `HTTP ${response.status}: ${truncateForLog(body)}`,
            retryAfterMs,
          }
        }

        channelLogger.error('Slack webhook rejected notification', {
          status: response.status,
          attempt,
          webhook: webhookLabel,
          channel: destination.channel,
          responseBody: truncateForLog(body),
        })

        return {
          ok: false,
          error: `HTTP ${response.status}: ${truncateForLog(body)}`,
          retryAfterMs,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (attempt < this.maxAttempts) {
          const delay = this.computeDelay(attempt)
          channelLogger.warn('Retrying Slack webhook after network error', {
            attempt,
            delayMs: delay,
            webhook: webhookLabel,
            channel: destination.channel,
            error: message,
          })
          await sleep(delay)
          continue
        }

        channelLogger.error('Slack webhook threw during delivery', {
          attempt,
          webhook: webhookLabel,
          channel: destination.channel,
          error: message,
        })

        return { ok: false, error: message }
      }
    }

    return { ok: false, error: 'Exceeded retry attempts' }
  }

  private buildPayload(
    event: NotificationEvent,
    channel?: string,
  ): SlackWebhookPayload & {
    channel?: string
    username?: string
    icon_emoji?: string
  } {
    const base = formatSlackWebhookPayload(event)

    return {
      ...base,
      ...(channel ? { channel } : {}),
      ...(this.username ? { username: this.username } : {}),
      ...(this.iconEmoji ? { icon_emoji: this.iconEmoji } : {}),
    }
  }

  private recordSuccess(): void {
    if (this.consecutiveFailures > 0) {
      channelLogger.debug('Slack circuit breaker closed after successful delivery')
    }
    this.consecutiveFailures = 0
    this.state = 'closed'
    this.nextAttemptAfter = 0
  }

  private recordFailure(retryAfterMs?: number): void {
    this.consecutiveFailures += 1

    if (retryAfterMs) {
      this.nextAttemptAfter = Math.max(this.nextAttemptAfter, Date.now() + retryAfterMs)
    }

    if (this.state === 'half-open') {
      this.state = 'open'
    }

    if (this.consecutiveFailures < this.failureThreshold) {
      channelLogger.warn('Recorded Slack delivery failure', {
        failureCount: this.consecutiveFailures,
        retryAfterMs,
      })
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open'
      this.nextAttemptAfter = Math.max(this.nextAttemptAfter, Date.now() + this.cooldownMs)
      channelLogger.error('Slack circuit breaker opened', {
        failureCount: this.consecutiveFailures,
        cooldownMs: this.cooldownMs,
      })
    }
  }

  private computeDelay(attempt: number, retryAfterHeader?: string | null): number {
    const retryAfterMs = parseRetryAfter(retryAfterHeader)
    if (retryAfterMs) {
      return retryAfterMs
    }

    const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1)
    const jitter = new DeterministicRng('slack-jitter').next() * JITTER_MS
    return exponential + jitter
  }
}

function splitCsv(value?: string | null): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

function parseRetryAfter(value?: string | null): number | undefined {
  if (!value) {
    return undefined
  }

  const numeric = Number(value)
  if (!Number.isNaN(numeric)) {
    return numeric * 1000
  }

  const date = new Date(value)
  const delay = date.getTime() - Date.now()
  if (delay > 0) {
    return delay
  }

  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function redactWebhook(webhookUrl: string): string {
  try {
    const parsed = new URL(webhookUrl)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1] ?? ''
    const redactedSuffix = lastSegment.slice(-4)
    return `${parsed.origin}/…${redactedSuffix}`
  } catch (_error) {
    return 'slack-webhook'
  }
}

function truncateForLog(value: string, maxLength = 120): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, maxLength - 1)}…`
}
