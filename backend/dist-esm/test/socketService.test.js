"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const queueService_js_1 = require("../services/queueService.js");
const socketService_js_1 = require("../services/socketService.js");
const mockDbQuery = globals_1.jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
globals_1.jest.mock('../config/database', () => ({
    query: (...args) => mockDbQuery(...args),
}));
globals_1.jest.mock('../services/queueService', () => {
    const testGlobals = globalThis;
    const mocks = {
        addGameAction: globals_1.jest.fn(),
        addBattleSimulation: globals_1.jest.fn(),
    };
    testGlobals.__queueServiceMocks = mocks;
    return {
        queueService: mocks,
    };
});
const getQueueServiceMocks = () => {
    const testGlobals = globalThis;
    if (!testGlobals.__queueServiceMocks) {
        throw new Error('Queue service mocks not initialised');
    }
    return testGlobals.__queueServiceMocks;
};
const queueServiceMocks = getQueueServiceMocks();
const mockGameServiceInstance = {
    fortify: globals_1.jest.fn(),
    endTurn: globals_1.jest.fn(),
    processPlaceArmies: globals_1.jest.fn(),
    processPhaseChange: globals_1.jest.fn(),
    processGameAction: globals_1.jest.fn(),
    initializeGame: globals_1.jest.fn(),
    getGameState: globals_1.jest.fn(),
    isCapitalTerritory: globals_1.jest.fn().mockResolvedValue(false),
};
globals_1.jest.mock('../services/gameService', () => ({
    GameService: globals_1.jest.fn(() => mockGameServiceInstance),
}));
globals_1.jest.mock('../services/gameRoomService', () => {
    const testGlobals = globalThis;
    const mockIsPlayerInRoom = globals_1.jest.fn();
    const mockGetPlayer = globals_1.jest.fn();
    const GameRoomService = globals_1.jest.fn(() => ({
        isPlayerInRoom: mockIsPlayerInRoom,
        getPlayer: mockGetPlayer,
    }));
    testGlobals.__gameRoomServiceMocks = {
        mockIsPlayerInRoom,
        mockGetPlayer,
        GameRoomService,
    };
    return {
        GameRoomService,
    };
});
const getGameRoomServiceMocks = () => {
    const testGlobals = globalThis;
    if (!testGlobals.__gameRoomServiceMocks) {
        throw new Error('Game room service mocks not initialised');
    }
    return testGlobals.__gameRoomServiceMocks;
};
const { mockIsPlayerInRoom, mockGetPlayer } = getGameRoomServiceMocks();
globals_1.jest.mock('../services/cacheService', () => {
    const testGlobals = globalThis;
    const mockGetCachedState = globals_1.jest.fn();
    testGlobals.__cacheServiceMocks = {
        mockGetCachedState,
    };
    return {
        gameStateCache: {
            getGameState: mockGetCachedState,
        },
    };
});
const getCacheServiceMocks = () => {
    const testGlobals = globalThis;
    if (!testGlobals.__cacheServiceMocks) {
        throw new Error('Cache service mocks not initialised');
    }
    return testGlobals.__cacheServiceMocks;
};
const { mockGetCachedState } = getCacheServiceMocks();
globals_1.jest.mock('../services/socketRegistry', () => {
    const testGlobals = globalThis;
    const mockRegisterSocketServer = globals_1.jest.fn();
    testGlobals.__socketRegistryMocks = {
        mockRegisterSocketServer,
    };
    return {
        __esModule: true,
        registerSocketServer: mockRegisterSocketServer,
        tryGetSocketServer: globals_1.jest.fn(),
    };
});
const getSocketRegistryMocks = () => {
    const testGlobals = globalThis;
    if (!testGlobals.__socketRegistryMocks) {
        throw new Error('Socket registry mocks not initialised');
    }
    return testGlobals.__socketRegistryMocks;
};
const { mockRegisterSocketServer } = getSocketRegistryMocks();
globals_1.jest.mock('../socket/chatHandlers', () => ({
    setupChatHandlers: globals_1.jest.fn(),
}));
(0, globals_1.describe)('socketService event handlers', () => {
    const createIoMock = () => {
        const roomEmit = globals_1.jest.fn();
        const io = {
            use: globals_1.jest.fn(),
            on: globals_1.jest.fn(),
            to: globals_1.jest.fn(() => ({ emit: roomEmit })),
        };
        return { io, roomEmit };
    };
    const createFakeSocket = () => {
        const toEmit = globals_1.jest.fn();
        const socket = {
            id: 'socket-1',
            userId: 'user-1',
            username: 'User One',
            handshake: { auth: { token: 'stub-token' } },
            on: globals_1.jest.fn(),
            emit: globals_1.jest.fn(),
            join: globals_1.jest.fn().mockResolvedValue(undefined),
            leave: globals_1.jest.fn().mockResolvedValue(undefined),
            to: globals_1.jest.fn(() => ({ emit: toEmit })),
            rooms: new Set(['socket-1']),
            joinedGameRooms: new Set(),
            broadcastEmit: toEmit,
        };
        return socket;
    };
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        mockDbQuery.mockReset();
        mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        queueServiceMocks.addGameAction.mockReset();
        queueServiceMocks.addBattleSimulation.mockReset();
        mockGetCachedState.mockReset();
        mockGetCachedState.mockResolvedValue(null);
        mockIsPlayerInRoom.mockReset();
        mockIsPlayerInRoom.mockResolvedValue(true);
        mockGetPlayer.mockReset();
        mockGetPlayer.mockResolvedValue({
            userId: 'user-1',
            username: 'User One',
            joinedAt: new Date('2024-01-01T00:00:00Z'),
        });
        mockRegisterSocketServer.mockReset();
        mockGameServiceInstance.fortify.mockReset();
        mockGameServiceInstance.fortify.mockResolvedValue({
            fromArmies: 1,
            toArmies: 2,
            gameState: { id: 'state' },
        });
        mockGameServiceInstance.endTurn.mockReset();
        mockGameServiceInstance.endTurn.mockResolvedValue({
            gameState: {
                phase: 'reinforcement',
                currentPlayer: 'player-2',
                turn: 2,
            },
            reinforcementArmies: 5,
        });
        mockGameServiceInstance.isCapitalTerritory.mockResolvedValue(false);
    });
    const getSocketHandler = (socket, eventName) => {
        const onMock = socket.on;
        const call = onMock.mock.calls.find(([name]) => name === eventName);
        (0, globals_1.expect)(call).toBeDefined();
        const handler = call?.[1];
        (0, globals_1.expect)(typeof handler).toBe('function');
        return handler;
    };
    const initialiseHandlers = () => {
        const { io, roomEmit } = createIoMock();
        (0, socketService_js_1.setupSocketHandlers)(io);
        const onMock = io.on;
        const connectionCall = onMock.mock.calls.find(([event]) => event === 'connection');
        (0, globals_1.expect)(connectionCall).toBeDefined();
        const [, connectionHandler] = connectionCall;
        const socket = createFakeSocket();
        connectionHandler(socket);
        return { socket, io, roomEmit };
    };
    (0, globals_1.it)('queues attack actions with normalized payload', async () => {
        queueServiceMocks.addGameAction.mockResolvedValue({ id: 'job-123' });
        const { socket } = initialiseHandlers();
        const attackHandler = getSocketHandler(socket, 'attack');
        await attackHandler({
            roomId: 'room-42',
            fromTerritoryId: 'territory-a',
            toTerritoryId: 'territory-b',
            armies: 3,
        });
        (0, globals_1.expect)(queueService_js_1.queueService.addGameAction).toHaveBeenCalledWith(globals_1.expect.objectContaining({
            gameId: 'room-42',
            playerId: 'user-1',
            action: globals_1.expect.objectContaining({
                type: 'attack',
                payload: globals_1.expect.objectContaining({
                    fromTerritoryId: 'territory-a',
                    toTerritoryId: 'territory-b',
                    armies: 3,
                }),
            }),
        }));
    });
    (0, globals_1.it)('sends fortify updates as coalesced deltas after processing', async () => {
        const { socket, io, roomEmit } = initialiseHandlers();
        const fortifyHandler = getSocketHandler(socket, 'fortify');
        await fortifyHandler({
            roomId: 'room-99',
            fromTerritoryId: 'from',
            toTerritoryId: 'to',
            armies: 5,
        });
        (0, globals_1.expect)(mockGameServiceInstance.fortify).toHaveBeenCalledWith('room-99', 'user-1', 'from', 'to', 5);
        const ioToMock = io.to;
        (0, globals_1.expect)(ioToMock).toHaveBeenCalledWith('game:room-99');
        const firstCall = roomEmit.mock.calls[0];
        (0, globals_1.expect)(firstCall[0]).toBe('game-delta-batch');
        const deltas = firstCall[1];
        (0, globals_1.expect)(Array.isArray(deltas) && deltas.length).toBe(2);
        const [d1, d2] = deltas;
        (0, globals_1.expect)(d1.type).toBe('TERRITORY_UPDATE');
        (0, globals_1.expect)(d2.type).toBe('TERRITORY_UPDATE');
    });
    (0, globals_1.it)('broadcasts phase changes via unified game-delta on end turn', async () => {
        const { socket, io, roomEmit } = initialiseHandlers();
        const endTurnHandler = getSocketHandler(socket, 'endTurn');
        await endTurnHandler({ roomId: 'room-end' });
        (0, globals_1.expect)(mockGameServiceInstance.endTurn).toHaveBeenCalledWith('room-end', 'user-1');
        const ioToMock = io.to;
        (0, globals_1.expect)(ioToMock).toHaveBeenCalledWith('game:room-end');
        (0, globals_1.expect)(roomEmit).toHaveBeenNthCalledWith(1, 'game-delta', globals_1.expect.objectContaining({
            type: 'PHASE_CHANGE',
            roomId: 'room-end',
            phase: 'reinforcement',
            currentPlayer: 'player-2',
        }));
    });
    (0, globals_1.it)('falls back gracefully when game action queue is unavailable', async () => {
        queueServiceMocks.addGameAction.mockResolvedValue(null);
        const { socket, io } = initialiseHandlers();
        const attackHandler = getSocketHandler(socket, 'attack');
        await attackHandler({
            roomId: 'room-degraded',
            fromTerritoryId: 'a',
            toTerritoryId: 'b',
            armies: 1,
        });
        (0, globals_1.expect)(queueService_js_1.queueService.addGameAction).toHaveBeenCalled();
        const ioToMock = io.to;
        (0, globals_1.expect)(ioToMock).not.toHaveBeenCalled();
    });
    (0, globals_1.it)('emits error event when queue call fails', async () => {
        queueServiceMocks.addGameAction.mockRejectedValue(new Error('queue offline'));
        const { socket } = initialiseHandlers();
        const attackHandler = getSocketHandler(socket, 'attack');
        await attackHandler({
            roomId: 'room-failure',
            fromTerritoryId: 'x',
            toTerritoryId: 'y',
            armies: 2,
        });
        (0, globals_1.expect)(socket.emit).toHaveBeenCalledWith('error', globals_1.expect.objectContaining({
            event: 'attack',
            message: globals_1.expect.stringContaining('queue offline'),
        }));
    });
    (0, globals_1.it)('validates membership before joining a game channel', async () => {
        mockIsPlayerInRoom.mockResolvedValue(false);
        const { socket } = initialiseHandlers();
        const joinHandler = getSocketHandler(socket, 'join-room');
        await joinHandler('room-unauthorized');
        (0, globals_1.expect)(mockIsPlayerInRoom).toHaveBeenCalledWith('room-unauthorized', 'user-1');
        const joinCalls = socket.join.mock.calls;
        (0, globals_1.expect)(joinCalls.find(([roomId]) => roomId === 'game:room-unauthorized')).toBeUndefined();
        (0, globals_1.expect)(socket.emit).toHaveBeenCalledWith('error', globals_1.expect.objectContaining({
            event: 'join-room',
            message: globals_1.expect.stringContaining('member'),
        }));
    });
    (0, globals_1.it)('joins canonical channel and backfills state when authorized', async () => {
        const serializedState = {
            roomId: 'room-123',
            phase: 'reinforcement',
            board: [],
            players: [],
        };
        mockGetCachedState.mockResolvedValue(serializedState);
        const { socket } = initialiseHandlers();
        const joinHandler = getSocketHandler(socket, 'join-room');
        await joinHandler('room-123');
        (0, globals_1.expect)(mockIsPlayerInRoom).toHaveBeenCalledWith('room-123', 'user-1');
        (0, globals_1.expect)(socket.join).toHaveBeenCalledWith('game:room-123');
        (0, globals_1.expect)(socket.joinedGameRooms.has('room-123')).toBe(true);
        (0, globals_1.expect)(socket.emit).toHaveBeenCalledWith('game-update', globals_1.expect.objectContaining({ roomId: 'room-123', phase: 'reinforcement' }));
        const toMock = socket.to;
        (0, globals_1.expect)(toMock).toHaveBeenCalledWith('game:room-123');
        const broadcastCalls = socket.broadcastEmit.mock.calls;
        (0, globals_1.expect)(broadcastCalls[0]).toEqual([
            'player-joined',
            globals_1.expect.objectContaining({
                roomId: 'room-123',
                player: globals_1.expect.objectContaining({
                    userId: 'user-1',
                    username: 'User One',
                    isAi: false,
                    isReady: false,
                }),
            }),
        ]);
    });
    (0, globals_1.it)('emits rich metadata when a user leaves a game channel', async () => {
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
        });
        const { socket } = initialiseHandlers();
        const leaveHandler = getSocketHandler(socket, 'leave-room');
        await leaveHandler('room-depart');
        const toMock = socket.to;
        (0, globals_1.expect)(toMock).toHaveBeenCalledWith('game:room-depart');
        (0, globals_1.expect)(socket.broadcastEmit).toHaveBeenCalledWith('player-left', globals_1.expect.objectContaining({
            roomId: 'room-depart',
            playerSlotId: 'slot-42',
            userId: 'user-1',
            aiPlayerId: null,
            isAi: false,
        }));
    });
});
//# sourceMappingURL=socketService.test.js.map