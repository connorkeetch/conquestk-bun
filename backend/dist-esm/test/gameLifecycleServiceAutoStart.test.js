"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const gameLifecycleService_js_1 = require("../services/gameLifecycleService.js");
const mockAcquireLock = globals_1.jest.fn();
const mockReleaseLock = globals_1.jest.fn();
const mockDbQuery = globals_1.jest.fn();
const mockClientQuery = globals_1.jest.fn();
const mockClientRelease = globals_1.jest.fn();
const mockClient = {
    query: (...args) => mockClientQuery(...args),
    release: (...args) => mockClientRelease(...args),
};
const mockGetClient = globals_1.jest.fn().mockResolvedValue(mockClient);
globals_1.jest.mock('../config/redis', () => ({
    acquireLock: (...args) => mockAcquireLock(...args),
    releaseLock: (...args) => mockReleaseLock(...args),
}));
globals_1.jest.mock('../config/database', () => ({
    getClient: (...args) => mockGetClient(...args),
    query: (...args) => mockDbQuery(...args),
}));
globals_1.jest.mock('../services/gameRoomService', () => ({
    GameRoomService: globals_1.jest.fn(() => ({})),
}));
globals_1.jest.mock('../services/gameService', () => ({
    GameService: globals_1.jest.fn(() => ({})),
}));
globals_1.jest.mock('../services/queueService', () => ({
    queueService: {},
}));
globals_1.jest.mock('../services/capitalGameService', () => ({
    __esModule: true,
    default: {
        initializeCapitals: globals_1.jest.fn(),
    },
}));
globals_1.jest.mock('../services/socketRegistry', () => ({
    tryGetSocketServer: globals_1.jest.fn(() => null),
}));
globals_1.jest.mock('../services/mapService', () => ({
    mapService: {
        validateMapPlayable: globals_1.jest.fn(async () => ({ isValid: true })),
    },
}));
(0, globals_1.describe)('GameLifecycleService.maybeAutoStart', () => {
    const service = new gameLifecycleService_js_1.GameLifecycleService();
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.restoreAllMocks();
        mockAcquireLock.mockClear();
        mockReleaseLock.mockClear();
        mockDbQuery.mockClear();
        mockAcquireLock.mockResolvedValue('lock-token');
        mockReleaseLock.mockResolvedValue();
        mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockClientQuery.mockReset();
        mockClientRelease.mockReset();
        mockGetClient.mockClear();
        mockGetClient.mockResolvedValue(mockClient);
    });
    const createSnapshot = () => ({
        room: {
            id: 'room-123',
            status: 'initializing',
            lifecyclePhase: 'initializing',
            turnNumber: 0,
            currentTurnUserId: null,
            turnExpiresAt: null,
            readyCheckStartedAt: null,
            timeBankSecondsRemaining: null,
            usingTimeBank: false,
            replacementPendingUserId: null,
            players: [],
        },
        readyStates: [],
        triggeredStart: false,
    });
    (0, globals_1.it)('auto-starts the game when the lobby is full and broadcasts the update', async () => {
        const playerRows = [
            {
                id: 'slot-1',
                user_id: 'user-1',
                ai_player_id: null,
                is_ready: true,
                ready_at: new Date('2024-01-01T00:00:00Z'),
                joined_at: new Date('2024-01-01T00:00:00Z'),
                team_id: null,
                is_ai: false,
                ai_difficulty: null,
                ai_personality_seed: null,
                selected_color: '#DC2626',
            },
            {
                id: 'slot-2',
                user_id: 'user-2',
                ai_player_id: null,
                is_ready: true,
                ready_at: new Date('2024-01-01T00:01:00Z'),
                joined_at: new Date('2024-01-01T00:01:00Z'),
                team_id: null,
                is_ai: false,
                ai_difficulty: null,
                ai_personality_seed: null,
                selected_color: '#851D2D',
            },
            {
                id: 'slot-3',
                user_id: 'user-3',
                ai_player_id: null,
                is_ready: true,
                ready_at: new Date('2024-01-01T00:02:00Z'),
                joined_at: new Date('2024-01-01T00:02:00Z'),
                team_id: null,
                is_ai: false,
                ai_difficulty: null,
                ai_personality_seed: null,
                selected_color: '#EC4899',
            },
        ];
        mockClientQuery.mockImplementation(async (sql) => {
            if (typeof sql !== 'string') {
                return { rows: [], rowCount: 0 };
            }
            if (sql.startsWith('BEGIN')) {
                return { rows: [], rowCount: 0 };
            }
            if (sql.includes('SELECT status')) {
                return {
                    rows: [
                        {
                            status: 'lobby',
                            turn_timer: 45,
                            max_players: 3,
                            map_id: 'map-123',
                        },
                    ],
                    rowCount: 1,
                };
            }
            if (sql.includes('FROM room_players')) {
                return { rows: playerRows, rowCount: playerRows.length };
            }
            if (sql.includes('UPDATE game_rooms')) {
                return { rows: [], rowCount: 1 };
            }
            if (sql.startsWith('COMMIT')) {
                return { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 0 };
        });
        const snapshot = createSnapshot();
        const startGameSpy = globals_1.jest
            .spyOn(service, 'startGame')
            .mockResolvedValue();
        const snapshotSpy = globals_1.jest
            .spyOn(service, 'getLifecycleSnapshot')
            .mockResolvedValue(snapshot);
        const broadcastSpy = globals_1.jest
            .spyOn(service, 'broadcastLifecycle')
            .mockResolvedValue();
        const result = await service.maybeAutoStart('room-123');
        (0, globals_1.expect)(result).toBe(true);
        (0, globals_1.expect)(mockAcquireLock).toHaveBeenCalledWith('lock:game:ready:room-123', 5000);
        (0, globals_1.expect)(mockClientQuery).toHaveBeenCalledWith('BEGIN');
        (0, globals_1.expect)(startGameSpy).toHaveBeenCalledWith('room-123', playerRows, 45);
        (0, globals_1.expect)(snapshotSpy).toHaveBeenCalledWith('room-123');
        (0, globals_1.expect)(snapshot.triggeredStart).toBe(true);
        (0, globals_1.expect)(broadcastSpy).toHaveBeenCalledWith(snapshot);
        (0, globals_1.expect)(mockReleaseLock).toHaveBeenCalledWith('lock:game:ready:room-123', 'lock-token');
        (0, globals_1.expect)(mockClientRelease).toHaveBeenCalled();
    });
    (0, globals_1.it)('does not start the game when the lobby is not yet full', async () => {
        const playerRows = [
            {
                id: 'slot-1',
                user_id: 'user-1',
                ai_player_id: null,
                is_ready: true,
                ready_at: new Date('2024-01-01T00:00:00Z'),
                joined_at: new Date('2024-01-01T00:00:00Z'),
                team_id: null,
                is_ai: false,
                ai_difficulty: null,
                ai_personality_seed: null,
                selected_color: '#DC2626',
            },
            {
                id: 'slot-2',
                user_id: 'user-2',
                ai_player_id: null,
                is_ready: true,
                ready_at: new Date('2024-01-01T00:01:00Z'),
                joined_at: new Date('2024-01-01T00:01:00Z'),
                team_id: null,
                is_ai: false,
                ai_difficulty: null,
                ai_personality_seed: null,
                selected_color: '#851D2D',
            },
        ];
        mockClientQuery.mockImplementation(async (sql) => {
            if (typeof sql !== 'string') {
                return { rows: [], rowCount: 0 };
            }
            if (sql.startsWith('BEGIN')) {
                return { rows: [], rowCount: 0 };
            }
            if (sql.includes('SELECT status')) {
                return {
                    rows: [
                        {
                            status: 'lobby',
                            turn_timer: 60,
                            max_players: 4,
                            map_id: 'map-123',
                        },
                    ],
                    rowCount: 1,
                };
            }
            if (sql.includes('FROM room_players')) {
                return { rows: playerRows, rowCount: playerRows.length };
            }
            if (sql.startsWith('COMMIT')) {
                return { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 0 };
        });
        const startGameSpy = globals_1.jest
            .spyOn(service, 'startGame')
            .mockResolvedValue();
        const broadcastSpy = globals_1.jest
            .spyOn(service, 'broadcastLifecycle')
            .mockResolvedValue();
        const result = await service.maybeAutoStart('room-456');
        (0, globals_1.expect)(result).toBe(false);
        (0, globals_1.expect)(startGameSpy).not.toHaveBeenCalled();
        (0, globals_1.expect)(broadcastSpy).not.toHaveBeenCalled();
        (0, globals_1.expect)(mockReleaseLock).toHaveBeenCalledWith('lock:game:ready:room-456', 'lock-token');
    });
});
//# sourceMappingURL=gameLifecycleServiceAutoStart.test.js.map