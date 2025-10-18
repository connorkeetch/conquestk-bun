import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Server } from 'socket.io'
import { setupSocketHandlers } from '../services/socketService.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js'

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
  __gameRoomServiceMocks?: GameRoomServiceMocks
  __cacheServiceMocks?: CacheServiceMocks
  __socketRegistryMocks?: SocketRegistryMocks
  __lockstepMocks?: LockstepServiceMocks
}

type LockstepServiceMocks = {
  recordFrame: jest.Mock
  reset: jest.Mock
}

const mockDbQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockDbQuery(...args),
}))

const mockGameServiceInstance = {
  fortify: jest.fn(),
  processFortify: jest.fn(),
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

jest.mock('../services/lockstepService', () => {
  const testGlobals = globalThis as TestGlobals
  const mocks: LockstepServiceMocks = {
    recordFrame: jest.fn().mockResolvedValue({
      frame: {
        matchId: 'room-1',
        seq: 1,
        playerId: 'user-1',
        commands: [],
        committedAt: new Date().toISOString(),
      },
    }),
    reset: jest.fn(),
  }
  testGlobals.__lockstepMocks = mocks
  return {
    lockstepService: mocks,
  }
})

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

const getLockstepServiceMocks = (): LockstepServiceMocks => {
  const testGlobals = globalThis as TestGlobals
  if (!testGlobals.__lockstepMocks) {
    throw new Error('Lockstep service mocks not initialised')
  }
  return testGlobals.__lockstepMocks
}

const mockLockstepService = getLockstepServiceMocks()

jest.mock('../services/socketRegistry', () => {
  const testGlobals = globalThis as TestGlobals
  const mockRegisterSocketServer = jest.fn()
  // Keep a captured reference to IO passed during setup so tryGetSocketServer returns it
  let currentIo: Server<ClientToServerEvents, ServerToClientEvents> | null = null
  const registerSocketServer = ((io: Server<ClientToServerEvents, ServerToClientEvents>) => {
    currentIo = io
    return mockRegisterSocketServer(io)
  }) as unknown as typeof import('../services/socketRegistry.js').registerSocketServer
  const tryGetSocketServer = (() =>
    currentIo) as unknown as typeof import('../services/socketRegistry.js').tryGetSocketServer
  testGlobals.__socketRegistryMocks = {
    mockRegisterSocketServer,
  }
  return {
    __esModule: true,
    registerSocketServer,
    tryGetSocketServer,
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
    if (mockGameServiceInstance.processFortify) {
      mockGameServiceInstance.processFortify.mockReset()
      mockGameServiceInstance.processFortify.mockResolvedValue({
        fromArmies: 1,
        toArmies: 2,
        version: 1,
      })
    }
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
    mockLockstepService.recordFrame.mockClear()
    mockLockstepService.reset.mockClear()
  })

  afterEach(() => {
    delete process.env.GAME_ACTION_QUEUE
    delete process.env.LOCKSTEP_DEV
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

  it('sends fortify updates as coalesced deltas after processing', async () => {
    const { socket, io, roomEmit } = initialiseHandlers()
    const handler = getSocketHandler(socket, 'game-action')

    // Ensure inline emitter path runs and emits via fallback channel
    // by providing a minimal game state for emitCombined
    mockGameServiceInstance.getGameState.mockResolvedValueOnce({
      roomId: 'room-99',
      turn: 1,
      phase: 'reinforcement',
      board: [
        { id: 'from', name: 'From', ownerId: 'user-1', armies: 3, adjacentTerritories: [] },
        { id: 'to', name: 'To', ownerId: 'user-1', armies: 2, adjacentTerritories: [] },
      ],
      players: [{ id: 'user-1', username: 'User One', isAi: false }],
      settings: { turnTimer: 60 },
      gameConfig: { fogOfWar: 'off' },
    } as unknown as import('../types/game.js').GameState)

    await handler({
      roomId: 'room-99',
      action: {
        type: 'fortify',
        roomId: 'room-99',
        playerId: 'user-1',
        payload: { fromTerritoryId: 'from', toTerritoryId: 'to', armies: 5 },
      },
    })

    expect(mockGameServiceInstance.processFortify).toHaveBeenCalledWith(
      'room-99',
      expect.objectContaining({
        fromTerritoryId: 'from',
        toTerritoryId: 'to',
        armies: 5,
        playerId: 'user-1',
      }),
    )

    // Under fog-aware emission, fallback path emits individual 'game-delta' events
    const ioToMock = io.to as unknown as jest.Mock
    expect(ioToMock).toHaveBeenCalledWith('game:room-99')
    const firstCall = roomEmit.mock.calls[0]
    const eventName = firstCall[0] as string
    expect(['game-delta', 'game-delta-batch']).toContain(eventName)
    if (eventName === 'game-delta') {
      const delta = firstCall[1] as { type: string; territoryId?: string }
      expect(delta.type).toBe('TERRITORY_UPDATE')
    } else {
      const deltas = firstCall[1] as Array<{ type: string; territoryId?: string }>
      // Batch should contain at least one territory update from fortify
      expect(Array.isArray(deltas)).toBe(true)
      const hasUpdate = deltas.some((d) => d.type === 'TERRITORY_UPDATE')
      expect(hasUpdate).toBe(true)
    }
  })

  it('emits lockstep frame events when enabled', async () => {
    process.env.LOCKSTEP_DEV = 'true'
    const committedAt = new Date().toISOString()
    mockLockstepService.recordFrame.mockResolvedValue({
      frame: {
        matchId: 'room-lockstep',
        seq: 1,
        playerId: 'user-1',
        commands: [{ kind: 'end_turn', payload: {} }],
        committedAt,
      },
      checksum: {
        matchId: 'room-lockstep',
        seq: 1,
        crc32: 123456,
        computedAt: committedAt,
      },
    })
    mockGameServiceInstance.getGameState.mockResolvedValue({
      roomId: 'room-lockstep',
      currentPlayer: 'user-2',
      phase: 'reinforcement',
      turn: 2,
      board: [],
      players: [{ id: 'user-1', username: 'User One', isAi: false, territories: [], armies: 0 }],
      cards: [],
      gameConfig: {},
    } as unknown as import('../types/game.js').GameState)

    const { socket, roomEmit } = initialiseHandlers()
    const handler = getSocketHandler(socket, 'game-action')

    await handler({
      roomId: 'room-lockstep',
      action: {
        type: 'end_turn',
        roomId: 'room-lockstep',
        playerId: 'user-1',
      },
    })

    expect(mockLockstepService.recordFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        matchId: 'room-lockstep',
        playerId: 'user-1',
      }),
    )

    expect(roomEmit).toHaveBeenCalledWith(
      'game-action:frame-committed',
      expect.objectContaining({
        matchId: 'room-lockstep',
        seq: 1,
        playerId: 'user-1',
      }),
    )

    expect(roomEmit).toHaveBeenCalledWith(
      'game-action:checksum',
      expect.objectContaining({
        matchId: 'room-lockstep',
        seq: 1,
        crc32: 123456,
      }),
    )
  })

  it('broadcasts phase changes via unified game-delta on end turn', async () => {
    const { socket, io, roomEmit } = initialiseHandlers()
    const handler = getSocketHandler(socket, 'game-action')

    await handler({
      roomId: 'room-end',
      action: { type: 'end_turn', roomId: 'room-end', playerId: 'user-1' },
    })

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

  it('validates membership before joining a game channel', async () => {
    mockIsPlayerInRoom.mockResolvedValue(false)

    const { socket } = initialiseHandlers()
    const joinHandler = getSocketHandler(socket, 'join-room')

    const ack = jest.fn()
    await joinHandler('room-unauthorized', ack)

    expect(mockIsPlayerInRoom).toHaveBeenCalledWith('room-unauthorized', 'user-1')
    const joinCalls = (socket.join as jest.Mock).mock.calls
    expect(
      joinCalls.find(([roomId]: [string]) => roomId === 'game:room-unauthorized'),
    ).toBeUndefined()
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        code: 'not_a_member',
        error: expect.stringContaining('member'),
      }),
    )
    expect(socket.emit).not.toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ event: 'join-room' }),
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
      'game:snapshot',
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
