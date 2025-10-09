"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://tester:tester@localhost:5432/risk_game_test';
const globals_1 = require("@jest/globals");
globals_1.jest.mock('../config/database', () => {
    const queryMock = globals_1.jest.fn();
    return {
        __esModule: true,
        query: queryMock,
    };
});
globals_1.jest.mock('../services/userBlockService', () => {
    return {
        __esModule: true,
        isBlocked: globals_1.jest.fn(),
    };
});
const databaseModule = require('../config/database');
const userBlockModule = require('../services/userBlockService');
const { assertCanStartDirectConversation, assertCanInviteToGroup, assertCanSendDirectMessage } = require('../services/messagingPolicyService');
(0, globals_1.describe)('messagingPolicyService', () => {
    (0, globals_1.beforeEach)(() => {
        databaseModule.query.mockReset();
        userBlockModule.isBlocked.mockReset();
    });
    (0, globals_1.it)('allows direct messages when policy is everyone and users are not blocked', async () => {
        userBlockModule.isBlocked.mockResolvedValue(false);
        databaseModule.query.mockResolvedValue({
            rows: [
                {
                    dm_policy: 'everyone',
                    allow_group_invites: true,
                    show_online_status: true,
                },
            ],
            rowCount: 1,
        });
        await (0, globals_1.expect)(assertCanStartDirectConversation('sender', 'recipient')).resolves.toBeUndefined();
    });
    (0, globals_1.it)('rejects direct messages when users are blocked', async () => {
        userBlockModule.isBlocked.mockResolvedValue(true);
        await (0, globals_1.expect)(assertCanStartDirectConversation('sender', 'recipient')).rejects.toMatchObject({
            code: 'BLOCKED',
        });
    });
    (0, globals_1.it)('respects dm_policy = no_one', async () => {
        userBlockModule.isBlocked.mockResolvedValue(false);
        databaseModule.query.mockResolvedValue({
            rows: [
                {
                    dm_policy: 'no_one',
                    allow_group_invites: true,
                    show_online_status: true,
                },
            ],
            rowCount: 1,
        });
        await (0, globals_1.expect)(assertCanSendDirectMessage('user-a', 'user-b')).rejects.toMatchObject({
            code: 'DM_POLICY',
        });
    });
    (0, globals_1.it)('requires friendship when dm_policy = friends_only', async () => {
        userBlockModule.isBlocked.mockResolvedValue(false);
        databaseModule.query
            .mockResolvedValueOnce({
            rows: [
                {
                    dm_policy: 'friends_only',
                    allow_group_invites: true,
                    show_online_status: true,
                },
            ],
            rowCount: 1,
        })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });
        await (0, globals_1.expect)(assertCanStartDirectConversation('user-a', 'user-b')).rejects.toMatchObject({
            code: 'DM_POLICY',
        });
    });
    (0, globals_1.it)('rejects group invites when target has disabled invites', async () => {
        userBlockModule.isBlocked.mockResolvedValue(false);
        databaseModule.query.mockResolvedValue({
            rows: [
                {
                    dm_policy: 'everyone',
                    allow_group_invites: false,
                    show_online_status: true,
                },
            ],
            rowCount: 1,
        });
        await (0, globals_1.expect)(assertCanInviteToGroup('inviter', 'invitee')).rejects.toMatchObject({
            code: 'INVITE_BLOCKED',
        });
    });
    (0, globals_1.it)('rejects group invites when inviter blocked by target', async () => {
        userBlockModule.isBlocked.mockResolvedValue(true);
        await (0, globals_1.expect)(assertCanInviteToGroup('inviter', 'invitee')).rejects.toMatchObject({
            code: 'BLOCKED',
        });
    });
});
//# sourceMappingURL=messagingPolicyService.test.js.map