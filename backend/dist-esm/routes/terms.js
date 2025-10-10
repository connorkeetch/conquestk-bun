import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { termsService } from '../services/termsService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
const router = Router();
const authenticateRequest = async (req, res, next) => {
    try {
        await authenticateToken(req, res, next);
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
        const hasAccepted = await termsService.hasAcceptedTerms(userId, featureType);
        const termsContent = termsService.getTermsContent(featureType);
        res.json({
            hasAccepted,
            currentVersion: termsService.getCurrentVersion(featureType),
            termsContent: !hasAccepted ? termsContent : undefined,
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to check terms acceptance', 500, {
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
        const acceptance = await termsService.acceptTerms(userId, featureType, ipAddress, userAgent);
        res.json({
            success: true,
            acceptance,
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to accept terms', 500, {
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
        const history = await termsService.getUserTermsHistory(userId);
        res.json(history);
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch terms history');
        res.status(500).json({ error: 'Failed to fetch terms history' });
    }
});
router.get('/content/:featureType', (req, res) => {
    try {
        const { featureType } = req.params;
        const content = termsService.getTermsContent(featureType);
        res.json({
            ...content,
            currentVersion: termsService.getCurrentVersion(featureType),
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch terms content', 500, {
            featureType: req.params.featureType,
        });
        res.status(500).json({ error: 'Failed to fetch terms content' });
    }
});
export default router;
//# sourceMappingURL=terms.js.map