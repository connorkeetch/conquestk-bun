import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Server } from 'socket.io'

const queryMock = jest.fn().mockResolvedValue({ rows: [{ id: 'move-1' }] })
const acquireLockMock = jest.fn().mockResolvedValue('lock-token')
const releaseLockMock = jest.fn().mockResolvedValue(true)
const ioMock = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
} as unknown as Server

jest.mock('../config/database.js', () => ({
  query: queryMock,
}))

jest.mock('../config/redis.js', () => ({
  acquireLock: acquireLockMock,
  getRedisClient: jest.fn().mockReturnValue(null),
  releaseLock: releaseLockMock,
}))

jest.mock('../services/queueService.js', () => {
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

jest.mock('../services/jobIdempotencyService.js', () => ({
  jobIdempotencyService: {
    getProcessedJob: jest.fn(),
    markProcessedJob: jest.fn(),
  },
}))

jest.mock('../services/gameService.js', () => ({
  GameService: jest.fn().mockImplementation(() => ({
    getGameState: jest.fn(),
    processGameAction: jest.fn(),
    processPlaceArmies: jest.fn(),
    processFortify: jest.fn(),
    endTurn: jest.fn(),
    appendLog: jest.fn(),
    processGoBackToReinforcement: jest.fn(),
  })),
}))

import { GameService } from '../services/gameService.js'
import { jobIdempotencyService } from '../services/jobIdempotencyService.js'
import { GameActionWorker } from './gameActionWorker.js'

const jobIdempotencyServiceMock = jest.mocked(jobIdempotencyService)
const GameServiceMock = jest.mocked(GameService)

describe('GameActionWorker idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jobIdempotencyServiceMock.getProcessedJob.mockResolvedValue({ exists: false })
    jobIdempotencyServiceMock.markProcessedJob.mockResolvedValue(undefined)
    queryMock.mockResolvedValue({ rows: [{ id: 'move-1' }] })
    acquireLockMock.mockResolvedValue('lock-token')
    releaseLockMock.mockResolvedValue(true)
  })

  it('returns cached result when duplicate idempotency key is encountered', async () => {
    jobIdempotencyServiceMock.getProcessedJob.mockResolvedValueOnce({
      exists: true,
      value: { success: true, delta: null, processed: true },
    })

    const worker = new GameActionWorker(ioMock)
    const result = await (worker as any).processGameAction({
      id: 'job-duplicate',
      data: {
        gameId: 'room-1',
        playerId: 'player-1',
        action: {
          type: 'deploy',
          playerId: 'player-1',
          roomId: 'room-1',
          payload: { territoryId: 't1', armies: 3 },
        },
        idempotencyKey: 'room-1:deploy:test-key',
      },
    })

    expect(result).toEqual({ success: true, delta: null, processed: false })
    expect(jobIdempotencyServiceMock.getProcessedJob).toHaveBeenCalledWith(
      expect.any(String),
      'room-1:deploy:test-key',
    )
    expect(jobIdempotencyServiceMock.markProcessedJob).not.toHaveBeenCalled()

    const gameServiceInstance = GameServiceMock.mock.results[0]?.value as {
      getGameState: jest.Mock
    }
    expect(gameServiceInstance?.getGameState).not.toHaveBeenCalled()
  })

  it('stores processed result when handling a fresh job', async () => {
    const worker = new GameActionWorker(ioMock)
    const gameServiceInstance = GameServiceMock.mock.results.at(-1)?.value as {
      getGameState: jest.Mock
      processPlaceArmies: jest.Mock
    }

    gameServiceInstance.getGameState.mockResolvedValue({
      players: [{ id: 'player-1', isEliminated: false }],
      currentPlayer: 'player-1',
      phase: 'reinforcement',
      board: [],
      gameConfig: {},
      turn: 3,
    })
    gameServiceInstance.processPlaceArmies.mockResolvedValue({ armies: 7 })

    const result = await (worker as any).processGameAction({
      id: 'job-fresh',
      data: {
        gameId: 'room-1',
        playerId: 'player-1',
        action: {
          type: 'deploy',
          playerId: 'player-1',
          roomId: 'room-1',
          payload: { territoryId: 'tex', armies: 7 },
        },
        idempotencyKey: 'room-1:deploy:fresh',
      },
    })

    expect(result).toMatchObject({
      success: true,
      processed: true,
      delta: null,
    })

    expect(jobIdempotencyServiceMock.markProcessedJob).toHaveBeenCalledTimes(1)
    const [queueName, key, storedResult, ttl] =
      jobIdempotencyServiceMock.markProcessedJob.mock.calls[0]
    expect(queueName).toBe('game-actions')
    expect(key).toBe('room-1:deploy:fresh')
    expect(storedResult).toEqual(result)
    expect(ttl).toBe(60 * 60)
  })
})
