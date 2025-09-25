import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { GameRoomService } from '../services/gameRoomService'

const mockQuery = jest.fn()

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: jest.fn(async (fn: (client: { query: typeof mockQuery }) => unknown) => {
    return fn({ query: mockQuery })
  }),
  getClient: jest.fn(),
}))

describe('GameRoomService.ensureAiReadyStates', () => {
  const service = new GameRoomService()

  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('updates AI slots to ready before hydrating room data', async () => {
    const createdAt = new Date('2024-01-04T00:00:00Z')
    const joinedAt = new Date('2024-01-04T00:10:00Z')

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'room-99',
          name: 'AI Lounge',
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
          lifecycle_phase: 'lobby',
          turn_number: 0,
          turn_expires_at: null,
          ready_check_started_at: null,
          current_turn_user_id: null,
          winner: null,
          playercount: 1,
          players: [
            {
              id: 'slot-ai',
              userId: null,
              aiPlayerId: 'ai-123',
              username: 'AI Recruit',
              skill_rating: null,
              current_tier: null,
              joinedAt,
              isReady: true,
              readyAt: joinedAt,
              teamId: null,
              isAi: true,
              aiDifficulty: 'recruit',
              aiPersonalitySeed: 771,
            },
          ],
        },
      ],
      rowCount: 1,
    })

    const room = await service.getRoomById('room-99')

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE room_players'),
      ['room-99'],
    )
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SELECT gr.*'),
      ['room-99'],
    )

    expect(room?.players?.[0]).toMatchObject({
      id: 'slot-ai',
      isAi: true,
      isReady: true,
      aiDifficulty: 'recruit',
    })
  })
})
