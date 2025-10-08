import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Server } from 'socket.io'

// Minimal IO mock
const ioMock = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
} as unknown as Server

// Mock cache service snapshot emission path
jest.mock('../services/cacheService', () => ({
  gameStateCache: {
    getGameState: jest.fn().mockResolvedValue({ roomId: 'g1', currentPlayer: 'p2', turn: 2 }),
  },
}))

// Mock queue service for constructor
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

// Mock idempotency service
jest.mock('../services/jobIdempotencyService', () => ({
  jobIdempotencyService: {
    getProcessedJob: jest.fn().mockResolvedValue({ exists: false }),
    markProcessedJob: jest.fn().mockResolvedValue(undefined),
  },
}))

// Mock lifecycle scheduling after AI turn
const scheduleTurnTimeoutMock = jest.fn().mockResolvedValue(undefined)
const scheduleAiTurnMock = jest.fn().mockResolvedValue(undefined)
jest.mock('../services/gameLifecycleService', () => ({
  GameLifecycleService: class {
    scheduleTurnTimeout = scheduleTurnTimeoutMock
    scheduleAiTurn = scheduleAiTurnMock
  },
}))

// Mock AI decision to a simple single-step plan to exercise streaming
jest.mock('../services/aiDecisionService', () => ({
  aiDecisionService: {
    chooseAction: jest.fn().mockResolvedValue({
      actions: [{ type: 'end_turn', roomId: 'g1', playerId: 'p1' }],
      usedFallback: false,
      diagnostics: {
        generatedAt: new Date().toISOString(),
        durationMs: 5,
        requestedDifficulty: 'recruit',
        plannedActionCount: 1,
        budget: { maxThinkTimeMs: 1000 },
      },
    }),
    buildFallbackPlan: jest.fn().mockReturnValue([{ type: 'end_turn', roomId: 'g1', playerId: 'p1' }]),
  },
}))

// Mock GameService
const executeAiTurnMock = jest.fn().mockResolvedValue({ gameState: { roomId: 'g1' } })
const processGameActionMock = jest.fn().mockResolvedValue({ roomId: 'g1' })
const getGameStateMock = jest.fn().mockResolvedValue({
  roomId: 'g1',
  players: [
    { id: 'p1', isAi: true, aiDifficulty: 'recruit' },
    { id: 'p2', isAi: false },
  ],
  currentPlayer: 'p1',
  phase: 'reinforcement',
  board: [],
  gameConfig: {},
  turn: 1,
})

jest.mock('../services/gameService', () => {
  return {
    GameService: class {
      executeAiTurn = executeAiTurnMock
      processGameAction = processGameActionMock
      getGameState = getGameStateMock
    },
  }
})

import { GameActionWorker } from './gameActionWorker'

describe('AI turn worker job', () => {
  beforeEach(() => {
    executeAiTurnMock.mockClear()
    getGameStateMock.mockClear()
    scheduleTurnTimeoutMock.mockClear()
    scheduleAiTurnMock.mockClear()
  })

  it('streams AI actions and schedules follow-ups', async () => {
    // Ensure streaming is enabled for the test
    process.env.AI_STREAM_ACTIONS = 'true'
    process.env.AI_READABLE_DELAY_MS = '1'
    const worker = new GameActionWorker(ioMock)
    // biome-ignore lint/suspicious/noExplicitAny: access private for unit test
    const result = await (worker as any).processAiTurn({
      id: 'job-ai-1',
      data: { gameId: 'g1', playerId: 'p1', turnNumber: 1 },
    })

    expect(getGameStateMock).toHaveBeenCalled()
    expect(scheduleTurnTimeoutMock).toHaveBeenCalledWith('g1')
    expect(scheduleAiTurnMock).toHaveBeenCalledWith('g1')
    expect(result.processed).toBe(true)
  })
})
