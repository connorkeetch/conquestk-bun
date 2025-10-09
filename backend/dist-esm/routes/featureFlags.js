"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_js_1 = require("../config/database.js");
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const featureFlagService_js_1 = require("../services/featureFlagService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const flags = await featureFlagService_js_1.featureFlagService.evaluateForUser(req.user ? { ...req.user } : undefined);
        res.json({ flags });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch feature flags');
        res.status(500).json({ error: 'Failed to fetch feature flags' });
    }
});
router.get('/admin', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
    try {
        const result = await (0, database_js_1.query)('SELECT * FROM feature_flags ORDER BY created_at DESC');
        res.json({ flags: result.rows });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch feature flags');
        res.status(500).json({ error: 'Failed to fetch feature flags' });
    }
});
router.put('/:flagName', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
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
        const flag = await featureFlagService_js_1.featureFlagService.updateFlag(flagName, updates, userId, reason);
        if (!flag) {
            res.status(404).json({ error: 'Feature flag not found' });
            return;
        }
        res.json({ flag });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update feature flag');
        res.status(500).json({ error: 'Failed to update feature flag' });
    }
});
router.get('/audit', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
    const { flag_name, limit = 50 } = req.query;
    try {
        const auditLog = await featureFlagService_js_1.featureFlagService.getAuditLog(flag_name, Number(limit));
        res.json({ audit: auditLog });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch audit log');
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});
router.post('/user-override', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
    const { user_id, flag_name, enabled } = req.body;
    try {
        await featureFlagService_js_1.featureFlagService.setUserOverride(user_id, flag_name, enabled);
        res.json({ success: true });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to set user override');
        res.status(500).json({ error: 'Failed to set user override' });
    }
});
exports.default = router;
//# sourceMappingURL=featureFlags.js.map