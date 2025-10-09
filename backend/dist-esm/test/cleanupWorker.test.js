"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const cleanupWorker_js_1 = require("../workers/cleanupWorker.js");
globals_1.jest.mock('../config/database', () => ({
    query: globals_1.jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    getPool: globals_1.jest.fn(() => ({
        query: globals_1.jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    })),
    getClient: globals_1.jest.fn(async () => ({
        query: globals_1.jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: globals_1.jest.fn(),
    })),
}));
const mockCleanupFinishedGameModifiers = globals_1.jest.fn();
globals_1.jest.mock('../services/territoryModifierService', () => ({
    __esModule: true,
    default: {
        cleanupFinishedGameModifiers: (...args) => mockCleanupFinishedGameModifiers(...args),
    },
}));
const createGameState = () => ({
    roomId: 'room-1',
    currentPlayer: 'player1',
    phase: 'finished',
    turn: 10,
    board: [
        {
            id: 'territory-1',
            name: 'Territory 1',
            continent: 'test-continent',
            ownerId: 'player1',
            armies: 5,
            adjacentTerritories: [],
        },
        {
            id: 'territory-2',
            name: 'Territory 2',
            continent: 'test-continent',
            ownerId: 'player1',
            armies: 3,
            adjacentTerritories: [],
        },
    ],
    players: [
        {
            id: 'player1',
            username: 'Player 1',
            color: '#ff0000',
            armies: 8,
            territories: ['territory-1', 'territory-2'],
            cards: [],
            isEliminated: false,
            teamId: null,
        },
        {
            id: 'player2',
            username: 'Player 2',
            color: '#00ff00',
            armies: 0,
            territories: [],
            cards: [],
            isEliminated: true,
            teamId: null,
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
});
(0, globals_1.describe)('CleanupWorker', () => {
    let mockGameService;
    let mockCacheService;
    let mockIdempotencyService;
    let worker;
    let job;
    const queue = { name: 'game-cleanup' };
    const invokeCleanup = (instance, cleanupJob) => instance.cleanupGame(cleanupJob);
    (0, globals_1.beforeEach)(() => {
        mockCleanupFinishedGameModifiers.mockReset();
        mockGameService = {
            getGameState: globals_1.jest.fn(),
            archiveGameResults: globals_1.jest.fn().mockResolvedValue(undefined),
            updateEloRatings: globals_1.jest.fn().mockResolvedValue(undefined),
            recordGameHistory: globals_1.jest.fn().mockResolvedValue(undefined),
            removeFromActiveGames: globals_1.jest.fn().mockResolvedValue(undefined),
        };
        mockCacheService = {
            deleteGameState: globals_1.jest.fn().mockResolvedValue(undefined),
        };
        mockIdempotencyService = {
            getProcessedJob: globals_1.jest.fn(),
            markProcessedJob: globals_1.jest.fn().mockResolvedValue(undefined),
            clearProcessedJob: globals_1.jest.fn().mockResolvedValue(undefined),
        };
        worker = new cleanupWorker_js_1.CleanupWorker({
            gameService: mockGameService,
            cacheService: mockCacheService,
            queue,
            idempotencyService: mockIdempotencyService,
        });
        job = {
            id: 'job-1',
            data: {
                gameId: 'game-1',
                reason: 'finished',
                idempotencyKey: 'cleanup-job-1',
            },
        };
    });
    (0, globals_1.it)('cleans up finished games and removes territory modifiers', async () => {
        const gameState = {
            ...createGameState(),
            isRanked: true,
            winner: 'player1',
            startTime: Date.now() - 1000,
        };
        mockIdempotencyService.getProcessedJob.mockResolvedValueOnce({ exists: false });
        mockGameService.getGameState.mockResolvedValueOnce(gameState);
        mockCleanupFinishedGameModifiers.mockResolvedValueOnce(undefined);
        const result = await invokeCleanup(worker, job);
        (0, globals_1.expect)(result).toMatchObject({ success: true, reason: 'finished' });
        (0, globals_1.expect)(mockGameService.archiveGameResults).toHaveBeenCalledWith('game-1', globals_1.expect.objectContaining({ endReason: 'finished', winner: 'player1' }));
        (0, globals_1.expect)(mockGameService.updateEloRatings).toHaveBeenCalledWith('game-1', globals_1.expect.objectContaining({}));
        (0, globals_1.expect)(mockGameService.recordGameHistory).toHaveBeenCalledWith('game-1', globals_1.expect.objectContaining({}));
        (0, globals_1.expect)(mockCacheService.deleteGameState).toHaveBeenCalledWith('game-1');
        (0, globals_1.expect)(mockGameService.removeFromActiveGames).toHaveBeenCalledWith('game-1');
        (0, globals_1.expect)(mockCleanupFinishedGameModifiers).toHaveBeenCalledWith(['game-1']);
        (0, globals_1.expect)(mockIdempotencyService.markProcessedJob).toHaveBeenCalledWith('game-cleanup', 'cleanup-job-1', globals_1.expect.objectContaining({ success: true, reason: 'finished' }), 24 * 60 * 60);
    });
    (0, globals_1.it)('skips work for jobs that already completed successfully', async () => {
        const cachedResult = { success: true, reason: 'finished', cleanedAt: new Date().toISOString() };
        mockIdempotencyService.getProcessedJob.mockResolvedValueOnce({
            exists: true,
            value: cachedResult,
        });
        const result = await invokeCleanup(worker, job);
        (0, globals_1.expect)(result).toBe(cachedResult);
        (0, globals_1.expect)(mockGameService.getGameState).not.toHaveBeenCalled();
        (0, globals_1.expect)(mockGameService.archiveGameResults).not.toHaveBeenCalled();
        (0, globals_1.expect)(mockCleanupFinishedGameModifiers).not.toHaveBeenCalled();
        (0, globals_1.expect)(mockIdempotencyService.markProcessedJob).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=cleanupWorker.test.js.map