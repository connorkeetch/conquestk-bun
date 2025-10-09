"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const profileService_js_1 = require("../services/profileService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
router.get(['/', '/global'], async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 100;
        const data = await profileService_js_1.profileService.getLeaderboard(limit);
        const leaderboard = data.map((entry) => ({
            id: entry.userId,
            username: entry.username,
            elo: Math.round(entry.rating),
            wins: entry.gamesWon,
            losses: typeof entry.gamesPlayed === 'number' ? Math.max(0, entry.gamesPlayed - entry.gamesWon) : 0,
            winRate: entry.winRate,
            rank: entry.rank,
            gamesPlayed: entry.gamesPlayed,
        }));
        return res.json({ leaderboard });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch global leaderboard', 500, {
            limit: req.query.limit,
        });
        return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});
router.get('/monthly', async (_req, res) => {
    return res.json({ leaderboard: [] });
});
router.get('/friends', async (_req, res) => {
    return res.json({ leaderboard: [] });
});
exports.default = router;
//# sourceMappingURL=leaderboard.js.map