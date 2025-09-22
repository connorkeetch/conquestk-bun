import type { NotificationEvent } from '@risk-game/shared/types/notifications'
import { WebPushChannel } from './WebPushChannel'

jest.mock('../notificationService', () => ({
  __esModule: true,
  default: {
    isEnabled: jest.fn().mockReturnValue(true),
    sendToUsers: jest.fn().mockResolvedValue(undefined),
  },
}))

const baseEvent: NotificationEvent = {
  id: 'event-1',
  type: 'map.approved',
  title: 'Map approved',
  body: 'The map **Asteroid Belt** is now live.',
  severity: 'info',
  recipients: {
    userIds: ['user-123'],
  },
  createdAt: '2026-05-12T12:00:00.000Z',
}

const createMockService = () => {
  const isEnabledMock = jest.fn().mockReturnValue(true)
  const sendToUsersMock = jest.fn().mockResolvedValue(undefined)

  return {
    service: {
      isEnabled: isEnabledMock,
      sendToUsers: sendToUsersMock,
    } as any,
    isEnabledMock,
    sendToUsersMock,
  }
}

describe('WebPushChannel', () => {
  it('returns disabled result when web push service is disabled', async () => {
    const { service, isEnabledMock, sendToUsersMock } = createMockService()
    isEnabledMock.mockReturnValue(false)

    const channel = new WebPushChannel({ service })
    const result = await channel.send(baseEvent)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Web push service disabled')
    expect(sendToUsersMock).not.toHaveBeenCalled()
  })

  it('returns error when no user recipients are provided', async () => {
    const { service, sendToUsersMock } = createMockService()
    const channel = new WebPushChannel({ service })

    const eventWithoutRecipients: NotificationEvent = {
      ...baseEvent,
      recipients: { userIds: [] },
    }

    const result = await channel.send(eventWithoutRecipients)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('No user recipients specified')
    expect(sendToUsersMock).not.toHaveBeenCalled()
  })

  it('delegates to notification service when recipients exist', async () => {
    const { service, sendToUsersMock } = createMockService()
    const channel = new WebPushChannel({ service })

    const result = await channel.send(baseEvent)

    expect(result.ok).toBe(true)
    expect(sendToUsersMock).toHaveBeenCalledTimes(1)
    const [userIds, payload] = sendToUsersMock.mock.calls[0]
    expect(userIds).toEqual(['user-123'])
    expect(payload.title).toBe(baseEvent.title)
    expect(payload.body).toContain('Asteroid Belt')
    expect(payload.tag).toBe(baseEvent.type)
  })

  it('surfaces errors from the notification service', async () => {
    const { service, sendToUsersMock } = createMockService()
    sendToUsersMock.mockRejectedValue(new Error('boom'))

    const channel = new WebPushChannel({ service })
    const result = await channel.send(baseEvent)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('boom')
  })
})
