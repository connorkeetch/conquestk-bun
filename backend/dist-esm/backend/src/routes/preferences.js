import { normalizeThemeId } from '@risk-game/shared/types/themes';
import { Router } from 'express';
import { isPremiumColorChoice, isPremiumThemeId, normalizePremiumAwareColor, PREMIUM_COLOR_MESSAGE, PREMIUM_THEME_MESSAGE, PREMIUM_UPSELL_ERROR_CODE, } from '../constants/premium.js';
import { authenticateToken } from '../middleware/auth.js';
import { UserPreferencesService } from '../services/UserPreferencesService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
export function createPreferencesRouter(pool) {
    const router = Router();
    const preferencesService = new UserPreferencesService(pool);
    router.get('/', authenticateToken, async (req, res) => {
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
            handleRouteError(error, req, 'Failed to fetch preferences');
            return res.status(500).json({ error: 'Failed to fetch preferences' });
        }
    });
    router.put('/', authenticateToken, async (req, res) => {
        try {
            const userId = (req.user?.id || req.userId);
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const hasPremium = req.user?.hasPremium === true ||
                (typeof req.user?.premiumTier === 'string' && req.user?.premiumTier !== 'free');
            if (typeof req.body?.theme === 'string') {
                const normalizedTheme = normalizeThemeId(req.body.theme);
                if (!hasPremium && isPremiumThemeId(normalizedTheme)) {
                    return res.status(403).json({
                        error: PREMIUM_UPSELL_ERROR_CODE,
                        message: PREMIUM_THEME_MESSAGE,
                    });
                }
                req.body.theme = normalizedTheme;
            }
            if (typeof req.body?.preferredColor === 'string') {
                const normalizedPreferredColor = normalizePremiumAwareColor(req.body.preferredColor);
                if (normalizedPreferredColor &&
                    !hasPremium &&
                    isPremiumColorChoice(normalizedPreferredColor)) {
                    return res.status(403).json({
                        error: PREMIUM_UPSELL_ERROR_CODE,
                        message: PREMIUM_COLOR_MESSAGE,
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
            handleRouteError(error, req, 'Failed to update preferences');
            return res.status(500).json({ error: 'Failed to update preferences' });
        }
    });
    router.put('/theme', authenticateToken, async (req, res) => {
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
            const normalizedTheme = normalizeThemeId(theme);
            if (!hasPremium && isPremiumThemeId(normalizedTheme)) {
                return res.status(403).json({
                    error: PREMIUM_UPSELL_ERROR_CODE,
                    message: PREMIUM_THEME_MESSAGE,
                });
            }
            const updatedTheme = await preferencesService.updateTheme(userId, normalizedTheme);
            if (!updatedTheme) {
                return res.status(500).json({ error: 'Failed to update theme' });
            }
            return res.json({ success: true, theme: updatedTheme });
        }
        catch (error) {
            handleRouteError(error, req, 'Failed to update theme');
            return res.status(500).json({ error: 'Failed to update theme' });
        }
    });
    return router;
}
//# sourceMappingURL=preferences.js.map