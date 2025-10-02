import { describe, expect, it, jest } from '@jest/globals'
import type { NotificationEvent, NotificationResult } from '@risk-game/shared/types/notifications'

type DispatchFn = (event: NotificationEvent) => Promise<NotificationResult[]>

const dispatchMock = jest.fn<DispatchFn>()
dispatchMock.mockResolvedValue([{ channel: 'slack', ok: true }])

jest.mock('../services/NotificationDispatcher', () => ({
  notificationDispatcher: {
    dispatch: (event: NotificationEvent) => dispatchMock(event),
  },
}))

describe('notify CLI', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
  })

  it('sends an event using dispatcher with provided arguments', async () => {
    const originalArgv = process.argv
    process.argv = [
      'node',
      'notify',
      '--type',
      'test.event',
      '--user',
      'user-42',
      '--role',
      'admin',
      '--title',
      'Test Event',
    ]

    try {
      const { runCli } = await import('./notify')

      await runCli()

      expect(dispatchMock).toHaveBeenCalledTimes(1)
      const eventArg = dispatchMock.mock.calls[0][0]
      expect(eventArg).toMatchObject({
        type: 'test.event',
        title: 'Test Event',
        recipients: { userIds: ['user-42'], roles: ['admin'] },
      })
    } finally {
      process.argv = originalArgv
    }
  })
})
