"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const notificationService_js_1 = __importDefault(require("../services/notificationService.js"));
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
router.get('/vapid-public-key', (_req, res) => {
    res.json({
        publicKey: notificationService_js_1.default.getVapidPublicKey(),
        enabled: notificationService_js_1.default.isEnabled(),
    });
});
router.post('/subscribe', auth_js_1.authenticateToken, async (req, res) => {
    try {
        if (!notificationService_js_1.default.isEnabled()) {
            return res.status(503).json({
                error: 'Push notification service is not available',
                message: 'The notification service is currently disabled',
            });
        }
        const userId = req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'Invalid user identifier' });
        }
        const { subscription } = req.body;
        if (!subscription) {
            return res.status(400).json({ error: 'Subscription data is required' });
        }
        if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            return res.status(400).json({ error: 'Invalid subscription payload' });
        }
        await notificationService_js_1.default.saveSubscription(userId, subscription);
        return res.json({
            success: true,
            message: 'Successfully subscribed to push notifications',
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to subscribe to notifications');
        return res.status(500).json({ error: 'Failed to subscribe to notifications' });
    }
});
router.post('/unsubscribe', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'Invalid user identifier' });
        }
        const { endpoint, subscription } = req.body;
        const targetEndpoint = endpoint ?? subscription?.endpoint;
        const removed = await notificationService_js_1.default.removeSubscription(userId, targetEndpoint);
        return res.json({
            success: true,
            message: removed > 0
                ? 'Successfully unsubscribed from push notifications'
                : 'No push subscription found to remove',
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to unsubscribe from notifications');
        return res.status(500).json({ error: 'Failed to unsubscribe from notifications' });
    }
});
router.post('/test', auth_js_1.authenticateToken, async (req, res) => {
    try {
        if (!notificationService_js_1.default.isEnabled()) {
            return res.status(503).json({
                error: 'Push notification service is not available',
                message: 'The notification service is currently disabled',
            });
        }
        const userId = req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'Invalid user identifier' });
        }
        const success = await notificationService_js_1.default.sendTestNotification(userId);
        if (success) {
            return res.json({
                success: true,
                message: 'Test notification sent successfully',
            });
        }
        return res.status(404).json({
            error: 'No push subscription found. Please enable notifications first.',
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to send test notification');
        return res.status(500).json({ error: 'Failed to send test notification' });
    }
});
router.post('/admin/prune-subscriptions', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, (0, adminAuth_js_1.logAdminActivity)('notifications.prune_subscriptions'), async (req, res) => {
    try {
        const { failureThreshold, failureAgeDays, staleRegistrationDays } = req.body ?? {};
        const normalizeOptionalNumber = (value, field) => {
            if (value === undefined)
                return undefined;
            const parsed = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new Error(`${field} must be a positive number`);
            }
            return parsed;
        };
        const result = await notificationService_js_1.default.pruneStaleSubscriptions({
            failureThreshold: normalizeOptionalNumber(failureThreshold, 'failureThreshold'),
            failureAgeDays: normalizeOptionalNumber(failureAgeDays, 'failureAgeDays'),
            staleRegistrationDays: normalizeOptionalNumber(staleRegistrationDays, 'staleRegistrationDays'),
        });
        return res.json({
            success: true,
            result,
        });
    }
    catch (error) {
        if (error instanceof Error &&
            (error.message.includes('must be a positive number') ||
                error.message.includes('must be greater than zero'))) {
            return res.status(400).json({ error: error.message });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to prune notification subscriptions');
        return res.status(500).json({ error: 'Failed to prune notification subscriptions' });
    }
});
exports.default = router;
//# sourceMappingURL=notifications.js.map