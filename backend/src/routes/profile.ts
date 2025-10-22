/**
 * @fileoverview This file defines the Express routes for managing user profiles.
 * It includes endpoints for updating profiles, and fetching user statistics, achievements, and game history.
 * All routes in this file require authentication.
 * @module routes/profile
 */
import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import { profileService } from '../services/profileService.js'
import type { ProfileUpdateRequest } from '../types/profile.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const router = Router()

// All profile routes require authentication
router.use(authenticateToken)

// NOTE: GET /api/profile (root) removed in favor of /api/users/profile

/**
 * Route to update the profile of the authenticated user.
 * @name PUT /profile
 * @function
 * @memberof module:routes/profile
 * @param {import('express').Request} req - The Express request object, containing the profile updates in the body.
 * @param {import('express').Response} res - The Express response object, returning the updated profile.
 * @returns {Promise<void>}
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const updates: ProfileUpdateRequest = req.body

    const updatedProfile = await profileService.updateProfile(userId, updates)
    res.json(updatedProfile)
  }),
)

/**
 * Route to get detailed statistics for the authenticated user.
 * @name GET /profile/stats
 * @function
 * @memberof module:routes/profile
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object, returning the user's statistics.
 * @returns {Promise<void>}
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const stats = await profileService.getUserStats(userId)
    res.json(stats)
  }),
)

/**
 * Route to get the achievements for the authenticated user.
 * @name GET /profile/achievements
 * @function
 * @memberof module:routes/profile
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object, returning the user's achievements.
 * @returns {Promise<void>}
 */
router.get(
  '/achievements',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const achievements = await profileService.getAchievements(userId)
    res.json(achievements)
  }),
)

/**
 * Route for admins to unlock an achievement for a user.
 * This is intended for testing purposes.
 * @name POST /profile/achievements/:achievementId
 * @function
 * @memberof module:routes/profile
 * @param {import('express').Request} req - The Express request object, with `achievementId` as a URL parameter.
 * @param {import('express').Response} res - The Express response object, returning the unlocked achievement.
 * @returns {Promise<void>}
 */
router.post(
  '/achievements/:achievementId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const { achievementId } = req.params

    const achievement = await profileService.unlockAchievement(userId, achievementId)
    res.status(201).json(achievement)
  }),
)

/**
 * Route to get the game history for the authenticated user, with pagination.
 * @name GET /profile/history
 * @function
 * @memberof module:routes/profile
 * @param {import('express').Request} req - The Express request object, which can contain `limit` and `offset` query parameters.
 * @param {import('express').Response} res - The Express response object, returning the user's game history.
 * @returns {Promise<void>}
 */
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const rawLimit = parseInt(req.query.limit as string, 10)
    const rawOffset = parseInt(req.query.offset as string, 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0

    const matches = await profileService.getGameHistory(userId, limit, offset)
    res.json({
      matches,
      pagination: {
        limit,
        offset,
        returned: matches.length,
        hasMore: matches.length === limit,
      },
    })
  }),
)

/**
 * Route to update the preferences of the authenticated user.
 * @name PUT /profile/preferences
 * @function
 * @memberof module:routes/profile
 * @param {import('express').Request} req - The Express request object, containing the preferences to update in the body.
 * @param {import('express').Response} res - The Express response object, returning the updated preferences.
 * @returns {Promise<void>}
 */
router.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const preferences = req.body

    const updatedPreferences = await profileService.updatePreferences(userId, preferences)
    res.json(updatedPreferences)
  }),
)

// NOTE: GET /api/profile/leaderboard removed; use /api/skills/leaderboards/skill

// NOTE: GET /api/profile/:userId removed; use /api/users/:username/profile

export default router
