import { Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import { profileService } from '../services/profileService'
import type { ProfileUpdateRequest } from '../types/profile'

const router = Router()

// All profile routes require authentication
router.use(authenticateToken)

// GET /api/profile - Get complete user profile
router.get('/', async (req, res) => {
  try {
    const userId = req.userId
    const profile = await profileService.getUserProfile(userId)
    res.json(profile)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// PUT /api/profile - Update user profile
router.put('/', async (req, res) => {
  try {
    const userId = req.userId
    const updates: ProfileUpdateRequest = req.body

    const updatedProfile = await profileService.updateProfile(userId, updates)
    res.json(updatedProfile)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// GET /api/profile/stats - Get detailed user statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.userId
    const stats = await profileService.getUserStats(userId)
    res.json(stats)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch statistics' })
  }
})

// GET /api/profile/achievements - Get user achievements
router.get('/achievements', async (req, res) => {
  try {
    const userId = req.userId
    const achievements = await profileService.getAchievements(userId)
    res.json(achievements)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch achievements' })
  }
})

// POST /api/profile/achievements/:achievementId - Unlock achievement (admin/testing)
router.post('/achievements/:achievementId', async (req, res) => {
  try {
    const userId = req.userId
    const { achievementId } = req.params

    const achievement = await profileService.unlockAchievement(userId, achievementId)
    res.status(201).json(achievement)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to unlock achievement' })
  }
})

// GET /api/profile/history - Get game history
router.get('/history', async (req, res) => {
  try {
    const userId = req.userId
    const limit = parseInt(req.query.limit as string, 10) || 50
    const offset = parseInt(req.query.offset as string, 10) || 0

    const history = await profileService.getGameHistory(userId, limit, offset)
    res.json(history)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch game history' })
  }
})

// PUT /api/profile/preferences - Update user preferences
router.put('/preferences', async (req, res) => {
  try {
    const userId = req.userId
    const preferences = req.body

    const updatedPreferences = await profileService.updatePreferences(userId, preferences)
    res.json(updatedPreferences)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to update preferences' })
  }
})

// GET /api/profile/leaderboard - Get global leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100
    const leaderboard = await profileService.getLeaderboard(limit)
    res.json(leaderboard)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

// GET /api/profile/:userId - Get another user's public profile
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const requesterId = req.userId

    // Get basic profile info (respecting privacy settings)
    const profile = await profileService.getUserProfile(userId)

    // Filter based on privacy settings
    if (profile.preferences.privacyLevel === 'private' && userId !== requesterId) {
      return res.status(403).json({ error: 'Profile is private' })
    }

    // Remove sensitive information for other users
    if (userId !== requesterId) {
      delete (profile as any).preferences
      // Only show limited data for non-friends
      profile.recentGames = []
    }

    return res.json(profile)
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch user profile' })
  }
})

export default router
