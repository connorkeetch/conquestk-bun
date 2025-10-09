"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const ioMock = {
    to: globals_1.jest.fn().mockReturnThis(),
    emit: globals_1.jest.fn(),
};
globals_1.jest.mock('../services/cacheService', () => ({
    gameStateCache: {
        getGameState: globals_1.jest.fn().mockResolvedValue({ roomId: 'g1', currentPlayer: 'p2', turn: 2 }),
    },
}));
globals_1.jest.mock('../services/queueService', () => {
    const fakeQueue = {
        name: 'game-actions',
        process: globals_1.jest.fn(),
        on: globals_1.jest.fn(),
    };
    return {
        queueService: {
            getGameActionQueue: () => fakeQueue,
        },
    };
});
globals_1.jest.mock('../services/jobIdempotencyService', () => ({
    jobIdempotencyService: {
        getProcessedJob: globals_1.jest.fn().mockResolvedValue({ exists: false }),
        markProcessedJob: globals_1.jest.fn().mockResolvedValue(undefined),
    },
}));
const scheduleTurnTimeoutMock = globals_1.jest.fn().mockResolvedValue(undefined);
const scheduleAiTurnMock = globals_1.jest.fn().mockResolvedValue(undefined);
globals_1.jest.mock('../services/gameLifecycleService', () => ({
    GameLifecycleService: class {
        constructor() {
            this.scheduleTurnTimeout = scheduleTurnTimeoutMock;
            this.scheduleAiTurn = scheduleAiTurnMock;
        }
    },
}));
globals_1.jest.mock('../services/aiDecisionService', () => ({
    aiDecisionService: {
        chooseAction: globals_1.jest.fn().mockResolvedValue({
            actions: [{ type: 'end_turn', roomId: 'g1', playerId: 'p1' }],
            usedFallback: false,
            diagnostics: {
                generatedAt: new Date().toISOString(),
                durationMs: 5,
                requestedDifficulty: 'recruit',
                plannedActionCount: 1,
                budget: { maxThinkTimeMs: 1000 },
            },
        }),
        buildFallbackPlan: globals_1.jest
            .fn()
            .mockReturnValue([{ type: 'end_turn', roomId: 'g1', playerId: 'p1' }]),
    },
}));
const executeAiTurnMock = globals_1.jest.fn().mockResolvedValue({ gameState: { roomId: 'g1' } });
const processGameActionMock = globals_1.jest.fn().mockResolvedValue({ roomId: 'g1' });
const getGameStateMock = globals_1.jest.fn().mockResolvedValue({
    roomId: 'g1',
    players: [
        { id: 'p1', isAi: true, aiDifficulty: 'recruit' },
        { id: 'p2', isAi: false },
    ],
    currentPlayer: 'p1',
    phase: 'reinforcement',
    board: [],
    gameConfig: {},
    turn: 1,
});
globals_1.jest.mock('../services/gameService', () => {
    return {
        GameService: class {
            constructor() {
                this.executeAiTurn = executeAiTurnMock;
                this.processGameAction = processGameActionMock;
                this.getGameState = getGameStateMock;
            }
        },
    };
});
const gameActionWorker_js_1 = require("./gameActionWorker.js");
(0, globals_1.describe)('AI turn worker job', () => {
    (0, globals_1.beforeEach)(() => {
        executeAiTurnMock.mockClear();
        getGameStateMock.mockClear();
        scheduleTurnTimeoutMock.mockClear();
        scheduleAiTurnMock.mockClear();
    });
    (0, globals_1.it)('streams AI actions and schedules follow-ups', async () => {
        process.env.AI_STREAM_ACTIONS = 'true';
        process.env.AI_READABLE_DELAY_MS = '1';
        const worker = new gameActionWorker_js_1.GameActionWorker(ioMock);
        const result = await worker.processAiTurn({
            id: 'job-ai-1',
            data: { gameId: 'g1', playerId: 'p1', turnNumber: 1 },
        });
        (0, globals_1.expect)(getGameStateMock).toHaveBeenCalled();
        (0, globals_1.expect)(scheduleTurnTimeoutMock).toHaveBeenCalledWith('g1');
        (0, globals_1.expect)(scheduleAiTurnMock).toHaveBeenCalledWith('g1');
        (0, globals_1.expect)(result.processed).toBe(true);
    });
});
//# sourceMappingURL=aiTurnWorker.spec.js.map