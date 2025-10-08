import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Server } from 'socket.io'

// Minimal IO mock
const ioMock = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
} as unknown as Server

// Mock queue service to satisfy constructor requirements
jest.mock('../services/queueService', () => {
  const fakeQueue = {
    name: 'game-actions',
    process: jest.fn(),
    on: jest.fn(),
  }
  return {
    queueService: {
      getGameActionQueue: () => fakeQueue,
    },
  }
})

// Mock job idempotency service
jest.mock('../services/jobIdempotencyService', () => ({
  jobIdempotencyService: {
    getProcessedJob: jest.fn().mockResolvedValue({ exists: false }),
    markProcessedJob: jest.fn().mockResolvedValue(undefined),
  },
}))

// Mock GameService.getGameState to a minimal valid state
jest.mock('../services/gameService', () => {
  class GameService {
    async getGameState(roomId: string) {
      return {
        roomId,
        players: [
          { id: 'p1', isEliminated: false },
          { id: 'p2', isEliminated: false },
        ],
        currentPlayer: 'p1',
        phase: 'reinforcement',
        board: [],
        gameConfig: {},
        turn: 1,
      }
    }
    async processEndTurn() {
      return {
        id: 'p2',
      }
    }
  }
  return { GameService }
})

// Spy on lifecycle calls
const handleTurnTimeoutMock = jest.fn().mockResolvedValue(undefined)

jest.mock('../services/gameLifecycleService', () => {
  return {
    GameLifecycleService: class {
      handleTurnTimeout = handleTurnTimeoutMock
    },
  }
})

// Import after mocks
import { GameActionWorker } from './gameActionWorker'

describe('GameActionWorker turn timeout stage', () => {
  beforeEach(() => {
    handleTurnTimeoutMock.mockClear()
  })

  it('invokes handleTurnTimeout on timeout job', async () => {
    const worker = new GameActionWorker(ioMock)
    // biome-ignore lint/suspicious/noExplicitAny: accessing private for targeted unit test
    const result = await (worker as any).processGameAction({
      id: 'job1',
      data: {
        gameId: 'g1',
        playerId: 'p1',
        action: { type: 'end_turn', playerId: 'p1', roomId: 'g1' },
        turnTimeoutStage: 'expire',
      },
    })
    expect(handleTurnTimeoutMock).toHaveBeenCalledWith('g1')
    expect(result.processed).toBe(true)
  })
})
