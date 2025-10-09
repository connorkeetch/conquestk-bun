"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const gameRoomService_js_1 = require("../services/gameRoomService.js");
const mockQuery = globals_1.jest.fn();
globals_1.jest.mock('../config/database', () => ({
    query: (...args) => mockQuery(...args),
    transaction: globals_1.jest.fn(async (fn) => {
        return fn({ query: mockQuery });
    }),
    getClient: globals_1.jest.fn(),
}));
(0, globals_1.describe)('GameRoomService.ensureAiReadyStates', () => {
    const service = new gameRoomService_js_1.GameRoomService();
    (0, globals_1.beforeEach)(() => {
        mockQuery.mockReset();
    });
    (0, globals_1.it)('updates AI slots to ready before hydrating room data', async () => {
        const createdAt = new Date('2024-01-04T00:00:00Z');
        const joinedAt = new Date('2024-01-04T00:10:00Z');
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        mockQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'room-99',
                    name: 'AI Lounge',
                    host_id: 'host-1',
                    max_players: 4,
                    is_private: false,
                    status: 'lobby',
                    created_at: createdAt,
                    updated_at: null,
                    map_id: null,
                    game_mode: 'classic',
                    team_mode: false,
                    number_of_teams: null,
                    is_ranked: false,
                    turn_number: 0,
                    turn_expires_at: null,
                    ready_check_started_at: null,
                    current_turn_user_id: null,
                    winner: null,
                    playercount: 1,
                    players: [
                        {
                            id: 'slot-ai',
                            userId: null,
                            aiPlayerId: 'ai-123',
                            username: 'AI Recruit',
                            skill_rating: null,
                            current_tier: null,
                            joinedAt,
                            isReady: true,
                            readyAt: joinedAt,
                            teamId: null,
                            isAi: true,
                            aiDifficulty: 'recruit',
                            aiPersonalitySeed: 771,
                        },
                    ],
                },
            ],
            rowCount: 1,
        });
        const room = await service.getRoomById('room-99');
        (0, globals_1.expect)(mockQuery).toHaveBeenNthCalledWith(1, globals_1.expect.stringContaining('UPDATE room_players'), [
            'room-99',
        ]);
        (0, globals_1.expect)(mockQuery).toHaveBeenNthCalledWith(2, globals_1.expect.stringContaining('SELECT gr.*'), [
            'room-99',
        ]);
        (0, globals_1.expect)(room?.players?.[0]).toMatchObject({
            id: 'slot-ai',
            isAi: true,
            isReady: true,
            aiDifficulty: 'recruit',
        });
    });
});
//# sourceMappingURL=gameRoomServiceReady.test.js.map