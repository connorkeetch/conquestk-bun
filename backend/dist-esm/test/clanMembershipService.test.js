"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const clanActivityService_js_1 = require("../services/clanActivityService.js");
const clanMembershipService_1 = require("../services/clanMembershipService");
const mockQuery = globals_1.jest.fn();
const mockTransaction = globals_1.jest.fn();
globals_1.jest.mock('../config/database', () => ({
    query: (...args) => mockQuery(...args),
    transaction: (...args) => mockTransaction(...args),
}));
globals_1.jest.mock('../services/clanActivityService', () => ({
    logClanActivity: globals_1.jest.fn().mockResolvedValue(undefined),
}));
(0, globals_1.describe)('ClanMembershipService', () => {
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        mockQuery.mockReset();
        mockTransaction.mockReset();
        clanActivityService_js_1.logClanActivity.mockReset();
    });
    (0, globals_1.describe)('applyToClan', () => {
        (0, globals_1.it)('creates a pending application when user is eligible', async () => {
            const mockClient = {
                query: globals_1.jest.fn(),
            };
            mockTransaction.mockImplementation(async (callback) => {
                return callback(mockClient);
            });
            const createdAt = new Date().toISOString();
            mockClient.query
                .mockResolvedValueOnce({
                rows: [{ recruitment_status: 'active', recruitment_policy: 'application' }],
            })
                .mockResolvedValueOnce({ rowCount: 0, rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'application-1',
                        clan_id: 'clan-1',
                        user_id: 'user-2',
                        status: 'pending',
                        message: 'Let me in',
                        created_at: createdAt,
                        updated_at: createdAt,
                    },
                ],
            });
            const application = await clanMembershipService_1.clanMembershipService.applyToClan('user-2', 'clan-1', 'Let me in');
            (0, globals_1.expect)(mockTransaction).toHaveBeenCalledTimes(1);
            (0, globals_1.expect)(application.status).toBe('pending');
            (0, globals_1.expect)(clanActivityService_js_1.logClanActivity).toHaveBeenCalledWith(globals_1.expect.objectContaining({ actionType: 'application_submitted' }));
        });
        (0, globals_1.it)('throws when clan is closed to recruitment', async () => {
            const mockClient = {
                query: globals_1.jest.fn(),
            };
            mockTransaction.mockImplementation(async (callback) => {
                return callback(mockClient);
            });
            mockClient.query.mockResolvedValueOnce({
                rows: [{ recruitment_status: 'closed', recruitment_policy: 'application' }],
            });
            await (0, globals_1.expect)(clanMembershipService_1.clanMembershipService.applyToClan('user-3', 'clan-2')).rejects.toThrow(clanMembershipService_1.ClanMembershipServiceError);
        });
    });
    (0, globals_1.describe)('reviewApplication', () => {
        (0, globals_1.it)('approves an application and activates membership', async () => {
            const mockClient = {
                query: globals_1.jest.fn(),
            };
            mockTransaction.mockImplementation(async (callback) => {
                return callback(mockClient);
            });
            const timestamp = new Date().toISOString();
            mockClient.query
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'application-1',
                        clan_id: 'clan-1',
                        user_id: 'user-5',
                        status: 'pending',
                        message: null,
                        created_at: timestamp,
                        updated_at: timestamp,
                    },
                ],
            })
                .mockResolvedValueOnce({
                rows: [
                    {
                        status: 'active',
                        permissions: { manage_applications: true },
                        clan_id: 'clan-1',
                    },
                ],
            })
                .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'application-1',
                        clan_id: 'clan-1',
                        user_id: 'user-5',
                        status: 'accepted',
                        created_at: timestamp,
                        updated_at: timestamp,
                    },
                ],
            })
                .mockResolvedValueOnce({ rows: [{ id: 'role-member' }] })
                .mockResolvedValueOnce({ rows: [] });
            const result = await clanMembershipService_1.clanMembershipService.reviewApplication('reviewer-1', 'clan-1', 'application-1', 'accepted');
            (0, globals_1.expect)(result.status).toBe('accepted');
            (0, globals_1.expect)(clanActivityService_js_1.logClanActivity).toHaveBeenCalledWith(globals_1.expect.objectContaining({ actionType: 'member_joined', clanId: 'clan-1' }));
        });
    });
});
//# sourceMappingURL=clanMembershipService.test.js.map