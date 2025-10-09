import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Job } from 'bullmq'
import type { Server } from 'socket.io'
import type { GameActionJob } from '../services/queueService.js'
import type { GameState } from '../types/game.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'
import { GameActionWorker } from '../workers/gameActionWorker.js'

const mockGetProcessedJob = jest.fn()
const mockMarkProcessedJob = jest.fn()
const mockEmitFogFilteredDelta = jest.fn()

jest.mock('../services/jobIdempotencyService', () => ({
  jobIdempotencyService: {
    getProcessedJob: (...args: unknown[]) => mockGetProcessedJob(...args),
    markProcessedJob: (...args: unknown[]) => mockMarkProcessedJob(...args),
  },
}))

jest.mock('../services/fogService', () => ({
  emitFogFilteredDelta: (...args: unknown[]) => mockEmitFogFilteredDelta(...args),
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
const mockProcessGoBackToReinforcement = jest.fn()
const mockProcessGameAction = jest.fn()

jest.mock('../services/gameService', () => ({
  GameService: jest.fn(() => ({
    getGameState: (...args: unknown[]) => mockGetGameState(...args),
    processPlaceArmies: (...args: unknown[]) => mockProcessPlaceArmies(...args),
    processFortify: (...args: unknown[]) => mockProcessFortify(...args),
    processEndTurn: (...args: unknown[]) => mockProcessEndTurn(...args),
    processPhaseChange: (...args: unknown[]) => mockProcessPhaseChange(...args),
    processGoBackToReinforcement: (...args: unknown[]) => mockProcessGoBackToReinforcement(...args),
    processGameAction: (...args: unknown[]) => mockProcessGameAction(...args),
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

  const invokeProcess = async (job: Job<GameActionJob>) => {
    const method = worker as unknown as {
      processGameAction: (queued: Job<GameActionJob>) => Promise<unknown>
    }
    return method.processGameAction(job)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockEmitFogFilteredDelta.mockClear()

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
    mockProcessPlaceArmies.mockResolvedValue({ armies: 7, playerArmies: 5 })

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
    } as unknown as Job<GameActionJob>

    const result = await invokeProcess(job)

    expect(mockGetGameState).toHaveBeenCalledWith('game-1')
    expect(mockProcessPlaceArmies).toHaveBeenCalledWith('game-1', {
      territoryId: 'north',
      armies: 2,
      playerId: 'player-1',
    })
    const emittedTypes = mockEmitFogFilteredDelta.mock.calls.map(([, roomId, delta]) => {
      expect(roomId).toBe('game-1')
      return (delta as { type: string }).type
    })
    expect(emittedTypes).toContain('PLAYER_UPDATE')
    expect(emittedTypes).toContain('TERRITORY_UPDATE')
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

  it('processes attack actions and defers broadcasting when no battle result', async () => {
    mockGetGameState.mockResolvedValue(buildGameState())
    mockProcessGameAction.mockResolvedValue({ lastBattleResult: null })

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
    } as unknown as Job<GameActionJob>

    const result = await invokeProcess(job)

    expect(mockGetGameState).toHaveBeenCalledWith('game-1')
    expect(mockAddBattleSimulation).not.toHaveBeenCalled()
    expect(io.to).not.toHaveBeenCalledWith('game:game-1')
    expect(roomEmit).not.toHaveBeenCalled()
    expect(mockEmitFogFilteredDelta).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, delta: null, processed: true })
    expect(mockMarkProcessedJob).toHaveBeenCalledWith(
      'game-actions',
      'job-attack',
      expect.objectContaining({ success: true, processed: true }),
      60 * 60,
    )
  })

  it('processes go back to reinforcement and emits phase change delta', async () => {
    mockGetGameState.mockResolvedValue(
      buildGameState({ phase: 'attack', hasAttackedThisTurn: false }),
    )
    mockProcessGoBackToReinforcement.mockResolvedValue({
      phase: 'reinforcement',
      currentPlayer: 'player-1',
      turn: 2,
      reinforcementArmies: 6,
    })

    const job = {
      id: 'job-go-back',
      data: {
        gameId: 'game-1',
        playerId: 'player-1',
        action: {
          type: 'go_back_to_reinforcement',
          roomId: 'game-1',
          playerId: 'player-1',
        },
      },
    } as unknown as Job<GameActionJob>

    const result = await invokeProcess(job)

    expect(mockProcessGoBackToReinforcement).toHaveBeenCalledWith('game-1', 'player-1')
    const emitted = mockEmitFogFilteredDelta.mock.calls.find(([, roomId]) => roomId === 'game-1')
    expect(emitted).toBeDefined()
    const delta = emitted?.[2] as { type: string; phase?: string; reinforcementArmies?: number }
    expect(delta?.type).toBe('PHASE_CHANGE')
    expect(delta?.phase).toBe('reinforcement')
    expect(delta?.reinforcementArmies).toBe(6)
    expect(result).toEqual(expect.objectContaining({ success: true, processed: true }))
  })
})
