import type { Request, Response } from 'express'
import { Router } from 'express'
import { query } from '../config/database.js'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import { type AccessLevel, featureFlagService } from '../services/featureFlagService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

/**
 * This file contains the routes for managing feature flags.
 * It includes routes for listing all feature flags, as well as admin-only routes for
 * updating flags, viewing the audit log, and setting user overrides.
 */

const router = Router()

/**
 * @api {get} /feature-flags Get all feature flags evaluated for the current user
 * @apiName GetFeatureFlags
 * @apiGroup FeatureFlags
 *
 * @apiSuccess {Object[]} flags The list of feature flags.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Get user from request if authenticated
    const flags = await featureFlagService.evaluateForUser(req.user ? { ...req.user } : undefined)
    res.json({ flags })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch feature flags')
    res.status(500).json({ error: 'Failed to fetch feature flags' })
  }
})

/**
 * @api {get} /feature-flags/admin Get all feature flags with details (admin only)
 * @apiName GetFeatureFlagsAdmin
 * @apiGroup FeatureFlags
 * @apiPermission admin
 *
 * @apiSuccess {Object[]} flags The list of feature flags with their details.
 */
router.get(
  '/admin',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await query('SELECT * FROM feature_flags ORDER BY created_at DESC')

      res.json({ flags: result.rows })
    } catch (error) {
      handleRouteError(error, req, 'Failed to fetch feature flags')
      res.status(500).json({ error: 'Failed to fetch feature flags' })
    }
  },
)

/**
 * @api {put} /feature-flags/:flagName Update a feature flag (admin only)
 * @apiName UpdateFeatureFlag
 * @apiGroup FeatureFlags
 * @apiPermission admin
 *
 * @apiParam {String} flagName The name of the feature flag to update.
 *
 * @apiBody {Boolean} [enabled] Whether the feature flag should be enabled.
 * @apiBody {String} [access_level] The access level for the feature flag.
 * @apiBody {Object} [target_criteria] The targeting criteria for the feature flag.
 * @apiBody {String} [reason] The reason for the update.
 *
 * @apiSuccess {Object} flag The updated feature flag.
 */
router.put(
  '/:flagName',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { flagName } = req.params
    const {
      enabled,
      access_level,
      target_criteria,
      reason,
    }: {
      enabled?: boolean
      access_level?: AccessLevel
      target_criteria?: Record<string, unknown>
      reason?: string
    } = req.body
    const userId = req.user?.id || 'system'

    try {
      const updates: Partial<{
        is_enabled: boolean
        access_level: AccessLevel
        target_criteria: Record<string, unknown>
      }> = {}
      if (enabled !== undefined) updates.is_enabled = enabled
      if (access_level !== undefined) updates.access_level = access_level
      if (target_criteria !== undefined) updates.target_criteria = target_criteria

      const flag = await featureFlagService.updateFlag(flagName, updates, userId, reason)

      if (!flag) {
        res.status(404).json({ error: 'Feature flag not found' })
        return
      }

      res.json({ flag })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update feature flag')
      res.status(500).json({ error: 'Failed to update feature flag' })
    }
  },
)

/**
 * @api {get} /feature-flags/audit Get the audit log for feature flags (admin only)
 * @apiName GetFeatureFlagAuditLog
 * @apiGroup FeatureFlags
 * @apiPermission admin
 *
 * @apiParam {String} [flag_name] The name of the feature flag to get the audit log for.
 * @apiParam {Number} [limit=50] The maximum number of audit log entries to return.
 *
 * @apiSuccess {Object[]} audit The list of audit log entries.
 */
router.get(
  '/audit',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { flag_name, limit = 50 } = req.query

    try {
      const auditLog = await featureFlagService.getAuditLog(flag_name as string, Number(limit))
      res.json({ audit: auditLog })
    } catch (error) {
      handleRouteError(error, req, 'Failed to fetch audit log')
      res.status(500).json({ error: 'Failed to fetch audit log' })
    }
  },
)

/**
 * @api {post} /feature-flags/user-override Set a user override for a feature flag (admin only)
 * @apiName SetFeatureFlagUserOverride
 * @apiGroup FeatureFlags
 * @apiPermission admin
 *
 * @apiBody {String} user_id The ID of the user to set the override for.
 * @apiBody {String} flag_name The name of the feature flag.
 * @apiBody {Boolean} enabled Whether the feature flag should be enabled for the user.
 *
 * @apiSuccess {Boolean} success Whether the request was successful.
 */
router.post(
  '/user-override',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { user_id, flag_name, enabled } = req.body

    try {
      await featureFlagService.setUserOverride(user_id, flag_name, enabled)
      res.json({ success: true })
    } catch (error) {
      handleRouteError(error, req, 'Failed to set user override')
      res.status(500).json({ error: 'Failed to set user override' })
    }
  },
)

export default router
