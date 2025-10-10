import { afterEach, describe, expect, it, jest } from '@jest/globals'
import type { NotificationEvent } from '@conquestk/shared/types/notifications'
import { DiscordWebhookChannel } from './DiscordWebhookChannel.js'

const baseEvent: NotificationEvent = {
  id: 'event-2',
  type: 'incident.backend_error',
  title: 'Backend error rate spiked',
  body: 'Error rate exceeded threshold on staging.',
  severity: 'critical',
  createdAt: '2026-05-12T12:15:00.000Z',
}

describe('DiscordWebhookChannel', () => {
  afterEach(() => {
    delete process.env.DISCORD_WEBHOOK_URL
    delete process.env.DISCORD_WEBHOOK_URLS
    delete process.env.DISCORD_USERNAME
    delete process.env.DISCORD_AVATAR_URL
    delete process.env.DISCORD_THREAD_ID
  })

  it('returns null from fromEnv when no webhook URLs are configured', () => {
    expect(DiscordWebhookChannel.fromEnv()).toBeNull()
  })

  it('sends payloads to configured webhook URLs', async () => {
    const fetchMock = jest.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))

    const channel = new DiscordWebhookChannel({
      webhookUrls: ['https://discord.com/api/webhooks/123/abc'],
      username: 'ConquestK Alerts',
      threadId: '42',
      fetchFn: fetchMock,
    })

    const result = await channel.send(baseEvent)

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>
    expect(String(url)).toContain('thread_id=42')
    expect(init?.method).toBe('POST')

    const payload = JSON.parse(String(init?.body))
    expect(payload.username).toBe('ConquestK Alerts')
    expect(payload.content).toContain('Backend error rate spiked')
  })

  it('opens circuit breaker after repeated failures', async () => {
    const fetchMock = jest.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response('oops', {
        status: 500,
        headers: { 'retry-after': '1' },
      }),
    )

    const channel = new DiscordWebhookChannel({
      webhookUrls: ['https://discord.com/api/webhooks/xyz/123'],
      fetchFn: fetchMock,
      failureThreshold: 1,
      maxAttempts: 1,
      cooldownMs: 1000,
    })

    const result = await channel.send(baseEvent)
    expect(result.ok).toBe(false)

    expect(channel.isAvailable()).toBe(false)
  })
})
