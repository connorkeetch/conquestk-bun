import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { LifecycleSnapshot } from '../services/gameLifecycleService'
import { GameLifecycleService } from '../services/gameLifecycleService'

const mockAcquireLock = jest.fn<Promise<string | null>, [string, number]>()
const mockReleaseLock = jest.fn<Promise<void>, [string, string]>()

const mockDbQuery = jest.fn<Promise<{ rows: unknown[]; rowCount: number }>, [unknown, unknown?]>()
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

jest.mock('../config/redis', () => ({
  acquireLock: (...args: Parameters<typeof mockAcquireLock>) => mockAcquireLock(...args),
  releaseLock: (...args: Parameters<typeof mockReleaseLock>) => mockReleaseLock(...args),
}))

jest.mock('../config/database', () => ({
  getClient: (...args: Parameters<typeof mockGetClient>) => mockGetClient(...args),
  query: (...args: Parameters<typeof mockDbQuery>) => mockDbQuery(...args),
}))

jest.mock('../services/gameRoomService', () => ({
  GameRoomService: jest.fn(() => ({})),
}))

jest.mock('../services/gameService', () => ({
  GameService: jest.fn(() => ({})),
}))

jest.mock('../services/queueService', () => ({
  queueService: {},
}))

jest.mock('../services/capitalGameService', () => ({
  __esModule: true,
  default: {
    initializeCapitals: jest.fn(),
  },
}))

jest.mock('../services/socketRegistry', () => ({
  tryGetSocketServer: jest.fn(() => null),
}))

describe('GameLifecycleService.maybeAutoStart', () => {
  const service = new GameLifecycleService()

  beforeEach(() => {
    jest.restoreAllMocks()
    mockAcquireLock.mockClear()
    mockReleaseLock.mockClear()
    mockDbQuery.mockClear()
    mockAcquireLock.mockResolvedValue('lock-token')
    mockReleaseLock.mockResolvedValue()
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    mockClientQuery.mockReset()
    mockClientRelease.mockReset()
    mockGetClient.mockClear()
    mockGetClient.mockResolvedValue(mockClient)
  })

  const createSnapshot = (): LifecycleSnapshot => ({
    room: {
      id: 'room-123',
      status: 'initializing',
      lifecyclePhase: 'initializing',
      turnNumber: 0,
      currentTurnUserId: null,
      turnExpiresAt: null,
      readyCheckStartedAt: null,
      timeBankSecondsRemaining: null,
      graceActorUserId: null,
      graceExpiresAt: null,
      replacementPendingUserId: null,
      players: [],
    },
    readyStates: [],
    triggeredStart: false,
  })

  it('auto-starts the game when the lobby is full and broadcasts the update', async () => {
    const playerRows = [
      {
        id: 'slot-1',
        user_id: 'user-1',
        ai_player_id: null,
        is_ready: true,
        ready_at: new Date('2024-01-01T00:00:00Z'),
        joined_at: new Date('2024-01-01T00:00:00Z'),
        team_id: null,
        is_ai: false,
        ai_difficulty: null,
        ai_personality_seed: null,
        selected_color: '#DC2626',
      },
      {
        id: 'slot-2',
        user_id: 'user-2',
        ai_player_id: null,
        is_ready: true,
        ready_at: new Date('2024-01-01T00:01:00Z'),
        joined_at: new Date('2024-01-01T00:01:00Z'),
        team_id: null,
        is_ai: false,
        ai_difficulty: null,
        ai_personality_seed: null,
        selected_color: '#851D2D',
      },
      {
        id: 'slot-3',
        user_id: 'user-3',
        ai_player_id: null,
        is_ready: true,
        ready_at: new Date('2024-01-01T00:02:00Z'),
        joined_at: new Date('2024-01-01T00:02:00Z'),
        team_id: null,
        is_ai: false,
        ai_difficulty: null,
        ai_personality_seed: null,
        selected_color: '#EC4899',
      },
    ]

    mockClientQuery.mockImplementation(async (sql) => {
      if (typeof sql !== 'string') {
        return { rows: [], rowCount: 0 }
      }

      if (sql.startsWith('BEGIN')) {
        return { rows: [], rowCount: 0 }
      }

      if (sql.includes('SELECT status')) {
        return {
          rows: [
            {
              status: 'lobby',
              turn_timer: 45,
              max_players: 3,
            },
          ],
          rowCount: 1,
        }
      }

      if (sql.includes('FROM room_players')) {
        return { rows: playerRows, rowCount: playerRows.length }
      }

      if (sql.includes('UPDATE game_rooms')) {
        return { rows: [], rowCount: 1 }
      }

      if (sql.startsWith('COMMIT')) {
        return { rows: [], rowCount: 0 }
      }

      return { rows: [], rowCount: 0 }
    })

    const snapshot = createSnapshot()

    const startGameSpy = jest
      .spyOn(
        service as unknown as {
          startGame: (roomId: string, players: unknown[], turnTimer: number) => Promise<void>
        },
        'startGame',
      )
      .mockResolvedValue()
    const snapshotSpy = jest
      .spyOn(
        service as unknown as {
          getLifecycleSnapshot: (roomId: string) => Promise<LifecycleSnapshot>
        },
        'getLifecycleSnapshot',
      )
      .mockResolvedValue(snapshot)
    const broadcastSpy = jest
      .spyOn(
        service as unknown as { broadcastLifecycle: (payload: LifecycleSnapshot) => Promise<void> },
        'broadcastLifecycle',
      )
      .mockResolvedValue()

    const result = await service.maybeAutoStart('room-123')

    expect(result).toBe(true)
    expect(mockAcquireLock).toHaveBeenCalledWith('lock:game:ready:room-123', 5000)
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN')
    expect(startGameSpy).toHaveBeenCalledWith('room-123', playerRows, 45)
    expect(snapshotSpy).toHaveBeenCalledWith('room-123')
    expect(snapshot.triggeredStart).toBe(true)
    expect(broadcastSpy).toHaveBeenCalledWith(snapshot)
    expect(mockReleaseLock).toHaveBeenCalledWith('lock:game:ready:room-123', 'lock-token')
    expect(mockClientRelease).toHaveBeenCalled()
  })

  it('does not start the game when the lobby is not yet full', async () => {
    const playerRows = [
      {
        id: 'slot-1',
        user_id: 'user-1',
        ai_player_id: null,
        is_ready: true,
        ready_at: new Date('2024-01-01T00:00:00Z'),
        joined_at: new Date('2024-01-01T00:00:00Z'),
        team_id: null,
        is_ai: false,
        ai_difficulty: null,
        ai_personality_seed: null,
        selected_color: '#DC2626',
      },
      {
        id: 'slot-2',
        user_id: 'user-2',
        ai_player_id: null,
        is_ready: true,
        ready_at: new Date('2024-01-01T00:01:00Z'),
        joined_at: new Date('2024-01-01T00:01:00Z'),
        team_id: null,
        is_ai: false,
        ai_difficulty: null,
        ai_personality_seed: null,
        selected_color: '#851D2D',
      },
    ]

    mockClientQuery.mockImplementation(async (sql) => {
      if (typeof sql !== 'string') {
        return { rows: [], rowCount: 0 }
      }

      if (sql.startsWith('BEGIN')) {
        return { rows: [], rowCount: 0 }
      }

      if (sql.includes('SELECT status')) {
        return {
          rows: [
            {
              status: 'lobby',
              turn_timer: 60,
              max_players: 4,
            },
          ],
          rowCount: 1,
        }
      }

      if (sql.includes('FROM room_players')) {
        return { rows: playerRows, rowCount: playerRows.length }
      }

      if (sql.startsWith('COMMIT')) {
        return { rows: [], rowCount: 0 }
      }

      return { rows: [], rowCount: 0 }
    })

    const startGameSpy = jest
      .spyOn(
        service as unknown as {
          startGame: (roomId: string, players: unknown[], turnTimer: number) => Promise<void>
        },
        'startGame',
      )
      .mockResolvedValue()
    const broadcastSpy = jest
      .spyOn(
        service as unknown as { broadcastLifecycle: (payload: LifecycleSnapshot) => Promise<void> },
        'broadcastLifecycle',
      )
      .mockResolvedValue()

    const result = await service.maybeAutoStart('room-456')

    expect(result).toBe(false)
    expect(startGameSpy).not.toHaveBeenCalled()
    expect(broadcastSpy).not.toHaveBeenCalled()
    expect(mockReleaseLock).toHaveBeenCalledWith('lock:game:ready:room-456', 'lock-token')
  })
})
