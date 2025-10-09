"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const database_js_1 = require("../config/database.js");
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const adminService_js_1 = require("../services/adminService.js");
const gameLifecycleService_js_1 = require("../services/gameLifecycleService.js");
const mapService_js_1 = require("../services/mapService.js");
const logger_js_1 = require("../utils/logger.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const url_js_1 = require("../utils/url.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
router.get('/status', async (req, res) => {
    try {
        const userId = req.userId;
        const isAdmin = await adminService_js_1.adminService.isAdmin(userId);
        res.json({ isAdmin });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to check admin status', 500, { userId: req.userId });
        res.status(500).json({ error: 'Failed to check admin status' });
    }
});
router.use(adminAuth_js_1.requireAdmin);
const checkValidation = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    return next();
};
router.get('/me', async (req, res) => {
    try {
        const userId = req.userId;
        const adminInfo = await adminService_js_1.adminService.getUserAdminInfo(userId);
        res.json({
            userId,
            adminRoles: adminInfo,
            isAdmin: true,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get admin info', 500, { userId: req.userId });
        res.status(500).json({ error: 'Failed to get admin info' });
    }
});
router.get('/users', (0, adminAuth_js_1.requirePermission)('users.view'), (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }), (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }), (0, express_validator_1.query)('search').optional().isString(), checkValidation, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = parseInt(req.query.offset, 10) || 0;
        const search = req.query.search;
        const result = await adminService_js_1.adminService.getAllUsers(limit, offset, search);
        res.json(result);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get users', 500, {
            limit: req.query.limit,
            offset: req.query.offset,
            search: req.query.search,
        });
        res.status(500).json({ error: 'Failed to get users' });
    }
});
router.put('/users/:userId/status', (0, adminAuth_js_1.requirePermission)('users.moderate'), (0, adminAuth_js_1.logAdminActivity)('user_status_update'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.body)('status').isIn(['active', 'suspended', 'banned']), (0, express_validator_1.body)('reason').optional().isString().isLength({ max: 500 }), (0, express_validator_1.body)('expiresAt').optional().isISO8601(), checkValidation, async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, reason, expiresAt } = req.body;
        const adminUserId = req.userId;
        const expirationDate = expiresAt ? new Date(expiresAt) : undefined;
        await adminService_js_1.adminService.updateUserStatus(userId, adminUserId, status, reason, expirationDate);
        res.json({ message: 'User status updated successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update user status', 500, {
            targetUserId: req.params.userId,
            status: req.body?.status,
        });
        res.status(500).json({ error: 'Failed to update user status' });
    }
});
router.post('/users/:userId/reset-password', (0, adminAuth_js_1.requirePermission)('users.edit'), (0, adminAuth_js_1.logAdminActivity)('password_reset'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.body)('newPassword').isLength({ min: 6 }), checkValidation, async (req, res) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;
        const adminUserId = req.userId;
        await adminService_js_1.adminService.resetUserPassword(userId, adminUserId, newPassword);
        res.json({ message: 'Password reset successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to reset password', 500, {
            targetUserId: req.params.userId,
        });
        res.status(500).json({ error: 'Failed to reset password' });
    }
});
router.post('/users/:userId/vip', (0, adminAuth_js_1.requirePermission)('users.edit'), (0, adminAuth_js_1.logAdminActivity)('vip_status_change'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.body)('isVip').isBoolean(), (0, express_validator_1.body)('reason').optional().isString().isLength({ max: 500 }), checkValidation, async (req, res) => {
    try {
        const { userId } = req.params;
        const { isVip, reason } = req.body;
        const adminUserId = req.userId;
        await adminService_js_1.adminService.updateUserVipStatus(userId, adminUserId, isVip, reason);
        res.json({ message: 'VIP status updated successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update VIP status', 500, {
            targetUserId: req.params.userId,
            isVip: req.body?.isVip,
        });
        res.status(500).json({ error: 'Failed to update VIP status' });
    }
});
router.post('/users/:userId/admin', (0, adminAuth_js_1.requirePermission)('admin.manage'), (0, adminAuth_js_1.logAdminActivity)('admin_status_change'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.body)('isAdmin').isBoolean(), checkValidation, async (req, res) => {
    try {
        const { userId } = req.params;
        const { isAdmin } = req.body;
        const adminUserId = req.userId;
        await adminService_js_1.adminService.updateUserAdminStatus(userId, adminUserId, isAdmin);
        res.json({ message: 'Admin status updated successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update admin status', 500, {
            targetUserId: req.params.userId,
            isAdmin: req.body?.isAdmin,
        });
        res.status(500).json({ error: 'Failed to update admin status' });
    }
});
router.post('/users/:userId/premium', (0, adminAuth_js_1.requirePermission)('users.edit'), (0, adminAuth_js_1.logAdminActivity)('premium_tier_change'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.body)('tier').isIn(['free', 'premium']), (0, express_validator_1.body)('expiresAt').optional().isISO8601(), checkValidation, async (req, res) => {
    try {
        const { userId } = req.params;
        const { tier, expiresAt } = req.body;
        const adminUserId = req.userId;
        const expirationDate = expiresAt ? new Date(expiresAt) : undefined;
        await adminService_js_1.adminService.updateUserPremiumTier(userId, adminUserId, tier, expirationDate);
        res.json({ message: 'Premium tier updated successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update premium tier', 500, {
            targetUserId: req.params.userId,
            tier: req.body?.tier,
        });
        res.status(500).json({ error: 'Failed to update premium tier' });
    }
});
router.post('/users/:userId/ban', (0, adminAuth_js_1.requirePermission)('users.moderate'), (0, adminAuth_js_1.logAdminActivity)('user_ban'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.body)('reason').optional().isString().isLength({ max: 500 }), checkValidation, async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;
        const adminUserId = req.userId;
        await adminService_js_1.adminService.updateUserStatus(userId, adminUserId, 'banned', reason);
        res.json({ message: 'User banned successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to ban user', 500, {
            targetUserId: req.params.userId,
        });
        res.status(500).json({ error: 'Failed to ban user' });
    }
});
router.post('/users/:userId/unban', (0, adminAuth_js_1.requirePermission)('users.moderate'), (0, adminAuth_js_1.logAdminActivity)('user_unban'), (0, express_validator_1.param)('userId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { userId } = req.params;
        const adminUserId = req.userId;
        await adminService_js_1.adminService.updateUserStatus(userId, adminUserId, 'active');
        res.json({ message: 'User unbanned successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to unban user', 500, {
            targetUserId: req.params.userId,
        });
        res.status(500).json({ error: 'Failed to unban user' });
    }
});
router.post('/users/:userId/admin-roles', (0, adminAuth_js_1.requirePermission)('admin.manage'), (0, adminAuth_js_1.logAdminActivity)('admin_role_assign'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.body)('roleId').isUUID(), (0, express_validator_1.body)('expiresAt').optional().isISO8601(), checkValidation, async (req, res) => {
    try {
        const { userId } = req.params;
        const { roleId, expiresAt } = req.body;
        const adminUserId = req.userId;
        const expirationDate = expiresAt ? new Date(expiresAt) : undefined;
        await adminService_js_1.adminService.assignAdminRole(userId, roleId, adminUserId, expirationDate);
        res.json({ message: 'Admin role assigned successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to assign admin role', 500, {
            targetUserId: req.params.userId,
            roleId: req.body?.roleId,
        });
        res.status(500).json({ error: 'Failed to assign admin role' });
    }
});
router.delete('/users/:userId/admin-roles/:roleId', (0, adminAuth_js_1.requirePermission)('admin.manage'), (0, adminAuth_js_1.logAdminActivity)('admin_role_remove'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.param)('roleId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { userId, roleId } = req.params;
        const adminUserId = req.userId;
        await adminService_js_1.adminService.removeAdminRole(userId, roleId, adminUserId);
        res.json({ message: 'Admin role removed successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to remove admin role', 500, {
            targetUserId: req.params.userId,
            roleId: req.params.roleId,
        });
        res.status(500).json({ error: 'Failed to remove admin role' });
    }
});
const registerContentApprovalQueueRoute = (path) => router.get(path, (0, adminAuth_js_1.requirePermission)('content.moderate'), (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }), (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }), checkValidation, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = parseInt(req.query.offset, 10) || 0;
        const result = await adminService_js_1.adminService.getContentApprovalQueue(limit, offset);
        res.json(result);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get approval queue', 500, {
            limit: req.query.limit,
            offset: req.query.offset,
        });
        res.status(500).json({ error: 'Failed to get approval queue' });
    }
});
registerContentApprovalQueueRoute('/content/queue');
registerContentApprovalQueueRoute('/content/approval-queue');
router.post('/content/approval-queue/:queueId/approve', (0, adminAuth_js_1.requirePermission)('content.moderate'), (0, adminAuth_js_1.logAdminActivity)('content_approve'), (0, express_validator_1.param)('queueId').isUUID(), (0, express_validator_1.body)('notes').optional().isString().isLength({ max: 1000 }), checkValidation, async (req, res) => {
    try {
        const { queueId } = req.params;
        const { notes } = req.body;
        const adminUserId = req.userId;
        await adminService_js_1.adminService.approveContent(queueId, adminUserId, notes);
        res.json({ message: 'Content approved successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to approve content', 500, {
            queueId: req.params.queueId,
        });
        res.status(500).json({ error: 'Failed to approve content' });
    }
});
router.post('/content/approval-queue/:queueId/reject', (0, adminAuth_js_1.requirePermission)('content.moderate'), (0, adminAuth_js_1.logAdminActivity)('content_reject'), (0, express_validator_1.param)('queueId').isUUID(), (0, express_validator_1.body)('reason').isString().isLength({ min: 1, max: 1000 }), checkValidation, async (req, res) => {
    try {
        const { queueId } = req.params;
        const { reason } = req.body;
        const adminUserId = req.userId;
        await adminService_js_1.adminService.rejectContent(queueId, adminUserId, reason);
        res.json({ message: 'Content rejected successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to reject content', 500, {
            queueId: req.params.queueId,
        });
        res.status(500).json({ error: 'Failed to reject content' });
    }
});
const normalizeAdminGameStatus = (status) => {
    if (!status) {
        return 'waiting';
    }
    switch (status) {
        case 'in_progress':
        case 'starting':
        case 'active':
        case 'initializing':
            return 'active';
        case 'finished':
        case 'completed':
            return 'completed';
        case 'abandoned':
            return 'abandoned';
        case 'paused':
            return 'paused';
        default:
            return 'waiting';
    }
};
router.get('/games', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }), (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }), (0, express_validator_1.query)('status').optional().isString(), (0, express_validator_1.query)('search').optional().isString(), (0, express_validator_1.query)('sortBy').optional().isString(), (0, express_validator_1.query)('sortDir').optional().isIn(['asc', 'desc']), checkValidation, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = parseInt(req.query.offset, 10) || 0;
        const status = req.query.status;
        const search = req.query.search;
        const sortBy = (req.query.sortBy || 'lastActivity').toLowerCase();
        const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const sortMap = {
            lastactivity: `COALESCE(gs.last_activity, gr.updated_at)`,
            turn: `COALESCE(gs.turn_number, 0)`,
            createdat: `gr.created_at`,
            updatedat: `gr.updated_at`,
            status: `gr.status`,
        };
        const sortExpr = sortMap[sortBy] ?? sortMap.lastactivity;
        const statusFilterMap = {
            active: ['active', 'initializing'],
            waiting: ['lobby'],
            completed: ['completed'],
            abandoned: ['abandoned'],
            paused: ['paused'],
        };
        let gamesQuery = `
        SELECT 
          gr.id,
          gr.name,
          gr.status,
          gr.max_players,
          gr.is_private,
          gr.created_at,
          gr.updated_at,
          gr.host_id,
          gr.map_id,
          gr.game_mode,
          gr.is_ranked,
          gr.started_at,
          gr.ended_at,
          gr.winner_id,
          gr.room_code,
          u.username as host_username,
          m.name as map_name,
          COUNT(rp.user_id) as player_count,
          gs.turn_number as gs_turn_number,
          gs.game_phase as gs_game_phase,
          gs.last_activity as gs_last_activity,
          gs.current_player_id as gs_current_player_id,
          cu.username as gs_current_player_username
        FROM game_rooms gr
        LEFT JOIN users u ON gr.host_id = u.id
        LEFT JOIN maps m ON gr.map_id = m.id
        LEFT JOIN game_states gs ON gs.room_id = gr.id
        LEFT JOIN users cu ON gs.current_player_id = cu.id
        LEFT JOIN room_players rp ON gr.id = rp.room_id
        WHERE 1=1
      `;
        const queryParams = [];
        let paramIndex = 1;
        if (status && status !== 'all') {
            const dbStatuses = statusFilterMap[status] || [status];
            const placeholders = dbStatuses.map(() => `$${paramIndex++}`).join(', ');
            gamesQuery += ` AND gr.status IN (${placeholders})`;
            queryParams.push(...dbStatuses);
        }
        if (search) {
            gamesQuery += ` AND (gr.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }
        gamesQuery += `
        GROUP BY gr.id, u.username, m.name, gs.turn_number, gs.game_phase, gs.last_activity, gs.current_player_id, cu.username
        ORDER BY ${sortExpr} ${sortDir} NULLS LAST
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
        queryParams.push(limit, offset);
        const gamesResult = await (0, database_js_1.query)(gamesQuery, queryParams);
        let countQuery = `
        SELECT COUNT(*) as total
        FROM game_rooms gr
        LEFT JOIN maps m ON gr.map_id = m.id
        LEFT JOIN users u ON gr.host_id = u.id
        WHERE 1=1
      `;
        const countParams = [];
        let countParamIndex = 1;
        if (status && status !== 'all') {
            const dbStatuses = statusFilterMap[status] || [status];
            const placeholders = dbStatuses.map(() => `$${countParamIndex++}`).join(', ');
            countQuery += ` AND gr.status IN (${placeholders})`;
            countParams.push(...dbStatuses);
        }
        if (search) {
            countQuery += ` AND (gr.name ILIKE $${countParamIndex} OR m.name ILIKE $${countParamIndex} OR u.username ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
        }
        const countResult = await (0, database_js_1.query)(countQuery, countParams);
        const gameRows = gamesResult.rows;
        const gameIds = gameRows.map((g) => g.id);
        let playersData = [];
        if (gameIds.length > 0) {
            const playersQuery = `
          SELECT
            rp.room_id,
            rp.user_id,
            u.username,
            rp.joined_at,
            rp.is_ai,
            rp.ai_difficulty,
            rp.ai_personality_seed
          FROM room_players rp
          JOIN users u ON rp.user_id = u.id
          WHERE rp.room_id = ANY($1)
          ORDER BY rp.room_id, rp.joined_at
        `;
            const playersResult = await (0, database_js_1.query)(playersQuery, [gameIds]);
            playersData = playersResult.rows;
        }
        const games = gamesResult.rows.map((game) => {
            const currentPlayers = playersData.filter((player) => player.room_id === game.id);
            const players = currentPlayers.map((player) => ({
                id: player.user_id,
                username: player.username,
                status: 'active',
                color: '#666666',
                territoriesCount: 0,
                armiesCount: 0,
                isAi: player.is_ai === true,
                aiDifficulty: player.ai_difficulty,
            }));
            const normalizedStatus = normalizeAdminGameStatus(game.status);
            return {
                id: game.id,
                name: game.name,
                mapName: game.map_name,
                createdBy: game.host_id,
                createdByUsername: game.host_username,
                status: normalizedStatus,
                currentTurn: game.gs_current_player_id ?? null,
                currentTurnUsername: game.gs_current_player_username ?? null,
                phase: game.gs_game_phase ?? 'reinforcement',
                turnCount: Number(game.gs_turn_number ?? 0),
                maxPlayers: game.max_players || 6,
                isPrivate: Boolean(game.is_private),
                createdAt: game.created_at,
                updatedAt: game.updated_at,
                lastActivity: game.gs_last_activity || game.updated_at || game.created_at,
                roomCode: typeof game.room_code === 'number'
                    ? game.room_code
                    : typeof game.room_code === 'string'
                        ? Number.parseInt(game.room_code, 10)
                        : undefined,
                players,
            };
        });
        res.json({
            games,
            total: parseInt(countResult.rows[0]?.total || '0', 10),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get games', 500, {
            limit: req.query.limit,
            offset: req.query.offset,
            status: req.query.status,
        });
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to get games',
        });
    }
});
router.get('/games/:gameId/details', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.param)('gameId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const detailsQuery = `
        SELECT 
          gr.id,
          gr.name,
          gr.status,
          gr.max_players,
          gr.is_private,
          gr.created_at,
          gr.updated_at,
          gr.host_id,
          gr.map_id,
          gr.game_mode,
          gr.is_ranked,
          gr.started_at,
          gr.ended_at,
          gr.winner_id,
          gr.room_code,
          u.username as host_username,
          m.name as map_name,
          gs.turn_number,
          gs.game_phase,
          gs.current_player_id,
          gs.last_activity,
          cu.username as current_player_username
        FROM game_rooms gr
        LEFT JOIN users u ON gr.host_id = u.id
        LEFT JOIN maps m ON gr.map_id = m.id
        LEFT JOIN game_states gs ON gs.room_id = gr.id
        LEFT JOIN users cu ON gs.current_player_id = cu.id
        WHERE gr.id = $1
        LIMIT 1
      `;
        const detailsResult = await (0, database_js_1.query)(detailsQuery, [gameId]);
        if (detailsResult.rowCount === 0) {
            res.status(404).json({ error: 'Game not found' });
            return;
        }
        const row = detailsResult.rows[0];
        const playersResult = await (0, database_js_1.query)(`SELECT rp.room_id, rp.user_id, u.username, rp.joined_at, rp.is_ai, rp.ai_difficulty, rp.ai_personality_seed
         FROM room_players rp
         LEFT JOIN users u ON rp.user_id = u.id
         WHERE rp.room_id = $1
         ORDER BY rp.joined_at ASC NULLS FIRST`, [gameId]);
        const players = (playersResult.rows || []).map((p) => ({
            id: p.user_id,
            username: p.username,
            status: 'active',
            color: '#666666',
            territoriesCount: 0,
            armiesCount: 0,
            isAi: p.is_ai === true,
            aiDifficulty: p.ai_difficulty,
        }));
        res.json({
            id: row.id,
            name: row.name,
            mapName: row.map_name,
            createdBy: row.host_id,
            createdByUsername: row.host_username,
            status: normalizeAdminGameStatus(row.status ?? null),
            currentTurn: row.current_player_id ?? null,
            currentTurnUsername: row.current_player_username ?? null,
            phase: row.game_phase ?? 'reinforcement',
            turnCount: Number(row.turn_number ?? 0),
            maxPlayers: Number(row.max_players ?? 6),
            isPrivate: Boolean(row.is_private),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastActivity: row.last_activity ?? row.updated_at ?? row.created_at,
            roomCode: typeof row.room_code === 'number'
                ? row.room_code
                : typeof row.room_code === 'string'
                    ? Number.parseInt(row.room_code, 10)
                    : undefined,
            players,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get game details', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({ error: 'Failed to get game details' });
    }
});
router.get('/games/:gameId/moves', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.param)('gameId').isUUID(), (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 200 }), (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }), (0, express_validator_1.query)('moveType').optional().isString(), (0, express_validator_1.query)('playerId').optional().isUUID(), (0, express_validator_1.query)('turn').optional().isInt({ min: 1 }), (0, express_validator_1.query)('sort').optional().isString(), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const limit = parseInt(req.query.limit ?? '50', 10);
        const offset = parseInt(req.query.offset ?? '0', 10);
        const moveType = req.query.moveType || undefined;
        const playerId = req.query.playerId || undefined;
        const turn = req.query.turn ? Number.parseInt(req.query.turn, 10) : undefined;
        const sort = req.query.sort || 'created_at_desc';
        const orderBy = sort === 'created_at_asc'
            ? 'gm.created_at ASC'
            : sort === 'turn_asc'
                ? 'gm.turn_number ASC, gm.created_at ASC'
                : sort === 'turn_desc'
                    ? 'gm.turn_number DESC, gm.created_at DESC'
                    : 'gm.created_at DESC';
        const where = ['gm.room_id = $1'];
        const params = [gameId];
        let idx = 2;
        if (moveType) {
            where.push(`gm.move_type = $${idx++}`);
            params.push(moveType);
        }
        if (playerId) {
            where.push(`gm.player_id = $${idx++}`);
            params.push(playerId);
        }
        if (typeof turn === 'number' && Number.isFinite(turn)) {
            where.push(`gm.turn_number = $${idx++}`);
            params.push(turn);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const combinedSource = `(
        SELECT id, room_id, player_id, turn_number, move_type, move_data, is_valid, validation_error, created_at
        FROM game_moves
        UNION ALL
        SELECT id, room_id, player_id, turn_number, move_type, move_data, is_valid, validation_error, created_at
        FROM game_move_archive
      )`;
        const sql = `
        SELECT gm.id, gm.player_id, u.username as player_username, gm.turn_number, gm.move_type, gm.move_data, gm.is_valid, gm.validation_error, gm.created_at
        FROM ${combinedSource} gm
        LEFT JOIN users u ON gm.player_id = u.id
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${idx} OFFSET $${idx + 1}
      `;
        const listParams = [...params, limit, offset];
        const rowsRes = await (0, database_js_1.query)(sql, listParams);
        const countRes = await (0, database_js_1.query)(`SELECT COUNT(*) as total FROM ${combinedSource} gm ${whereSql}`, params);
        res.json({
            moves: rowsRes.rows || [],
            total: Number.parseInt(countRes.rows?.[0]?.total ?? '0', 10),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get game moves', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({ error: 'Failed to get game moves' });
    }
});
router.get('/games/:gameId/turn-stats', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.param)('gameId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const result = await (0, database_js_1.query)('SELECT turn_stats FROM game_states WHERE room_id = $1', [gameId]);
        const arr = Array.isArray(result.rows?.[0]?.turn_stats)
            ? result.rows[0]?.turn_stats
            : [];
        res.json({ turnStats: arr, count: arr.length });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get turn stats', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({ error: 'Failed to get turn stats' });
    }
});
router.get('/games/:gameId/log', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.param)('gameId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const result = await (0, database_js_1.query)('SELECT game_log FROM game_states WHERE room_id = $1', [gameId]);
        const arr = Array.isArray(result.rows?.[0]?.game_log)
            ? result.rows[0]?.game_log
            : [];
        res.json({ entries: arr, count: arr.length });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get game log', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({ error: 'Failed to get game log' });
    }
});
router.get('/games/:gameId/seed', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.param)('gameId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const result = await (0, database_js_1.query)('SELECT game_log, game_data FROM game_states WHERE room_id = $1', [gameId]);
        const row = result.rows?.[0];
        let seed = null;
        let source = null;
        const logArr = Array.isArray(row?.game_log) ? row?.game_log : [];
        for (let i = logArr.length - 1; i >= 0; i--) {
            const entry = logArr[i];
            if (entry?.type === 'RNG' && entry?.scope === 'combat') {
                const s = entry?.seed;
                if (typeof s === 'string' && s.trim().length > 0) {
                    seed = s;
                    source = 'log';
                    break;
                }
            }
        }
        if (!seed) {
            const data = row?.game_data;
            const s = data && typeof data === 'object' ? data.combatRngSeed : null;
            if (typeof s === 'string' && s.trim().length > 0) {
                seed = s;
                source = 'state';
            }
        }
        res.json({ seed, source });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get combat RNG seed', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({ error: 'Failed to get combat RNG seed' });
    }
});
router.get('/games/:gameId/state', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.param)('gameId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const result = await (0, database_js_1.query)('SELECT game_data FROM game_states WHERE room_id = $1', [gameId]);
        res.json({ state: result.rows?.[0]?.game_data ?? null });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get game state', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({ error: 'Failed to get game state' });
    }
});
router.get('/games/:gameId/snapshots', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.param)('gameId').isUUID(), (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 200 }), (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }), (0, express_validator_1.query)('order').optional().isIn(['asc', 'desc']), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const limit = Math.min(parseInt(req.query.limit || '20', 10), 200);
        const offset = parseInt(req.query.offset || '0', 10);
        const order = (req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const listSql = `
        SELECT id, room_id, turn_number, phase, created_at
        FROM game_state_snapshots
        WHERE room_id = $1
        ORDER BY created_at ${order}
        LIMIT $2 OFFSET $3
      `;
        const rowsRes = await (0, database_js_1.query)(listSql, [gameId, limit, offset]);
        const countRes = await (0, database_js_1.query)(`SELECT COUNT(*) as total FROM game_state_snapshots WHERE room_id = $1`, [gameId]);
        res.json({
            snapshots: rowsRes.rows || [],
            total: Number.parseInt(countRes.rows?.[0]?.total ?? '0', 10),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to list snapshots', 500, { gameId: req.params.gameId });
        res.status(500).json({ error: 'Failed to list snapshots' });
    }
});
router.get('/games/:gameId/snapshots/:snapshotId', (0, adminAuth_js_1.requirePermission)('games.view'), (0, express_validator_1.param)('gameId').isUUID(), (0, express_validator_1.param)('snapshotId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { gameId, snapshotId } = req.params;
        const result = await (0, database_js_1.query)(`SELECT id, room_id, turn_number, phase, snapshot, created_at
         FROM game_state_snapshots
         WHERE id = $1 AND room_id = $2`, [snapshotId, gameId]);
        if (result.rowCount === 0) {
            res.status(404).json({ error: 'Snapshot not found' });
            return;
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get snapshot', 500, {
            gameId: req.params.gameId,
            snapshotId: req.params.snapshotId,
        });
        res.status(500).json({ error: 'Failed to get snapshot' });
    }
});
router.get('/games/active', (0, adminAuth_js_1.requirePermission)('games.view'), async (_req, res) => {
    try {
        const result = await (0, database_js_1.query)(`
        SELECT COUNT(*) as count 
        FROM game_rooms 
        WHERE status IN ('active', 'initializing')
      `);
        res.json({
            activeGames: parseInt(result.rows[0]?.count || '0', 10),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, _req, 'Failed to get active games count');
        res.status(500).json({
            error: 'Failed to get active games count',
        });
    }
});
router.post('/games/:gameId/force-end', (0, adminAuth_js_1.requirePermission)('games.manage'), (0, adminAuth_js_1.logAdminActivity)('game_force_end'), (0, express_validator_1.param)('gameId').isUUID(), (0, express_validator_1.body)('reason').isString().isLength({ min: 1, max: 500 }), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const { reason } = req.body;
        const adminUserId = req.userId;
        await (0, database_js_1.query)('UPDATE game_rooms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['abandoned', gameId]);
        try {
            const lifecycle = new gameLifecycleService_js_1.GameLifecycleService();
            await lifecycle.refreshLifecycle(gameId);
        }
        catch (_e) {
        }
        await (0, database_js_1.query)(`INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            adminUserId,
            'game_force_end',
            JSON.stringify({ reason, gameId }),
            'game',
            gameId,
            req.ip,
            req.get('User-Agent'),
        ]);
        res.json({ success: true, message: 'Game force-ended successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to force-end game', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to force-end game',
        });
    }
});
router.post('/games/:gameId/pause', (0, adminAuth_js_1.requirePermission)('games.manage'), (0, adminAuth_js_1.logAdminActivity)('game_pause'), (0, express_validator_1.param)('gameId').isUUID(), (0, express_validator_1.body)('reason').optional().isString().isLength({ max: 500 }), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const { reason } = req.body;
        const adminUserId = req.userId;
        const result = await (0, database_js_1.query)(`UPDATE game_rooms 
         SET status = 'paused', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status IN ('in_progress', 'starting', 'active')
         RETURNING id`, [gameId]);
        if (result.rowCount === 0) {
            res.status(409).json({
                error: 'Game must be in progress to pause',
            });
            return;
        }
        await (0, database_js_1.query)(`INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            adminUserId,
            'game_pause',
            JSON.stringify({ reason, gameId }),
            'game',
            gameId,
            req.ip,
            req.get('User-Agent'),
        ]);
        res.json({ success: true, message: 'Game paused successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to pause game', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to pause game',
        });
    }
});
router.post('/games/:gameId/resume', (0, adminAuth_js_1.requirePermission)('games.manage'), (0, adminAuth_js_1.logAdminActivity)('game_resume'), (0, express_validator_1.param)('gameId').isUUID(), (0, express_validator_1.body)('reason').optional().isString().isLength({ max: 500 }), checkValidation, async (req, res) => {
    try {
        const { gameId } = req.params;
        const { reason } = req.body;
        const adminUserId = req.userId;
        const result = await (0, database_js_1.query)(`UPDATE game_rooms 
         SET status = 'active', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status = 'paused'
         RETURNING id`, [gameId]);
        if (result.rowCount === 0) {
            res.status(409).json({
                error: 'Game must be paused to resume',
            });
            return;
        }
        await (0, database_js_1.query)(`INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            adminUserId,
            'game_resume',
            JSON.stringify({ reason, gameId }),
            'game',
            gameId,
            req.ip,
            req.get('User-Agent'),
        ]);
        res.json({ success: true, message: 'Game resumed successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to resume game', 500, {
            gameId: req.params.gameId,
        });
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to resume game',
        });
    }
});
router.delete('/games/:gameId', (0, adminAuth_js_1.requirePermission)('games.manage'), (0, adminAuth_js_1.logAdminActivity)('game_delete'), (0, express_validator_1.param)('gameId').isUUID(), checkValidation, async (req, res) => {
    const { gameId } = req.params;
    try {
        const { deleted } = await (0, database_js_1.transaction)(async (client) => {
            const exists = await (0, database_js_1.query)('SELECT id FROM game_rooms WHERE id = $1 FOR UPDATE', [gameId], { client });
            if ((exists.rowCount ?? 0) === 0) {
                return { deleted: false };
            }
            await (0, database_js_1.query)('DELETE FROM rating_history WHERE game_room_id = $1', [gameId], { client });
            await (0, database_js_1.query)('DELETE FROM game_rooms WHERE id = $1', [gameId], { client });
            return { deleted: true };
        });
        if (!deleted) {
            res.status(404).json({ error: 'Game not found' });
            return;
        }
        try {
            const { gameStateCache } = await import('../services/cacheService.js');
            await gameStateCache.deleteGameState(gameId);
        }
        catch (_e) {
        }
        res.json({ success: true, message: 'Game and related data deleted' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to delete game', 500, { gameId });
        res.status(500).json({ error: 'Failed to delete game' });
    }
});
router.get('/games/active', (0, adminAuth_js_1.requirePermission)('games.view'), async (_req, res) => {
    try {
        const gamesQuery = `
        SELECT 
          gr.id,
          gr.name,
          gr.status,
          gr.max_players,
          gr.created_at,
          gr.updated_at,
          m.name as map_name,
          u.username as host_username,
          COUNT(rp.user_id) as player_count,
          EXTRACT(EPOCH FROM (NOW() - gr.created_at)) / 60 as duration_minutes
        FROM game_rooms gr
        LEFT JOIN maps m ON gr.map_id = m.id
        LEFT JOIN users u ON gr.host_id = u.id
        LEFT JOIN room_players rp ON gr.id = rp.room_id
        WHERE gr.status IN ('waiting', 'in_progress', 'starting')
        GROUP BY gr.id, m.name, u.username
        ORDER BY gr.created_at DESC
        LIMIT 50
      `;
        const result = await (0, database_js_1.query)(gamesQuery);
        const games = result.rows.map((game) => ({
            id: game.id,
            name: game.name || `Game ${game.id.slice(0, 8)}`,
            status: normalizeAdminGameStatus(game.status),
            phase: 'reinforcement',
            playerCount: parseInt(String(game.player_count ?? '0'), 10),
            maxPlayers: game.max_players ?? 0,
            mapName: game.map_name ?? undefined,
            createdBy: game.host_username ?? undefined,
            duration: `${Math.floor(parseFloat(String(game.duration_minutes ?? '0')))} min`,
            turnCount: 0,
        }));
        res.json(games);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, _req, 'Failed to get active games');
        res.status(500).json({ error: 'Failed to get active games' });
    }
});
router.get('/feature-flags', (0, adminAuth_js_1.requirePermission)('system.view'), async (_req, res) => {
    try {
        const flags = await adminService_js_1.adminService.getFeatureFlags();
        res.json(flags);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, _req, 'Failed to get feature flags');
        res.status(500).json({ error: 'Failed to get feature flags' });
    }
});
router.put('/feature-flags/:flagName', (0, adminAuth_js_1.requirePermission)('system.admin'), (0, adminAuth_js_1.logAdminActivity)('feature_flag_toggle'), (0, express_validator_1.param)('flagName').isString(), (0, express_validator_1.body)('enabled').isBoolean(), checkValidation, async (req, res) => {
    try {
        const { flagName } = req.params;
        const { enabled } = req.body;
        const adminUserId = req.userId;
        const updated = await adminService_js_1.adminService.toggleFeatureFlag(flagName, enabled, adminUserId);
        if (!updated) {
            res.status(404).json({ error: 'Feature flag not found' });
            return;
        }
        res.json({ message: 'Feature flag updated successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to toggle feature flag', 500, {
            flagName: req.params.flagName,
        });
        res.status(500).json({ error: 'Failed to toggle feature flag' });
    }
});
router.patch('/feature-flags/:flagName', (0, adminAuth_js_1.requirePermission)('system.admin'), (0, adminAuth_js_1.logAdminActivity)('feature_flag_update'), (0, express_validator_1.param)('flagName').isString(), (0, express_validator_1.body)('description').optional().isString(), (0, express_validator_1.body)('accessLevel').optional().isIn(['disabled', 'internal', 'beta', 'public']), (0, express_validator_1.body)('category').optional().isString(), (0, express_validator_1.body)('config').optional().isObject(), (0, express_validator_1.body)('dependencies').optional().isArray(), (0, express_validator_1.body)('dependencies.*').optional().isString(), (0, express_validator_1.body)('reason').optional().isString(), checkValidation, async (req, res) => {
    try {
        const { flagName } = req.params;
        const { description, accessLevel, category, config, dependencies, reason } = req.body;
        const updated = await adminService_js_1.adminService.updateFeatureFlagSettings(flagName, {
            description,
            accessLevel,
            category,
            config,
            dependencies,
        }, req.userId, reason);
        if (!updated) {
            res.status(404).json({ error: 'Feature flag not found' });
            return;
        }
        res.json({ message: 'Feature flag updated successfully', flag: updated });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update feature flag', 500, {
            flagName: req.params.flagName,
        });
        res.status(500).json({ error: 'Failed to update feature flag' });
    }
});
router.get('/users/:userId/feature-flags', (0, adminAuth_js_1.requirePermission)('users.view'), (0, express_validator_1.param)('userId').isUUID(), checkValidation, async (req, res) => {
    try {
        const assignments = await adminService_js_1.adminService.getUserFeatureFlagAssignments(req.params.userId);
        res.json(assignments);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch user feature flags', 500, {
            targetUserId: req.params.userId,
        });
        res.status(500).json({ error: 'Failed to fetch user feature flags' });
    }
});
router.put('/users/:userId/feature-flags/:flagName', (0, adminAuth_js_1.requirePermission)('users.edit'), (0, adminAuth_js_1.logAdminActivity)('feature_flag_user_override_set'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.param)('flagName').isString(), (0, express_validator_1.body)('enabled').isBoolean(), checkValidation, async (req, res) => {
    try {
        const { userId, flagName } = req.params;
        const { enabled } = req.body;
        await adminService_js_1.adminService.setUserFeatureFlagOverride(userId, flagName, enabled, req.userId);
        res.json({ message: 'Feature flag override updated' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to set user feature flag override', 500, {
            targetUserId: req.params.userId,
            flagName: req.params.flagName,
        });
        res.status(500).json({ error: 'Failed to set feature flag override' });
    }
});
router.delete('/users/:userId/feature-flags/:flagName', (0, adminAuth_js_1.requirePermission)('users.edit'), (0, adminAuth_js_1.logAdminActivity)('feature_flag_user_override_cleared'), (0, express_validator_1.param)('userId').isUUID(), (0, express_validator_1.param)('flagName').isString(), checkValidation, async (req, res) => {
    try {
        const { userId, flagName } = req.params;
        await adminService_js_1.adminService.clearUserFeatureFlagOverride(userId, flagName, req.userId);
        res.status(204).send();
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to clear user feature flag override', 500, {
            targetUserId: req.params.userId,
            flagName: req.params.flagName,
        });
        res.status(500).json({ error: 'Failed to clear feature flag override' });
    }
});
router.get('/logs/admin-activity', (0, adminAuth_js_1.requirePermission)('logs.view'), (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 500 }), (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }), checkValidation, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 100;
        const offset = parseInt(req.query.offset, 10) || 0;
        const logs = await adminService_js_1.adminService.getAdminActivityLogs(limit, offset);
        res.json(logs);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get admin activity logs', 500, {
            limit: req.query.limit,
            offset: req.query.offset,
        });
        res.status(500).json({ error: 'Failed to get admin activity logs' });
    }
});
router.get('/system/status', (0, adminAuth_js_1.requirePermission)('system.view'), async (_req, res) => {
    try {
        const dbStats = await (0, database_js_1.query)(`
        SELECT 
          (SELECT COUNT(*) FROM users) as user_count,
          (SELECT COUNT(*) FROM users WHERE email_verified = TRUE) as verified_users,
          (SELECT COUNT(*) FROM users WHERE is_beta_user = TRUE) as beta_users,
          (SELECT COUNT(*) FROM users WHERE is_vip = TRUE) as vip_users,
          (SELECT COUNT(*) FROM users WHERE premium_tier IS NOT NULL AND premium_tier <> 'free') as premium_users,
          (SELECT COUNT(*) FROM maps) as map_count,
          (SELECT COUNT(*) FROM maps WHERE status = 'pending_review') as maps_pending_review,
          (SELECT COUNT(*) FROM maps WHERE is_public = TRUE) as public_maps,
          (SELECT COUNT(*) FROM game_rooms WHERE status IN ('in_progress', 'starting')) as active_games,
          (SELECT COUNT(*) FROM map_approval_requests WHERE decision IS NULL) as pending_approvals
      `);
        const featureFlags = await adminService_js_1.adminService.getFeatureFlags();
        const statsRow = dbStats.rows[0] ?? {};
        const parseCount = (value) => parseInt(value?.toString() ?? '0', 10);
        res.json({
            timestamp: new Date().toISOString(),
            database: {
                userCount: parseCount(statsRow.user_count),
                verifiedUsers: parseCount(statsRow.verified_users),
                betaUsers: parseCount(statsRow.beta_users),
                vipUsers: parseCount(statsRow.vip_users),
                premiumUsers: parseCount(statsRow.premium_users),
                mapCount: parseCount(statsRow.map_count),
                mapsPendingReview: parseCount(statsRow.maps_pending_review),
                publicMaps: parseCount(statsRow.public_maps),
                activeGames: parseCount(statsRow.active_games),
                pendingApprovals: parseCount(statsRow.pending_approvals),
            },
            featureFlags: featureFlags.reduce((acc, flag) => {
                acc[flag.flagName] = flag.isEnabled;
                return acc;
            }, {}),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, _req, 'Failed to get system status');
        res.status(500).json({ error: 'Failed to get system status' });
    }
});
router.get('/maps/:mapId', (0, adminAuth_js_1.requirePermission)('content.view'), (0, express_validator_1.param)('mapId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { mapId } = req.params;
        const mapResult = await (0, database_js_1.query)(`SELECT 
          m.*,
          u.username as creator_name
        FROM maps m
        LEFT JOIN users u ON m.creator_id = u.id
        WHERE m.id = $1`, [mapId]);
        if (mapResult.rows.length === 0) {
            res.status(404).json({ error: 'Map not found' });
            return;
        }
        const map = mapResult.rows[0];
        const territoriesResult = await (0, database_js_1.query)('SELECT * FROM map_territories WHERE map_id = $1', [
            mapId,
        ]);
        const normalizedAdjacencies = await mapService_js_1.mapService.getMapAdjacencies(mapId);
        const adjacencies = normalizedAdjacencies.map((a) => ({
            from: a.fromTerritoryId,
            to: a.toTerritoryId,
        }));
        res.json({
            ...map,
            territories: territoriesResult.rows,
            adjacencies,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get map details', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ error: 'Failed to get map details' });
    }
});
router.put('/maps/:mapId/content', (0, adminAuth_js_1.requirePermission)('content.edit'), (0, adminAuth_js_1.logAdminActivity)('map_content_update'), (0, express_validator_1.param)('mapId').isUUID(), (0, express_validator_1.body)('metadata').optional().isObject(), (0, express_validator_1.body)('name').optional().isString().isLength({ min: 1, max: 100 }), (0, express_validator_1.body)('description').optional().isString().isLength({ max: 1000 }), (0, express_validator_1.body)('imageUrl').optional().isString(), (0, express_validator_1.body)('imageWidth').optional().isInt({ min: 1, max: 10000 }), (0, express_validator_1.body)('imageHeight').optional().isInt({ min: 1, max: 10000 }), (0, express_validator_1.body)('isPublic').optional().isBoolean(), (0, express_validator_1.body)('tags').optional().isArray(), (0, express_validator_1.body)('minPlayers').optional().isInt({ min: 2, max: 20 }), (0, express_validator_1.body)('maxPlayers').optional().isInt({ min: 2, max: 20 }), checkValidation, async (req, res) => {
    try {
        const { mapId } = req.params;
        const { metadata, name, description, imageUrl, imageWidth, imageHeight, isPublic, tags, minPlayers, maxPlayers, } = req.body || {};
        const existing = await mapService_js_1.mapService.getMap(mapId);
        if (!existing) {
            res.status(404).json({ error: 'Map not found' });
            return;
        }
        if (metadata && typeof metadata === 'object') {
            await mapService_js_1.mapService.updateMapContentFromMetadata(mapId, metadata);
        }
        if (name !== undefined ||
            description !== undefined ||
            imageUrl !== undefined ||
            imageWidth !== undefined ||
            imageHeight !== undefined ||
            isPublic !== undefined ||
            tags !== undefined) {
            await mapService_js_1.mapService.updateMap(mapId, req.userId, {
                name,
                description,
                imageUrl,
                imageWidth,
                imageHeight,
                isPublic,
                tags,
            }, { isAdmin: true, allowCollaborator: true });
        }
        if (minPlayers !== undefined || maxPlayers !== undefined) {
            const sets = [];
            const params = [];
            let idx = 1;
            if (minPlayers !== undefined) {
                sets.push(`min_players = $${idx++}`);
                params.push(minPlayers);
            }
            if (maxPlayers !== undefined) {
                sets.push(`max_players = $${idx++}`);
                params.push(maxPlayers);
            }
            params.push(mapId);
            await (0, database_js_1.query)(`UPDATE maps SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}`, params);
        }
        res.json({ success: true });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update map content', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ error: 'Failed to update map content' });
    }
});
router.get('/maps', (0, adminAuth_js_1.requirePermission)('content.view'), (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }), (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }), (0, express_validator_1.query)('status').optional().isString(), (0, express_validator_1.query)('search').optional().isString(), (0, express_validator_1.query)('includeAll').optional().isBoolean(), checkValidation, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = parseInt(req.query.offset, 10) || 0;
        const status = req.query.status;
        const search = req.query.search;
        const includeAll = req.query.includeAll === 'true';
        let mapsQuery = `
        SELECT 
          m.*,
          u.username as "creatorName",
          COUNT(DISTINCT gr.id) as "playCount",
          COALESCE(AVG(mr.rating), 0) as "ratingAverage",
          COUNT(DISTINCT mr.id) as "ratingCount",
          (SELECT COUNT(*) FROM map_territories WHERE map_id = m.id) as "territoryCount",
          (SELECT COUNT(DISTINCT sector) FROM map_territories WHERE map_id = m.id AND sector IS NOT NULL) as "continentCount"
        FROM maps m
        LEFT JOIN users u ON m.creator_id = u.id
        LEFT JOIN game_rooms gr ON gr.map_id = m.id
        LEFT JOIN map_ratings mr ON mr.map_id = m.id
        WHERE 1=1
      `;
        const queryParams = [];
        let paramIndex = 1;
        if (!includeAll && status && status !== 'all') {
            mapsQuery += ` AND m.status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }
        else if (!includeAll) {
            mapsQuery += ` AND m.status = 'approved'`;
        }
        if (search) {
            mapsQuery += ` AND (m.name ILIKE $${paramIndex} OR m.description ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }
        mapsQuery += `
        GROUP BY m.id, u.username
        ORDER BY 
          CASE WHEN m.status = 'pending_review' THEN 0 ELSE 1 END,
          m.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
        queryParams.push(limit, offset);
        paramIndex += 2;
        const mapsResult = await (0, database_js_1.query)(mapsQuery, queryParams);
        let countQuery = `
        SELECT COUNT(*) as total
        FROM maps m
        WHERE 1=1
      `;
        const countParams = [];
        let countParamIndex = 1;
        if (!includeAll && status && status !== 'all') {
            countQuery += ` AND m.status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }
        else if (!includeAll) {
            countQuery += ` AND m.status = 'approved'`;
        }
        if (search) {
            countQuery += ` AND (m.name ILIKE $${countParamIndex} OR m.description ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
        }
        const countResult = await (0, database_js_1.query)(countQuery, countParams);
        const maps = mapsResult.rows.map((map) => {
            const imageUrl = (0, url_js_1.resolveAssetUrl)(req, map.image_url);
            return {
                ...map,
                image_url: imageUrl,
                imageUrl,
                playCount: parseInt(String(map.playCount ?? '0'), 10),
                ratingAverage: Number.parseFloat(String(map.ratingAverage ?? '0')),
                ratingCount: parseInt(String(map.ratingCount ?? '0'), 10),
                territoryCount: parseInt(String(map.territoryCount ?? '0'), 10),
                continentCount: parseInt(String(map.continentCount ?? '0'), 10),
                createdAt: map.created_at,
                updatedAt: map.updated_at,
                creatorId: map.creator_id,
                minPlayers: map.min_players,
                maxPlayers: map.max_players,
                isPublic: map.is_public,
                isFeatured: map.is_featured,
                isVipOnly: map.is_vip_only || false,
            };
        });
        res.json({
            maps,
            total: parseInt(countResult.rows[0]?.total || '0', 10),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to get maps', 500, {
            limit: req.query.limit,
            offset: req.query.offset,
            status: req.query.status,
        });
        res.status(500).json({ error: 'Failed to get maps' });
    }
});
router.patch('/maps/:mapId', (0, adminAuth_js_1.requirePermission)('content.edit'), (0, adminAuth_js_1.logAdminActivity)('map_update'), (0, express_validator_1.param)('mapId').isUUID(), (0, express_validator_1.body)('name').optional().isString().isLength({ min: 1, max: 100 }), (0, express_validator_1.body)('description').optional().isString().isLength({ max: 1000 }), (0, express_validator_1.body)('minPlayers').optional().isInt({ min: 2, max: 20 }), (0, express_validator_1.body)('maxPlayers').optional().isInt({ min: 2, max: 20 }), (0, express_validator_1.body)('status').optional().isIn(['draft', 'pending_review', 'approved', 'rejected', 'archived']), (0, express_validator_1.body)('isFeatured').optional().isBoolean(), (0, express_validator_1.body)('isPublic').optional().isBoolean(), (0, express_validator_1.body)('isVipOnly').optional().isBoolean(), checkValidation, async (req, res) => {
    try {
        const { mapId } = req.params;
        const { name, description, minPlayers, maxPlayers, status, isFeatured, isPublic, isVipOnly } = req.body;
        const adminUserId = req.userId;
        const updates = [];
        const params = [];
        let paramIndex = 1;
        if (name !== undefined) {
            updates.push(`name = $${paramIndex}`);
            params.push(name);
            paramIndex++;
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex}`);
            params.push(description);
            paramIndex++;
        }
        if (minPlayers !== undefined) {
            updates.push(`min_players = $${paramIndex}`);
            params.push(minPlayers);
            paramIndex++;
        }
        if (maxPlayers !== undefined) {
            updates.push(`max_players = $${paramIndex}`);
            params.push(maxPlayers);
            paramIndex++;
        }
        if (status !== undefined) {
            updates.push(`status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }
        if (isFeatured !== undefined) {
            updates.push(`is_featured = $${paramIndex}`);
            params.push(isFeatured);
            paramIndex++;
        }
        if (isPublic !== undefined) {
            updates.push(`is_public = $${paramIndex}`);
            params.push(isPublic);
            paramIndex++;
        }
        if (isVipOnly !== undefined) {
            updates.push(`is_vip_only = $${paramIndex}`);
            params.push(isVipOnly);
            paramIndex++;
        }
        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(mapId);
        const updateQuery = `
        UPDATE maps 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
        const result = await (0, database_js_1.query)(updateQuery, params);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Map not found' });
            return;
        }
        await (0, database_js_1.query)(`INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            adminUserId,
            'map_update',
            JSON.stringify({ mapId, changes: req.body }),
            'map',
            mapId,
            req.ip,
            req.get('User-Agent'),
        ]);
        res.json({ message: 'Map updated successfully', map: result.rows[0] });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update map', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ error: 'Failed to update map' });
    }
});
router.post('/maps/:mapId/clone', (0, adminAuth_js_1.requirePermission)('content.create'), (0, adminAuth_js_1.logAdminActivity)('map_clone'), (0, express_validator_1.param)('mapId').isUUID(), (0, express_validator_1.body)('assignedUserId').optional().isUUID().withMessage('Assigned user must be a valid UUID'), checkValidation, async (req, res) => {
    try {
        const { mapId } = req.params;
        const adminUserId = req.userId;
        const assignedUserId = req.body.assignedUserId;
        const originalMapResult = await (0, database_js_1.query)('SELECT * FROM maps WHERE id = $1', [mapId]);
        if (originalMapResult.rows.length === 0) {
            res.status(404).json({ error: 'Map not found' });
            return;
        }
        const originalMap = originalMapResult.rows[0];
        const clonedName = `${originalMap.name} (Copy)`;
        if (assignedUserId) {
            const assignedUserCheck = await (0, database_js_1.query)('SELECT id FROM users WHERE id = $1', [
                assignedUserId,
            ]);
            if (assignedUserCheck.rows.length === 0) {
                res.status(404).json({ error: 'Assigned user not found' });
                return;
            }
        }
        const cloneResult = await (0, database_js_1.query)(`INSERT INTO maps (name, description, image_url, min_players, max_players, creator_id, status, capital_assignments, capital_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`, [
            clonedName,
            originalMap.description,
            originalMap.image_url,
            originalMap.min_players,
            originalMap.max_players,
            adminUserId,
            'draft',
            originalMap.capital_assignments,
            originalMap.capital_metadata,
        ]);
        const clonedMap = cloneResult.rows[0];
        if (assignedUserId) {
            await (0, database_js_1.query)(`
          INSERT INTO map_collaborators (map_id, user_id, role, assigned_by)
          VALUES ($1, $2, 'editor', $3)
          ON CONFLICT (map_id, user_id)
          DO UPDATE SET role = EXCLUDED.role, assigned_at = CURRENT_TIMESTAMP, assigned_by = EXCLUDED.assigned_by
        `, [clonedMap.id, assignedUserId, adminUserId]);
        }
        const territoriesResult = await (0, database_js_1.query)('SELECT * FROM map_territories WHERE map_id = $1', [
            mapId,
        ]);
        if (territoriesResult.rows.length > 0) {
            for (const territory of territoriesResult.rows) {
                await (0, database_js_1.query)(`INSERT INTO map_territories (map_id, name, polygon, center_x, center_y, sector, army_position, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                    clonedMap.id,
                    territory.name,
                    territory.polygon,
                    territory.center_x,
                    territory.center_y,
                    territory.sector ?? territory.continent,
                    territory.army_position,
                    territory.metadata,
                ]);
            }
        }
        const adjacenciesResult = await (0, database_js_1.query)('SELECT * FROM territory_adjacencies WHERE map_id = $1', [mapId]);
        if (adjacenciesResult.rows.length > 0) {
            for (const adjacency of adjacenciesResult.rows) {
                await (0, database_js_1.query)(`INSERT INTO territory_adjacencies (map_id, territory_from, territory_to)
             VALUES ($1, $2, $3)`, [clonedMap.id, adjacency.territory_from, adjacency.territory_to]);
            }
        }
        await (0, database_js_1.query)(`INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            adminUserId,
            'map_clone',
            JSON.stringify({ originalMapId: mapId, clonedMapId: clonedMap.id }),
            'map',
            clonedMap.id,
            req.ip,
            req.get('User-Agent'),
        ]);
        res.json({
            message: 'Map cloned successfully',
            map: clonedMap,
            name: clonedName,
            assignedTo: assignedUserId ?? adminUserId,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to clone map', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ error: 'Failed to clone map' });
    }
});
router.patch('/maps/:mapId/status', (0, adminAuth_js_1.requirePermission)('content.moderate'), (0, adminAuth_js_1.logAdminActivity)('map_status_update'), (0, express_validator_1.param)('mapId').isUUID(), (0, express_validator_1.body)('status').isIn(['draft', 'pending_review', 'approved', 'rejected', 'archived']), (0, express_validator_1.body)('notes').optional().isString().isLength({ max: 1000 }), checkValidation, async (req, res) => {
    try {
        const { mapId } = req.params;
        const { status, notes } = req.body;
        const adminUserId = req.userId;
        const mapResult = await (0, database_js_1.query)(`UPDATE maps 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`, [status, mapId]);
        if (mapResult.rows.length === 0) {
            res.status(404).json({ error: 'Map not found' });
            return;
        }
        if (status === 'approved' || status === 'rejected') {
            await (0, database_js_1.query)(`INSERT INTO map_reviews (map_id, reviewer_id, status, notes, reviewed_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (map_id, reviewer_id) 
           DO UPDATE SET status = $3, notes = $4, reviewed_at = CURRENT_TIMESTAMP`, [mapId, adminUserId, status, notes]);
        }
        await (0, database_js_1.query)(`INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            adminUserId,
            'map_status_update',
            JSON.stringify({ mapId, status, notes }),
            'map',
            mapId,
            req.ip,
            req.get('User-Agent'),
        ]);
        res.json({ message: 'Map status updated successfully', map: mapResult.rows[0] });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update map status', 500, {
            mapId: req.params.mapId,
            status: req.body?.status,
        });
        res.status(500).json({ error: 'Failed to update map status' });
    }
});
router.delete('/maps/:mapId', (0, adminAuth_js_1.requirePermission)('content.delete'), (0, adminAuth_js_1.logAdminActivity)('map_delete'), (0, express_validator_1.param)('mapId').isUUID(), checkValidation, async (req, res) => {
    try {
        const { mapId } = req.params;
        const adminUserId = req.userId;
        const gamesCheck = await (0, database_js_1.query)(`SELECT COUNT(*) as count 
         FROM game_rooms 
         WHERE map_id = $1 AND status IN ('in_progress', 'starting', 'waiting')`, [mapId]);
        if (parseInt(gamesCheck.rows[0].count, 10) > 0) {
            res.status(400).json({
                error: 'Cannot delete map that is being used in active or waiting games',
            });
            return;
        }
        const mapInfo = await (0, database_js_1.query)('SELECT * FROM maps WHERE id = $1', [mapId]);
        if (mapInfo.rows.length === 0) {
            res.status(404).json({ error: 'Map not found' });
            return;
        }
        await mapService_js_1.mapService.deleteMap(mapId, adminUserId, { isAdmin: true });
        await (0, database_js_1.query)(`INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            adminUserId,
            'map_delete',
            JSON.stringify({ mapId, mapName: mapInfo.rows[0].name }),
            'map',
            mapId,
            req.ip,
            req.get('User-Agent'),
        ]);
        res.json({ message: 'Map deleted successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to delete map', 500, {
            mapId: req.params.mapId,
        });
        res.status(500).json({ error: 'Failed to delete map' });
    }
});
router.post('/cache/refresh', async (req, res) => {
    try {
        const userId = req.userId;
        logger_js_1.logger.info('Admin cache refresh requested', { adminId: userId });
        try {
            await adminService_js_1.adminService.logAdminAction(userId, 'cache.refresh', {
                timestamp: new Date().toISOString(),
            });
        }
        catch (logError) {
            logger_js_1.logger.warn('Failed to log cache refresh activity:', logError);
        }
        const { mapService } = (await import('../services/mapService.js'));
        if (mapService && typeof mapService.clearCache === 'function') {
            mapService.clearCache();
        }
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            try {
                const { getRedisClient } = await import('../config/redis.js');
                const redis = getRedisClient();
                if (redis) {
                    await redis.flushdb();
                    logger_js_1.logger.info('Redis cache cleared');
                }
                else {
                    logger_js_1.logger.info('Redis not connected, skipping cache clear');
                }
            }
            catch (redisError) {
                logger_js_1.logger.warn('Redis cache clear failed (non-critical):', redisError);
            }
        }
        logger_js_1.logger.info('Cache refresh completed successfully', { adminId: userId });
        res.json({
            success: true,
            message: 'Cache refreshed successfully',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to refresh cache');
        res.status(500).json({ error: 'Failed to refresh cache' });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map