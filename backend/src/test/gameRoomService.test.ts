import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { GameRoomService } from '../services/gameRoomService.js'

const mockQuery = jest.fn()

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: jest.fn(async (fn: (client: { query: typeof mockQuery }) => unknown) => {
    return fn({ query: mockQuery })
  }),
  getClient: jest.fn(),
}))

describe('GameRoomService', () => {
  let gameRoomService: GameRoomService

  beforeEach(() => {
    gameRoomService = new GameRoomService()
    mockQuery.mockReset()
  })

  describe('createRoom', () => {
    it('should throw an error for invalid team configuration with no valid options', async () => {
      const roomData = {
        name: 'Test Room',
        hostId: 'host-1',
        maxPlayers: 5,
        isPrivate: false,
        mapId: 'map-1',
        teamMode: 'teams' as const,
        numberOfTeams: 3,
      }

      mockQuery.mockResolvedValue({
        rows: [{ is_vip: false, premium_tier: 'free' }],
        rowCount: 1,
      })

      await expect(gameRoomService.createRoom(roomData)).rejects.toThrow(
        '3 teams is not valid for 5 players. Valid options: Free for All.',
      )
    })

    it('should throw an error for invalid team configuration with valid options', async () => {
      const roomData = {
        name: 'Test Room',
        hostId: 'host-1',
        maxPlayers: 6,
        isPrivate: false,
        mapId: 'map-1',
        teamMode: 'teams' as const,
        numberOfTeams: 4,
      }

      mockQuery.mockResolvedValue({
        rows: [{ is_vip: false, premium_tier: 'free' }],
        rowCount: 1,
      })

      await expect(gameRoomService.createRoom(roomData)).rejects.toThrow(
        '4 teams is not valid for 6 players. Valid options: 2, 3 teams or Free for All.',
      )
    })
  })
})
