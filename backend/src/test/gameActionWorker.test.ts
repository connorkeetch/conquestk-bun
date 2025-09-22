import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type Bull from 'bull'
import type { Server } from 'socket.io'
import type { GameActionJob } from '../services/queueService'
import type { GameState } from '../types/game'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared'
import { GameActionWorker } from '../workers/gameActionWorker'

const mockGetProcessedJob = jest.fn()
const mockMarkProcessedJob = jest.fn()

jest.mock('../services/jobIdempotencyService', () => ({
  jobIdempotencyService: {
    getProcessedJob: (...args: unknown[]) => mockGetProcessedJob(...args),
    markProcessedJob: (...args: unknown[]) => mockMarkProcessedJob(...args),
  },
}))

const mockAddBattleSimulation = jest.fn()
const mockGetGameActionQueue = jest.fn()

jest.mock('../services/queueService', () => ({
  queueService: {
    getGameActionQueue: (...args: unknown[]) => mockGetGameActionQueue(...args),
    addBattleSimulation: (...args: unknown[]) => mockAddBattleSimulation(...args),
  },
}))

const mockGetGameState = jest.fn()
const mockProcessPlaceArmies = jest.fn()
const mockProcessFortify = jest.fn()
const mockProcessEndTurn = jest.fn()
const mockProcessPhaseChange = jest.fn()

jest.mock('../services/gameService', () => ({
  GameService: jest.fn(() => ({
    getGameState: (...args: unknown[]) => mockGetGameState(...args),
    processPlaceArmies: (...args: unknown[]) => mockProcessPlaceArmies(...args),
    processFortify: (...args: unknown[]) => mockProcessFortify(...args),
    processEndTurn: (...args: unknown[]) => mockProcessEndTurn(...args),
    processPhaseChange: (...args: unknown[]) => mockProcessPhaseChange(...args),
  })),
}))

type MockedQueue = {
  name: string
  process: jest.Mock
  on: jest.Mock
}

describe('GameActionWorker', () => {
  let worker: GameActionWorker
  let queue: MockedQueue
  let io: Server<ClientToServerEvents, ServerToClientEvents>
  let roomEmit: jest.Mock

  const buildGameState = (overrides: Partial<GameState> = {}): GameState => ({
    roomId: 'game-1',
    currentPlayer: 'player-1',
    phase: 'reinforcement',
    turn: 1,
    players: [
      {
        id: 'player-1',
        username: 'Player One',
        color: '#ff0000',
        armies: 10,
        territories: ['north'],
        cards: [],
        isEliminated: false,
      },
      {
        id: 'player-2',
        username: 'Player Two',
        color: '#00ff00',
        armies: 8,
        territories: ['south'],
        cards: [],
        isEliminated: false,
      },
    ],
    board: [
      {
        id: 'north',
        name: 'North',
        continent: 'earth',
        ownerId: 'player-1',
        armies: 5,
        adjacentTerritories: ['south'],
      },
      {
        id: 'south',
        name: 'South',
        continent: 'earth',
        ownerId: 'player-2',
        armies: 3,
        adjacentTerritories: ['north'],
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
    ...overrides,
  })

  const invokeProcess = async (job: Bull.Job<GameActionJob>) => {
    const method = worker as unknown as {
      processGameAction: (queued: Bull.Job<GameActionJob>) => Promise<unknown>
    }
    return method.processGameAction(job)
  }

  beforeEach(() => {
    jest.clearAllMocks()

    roomEmit = jest.fn()
    io = {
      to: jest.fn(() => ({ emit: roomEmit })),
    } as unknown as Server<ClientToServerEvents, ServerToClientEvents>

    queue = {
      name: 'game-actions',
      process: jest.fn(),
      on: jest.fn(),
    }

    mockGetGameActionQueue.mockReturnValue(queue)
    mockGetProcessedJob.mockResolvedValue({ exists: false })

    worker = new GameActionWorker(io)
  })

  it('processes deploy actions and broadcasts territory delta', async () => {
    mockGetGameState.mockResolvedValue(buildGameState())
    mockProcessPlaceArmies.mockResolvedValue(7)

    const job = {
      id: 'job-123',
      data: {
        gameId: 'game-1',
        playerId: 'player-1',
        action: {
          type: 'deploy',
          roomId: 'game-1',
          playerId: 'player-1',
          payload: { territoryId: 'north', armies: 2 },
        },
      },
    } as unknown as Bull.Job<GameActionJob>

    const result = await invokeProcess(job)

    expect(mockGetGameState).toHaveBeenCalledWith('game-1')
    expect(mockProcessPlaceArmies).toHaveBeenCalledWith('game-1', {
      territoryId: 'north',
      armies: 2,
      playerId: 'player-1',
    })
    expect(io.to).toHaveBeenCalledWith('game:game-1')
    expect(roomEmit).toHaveBeenCalledWith(
      'game-delta',
      expect.objectContaining({
        type: 'TERRITORY_UPDATE',
        roomId: 'game-1',
      }),
    )
    expect(mockMarkProcessedJob).toHaveBeenCalledWith(
      'game-actions',
      'job-123',
      expect.objectContaining({ success: true, processed: true }),
      60 * 60,
    )
    expect(result).toEqual(
      expect.objectContaining({ success: true, processed: true, delta: expect.any(Object) }),
    )
  })

  it('queues battle simulations for attack actions without broadcasting immediately', async () => {
    mockGetGameState.mockResolvedValue(buildGameState())

    const job = {
      id: 'job-attack',
      data: {
        gameId: 'game-1',
        playerId: 'player-1',
        action: {
          type: 'attack',
          roomId: 'game-1',
          playerId: 'player-1',
          payload: { fromTerritoryId: 'north', toTerritoryId: 'south', armies: 3 },
        },
        socketId: 'socket-1',
      },
    } as unknown as Bull.Job<GameActionJob>

    const result = await invokeProcess(job)

    expect(mockGetGameState).toHaveBeenCalledWith('game-1')
    expect(mockAddBattleSimulation).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game-1',
        attackingTerritory: 'north',
        defendingTerritory: 'south',
        attackingArmies: 3,
        defendingArmies: 3,
        playerId: 'player-1',
      }),
    )
    expect(io.to).not.toHaveBeenCalledWith('game:game-1')
    expect(roomEmit).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, delta: null, processed: true })
    expect(mockMarkProcessedJob).toHaveBeenCalledWith(
      'game-actions',
      'job-attack',
      expect.objectContaining({ success: true, processed: true }),
      60 * 60,
    )
  })
})
