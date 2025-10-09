"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const conversationService_js_1 = require("../services/conversationService.js");
const userBlockService_js_1 = require("../services/userBlockService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
router.post('/blocks', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const blockerId = req.userId;
        const { blockedUserId } = req.body ?? {};
        if (!blockedUserId || typeof blockedUserId !== 'string') {
            return res.status(400).json({ error: 'blockedUserId is required' });
        }
        const record = await (0, userBlockService_js_1.createBlock)(blockerId, blockedUserId);
        return res.status(200).json({
            success: true,
            block: record,
        });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'Cannot block yourself') {
            return res.status(400).json({ error: 'You cannot block yourself' });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create block');
        return res.status(500).json({ error: 'Failed to create block' });
    }
});
router.delete('/blocks/:blockedUserId', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const blockerId = req.userId;
        const { blockedUserId } = req.params;
        const removed = await (0, userBlockService_js_1.removeBlock)(blockerId, blockedUserId);
        return res.status(200).json({
            success: true,
            removed,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to remove block');
        return res.status(500).json({ error: 'Failed to remove block' });
    }
});
router.get('/blocks', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const records = await (0, userBlockService_js_1.getBlocksForUser)(req.userId);
        return res.json({ blocks: records, scope: 'self' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch block records');
        return res.status(500).json({ error: 'Failed to fetch block records' });
    }
});
router.get('/blocks/admin', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
    try {
        const { blockerId, blockedId, limit, offset } = req.query;
        const parsedLimit = limit ? Number(limit) : undefined;
        const parsedOffset = offset ? Number(offset) : undefined;
        if ((parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) ||
            (parsedOffset !== undefined && (!Number.isFinite(parsedOffset) || parsedOffset < 0))) {
            return res.status(400).json({ error: 'limit and offset must be positive numbers' });
        }
        const records = await (0, userBlockService_js_1.getBlockRecords)({
            blockerId: typeof blockerId === 'string' ? blockerId : undefined,
            blockedId: typeof blockedId === 'string' ? blockedId : undefined,
            limit: parsedLimit,
            offset: parsedOffset,
        });
        return res.json({ blocks: records, scope: 'admin' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch block records');
        return res.status(500).json({ error: 'Failed to fetch block records' });
    }
});
const mapConversationErrorToStatus = (error) => {
    switch (error.code) {
        case 'INVALID_TARGET':
        case 'EMPTY_MESSAGE':
        case 'MESSAGE_TOO_LONG':
        case 'INVALID_PAGINATION':
            return 400;
        case 'BLOCKED':
        case 'NOT_MEMBER':
            return 403;
        case 'NOT_FOUND':
            return 404;
        default:
            return 500;
    }
};
router.post('/dm', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { targetUserId } = req.body ?? {};
        if (!targetUserId || typeof targetUserId !== 'string') {
            return res.status(400).json({ error: 'targetUserId is required' });
        }
        const conversation = await (0, conversationService_js_1.ensureDirectConversation)(req.userId, targetUserId);
        return res.status(200).json({ conversation });
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create or fetch DM conversation');
        return res.status(500).json({ error: 'Failed to create DM conversation' });
    }
});
router.post('/conversations', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { kind, title, memberIds, metadata } = req.body ?? {};
        if (kind !== 'group') {
            return res.status(400).json({ error: 'Only group conversations are supported at this stage' });
        }
        if (!Array.isArray(memberIds)) {
            return res.status(400).json({ error: 'memberIds must be an array of user IDs' });
        }
        if (metadata !== undefined) {
            if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
                return res.status(400).json({ error: 'metadata must be an object when provided' });
            }
        }
        const conversation = await (0, conversationService_js_1.createGroupConversation)({
            creatorId: req.userId,
            title: typeof title === 'string' ? title : undefined,
            memberIds,
            metadata: metadata,
        });
        return res.status(201).json({ conversation });
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create group conversation');
        return res.status(500).json({ error: 'Failed to create conversation' });
    }
});
router.post('/conversations/:conversationId/members', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { memberIds } = req.body ?? {};
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ error: 'memberIds must be a non-empty array' });
        }
        const members = await (0, conversationService_js_1.addMembersToConversation)({
            actorId: req.userId,
            conversationId,
            memberIds,
        });
        return res.status(200).json({ members });
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update conversation members');
        return res.status(500).json({ error: 'Failed to update conversation members' });
    }
});
router.post('/conversations/:conversationId/leave', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        await (0, conversationService_js_1.leaveConversation)(conversationId, req.userId);
        return res.status(200).json({ success: true });
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to leave conversation');
        return res.status(500).json({ error: 'Failed to leave conversation' });
    }
});
router.delete('/conversations/:conversationId/members/:memberId', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { conversationId, memberId } = req.params;
        await (0, conversationService_js_1.removeConversationMember)({
            actorId: req.userId,
            conversationId,
            targetUserId: memberId,
        });
        return res.status(200).json({ success: true });
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to remove conversation member');
        return res.status(500).json({ error: 'Failed to remove conversation member' });
    }
});
router.get('/conversations/unread', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const summary = await (0, conversationService_js_1.getUnreadSummary)(req.userId);
        return res.json({ conversations: summary });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load unread summary');
        return res.status(500).json({ error: 'Failed to load unread summary' });
    }
});
router.get('/conversations/:conversationId', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const markReadParam = req.query.markRead;
        const shouldMarkRead = markReadParam === undefined ||
            (Array.isArray(markReadParam) ? markReadParam[0] !== 'false' : markReadParam !== 'false');
        if (shouldMarkRead) {
            await (0, conversationService_js_1.markConversationRead)(conversationId, req.userId);
        }
        const detail = await (0, conversationService_js_1.getConversationDetail)(conversationId, req.userId, {
            allowSpectatorGameAccess: true,
        });
        return res.json(detail);
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load conversation detail');
        return res.status(500).json({ error: 'Failed to load conversation detail' });
    }
});
router.post('/conversations/:conversationId/messages', rateLimiter_js_1.messageLimiter, auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { body, clientMessageId, metadata } = req.body ?? {};
        if (!body || typeof body !== 'string') {
            return res.status(400).json({ error: 'Message body is required' });
        }
        if (metadata !== undefined) {
            if (typeof metadata !== 'object' || Array.isArray(metadata)) {
                return res.status(400).json({ error: 'metadata must be an object when provided' });
            }
        }
        const message = await (0, conversationService_js_1.sendMessage)({
            conversationId,
            senderId: req.userId,
            body,
            clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : undefined,
            metadata: metadata ?? undefined,
        });
        return res.status(200).json({ message });
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to send message');
        return res.status(500).json({ error: 'Failed to send message' });
    }
});
router.post('/conversations/game', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { gameId } = req.body ?? {};
        if (!gameId || typeof gameId !== 'string') {
            return res.status(400).json({ error: 'gameId is required' });
        }
        const conversation = await (0, conversationService_js_1.ensureGameConversation)(gameId);
        const detail = await (0, conversationService_js_1.getConversationDetail)(conversation.id, req.userId, {
            allowSpectatorGameAccess: true,
        });
        return res.status(200).json(detail);
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to ensure game conversation');
        return res.status(500).json({ error: 'Failed to ensure game conversation' });
    }
});
router.post('/conversations/team', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { gameId, teamId } = req.body ?? {};
        if (!gameId || typeof gameId !== 'string') {
            return res.status(400).json({ error: 'gameId is required' });
        }
        const parsedTeamId = Number(teamId);
        if (!Number.isFinite(parsedTeamId)) {
            return res.status(400).json({ error: 'teamId must be a number' });
        }
        const conversation = await (0, conversationService_js_1.ensureTeamConversation)(gameId, parsedTeamId);
        const detail = await (0, conversationService_js_1.getConversationDetail)(conversation.id, req.userId);
        return res.status(200).json(detail);
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to ensure team conversation');
        return res.status(500).json({ error: 'Failed to ensure team conversation' });
    }
});
router.get('/conversations', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { limit, offset } = req.query;
        const parsedLimit = limit ? Number(limit) : undefined;
        const parsedOffset = offset ? Number(offset) : undefined;
        if ((parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) ||
            (parsedOffset !== undefined && (!Number.isFinite(parsedOffset) || parsedOffset < 0))) {
            return res.status(400).json({ error: 'limit and offset must be positive numbers' });
        }
        const conversations = await (0, conversationService_js_1.listConversationsForUser)(req.userId, {
            limit: parsedLimit,
            offset: parsedOffset,
        });
        return res.json({ conversations });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to list conversations');
        return res.status(500).json({ error: 'Failed to list conversations' });
    }
});
router.get('/conversations/:conversationId/messages', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { before, limit } = req.query;
        const parsedLimit = limit ? Number(limit) : undefined;
        if (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
            return res.status(400).json({ error: 'limit must be a positive number' });
        }
        const messages = await (0, conversationService_js_1.listMessages)(conversationId, req.userId, parsedLimit ?? 50, typeof before === 'string' ? before : undefined);
        return res.json({ messages });
    }
    catch (error) {
        if (error instanceof conversationService_js_1.ConversationError) {
            const status = mapConversationErrorToStatus(error);
            return res.status(status).json({ error: error.message, code: error.code });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch messages');
        return res.status(500).json({ error: 'Failed to fetch messages' });
    }
});
exports.default = router;
//# sourceMappingURL=messages.js.map