import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Server } from 'socket.io'
import { queueService } from '../services/queueService.js'
import { setupSocketHandlers } from '../services/socketService.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'

type QueueServiceMocks = {
  addGameAction: jest.Mock
  addBattleSimulation: jest.Mock
}

type GameRoomServiceMocks = {
  mockIsPlayerInRoom: jest.Mock
  mockGetPlayer: jest.Mock
  GameRoomService: jest.Mock
}

type CacheServiceMocks = {
  mockGetCachedState: jest.Mock
}

type SocketRegistryMocks = {
  mockRegisterSocketServer: jest.Mock
}

type TestGlobals = typeof globalThis & {
  __queueServiceMocks?: QueueServiceMocks
  __gameRoomServiceMocks?: GameRoomServiceMocks
  __cacheServiceMocks?: CacheServiceMocks
  __socketRegistryMocks?: SocketRegistryMocks
}

const mockDbQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockDbQuery(...args),
}))

jest.mock('../services/queueService', () => {
  const testGlobals = globalThis as TestGlobals
  const mocks: QueueServiceMocks = {
    addGameAction: jest.fn(),
    addBattleSimulation: jest.fn(),
  }
  testGlobals.__queueServiceMocks = mocks
  return {
    queueService: mocks,
  }
})

const getQueueServiceMocks = (): QueueServiceMocks => {
  const testGlobals = globalThis as TestGlobals
  if (!testGlobals.__queueServiceMocks) {
    throw new Error('Queue service mocks not initialised')
  }
  return testGlobals.__queueServiceMocks
}

const queueServiceMocks = getQueueServiceMocks()

const mockGameServiceInstance = {
  fortify: jest.fn(),
  endTurn: jest.fn(),
  processPlaceArmies: jest.fn(),
  processPhaseChange: jest.fn(),
  processGameAction: jest.fn(),
  initializeGame: jest.fn(),
  getGameState: jest.fn(),
  isCapitalTerritory: jest.fn().mockResolvedValue(false),
}

jest.mock('../services/gameService', () => ({
  GameService: jest.fn(() => mockGameServiceInstance),
}))

jest.mock('../services/gameRoomService', () => {
  const testGlobals = globalThis as TestGlobals
  const mockIsPlayerInRoom = jest.fn()
  const mockGetPlayer = jest.fn()
  const GameRoomService = jest.fn(() => ({
    isPlayerInRoom: mockIsPlayerInRoom,
    getPlayer: mockGetPlayer,
  }))
  testGlobals.__gameRoomServiceMocks = {
    mockIsPlayerInRoom,
    mockGetPlayer,
    GameRoomService,
  }
  return {
    GameRoomService,
  }
})

const getGameRoomServiceMocks = (): GameRoomServiceMocks => {
  const testGlobals = globalThis as TestGlobals
  if (!testGlobals.__gameRoomServiceMocks) {
    throw new Error('Game room service mocks not initialised')
  }
  return testGlobals.__gameRoomServiceMocks
}

const { mockIsPlayerInRoom, mockGetPlayer } = getGameRoomServiceMocks()

jest.mock('../services/cacheService', () => {
  const testGlobals = globalThis as TestGlobals
  const mockGetCachedState = jest.fn()
  testGlobals.__cacheServiceMocks = {
    mockGetCachedState,
  }
  return {
    gameStateCache: {
      getGameState: mockGetCachedState,
    },
  }
})

const getCacheServiceMocks = (): CacheServiceMocks => {
  const testGlobals = globalThis as TestGlobals
  if (!testGlobals.__cacheServiceMocks) {
    throw new Error('Cache service mocks not initialised')
  }
  return testGlobals.__cacheServiceMocks
}

const { mockGetCachedState } = getCacheServiceMocks()

jest.mock('../services/socketRegistry', () => {
  const testGlobals = globalThis as TestGlobals
  const mockRegisterSocketServer = jest.fn()
  testGlobals.__socketRegistryMocks = {
    mockRegisterSocketServer,
  }
  return {
    __esModule: true,
    registerSocketServer: mockRegisterSocketServer,
    tryGetSocketServer: jest.fn(),
  }
})

const getSocketRegistryMocks = (): SocketRegistryMocks => {
  const testGlobals = globalThis as TestGlobals
  if (!testGlobals.__socketRegistryMocks) {
    throw new Error('Socket registry mocks not initialised')
  }
  return testGlobals.__socketRegistryMocks
}

const { mockRegisterSocketServer } = getSocketRegistryMocks()

jest.mock('../socket/chatHandlers', () => ({
  setupChatHandlers: jest.fn(),
}))

type MockedSocket = {
  id: string
  userId: string
  username: string
  handshake: { auth: { token: string } }
  on: jest.Mock
  emit: jest.Mock
  join: jest.Mock<Promise<void>, [string]>
  leave: jest.Mock<Promise<void>, [string]>
  to: jest.Mock<{ emit: jest.Mock }, [string]>
  rooms: Set<string>
  joinedGameRooms: Set<string>
  broadcastEmit: jest.Mock
}

describe('socketService event handlers', () => {
  const createIoMock = () => {
    const roomEmit = jest.fn()
    const io = {
      use: jest.fn(),
      on: jest.fn(),
      to: jest.fn(() => ({ emit: roomEmit })),
    } as unknown as Server<ClientToServerEvents, ServerToClientEvents>
    return { io, roomEmit }
  }

  const createFakeSocket = () => {
    const toEmit = jest.fn()
    const socket: MockedSocket = {
      id: 'socket-1',
      userId: 'user-1',
      username: 'User One',
      handshake: { auth: { token: 'stub-token' } },
      on: jest.fn(),
      emit: jest.fn(),
      join: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
      leave: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
      to: jest.fn(() => ({ emit: toEmit })),
      rooms: new Set<string>(['socket-1']),
      joinedGameRooms: new Set<string>(),
      broadcastEmit: toEmit,
    }
    return socket
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockDbQuery.mockReset()
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    queueServiceMocks.addGameAction.mockReset()
    queueServiceMocks.addBattleSimulation.mockReset()
    mockGetCachedState.mockReset()
    mockGetCachedState.mockResolvedValue(null)
    mockIsPlayerInRoom.mockReset()
    mockIsPlayerInRoom.mockResolvedValue(true)
    mockGetPlayer.mockReset()
    mockGetPlayer.mockResolvedValue({
      userId: 'user-1',
      username: 'User One',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    })
    mockRegisterSocketServer.mockReset()

    mockGameServiceInstance.fortify.mockReset()
    mockGameServiceInstance.fortify.mockResolvedValue({
      fromArmies: 1,
      toArmies: 2,
      gameState: { id: 'state' },
    })
    mockGameServiceInstance.endTurn.mockReset()
    mockGameServiceInstance.endTurn.mockResolvedValue({
      gameState: {
        phase: 'reinforcement',
        currentPlayer: 'player-2',
        turn: 2,
      },
      reinforcementArmies: 5,
    })
    mockGameServiceInstance.isCapitalTerritory.mockResolvedValue(false)
  })

  const getSocketHandler = (
    socket: MockedSocket,
    eventName: keyof ClientToServerEvents,
  ): ((...args: unknown[]) => Promise<void> | void) => {
    const onMock = socket.on as jest.Mock
    const call = onMock.mock.calls.find(([name]) => name === eventName)
    expect(call).toBeDefined()
    const handler = call?.[1]
    expect(typeof handler).toBe('function')
    return handler as (...args: unknown[]) => Promise<void> | void
  }

  const initialiseHandlers = () => {
    const { io, roomEmit } = createIoMock()
    setupSocketHandlers(io)
    const onMock = io.on as jest.Mock
    const connectionCall = onMock.mock.calls.find(([event]) => event === 'connection')
    expect(connectionCall).toBeDefined()
    const [, connectionHandler] = connectionCall as [string, (socket: MockedSocket) => void]
    const socket = createFakeSocket()
    connectionHandler(socket)
    return { socket, io, roomEmit }
  }

  it('queues attack actions with normalized payload', async () => {
    queueServiceMocks.addGameAction.mockResolvedValue({ id: 'job-123' })

    const { socket } = initialiseHandlers()
    const attackHandler = getSocketHandler(socket, 'attack')

    await attackHandler({
      roomId: 'room-42',
      fromTerritoryId: 'territory-a',
      toTerritoryId: 'territory-b',
      armies: 3,
    })

    expect(queueService.addGameAction).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'room-42',
        playerId: 'user-1',
        action: expect.objectContaining({
          type: 'attack',
          payload: expect.objectContaining({
            fromTerritoryId: 'territory-a',
            toTerritoryId: 'territory-b',
            armies: 3,
          }),
        }),
      }),
    )
  })

  it('sends fortify updates as coalesced deltas after processing', async () => {
    const { socket, io, roomEmit } = initialiseHandlers()
    const fortifyHandler = getSocketHandler(socket, 'fortify')

    await fortifyHandler({
      roomId: 'room-99',
      fromTerritoryId: 'from',
      toTerritoryId: 'to',
      armies: 5,
    })

    expect(mockGameServiceInstance.fortify).toHaveBeenCalledWith(
      'room-99',
      'user-1',
      'from',
      'to',
      5,
    )

    const ioToMock = io.to as unknown as jest.Mock
    expect(ioToMock).toHaveBeenCalledWith('game:room-99')
    // First emission should be a coalesced batch with two TERRITORY_UPDATE deltas
    const firstCall = roomEmit.mock.calls[0]
    expect(firstCall[0]).toBe('game-delta-batch')
    const deltas = firstCall[1] as Array<{ type: string; territoryId: string; changes: unknown }>
    expect(Array.isArray(deltas) && deltas.length).toBe(2)
    const [d1, d2] = deltas
    expect(d1.type).toBe('TERRITORY_UPDATE')
    expect(d2.type).toBe('TERRITORY_UPDATE')
  })

  it('broadcasts phase changes via unified game-delta on end turn', async () => {
    const { socket, io, roomEmit } = initialiseHandlers()
    const endTurnHandler = getSocketHandler(socket, 'endTurn')

    await endTurnHandler({ roomId: 'room-end' })

    expect(mockGameServiceInstance.endTurn).toHaveBeenCalledWith('room-end', 'user-1')

    const ioToMock = io.to as unknown as jest.Mock
    expect(ioToMock).toHaveBeenCalledWith('game:room-end')
    expect(roomEmit).toHaveBeenNthCalledWith(
      1,
      'game-delta',
      expect.objectContaining({
        type: 'PHASE_CHANGE',
        roomId: 'room-end',
        phase: 'reinforcement',
        currentPlayer: 'player-2',
      }),
    )
  })

  it('falls back gracefully when game action queue is unavailable', async () => {
    queueServiceMocks.addGameAction.mockResolvedValue(null)

    const { socket, io } = initialiseHandlers()
    const attackHandler = getSocketHandler(socket, 'attack')

    await attackHandler({
      roomId: 'room-degraded',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      armies: 1,
    })

    expect(queueService.addGameAction).toHaveBeenCalled()
    const ioToMock = io.to as unknown as jest.Mock
    expect(ioToMock).not.toHaveBeenCalled()
  })

  it('emits error event when queue call fails', async () => {
    queueServiceMocks.addGameAction.mockRejectedValue(new Error('queue offline'))

    const { socket } = initialiseHandlers()
    const attackHandler = getSocketHandler(socket, 'attack')

    await attackHandler({
      roomId: 'room-failure',
      fromTerritoryId: 'x',
      toTerritoryId: 'y',
      armies: 2,
    })

    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'attack',
        message: expect.stringContaining('queue offline'),
      }),
    )
  })

  it('validates membership before joining a game channel', async () => {
    mockIsPlayerInRoom.mockResolvedValue(false)

    const { socket } = initialiseHandlers()
    const joinHandler = getSocketHandler(socket, 'join-room')

    await joinHandler('room-unauthorized')

    expect(mockIsPlayerInRoom).toHaveBeenCalledWith('room-unauthorized', 'user-1')
    const joinCalls = (socket.join as jest.Mock).mock.calls
    expect(
      joinCalls.find(([roomId]: [string]) => roomId === 'game:room-unauthorized'),
    ).toBeUndefined()
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'join-room',
        message: expect.stringContaining('member'),
      }),
    )
  })

  it('joins canonical channel and backfills state when authorized', async () => {
    const serializedState = {
      roomId: 'room-123',
      phase: 'reinforcement',
      board: [],
      players: [],
    }
    mockGetCachedState.mockResolvedValue(serializedState)

    const { socket } = initialiseHandlers()
    const joinHandler = getSocketHandler(socket, 'join-room')

    await joinHandler('room-123')

    expect(mockIsPlayerInRoom).toHaveBeenCalledWith('room-123', 'user-1')
    expect(socket.join).toHaveBeenCalledWith('game:room-123')
    expect(socket.joinedGameRooms.has('room-123')).toBe(true)
    expect(socket.emit).toHaveBeenCalledWith(
      'game-update',
      expect.objectContaining({ roomId: 'room-123', phase: 'reinforcement' }),
    )

    const toMock = socket.to as jest.Mock
    expect(toMock).toHaveBeenCalledWith('game:room-123')

    const broadcastCalls = socket.broadcastEmit.mock.calls
    expect(broadcastCalls[0]).toEqual([
      'player-joined',
      expect.objectContaining({
        roomId: 'room-123',
        player: expect.objectContaining({
          userId: 'user-1',
          username: 'User One',
          isAi: false,
          isReady: false,
        }),
      }),
    ])
  })

  it('emits rich metadata when a user leaves a game channel', async () => {
    mockGetPlayer.mockResolvedValueOnce({
      id: 'slot-42',
      userId: 'user-1',
      aiPlayerId: null,
      username: 'User One',
      joinedAt: new Date('2024-01-03T00:00:00Z'),
      isAi: false,
      isReady: false,
      readyAt: null,
      teamId: null,
    })

    const { socket } = initialiseHandlers()
    const leaveHandler = getSocketHandler(socket, 'leave-room')

    await leaveHandler('room-depart')

    const toMock = socket.to as jest.Mock
    expect(toMock).toHaveBeenCalledWith('game:room-depart')

    expect(socket.broadcastEmit).toHaveBeenCalledWith(
      'player-left',
      expect.objectContaining({
        roomId: 'room-depart',
        playerSlotId: 'slot-42',
        userId: 'user-1',
        aiPlayerId: null,
        isAi: false,
      }),
    )
  })
})
