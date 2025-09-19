import { Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import { profileService } from '../services/profileService'
import type { ProfileResponse, ProfileUpdateRequest } from '../types/profile'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// All profile routes require authentication
router.use(authenticateToken)

// GET /api/profile - Get complete user profile
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId
    const profile = await profileService.getUserProfile(userId)
    res.json(profile)
  }),
)

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

// POST /api/profile/achievements/:achievementId - Unlock achievement (admin/testing)
router.post(
  '/achievements/:achievementId',
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
    const limit = parseInt(req.query.limit as string, 10) || 50
    const offset = parseInt(req.query.offset as string, 10) || 0

    const history = await profileService.getGameHistory(userId, limit, offset)
    res.json(history)
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

// GET /api/profile/leaderboard - Get global leaderboard
router.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 100
    const leaderboard = await profileService.getLeaderboard(limit)
    res.json(leaderboard)
  }),
)

// GET /api/profile/:userId - Get another user's public profile
router.get(
  '/:userId',
  asyncHandler(async (req, res) => {
    const { userId } = req.params
    const requesterId = req.userId

    // Get basic profile info (respecting privacy settings)
    const profileResponse: ProfileResponse = await profileService.getUserProfile(userId)

    // Filter based on privacy settings
    if (profileResponse.preferences.privacyLevel === 'private' && userId !== requesterId) {
      return res.status(403).json({ error: 'Profile is private' })
    }

    // Remove sensitive information for other users
    if (userId !== requesterId) {
      const { preferences: _preferences, ...publicProfile } = profileResponse
      // Only show limited data for non-friends
      return res.json({
        ...publicProfile,
        recentGames: [],
      })
    }

    return res.json(profileResponse)
  }),
)

export default router
