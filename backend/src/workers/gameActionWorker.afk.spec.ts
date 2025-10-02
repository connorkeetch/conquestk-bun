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
const beginAfkGraceMock = jest.fn().mockResolvedValue(undefined)
const skipAfkTurnMock = jest.fn().mockResolvedValue(undefined)

jest.mock('../services/gameLifecycleService', () => {
  return {
    GameLifecycleService: class {
      beginAfkGrace = beginAfkGraceMock
      skipAfkTurn = skipAfkTurnMock
    },
  }
})

// Import after mocks
import { GameActionWorker } from './gameActionWorker'

describe('GameActionWorker AFK stages', () => {
  beforeEach(() => {
    beginAfkGraceMock.mockClear()
    skipAfkTurnMock.mockClear()
  })

  it('invokes beginAfkGrace on afk start', async () => {
    const worker = new GameActionWorker(ioMock)
    // biome-ignore lint/suspicious/noExplicitAny: accessing private for targeted unit test
    const result = await (worker as any).processGameAction({
      id: 'job1',
      data: {
        gameId: 'g1',
        playerId: 'p1',
        action: { type: 'end_turn', playerId: 'p1', roomId: 'g1' },
        afkStage: 'start',
      },
    })
    expect(beginAfkGraceMock).toHaveBeenCalledWith('g1')
    expect(result.processed).toBe(true)
  })

  it('invokes skipAfkTurn on afk skip', async () => {
    const worker = new GameActionWorker(ioMock)
    // biome-ignore lint/suspicious/noExplicitAny: accessing private for targeted unit test
    const result = await (worker as any).processGameAction({
      id: 'job2',
      data: {
        gameId: 'g2',
        playerId: 'p2',
        action: { type: 'end_turn', playerId: 'p2', roomId: 'g2' },
        afkStage: 'skip',
      },
    })
    expect(skipAfkTurnMock).toHaveBeenCalledWith('g2', 'p2', 'auto')
    expect(result.processed).toBe(true)
  })
})
