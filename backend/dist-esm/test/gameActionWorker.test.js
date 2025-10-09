"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const gameActionWorker_js_1 = require("../workers/gameActionWorker.js");
const mockGetProcessedJob = globals_1.jest.fn();
const mockMarkProcessedJob = globals_1.jest.fn();
const mockEmitFogFilteredDelta = globals_1.jest.fn();
globals_1.jest.mock('../services/jobIdempotencyService', () => ({
    jobIdempotencyService: {
        getProcessedJob: (...args) => mockGetProcessedJob(...args),
        markProcessedJob: (...args) => mockMarkProcessedJob(...args),
    },
}));
globals_1.jest.mock('../services/fogService', () => ({
    emitFogFilteredDelta: (...args) => mockEmitFogFilteredDelta(...args),
}));
const mockAddBattleSimulation = globals_1.jest.fn();
const mockGetGameActionQueue = globals_1.jest.fn();
globals_1.jest.mock('../services/queueService', () => ({
    queueService: {
        getGameActionQueue: (...args) => mockGetGameActionQueue(...args),
        addBattleSimulation: (...args) => mockAddBattleSimulation(...args),
    },
}));
const mockGetGameState = globals_1.jest.fn();
const mockProcessPlaceArmies = globals_1.jest.fn();
const mockProcessFortify = globals_1.jest.fn();
const mockProcessEndTurn = globals_1.jest.fn();
const mockProcessPhaseChange = globals_1.jest.fn();
const mockProcessGoBackToReinforcement = globals_1.jest.fn();
const mockProcessGameAction = globals_1.jest.fn();
globals_1.jest.mock('../services/gameService', () => ({
    GameService: globals_1.jest.fn(() => ({
        getGameState: (...args) => mockGetGameState(...args),
        processPlaceArmies: (...args) => mockProcessPlaceArmies(...args),
        processFortify: (...args) => mockProcessFortify(...args),
        processEndTurn: (...args) => mockProcessEndTurn(...args),
        processPhaseChange: (...args) => mockProcessPhaseChange(...args),
        processGoBackToReinforcement: (...args) => mockProcessGoBackToReinforcement(...args),
        processGameAction: (...args) => mockProcessGameAction(...args),
    })),
}));
(0, globals_1.describe)('GameActionWorker', () => {
    let worker;
    let queue;
    let io;
    let roomEmit;
    const buildGameState = (overrides = {}) => ({
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
    });
    const invokeProcess = async (job) => {
        const method = worker;
        return method.processGameAction(job);
    };
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        mockEmitFogFilteredDelta.mockClear();
        roomEmit = globals_1.jest.fn();
        io = {
            to: globals_1.jest.fn(() => ({ emit: roomEmit })),
        };
        queue = {
            name: 'game-actions',
            process: globals_1.jest.fn(),
            on: globals_1.jest.fn(),
        };
        mockGetGameActionQueue.mockReturnValue(queue);
        mockGetProcessedJob.mockResolvedValue({ exists: false });
        worker = new gameActionWorker_js_1.GameActionWorker(io);
    });
    (0, globals_1.it)('processes deploy actions and broadcasts territory delta', async () => {
        mockGetGameState.mockResolvedValue(buildGameState());
        mockProcessPlaceArmies.mockResolvedValue({ armies: 7, playerArmies: 5 });
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
        };
        const result = await invokeProcess(job);
        (0, globals_1.expect)(mockGetGameState).toHaveBeenCalledWith('game-1');
        (0, globals_1.expect)(mockProcessPlaceArmies).toHaveBeenCalledWith('game-1', {
            territoryId: 'north',
            armies: 2,
            playerId: 'player-1',
        });
        const emittedTypes = mockEmitFogFilteredDelta.mock.calls.map(([, roomId, delta]) => {
            (0, globals_1.expect)(roomId).toBe('game-1');
            return delta.type;
        });
        (0, globals_1.expect)(emittedTypes).toContain('PLAYER_UPDATE');
        (0, globals_1.expect)(emittedTypes).toContain('TERRITORY_UPDATE');
        (0, globals_1.expect)(mockMarkProcessedJob).toHaveBeenCalledWith('game-actions', 'job-123', globals_1.expect.objectContaining({ success: true, processed: true }), 60 * 60);
        (0, globals_1.expect)(result).toEqual(globals_1.expect.objectContaining({ success: true, processed: true, delta: globals_1.expect.any(Object) }));
    });
    (0, globals_1.it)('processes attack actions and defers broadcasting when no battle result', async () => {
        mockGetGameState.mockResolvedValue(buildGameState());
        mockProcessGameAction.mockResolvedValue({ lastBattleResult: null });
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
        };
        const result = await invokeProcess(job);
        (0, globals_1.expect)(mockGetGameState).toHaveBeenCalledWith('game-1');
        (0, globals_1.expect)(mockAddBattleSimulation).not.toHaveBeenCalled();
        (0, globals_1.expect)(io.to).not.toHaveBeenCalledWith('game:game-1');
        (0, globals_1.expect)(roomEmit).not.toHaveBeenCalled();
        (0, globals_1.expect)(mockEmitFogFilteredDelta).not.toHaveBeenCalled();
        (0, globals_1.expect)(result).toEqual({ success: true, delta: null, processed: true });
        (0, globals_1.expect)(mockMarkProcessedJob).toHaveBeenCalledWith('game-actions', 'job-attack', globals_1.expect.objectContaining({ success: true, processed: true }), 60 * 60);
    });
    (0, globals_1.it)('processes go back to reinforcement and emits phase change delta', async () => {
        mockGetGameState.mockResolvedValue(buildGameState({ phase: 'attack', hasAttackedThisTurn: false }));
        mockProcessGoBackToReinforcement.mockResolvedValue({
            phase: 'reinforcement',
            currentPlayer: 'player-1',
            turn: 2,
            reinforcementArmies: 6,
        });
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
        };
        const result = await invokeProcess(job);
        (0, globals_1.expect)(mockProcessGoBackToReinforcement).toHaveBeenCalledWith('game-1', 'player-1');
        const emitted = mockEmitFogFilteredDelta.mock.calls.find(([, roomId]) => roomId === 'game-1');
        (0, globals_1.expect)(emitted).toBeDefined();
        const delta = emitted?.[2];
        (0, globals_1.expect)(delta?.type).toBe('PHASE_CHANGE');
        (0, globals_1.expect)(delta?.phase).toBe('reinforcement');
        (0, globals_1.expect)(delta?.reinforcementArmies).toBe(6);
        (0, globals_1.expect)(result).toEqual(globals_1.expect.objectContaining({ success: true, processed: true }));
    });
});
//# sourceMappingURL=gameActionWorker.test.js.map