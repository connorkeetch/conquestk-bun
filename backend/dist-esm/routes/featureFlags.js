import { Router } from 'express';
import { query } from '../config/database.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import { featureFlagService } from '../services/featureFlagService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
const router = Router();
router.get('/', async (req, res) => {
    try {
        const flags = await featureFlagService.evaluateForUser(req.user ? { ...req.user } : undefined);
        res.json({ flags });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch feature flags');
        res.status(500).json({ error: 'Failed to fetch feature flags' });
    }
});
router.get('/admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await query('SELECT * FROM feature_flags ORDER BY created_at DESC');
        res.json({ flags: result.rows });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch feature flags');
        res.status(500).json({ error: 'Failed to fetch feature flags' });
    }
});
router.put('/:flagName', authenticateToken, requireAdmin, async (req, res) => {
    const { flagName } = req.params;
    const { enabled, access_level, target_criteria, reason, } = req.body;
    const userId = req.user?.id || 'system';
    try {
        const updates = {};
        if (enabled !== undefined)
            updates.is_enabled = enabled;
        if (access_level !== undefined)
            updates.access_level = access_level;
        if (target_criteria !== undefined)
            updates.target_criteria = target_criteria;
        const flag = await featureFlagService.updateFlag(flagName, updates, userId, reason);
        if (!flag) {
            res.status(404).json({ error: 'Feature flag not found' });
            return;
        }
        res.json({ flag });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to update feature flag');
        res.status(500).json({ error: 'Failed to update feature flag' });
    }
});
router.get('/audit', authenticateToken, requireAdmin, async (req, res) => {
    const { flag_name, limit = 50 } = req.query;
    try {
        const auditLog = await featureFlagService.getAuditLog(flag_name, Number(limit));
        res.json({ audit: auditLog });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch audit log');
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});
router.post('/user-override', authenticateToken, requireAdmin, async (req, res) => {
    const { user_id, flag_name, enabled } = req.body;
    try {
        await featureFlagService.setUserOverride(user_id, flag_name, enabled);
        res.json({ success: true });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to set user override');
        res.status(500).json({ error: 'Failed to set user override' });
    }
});
export default router;
//# sourceMappingURL=featureFlags.js.map