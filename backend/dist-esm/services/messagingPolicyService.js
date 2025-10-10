import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { isBlocked } from './userBlockService.js';
const DEFAULT_SETTINGS = {
    dmPolicy: 'everyone',
    allowGroupInvites: true,
    showOnlineStatus: true,
};
export class MessagingPolicyError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'MessagingPolicyError';
    }
}
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
export async function getMessagingSettings(userId) {
    try {
        const result = await query(`SELECT dm_policy, allow_group_invites, show_online_status
       FROM user_messaging_settings
       WHERE user_id = $1`, [userId]);
        return mapSettingsRow(result.rows[0]);
    }
    catch (error) {
        logger.error('Failed to load messaging settings', { userId, error });
        return { ...DEFAULT_SETTINGS };
    }
}
async function areFriends(userA, userB) {
    const result = await query(`
    SELECT 1
    FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
    LIMIT 1
  `, [userA, userB]);
    return (result.rowCount ?? 0) > 0;
}
export async function assertCanStartDirectConversation(initiatorId, targetUserId) {
    if (initiatorId === targetUserId) {
        throw new MessagingPolicyError('INVALID_TARGET', 'Cannot message yourself');
    }
    if (await isBlocked(initiatorId, targetUserId)) {
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
export async function assertCanSendDirectMessage(senderId, recipientId) {
    await assertCanStartDirectConversation(senderId, recipientId);
}
export async function assertCanInviteToGroup(inviterId, invitedUserId) {
    if (await isBlocked(inviterId, invitedUserId)) {
        throw new MessagingPolicyError('BLOCKED', 'Cannot invite a blocked user');
    }
    const settings = await getMessagingSettings(invitedUserId);
    if (!settings.allowGroupInvites) {
        throw new MessagingPolicyError('INVITE_BLOCKED', 'This user is not accepting group invites');
    }
}
//# sourceMappingURL=messagingPolicyService.js.map