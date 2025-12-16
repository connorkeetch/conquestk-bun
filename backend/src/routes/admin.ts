import { type NextFunction, type Request, type Response, Router } from 'express'
import { body, param, query as queryParam, validationResult } from 'express-validator'
import { query as dbQuery, transaction } from '../config/database.js'
import { ENV_VARIABLES } from '../config/validateEnv.js'
import { logAdminActivity, requireAdmin, requirePermission } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import { adminService } from '../services/adminService.js'
import { GameLifecycleService } from '../services/gameLifecycleService.js'
import { mapService } from '../services/mapService.js'
import { logger } from '../utils/logger.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'
import { resolveAssetUrl } from '../utils/url.js'

/**
 * This file contains the admin routes for the application.
 * It includes routes for user management, content moderation, game management, and system status.
 * All routes in this file are protected by the `authenticateToken` and `requireAdmin` middleware.
 */

const router = Router()

type AdminGameRow = {
  id: string
  name: string | null
  status: string | null
  max_players: number | null
  is_private: boolean | null
  created_at: Date | string | null
  updated_at: Date | string | null
  host_id: string | null
  map_id: string | null
  game_mode: string | null
  is_ranked: boolean | null
  started_at: Date | string | null
  ended_at: Date | string | null
  winner_id: string | null
  host_username: string | null
  map_name: string | null
  player_count: string | number | null
  room_code?: number | string | null
  // joined from game_states
  gs_turn_number?: number | null
  gs_game_phase?: string | null
  gs_last_activity?: Date | string | null
  gs_current_player_id?: string | null
  gs_current_player_username?: string | null
}

type AdminGamePlayerRow = {
  room_id: string
  user_id: string
  username: string
  joined_at: Date | string | null
  is_ai: boolean | null
  ai_difficulty: string | null
  ai_personality_seed: number | null
}

type AdminMapRow = {
  id: string
  name: string | null
  description: string | null
  image_url: string | null
  creator_id: string | null
  creatorName: string | null
  min_players: number | null
  max_players: number | null
  is_featured: boolean | null
  ratingAverage: string | number | null
  ratingCount: string | number | null
  playCount: string | number | null
  tags: string[] | null
  status: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
  is_public: boolean | null
  is_vip_only: boolean | null
  territoryCount: string | number | null
  sectorCount: string | number | null
  legacyContinentCount?: string | number | null
}

type ActiveGameSummaryRow = {
  id: string
  name: string | null
  status: string | null
  max_players: number | null
  created_at: Date | string | null
  updated_at: Date | string | null
  map_name: string | null
  host_username: string | null
  player_count: string | number | null
  duration_minutes: string | number | null
}

// Apply authentication to all admin routes
router.use(authenticateToken)

// Status endpoint - check if user is admin (doesn't require admin permission)
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const isAdmin = await adminService.isAdmin(userId)
    res.json({ isAdmin })
  } catch (error) {
    handleRouteError(error, req, 'Failed to check admin status', 500, { userId: req.userId })
    res.status(500).json({ error: 'Failed to check admin status' })
  }
})

// Apply admin requirement to all other routes
router.use(requireAdmin)

// Validation middleware
const checkValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() })
  }
  return next()
}

// ============= ADMIN INFO =============

// Get current admin user info
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const adminInfo = await adminService.getUserAdminInfo(userId)

    res.json({
      userId,
      adminRoles: adminInfo,
      isAdmin: true,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to get admin info', 500, { userId: req.userId })
    res.status(500).json({ error: 'Failed to get admin info' })
  }
})

// ============= ENVIRONMENT STATUS =============

router.get('/env/status', async (_req: Request, res: Response) => {
  try {
    const required = [] as Array<{
      name: string
      required: boolean
      present: boolean
      valid: boolean
      hasDefault: boolean
      valueEqualsDefault: boolean
      description?: string
      issues?: string[]
    }>

    const issues: string[] = []

    for (const v of ENV_VARIABLES) {
      const raw = process.env[v.name]
      const present = typeof raw === 'string' && raw.length > 0
      const rawStr = typeof raw === 'string' ? raw : ''
      const hasDefault = typeof v.defaultValue === 'string'
      const valueEqualsDefault = present && hasDefault ? rawStr === v.defaultValue : false
      const valid = present
        ? typeof v.validator === 'function'
          ? v.validator(rawStr)
          : true
        : !v.required

      const itemIssues: string[] = []
      if (v.required && !present) itemIssues.push('missing')
      if (present && !valid) itemIssues.push('invalid')
      if (present && /SECRET|KEY|TOKEN|PASSWORD|HMAC|DSN/i.test(v.name)) {
        const weak = rawStr.length < 16 || /your-|change|default/i.test(rawStr)
        if (weak) itemIssues.push('weak_secret')
      }

      required.push({
        name: v.name,
        required: v.required,
        present,
        valid,
        hasDefault,
        valueEqualsDefault,
        description: v.description,
        issues: itemIssues.length ? itemIssues : undefined,
      })

      for (const i of itemIssues) issues.push(`${v.name}: ${i}`)
    }

    const OPTIONAL_VARS: Array<{
      name: string
      description?: string
      recommended?: 'dev' | 'prod' | 'both'
    }> = [
      {
        name: 'FRONTEND_URL',
        description: 'Absolute frontend origin for links',
        recommended: 'prod',
      },
      { name: 'CORS_ORIGIN', description: 'Allowed CORS origin(s)', recommended: 'both' },
      { name: 'CANONICAL_HOST', description: 'Apex host for 308 redirects', recommended: 'prod' },
      {
        name: 'PUBLIC_ASSET_BASE_URL',
        description: 'Public CDN/base for assets',
        recommended: 'both',
      },
      {
        name: 'VITE_ASSET_BASE_URL',
        description: 'Frontend/CDN base for assets',
        recommended: 'both',
      },
      { name: 'SENTRY_DSN', description: 'Sentry error tracking DSN', recommended: 'prod' },
      { name: 'REDIS_URL', description: 'Redis for sessions/queues/sockets', recommended: 'prod' },
      { name: 'REDIS_PUBLIC_URL' },
      { name: 'REDIS_CLUSTER_NODES' },
      { name: 'REDIS_PASSWORD' },
      { name: 'AI_EVAL_ENGINE', description: 'ts|wasm|shadow (AI eval)' },
      { name: 'ODDS_ENGINE', description: 'ts|wasm|shadow (odds)' },
      { name: 'ODDS_SHADOW_SCHEDULED' },
      { name: 'ODDS_SHADOW_CRON' },
      { name: 'ODDS_SHADOW_TRIALS' },
      { name: 'AI_STREAM_ACTIONS' },
      { name: 'AI_READABLE_DELAY_MS' },
      { name: 'EMAIL_ENABLED', recommended: 'both' },
      { name: 'EMAIL_FROM' },
      { name: 'EMAIL_FROM_NAME' },
      { name: 'REQUIRE_EMAIL_VERIFICATION' },
      { name: 'RESEND_API_KEY', description: 'Resend API key', recommended: 'prod' },
      { name: 'VAPID_PUBLIC_KEY' },
      { name: 'VAPID_PRIVATE_KEY' },
      { name: 'VAPID_EMAIL' },
      { name: 'ASSET_BUCKET' },
      { name: 'ASSET_ENDPOINT' },
      { name: 'ASSET_ACCESS_KEY_ID' },
      { name: 'ASSET_SECRET_ACCESS_KEY' },
      { name: 'ASSET_REGION' },
      { name: 'MAP_UPLOADS_DIR' },
      { name: 'CDN_PRIMARY_URL' },
      { name: 'CDN_API_KEY' },
      { name: 'CDN_REGIONAL_URLS' },
      { name: 'CDN_GAME_ASSETS_URL' },
      { name: 'CDN_UPLOAD_ENDPOINT' },
      { name: 'USE_MATCHSVC' },
      { name: 'MATCHSVC_URL' },
      { name: 'MATCHSVC_HMAC_SECRET' },
      { name: 'BULL_PREFIX' },
      { name: 'QUEUE_READY_TIMEOUT_MS' },
      { name: 'QUEUE_HEALTH_STRICT' },
      { name: 'ENABLE_AUTO_SCALING' },
      { name: 'MIN_WORKERS' },
      { name: 'MAX_WORKERS' },
      { name: 'MAINTENANCE_PRUNE_INTERVAL_MS' },
      { name: 'NOTIFICATION_RETENTION_DAYS' },
      { name: 'PRUNE_NOTIFICATIONS_INCLUDE_UNREAD' },
      { name: 'GAME_MOVE_ARCHIVE_BATCH_SIZE' },
      { name: 'MEMORY_MONITOR_ENABLED' },
      { name: 'MEMORY_MONITOR_SNAPSHOT_DIR' },
      { name: 'SYNC_FEATURE_FLAGS_ON_START' },
      { name: 'RUN_DEPLOY_ACCOUNT_ENFORCEMENT_ON_START' },
      { name: 'SKIP_DEPLOY_ACCOUNT_ENFORCEMENT' },
      { name: 'ENFORCE_DEPLOY_ACCOUNT_CHECK' },
      { name: 'DEPLOY_ENV' },
      { name: 'APP_ENV' },
      { name: 'STARTUP_VERBOSE' },
      { name: 'TEST_BASE_URL' },
    ]

    const optional = OPTIONAL_VARS.map((v) => {
      const raw = process.env[v.name]
      const present = typeof raw === 'string' && raw.length > 0
      const rawStr = typeof raw === 'string' ? raw : ''
      const isSecret = /SECRET|KEY|TOKEN|PASSWORD|HMAC|DSN/i.test(v.name)
      const weak =
        present && isSecret && (rawStr.length < 16 || /your-|change|default/i.test(rawStr))
      const issues = [] as string[]
      if (!present && v.recommended) issues.push(`recommended_${v.recommended}`)
      if (weak) issues.push('weak_secret')
      return {
        name: v.name,
        present,
        recommended: v.recommended,
        description: v.description,
        issues: issues.length ? issues : undefined,
      }
    })

    const env = process.env.NODE_ENV || 'development'
    const summary = {
      environment: env,
      requiredMissing: required.filter((r) => r.required && !r.present).length,
      requiredInvalid: required.filter((r) => r.present && !r.valid).length,
      optionalRecommendedMissing: optional.filter(
        (o) =>
          !o.present &&
          (o.recommended === 'both' || o.recommended === (env === 'development' ? 'dev' : 'prod')),
      ).length,
      issues,
    }

    res.json({ summary, required, optional })
  } catch (error) {
    handleRouteError(error, _req, 'Failed to compute env status', 500)
    res.status(500).json({ error: 'Failed to compute env status' })
  }
})

// ============= USER MANAGEMENT =============

// Get all users with admin controls
router.get(
  '/users',
  requirePermission('users.view'),
  queryParam('limit').optional().isInt({ min: 1, max: 100 }),
  queryParam('offset').optional().isInt({ min: 0 }),
  queryParam('search').optional().isString(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50
      const offset = parseInt(req.query.offset as string, 10) || 0
      const search = req.query.search as string

      const result = await adminService.getAllUsers(limit, offset, search)
      res.json(result)
    } catch (error) {
      handleRouteError(error, req, 'Failed to get users', 500, {
        limit: req.query.limit,
        offset: req.query.offset,
        search: req.query.search,
      })
      res.status(500).json({ error: 'Failed to get users' })
    }
  },
)

// Update user account status (ban/suspend/activate)
router.put(
  '/users/:userId/status',
  requirePermission('users.moderate'),
  logAdminActivity('user_status_update'),
  param('userId').isUUID(),
  body('status').isIn(['active', 'suspended', 'banned']),
  body('reason').optional().isString().isLength({ max: 500 }),
  body('expiresAt').optional().isISO8601(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const { status, reason, expiresAt } = req.body
      const adminUserId = req.userId

      const expirationDate = expiresAt ? new Date(expiresAt) : undefined

      await adminService.updateUserStatus(userId, adminUserId, status, reason, expirationDate)

      res.json({ message: 'User status updated successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update user status', 500, {
        targetUserId: req.params.userId,
        status: req.body?.status,
      })
      res.status(500).json({ error: 'Failed to update user status' })
    }
  },
)

// Reset user password
router.post(
  '/users/:userId/reset-password',
  requirePermission('users.edit'),
  logAdminActivity('password_reset'),
  param('userId').isUUID(),
  body('newPassword').isLength({ min: 6 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const { newPassword } = req.body
      const adminUserId = req.userId

      await adminService.resetUserPassword(userId, adminUserId, newPassword)

      res.json({ message: 'Password reset successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to reset password', 500, {
        targetUserId: req.params.userId,
      })
      res.status(500).json({ error: 'Failed to reset password' })
    }
  },
)

// Manually verify a user's email (admin override)
router.post(
  '/users/:userId/verify-email',
  requirePermission('users.edit'),
  logAdminActivity('email_verification_override'),
  param('userId').isUUID(),
  body('note').optional().isString().isLength({ max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const { note } = req.body as { note?: string }
      const adminUserId = req.userId

      const result = await adminService.verifyUserEmail(userId, adminUserId, note)
      if (!result) {
        return res.status(404).json({ error: 'User not found' })
      }

      return res.json({
        message: result.alreadyVerified
          ? 'User email was already verified'
          : 'User email verified successfully',
        emailVerified: true,
        alreadyVerified: result.alreadyVerified,
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to verify user email', 500, {
        targetUserId: req.params.userId,
      })
      return res.status(500).json({ error: 'Failed to verify user email' })
    }
  },
)

// Update user VIP status
router.post(
  '/users/:userId/vip',
  requirePermission('users.edit'),
  logAdminActivity('vip_status_change'),
  param('userId').isUUID(),
  body('isVip').isBoolean(),
  body('reason').optional().isString().isLength({ max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const { isVip, reason } = req.body
      const adminUserId = req.userId

      await adminService.updateUserVipStatus(userId, adminUserId, isVip, reason)

      res.json({ message: 'VIP status updated successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update VIP status', 500, {
        targetUserId: req.params.userId,
        isVip: req.body?.isVip,
      })
      res.status(500).json({ error: 'Failed to update VIP status' })
    }
  },
)

// Update user admin status
router.post(
  '/users/:userId/admin',
  requirePermission('admin.manage'),
  logAdminActivity('admin_status_change'),
  param('userId').isUUID(),
  body('isAdmin').isBoolean(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const { isAdmin } = req.body
      const adminUserId = req.userId

      await adminService.updateUserAdminStatus(userId, adminUserId, isAdmin)

      res.json({ message: 'Admin status updated successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update admin status', 500, {
        targetUserId: req.params.userId,
        isAdmin: req.body?.isAdmin,
      })
      res.status(500).json({ error: 'Failed to update admin status' })
    }
  },
)

// Update user premium tier
router.post(
  '/users/:userId/premium',
  requirePermission('users.edit'),
  logAdminActivity('premium_tier_change'),
  param('userId').isUUID(),
  body('tier').isIn(['free', 'premium']),
  body('expiresAt').optional().isISO8601(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const { tier, expiresAt } = req.body
      const adminUserId = req.userId

      const expirationDate = expiresAt ? new Date(expiresAt) : undefined

      await adminService.updateUserPremiumTier(userId, adminUserId, tier, expirationDate)

      res.json({ message: 'Premium tier updated successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update premium tier', 500, {
        targetUserId: req.params.userId,
        tier: req.body?.tier,
      })
      res.status(500).json({ error: 'Failed to update premium tier' })
    }
  },
)

// Ban user
router.post(
  '/users/:userId/ban',
  requirePermission('users.moderate'),
  logAdminActivity('user_ban'),
  param('userId').isUUID(),
  body('reason').optional().isString().isLength({ max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const { reason } = req.body
      const adminUserId = req.userId

      await adminService.updateUserStatus(userId, adminUserId, 'banned', reason)

      res.json({ message: 'User banned successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to ban user', 500, {
        targetUserId: req.params.userId,
      })
      res.status(500).json({ error: 'Failed to ban user' })
    }
  },
)

// Unban user
router.post(
  '/users/:userId/unban',
  requirePermission('users.moderate'),
  logAdminActivity('user_unban'),
  param('userId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const adminUserId = req.userId

      await adminService.updateUserStatus(userId, adminUserId, 'active')

      res.json({ message: 'User unbanned successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to unban user', 500, {
        targetUserId: req.params.userId,
      })
      res.status(500).json({ error: 'Failed to unban user' })
    }
  },
)

// Assign admin role to user
router.post(
  '/users/:userId/admin-roles',
  requirePermission('admin.manage'),
  logAdminActivity('admin_role_assign'),
  param('userId').isUUID(),
  body('roleId').isUUID(),
  body('expiresAt').optional().isISO8601(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params
      const { roleId, expiresAt } = req.body
      const adminUserId = req.userId

      const expirationDate = expiresAt ? new Date(expiresAt) : undefined

      await adminService.assignAdminRole(userId, roleId, adminUserId, expirationDate)

      res.json({ message: 'Admin role assigned successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to assign admin role', 500, {
        targetUserId: req.params.userId,
        roleId: req.body?.roleId,
      })
      res.status(500).json({ error: 'Failed to assign admin role' })
    }
  },
)

// Remove admin role from user
router.delete(
  '/users/:userId/admin-roles/:roleId',
  requirePermission('admin.manage'),
  logAdminActivity('admin_role_remove'),
  param('userId').isUUID(),
  param('roleId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId, roleId } = req.params
      const adminUserId = req.userId

      await adminService.removeAdminRole(userId, roleId, adminUserId)

      res.json({ message: 'Admin role removed successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to remove admin role', 500, {
        targetUserId: req.params.userId,
        roleId: req.params.roleId,
      })
      res.status(500).json({ error: 'Failed to remove admin role' })
    }
  },
)

// ============= CONTENT MODERATION =============

const registerContentApprovalQueueRoute = (path: string) =>
  router.get(
    path,
    requirePermission('content.moderate'),
    queryParam('limit').optional().isInt({ min: 1, max: 100 }),
    queryParam('offset').optional().isInt({ min: 0 }),
    checkValidation,
    async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string, 10) || 50
        const offset = parseInt(req.query.offset as string, 10) || 0

        const result = await adminService.getContentApprovalQueue(limit, offset)
        res.json(result)
      } catch (error) {
        handleRouteError(error, req, 'Failed to get approval queue', 500, {
          limit: req.query.limit,
          offset: req.query.offset,
        })
        res.status(500).json({ error: 'Failed to get approval queue' })
      }
    },
  )

// Support legacy '/content/queue' and new '/content/approval-queue' endpoints
registerContentApprovalQueueRoute('/content/queue')
registerContentApprovalQueueRoute('/content/approval-queue')

// Approve content
router.post(
  '/content/approval-queue/:queueId/approve',
  requirePermission('content.moderate'),
  logAdminActivity('content_approve'),
  param('queueId').isUUID(),
  body('notes').optional().isString().isLength({ max: 1000 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { queueId } = req.params
      const { notes } = req.body
      const adminUserId = req.userId

      await adminService.approveContent(queueId, adminUserId, notes)

      res.json({ message: 'Content approved successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to approve content', 500, {
        queueId: req.params.queueId,
      })
      res.status(500).json({ error: 'Failed to approve content' })
    }
  },
)

// Reject content
router.post(
  '/content/approval-queue/:queueId/reject',
  requirePermission('content.moderate'),
  logAdminActivity('content_reject'),
  param('queueId').isUUID(),
  body('reason').isString().isLength({ min: 1, max: 1000 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { queueId } = req.params
      const { reason } = req.body
      const adminUserId = req.userId

      await adminService.rejectContent(queueId, adminUserId, reason)

      res.json({ message: 'Content rejected successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to reject content', 500, {
        queueId: req.params.queueId,
      })
      res.status(500).json({ error: 'Failed to reject content' })
    }
  },
)

// ============= GAME MANAGEMENT =============

const normalizeAdminGameStatus = (
  status: string | null,
): 'waiting' | 'active' | 'paused' | 'completed' | 'abandoned' => {
  if (!status) {
    return 'waiting'
  }

  switch (status) {
    case 'in_progress':
    case 'starting':
    case 'active':
    case 'initializing':
      return 'active'
    case 'finished':
    case 'completed':
      return 'completed'
    case 'abandoned':
      return 'abandoned'
    case 'paused':
      return 'paused'
    default:
      return 'waiting'
  }
}

// Get all games with admin controls
router.get(
  '/games',
  requirePermission('games.view'),
  queryParam('limit').optional().isInt({ min: 1, max: 100 }),
  queryParam('offset').optional().isInt({ min: 0 }),
  queryParam('status').optional().isString(),
  queryParam('search').optional().isString(),
  queryParam('sortBy').optional().isString(),
  queryParam('sortDir').optional().isIn(['asc', 'desc']),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 20
      const offset = parseInt(req.query.offset as string, 10) || 0
      const status = req.query.status as string
      const search = req.query.search as string
      const sortBy = ((req.query.sortBy as string) || 'lastActivity').toLowerCase()
      const sortDir =
        ((req.query.sortDir as string) || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

      const sortMap: Record<string, string> = {
        lastactivity: `COALESCE(gs.last_activity, gr.updated_at)`,
        turn: `COALESCE(gs.turn_number, 0)`,
        createdat: `gr.created_at`,
        updatedat: `gr.updated_at`,
        status: `gr.status`,
      }
      const sortExpr = sortMap[sortBy] ?? sortMap.lastactivity

      const statusFilterMap: Record<string, string[]> = {
        active: ['active', 'initializing'],
        waiting: ['lobby'],
        completed: ['completed'],
        abandoned: ['abandoned'],
        paused: ['paused'],
      }

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
      `
      const queryParams: unknown[] = []
      let paramIndex = 1

      if (status && status !== 'all') {
        const dbStatuses = statusFilterMap[status] || [status]
        const placeholders = dbStatuses.map(() => `$${paramIndex++}`).join(', ')
        gamesQuery += ` AND gr.status IN (${placeholders})`
        queryParams.push(...dbStatuses)
      }

      if (search) {
        gamesQuery += ` AND (gr.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`
        queryParams.push(`%${search}%`)
        paramIndex++
      }

      gamesQuery += `
        GROUP BY gr.id, u.username, m.name, gs.turn_number, gs.game_phase, gs.last_activity, gs.current_player_id, cu.username
        ORDER BY ${sortExpr} ${sortDir} NULLS LAST
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `
      queryParams.push(limit, offset)

      const gamesResult = await dbQuery<AdminGameRow>(gamesQuery, queryParams)

      // Get total count with the same filters (without player joins to keep it fast)
      let countQuery = `
        SELECT COUNT(*) as total
        FROM game_rooms gr
        LEFT JOIN maps m ON gr.map_id = m.id
        LEFT JOIN users u ON gr.host_id = u.id
        WHERE 1=1
      `
      const countParams: unknown[] = []
      let countParamIndex = 1

      if (status && status !== 'all') {
        const dbStatuses = statusFilterMap[status] || [status]
        const placeholders = dbStatuses.map(() => `$${countParamIndex++}`).join(', ')
        countQuery += ` AND gr.status IN (${placeholders})`
        countParams.push(...dbStatuses)
      }

      if (search) {
        countQuery += ` AND (gr.name ILIKE $${countParamIndex} OR m.name ILIKE $${countParamIndex} OR u.username ILIKE $${countParamIndex})`
        countParams.push(`%${search}%`)
      }

      const countResult = await dbQuery(countQuery, countParams)

      // Get players for each game
      const gameRows = gamesResult.rows as AdminGameRow[]
      const gameIds = gameRows.map((g) => g.id)
      let playersData: AdminGamePlayerRow[] = []

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
        `
        const playersResult = await dbQuery<AdminGamePlayerRow>(playersQuery, [gameIds])
        playersData = playersResult.rows as AdminGamePlayerRow[]
      }

      const games = gamesResult.rows.map((game: AdminGameRow) => {
        const currentPlayers = playersData.filter(
          (player: AdminGamePlayerRow) => player.room_id === game.id,
        )

        const players = currentPlayers.map((player) => ({
          id: player.user_id,
          username: player.username,
          status: 'active',
          color: '#666666',
          territoriesCount: 0,
          armiesCount: 0,
          isAi: player.is_ai === true,
          aiDifficulty: player.ai_difficulty,
        }))

        const normalizedStatus = normalizeAdminGameStatus(game.status)

        return {
          id: game.id,
          name: game.name,
          mapName: game.map_name,
          createdBy: game.host_id,
          createdByUsername: game.host_username,
          status: normalizedStatus,
          currentTurn: game.gs_current_player_id ?? null,
          currentTurnUsername: game.gs_current_player_username ?? null,
          phase: (game.gs_game_phase as 'reinforcement' | 'attack' | 'fortify') ?? 'reinforcement',
          turnCount: Number(game.gs_turn_number ?? 0),
          maxPlayers: game.max_players || 6,
          isPrivate: Boolean(game.is_private),
          createdAt: game.created_at,
          updatedAt: game.updated_at,
          lastActivity:
            (game.gs_last_activity as Date | string | null) || game.updated_at || game.created_at,
          roomCode:
            typeof game.room_code === 'number'
              ? game.room_code
              : typeof game.room_code === 'string'
                ? Number.parseInt(game.room_code, 10)
                : undefined,
          players,
        }
      })

      res.json({
        games,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get games', 500, {
        limit: req.query.limit,
        offset: req.query.offset,
        status: req.query.status,
      })
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get games',
      })
    }
  },
)

// Get game details for a specific game
router.get(
  '/games/:gameId/details',
  requirePermission('games.view'),
  param('gameId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params

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
      `

      const detailsResult = await dbQuery(detailsQuery, [gameId])
      if (detailsResult.rowCount === 0) {
        res.status(404).json({ error: 'Game not found' })
        return
      }

      const row = detailsResult.rows[0] as Record<string, unknown>

      const playersResult = await dbQuery<AdminGamePlayerRow>(
        `SELECT rp.room_id, rp.user_id, u.username, rp.joined_at, rp.is_ai, rp.ai_difficulty, rp.ai_personality_seed
         FROM room_players rp
         LEFT JOIN users u ON rp.user_id = u.id
         WHERE rp.room_id = $1
         ORDER BY rp.joined_at ASC NULLS FIRST`,
        [gameId],
      )

      const players = (playersResult.rows || []).map((p) => ({
        id: p.user_id,
        username: p.username,
        status: 'active' as const,
        color: '#666666',
        territoriesCount: 0,
        armiesCount: 0,
        isAi: p.is_ai === true,
        aiDifficulty: p.ai_difficulty,
      }))

      res.json({
        id: row.id,
        name: row.name,
        mapName: row.map_name,
        createdBy: row.host_id,
        createdByUsername: row.host_username,
        status: normalizeAdminGameStatus((row.status as string) ?? null),
        currentTurn: row.current_player_id ?? null,
        currentTurnUsername: row.current_player_username ?? null,
        phase: (row.game_phase as string) ?? 'reinforcement',
        turnCount: Number(row.turn_number ?? 0),
        maxPlayers: Number(row.max_players ?? 6),
        isPrivate: Boolean(row.is_private),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastActivity: row.last_activity ?? row.updated_at ?? row.created_at,
        roomCode:
          typeof row.room_code === 'number'
            ? (row.room_code as number)
            : typeof row.room_code === 'string'
              ? Number.parseInt(row.room_code as string, 10)
              : undefined,
        players,
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get game details', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({ error: 'Failed to get game details' })
    }
  },
)

// Get game moves with filters/pagination
router.get(
  '/games/:gameId/moves',
  requirePermission('games.view'),
  param('gameId').isUUID(),
  queryParam('limit').optional().isInt({ min: 1, max: 200 }),
  queryParam('offset').optional().isInt({ min: 0 }),
  queryParam('moveType').optional().isString(),
  queryParam('playerId').optional().isUUID(),
  queryParam('turn').optional().isInt({ min: 1 }),
  queryParam('sort').optional().isString(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const limit = parseInt((req.query.limit as string) ?? '50', 10)
      const offset = parseInt((req.query.offset as string) ?? '0', 10)
      const moveType = (req.query.moveType as string) || undefined
      const playerId = (req.query.playerId as string) || undefined
      const turn = req.query.turn ? Number.parseInt(req.query.turn as string, 10) : undefined
      const sort = (req.query.sort as string) || 'created_at_desc'

      const orderBy =
        sort === 'created_at_asc'
          ? 'gm.created_at ASC'
          : sort === 'turn_asc'
            ? 'gm.turn_number ASC, gm.created_at ASC'
            : sort === 'turn_desc'
              ? 'gm.turn_number DESC, gm.created_at DESC'
              : 'gm.created_at DESC'

      const where: string[] = ['gm.room_id = $1']
      const params: unknown[] = [gameId]
      let idx = 2
      if (moveType) {
        where.push(`gm.move_type = $${idx++}`)
        params.push(moveType)
      }
      if (playerId) {
        where.push(`gm.player_id = $${idx++}`)
        params.push(playerId)
      }
      if (typeof turn === 'number' && Number.isFinite(turn)) {
        where.push(`gm.turn_number = $${idx++}`)
        params.push(turn)
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

      const combinedSource = `(
        SELECT id, room_id, player_id, turn_number, move_type, move_data, is_valid, validation_error, created_at
        FROM game_moves
        UNION ALL
        SELECT id, room_id, player_id, turn_number, move_type, move_data, is_valid, validation_error, created_at
        FROM game_move_archive
      )` as const

      const sql = `
        SELECT gm.id, gm.player_id, u.username as player_username, gm.turn_number, gm.move_type, gm.move_data, gm.is_valid, gm.validation_error, gm.created_at
        FROM ${combinedSource} gm
        LEFT JOIN users u ON gm.player_id = u.id
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${idx} OFFSET $${idx + 1}
      `
      const listParams = [...params, limit, offset]
      const rowsRes = await dbQuery(sql, listParams)

      const countRes = await dbQuery(
        `SELECT COUNT(*) as total FROM ${combinedSource} gm ${whereSql}`,
        params,
      )

      res.json({
        moves: rowsRes.rows || [],
        total: Number.parseInt((countRes.rows?.[0]?.total as string) ?? '0', 10),
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get game moves', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({ error: 'Failed to get game moves' })
    }
  },
)

// Get per-turn stats timeline
router.get(
  '/games/:gameId/turn-stats',
  requirePermission('games.view'),
  param('gameId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const result = await dbQuery<{ turn_stats: unknown[] | null }>(
        'SELECT turn_stats FROM game_states WHERE room_id = $1',
        [gameId],
      )
      const tsVal = result.rows?.[0]?.turn_stats
      const arr = Array.isArray(tsVal) ? tsVal : []
      res.json({ turnStats: arr, count: arr.length })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get turn stats', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({ error: 'Failed to get turn stats' })
    }
  },
)

// Get battle/event log entries
router.get(
  '/games/:gameId/log',
  requirePermission('games.view'),
  param('gameId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const result = await dbQuery<{
        ts: Date
        move_type: string
        actor_id: string | null
        from_territory_id: string | null
        to_territory_id: string | null
        payload: unknown
      }>(
        `SELECT ts, move_type, actor_id, from_territory_id, to_territory_id, payload
           FROM game_logs WHERE game_id = $1 ORDER BY ts ASC LIMIT 2000`,
        [gameId],
      )
      const arr = result.rows || []
      res.json({ entries: arr, count: arr.length })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get game log', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({ error: 'Failed to get game log' })
    }
  },
)

// Get deterministic RNG seed for a game (auditing aid)
router.get(
  '/games/:gameId/seed',
  requirePermission('games.view'),
  param('gameId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const result = await dbQuery<{ game_data: unknown | null }>(
        'SELECT game_data FROM game_states WHERE room_id = $1',
        [gameId],
      )
      const row = result.rows?.[0]
      let seed: string | null = null
      let source: 'state' | null = null
      const data = row?.game_data
      if (data && typeof data === 'object' && (data as { rngSeed?: string }).rngSeed) {
        const s = (data as { rngSeed?: string }).rngSeed
        if (typeof s === 'string' && s.trim().length > 0) {
          seed = s
          source = 'state'
        }
      }
      res.json({ seed, source })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get deterministic RNG seed', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({ error: 'Failed to get deterministic RNG seed' })
    }
  },
)

// Get latest full state snapshot
router.get(
  '/games/:gameId/state',
  requirePermission('games.view'),
  param('gameId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const result = await dbQuery<{ game_data: unknown | null }>(
        'SELECT game_data FROM game_states WHERE room_id = $1',
        [gameId],
      )
      res.json({ state: result.rows?.[0]?.game_data ?? null })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get game state', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({ error: 'Failed to get game state' })
    }
  },
)

// List immutable state snapshots (meta only)
router.get(
  '/games/:gameId/snapshots',
  requirePermission('games.view'),
  param('gameId').isUUID(),
  queryParam('limit').optional().isInt({ min: 1, max: 200 }),
  queryParam('offset').optional().isInt({ min: 0 }),
  queryParam('order').optional().isIn(['asc', 'desc']),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 200)
      const offset = parseInt((req.query.offset as string) || '0', 10)
      const order = ((req.query.order as string) || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

      const listSql = `
        SELECT id, room_id, turn_number, phase, created_at
        FROM game_state_snapshots
        WHERE room_id = $1
        ORDER BY created_at ${order}
        LIMIT $2 OFFSET $3
      `
      const rowsRes = await dbQuery(listSql, [gameId, limit, offset])
      const countRes = await dbQuery(
        `SELECT COUNT(*) as total FROM game_state_snapshots WHERE room_id = $1`,
        [gameId],
      )
      res.json({
        snapshots: rowsRes.rows || [],
        total: Number.parseInt((countRes.rows?.[0]?.total as string) ?? '0', 10),
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to list snapshots', 500, { gameId: req.params.gameId })
      res.status(500).json({ error: 'Failed to list snapshots' })
    }
  },
)

// Get one immutable snapshot (full JSON)
router.get(
  '/games/:gameId/snapshots/:snapshotId',
  requirePermission('games.view'),
  param('gameId').isUUID(),
  param('snapshotId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId, snapshotId } = req.params
      const result = await dbQuery(
        `SELECT id, room_id, turn_number, phase, snapshot, created_at
         FROM game_state_snapshots
         WHERE id = $1 AND room_id = $2`,
        [snapshotId, gameId],
      )
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Snapshot not found' })
        return
      }
      res.json(result.rows[0])
    } catch (error) {
      handleRouteError(error, req, 'Failed to get snapshot', 500, {
        gameId: req.params.gameId,
        snapshotId: req.params.snapshotId,
      })
      res.status(500).json({ error: 'Failed to get snapshot' })
    }
  },
)

// Get active games count
router.get(
  '/games/active',
  requirePermission('games.view'),
  async (_req: Request, res: Response) => {
    try {
      const result = await dbQuery(`
        SELECT COUNT(*) as count 
        FROM game_rooms 
        WHERE status IN ('active', 'initializing')
      `)

      res.json({
        activeGames: parseInt(result.rows[0]?.count || '0', 10),
      })
    } catch (error) {
      handleRouteError(error, _req, 'Failed to get active games count')
      res.status(500).json({
        error: 'Failed to get active games count',
      })
    }
  },
)

// Force end a game
router.post(
  '/games/:gameId/force-end',
  requirePermission('games.manage'),
  logAdminActivity('game_force_end'),
  param('gameId').isUUID(),
  body('reason').isString().isLength({ min: 1, max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const { reason } = req.body
      const adminUserId = req.userId

      await dbQuery(
        'UPDATE game_rooms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['abandoned', gameId],
      )

      // Broadcast lifecycle update so connected clients exit gracefully
      try {
        const lifecycle = new GameLifecycleService()
        await lifecycle.refreshLifecycle(gameId)
      } catch (_e) {
        // best-effort; admin action still succeeds
      }

      // Log the action
      await dbQuery(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'game_force_end',
          JSON.stringify({ reason, gameId }),
          'game',
          gameId,
          req.ip,
          req.get('User-Agent'),
        ],
      )

      res.json({ success: true, message: 'Game force-ended successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to force-end game', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to force-end game',
      })
    }
  },
)

// Pause a game (only admins)
router.post(
  '/games/:gameId/pause',
  requirePermission('games.manage'),
  logAdminActivity('game_pause'),
  param('gameId').isUUID(),
  body('reason').optional().isString().isLength({ max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const { reason } = req.body
      const adminUserId = req.userId

      const result = await dbQuery(
        `UPDATE game_rooms 
         SET status = 'paused', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status IN ('in_progress', 'starting', 'active')
         RETURNING id`,
        [gameId],
      )

      if (result.rowCount === 0) {
        res.status(409).json({
          error: 'Game must be in progress to pause',
        })
        return
      }

      // Log the action
      await dbQuery(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'game_pause',
          JSON.stringify({ reason, gameId }),
          'game',
          gameId,
          req.ip,
          req.get('User-Agent'),
        ],
      )

      res.json({ success: true, message: 'Game paused successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to pause game', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to pause game',
      })
    }
  },
)

// Resume a game (only admins)
router.post(
  '/games/:gameId/resume',
  requirePermission('games.manage'),
  logAdminActivity('game_resume'),
  param('gameId').isUUID(),
  body('reason').optional().isString().isLength({ max: 500 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params
      const { reason } = req.body
      const adminUserId = req.userId

      const result = await dbQuery(
        `UPDATE game_rooms 
         SET status = 'active', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status = 'paused'
         RETURNING id`,
        [gameId],
      )

      if (result.rowCount === 0) {
        res.status(409).json({
          error: 'Game must be paused to resume',
        })
        return
      }

      // Log the action
      await dbQuery(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'game_resume',
          JSON.stringify({ reason, gameId }),
          'game',
          gameId,
          req.ip,
          req.get('User-Agent'),
        ],
      )

      res.json({ success: true, message: 'Game resumed successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to resume game', 500, {
        gameId: req.params.gameId,
      })
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to resume game',
      })
    }
  },
)

// Permanently delete a game and all associated data
router.delete(
  '/games/:gameId',
  requirePermission('games.manage'),
  logAdminActivity('game_delete'),
  param('gameId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    const { gameId } = req.params

    try {
      // Run the deletion in a transaction to ensure consistency
      const { deleted } = await transaction(async (client) => {
        // Lock the game row to avoid race conditions
        const exists = await dbQuery<{ id: string }>(
          'SELECT id FROM game_rooms WHERE id = $1 FOR UPDATE',
          [gameId],
          { client },
        )

        if ((exists.rowCount ?? 0) === 0) {
          return { deleted: false }
        }

        // rating_history references game_rooms without ON DELETE CASCADE
        await dbQuery('DELETE FROM rating_history WHERE game_room_id = $1', [gameId], { client })

        // Delete the game room itself; cascades will remove dependent rows
        await dbQuery('DELETE FROM game_rooms WHERE id = $1', [gameId], { client })

        return { deleted: true }
      })

      if (!deleted) {
        res.status(404).json({ error: 'Game not found' })
        return
      }

      // Best-effort: clear any cached state
      try {
        const { gameStateCache } = await import('../services/cacheService.js')
        await gameStateCache.deleteGameState(gameId)
      } catch (_e) {
        // ignore cache errors; deletion already committed
      }

      res.json({ success: true, message: 'Game and related data deleted' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to delete game', 500, { gameId })
      res.status(500).json({ error: 'Failed to delete game' })
    }
  },
)

// Get active games summary
router.get(
  '/games/active',
  requirePermission('games.view'),
  async (_req: Request, res: Response) => {
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
      `

      const result = await dbQuery<ActiveGameSummaryRow>(gamesQuery)

      const games = result.rows.map((game: ActiveGameSummaryRow) => ({
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
      }))

      res.json(games)
    } catch (error) {
      handleRouteError(error, _req, 'Failed to get active games')
      res.status(500).json({ error: 'Failed to get active games' })
    }
  },
)

// ============= FEATURE FLAGS =============

// Get all feature flags
router.get(
  '/feature-flags',
  requirePermission('system.view'),
  async (_req: Request, res: Response) => {
    try {
      const flags = await adminService.getFeatureFlags()
      res.json(flags)
    } catch (error) {
      handleRouteError(error, _req, 'Failed to get feature flags')
      res.status(500).json({ error: 'Failed to get feature flags' })
    }
  },
)

// Toggle feature flag
router.put(
  '/feature-flags/:flagName',
  requirePermission('system.admin'),
  logAdminActivity('feature_flag_toggle'),
  param('flagName').isString(),
  body('enabled').isBoolean(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { flagName } = req.params
      const { enabled } = req.body
      const adminUserId = req.userId

      const updated = await adminService.toggleFeatureFlag(flagName, enabled, adminUserId)

      if (!updated) {
        res.status(404).json({ error: 'Feature flag not found' })
        return
      }

      res.json({ message: 'Feature flag updated successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to toggle feature flag', 500, {
        flagName: req.params.flagName,
      })
      res.status(500).json({ error: 'Failed to toggle feature flag' })
    }
  },
)

router.patch(
  '/feature-flags/:flagName',
  requirePermission('system.admin'),
  logAdminActivity('feature_flag_update'),
  param('flagName').isString(),
  body('description').optional().isString(),
  body('accessLevel').optional().isIn(['disabled', 'internal', 'beta', 'public']),
  body('category').optional().isString(),
  body('config').optional().isObject(),
  body('dependencies').optional().isArray(),
  body('dependencies.*').optional().isString(),
  body('reason').optional().isString(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { flagName } = req.params
      const { description, accessLevel, category, config, dependencies, reason } = req.body

      const updated = await adminService.updateFeatureFlagSettings(
        flagName,
        {
          description,
          accessLevel,
          category,
          config,
          dependencies,
        },
        req.userId,
        reason,
      )

      if (!updated) {
        res.status(404).json({ error: 'Feature flag not found' })
        return
      }

      res.json({ message: 'Feature flag updated successfully', flag: updated })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update feature flag', 500, {
        flagName: req.params.flagName,
      })
      res.status(500).json({ error: 'Failed to update feature flag' })
    }
  },
)

router.get(
  '/users/:userId/feature-flags',
  requirePermission('users.view'),
  param('userId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const assignments = await adminService.getUserFeatureFlagAssignments(req.params.userId)
      res.json(assignments)
    } catch (error) {
      handleRouteError(error, req, 'Failed to fetch user feature flags', 500, {
        targetUserId: req.params.userId,
      })
      res.status(500).json({ error: 'Failed to fetch user feature flags' })
    }
  },
)

router.put(
  '/users/:userId/feature-flags/:flagName',
  requirePermission('users.edit'),
  logAdminActivity('feature_flag_user_override_set'),
  param('userId').isUUID(),
  param('flagName').isString(),
  body('enabled').isBoolean(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId, flagName } = req.params
      const { enabled } = req.body

      await adminService.setUserFeatureFlagOverride(userId, flagName, enabled, req.userId)
      res.json({ message: 'Feature flag override updated' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to set user feature flag override', 500, {
        targetUserId: req.params.userId,
        flagName: req.params.flagName,
      })
      res.status(500).json({ error: 'Failed to set feature flag override' })
    }
  },
)

router.delete(
  '/users/:userId/feature-flags/:flagName',
  requirePermission('users.edit'),
  logAdminActivity('feature_flag_user_override_cleared'),
  param('userId').isUUID(),
  param('flagName').isString(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { userId, flagName } = req.params
      await adminService.clearUserFeatureFlagOverride(userId, flagName, req.userId)
      res.status(204).send()
    } catch (error) {
      handleRouteError(error, req, 'Failed to clear user feature flag override', 500, {
        targetUserId: req.params.userId,
        flagName: req.params.flagName,
      })
      res.status(500).json({ error: 'Failed to clear feature flag override' })
    }
  },
)

// ============= ACTIVITY LOGS =============

// Get admin activity logs
router.get(
  '/logs/admin-activity',
  requirePermission('logs.view'),
  queryParam('limit').optional().isInt({ min: 1, max: 500 }),
  queryParam('offset').optional().isInt({ min: 0 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 100
      const offset = parseInt(req.query.offset as string, 10) || 0

      const logs = await adminService.getAdminActivityLogs(limit, offset)
      res.json(logs)
    } catch (error) {
      handleRouteError(error, req, 'Failed to get admin activity logs', 500, {
        limit: req.query.limit,
        offset: req.query.offset,
      })
      res.status(500).json({ error: 'Failed to get admin activity logs' })
    }
  },
)

// ============= SYSTEM INFO =============

// Get system status and metrics
router.get(
  '/system/status',
  requirePermission('system.view'),
  async (_req: Request, res: Response) => {
    try {
      // Get basic system metrics
      const dbStats = await dbQuery(`
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
      `)

      const featureFlags = await adminService.getFeatureFlags()

      const statsRow = dbStats.rows[0] ?? {}
      const parseCount = (value: unknown) =>
        parseInt((value as string | number | undefined)?.toString() ?? '0', 10)

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
        featureFlags: featureFlags.reduce(
          (acc, flag) => {
            acc[flag.flagName] = flag.isEnabled
            return acc
          },
          {} as Record<string, boolean>,
        ),
      })
    } catch (error) {
      handleRouteError(error, _req, 'Failed to get system status')
      res.status(500).json({ error: 'Failed to get system status' })
    }
  },
)

// ============= MAP MANAGEMENT =============

// Get single map details for editing
router.get(
  '/maps/:mapId',
  requirePermission('content.view'),
  param('mapId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { mapId } = req.params

      const mapResult = await dbQuery(
        `SELECT 
          m.*,
          u.username as creator_name
        FROM maps m
        LEFT JOIN users u ON m.creator_id = u.id
        WHERE m.id = $1`,
        [mapId],
      )

      if (mapResult.rows.length === 0) {
        res.status(404).json({ error: 'Map not found' })
        return
      }

      const map = mapResult.rows[0]

      // Get territories if they exist
      const territoriesResult = await dbQuery('SELECT * FROM map_territories WHERE map_id = $1', [
        mapId,
      ])

      // Get adjacencies, normalized to territory IDs for frontend preview compatibility
      // We use mapService.getMapAdjacencies to resolve name-based edges to UUIDs
      const normalizedAdjacencies = await mapService.getMapAdjacencies(mapId)

      // Shape adjacencies to include simple { from, to } fields expected by AdminMaps preview
      const adjacencies = normalizedAdjacencies.map((a) => ({
        from: a.fromTerritoryId,
        to: a.toTerritoryId,
      }))

      res.json({
        ...map,
        territories: territoriesResult.rows,
        adjacencies,
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get map details', 500, {
        mapId: req.params.mapId,
      })
      res.status(500).json({ error: 'Failed to get map details' })
    }
  },
)

// Update structural map content (territories, sectors (formerly continents), adjacencies, modifiers) from editor metadata
router.put(
  '/maps/:mapId/content',
  requirePermission('content.edit'),
  logAdminActivity('map_content_update'),
  param('mapId').isUUID(),
  body('metadata').optional().isObject(),
  body('name').optional().isString().isLength({ min: 1, max: 100 }),
  body('description').optional().isString().isLength({ max: 1000 }),
  body('imageUrl').optional().isString(),
  body('imageWidth').optional().isInt({ min: 1, max: 10000 }),
  body('imageHeight').optional().isInt({ min: 1, max: 10000 }),
  body('isPublic').optional().isBoolean(),
  body('tags').optional().isArray(),
  body('minPlayers').optional().isInt({ min: 2, max: 20 }),
  body('maxPlayers').optional().isInt({ min: 2, max: 20 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { mapId } = req.params
      const {
        metadata,
        name,
        description,
        imageUrl,
        imageWidth,
        imageHeight,
        isPublic,
        tags,
        minPlayers,
        maxPlayers,
      } = req.body || {}

      // Ensure map exists
      const existing = await mapService.getMap(mapId)
      if (!existing) {
        res.status(404).json({ error: 'Map not found' })
        return
      }

      // Apply structural updates first
      if (metadata && typeof metadata === 'object') {
        await mapService.updateMapContentFromMetadata(mapId, metadata)
      }

      // Apply ancillary map field updates
      if (
        name !== undefined ||
        description !== undefined ||
        imageUrl !== undefined ||
        imageWidth !== undefined ||
        imageHeight !== undefined ||
        isPublic !== undefined ||
        tags !== undefined
      ) {
        await mapService.updateMap(
          mapId,
          req.userId,
          {
            name,
            description,
            imageUrl,
            imageWidth,
            imageHeight,
            isPublic,
            tags,
          },
          { isAdmin: true, allowCollaborator: true },
        )
      }

      // Apply min/max players if supplied
      if (minPlayers !== undefined || maxPlayers !== undefined) {
        const sets: string[] = []
        const params: unknown[] = []
        let idx = 1
        if (minPlayers !== undefined) {
          sets.push(`min_players = $${idx++}`)
          params.push(minPlayers)
        }
        if (maxPlayers !== undefined) {
          sets.push(`max_players = $${idx++}`)
          params.push(maxPlayers)
        }
        params.push(mapId)
        await dbQuery(
          `UPDATE maps SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}`,
          params,
        )
      }

      res.json({ success: true })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update map content', 500, {
        mapId: req.params.mapId,
      })
      res.status(500).json({ error: 'Failed to update map content' })
    }
  },
)

// Get all maps with admin info
router.get(
  '/maps',
  requirePermission('content.view'),
  queryParam('limit').optional().isInt({ min: 1, max: 100 }),
  queryParam('offset').optional().isInt({ min: 0 }),
  queryParam('status').optional().isString(),
  queryParam('search').optional().isString(),
  queryParam('includeAll').optional().isBoolean(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50
      const offset = parseInt(req.query.offset as string, 10) || 0
      const status = req.query.status as string
      const search = req.query.search as string
      const includeAll = req.query.includeAll === 'true'

      let mapsQuery = `
        SELECT 
          m.*,
          u.username as "creatorName",
          COUNT(DISTINCT gr.id) as "playCount",
          COALESCE(AVG(mr.rating), 0) as "ratingAverage",
          COUNT(DISTINCT mr.id) as "ratingCount",
          (SELECT COUNT(*) FROM map_territories WHERE map_id = m.id) as "territoryCount",
          (SELECT COUNT(DISTINCT sector) FROM map_territories WHERE map_id = m.id AND sector IS NOT NULL) as "sectorCount"
        FROM maps m
        LEFT JOIN users u ON m.creator_id = u.id
        LEFT JOIN game_rooms gr ON gr.map_id = m.id
        LEFT JOIN map_ratings mr ON mr.map_id = m.id
        WHERE 1=1
      `
      const queryParams: unknown[] = []
      let paramIndex = 1

      // Only filter by status if specified and not includeAll
      if (!includeAll && status && status !== 'all') {
        mapsQuery += ` AND m.status = $${paramIndex}`
        queryParams.push(status)
        paramIndex++
      } else if (!includeAll) {
        // Default to showing only approved maps if not includeAll
        mapsQuery += ` AND m.status = 'approved'`
      }

      if (search) {
        mapsQuery += ` AND (m.name ILIKE $${paramIndex} OR m.description ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`
        queryParams.push(`%${search}%`)
        paramIndex++
      }

      mapsQuery += `
        GROUP BY m.id, u.username
        ORDER BY 
          CASE WHEN m.status = 'pending_review' THEN 0 ELSE 1 END,
          m.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `
      queryParams.push(limit, offset)
      paramIndex += 2 // Increment for both LIMIT and OFFSET

      const mapsResult = await dbQuery<AdminMapRow>(mapsQuery, queryParams)

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total
        FROM maps m
        WHERE 1=1
      `
      const countParams: unknown[] = []
      let countParamIndex = 1

      if (!includeAll && status && status !== 'all') {
        countQuery += ` AND m.status = $${countParamIndex}`
        countParams.push(status)
        countParamIndex++
      } else if (!includeAll) {
        countQuery += ` AND m.status = 'approved'`
      }

      if (search) {
        countQuery += ` AND (m.name ILIKE $${countParamIndex} OR m.description ILIKE $${countParamIndex})`
        countParams.push(`%${search}%`)
      }

      const countResult = await dbQuery(countQuery, countParams)

      // Convert numeric strings to numbers and map property names for proper frontend handling
      const maps = (mapsResult.rows as AdminMapRow[]).map((map) => {
        const imageUrl = resolveAssetUrl(req, map.image_url)

        const { legacyContinentCount, ...rest } = map
        const resolvedSectorCount =
          rest.sectorCount !== null && rest.sectorCount !== undefined
            ? rest.sectorCount
            : legacyContinentCount

        return {
          ...rest,
          image_url: imageUrl,
          imageUrl,
          playCount: parseInt(String(rest.playCount ?? '0'), 10),
          ratingAverage: Number.parseFloat(String(rest.ratingAverage ?? '0')),
          ratingCount: parseInt(String(rest.ratingCount ?? '0'), 10),
          territoryCount: parseInt(String(rest.territoryCount ?? '0'), 10),
          sectorCount: parseInt(String(resolvedSectorCount ?? '0'), 10),
          // Map snake_case to camelCase for dates
          createdAt: rest.created_at,
          updatedAt: rest.updated_at,
          creatorId: rest.creator_id,
          minPlayers: rest.min_players,
          maxPlayers: rest.max_players,
          isPublic: rest.is_public,
          isFeatured: rest.is_featured,
          isVipOnly: rest.is_vip_only || false,
        }
      })

      res.json({
        maps,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to get maps', 500, {
        limit: req.query.limit,
        offset: req.query.offset,
        status: req.query.status,
      })
      res.status(500).json({ error: 'Failed to get maps' })
    }
  },
)

// Update map properties
router.patch(
  '/maps/:mapId',
  requirePermission('content.edit'),
  logAdminActivity('map_update'),
  param('mapId').isUUID(),
  body('name').optional().isString().isLength({ min: 1, max: 100 }),
  body('description').optional().isString().isLength({ max: 1000 }),
  body('minPlayers').optional().isInt({ min: 2, max: 20 }),
  body('maxPlayers').optional().isInt({ min: 2, max: 20 }),
  body('status').optional().isIn(['draft', 'pending_review', 'approved', 'rejected', 'archived']),
  body('isFeatured').optional().isBoolean(),
  body('isPublic').optional().isBoolean(),
  body('isVipOnly').optional().isBoolean(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { mapId } = req.params
      const { name, description, minPlayers, maxPlayers, status, isFeatured, isPublic, isVipOnly } =
        req.body
      const adminUserId = req.userId

      // Build update query
      const updates: string[] = []
      const params: unknown[] = []
      let paramIndex = 1

      if (name !== undefined) {
        updates.push(`name = $${paramIndex}`)
        params.push(name)
        paramIndex++
      }

      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`)
        params.push(description)
        paramIndex++
      }

      if (minPlayers !== undefined) {
        updates.push(`min_players = $${paramIndex}`)
        params.push(minPlayers)
        paramIndex++
      }

      if (maxPlayers !== undefined) {
        updates.push(`max_players = $${paramIndex}`)
        params.push(maxPlayers)
        paramIndex++
      }

      if (status !== undefined) {
        updates.push(`status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      if (isFeatured !== undefined) {
        updates.push(`is_featured = $${paramIndex}`)
        params.push(isFeatured)
        paramIndex++
      }

      if (isPublic !== undefined) {
        updates.push(`is_public = $${paramIndex}`)
        params.push(isPublic)
        paramIndex++
      }

      if (isVipOnly !== undefined) {
        updates.push(`is_vip_only = $${paramIndex}`)
        params.push(isVipOnly)
        paramIndex++
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' })
        return
      }

      updates.push('updated_at = CURRENT_TIMESTAMP')
      params.push(mapId)

      const updateQuery = `
        UPDATE maps 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `

      const result = await dbQuery(updateQuery, params)

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Map not found' })
        return
      }

      // Log the action
      await dbQuery(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'map_update',
          JSON.stringify({ mapId, changes: req.body }),
          'map',
          mapId,
          req.ip,
          req.get('User-Agent'),
        ],
      )

      res.json({ message: 'Map updated successfully', map: result.rows[0] })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update map', 500, {
        mapId: req.params.mapId,
      })
      res.status(500).json({ error: 'Failed to update map' })
    }
  },
)

// Clone a map
router.post(
  '/maps/:mapId/clone',
  requirePermission('content.create'),
  logAdminActivity('map_clone'),
  param('mapId').isUUID(),
  body('assignedUserId').optional().isUUID().withMessage('Assigned user must be a valid UUID'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { mapId } = req.params
      const adminUserId = req.userId
      const assignedUserId = req.body.assignedUserId as string | undefined

      // Get the original map
      const originalMapResult = await dbQuery('SELECT * FROM maps WHERE id = $1', [mapId])

      if (originalMapResult.rows.length === 0) {
        res.status(404).json({ error: 'Map not found' })
        return
      }

      const originalMap = originalMapResult.rows[0]
      const clonedName = `${originalMap.name} (Copy)`

      if (assignedUserId) {
        const assignedUserCheck = await dbQuery('SELECT id FROM users WHERE id = $1', [
          assignedUserId,
        ])
        if (assignedUserCheck.rows.length === 0) {
          res.status(404).json({ error: 'Assigned user not found' })
          return
        }
      }

      // Create the cloned map
      const cloneResult = await dbQuery(
        `INSERT INTO maps (name, description, image_url, min_players, max_players, creator_id, status, capital_assignments, capital_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          clonedName,
          originalMap.description,
          originalMap.image_url,
          originalMap.min_players,
          originalMap.max_players,
          adminUserId,
          'draft', // Always start clones as draft
          originalMap.capital_assignments,
          originalMap.capital_metadata,
        ],
      )

      const clonedMap = cloneResult.rows[0]

      if (assignedUserId) {
        await dbQuery(
          `
          INSERT INTO map_collaborators (map_id, user_id, role, assigned_by)
          VALUES ($1, $2, 'editor', $3)
          ON CONFLICT (map_id, user_id)
          DO UPDATE SET role = EXCLUDED.role, assigned_at = CURRENT_TIMESTAMP, assigned_by = EXCLUDED.assigned_by
        `,
          [clonedMap.id, assignedUserId, adminUserId],
        )
      }

      // Clone territories if they exist
      const territoriesResult = await dbQuery('SELECT * FROM map_territories WHERE map_id = $1', [
        mapId,
      ])

      if (territoriesResult.rows.length > 0) {
        for (const territory of territoriesResult.rows) {
          await dbQuery(
            `INSERT INTO map_territories (map_id, name, polygon, center_x, center_y, sector, army_position, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              clonedMap.id,
              territory.name,
              territory.polygon,
              territory.center_x,
              territory.center_y,
              territory.sector,
              territory.army_position,
              territory.metadata,
            ],
          )
        }
      }

      // Clone adjacencies if they exist
      const adjacenciesResult = await dbQuery(
        'SELECT * FROM territory_adjacencies WHERE map_id = $1',
        [mapId],
      )

      if (adjacenciesResult.rows.length > 0) {
        for (const adjacency of adjacenciesResult.rows) {
          await dbQuery(
            `INSERT INTO territory_adjacencies (map_id, territory_from, territory_to)
             VALUES ($1, $2, $3)`,
            [clonedMap.id, adjacency.territory_from, adjacency.territory_to],
          )
        }
      }

      // Log the action
      await dbQuery(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'map_clone',
          JSON.stringify({ originalMapId: mapId, clonedMapId: clonedMap.id }),
          'map',
          clonedMap.id,
          req.ip,
          req.get('User-Agent'),
        ],
      )

      res.json({
        message: 'Map cloned successfully',
        map: clonedMap,
        name: clonedName,
        assignedTo: assignedUserId ?? adminUserId,
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to clone map', 500, {
        mapId: req.params.mapId,
      })
      res.status(500).json({ error: 'Failed to clone map' })
    }
  },
)

// Update map status (approve/reject)
router.patch(
  '/maps/:mapId/status',
  requirePermission('content.moderate'),
  logAdminActivity('map_status_update'),
  param('mapId').isUUID(),
  body('status').isIn(['draft', 'pending_review', 'approved', 'rejected', 'archived']),
  body('notes').optional().isString().isLength({ max: 1000 }),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { mapId } = req.params
      const { status, notes } = req.body
      const adminUserId = req.userId

      // Update map status
      const mapResult = await dbQuery(
        `UPDATE maps 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [status, mapId],
      )

      if (mapResult.rows.length === 0) {
        res.status(404).json({ error: 'Map not found' })
        return
      }

      // If approved or rejected, create a review record
      if (status === 'approved' || status === 'rejected') {
        await dbQuery(
          `INSERT INTO map_reviews (map_id, reviewer_id, status, notes, reviewed_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (map_id, reviewer_id) 
           DO UPDATE SET status = $3, notes = $4, reviewed_at = CURRENT_TIMESTAMP`,
          [mapId, adminUserId, status, notes],
        )
      }

      // Log the action
      await dbQuery(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'map_status_update',
          JSON.stringify({ mapId, status, notes }),
          'map',
          mapId,
          req.ip,
          req.get('User-Agent'),
        ],
      )

      res.json({ message: 'Map status updated successfully', map: mapResult.rows[0] })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update map status', 500, {
        mapId: req.params.mapId,
        status: req.body?.status,
      })
      res.status(500).json({ error: 'Failed to update map status' })
    }
  },
)

// Delete map
router.delete(
  '/maps/:mapId',
  requirePermission('content.delete'),
  logAdminActivity('map_delete'),
  param('mapId').isUUID(),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { mapId } = req.params
      const adminUserId = req.userId

      // Check if map is being used in active games
      const gamesCheck = await dbQuery(
        `SELECT COUNT(*) as count 
         FROM game_rooms 
         WHERE map_id = $1 AND status IN ('in_progress', 'starting', 'waiting')`,
        [mapId],
      )

      if (parseInt(gamesCheck.rows[0].count, 10) > 0) {
        res.status(400).json({
          error: 'Cannot delete map that is being used in active or waiting games',
        })
        return
      }

      // Get map info before deletion for logging
      const mapInfo = await dbQuery('SELECT * FROM maps WHERE id = $1', [mapId])

      if (mapInfo.rows.length === 0) {
        res.status(404).json({ error: 'Map not found' })
        return
      }

      // Delete map (and its unreferenced image asset) using service
      await mapService.deleteMap(mapId, adminUserId, { isAdmin: true })

      // Log the action
      await dbQuery(
        `INSERT INTO admin_activity_logs (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'map_delete',
          JSON.stringify({ mapId, mapName: mapInfo.rows[0].name }),
          'map',
          mapId,
          req.ip,
          req.get('User-Agent'),
        ],
      )

      res.json({ message: 'Map deleted successfully' })
    } catch (error) {
      handleRouteError(error, req, 'Failed to delete map', 500, {
        mapId: req.params.mapId,
      })
      res.status(500).json({ error: 'Failed to delete map' })
    }
  },
)

// ============= CACHE MANAGEMENT =============

// Refresh server caches (available to all admins)
router.post(
  '/cache/refresh',
  // No specific permission required - any admin can refresh cache
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId
      logger.info('Admin cache refresh requested', { adminId: userId })

      // Log the admin activity
      try {
        await adminService.logAdminAction(userId, 'cache.refresh', {
          timestamp: new Date().toISOString(),
        })
      } catch (logError) {
        logger.warn('Failed to log cache refresh activity:', logError)
        // Don't fail the request if logging fails
      }

      // Clear any in-memory caches (if you have any)
      // For example, if you have a map cache or user cache:

      // Clear map service cache if it exists
      const { mapService } = await import('../services/mapService.js')
      const maybeClear = (mapService as { clearCache?: () => void }).clearCache
      if (typeof maybeClear === 'function') {
        maybeClear.call(mapService)
      }

      // Clear any Redis cache if configured
      const redisUrl = process.env.REDIS_URL
      if (redisUrl) {
        try {
          // Use the existing Redis client if available
          const { getRedisClient } = await import('../config/redis.js')
          const redis = getRedisClient()
          if (redis) {
            await redis.flushdb()
            logger.info('Redis cache cleared')
          } else {
            logger.info('Redis not connected, skipping cache clear')
          }
        } catch (redisError) {
          logger.warn('Redis cache clear failed (non-critical):', redisError)
        }
      }

      // Clear any Node.js module cache for hot-reloading (development only)
      // In ESM, module cache invalidation is not supported the same way; skip in dev.

      logger.info('Cache refresh completed successfully', { adminId: userId })
      res.json({
        success: true,
        message: 'Cache refreshed successfully',
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      handleRouteError(error, req, 'Failed to refresh cache')
      res.status(500).json({ error: 'Failed to refresh cache' })
    }
  },
)

export default router
// Lightweight realtime metrics for Socket.IO/game actions
router.get('/realtime-metrics', async (_req: Request, res: Response) => {
  try {
    const { realtimeMetrics, socketPayloadMetrics } = await import('../services/metricsService.js')
    const payloads = {
      gameSnapshot: socketPayloadMetrics.snapshot('game:snapshot'),
      gameEvent: socketPayloadMetrics.snapshot('game:event'),
    }
    const realtime = realtimeMetrics.snapshot()
    res.json({
      ok: true,
      payloads,
      realtime,
      ts: new Date().toISOString(),
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error)?.message || 'failed' })
  }
})

// Reset in-memory realtime metrics (admin)
router.post('/realtime-metrics/reset', requirePermission('system.edit'), async (_req, res) => {
  try {
    const { realtimeMetrics, socketPayloadMetrics } = await import('../services/metricsService.js')
    // Best-effort resets
    try {
      realtimeMetrics.reset()
    } catch (error) {
      logger.warn('Failed to reset realtime metrics (best-effort)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    try {
      socketPayloadMetrics.reset()
    } catch (error) {
      logger.warn('Failed to reset socket payload metrics (best-effort)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    res.json({ ok: true, reset: ['realtime', 'socketPayloads'] })
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error)?.message || 'failed' })
  }
})
