import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import authenticateTokenFromCookie from '../middleware/authFromCookie.js';
import { authenticateToken } from '../middleware/auth.js';
import { queueService } from '../services/queueService.js';
export const createBullBoardRouter = () => {
    const router = Router();
    const serverAdapter = new ExpressAdapter();
    const basePath = '/api/admin/queues/ui';
    serverAdapter.setBasePath(basePath);
    const queues = [
        new BullMQAdapter(queueService.getGameActionQueue()),
        new BullMQAdapter(queueService.getCleanupQueue()),
        new BullMQAdapter(queueService.getAnalyticsQueue()),
        new BullMQAdapter(queueService.getMaintenanceQueue()),
        new BullMQAdapter(queueService.getMapAssetQueue()),
    ];
    createBullBoard({ queues: queues, serverAdapter });
    router.use(basePath, authenticateTokenFromCookie, requireAdmin, serverAdapter.getRouter());
    router.post('/api/admin/queues/ui/grant', authenticateToken, requireAdmin, (req, res) => {
        try {
            const authHeader = req.headers.authorization || '';
            const token = authHeader.startsWith('Bearer ')
                ? authHeader.slice('Bearer '.length)
                : undefined;
            if (!token) {
                res.status(401).json({ message: 'Access token required' });
                return;
            }
            const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
            res.cookie('auth_token', token, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'lax',
                path: basePath,
                maxAge: 15 * 60 * 1000,
            });
            res.json({ success: true });
        }
        catch (_e) {
            res.status(500).json({ success: false, message: 'Failed to grant UI access' });
        }
    });
    return router;
};
export default createBullBoardRouter;
//# sourceMappingURL=bullBoard.js.map