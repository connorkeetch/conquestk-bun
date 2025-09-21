import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import notificationService from '../services/notificationService'

var mockQuery: jest.Mock

jest.mock('../config/database', () => {
  mockQuery = jest.fn()
  return {
    query: (...args: unknown[]) => mockQuery(...args),
  }
})

var emitNotificationToUsers: jest.Mock

jest.mock('../services/realtimeNotificationService', () => {
  emitNotificationToUsers = jest.fn()
  return {
    emitNotificationToUsers: (...args: unknown[]) => emitNotificationToUsers(...args),
  }
})

describe('notificationService.createInAppNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })
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
