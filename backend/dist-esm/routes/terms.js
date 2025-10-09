"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const termsService_js_1 = require("../services/termsService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
const authenticateRequest = async (req, res, next) => {
    try {
        await (0, auth_js_1.authenticateToken)(req, res, next);
    }
    catch (error) {
        next(error instanceof Error ? error : new Error(String(error)));
    }
};
router.get('/check/:featureType', authenticateRequest, async (req, res) => {
    try {
        const { featureType } = req.params;
        const userId = req.userId || req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const hasAccepted = await termsService_js_1.termsService.hasAcceptedTerms(userId, featureType);
        const termsContent = termsService_js_1.termsService.getTermsContent(featureType);
        res.json({
            hasAccepted,
            currentVersion: termsService_js_1.termsService.getCurrentVersion(featureType),
            termsContent: !hasAccepted ? termsContent : undefined,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to check terms acceptance', 500, {
            featureType: req.params.featureType,
        });
        res.status(500).json({ error: 'Failed to check terms acceptance' });
    }
});
router.post('/accept/:featureType', authenticateRequest, async (req, res) => {
    try {
        const { featureType } = req.params;
        const userId = req.userId || req.user?.id;
        const ipAddress = req.ip;
        const userAgent = req.get('user-agent');
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const acceptance = await termsService_js_1.termsService.acceptTerms(userId, featureType, ipAddress, userAgent);
        res.json({
            success: true,
            acceptance,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to accept terms', 500, {
            featureType: req.params.featureType,
        });
        res.status(500).json({ error: 'Failed to accept terms' });
    }
});
router.get('/history', authenticateRequest, async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const history = await termsService_js_1.termsService.getUserTermsHistory(userId);
        res.json(history);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch terms history');
        res.status(500).json({ error: 'Failed to fetch terms history' });
    }
});
router.get('/content/:featureType', (req, res) => {
    try {
        const { featureType } = req.params;
        const content = termsService_js_1.termsService.getTermsContent(featureType);
        res.json({
            ...content,
            currentVersion: termsService_js_1.termsService.getCurrentVersion(featureType),
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch terms content', 500, {
            featureType: req.params.featureType,
        });
        res.status(500).json({ error: 'Failed to fetch terms content' });
    }
});
exports.default = router;
//# sourceMappingURL=terms.js.map