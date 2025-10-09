import type { NotificationEvent, NotificationResult } from '@risk-game/shared/types/notifications'
import { logger } from '../../utils/logger.js'
import type { NotificationChannel } from '../NotificationDispatcher.js'
import { formatDiscordWebhookPayload } from './discordFormatting.js'

interface DiscordWebhookChannelOptions {
  webhookUrls: string[]
  username?: string
  avatarUrl?: string
  threadId?: string
  failureThreshold?: number
  cooldownMs?: number
  maxAttempts?: number
  fetchFn?: typeof fetch
}

interface DiscordDeliveryResult {
  ok: boolean
  error?: string
  retryAfterMs?: number
}

const DEFAULT_FAILURE_THRESHOLD = 5
const DEFAULT_COOLDOWN_MS = 60_000
const DEFAULT_MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 500
const JITTER_MS = 250

const channelLogger =
  typeof logger.child === 'function' ? logger.child({ channel: 'discord' }) : logger

export class DiscordWebhookChannel implements NotificationChannel {
  readonly name = 'discord' as const

  private readonly webhookUrls: string[]
  private readonly username?: string
  private readonly avatarUrl?: string
  private readonly threadId?: string
  private readonly failureThreshold: number
  private readonly cooldownMs: number
  private readonly maxAttempts: number
  private readonly fetchFn: typeof fetch

  private consecutiveFailures = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private nextAttemptAfter = 0

  constructor(options: DiscordWebhookChannelOptions) {
    if (!options.webhookUrls.length) {
      throw new Error('DiscordWebhookChannel requires at least one webhook URL')
    }

    this.webhookUrls = options.webhookUrls
    this.username = options.username
    this.avatarUrl = options.avatarUrl
    this.threadId = options.threadId
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.fetchFn = options.fetchFn ?? fetch
  }

  static fromEnv(): DiscordWebhookChannel | null {
    const primaryWebhook = process.env.DISCORD_WEBHOOK_URL
    const additional = splitCsv(process.env.DISCORD_WEBHOOK_URLS)

    const webhookUrls = [primaryWebhook, ...additional]
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .map((value) => value.trim())

    if (webhookUrls.length === 0) {
      return null
    }

    return new DiscordWebhookChannel({
      webhookUrls,
      username: process.env.DISCORD_USERNAME?.trim(),
      avatarUrl: process.env.DISCORD_AVATAR_URL?.trim(),
      threadId: process.env.DISCORD_THREAD_ID?.trim(),
    })
  }

  isAvailable(): boolean {
    if (!this.webhookUrls.length) {
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
      channelLogger.warn('No Discord webhook destinations configured; skipping delivery')
      return {
        channel: this.name,
        ok: false,
        error: 'No Discord webhook destinations configured',
      }
    }

    let overallOk = true
    const errors: string[] = []
    let maxRetryAfter: number | undefined

    await Promise.all(
      destinations.map(async (webhookUrl) => {
        const result = await this.sendToWebhook(event, webhookUrl)
        if (!result.ok) {
          overallOk = false
          errors.push(`${redactWebhook(webhookUrl)}: ${result.error ?? 'unknown error'}`)
        }

        if (typeof result.retryAfterMs === 'number') {
          maxRetryAfter = Math.max(maxRetryAfter ?? 0, result.retryAfterMs)
        }
      }),
    )

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

  private async sendToWebhook(
    event: NotificationEvent,
    webhookUrl: string,
  ): Promise<DiscordDeliveryResult> {
    const payload = this.buildPayload(event)
    const url = this.appendThreadId(webhookUrl)
    const webhookLabel = redactWebhook(webhookUrl)

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        const responseBody = await response.text()

        if (response.ok) {
          channelLogger.debug('Delivered Discord notification', {
            attempt,
            webhook: webhookLabel,
          })
          return { ok: true }
        }

        const retryAfterHeader = response.headers.get('retry-after')
        const retryAfterMs = parseRetryAfter(retryAfterHeader)

        if (shouldRetry(response.status)) {
          const delay = this.computeDelay(attempt, retryAfterHeader)
          channelLogger.warn('Retrying Discord webhook after transient failure', {
            status: response.status,
            attempt,
            delayMs: delay,
            webhook: webhookLabel,
            responseBody: truncateForLog(responseBody),
          })

          if (attempt < this.maxAttempts) {
            await sleep(delay)
            continue
          }

          return {
            ok: false,
            error: `HTTP ${response.status}: ${truncateForLog(responseBody)}`,
            retryAfterMs,
          }
        }

        channelLogger.error('Discord webhook rejected notification', {
          status: response.status,
          attempt,
          webhook: webhookLabel,
          responseBody: truncateForLog(responseBody),
        })

        return {
          ok: false,
          error: `HTTP ${response.status}: ${truncateForLog(responseBody)}`,
          retryAfterMs,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        if (attempt < this.maxAttempts) {
          const delay = this.computeDelay(attempt)
          channelLogger.warn('Retrying Discord webhook after network error', {
            attempt,
            delayMs: delay,
            webhook: webhookLabel,
            error: message,
          })
          await sleep(delay)
          continue
        }

        channelLogger.error('Discord webhook threw during delivery', {
          attempt,
          webhook: webhookLabel,
          error: message,
        })

        return { ok: false, error: message }
      }
    }

    return { ok: false, error: 'Exceeded retry attempts' }
  }

  private buildDestinations(): string[] {
    return [...new Set(this.webhookUrls)]
  }

  private buildPayload(event: NotificationEvent) {
    const payload = formatDiscordWebhookPayload(event)
    return {
      ...payload,
      ...(this.username ? { username: this.username } : {}),
      ...(this.avatarUrl ? { avatar_url: this.avatarUrl } : {}),
    }
  }

  private appendThreadId(webhookUrl: string): string {
    if (!this.threadId) {
      return webhookUrl
    }

    try {
      const url = new URL(webhookUrl)
      if (!url.searchParams.has('thread_id')) {
        url.searchParams.set('thread_id', this.threadId)
      }
      return url.toString()
    } catch (_error) {
      return webhookUrl
    }
  }

  private recordSuccess(): void {
    if (this.consecutiveFailures > 0) {
      channelLogger.debug('Discord circuit breaker closed after successful delivery')
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
      channelLogger.warn('Recorded Discord delivery failure', {
        failureCount: this.consecutiveFailures,
        retryAfterMs,
      })
      return
    }

    this.state = 'open'
    this.nextAttemptAfter = Math.max(this.nextAttemptAfter, Date.now() + this.cooldownMs)

    channelLogger.error('Discord circuit breaker opened', {
      failureCount: this.consecutiveFailures,
      cooldownMs: this.cooldownMs,
    })
  }

  private computeDelay(attempt: number, retryAfterHeader?: string | null): number {
    const retryAfterMs = parseRetryAfter(retryAfterHeader)
    if (retryAfterMs) {
      return retryAfterMs
    }

    const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1)
    const jitter = Math.random() * JITTER_MS
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

function truncateForLog(value: string, maxLength = 120): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, maxLength - 1)}…`
}

function redactWebhook(webhookUrl: string): string {
  try {
    const parsed = new URL(webhookUrl)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1] ?? ''
    const redactedSuffix = lastSegment.slice(-4)
    return `${parsed.origin}/…${redactedSuffix}`
  } catch (_error) {
    return 'discord-webhook'
  }
}

export const discordWebhookChannel = DiscordWebhookChannel.fromEnv()
