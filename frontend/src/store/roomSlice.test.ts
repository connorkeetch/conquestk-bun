import { describe, expect, it } from 'vitest'
import type { GameRoom } from '../types/gameRoom'
import roomReducer, { addPlayerToRoom, removePlayerFromRoom } from './roomSlice'

describe('roomSlice reducers', () => {
  const emptyRoom: GameRoom = {
    id: 'room-1',
    name: 'Test Room',
    hostId: 'host-1',
    maxPlayers: 4,
    isPrivate: false,
    status: 'lobby',
    createdAt: '2024-01-01T00:00:00.000Z',
    players: [],
  }

  const baseState = {
    rooms: [],
    currentRoom: emptyRoom,
    isLoading: false,
    error: null as string | null,
  }

  it('stores AI player metadata when a player joins', () => {
    const nextState = roomReducer(
      baseState,
      addPlayerToRoom({
        roomId: 'room-1',
        player: {
          id: 'slot-ai',
          username: 'AI Commander',
          joinedAt: '2024-01-02T00:00:00.000Z',
          isReady: true,
          readyAt: '2024-01-02T00:00:00.000Z',
          isAi: true,
          aiDifficulty: 'commander',
          aiPlayerId: 'ai-777',
        },
      }),
    )

    expect(nextState.currentRoom?.players).toHaveLength(1)
    expect(nextState.currentRoom?.players?.[0]).toMatchObject({
      id: 'slot-ai',
      isAi: true,
      aiDifficulty: 'commander',
      aiPlayerId: 'ai-777',
    })
  })

  it('removes players by slot and AI identifiers', () => {
    const populatedState = {
      ...baseState,
      currentRoom: {
        ...emptyRoom,
        players: [
          {
            id: 'slot-ai',
            username: 'AI Commander',
            joinedAt: '2024-01-02T00:00:00.000Z',
            isReady: true,
            readyAt: '2024-01-02T00:00:00.000Z',
            isAi: true,
            aiDifficulty: 'commander' as const,
            aiPlayerId: 'ai-777',
          },
          {
            id: 'slot-human',
            userId: 'user-2',
            username: 'Human Ally',
            joinedAt: '2024-01-02T00:05:00.000Z',
            isReady: false,
            readyAt: null,
            isAi: false,
          },
        ] as unknown as GameRoom['players'],
      },
    }

    const afterRemoval = roomReducer(
      populatedState,
      removePlayerFromRoom({
        roomId: 'room-1',
        playerSlotId: 'slot-ai',
        aiPlayerId: 'ai-777',
      }),
    )

    expect(afterRemoval.currentRoom?.players).toHaveLength(1)
    expect(afterRemoval.currentRoom?.players?.[0]?.id).toBe('slot-human')
  })
})
