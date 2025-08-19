import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin, requirePermission, logAdminActivity } from '../middleware/adminAuth';
import { adminService } from '../services/adminService';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// Validation middleware
const checkValidation = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  return next();
};

// ============= ADMIN INFO =============

// Get current admin user info
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const adminInfo = await adminService.getUserAdminInfo(userId);
    
    res.json({
      userId,
      adminRoles: adminInfo,
      isAdmin: true
    });
  } catch (error) {
    logger.error('Error getting admin info:', error);
    res.status(500).json({ error: 'Failed to get admin info' });
  }
});

// ============= USER MANAGEMENT =============

// Get all users with admin controls
router.get('/users',
  requirePermission('users.view'),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('search').optional().isString(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const search = req.query.search as string;

      const result = await adminService.getAllUsers(limit, offset, search);
      res.json(result);
    } catch (error) {
      logger.error('Error getting users:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  }
);

// Update user account status (ban/suspend/activate)
router.put('/users/:userId/status',
  requirePermission('users.moderate'),
  logAdminActivity('user_status_update'),
  param('userId').isUUID(),
  body('status').isIn(['active', 'suspended', 'banned']),
  body('reason').optional().isString().isLength({ max: 500 }),
  body('expiresAt').optional().isISO8601(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { status, reason, expiresAt } = req.body;
      const adminUserId = (req as any).userId;

      const expirationDate = expiresAt ? new Date(expiresAt) : undefined;
      
      await adminService.updateUserStatus(
        userId, 
        adminUserId, 
        status, 
        reason, 
        expirationDate
      );

      res.json({ message: 'User status updated successfully' });
    } catch (error) {
      logger.error('Error updating user status:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  }
);

// Reset user password
router.post('/users/:userId/reset-password',
  requirePermission('users.edit'),
  logAdminActivity('password_reset'),
  param('userId').isUUID(),
  body('newPassword').isLength({ min: 6 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;
      const adminUserId = (req as any).userId;

      await adminService.resetUserPassword(userId, adminUserId, newPassword);
      
      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      logger.error('Error resetting password:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

// Assign admin role to user
router.post('/users/:userId/admin-roles',
  requirePermission('admin.manage'),
  logAdminActivity('admin_role_assign'),
  param('userId').isUUID(),
  body('roleId').isUUID(),
  body('expiresAt').optional().isISO8601(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { roleId, expiresAt } = req.body;
      const adminUserId = (req as any).userId;

      const expirationDate = expiresAt ? new Date(expiresAt) : undefined;
      
      await adminService.assignAdminRole(userId, roleId, adminUserId, expirationDate);
      
      res.json({ message: 'Admin role assigned successfully' });
    } catch (error) {
      logger.error('Error assigning admin role:', error);
      res.status(500).json({ error: 'Failed to assign admin role' });
    }
  }
);

// Remove admin role from user
router.delete('/users/:userId/admin-roles/:roleId',
  requirePermission('admin.manage'),
  logAdminActivity('admin_role_remove'),
  param('userId').isUUID(),
  param('roleId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId, roleId } = req.params;
      const adminUserId = (req as any).userId;
      
      await adminService.removeAdminRole(userId, roleId, adminUserId);
      
      res.json({ message: 'Admin role removed successfully' });
    } catch (error) {
      logger.error('Error removing admin role:', error);
      res.status(500).json({ error: 'Failed to remove admin role' });
    }
  }
);

// ============= CONTENT MODERATION =============

// Get content approval queue
router.get('/content/approval-queue',
  requirePermission('content.moderate'),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await adminService.getContentApprovalQueue(limit, offset);
      res.json(result);
    } catch (error) {
      logger.error('Error getting approval queue:', error);
      res.status(500).json({ error: 'Failed to get approval queue' });
    }
  }
);

// Approve content
router.post('/content/approval-queue/:queueId/approve',
  requirePermission('content.moderate'),
  logAdminActivity('content_approve'),
  param('queueId').isUUID(),
  body('notes').optional().isString().isLength({ max: 1000 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { queueId } = req.params;
      const { notes } = req.body;
      const adminUserId = (req as any).userId;

      await adminService.approveContent(queueId, adminUserId, notes);
      
      res.json({ message: 'Content approved successfully' });
    } catch (error) {
      logger.error('Error approving content:', error);
      res.status(500).json({ error: 'Failed to approve content' });
    }
  }
);

// Reject content
router.post('/content/approval-queue/:queueId/reject',
  requirePermission('content.moderate'),
  logAdminActivity('content_reject'),
  param('queueId').isUUID(),
  body('reason').isString().isLength({ min: 1, max: 1000 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { queueId } = req.params;
      const { reason } = req.body;
      const adminUserId = (req as any).userId;

      await adminService.rejectContent(queueId, adminUserId, reason);
      
      res.json({ message: 'Content rejected successfully' });
    } catch (error) {
      logger.error('Error rejecting content:', error);
      res.status(500).json({ error: 'Failed to reject content' });
    }
  }
);

// ============= GAME MANAGEMENT =============

// Get all games with admin controls
router.get('/games',
  requirePermission('games.view'),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('status').optional().isString(),
  query('search').optional().isString(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;
      const search = req.query.search as string;

      const { query } = require('../config/database');
      
      let gamesQuery = `
        SELECT 
          g.*,
          m.name as map_name,
          u.username as created_by_username,
          gp_current.username as current_turn_username
        FROM games g
        LEFT JOIN maps m ON g.map_id = m.id
        LEFT JOIN users u ON g.created_by = u.id
        LEFT JOIN users gp_current ON g.current_turn = gp_current.id
        WHERE 1=1
      `;
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (status && status !== 'all') {
        gamesQuery += ` AND g.status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }

      if (search) {
        gamesQuery += ` AND (g.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      gamesQuery += `
        ORDER BY g.updated_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      queryParams.push(limit, offset);

      const gamesResult = await query(gamesQuery, queryParams);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total
        FROM games g
        LEFT JOIN maps m ON g.map_id = m.id
        LEFT JOIN users u ON g.created_by = u.id
        WHERE 1=1
      `;
      const countParams: any[] = [];
      let countParamIndex = 1;

      if (status && status !== 'all') {
        countQuery += ` AND g.status = $${countParamIndex}`;
        countParams.push(status);
        countParamIndex++;
      }

      if (search) {
        countQuery += ` AND (g.name ILIKE $${countParamIndex} OR m.name ILIKE $${countParamIndex} OR u.username ILIKE $${countParamIndex})`;
        countParams.push(`%${search}%`);
      }

      const countResult = await query(countQuery, countParams);

      // Get players for each game
      const gameIds = gamesResult.rows.map((g: any) => g.id);
      let playersData: any[] = [];
      
      if (gameIds.length > 0) {
        const playersQuery = `
          SELECT 
            gp.game_id,
            gp.user_id,
            gp.status,
            u.username,
            COALESCE(gt.color, '#666666') as color,
            COUNT(gt.id) as territories_count
          FROM game_players gp
          JOIN users u ON gp.user_id = u.id
          LEFT JOIN game_territories gt ON gp.game_id = gt.game_id AND gp.user_id = gt.owner_id
          WHERE gp.game_id = ANY($1)
          GROUP BY gp.game_id, gp.user_id, gp.status, u.username, gt.color
          ORDER BY gp.game_id, gp.joined_at
        `;
        const playersResult = await query(playersQuery, [gameIds]);
        playersData = playersResult.rows;
      }

      // Format games data
      const games = gamesResult.rows.map((game: any) => {
        const gamePlayers = playersData.filter((p: any) => p.game_id === game.id);
        
        const players = gamePlayers.map((player: any) => ({
          id: player.user_id,
          username: player.username,
          status: player.status || 'active',
          color: player.color,
          territoriesCount: parseInt(player.territories_count) || 0,
          armiesCount: 0 // TODO: Calculate actual army count from game state
        }));

        return {
          id: game.id,
          name: game.name,
          mapName: game.map_name,
          createdBy: game.created_by,
          createdByUsername: game.created_by_username,
          status: game.status,
          currentTurn: game.current_turn,
          currentTurnUsername: game.current_turn_username,
          phase: game.phase || 'reinforcement',
          turnCount: game.turn_count || 1,
          maxPlayers: game.max_players || 6,
          isPrivate: game.is_private || false,
          createdAt: game.created_at,
          updatedAt: game.updated_at,
          lastActivity: game.updated_at,
          players
        };
      });

      res.json({
        games,
        total: parseInt(countResult.rows[0]?.total || '0')
      });
    } catch (error) {
      logger.error('Error getting games:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get games' 
      });
    }
  }
);

// Force end a game
router.post('/games/:gameId/force-end',
  requirePermission('games.manage'),
  logAdminActivity('game_force_end'),
  param('gameId').isUUID(),
  body('reason').isString().isLength({ min: 1, max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { reason } = req.body;
      const adminUserId = (req as any).userId;

      const { query } = require('../config/database');

      await query(
        'UPDATE games SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['abandoned', gameId]
      );

      // Log the action
      await query(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'game_force_end',
          JSON.stringify({ reason, gameId }),
          'game',
          gameId,
          req.ip,
          req.get('User-Agent')
        ]
      );

      res.json({ success: true, message: 'Game force-ended successfully' });
    } catch (error) {
      logger.error('Error force-ending game:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to force-end game' 
      });
    }
  }
);

// Pause a game
router.post('/games/:gameId/pause',
  requirePermission('games.manage'),
  logAdminActivity('game_pause'),
  param('gameId').isUUID(),
  body('reason').optional().isString().isLength({ max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { reason } = req.body;
      const adminUserId = (req as any).userId;

      const { query } = require('../config/database');

      await query(
        'UPDATE games SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = $3',
        ['paused', gameId, 'active']
      );

      // Log the action
      await query(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'game_pause',
          JSON.stringify({ reason, gameId }),
          'game',
          gameId,
          req.ip,
          req.get('User-Agent')
        ]
      );

      res.json({ success: true, message: 'Game paused successfully' });
    } catch (error) {
      logger.error('Error pausing game:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to pause game' 
      });
    }
  }
);

// Resume a game
router.post('/games/:gameId/resume',
  requirePermission('games.manage'),
  logAdminActivity('game_resume'),
  param('gameId').isUUID(),
  body('reason').optional().isString().isLength({ max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { reason } = req.body;
      const adminUserId = (req as any).userId;

      const { query } = require('../config/database');

      await query(
        'UPDATE games SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = $3',
        ['active', gameId, 'paused']
      );

      // Log the action
      await query(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'game_resume',
          JSON.stringify({ reason, gameId }),
          'game',
          gameId,
          req.ip,
          req.get('User-Agent')
        ]
      );

      res.json({ success: true, message: 'Game resumed successfully' });
    } catch (error) {
      logger.error('Error resuming game:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to resume game' 
      });
    }
  }
);

// ============= FEATURE FLAGS =============

// Get all feature flags
router.get('/feature-flags',
  requirePermission('system.view'),
  async (req: Request, res: Response) => {
    try {
      const flags = await adminService.getFeatureFlags();
      res.json(flags);
    } catch (error) {
      logger.error('Error getting feature flags:', error);
      res.status(500).json({ error: 'Failed to get feature flags' });
    }
  }
);

// Toggle feature flag
router.put('/feature-flags/:flagName',
  requirePermission('system.admin'),
  logAdminActivity('feature_flag_toggle'),
  param('flagName').isString(),
  body('enabled').isBoolean(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { flagName } = req.params;
      const { enabled } = req.body;
      const adminUserId = (req as any).userId;

      await adminService.toggleFeatureFlag(flagName, enabled, adminUserId);
      
      res.json({ message: 'Feature flag updated successfully' });
    } catch (error) {
      logger.error('Error toggling feature flag:', error);
      res.status(500).json({ error: 'Failed to toggle feature flag' });
    }
  }
);

// ============= ACTIVITY LOGS =============

// Get admin activity logs
router.get('/logs/admin-activity',
  requirePermission('logs.view'),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('offset').optional().isInt({ min: 0 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const logs = await adminService.getAdminActivityLogs(limit, offset);
      res.json(logs);
    } catch (error) {
      logger.error('Error getting admin activity logs:', error);
      res.status(500).json({ error: 'Failed to get admin activity logs' });
    }
  }
);

// ============= SYSTEM INFO =============

// Get system status and metrics
router.get('/system/status',
  requirePermission('system.view'),
  async (req: Request, res: Response) => {
    try {
      // Get basic system metrics
      const { query } = require('../config/database');
      const dbStats = await query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as user_count,
          (SELECT COUNT(*) FROM maps) as map_count,
          (SELECT COUNT(*) FROM games WHERE status = 'active') as active_games,
          (SELECT COUNT(*) FROM content_approval_queue WHERE status = 'pending') as pending_approvals
      `);

      const featureFlags = await adminService.getFeatureFlags();
      
      res.json({
        timestamp: new Date().toISOString(),
        database: {
          userCount: dbStats.rows[0].user_count,
          mapCount: dbStats.rows[0].map_count,
          activeGames: dbStats.rows[0].active_games,
          pendingApprovals: dbStats.rows[0].pending_approvals
        },
        featureFlags: featureFlags.reduce((acc, flag) => {
          acc[flag.flagName] = flag.isEnabled;
          return acc;
        }, {} as Record<string, boolean>)
      });
    } catch (error) {
      logger.error('Error getting system status:', error);
      res.status(500).json({ error: 'Failed to get system status' });
    }
  }
);

export default router;