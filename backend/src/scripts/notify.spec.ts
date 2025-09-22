import { describe, expect, it, jest } from '@jest/globals'

const dispatchMock = jest.fn().mockResolvedValue([{ channel: 'slack', ok: true }])

jest.mock('../services/NotificationDispatcher', () => ({
  notificationDispatcher: {
    dispatch: (...args: unknown[]) => dispatchMock(...args),
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
