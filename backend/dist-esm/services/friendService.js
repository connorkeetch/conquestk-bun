"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FriendshipError = void 0;
exports.getRelationshipStatus = getRelationshipStatus;
exports.listFriends = listFriends;
exports.listPendingRequests = listPendingRequests;
exports.sendFriendRequest = sendFriendRequest;
exports.acceptFriendRequest = acceptFriendRequest;
exports.declineFriendRequest = declineFriendRequest;
exports.cancelOutgoingRequest = cancelOutgoingRequest;
exports.removeFriend = removeFriend;
exports.getMutualFriends = getMutualFriends;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
const notificationService_js_1 = __importDefault(require("./notificationService.js"));
const socketRegistry_js_1 = require("./socketRegistry.js");
const userBlockService_js_1 = require("./userBlockService.js");
const mapRow = (row) => ({
    id: row.id,
    userId: row.user_id,
    friendId: row.friend_id,
    status: row.status,
    requestedAt: row.requested_at,
    acceptedAt: row.accepted_at,
});
async function getRelationshipStatus(viewerId, otherUserId) {
    if (viewerId === otherUserId)
        return 'self';
    const blockResult = await (0, database_js_1.query)(`SELECT blocker_id FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 2`, [viewerId, otherUserId]);
    for (const row of blockResult.rows ?? []) {
        if (row.blocker_id === viewerId)
            return 'blocked_by_you';
        if (row.blocker_id === otherUserId)
            return 'blocked_you';
    }
    const rel = await (0, database_js_1.query)(`
    SELECT * FROM friendships
    WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
    ORDER BY requested_at DESC
    LIMIT 1
  `, [viewerId, otherUserId]);
    if (rel.rows.length === 0)
        return 'none';
    const row = rel.rows[0];
    if (row.status === 'accepted')
        return 'friends';
    if (row.status === 'pending') {
        if (row.user_id === viewerId)
            return 'pending_outgoing';
        if (row.friend_id === viewerId)
            return 'pending_incoming';
    }
    return 'none';
}
async function listFriends(userId) {
    const result = await (0, database_js_1.query)(`
    SELECT
      CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END AS other_user_id,
      u.username AS other_username,
      f.accepted_at
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
    WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
    ORDER BY COALESCE(f.accepted_at, f.requested_at) DESC
  `, [userId]);
    return result.rows.map((row) => ({
        userId: row.other_user_id,
        username: row.other_username,
        since: row.accepted_at ?? undefined,
    }));
}
async function listPendingRequests(userId) {
    const incoming = await (0, database_js_1.query)(`
    SELECT f.user_id AS requester_id, u.username AS requester_name, f.requested_at
    FROM friendships f
    JOIN users u ON u.id = f.user_id
    WHERE f.friend_id = $1 AND f.status = 'pending'
    ORDER BY f.requested_at DESC
  `, [userId]);
    const outgoing = await (0, database_js_1.query)(`
    SELECT f.friend_id AS requester_id, u.username AS requester_name, f.requested_at
    FROM friendships f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = $1 AND f.status = 'pending'
    ORDER BY f.requested_at DESC
  `, [userId]);
    return {
        incoming: incoming.rows.map((r) => ({
            requesterId: r.requester_id,
            requesterName: r.requester_name,
            requestedAt: r.requested_at,
        })),
        outgoing: outgoing.rows.map((r) => ({
            requesterId: r.requester_id,
            requesterName: r.requester_name,
            requestedAt: r.requested_at,
        })),
    };
}
class FriendshipError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'FriendshipError';
        this.code = code;
    }
}
exports.FriendshipError = FriendshipError;
async function sendFriendRequest(requesterId, targetUserId) {
    if (requesterId === targetUserId) {
        throw new FriendshipError('INVALID_TARGET', 'You cannot add yourself');
    }
    if (await (0, userBlockService_js_1.isBlocked)(requesterId, targetUserId)) {
        throw new FriendshipError('BLOCKED', 'You cannot add this user');
    }
    const existing = await (0, database_js_1.query)(`SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1) LIMIT 1`, [requesterId, targetUserId]);
    if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (row.status === 'accepted') {
            throw new FriendshipError('ALREADY_FRIENDS', 'You are already friends');
        }
        if (row.status === 'pending') {
            if (row.user_id === targetUserId && row.friend_id === requesterId) {
                const accepted = await acceptFriendRequest(requesterId, targetUserId);
                return accepted;
            }
            throw new FriendshipError('ALREADY_REQUESTED', 'Friend request already pending');
        }
    }
    try {
        const record = await (0, database_js_1.transaction)(async (client) => {
            const insert = await client.query(`
        INSERT INTO friendships (user_id, friend_id, status)
        VALUES ($1, $2, 'pending')
        ON CONFLICT (user_id, friend_id) DO UPDATE SET status = EXCLUDED.status
        RETURNING *
      `, [requesterId, targetUserId]);
            return mapRow(insert.rows[0]);
        });
        notificationService_js_1.default
            .createInAppNotification(targetUserId, {
            type: 'friend_request',
            title: 'New Friend Request',
            message: 'You have a new friend request',
            actionUrl: `/profile/${requesterId}`,
            data: { requesterId },
        })
            .catch((error) => logger_js_1.logger.warn('Failed to create friend request notification', { error }));
        try {
            const io = (0, socketRegistry_js_1.tryGetSocketServer)();
            if (io) {
                io.to(`user:${targetUserId}`).emit('friend.request.received', {
                    requesterId,
                    requestedAt: new Date().toISOString(),
                });
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to emit friend.request.received', { requesterId, targetUserId, error });
        }
        return record;
    }
    catch (error) {
        logger_js_1.logger.error('Failed to send friend request', { requesterId, targetUserId, error });
        throw error;
    }
}
async function acceptFriendRequest(currentUserId, requesterId) {
    if (await (0, userBlockService_js_1.isBlocked)(currentUserId, requesterId)) {
        throw new FriendshipError('BLOCKED', 'Cannot accept due to block relationship');
    }
    const updated = await (0, database_js_1.query)(`
    UPDATE friendships
    SET status = 'accepted', accepted_at = NOW()
    WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'
    RETURNING *
  `, [requesterId, currentUserId]);
    if (updated.rows.length === 0) {
        throw new FriendshipError('NOT_FOUND', 'No pending request from this user');
    }
    const record = mapRow(updated.rows[0]);
    notificationService_js_1.default
        .createInAppNotification(requesterId, {
        type: 'system',
        title: 'Friend Request Accepted',
        message: 'Your friend request was accepted',
        data: { userId: currentUserId },
    })
        .catch((error) => logger_js_1.logger.warn('Failed to create friend acceptance notification', { error }));
    try {
        const io = (0, socketRegistry_js_1.tryGetSocketServer)();
        if (io) {
            const now = new Date().toISOString();
            io.to(`user:${requesterId}`).emit('friend.request.accepted', {
                userId: currentUserId,
                acceptedAt: now,
            });
            io.to(`user:${currentUserId}`).emit('friend.added', {
                userId: requesterId,
                at: now,
            });
        }
    }
    catch (error) {
        logger_js_1.logger.warn('Failed to emit friend acceptance events', { requesterId, currentUserId, error });
    }
    return record;
}
async function declineFriendRequest(currentUserId, requesterId) {
    const result = await (0, database_js_1.query)(`DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`, [requesterId, currentUserId]);
    if ((result.rowCount ?? 0) > 0) {
        try {
            const io = (0, socketRegistry_js_1.tryGetSocketServer)();
            if (io) {
                io.to(`user:${requesterId}`).emit('friend.request.declined', {
                    userId: currentUserId,
                    at: new Date().toISOString(),
                });
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to emit friend.request.declined', { requesterId, currentUserId, error });
        }
    }
    return (result.rowCount ?? 0) > 0;
}
async function cancelOutgoingRequest(currentUserId, targetUserId) {
    const result = await (0, database_js_1.query)(`DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`, [currentUserId, targetUserId]);
    if ((result.rowCount ?? 0) > 0) {
        try {
            const io = (0, socketRegistry_js_1.tryGetSocketServer)();
            if (io) {
                io.to(`user:${targetUserId}`).emit('friend.request.cancelled', {
                    userId: currentUserId,
                    at: new Date().toISOString(),
                });
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to emit friend.request.cancelled', { currentUserId, targetUserId, error });
        }
    }
    return (result.rowCount ?? 0) > 0;
}
async function removeFriend(userId, friendId) {
    const result = await (0, database_js_1.query)(`
    DELETE FROM friendships
    WHERE status = 'accepted' AND (
      (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
    )
  `, [userId, friendId]);
    if ((result.rowCount ?? 0) > 0) {
        try {
            const io = (0, socketRegistry_js_1.tryGetSocketServer)();
            if (io) {
                const now = new Date().toISOString();
                io.to(`user:${friendId}`).emit('friend.removed', { userId, at: now });
                io.to(`user:${userId}`).emit('friend.removed', { userId: friendId, at: now });
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to emit friend.removed', { userId, friendId, error });
        }
    }
    return (result.rowCount ?? 0) > 0;
}
exports.default = {
    listFriends,
    listPendingRequests,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelOutgoingRequest,
    removeFriend,
    getRelationshipStatus,
};
async function getMutualFriends(userA, userB, limit = 6) {
    const safeLimit = Math.max(1, Math.min(limit, 25));
    const countResult = await (0, database_js_1.query)(`
    WITH a_friends AS (
      SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END AS fid
      FROM friendships f
      WHERE f.status = 'accepted' AND (f.user_id = $1 OR f.friend_id = $1)
    ),
    b_friends AS (
      SELECT CASE WHEN f.user_id = $2 THEN f.friend_id ELSE f.user_id END AS fid
      FROM friendships f
      WHERE f.status = 'accepted' AND (f.user_id = $2 OR f.friend_id = $2)
    )
    SELECT COUNT(*)::INT AS total
    FROM a_friends a
    JOIN b_friends b ON a.fid = b.fid
    WHERE a.fid <> $1 AND a.fid <> $2
  `, [userA, userB]);
    const total = Number(countResult.rows[0]?.total ?? 0);
    if (total === 0)
        return { total: 0, users: [] };
    const sample = await (0, database_js_1.query)(`
    WITH a_friends AS (
      SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END AS fid
      FROM friendships f
      WHERE f.status = 'accepted' AND (f.user_id = $1 OR f.friend_id = $1)
    ),
    b_friends AS (
      SELECT CASE WHEN f.user_id = $2 THEN f.friend_id ELSE f.user_id END AS fid
      FROM friendships f
      WHERE f.status = 'accepted' AND (f.user_id = $2 OR f.friend_id = $2)
    )
    SELECT u.id, u.username
    FROM a_friends a
    JOIN b_friends b ON a.fid = b.fid
    JOIN users u ON u.id = a.fid
    WHERE a.fid <> $1 AND a.fid <> $2
    ORDER BY u.username ASC
    LIMIT $3
  `, [userA, userB, safeLimit]);
    return {
        total,
        users: sample.rows.map((r) => ({ userId: r.id, username: r.username })),
    };
}
//# sourceMappingURL=friendService.js.map