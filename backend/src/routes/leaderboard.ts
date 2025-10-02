import { Router } from 'express'
import { profileService } from '../services/profileService'
import { handleRouteError } from '../utils/routeErrorHandler'

const router = Router()

// Public global leaderboard (legacy-compatible shape)
router.get(['/', '/global'], async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100
    const data = await profileService.getLeaderboard(limit)

    const leaderboard = data.map((entry) => ({
      id: entry.userId,
      username: entry.username,
      elo: Math.round(entry.rating),
      wins: entry.gamesWon,
      losses:
        typeof entry.gamesPlayed === 'number' ? Math.max(0, entry.gamesPlayed - entry.gamesWon) : 0,
      winRate: entry.winRate,
      rank: entry.rank,
      gamesPlayed: entry.gamesPlayed,
    }))

    return res.json({ leaderboard })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch global leaderboard', 500, {
      limit: req.query.limit,
    })
    return res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

// Placeholders to avoid 404s for older clients
router.get('/monthly', async (_req, res) => {
  return res.json({ leaderboard: [] })
})

router.get('/friends', async (_req, res) => {
  return res.json({ leaderboard: [] })
})

export default router
