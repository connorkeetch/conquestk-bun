import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { eloService } from '../services/eloService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
const router = Router();
router.get('/users/:userId/rating', async (req, res) => {
    try {
        const { userId } = req.params;
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
    `;
        const result = await query(userQuery, [userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = result.rows[0];
        const tier = eloService.getSkillTier(user.skill_rating || 800);
        const winRate = user.total_ranked_games > 0
            ? ((user.ranked_wins / user.total_ranked_games) * 100).toFixed(1)
            : 0;
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
                winRate: parseFloat(winRate),
                highestRating: user.highest_skill_rating || 800,
            },
            lastRankedGame: user.last_ranked_game_at,
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch user rating', 500, {
            userId: req.params.userId,
        });
        return res.status(500).json({ error: 'Failed to fetch user rating' });
    }
});
router.get('/users/:userId/rating-history', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit, 10) || 30;
        const history = await eloService.getRatingHistory(userId, limit);
        res.json({
            history: history.map((entry) => ({
                gameId: entry.game_room_id,
                recordedAt: entry.created_at,
                ratingBefore: entry.old_rating,
                ratingAfter: entry.new_rating,
                change: entry.rating_change,
                reason: entry.reason,
            })),
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch rating history', 500, {
            userId: req.params.userId,
            limit: req.query.limit,
        });
        res.status(500).json({ error: 'Failed to fetch rating history' });
    }
});
router.get('/leaderboards/skill', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 100;
        const offset = parseInt(req.query.offset, 10) || 0;
        const leaderboard = await eloService.getLeaderboard(limit, offset);
        res.json({
            leaderboard: leaderboard.map((entry) => {
                const wins = typeof entry.ranked_wins === 'number' ? entry.ranked_wins : 0;
                const losses = typeof entry.ranked_losses === 'number' ? entry.ranked_losses : 0;
                const gamesPlayed = wins + losses;
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
                };
            }),
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch leaderboard', 500, {
            limit: req.query.limit,
            offset: req.query.offset,
        });
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});
router.get('/users/:userId/rank', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const rankQuery = `
      SELECT 
        COUNT(*) + 1 as rank
      FROM users
      WHERE skill_rating > (
        SELECT skill_rating FROM users WHERE id = $1
      )
      AND total_ranked_games > 0
    `;
        const result = await query(rankQuery, [userId]);
        const rank = result.rows[0].rank;
        const totalQuery = `
      SELECT COUNT(*) as total
      FROM users
      WHERE total_ranked_games > 0
    `;
        const totalResult = await query(totalQuery);
        const total = totalResult.rows[0].total;
        res.json({
            rank,
            totalPlayers: total,
            percentile: (((total - rank + 1) / total) * 100).toFixed(1),
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch user rank', 500, {
            userId: req.params.userId,
        });
        res.status(500).json({ error: 'Failed to fetch user rank' });
    }
});
router.post('/leaderboards/refresh', authenticateToken, async (req, res) => {
    try {
        const userQuery = `SELECT is_admin FROM users WHERE id = $1`;
        const userResult = await query(userQuery, [req.userId]);
        if (!userResult.rows[0]?.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        await eloService.updateLeaderboardCache();
        return res.json({ message: 'Leaderboard cache refreshed successfully' });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to refresh leaderboard cache');
        return res.status(500).json({ error: 'Failed to refresh leaderboard' });
    }
});
export default router;
//# sourceMappingURL=skills.js.map