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

// PUT /api/profile - Update user profile
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const updates: ProfileUpdateRequest = req.body

    const updatedProfile = await profileService.updateProfile(userId, updates)
    res.json(updatedProfile)
  }),
)

// GET /api/profile/stats - Get detailed user statistics
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const stats = await profileService.getUserStats(userId)
    res.json(stats)
  }),
)

// GET /api/profile/achievements - Get user achievements
router.get(
  '/achievements',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const achievements = await profileService.getAchievements(userId)
    res.json(achievements)
  }),
)

// POST /api/profile/achievements/:achievementId - Unlock achievement (admin/testing only)
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

// GET /api/profile/history - Get game history
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

// PUT /api/profile/preferences - Update user preferences
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
