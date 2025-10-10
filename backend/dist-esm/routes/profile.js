import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import { profileService } from '../services/profileService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
const router = Router();
router.use(authenticateToken);
router.put('/', asyncHandler(async (req, res) => {
    const userId = req.userId;
    const updates = req.body;
    const updatedProfile = await profileService.updateProfile(userId, updates);
    res.json(updatedProfile);
}));
router.get('/stats', asyncHandler(async (req, res) => {
    const userId = req.userId;
    const stats = await profileService.getUserStats(userId);
    res.json(stats);
}));
router.get('/achievements', asyncHandler(async (req, res) => {
    const userId = req.userId;
    const achievements = await profileService.getAchievements(userId);
    res.json(achievements);
}));
router.post('/achievements/:achievementId', requireAdmin, asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { achievementId } = req.params;
    const achievement = await profileService.unlockAchievement(userId, achievementId);
    res.status(201).json(achievement);
}));
router.get('/history', asyncHandler(async (req, res) => {
    const userId = req.userId;
    const rawLimit = parseInt(req.query.limit, 10);
    const rawOffset = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const matches = await profileService.getGameHistory(userId, limit, offset);
    res.json({
        matches,
        pagination: {
            limit,
            offset,
            returned: matches.length,
            hasMore: matches.length === limit,
        },
    });
}));
router.put('/preferences', asyncHandler(async (req, res) => {
    const userId = req.userId;
    const preferences = req.body;
    const updatedPreferences = await profileService.updatePreferences(userId, preferences);
    res.json(updatedPreferences);
}));
export default router;
//# sourceMappingURL=profile.js.map