const mockDbQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })

jest.mock('../config/database', () => ({
  query: mockDbQuery,
}))

const mockAddGameAction = jest.fn()
const mockAddBattleSimulation = jest.fn()

jest.mock('../services/queueService', () => ({
  queueService: {
    addGameAction: mockAddGameAction,
    addBattleSimulation: mockAddBattleSimulation,
  },
}))

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

const mockIsPlayerInRoom = jest.fn()
const mockGetPlayer = jest.fn()

jest.mock('../services/gameRoomService', () => ({
  GameRoomService: jest.fn(() => ({
    isPlayerInRoom: mockIsPlayerInRoom,
    getPlayer: mockGetPlayer,
  })),
}))

const mockGetCachedState = jest.fn()

jest.mock('../services/cacheService', () => ({
  gameStateCache: {
    getGameState: mockGetCachedState,
  },
}))

const mockRegisterSocketServer = jest.fn()

jest.mock('../services/socketRegistry', () => ({
  registerSocketServer: mockRegisterSocketServer,
}))

jest.mock('../socket/chatHandlers', () => ({
  setupChatHandlers: jest.fn(),
}))

import type { Server } from 'socket.io'
import { queueService } from '../services/queueService'
import { setupSocketHandlers } from '../services/socketService'

describe('socketService event handlers', () => {
  const createIoMock = () => {
    const roomEmit = jest.fn()
    const io = {
      use: jest.fn(),
      on: jest.fn(),
      to: jest.fn(() => ({ emit: roomEmit })),
    } as unknown as Server
    return { io, roomEmit }
  }

  const createFakeSocket = () => {
    const toEmit = jest.fn()
    return {
      id: 'socket-1',
      userId: 'user-1',
      username: 'User One',
      handshake: { auth: { token: 'stub-token' } },
      on: jest.fn(),
      emit: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      to: jest.fn(() => ({ emit: toEmit })),
      rooms: new Set<string>(['socket-1']),
      joinedGameRooms: new Set<string>(),
      broadcastEmit: toEmit,
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    mockGetCachedState.mockResolvedValue(null)
    mockIsPlayerInRoom.mockResolvedValue(true)
    mockGetPlayer.mockResolvedValue({
      userId: 'user-1',
      username: 'User One',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    })

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

  const getSocketHandler = (socket: any, eventName: string) => {
    const call = socket.on.mock.calls.find(([name]: [string, any]) => name === eventName)
    expect(call).toBeDefined()
    return call?.[1]
  }

  const initialiseHandlers = () => {
    const { io, roomEmit } = createIoMock()
    setupSocketHandlers(io)
    const connectionCall = (io.on as jest.Mock).mock.calls.find(
      ([event]: [string, any]) => event === 'connection',
    )
    expect(connectionCall).toBeDefined()
    const [, handler] = connectionCall!
    const socket = createFakeSocket()
    handler(socket)
    return { socket, io, roomEmit }
  }

  it('queues attack actions with normalized payload', async () => {
    mockAddGameAction.mockResolvedValue({ id: 'job-123' })

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

  it('sends fortify results to canonical channel after processing', async () => {
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
    expect(roomEmit).toHaveBeenNthCalledWith(1, 'territoriesFortified', {
      fromArmies: 1,
      toArmies: 2,
      gameState: { id: 'state' },
    })
    expect(roomEmit).toHaveBeenNthCalledWith(2, 'game-update', { id: 'state' })
  })

  it('broadcasts phase changes to game channel on end turn', async () => {
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
      }),
    )

    expect(roomEmit).toHaveBeenNthCalledWith(2, 'phaseChanged', {
      phase: 'reinforcement',
      currentPlayer: 'player-2',
      turn: 2,
      reinforcementArmies: 5,
    })
  })

  it('falls back gracefully when game action queue is unavailable', async () => {
    mockAddGameAction.mockResolvedValue(null)

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
    mockAddGameAction.mockRejectedValue(new Error('queue offline'))

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
    expect(joinCalls.find(([roomId]: [string]) => roomId === 'game:room-unauthorized')).toBeUndefined()
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
      phase: 'setup',
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
    expect(socket.emit).toHaveBeenCalledWith('game-update', serializedState)

    const toMock = socket.to as jest.Mock
    expect(toMock).toHaveBeenCalledWith('game:room-123')

    const broadcastCalls = socket.broadcastEmit.mock.calls
    expect(broadcastCalls[0]).toEqual([
      'player-joined',
      expect.objectContaining({
        roomId: 'room-123',
        player: expect.objectContaining({ userId: 'user-1', username: 'User One' }),
      }),
    ])
  })
})
