"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagingPolicyError = void 0;
exports.getMessagingSettings = getMessagingSettings;
exports.assertCanStartDirectConversation = assertCanStartDirectConversation;
exports.assertCanSendDirectMessage = assertCanSendDirectMessage;
exports.assertCanInviteToGroup = assertCanInviteToGroup;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
const userBlockService_js_1 = require("./userBlockService.js");
const DEFAULT_SETTINGS = {
    dmPolicy: 'everyone',
    allowGroupInvites: true,
    showOnlineStatus: true,
};
class MessagingPolicyError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'MessagingPolicyError';
    }
}
exports.MessagingPolicyError = MessagingPolicyError;
const mapSettingsRow = (row) => {
    if (!row) {
        return { ...DEFAULT_SETTINGS };
    }
    return {
        dmPolicy: row.dm_policy === 'friends_only' || row.dm_policy === 'no_one' ? row.dm_policy : 'everyone',
        allowGroupInvites: row.allow_group_invites !== false,
        showOnlineStatus: row.show_online_status !== false,
    };
};
async function getMessagingSettings(userId) {
    try {
        const result = await (0, database_js_1.query)(`SELECT dm_policy, allow_group_invites, show_online_status
       FROM user_messaging_settings
       WHERE user_id = $1`, [userId]);
        return mapSettingsRow(result.rows[0]);
    }
    catch (error) {
        logger_js_1.logger.error('Failed to load messaging settings', { userId, error });
        return { ...DEFAULT_SETTINGS };
    }
}
async function areFriends(userA, userB) {
    const result = await (0, database_js_1.query)(`
    SELECT 1
    FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
    LIMIT 1
  `, [userA, userB]);
    return (result.rowCount ?? 0) > 0;
}
async function assertCanStartDirectConversation(initiatorId, targetUserId) {
    if (initiatorId === targetUserId) {
        throw new MessagingPolicyError('INVALID_TARGET', 'Cannot message yourself');
    }
    if (await (0, userBlockService_js_1.isBlocked)(initiatorId, targetUserId)) {
        throw new MessagingPolicyError('BLOCKED', 'Messaging is blocked between these users');
    }
    const targetSettings = await getMessagingSettings(targetUserId);
    if (targetSettings.dmPolicy === 'no_one') {
        throw new MessagingPolicyError('DM_POLICY', 'This user is not accepting direct messages');
    }
    if (targetSettings.dmPolicy === 'friends_only') {
        const friends = await areFriends(initiatorId, targetUserId);
        if (!friends) {
            throw new MessagingPolicyError('DM_POLICY', 'This user only accepts messages from friends');
        }
    }
}
async function assertCanSendDirectMessage(senderId, recipientId) {
    await assertCanStartDirectConversation(senderId, recipientId);
}
async function assertCanInviteToGroup(inviterId, invitedUserId) {
    if (await (0, userBlockService_js_1.isBlocked)(inviterId, invitedUserId)) {
        throw new MessagingPolicyError('BLOCKED', 'Cannot invite a blocked user');
    }
    const settings = await getMessagingSettings(invitedUserId);
    if (!settings.allowGroupInvites) {
        throw new MessagingPolicyError('INVITE_BLOCKED', 'This user is not accepting group invites');
    }
}
//# sourceMappingURL=messagingPolicyService.js.map