import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { GameRoomService } from '../services/gameRoomService.js'

const mockQuery = jest.fn()
const mockClientQuery = jest.fn()
const mockClientRelease = jest.fn()
const mockGetClient = jest.fn()

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: () => mockGetClient(),
}))

describe('GameRoomService.updateAiOpponents', () => {
  const service = new GameRoomService()

  beforeEach(() => {
    mockQuery.mockReset()
    mockClientQuery.mockReset()
    mockClientRelease.mockReset()
    mockGetClient.mockReset()
    mockGetClient.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    })
  })

  it('adds AI opponents when capacity permits', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const playersSelectRows = [
      {
        id: 'slot-host',
        user_id: 'host-1',
        ai_player_id: null,
        is_ai: false,
        ai_difficulty: null,
        ai_personality_seed: null,
      },
    ]

    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            host_id: 'host-1',
            status: 'lobby',
            max_players: 4,
            is_ranked: false,
          },
        ],
        rowCount: 1,
      }) // room select
      .mockResolvedValueOnce({ rows: playersSelectRows, rowCount: playersSelectRows.length }) // players select
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // first insert
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // second insert
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ensureAiReadyStates update (outer)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ensureAiReadyStates inside getRoomById
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'room-1',
            name: 'AI Test Lobby',
            host_id: 'host-1',
            max_players: 4,
            is_private: false,
            status: 'lobby',
            created_at: createdAt,
            updated_at: null,
            map_id: null,
            game_mode: 'classic',
            team_mode: false,
            number_of_teams: null,
            is_ranked: false,
            players: [
              {
                id: 'slot-host',
                userId: 'host-1',
                aiPlayerId: null,
                username: 'Host',
                skill_rating: null,
                current_tier: null,
                joinedAt: createdAt.toISOString(),
                isReady: true,
                readyAt: createdAt.toISOString(),
                teamId: null,
                isAi: false,
                aiDifficulty: null,
                aiPersonalitySeed: null,
              },
              {
                id: 'slot-ai-1',
                userId: null,
                aiPlayerId: 'ai-1',
                username: 'AI Recruit',
                skill_rating: null,
                current_tier: null,
                joinedAt: createdAt.toISOString(),
                isReady: true,
                readyAt: createdAt.toISOString(),
                teamId: null,
                isAi: true,
                aiDifficulty: 'recruit',
                aiPersonalitySeed: 123,
              },
              {
                id: 'slot-ai-2',
                userId: null,
                aiPlayerId: 'ai-2',
                username: 'AI Commander',
                skill_rating: null,
                current_tier: null,
                joinedAt: createdAt.toISOString(),
                isReady: true,
                readyAt: createdAt.toISOString(),
                teamId: null,
                isAi: true,
                aiDifficulty: 'commander',
                aiPersonalitySeed: 456,
              },
            ],
          },
        ],
        rowCount: 1,
      })

    const room = await service.updateAiOpponents('room-1', 'host-1', [
      { difficulty: 'recruit', personalitySeed: 123 },
      { difficulty: 'commander', personalitySeed: 456 },
    ])

    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN')
    const insertCalls = mockClientQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO room_players'),
    )
    expect(insertCalls).toHaveLength(2)
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT')
    expect(mockClientRelease).toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledTimes(3)
    expect(room.players?.filter((player) => player.isAi).length).toBe(2)
  })

  it('throws when requested AI seats exceed capacity', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            host_id: 'host-1',
            status: 'lobby',
            max_players: 2,
            is_ranked: false,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'slot-host',
            user_id: 'host-1',
            ai_player_id: null,
            is_ai: false,
            ai_difficulty: null,
            ai_personality_seed: null,
          },
          {
            id: 'slot-other',
            user_id: 'user-2',
            ai_player_id: null,
            is_ai: false,
            ai_difficulty: null,
            ai_personality_seed: null,
          },
        ],
        rowCount: 2,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ROLLBACK

    await expect(
      service.updateAiOpponents('room-2', 'host-1', [{ difficulty: 'recruit' }]),
    ).rejects.toThrow('Not enough open seats for the requested AI opponents')

    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mockClientRelease).toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
