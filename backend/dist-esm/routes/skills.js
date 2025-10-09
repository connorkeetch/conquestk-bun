"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_js_1 = require("../config/database.js");
const auth_js_1 = require("../middleware/auth.js");
const eloService_js_1 = require("../services/eloService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
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
        const result = await (0, database_js_1.query)(userQuery, [userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = result.rows[0];
        const tier = eloService_js_1.eloService.getSkillTier(user.skill_rating || 800);
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
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch user rating', 500, {
            userId: req.params.userId,
        });
        return res.status(500).json({ error: 'Failed to fetch user rating' });
    }
});
router.get('/users/:userId/rating-history', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit, 10) || 30;
        const history = await eloService_js_1.eloService.getRatingHistory(userId, limit);
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
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch rating history', 500, {
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
        const leaderboard = await eloService_js_1.eloService.getLeaderboard(limit, offset);
        res.json({
            leaderboard: leaderboard.map((entry, _index) => ({
                rank: entry.rank_position,
                userId: entry.user_id,
                username: entry.username,
                skillRating: entry.skill_rating,
                tier: eloService_js_1.eloService.getSkillTier(entry.skill_rating).name,
            })),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch leaderboard', 500, {
            limit: req.query.limit,
            offset: req.query.offset,
        });
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});
router.get('/users/:userId/rank', auth_js_1.authenticateToken, async (req, res) => {
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
        const result = await (0, database_js_1.query)(rankQuery, [userId]);
        const rank = result.rows[0].rank;
        const totalQuery = `
      SELECT COUNT(*) as total
      FROM users
      WHERE total_ranked_games > 0
    `;
        const totalResult = await (0, database_js_1.query)(totalQuery);
        const total = totalResult.rows[0].total;
        res.json({
            rank,
            totalPlayers: total,
            percentile: (((total - rank + 1) / total) * 100).toFixed(1),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch user rank', 500, {
            userId: req.params.userId,
        });
        res.status(500).json({ error: 'Failed to fetch user rank' });
    }
});
router.post('/leaderboards/refresh', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userQuery = `SELECT is_admin FROM users WHERE id = $1`;
        const userResult = await (0, database_js_1.query)(userQuery, [req.userId]);
        if (!userResult.rows[0]?.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        await eloService_js_1.eloService.updateLeaderboardCache();
        return res.json({ message: 'Leaderboard cache refreshed successfully' });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to refresh leaderboard cache');
        return res.status(500).json({ error: 'Failed to refresh leaderboard' });
    }
});
exports.default = router;
//# sourceMappingURL=skills.js.map