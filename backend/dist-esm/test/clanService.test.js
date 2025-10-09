"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const clanActivityService_js_1 = require("../services/clanActivityService.js");
const clanService_js_1 = require("../services/clanService.js");
const mockQuery = globals_1.jest.fn();
const mockTransaction = globals_1.jest.fn();
const mockGetProgressionSummary = globals_1.jest.fn();
const mockEnsureWeeklyObjectives = globals_1.jest.fn();
globals_1.jest.mock('../config/database', () => ({
    query: (...args) => mockQuery(...args),
    transaction: (...args) => mockTransaction(...args),
}));
globals_1.jest.mock('../services/clanActivityService', () => ({
    logClanActivity: globals_1.jest.fn().mockResolvedValue(undefined),
}));
globals_1.jest.mock('../services/clanProgressionService', () => ({
    clanProgressionService: {
        getProgressionSummary: (...args) => mockGetProgressionSummary(...args),
        ensureWeeklyObjectives: (...args) => mockEnsureWeeklyObjectives(...args),
    },
}));
(0, globals_1.describe)('ClanService', () => {
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        mockQuery.mockReset();
        mockTransaction.mockReset();
        clanActivityService_js_1.logClanActivity.mockReset();
        mockGetProgressionSummary.mockReset();
        mockEnsureWeeklyObjectives.mockReset();
    });
    (0, globals_1.describe)('createClan', () => {
        (0, globals_1.it)('creates a clan with default roles and returns hydrated details', async () => {
            const clanId = 'clan-123';
            const ownerId = 'user-1';
            const mockClient = {
                query: globals_1.jest.fn(),
            };
            mockTransaction.mockImplementation(async (callback) => {
                return callback(mockClient);
            });
            mockClient.query
                .mockResolvedValueOnce({ rowCount: 0, rows: [] })
                .mockResolvedValueOnce({ rowCount: 0, rows: [] })
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: clanId,
                        owner_user_id: ownerId,
                        name: 'Test Clan',
                        tag: 'TC',
                        slug: 'test-clan',
                        recruitment_policy: 'application',
                        recruitment_status: 'active',
                        auto_accept_thresholds: {},
                        privacy: 'public',
                        total_xp: 0,
                        level: 1,
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
            })
                .mockResolvedValueOnce({ rows: [{ id: 'role-leader' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'role-officer' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'role-member' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'role-recruit' }] })
                .mockResolvedValueOnce({ rows: [] });
            const progression = {
                clanId,
                totalXp: 0,
                level: 1,
                currentLevelXp: 0,
                nextLevelXp: 1000,
                xpIntoLevel: 0,
                xpToNextLevel: 1000,
                progressPercent: 0,
            };
            mockGetProgressionSummary.mockResolvedValue(progression);
            mockEnsureWeeklyObjectives.mockResolvedValue([]);
            const createdAt = new Date().toISOString();
            mockQuery
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: clanId,
                        owner_user_id: ownerId,
                        name: 'Test Clan',
                        tag: 'TC',
                        slug: 'test-clan',
                        recruitment_policy: 'application',
                        recruitment_status: 'active',
                        auto_accept_thresholds: {},
                        privacy: 'public',
                        total_xp: 0,
                        level: 1,
                        created_at: createdAt,
                        updated_at: createdAt,
                        member_count: 1,
                        owner_username: 'Commander',
                    },
                ],
            })
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'member-1',
                        clan_id: clanId,
                        user_id: ownerId,
                        role_id: 'role-leader',
                        status: 'active',
                        joined_at: createdAt,
                        contribution_xp: 0,
                        contribution_matches: 0,
                        username: 'Commander',
                        avatar_url: null,
                        role_name: 'Leader',
                        hierarchy_rank: 100,
                    },
                ],
            })
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'announcement-1',
                        clan_id: clanId,
                        author_user_id: ownerId,
                        title: 'Welcome',
                        body_markdown: 'Hello world',
                        pinned: false,
                        created_at: createdAt,
                        updated_at: createdAt,
                        expires_at: null,
                    },
                ],
            })
                .mockResolvedValueOnce({ rows: [] });
            const result = await clanService_js_1.clanService.createClan(ownerId, { name: 'Test Clan', tag: 'tc' });
            (0, globals_1.expect)(mockTransaction).toHaveBeenCalledTimes(1);
            (0, globals_1.expect)(mockClient.query).toHaveBeenCalled();
            (0, globals_1.expect)(clanActivityService_js_1.logClanActivity).toHaveBeenCalledWith(globals_1.expect.objectContaining({ clanId, actorUserId: ownerId, actionType: 'clan_created' }));
            (0, globals_1.expect)(mockGetProgressionSummary).toHaveBeenCalledWith(clanId);
            (0, globals_1.expect)(mockEnsureWeeklyObjectives).toHaveBeenCalledWith(clanId);
            (0, globals_1.expect)(result.slug).toBe('test-clan');
            (0, globals_1.expect)(result.members).toHaveLength(1);
            (0, globals_1.expect)(result.recentAnnouncements[0].title).toBe('Welcome');
            (0, globals_1.expect)(result.progression).toEqual(progression);
            (0, globals_1.expect)(result.activeObjectives).toEqual([]);
            (0, globals_1.expect)(result.recentActivity).toEqual([]);
        });
    });
    (0, globals_1.describe)('listClans', () => {
        (0, globals_1.it)('returns clans with pagination cursor', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    {
                        id: 'clan-a',
                        owner_user_id: 'user-1',
                        name: 'Alpha',
                        tag: 'ALP',
                        slug: 'alpha',
                        recruitment_policy: 'open',
                        recruitment_status: 'active',
                        auto_accept_thresholds: {},
                        privacy: 'public',
                        total_xp: 100,
                        level: 2,
                        created_at: '2025-09-25T00:00:00.000Z',
                        updated_at: '2025-09-25T00:00:00.000Z',
                        member_count: 5,
                    },
                ],
            });
            const result = await clanService_js_1.clanService.listClans({ limit: 10 });
            (0, globals_1.expect)(mockQuery).toHaveBeenCalled();
            (0, globals_1.expect)(result.clans[0].name).toBe('Alpha');
        });
    });
    (0, globals_1.describe)('getActiveMembershipsForUsers', () => {
        (0, globals_1.it)('returns a map of active memberships keyed by user id', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    {
                        user_id: 'user-1',
                        clan_id: 'clan-1',
                        clan_slug: 'clan-one',
                        clan_name: 'Clan One',
                        status: 'active',
                        role_name: 'Member',
                    },
                    {
                        user_id: 'user-2',
                        clan_id: 'clan-2',
                        clan_slug: 'clan-two',
                        clan_name: 'Clan Two',
                        status: 'active',
                        role_name: null,
                    },
                ],
            });
            const map = await clanService_js_1.clanService.getActiveMembershipsForUsers([
                'user-1',
                'user-2',
                'user-1',
                '',
                '   ',
            ]);
            (0, globals_1.expect)(mockQuery).toHaveBeenCalledWith(globals_1.expect.stringContaining('FROM clan_members m'), [
                globals_1.expect.arrayContaining(['user-1', 'user-2']),
            ]);
            (0, globals_1.expect)(map.size).toBe(2);
            (0, globals_1.expect)(map.get('user-1')).toEqual({
                clanId: 'clan-1',
                clanSlug: 'clan-one',
                clanName: 'Clan One',
                roleName: 'Member',
                status: 'active',
            });
            (0, globals_1.expect)(map.get('user-2')).toEqual({
                clanId: 'clan-2',
                clanSlug: 'clan-two',
                clanName: 'Clan Two',
                roleName: null,
                status: 'active',
            });
        });
        (0, globals_1.it)('returns an empty map when no valid user ids provided', async () => {
            const map = await clanService_js_1.clanService.getActiveMembershipsForUsers(['', '   ']);
            (0, globals_1.expect)(mockQuery).not.toHaveBeenCalled();
            (0, globals_1.expect)(map.size).toBe(0);
        });
    });
});
//# sourceMappingURL=clanService.test.js.map