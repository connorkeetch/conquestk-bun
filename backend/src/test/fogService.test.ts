import { describe, expect, it, jest } from '@jest/globals'
import type { Server } from 'socket.io'
import type { GameDelta } from '@risk-game/shared/types'
import { emitFogFilteredDelta } from '../services/fogService'
import type { GameState } from '../types/game'

describe('emitFogFilteredDelta', () => {
  const baseState: GameState = {
    roomId: 'room-1',
    players: [
      {
        id: 'player-1',
        username: 'Player One',
        color: '#ff0000',
        armies: 5,
        territories: ['territory-1'],
        cards: [],
        isEliminated: false,
      },
      {
        id: 'player-2',
        username: 'Player Two',
        color: '#0000ff',
        armies: 5,
        territories: ['territory-2'],
        cards: [],
        isEliminated: false,
      },
    ],
    currentPlayer: 'player-1',
    phase: 'reinforcement',
    turn: 1,
    board: [
      {
        id: 'territory-1',
        name: 'Alpha',
        sector: 'north',
        ownerId: 'player-1',
        armies: 3,
        adjacentTerritories: ['territory-2'],
      },
      {
        id: 'territory-2',
        name: 'Beta',
        sector: 'north',
        ownerId: 'player-2',
        armies: 2,
        adjacentTerritories: ['territory-1'],
      },
    ],
    cards: [],
    gameConfig: {
      movementType: 'classic_adjacent',
      maxPlayers: 6,
      fogOfWar: 'off',
    },
  }

  it('broadcasts unfiltered delta when fog of war is disabled', async () => {
    const emitMock = jest.fn()
    const fetchSockets = jest.fn().mockResolvedValue([
      { id: 'socket-1', data: { userId: 'player-1' } },
      { id: 'socket-2', data: { userId: 'player-2' } },
    ])

    const io = {
      to: jest.fn(() => ({ emit: emitMock })),
      in: jest.fn(() => ({ fetchSockets })),
    } as unknown as Server

    const delta: GameDelta = {
      type: 'TERRITORY_UPDATE',
      roomId: 'room-1',
      timestamp: Date.now(),
      territoryId: 'territory-1',
      changes: { armies: 4 },
    }

    await emitFogFilteredDelta(io, 'room-1', delta, baseState)

    expect(io.to).toHaveBeenCalledWith('game:room-1')
    expect(emitMock).toHaveBeenCalledWith('game-delta', delta)
    // When fog is disabled we should not emit per-socket filtered events
    expect(fetchSockets).toHaveBeenCalled()
  })
})
