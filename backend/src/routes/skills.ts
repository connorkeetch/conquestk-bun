/**
 * @fileoverview This file defines the Express routes for handling player skill ratings and leaderboards.
 * It includes endpoints for fetching user skill ratings, rating history, global and friends leaderboards,
 * and a user's rank. It also provides an admin endpoint for refreshing the leaderboard cache.
 * @module routes/skills
 */
import { Router } from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'
import { eloService } from '../services/eloService.js'
import { listFriends } from '../services/friendService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

const router = Router()

/**
 * Route to get a user's skill rating information.
 * @name GET /skills/users/:userId/rating
 * @function
 * @memberof module:routes/skills
 * @param {import('express').Request} req - The Express request object, with `userId` as a URL parameter.
 * @param {import('express').Response} res - The Express response object, returning the user's skill rating details.
 * @returns {Promise<import('express').Response>}
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
      WHERE id = $1
    `

    const result = await query(userQuery, [userId])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]
    const tier = eloService.getSkillTier(user.skill_rating || 800)

    // Calculate win rate
    const winRate =
      user.total_ranked_games > 0
        ? ((user.ranked_wins / user.total_ranked_games) * 100).toFixed(1)
        : 0

    return res.json({
      userId: user.id,
      username: user.username,
      skillRating: user.skill_rating || 800,
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
        highestRating: user.highest_skill_rating || 800,
      },
      lastRankedGame: user.last_ranked_game_at,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch user rating', 500, {
      userId: req.params.userId,
    })
    return res.status(500).json({ error: 'Failed to fetch user rating' })
  }
})

/**
 * Route to get a user's skill rating history.
 * @name GET /skills/users/:userId/rating-history
 * @function
 * @memberof module:routes/skills
 * @param {import('express').Request} req - The Express request object, with `userId` as a URL parameter and an optional `limit` query parameter.
 * @param {import('express').Response} res - The Express response object, returning the user's rating history.
 * @returns {Promise<void>}
 */
router.get('/users/:userId/rating-history', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const limit = parseInt(req.query.limit as string, 10) || 30

    const history = await eloService.getRatingHistory(userId, limit)

    res.json({
      history: history.map((entry) => ({
        gameId: entry.game_room_id,
        recordedAt: entry.created_at,
        ratingBefore: entry.old_rating,
        ratingAfter: entry.new_rating,
        change: entry.rating_change,
        reason: entry.reason,
      })),
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch rating history', 500, {
      userId: req.params.userId,
      limit: req.query.limit,
    })
    res.status(500).json({ error: 'Failed to fetch rating history' })
  }
})

/**
 * Route to get the global skill leaderboard.
 * It supports pagination and can be filtered by period (monthly or all-time).
 * @name GET /skills/leaderboards/skill
 * @function
 * @memberof module:routes/skills
 * @param {import('express').Request} req - The Express request object, with optional query parameters for `limit`, `offset`, `period`, and `month`.
 * @param {import('express').Response} res - The Express response object, returning the leaderboard data.
 * @returns {Promise<import('express').Response>}
 */
router.get('/leaderboards/skill', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100
    const offset = parseInt(req.query.offset as string, 10) || 0
    const rawPeriod = typeof req.query.period === 'string' ? req.query.period.toLowerCase() : ''
    const period = rawPeriod === 'monthly' ? 'monthly' : 'all_time'
    const month = typeof req.query.month === 'string' ? req.query.month : undefined

    if (period === 'monthly') {
      const { rows, periodStart, periodEnd } = await eloService.getMonthlyLeaderboard({
        limit,
        offset,
        month,
      })

      const leaderboard = rows.map((entry, index) => {
        const wins = typeof entry.wins === 'number' ? entry.wins : 0
        const losses = typeof entry.losses === 'number' ? entry.losses : 0
        const gamesPlayed =
          typeof entry.games_played === 'number' ? entry.games_played : wins + losses
        const ratingGain = typeof entry.rating_gain === 'number' ? entry.rating_gain : 0
        return {
          rank: entry.rank_position ?? index + 1,
          userId: entry.user_id,
          username: entry.username,
          skillRating: entry.current_rating,
          ratingGain,
          wins,
          losses,
          gamesPlayed,
          winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
          tier: eloService.getSkillTier(entry.current_rating).name,
        }
      })

      return res.json({
        leaderboard,
        meta: {
          period,
          scope: 'global',
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      })
    }

    const leaderboard = await eloService.getLeaderboard(limit, offset)

    return res.json({
      leaderboard: leaderboard.map((entry) => {
        const wins = typeof entry.ranked_wins === 'number' ? entry.ranked_wins : 0
        const losses = typeof entry.ranked_losses === 'number' ? entry.ranked_losses : 0
        const gamesPlayed = wins + losses
        return {
          rank: entry.rank_position,
          userId: entry.user_id,
          username: entry.username,
          skillRating: entry.skill_rating,
          wins,
          losses,
          gamesPlayed,
          winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
          tier: eloService.getSkillTier(entry.skill_rating).name,
        }
      }),
      meta: { period: 'all_time', scope: 'global' },
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch leaderboard', 500, {
      limit: req.query.limit,
      offset: req.query.offset,
      period: req.query.period,
      month: req.query.month,
    })
    return res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

/**
 * Route to get the skill leaderboard scoped to the authenticated user's friends.
 * It supports pagination and can be filtered by period (monthly or all-time).
 * @name GET /skills/leaderboards/skill/friends
 * @function
 * @memberof module:routes/skills
 * @param {import('express').Request} req - The Express request object, with optional query parameters for `limit`, `offset`, `period`, and `month`.
 * @param {import('express').Response} res - The Express response object, returning the friends leaderboard data.
 * @returns {Promise<import('express').Response>}
 */
router.get('/leaderboards/skill/friends', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100
    const offset = parseInt(req.query.offset as string, 10) || 0
    const rawPeriod = typeof req.query.period === 'string' ? req.query.period.toLowerCase() : ''
    const period = rawPeriod === 'monthly' ? 'monthly' : 'all_time'
    const month = typeof req.query.month === 'string' ? req.query.month : undefined

    const friendSummaries = await listFriends(req.userId)
    const friendIds = friendSummaries.map((friend) => friend.userId)
    const userIds = Array.from(new Set([req.userId, ...friendIds]))

    if (userIds.length === 0) {
      return res.json({ leaderboard: [], meta: { period, scope: 'friends' } })
    }

    if (period === 'monthly') {
      const { rows, periodStart, periodEnd } = await eloService.getMonthlyLeaderboard({
        limit,
        offset,
        month,
        userIds,
      })

      const leaderboard = rows.map((entry, index) => {
        const wins = typeof entry.wins === 'number' ? entry.wins : 0
        const losses = typeof entry.losses === 'number' ? entry.losses : 0
        const gamesPlayed =
          typeof entry.games_played === 'number' ? entry.games_played : wins + losses
        const ratingGain = typeof entry.rating_gain === 'number' ? entry.rating_gain : 0
        return {
          rank: entry.rank_position ?? index + 1,
          userId: entry.user_id,
          username: entry.username,
          skillRating: entry.current_rating,
          ratingGain,
          wins,
          losses,
          gamesPlayed,
          winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
          tier: eloService.getSkillTier(entry.current_rating).name,
        }
      })

      return res.json({
        leaderboard,
        meta: {
          period,
          scope: 'friends',
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      })
    }

    const leaderboard = await eloService.getLeaderboardForUsers(userIds, { limit, offset })

    return res.json({
      leaderboard: leaderboard.map((entry, index) => {
        const wins = typeof entry.ranked_wins === 'number' ? entry.ranked_wins : 0
        const losses = typeof entry.ranked_losses === 'number' ? entry.ranked_losses : 0
        const gamesPlayed = wins + losses
        return {
          rank: entry.rank_position ?? index + 1,
          userId: entry.user_id,
          username: entry.username,
          skillRating: entry.skill_rating,
          wins,
          losses,
          gamesPlayed,
          winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
          tier: eloService.getSkillTier(entry.skill_rating).name,
        }
      }),
      meta: { period: 'all_time', scope: 'friends' },
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch friends leaderboard', 500, {
      userId: req.userId,
      limit: req.query.limit,
      offset: req.query.offset,
      period: req.query.period,
      month: req.query.month,
    })
    return res.status(500).json({ error: 'Failed to fetch friends leaderboard' })
  }
})

/**
 * Route to get a user's current rank position.
 * @name GET /skills/users/:userId/rank
 * @function
 * @memberof module:routes/skills
 * @param {import('express').Request} req - The Express request object, with `userId` as a URL parameter.
 * @param {import('express').Response} res - The Express response object, returning the user's rank, total ranked players, and percentile.
 * @returns {Promise<void>}
 */
router.get('/users/:userId/rank', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params

    const rankQuery = `
      SELECT 
        COUNT(*) + 1 as rank
      FROM users
      WHERE skill_rating > (
        SELECT skill_rating FROM users WHERE id = $1
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
    handleRouteError(error, req, 'Failed to fetch user rank', 500, {
      userId: req.params.userId,
    })
    res.status(500).json({ error: 'Failed to fetch user rank' })
  }
})

/**
 * Route for admins to refresh the leaderboard cache.
 * @name POST /skills/leaderboards/refresh
 * @function
 * @memberof module:routes/skills
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object, confirming the cache refresh.
 * @returns {Promise<import('express').Response>}
 */
router.post('/leaderboards/refresh', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const userQuery = `SELECT is_admin FROM users WHERE id = $1`
    const userResult = await query(userQuery, [req.userId])

    if (!userResult.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    await eloService.updateLeaderboardCache()
    return res.json({ message: 'Leaderboard cache refreshed successfully' })
  } catch (error) {
    handleRouteError(error, req, 'Failed to refresh leaderboard cache')
    return res.status(500).json({ error: 'Failed to refresh leaderboard' })
  }
})

export default router
