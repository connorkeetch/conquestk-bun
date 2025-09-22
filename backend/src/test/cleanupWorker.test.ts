import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type Bull from 'bull'
import type { CacheService } from '../services/cacheService'
import type { GameService } from '../services/gameService'
import type { JobIdempotencyService } from '../services/jobIdempotencyService'
import type { GameCleanupJob } from '../services/queueService'
import type { GameState } from '../types/game'
import { CleanupWorker } from '../workers/cleanupWorker'

jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getPool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  })),
  getClient: jest.fn(async () => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  })),
}))

const mockCleanupFinishedGameModifiers = jest.fn()

jest.mock('../services/territoryModifierService', () => ({
  __esModule: true,
  default: {
    cleanupFinishedGameModifiers: (...args: unknown[]) =>
      mockCleanupFinishedGameModifiers(...args),
  },
}))

type MockedGameService = {
  getGameState: jest.Mock
  archiveGameResults: jest.Mock
  updateEloRatings: jest.Mock
  recordGameHistory: jest.Mock
  removeFromActiveGames: jest.Mock
}

type MockedCacheService = {
  deleteGameState: jest.Mock
}

type MockedIdempotencyService = {
  getProcessedJob: jest.Mock
  markProcessedJob: jest.Mock
  clearProcessedJob: jest.Mock
}

const createGameState = (): GameState => ({
  roomId: 'room-1',
  currentPlayer: 'player1',
  phase: 'finished',
  turn: 10,
  board: [
    {
      id: 'territory-1',
      name: 'Territory 1',
      continent: 'test-continent',
      ownerId: 'player1',
      armies: 5,
      adjacentTerritories: [],
    },
    {
      id: 'territory-2',
      name: 'Territory 2',
      continent: 'test-continent',
      ownerId: 'player1',
      armies: 3,
      adjacentTerritories: [],
    },
  ],
  players: [
    {
      id: 'player1',
      username: 'Player 1',
      color: '#ff0000',
      armies: 8,
      territories: ['territory-1', 'territory-2'],
      cards: [],
      isEliminated: false,
      teamId: null,
    },
    {
      id: 'player2',
      username: 'Player 2',
      color: '#00ff00',
      armies: 0,
      territories: [],
      cards: [],
      isEliminated: true,
      teamId: null,
    },
  ],
  cards: [],
  gameConfig: {
    movementType: 'classic_adjacent',
    allowTeamPlay: false,
    teamMode: 'none',
    numberOfTeams: null,
    maxPlayers: 2,
    mapId: 'classic',
    gameMode: 'standard',
  },
})

describe('CleanupWorker', () => {
  let mockGameService: MockedGameService
  let mockCacheService: MockedCacheService
  let mockIdempotencyService: MockedIdempotencyService
  let worker: CleanupWorker
  let job: Bull.Job<GameCleanupJob>

  const queue = { name: 'game-cleanup' } as unknown as Bull.Queue<GameCleanupJob>

  const invokeCleanup = (instance: CleanupWorker, cleanupJob: Bull.Job<GameCleanupJob>) =>
    (instance as unknown as {
      cleanupGame: (queuedJob: Bull.Job<GameCleanupJob>) => Promise<unknown>
    }).cleanupGame(cleanupJob)

  beforeEach(() => {
    mockCleanupFinishedGameModifiers.mockReset()

    mockGameService = {
      getGameState: jest.fn(),
      archiveGameResults: jest.fn().mockResolvedValue(undefined),
      updateEloRatings: jest.fn().mockResolvedValue(undefined),
      recordGameHistory: jest.fn().mockResolvedValue(undefined),
      removeFromActiveGames: jest.fn().mockResolvedValue(undefined),
    }

    mockCacheService = {
      deleteGameState: jest.fn().mockResolvedValue(undefined),
    }

    mockIdempotencyService = {
      getProcessedJob: jest.fn(),
      markProcessedJob: jest.fn().mockResolvedValue(undefined),
      clearProcessedJob: jest.fn().mockResolvedValue(undefined),
    }

    worker = new CleanupWorker({
      gameService: mockGameService as unknown as GameService,
      cacheService: mockCacheService as unknown as CacheService,
      queue,
      idempotencyService: mockIdempotencyService as unknown as JobIdempotencyService,
    })

    job = {
      id: 'job-1',
      data: {
        gameId: 'game-1',
        reason: 'finished',
        idempotencyKey: 'cleanup-job-1',
      },
    } as unknown as Bull.Job<GameCleanupJob>
  })

  it('cleans up finished games and removes territory modifiers', async () => {
    const gameState = {
      ...createGameState(),
      isRanked: true,
      winner: 'player1',
      startTime: Date.now() - 1_000,
    } as unknown as GameState

    mockIdempotencyService.getProcessedJob.mockResolvedValueOnce({ exists: false })
    mockGameService.getGameState.mockResolvedValueOnce(gameState)
    mockCleanupFinishedGameModifiers.mockResolvedValueOnce(undefined)

    const result = await invokeCleanup(worker, job)

    expect(result).toMatchObject({ success: true, reason: 'finished' })
    expect(mockGameService.archiveGameResults).toHaveBeenCalledWith(
      'game-1',
      expect.objectContaining({ endReason: 'finished', winner: 'player1' }),
    )
    expect(mockGameService.updateEloRatings).toHaveBeenCalledWith('game-1', expect.objectContaining({}))
    expect(mockGameService.recordGameHistory).toHaveBeenCalledWith('game-1', expect.objectContaining({}))
    expect(mockCacheService.deleteGameState).toHaveBeenCalledWith('game-1')
    expect(mockGameService.removeFromActiveGames).toHaveBeenCalledWith('game-1')
    expect(mockCleanupFinishedGameModifiers).toHaveBeenCalledWith(['game-1'])
    expect(mockIdempotencyService.markProcessedJob).toHaveBeenCalledWith(
      'game-cleanup',
      'cleanup-job-1',
      expect.objectContaining({ success: true, reason: 'finished' }),
      24 * 60 * 60,
    )
  })

  it('skips work for jobs that already completed successfully', async () => {
    const cachedResult = { success: true, reason: 'finished', cleanedAt: new Date().toISOString() }
    mockIdempotencyService.getProcessedJob.mockResolvedValueOnce({ exists: true, value: cachedResult })

    const result = await invokeCleanup(worker, job)

    expect(result).toBe(cachedResult)
    expect(mockGameService.getGameState).not.toHaveBeenCalled()
    expect(mockGameService.archiveGameResults).not.toHaveBeenCalled()
    expect(mockCleanupFinishedGameModifiers).not.toHaveBeenCalled()
    expect(mockIdempotencyService.markProcessedJob).not.toHaveBeenCalled()
  })
})
