import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import notificationService from '../services/notificationService'

const mockQuery = jest.fn()

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}))

const emitNotificationToUsers = jest.fn()

jest.mock('../services/realtimeNotificationService', () => ({
  emitNotificationToUsers: (...args: unknown[]) => emitNotificationToUsers(...args),
}))

describe('notificationService.createInAppNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery.mockReset()
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    emitNotificationToUsers.mockReset()
  })

  it('stores notification and emits realtime payload', async () => {
    const result = await notificationService.createInAppNotification('user-123', {
      type: 'system',
      title: 'Test notification',
      message: 'This is only a test',
      data: { foo: 'bar' },
      sendPush: false,
    })

    expect(result.id).toEqual(expect.any(String))
    expect(result.createdAt).toBeInstanceOf(Date)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['user-123', 'system', 'Test notification']),
    )

    expect(emitNotificationToUsers).toHaveBeenCalledWith(
      ['user-123'],
      expect.objectContaining({
        id: result.id,
        type: 'system',
        title: 'Test notification',
        message: 'This is only a test',
      }),
    )
  })
})
