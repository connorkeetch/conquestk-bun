import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { GameLifecycleService } from '../services/gameLifecycleService.js'

// Mocks for Redis locking
const mockAcquireLock = jest.fn<Promise<string | null>, [string, number]>()
const mockReleaseLock = jest.fn<Promise<void>, [string, string]>()

// Mock DB client + pool
const mockClientQuery = jest.fn<
  Promise<{ rows: unknown[]; rowCount: number }>,
  [unknown, unknown?]
>()
const mockClientRelease = jest.fn<Promise<void>, []>()
const mockClient = {
  query: (...args: Parameters<typeof mockClientQuery>) => mockClientQuery(...args),
  release: (...args: Parameters<typeof mockClientRelease>) => mockClientRelease(...args),
}
const mockGetClient = jest.fn<Promise<typeof mockClient>, []>().mockResolvedValue(mockClient)
const mockDbQuery = jest.fn<Promise<{ rows: unknown[]; rowCount: number }>, [unknown, unknown?]>()

jest.mock('../config/redis', () => ({
  acquireLock: (...args: Parameters<typeof mockAcquireLock>) => mockAcquireLock(...args),
  releaseLock: (...args: Parameters<typeof mockReleaseLock>) => mockReleaseLock(...args),
  getRedisClient: jest.fn(() => null),
}))

jest.mock('../config/database', () => ({
  getClient: (...args: Parameters<typeof mockGetClient>) => mockGetClient(...args),
  query: (...args: Parameters<typeof mockDbQuery>) => mockDbQuery(...args),
}))

jest.mock('../services/gameRoomService', () => ({
  GameRoomService: jest.fn(() => ({
    // scheduleTurnTimeout needs a currentTurnUserId to be truthy
    getRoomById: jest.fn(async (roomId: string) => ({
      id: roomId,
      status: 'active',
      currentTurnUserId: 'u1',
      turnTimerSeconds: 60,
    })),
  })),
}))

jest.mock('../services/socketRegistry', () => ({
  tryGetSocketServer: jest.fn(() => null),
}))

jest.mock('../services/capitalGameService', () => ({
  __esModule: true,
  default: {
    initializeCapitals: jest.fn(),
  },
}))

jest.mock('../services/queueService', () => ({
  queueService: {
    changeDelayedGameActionDelay: jest.fn(async () => false),
    addDelayedGameAction: jest.fn(async () => null),
  },
}))

describe('GameLifecycleService time bank activation', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    mockAcquireLock.mockReset()
    mockReleaseLock.mockReset()
    mockGetClient.mockReset()
    mockClientQuery.mockReset()
    mockClientRelease.mockReset()
    mockDbQuery.mockReset()

    mockAcquireLock.mockResolvedValue('lt')
    mockReleaseLock.mockResolvedValue()
    mockGetClient.mockResolvedValue(mockClient)

    // Default: allow any query to be a no-op
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  it('uses time bank and reschedules expiry when base timer is overdue and bank remains', async () => {
    const svc = new GameLifecycleService()
    const roomId = 'r1'

    // Simulate initial SELECT of game_rooms row with expired/absent turn_expires_at
    mockClientQuery.mockImplementation(async (sql: unknown, params?: unknown[]) => {
      const text = String(sql)
      if (text.includes('FROM game_rooms') && text.includes('FOR UPDATE')) {
        return {
          rowCount: 1,
          rows: [
            {
              current_turn_user_id: 'u1',
              turn_expires_at: null,
              turn_timer: 60,
              using_time_bank: false,
              turn_number: 3,
            },
          ],
        }
      }
      if (text.includes('SELECT time_bank_seconds_remaining') && text.includes('room_players')) {
        return { rowCount: 1, rows: [{ time_bank_seconds_remaining: 30 }] }
      }
      // For updates/commit/rollback, return a generic success
      return { rowCount: 1, rows: [] }
    })

    await svc.handleTurnTimeout(roomId)

    // Verify we zeroed out bank for the player
    const zeroBankCall = mockClientQuery.mock.calls.find(
      ([sql]) =>
        String(sql).includes('UPDATE room_players') &&
        String(sql).includes('time_bank_seconds_remaining = 0'),
    )
    expect(zeroBankCall).toBeDefined()
    expect(zeroBankCall?.[1]).toEqual([roomId, 'u1'])

    // Verify we flipped using_time_bank TRUE and set turn_expires_at using seconds param
    const bankActivateCall = mockClientQuery.mock.calls.find(
      ([sql]) =>
        String(sql).includes('UPDATE game_rooms') && String(sql).includes('using_time_bank = TRUE'),
    )
    expect(bankActivateCall).toBeDefined()
    // Params: [roomId, consumedBankSeconds]
    expect(bankActivateCall?.[1]).toEqual([roomId, 30])

    // scheduleTurnTimeout should persist a non-transactional expiry with using_time_bank = true
    const persistExpiryCall = mockDbQuery.mock.calls.find(
      ([sql]) =>
        String(sql).includes('UPDATE game_rooms') &&
        String(sql).includes('turn_expires_at = NOW() + ($2::int * INTERVAL') &&
        String(sql).includes('using_time_bank = $3'),
    )
    expect(persistExpiryCall).toBeDefined()
    expect(persistExpiryCall?.[1]).toEqual([roomId, 30, true])
  })
})
