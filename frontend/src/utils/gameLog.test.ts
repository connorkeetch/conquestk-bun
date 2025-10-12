import { describe, expect, it } from 'vitest'
import { deriveRoundMarkers, isParticipantInRoom } from './gameLog'

describe('deriveRoundMarkers', () => {
  it('computes rounds from turn stats with constant active players', () => {
    const stats = [
      { turn: 1, timestamp: '2025-01-01T00:00:00Z', players: [{}, {}, {}] },
      { turn: 2, timestamp: '2025-01-01T00:01:00Z', players: [{}, {}, {}] },
      { turn: 3, timestamp: '2025-01-01T00:02:00Z', players: [{}, {}, {}] },
      { turn: 4, timestamp: '2025-01-01T00:03:00Z', players: [{}, {}, {}] },
    ]
    const markers = deriveRoundMarkers(stats)
    expect(markers.map((m) => m.round)).toEqual([1, 2])
    expect(markers[0].timestamp).toBe('2025-01-01T00:00:00Z')
    expect(markers[1].timestamp).toBe('2025-01-01T00:03:00Z')
  })

  it('handles eliminations reducing active players mid-game', () => {
    const stats = [
      { turn: 1, timestamp: '2025-01-01T00:00:00Z', players: [{}, {}, {}] },
      { turn: 2, timestamp: '2025-01-01T00:01:00Z', players: [{}, {}, {}] },
      // One player eliminated before turn 3
      { turn: 3, timestamp: '2025-01-01T00:02:00Z', players: [{}, {}, { eliminated: true }] },
      { turn: 4, timestamp: '2025-01-01T00:03:00Z', players: [{}, {}, { eliminated: true }] },
    ]
    const markers = deriveRoundMarkers(stats)
    // Round 1 starts at turn 1; with 3 active, round 2 would be at turn 4 normally.
    // But after elimination (active=2), round switches earlier: ceil(3/2)=2
    expect(markers.map((m) => [m.round, m.timestamp])).toEqual([
      [1, '2025-01-01T00:00:00Z'],
      [2, '2025-01-01T00:02:00Z'],
    ])
  })
})

describe('isParticipantInRoom', () => {
  const baseRoom = {
    id: 'r1',
    name: 'Test',
    hostId: 'host',
    maxPlayers: 3,
    isPrivate: false,
    status: 'active',
    createdAt: '2025-01-01T00:00:00Z',
    players: [
      { id: 'p1', userId: 'u1', username: 'U1', joinedAt: 't', isAi: false },
      { id: 'p2', userId: 'u2', username: 'U2', joinedAt: 't', isAi: false },
    ],
  } as unknown as import('@/types/gameRoom').GameRoom
  const baseGame = {
    roomId: 'r1',
    players: [
      {
        id: 'u1',
        username: 'U1',
        color: '#f00',
        armies: 0,
        territories: [],
        cards: [],
        isEliminated: false,
      },
    ],
    currentPlayer: 'u1',
    phase: 'reinforcement',
    turn: 1,
    board: [],
    cards: [],
    gameConfig: { movementType: 'classic_adjacent' },
  } as unknown as import('@/types/game').GameState

  it('detects host as participant', () => {
    expect(isParticipantInRoom(baseRoom, baseGame, 'host')).toBe(true)
  })

  it('detects room player as participant', () => {
    expect(isParticipantInRoom(baseRoom, baseGame, 'u2')).toBe(true)
  })

  it('detects game player as participant', () => {
    expect(isParticipantInRoom({ ...baseRoom, players: [] }, baseGame, 'u1')).toBe(true)
  })

  it('non-listed user is not a participant', () => {
    expect(isParticipantInRoom(baseRoom, baseGame, 'u9')).toBe(false)
  })
})
