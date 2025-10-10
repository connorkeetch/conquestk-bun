"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPreferencesRouter = createPreferencesRouter;
const themes_1 = require("../shared/types/themes");
const express_1 = require("express");
const premium_js_1 = require("../constants/premium.js");
const auth_js_1 = require("../middleware/auth.js");
const UserPreferencesService_js_1 = require("../services/UserPreferencesService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
function createPreferencesRouter(pool) {
    const router = (0, express_1.Router)();
    const preferencesService = new UserPreferencesService_js_1.UserPreferencesService(pool);
    router.get('/', auth_js_1.authenticateToken, async (req, res) => {
        try {
            const userId = (req.user?.id || req.userId);
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const preferences = await preferencesService.getPreferences(userId);
            if (!preferences) {
                return res.status(404).json({ error: 'Preferences not found' });
            }
            return res.json(preferences);
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch preferences');
            return res.status(500).json({ error: 'Failed to fetch preferences' });
        }
    });
    router.put('/', auth_js_1.authenticateToken, async (req, res) => {
        try {
            const userId = (req.user?.id || req.userId);
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const hasPremium = req.user?.hasPremium === true ||
                (typeof req.user?.premiumTier === 'string' && req.user?.premiumTier !== 'free');
            if (typeof req.body?.theme === 'string') {
                const normalizedTheme = (0, themes_1.normalizeThemeId)(req.body.theme);
                if (!hasPremium && (0, premium_js_1.isPremiumThemeId)(normalizedTheme)) {
                    return res.status(403).json({
                        error: premium_js_1.PREMIUM_UPSELL_ERROR_CODE,
                        message: premium_js_1.PREMIUM_THEME_MESSAGE,
                    });
                }
                req.body.theme = normalizedTheme;
            }
            if (typeof req.body?.preferredColor === 'string') {
                const normalizedPreferredColor = (0, premium_js_1.normalizePremiumAwareColor)(req.body.preferredColor);
                if (normalizedPreferredColor &&
                    !hasPremium &&
                    (0, premium_js_1.isPremiumColorChoice)(normalizedPreferredColor)) {
                    return res.status(403).json({
                        error: premium_js_1.PREMIUM_UPSELL_ERROR_CODE,
                        message: premium_js_1.PREMIUM_COLOR_MESSAGE,
                    });
                }
                req.body.preferredColor = normalizedPreferredColor ?? req.body.preferredColor;
            }
            const preferences = await preferencesService.updatePreferences(userId, req.body);
            if (!preferences) {
                return res.status(500).json({ error: 'Failed to update preferences' });
            }
            return res.json(preferences);
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update preferences');
            return res.status(500).json({ error: 'Failed to update preferences' });
        }
    });
    router.put('/theme', auth_js_1.authenticateToken, async (req, res) => {
        try {
            const userId = (req.user?.id || req.userId);
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const { theme } = req.body;
            if (!theme) {
                return res.status(400).json({ error: 'Theme is required' });
            }
            const hasPremium = req.user?.hasPremium === true ||
                (typeof req.user?.premiumTier === 'string' && req.user?.premiumTier !== 'free');
            const normalizedTheme = (0, themes_1.normalizeThemeId)(theme);
            if (!hasPremium && (0, premium_js_1.isPremiumThemeId)(normalizedTheme)) {
                return res.status(403).json({
                    error: premium_js_1.PREMIUM_UPSELL_ERROR_CODE,
                    message: premium_js_1.PREMIUM_THEME_MESSAGE,
                });
            }
            const updatedTheme = await preferencesService.updateTheme(userId, normalizedTheme);
            if (!updatedTheme) {
                return res.status(500).json({ error: 'Failed to update theme' });
            }
            return res.json({ success: true, theme: updatedTheme });
        }
        catch (error) {
            (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update theme');
            return res.status(500).json({ error: 'Failed to update theme' });
        }
    });
    return router;
}
//# sourceMappingURL=preferences.js.map