/**
 * @fileoverview This file defines the Express router for managing user preferences.
 * It includes routes for getting and updating user preferences, with specific handling for premium features like themes and colors.
 * @module routes/preferences
 */
import { normalizeThemeId } from '@conquestk/shared/types/themes'
import type { Request, Response } from 'express'
import { Router } from 'express'
import type { Pool } from 'pg'
import {
  isPremiumColorChoice,
  isPremiumThemeId,
  normalizePremiumAwareColor,
  PREMIUM_COLOR_MESSAGE,
  PREMIUM_THEME_MESSAGE,
  PREMIUM_UPSELL_ERROR_CODE,
} from '../constants/premium.js'
import { authenticateToken } from '../middleware/auth.js'
import { UserPreferencesService } from '../services/UserPreferencesService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

/**
 * Creates and configures the Express router for user preferences.
 * @param {Pool} pool - The PostgreSQL connection pool.
 * @returns {Router} The configured Express router for preferences.
 */
export function createPreferencesRouter(pool: Pool): Router {
  const router = Router()
  const preferencesService = new UserPreferencesService(pool)

  /**
   * Route to get the preferences for the authenticated user.
   * @name GET /preferences
   * @function
   * @memberof module:routes/preferences
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object, containing the user's preferences.
   * @returns {Promise<Response>}
   */
  router.get('/', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = (req.user?.id || req.userId) as string | undefined
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
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

  /**
   * Route to update the preferences for the authenticated user.
   * It handles checks for premium features like themes and colors.
   * @name PUT /preferences
   * @function
   * @memberof module:routes/preferences
   * @param {Request} req - The Express request object, containing the preferences to update in the body.
   * @param {Response} res - The Express response object, returning the updated preferences.
   * @returns {Promise<Response>}
   */
  router.put('/', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = (req.user?.id || req.userId) as string | undefined
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }

      const hasPremium =
        req.user?.hasPremium === true ||
        (typeof req.user?.premiumTier === 'string' && req.user?.premiumTier !== 'free')

      if (typeof req.body?.theme === 'string') {
        const normalizedTheme = normalizeThemeId(req.body.theme)
        if (!hasPremium && isPremiumThemeId(normalizedTheme)) {
          return res.status(403).json({
            error: PREMIUM_UPSELL_ERROR_CODE,
            message: PREMIUM_THEME_MESSAGE,
          })
        }
        req.body.theme = normalizedTheme
      }

      if (typeof req.body?.preferredColor === 'string') {
        const normalizedPreferredColor = normalizePremiumAwareColor(req.body.preferredColor)
        if (
          normalizedPreferredColor &&
          !hasPremium &&
          isPremiumColorChoice(normalizedPreferredColor)
        ) {
          return res.status(403).json({
            error: PREMIUM_UPSELL_ERROR_CODE,
            message: PREMIUM_COLOR_MESSAGE,
          })
        }
        req.body.preferredColor = normalizedPreferredColor ?? req.body.preferredColor
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

  /**
   * Route to update the theme specifically for the authenticated user.
   * It includes a check to ensure that premium themes can only be used by premium users.
   * @name PUT /preferences/theme
   * @function
   * @memberof module:routes/preferences
   * @param {Request} req - The Express request object, containing the new `theme` in the body.
   * @param {Response} res - The Express response object, confirming the theme update.
   * @returns {Promise<Response>}
   */
  router.put('/theme', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = (req.user?.id || req.userId) as string | undefined
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const { theme } = req.body

      if (!theme) {
        return res.status(400).json({ error: 'Theme is required' })
      }

      const hasPremium =
        req.user?.hasPremium === true ||
        (typeof req.user?.premiumTier === 'string' && req.user?.premiumTier !== 'free')
      const normalizedTheme = normalizeThemeId(theme)

      if (!hasPremium && isPremiumThemeId(normalizedTheme)) {
        return res.status(403).json({
          error: PREMIUM_UPSELL_ERROR_CODE,
          message: PREMIUM_THEME_MESSAGE,
        })
      }

      const updatedTheme = await preferencesService.updateTheme(userId, normalizedTheme)

      if (!updatedTheme) {
        return res.status(500).json({ error: 'Failed to update theme' })
      }

      return res.json({ success: true, theme: updatedTheme })
    } catch (error) {
      handleRouteError(error, req, 'Failed to update theme')
      return res.status(500).json({ error: 'Failed to update theme' })
    }
  })

  return router
}
