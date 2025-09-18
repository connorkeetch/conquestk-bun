jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
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

jest.mock('../socket/chatHandlers', () => ({
  setupChatHandlers: jest.fn(),
}))

import type { Server } from 'socket.io'
import { setupSocketHandlers } from '../services/socketService'
import { queueService } from '../services/queueService'
import { GameService } from '../services/gameService'

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
      handshake: { auth: { token: 'stub' } },
      on: jest.fn(),
      emit: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      to: jest.fn(() => ({ emit: toEmit })),
      rooms: new Set<string>(['socket-1']),
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
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
    return call![1]
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

  it('sends fortify results to room after processing', async () => {
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
    expect(ioToMock).toHaveBeenCalledWith('room-99')
    expect(roomEmit).toHaveBeenNthCalledWith(1, 'territoriesFortified', {
      fromArmies: 1,
      toArmies: 2,
      gameState: { id: 'state' },
    })
    expect(roomEmit).toHaveBeenNthCalledWith(2, 'game-update', { id: 'state' })
  })

  it('broadcasts phase changes on end turn', async () => {
    const { socket, io, roomEmit } = initialiseHandlers()
    const endTurnHandler = getSocketHandler(socket, 'endTurn')

    await endTurnHandler({ roomId: 'room-end' })

    expect(mockGameServiceInstance.endTurn).toHaveBeenCalledWith('room-end', 'user-1')

    const ioToMock = io.to as unknown as jest.Mock
    expect(ioToMock).toHaveBeenCalledWith('room-end')
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
})
