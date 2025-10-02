import type { Request, Response } from 'express'
import { Router } from 'express'
import { query } from '../config/database'
import { requireAdmin } from '../middleware/adminAuth'
import { authenticateToken } from '../middleware/auth'
import { type AccessLevel, featureFlagService } from '../services/featureFlagService'
import { handleRouteError } from '../utils/routeErrorHandler'

const router = Router()

// Get all feature flags evaluated for current user
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

// Admin: Get all feature flags with details
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

// Admin: Update a feature flag
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

// Admin: Get audit log
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

// Admin: Set user override
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
