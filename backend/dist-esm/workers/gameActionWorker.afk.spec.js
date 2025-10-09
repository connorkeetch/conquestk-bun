"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const ioMock = {
    to: globals_1.jest.fn().mockReturnThis(),
    emit: globals_1.jest.fn(),
};
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
globals_1.jest.mock('../services/gameService', () => {
    class GameService {
        async getGameState(roomId) {
            return {
                roomId,
                players: [
                    { id: 'p1', isEliminated: false },
                    { id: 'p2', isEliminated: false },
                ],
                currentPlayer: 'p1',
                phase: 'reinforcement',
                board: [],
                gameConfig: {},
                turn: 1,
            };
        }
        async processEndTurn() {
            return {
                id: 'p2',
            };
        }
    }
    return { GameService };
});
const handleTurnTimeoutMock = globals_1.jest.fn().mockResolvedValue(undefined);
globals_1.jest.mock('../services/gameLifecycleService', () => {
    return {
        GameLifecycleService: class {
            constructor() {
                this.handleTurnTimeout = handleTurnTimeoutMock;
            }
        },
    };
});
const gameActionWorker_js_1 = require("./gameActionWorker.js");
(0, globals_1.describe)('GameActionWorker turn timeout stage', () => {
    (0, globals_1.beforeEach)(() => {
        handleTurnTimeoutMock.mockClear();
    });
    (0, globals_1.it)('invokes handleTurnTimeout on timeout job', async () => {
        const worker = new gameActionWorker_js_1.GameActionWorker(ioMock);
        const result = await worker.processGameAction({
            id: 'job1',
            data: {
                gameId: 'g1',
                playerId: 'p1',
                action: { type: 'end_turn', playerId: 'p1', roomId: 'g1' },
                turnTimeoutStage: 'expire',
            },
        });
        (0, globals_1.expect)(handleTurnTimeoutMock).toHaveBeenCalledWith('g1');
        (0, globals_1.expect)(result.processed).toBe(true);
    });
});
//# sourceMappingURL=gameActionWorker.afk.spec.js.map