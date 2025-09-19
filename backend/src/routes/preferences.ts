import type { Request, Response } from 'express'
import { Router } from 'express'
import type { Pool } from 'pg'
import { authenticateToken } from '../middleware/auth'
import { UserPreferencesService } from '../services/UserPreferencesService'
import { handleRouteError } from '../utils/routeErrorHandler'

export function createPreferencesRouter(pool: Pool): Router {
  const router = Router()
  const preferencesService = new UserPreferencesService(pool)

  // Get user preferences
  router.get('/', authenticateToken, async (req: Request, res: Response) => {
    try {
      const rawUserId = req.user?.id || req.userId
      if (!rawUserId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const userId = Number(rawUserId)
      if (Number.isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user identifier' })
      }

      const preferences = await preferencesService.getPreferences(userId)

      if (!preferences) {
        return res.status(404).json({ error: 'Preferences not found' })
      }

      return res.json(preferences)
    } catch (error) {
      handleRouteError(error, req, 'Failed to fetch preferences')
      return res.status(500).json({ error: 'Failed to fetch preferences' })
    }
  })

  // Update user preferences
  router.put('/', authenticateToken, async (req: Request, res: Response) => {
    try {
      const rawUserId = req.user?.id || req.userId
      if (!rawUserId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const userId = Number(rawUserId)
      if (Number.isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user identifier' })
      }

      const preferences = await preferencesService.updatePreferences(userId, req.body)

      if (!preferences) {
        return res.status(500).json({ error: 'Failed to update preferences' })
      }

      return res.json(preferences)
    } catch (error) {
      handleRouteError(error, req, 'Failed to update preferences')
      return res.status(500).json({ error: 'Failed to update preferences' })
    }
  })

  // Update theme specifically
  router.put('/theme', authenticateToken, async (req: Request, res: Response) => {
    try {
      const rawUserId = req.user?.id || req.userId
      if (!rawUserId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const userId = Number(rawUserId)
      if (Number.isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user identifier' })
      }
      const { theme } = req.body

      if (!theme) {
        return res.status(400).json({ error: 'Theme is required' })
      }

      const success = await preferencesService.updateTheme(userId, theme)

      if (!success) {
        return res.status(500).json({ error: 'Failed to update theme' })
      }

      return res.json({ success: true, theme })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update theme')
      return res.status(500).json({ error: 'Failed to update theme' })
    }
  })

  return router
}
