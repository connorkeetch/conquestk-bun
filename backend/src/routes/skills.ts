import { Router } from 'express'
import { query } from '../config/database'
import { authenticateToken } from '../middleware/auth'
import { eloService } from '../services/eloService'
import { logger } from '../utils/logger'

const router = Router()

/**
 * Get user's skill rating info
 */
router.get('/users/:userId/rating', async (req, res) => {
  try {
    const { userId } = req.params

    const userQuery = `
      SELECT 
        id,
        username,
        skill_rating,
        skill_confidence,
        total_ranked_games,
        ranked_wins,
        ranked_losses,
        highest_skill_rating,
        current_tier,
        last_ranked_game_at
      FROM users
      WHERE id = ?
    `

    const result = await query(userQuery, [userId])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]
    const tier = eloService.getSkillTier(user.skill_rating || 1000)

    // Calculate win rate
    const winRate =
      user.total_ranked_games > 0
        ? ((user.ranked_wins / user.total_ranked_games) * 100).toFixed(1)
        : 0

    return res.json({
      userId: user.id,
      username: user.username,
      skillRating: user.skill_rating || 1000,
      confidence: user.skill_confidence || 0,
      tier: {
        ...tier,
        current: user.current_tier || 'Gold',
      },
      stats: {
        totalGames: user.total_ranked_games || 0,
        wins: user.ranked_wins || 0,
        losses: user.ranked_losses || 0,
        winRate: parseFloat(winRate as string),
        highestRating: user.highest_skill_rating || 1000,
      },
      lastRankedGame: user.last_ranked_game_at,
    })
  } catch (error) {
    logger.error('Error fetching user rating:', error)
    return res.status(500).json({ error: 'Failed to fetch user rating' })
  }
})

/**
 * Get user's rating history
 */
router.get('/users/:userId/rating-history', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const limit = parseInt(req.query.limit as string, 10) || 30

    const history = await eloService.getRatingHistory(userId, limit)

    res.json({
      history: history.map((entry) => ({
        gameId: entry.game_id,
        gameName: entry.game_name,
        gameDate: entry.game_date,
        ratingBefore: entry.rating_before,
        ratingAfter: entry.rating_after,
        change: entry.rating_change,
        position: entry.position,
        totalPlayers: entry.total_players,
      })),
    })
  } catch (error) {
    logger.error('Error fetching rating history:', error)
    res.status(500).json({ error: 'Failed to fetch rating history' })
  }
})

/**
 * Get skill leaderboard
 */
router.get('/leaderboards/skill', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100
    const offset = parseInt(req.query.offset as string, 10) || 0
    const tier = req.query.tier as string

    const leaderboard = await eloService.getLeaderboard(limit, offset, tier)

    res.json({
      leaderboard: leaderboard.map((entry, index) => ({
        rank: offset + index + 1,
        userId: entry.user_id,
        username: entry.username,
        skillRating: entry.skill_rating,
        tier: entry.tier,
        confidence: entry.skill_confidence,
        totalGames: entry.total_ranked_games,
        winRate: entry.win_rate,
        recentTrend: entry.recent_trend,
        lastChange: entry.last_game_change,
      })),
    })
  } catch (error) {
    logger.error('Error fetching leaderboard:', error)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

/**
 * Get current user's rank position
 */
router.get('/users/:userId/rank', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params

    const rankQuery = `
      SELECT 
        COUNT(*) + 1 as rank
      FROM users
      WHERE skill_rating > (
        SELECT skill_rating FROM users WHERE id = ?
      )
      AND total_ranked_games > 0
    `

    const result = await query(rankQuery, [userId])
    const rank = result.rows[0].rank

    // Get total ranked players
    const totalQuery = `
      SELECT COUNT(*) as total
      FROM users
      WHERE total_ranked_games > 0
    `
    const totalResult = await query(totalQuery)
    const total = totalResult.rows[0].total

    res.json({
      rank,
      totalPlayers: total,
      percentile: (((total - rank + 1) / total) * 100).toFixed(1),
    })
  } catch (error) {
    logger.error('Error fetching user rank:', error)
    res.status(500).json({ error: 'Failed to fetch user rank' })
  }
})

/**
 * Refresh leaderboard cache (admin only)
 */
router.post('/leaderboards/refresh', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const userQuery = `SELECT is_admin FROM users WHERE id = ?`
    const userResult = await query(userQuery, [req.userId])

    if (!userResult.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    await eloService.updateLeaderboardCache()
    return res.json({ message: 'Leaderboard cache refreshed successfully' })
  } catch (error) {
    logger.error('Error refreshing leaderboard:', error)
    return res.status(500).json({ error: 'Failed to refresh leaderboard' })
  }
})

export default router
