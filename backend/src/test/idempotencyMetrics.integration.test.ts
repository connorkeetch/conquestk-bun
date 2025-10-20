import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Job } from 'bullmq'
import type { Server } from 'socket.io'
import type { GameActionJob } from '../services/queueService.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'

const queryMock = jest.fn().mockResolvedValue({ rows: [{ id: 'move-1' }] })
const acquireLockMock = jest.fn().mockResolvedValue('lock-token')
const releaseLockMock = jest.fn().mockResolvedValue(true)
const getGameStateMock = jest.fn()
const processPlaceArmiesMock = jest.fn()
const gameActionQueueMock = {
  name: 'game-actions',
  process: jest.fn(),
  on: jest.fn(),
}

jest.mock('../config/database.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}))

jest.mock('../config/redis.js', () => ({
  getRedisClient: jest.fn(() => null),
  acquireLock: (...args: unknown[]) => acquireLockMock(...args),
  releaseLock: (...args: unknown[]) => releaseLockMock(...args),
}))

jest.mock('../services/gameService.js', () => ({
  GameService: jest.fn().mockImplementation(() => ({
    getGameState: (...args: unknown[]) => getGameStateMock(...args),
    processPlaceArmies: (...args: unknown[]) => processPlaceArmiesMock(...args),
  })),
}))

jest.mock('../services/queueService.js', () => ({
  queueService: {
    getGameActionQueue: () => gameActionQueueMock,
  },
}))

import { jobIdempotencyService } from '../services/jobIdempotencyService.js'
import { idempotencyMetrics } from '../services/metricsService.js'
import { GameActionWorker } from '../workers/gameActionWorker.js'

const buildGameState = () => ({
  roomId: 'room-1',
  currentPlayer: 'player-1',
  phase: 'reinforcement',
  turn: 1,
  players: [
    {
      id: 'player-1',
      username: 'Player One',
      color: '#ff0000',
      armies: 10,
      territories: ['terra'],
      cards: [],
      isEliminated: false,
    },
  ],
  board: [
    {
      id: 'terra',
      name: 'Terra',
      sector: 'earth',
      ownerId: 'player-1',
      armies: 5,
      adjacentTerritories: [],
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

const ioMock = {
  to: jest.fn(() => ({ emit: jest.fn() })),
} as unknown as Server<ClientToServerEvents, ServerToClientEvents>

describe('Idempotency instrumentation', () => {
  beforeEach(() => {
    idempotencyMetrics.reset()
    queryMock.mockClear()
    acquireLockMock.mockClear()
    releaseLockMock.mockClear()
    getGameStateMock.mockReset()
    processPlaceArmiesMock.mockReset()
  })

  it('tracks in-memory store and hit/miss counters', async () => {
    const queueName = 'game-actions'
    const key = `integration-${Date.now()}`

    await jobIdempotencyService.markProcessedJob(queueName, key, { ok: true })

    let snapshot = idempotencyMetrics.snapshot()
    expect(snapshot.stores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'idempotency_store_total',
          labels: expect.objectContaining({
            queue: queueName,
            source: 'memory',
            status: 'success',
          }),
          value: expect.any(Number),
        }),
      ]),
    )

    await jobIdempotencyService.getProcessedJob(queueName, key)
    snapshot = idempotencyMetrics.snapshot()
    expect(snapshot.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'idempotency_checks_total',
          labels: expect.objectContaining({
            queue: queueName,
            source: 'memory',
            outcome: 'hit',
          }),
          value: expect.any(Number),
        }),
      ]),
    )

    await jobIdempotencyService.getProcessedJob(queueName, `${key}-miss`)
    snapshot = idempotencyMetrics.snapshot()
    expect(snapshot.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'idempotency_checks_total',
          labels: expect.objectContaining({
            queue: queueName,
            source: 'memory',
            outcome: 'miss',
          }),
          value: expect.any(Number),
        }),
      ]),
    )

    await jobIdempotencyService.clearProcessedJob(queueName, key)
    await jobIdempotencyService.clearProcessedJob(queueName, `${key}-miss`)
  })

  it('records duplicate skips when worker short-circuits', async () => {
    const worker = new GameActionWorker(ioMock)
    const queueName = 'game-actions'
    const idempotencyKey = 'room-1:deploy:duplicate-check'

    getGameStateMock.mockResolvedValue(buildGameState())
    processPlaceArmiesMock.mockResolvedValue({ armies: 7 })

    const job = {
      id: 'job-duplicate',
      data: {
        gameId: 'room-1',
        playerId: 'player-1',
        action: {
          type: 'deploy',
          playerId: 'player-1',
          roomId: 'room-1',
          payload: { territoryId: 'terra', armies: 2 },
        },
        idempotencyKey,
      },
    } as unknown as Job<GameActionJob>

    const processMethod = worker as unknown as {
      processGameAction: (queued: Job<GameActionJob>) => Promise<unknown>
    }

    await processMethod.processGameAction(job)
    let snapshot = idempotencyMetrics.snapshot()
    expect(snapshot.stores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'idempotency_store_total',
          labels: expect.objectContaining({
            queue: queueName,
            source: 'memory',
            status: 'success',
          }),
        }),
      ]),
    )
    expect(snapshot.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'idempotency_checks_total',
          labels: expect.objectContaining({
            queue: queueName,
            source: 'memory',
            outcome: 'miss',
          }),
        }),
      ]),
    )

    const duplicateResult = await processMethod.processGameAction(job)
    expect(duplicateResult).toEqual(expect.objectContaining({ success: true, processed: false }))

    snapshot = idempotencyMetrics.snapshot()
    expect(snapshot.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'idempotency_checks_total',
          labels: expect.objectContaining({
            queue: queueName,
            source: 'memory',
            outcome: 'hit',
          }),
        }),
      ]),
    )
    expect(snapshot.duplicates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'idempotency_duplicates_total',
          labels: expect.objectContaining({
            queue: queueName,
            action: 'deploy',
          }),
          value: 1,
        }),
      ]),
    )

    await jobIdempotencyService.clearProcessedJob(queueName, idempotencyKey)
  })
})
