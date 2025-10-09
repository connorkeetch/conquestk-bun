"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const gameRoomService_js_1 = require("../services/gameRoomService.js");
const mockQuery = globals_1.jest.fn();
const mockClientQuery = globals_1.jest.fn();
const mockClientRelease = globals_1.jest.fn();
const mockGetClient = globals_1.jest.fn();
globals_1.jest.mock('../config/database', () => ({
    query: (...args) => mockQuery(...args),
    getClient: () => mockGetClient(),
}));
(0, globals_1.describe)('GameRoomService.updateAiOpponents', () => {
    const service = new gameRoomService_js_1.GameRoomService();
    (0, globals_1.beforeEach)(() => {
        mockQuery.mockReset();
        mockClientQuery.mockReset();
        mockClientRelease.mockReset();
        mockGetClient.mockReset();
        mockGetClient.mockResolvedValue({
            query: mockClientQuery,
            release: mockClientRelease,
        });
    });
    (0, globals_1.it)('adds AI opponents when capacity permits', async () => {
        const createdAt = new Date('2024-01-01T00:00:00Z');
        const playersSelectRows = [
            {
                id: 'slot-host',
                user_id: 'host-1',
                ai_player_id: null,
                is_ai: false,
                ai_difficulty: null,
                ai_personality_seed: null,
            },
        ];
        mockClientQuery
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValueOnce({
            rows: [
                {
                    host_id: 'host-1',
                    status: 'lobby',
                    max_players: 4,
                    is_ranked: false,
                },
            ],
            rowCount: 1,
        })
            .mockResolvedValueOnce({ rows: playersSelectRows, rowCount: playersSelectRows.length })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });
        mockQuery
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValueOnce({
            rows: [
                {
                    id: 'room-1',
                    name: 'AI Test Lobby',
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
                    players: [
                        {
                            id: 'slot-host',
                            userId: 'host-1',
                            aiPlayerId: null,
                            username: 'Host',
                            skill_rating: null,
                            current_tier: null,
                            joinedAt: createdAt.toISOString(),
                            isReady: true,
                            readyAt: createdAt.toISOString(),
                            teamId: null,
                            isAi: false,
                            aiDifficulty: null,
                            aiPersonalitySeed: null,
                        },
                        {
                            id: 'slot-ai-1',
                            userId: null,
                            aiPlayerId: 'ai-1',
                            username: 'AI Recruit',
                            skill_rating: null,
                            current_tier: null,
                            joinedAt: createdAt.toISOString(),
                            isReady: true,
                            readyAt: createdAt.toISOString(),
                            teamId: null,
                            isAi: true,
                            aiDifficulty: 'recruit',
                            aiPersonalitySeed: 123,
                        },
                        {
                            id: 'slot-ai-2',
                            userId: null,
                            aiPlayerId: 'ai-2',
                            username: 'AI Commander',
                            skill_rating: null,
                            current_tier: null,
                            joinedAt: createdAt.toISOString(),
                            isReady: true,
                            readyAt: createdAt.toISOString(),
                            teamId: null,
                            isAi: true,
                            aiDifficulty: 'commander',
                            aiPersonalitySeed: 456,
                        },
                    ],
                },
            ],
            rowCount: 1,
        });
        const room = await service.updateAiOpponents('room-1', 'host-1', [
            { difficulty: 'recruit', personalitySeed: 123 },
            { difficulty: 'commander', personalitySeed: 456 },
        ]);
        (0, globals_1.expect)(mockClientQuery).toHaveBeenCalledWith('BEGIN');
        const insertCalls = mockClientQuery.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO room_players'));
        (0, globals_1.expect)(insertCalls).toHaveLength(2);
        (0, globals_1.expect)(mockClientQuery).toHaveBeenCalledWith('COMMIT');
        (0, globals_1.expect)(mockClientRelease).toHaveBeenCalled();
        (0, globals_1.expect)(mockQuery).toHaveBeenCalledTimes(3);
        (0, globals_1.expect)(room.players?.filter((player) => player.isAi).length).toBe(2);
    });
    (0, globals_1.it)('throws when requested AI seats exceed capacity', async () => {
        mockClientQuery
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValueOnce({
            rows: [
                {
                    host_id: 'host-1',
                    status: 'lobby',
                    max_players: 2,
                    is_ranked: false,
                },
            ],
            rowCount: 1,
        })
            .mockResolvedValueOnce({
            rows: [
                {
                    id: 'slot-host',
                    user_id: 'host-1',
                    ai_player_id: null,
                    is_ai: false,
                    ai_difficulty: null,
                    ai_personality_seed: null,
                },
                {
                    id: 'slot-other',
                    user_id: 'user-2',
                    ai_player_id: null,
                    is_ai: false,
                    ai_difficulty: null,
                    ai_personality_seed: null,
                },
            ],
            rowCount: 2,
        })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });
        await (0, globals_1.expect)(service.updateAiOpponents('room-2', 'host-1', [{ difficulty: 'recruit' }])).rejects.toThrow('Not enough open seats for the requested AI opponents');
        (0, globals_1.expect)(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
        (0, globals_1.expect)(mockClientRelease).toHaveBeenCalled();
        (0, globals_1.expect)(mockQuery).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=gameRoomServiceUpdateAi.test.js.map