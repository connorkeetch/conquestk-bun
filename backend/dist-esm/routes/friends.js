"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_js_1 = require("../config/database.js");
const auth_js_1 = require("../middleware/auth.js");
const friendService_js_1 = require("../services/friendService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
router.get('/', async (req, res) => {
    try {
        const friends = await (0, friendService_js_1.listFriends)(req.userId);
        return res.json({ friends });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to list friends');
        return res.status(500).json({ error: 'Failed to list friends' });
    }
});
router.get('/requests', async (req, res) => {
    try {
        const result = await (0, friendService_js_1.listPendingRequests)(req.userId);
        return res.json(result);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to list friend requests');
        return res.status(500).json({ error: 'Failed to list friend requests' });
    }
});
router.get('/status/:otherUserId', async (req, res) => {
    try {
        const { otherUserId } = req.params;
        const status = await (0, friendService_js_1.getRelationshipStatus)(req.userId, otherUserId);
        let since;
        if (status === 'friends') {
            try {
                const res2 = await (0, database_js_1.query)(`SELECT accepted_at FROM friendships WHERE status = 'accepted' AND ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)) LIMIT 1`, [req.userId, otherUserId]);
                const acceptedAt = res2.rows[0]?.accepted_at;
                if (acceptedAt instanceof Date)
                    since = acceptedAt.toISOString();
            }
            catch {
            }
        }
        return res.json({ status, since });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get relationship status');
        return res.status(500).json({ error: 'Failed to get relationship status' });
    }
});
router.get('/mutual/:otherUserId', async (req, res) => {
    try {
        const { otherUserId } = req.params;
        const limit = Math.max(1, Math.min(Number(req.query.limit) || 6, 25));
        const result = await (0, friendService_js_1.getMutualFriends)(req.userId, otherUserId, limit);
        return res.json(result);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch mutual friends');
        return res.status(500).json({ error: 'Failed to fetch mutual friends' });
    }
});
router.post('/requests', async (req, res) => {
    try {
        const { targetUserId } = req.body ?? {};
        if (!targetUserId || typeof targetUserId !== 'string') {
            return res.status(400).json({ error: 'targetUserId is required' });
        }
        const record = await (0, friendService_js_1.sendFriendRequest)(req.userId, targetUserId);
        return res.status(201).json({ request: record });
    }
    catch (error) {
        if (error instanceof friendService_js_1.FriendshipError) {
            const code = error.code;
            const status = code === 'INVALID_TARGET'
                ? 400
                : code === 'BLOCKED'
                    ? 403
                    : code === 'ALREADY_FRIENDS' || code === 'ALREADY_REQUESTED'
                        ? 409
                        : 400;
            return res.status(status).json({ error: error.message, code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to send friend request');
        return res.status(500).json({ error: 'Failed to send friend request' });
    }
});
router.post('/requests/:requesterId/accept', async (req, res) => {
    try {
        const { requesterId } = req.params;
        const record = await (0, friendService_js_1.acceptFriendRequest)(req.userId, requesterId);
        return res.json({ success: true, friendship: record });
    }
    catch (error) {
        if (error instanceof friendService_js_1.FriendshipError) {
            const code = error.code;
            const status = code === 'NOT_FOUND' ? 404 : code === 'BLOCKED' ? 403 : 400;
            return res.status(status).json({ error: error.message, code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to accept friend request');
        return res.status(500).json({ error: 'Failed to accept friend request' });
    }
});
router.post('/requests/:requesterId/decline', async (req, res) => {
    try {
        const { requesterId } = req.params;
        const removed = await (0, friendService_js_1.declineFriendRequest)(req.userId, requesterId);
        return res.json({ success: removed });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to decline friend request');
        return res.status(500).json({ error: 'Failed to decline friend request' });
    }
});
router.delete('/requests/:targetUserId', async (req, res) => {
    try {
        const { targetUserId } = req.params;
        const removed = await (0, friendService_js_1.cancelOutgoingRequest)(req.userId, targetUserId);
        return res.json({ success: removed });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to cancel friend request');
        return res.status(500).json({ error: 'Failed to cancel friend request' });
    }
});
router.delete('/:friendId', async (req, res) => {
    try {
        const { friendId } = req.params;
        const removed = await (0, friendService_js_1.removeFriend)(req.userId, friendId);
        return res.json({ success: removed });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to remove friend');
        return res.status(500).json({ error: 'Failed to remove friend' });
    }
});
exports.default = router;
//# sourceMappingURL=friends.js.map