"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const profileService_js_1 = require("../services/profileService.js");
const asyncHandler_js_1 = require("../utils/asyncHandler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
router.put('/', (0, asyncHandler_js_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const updates = req.body;
    const updatedProfile = await profileService_js_1.profileService.updateProfile(userId, updates);
    res.json(updatedProfile);
}));
router.get('/stats', (0, asyncHandler_js_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const stats = await profileService_js_1.profileService.getUserStats(userId);
    res.json(stats);
}));
router.get('/achievements', (0, asyncHandler_js_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const achievements = await profileService_js_1.profileService.getAchievements(userId);
    res.json(achievements);
}));
router.post('/achievements/:achievementId', adminAuth_js_1.requireAdmin, (0, asyncHandler_js_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const { achievementId } = req.params;
    const achievement = await profileService_js_1.profileService.unlockAchievement(userId, achievementId);
    res.status(201).json(achievement);
}));
router.get('/history', (0, asyncHandler_js_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const rawLimit = parseInt(req.query.limit, 10);
    const rawOffset = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const matches = await profileService_js_1.profileService.getGameHistory(userId, limit, offset);
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
router.put('/preferences', (0, asyncHandler_js_1.asyncHandler)(async (req, res) => {
    const userId = req.userId;
    const preferences = req.body;
    const updatedPreferences = await profileService_js_1.profileService.updatePreferences(userId, preferences);
    res.json(updatedPreferences);
}));
exports.default = router;
//# sourceMappingURL=profile.js.map