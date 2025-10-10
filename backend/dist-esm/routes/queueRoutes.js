import express from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import { queueService } from '../services/queueService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { getWorkerManagerInstance } from '../workers/workerManager.js';
const router = express.Router();
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const workerManager = getWorkerManagerInstance();
        if (!workerManager) {
            res.status(503).json({
                success: false,
                error: 'WorkerManager not initialized',
            });
            return;
        }
        const stats = await workerManager.getStats();
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to load queue stats');
        res.status(500).json({
            success: false,
            error: 'Failed to load queue statistics',
        });
    }
});
router.get('/health', authenticateToken, async (req, res) => {
    try {
        const workerManager = getWorkerManagerInstance();
        if (!workerManager) {
            res.status(503).json({
                success: false,
                status: 'not-initialized',
                details: {
                    workers: { initialized: false },
                    queues: {},
                },
                error: 'WorkerManager not initialized',
            });
            return;
        }
        const wmHealth = await workerManager.healthCheck();
        const qsHealth = await queueService.healthCheck();
        const statusCode = wmHealth.status === 'healthy' && qsHealth.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json({
            success: statusCode === 200,
            status: wmHealth.status === 'healthy' && qsHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
            details: {
                workers: wmHealth.details.workers ?? {
                    initialized: false,
                },
                queues: wmHealth.details.queues ?? {},
                redis: qsHealth.details.redis ?? 'UNKNOWN',
                queueServiceInitialized: qsHealth.details.initialized ?? false,
            },
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to evaluate queue health');
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: 'Failed to evaluate queue health',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const workerManager = getWorkerManagerInstance();
        if (!workerManager) {
            res.status(503).json({
                success: false,
                error: 'WorkerManager not initialized',
            });
            return;
        }
        const stats = await queueService.getQueueStats();
        const health = await workerManager.healthCheck();
        const queueList = Object.values(stats);
        const dashboard = {
            timestamp: new Date().toISOString(),
            status: health.status,
            queues: stats,
            summary: {
                totalWaiting: queueList.reduce((sum, queue) => sum + queue.waiting, 0),
                totalActive: queueList.reduce((sum, queue) => sum + queue.active, 0),
                totalCompleted: queueList.reduce((sum, queue) => sum + queue.completed, 0),
                totalFailed: queueList.reduce((sum, queue) => sum + queue.failed, 0),
                totalDeadLetter: queueList.reduce((sum, queue) => sum + queue.deadLetter, 0),
                queuesWithWarnings: queueList.filter((queue) => queue.warnings.length > 0).length,
            },
        };
        res.json({
            success: true,
            data: dashboard,
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to load queue dashboard');
        res.status(500).json({
            success: false,
            error: 'Failed to load queue dashboard',
        });
    }
});
router.get('/dlq/:queueName', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { queueName } = req.params;
        const offset = Number.parseInt(String(req.query.offset ?? '0'), 10) || 0;
        const limit = Number.parseInt(String(req.query.limit ?? '50'), 10) || 50;
        const key = (queueName || '').toLowerCase();
        const keyToQueueKey = (name) => {
            if (name === 'game-actions' || name === 'gameactions' || name === 'game')
                return 'gameActions';
            if (name === 'game-cleanup' || name === 'gamecleanup' || name === 'cleanup')
                return 'gameCleanup';
            if (name === 'analytics-events' || name === 'analyticsevents' || name === 'analytics')
                return 'analyticsEvents';
            if (name === 'maintenance' || name === 'maint')
                return 'maintenance';
            if (name === 'map-assets' || name === 'mapassets' || name === 'assets')
                return 'mapAssets';
            return 'gameActions';
        };
        const queueKey = keyToQueueKey(key);
        const items = await queueService.listDeadLetters(queueKey, { offset, limit });
        res.json({ success: true, data: items, pagination: { offset, limit } });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to list DLQ');
        res.status(500).json({ success: false, error: 'Failed to list DLQ' });
    }
});
router.post('/dlq/:queueName/requeue/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { queueName, id } = req.params;
        const key = (queueName || '').toLowerCase();
        const keyToQueueKey = (name) => {
            if (name === 'game-actions' || name === 'gameactions' || name === 'game')
                return 'gameActions';
            if (name === 'game-cleanup' || name === 'gamecleanup' || name === 'cleanup')
                return 'gameCleanup';
            if (name === 'analytics-events' || name === 'analyticsevents' || name === 'analytics')
                return 'analyticsEvents';
            if (name === 'maintenance' || name === 'maint')
                return 'maintenance';
            if (name === 'map-assets' || name === 'mapassets' || name === 'assets')
                return 'mapAssets';
            return 'gameActions';
        };
        const queueKey = keyToQueueKey(key);
        const result = await queueService.requeueDeadLetter(queueKey, id);
        res.json({ success: result.requeued, newJobId: result.newJobId ?? null });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to requeue DLQ job');
        res.status(500).json({ success: false, error: 'Failed to requeue DLQ job' });
    }
});
router.post('/dlq/:queueName/requeue-transient', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { queueName } = req.params;
        const limit = Number.parseInt(String(req.query.limit ?? '50'), 10) || 50;
        const key = (queueName || '').toLowerCase();
        const keyToQueueKey = (name) => {
            if (name === 'game-actions' || name === 'gameactions' || name === 'game')
                return 'gameActions';
            if (name === 'game-cleanup' || name === 'gamecleanup' || name === 'cleanup')
                return 'gameCleanup';
            if (name === 'analytics-events' || name === 'analyticsevents' || name === 'analytics')
                return 'analyticsEvents';
            if (name === 'maintenance' || name === 'maint')
                return 'maintenance';
            if (name === 'map-assets' || name === 'mapassets' || name === 'assets')
                return 'mapAssets';
            return 'gameActions';
        };
        const queueKey = keyToQueueKey(key);
        const items = await queueService.listDeadLetters(queueKey, { offset: 0, limit });
        const pattern = /ECONNRESET|ETIMEDOUT|timeout|Network|EAI_AGAIN/i;
        let requeued = 0;
        for (const it of items) {
            if (pattern.test(it.failedReason)) {
                const r = await queueService.requeueDeadLetter(queueKey, it.id);
                if (r.requeued)
                    requeued += 1;
            }
        }
        res.json({ success: true, requeued, scanned: items.length });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to requeue transient DLQ jobs');
        res.status(500).json({ success: false, error: 'Failed to requeue transient DLQ jobs' });
    }
});
const resolveQueueByParam = (name) => {
    const key = name.toLowerCase();
    if (key === 'game-actions' || key === 'gameactions' || key === 'game') {
        return queueService.getGameActionQueue();
    }
    if (key === 'game-cleanup' || key === 'gamecleanup' || key === 'cleanup') {
        return queueService.getCleanupQueue();
    }
    if (key === 'analytics-events' || key === 'analyticsevents' || key === 'analytics') {
        return queueService.getAnalyticsQueue();
    }
    if (key === 'maintenance' || key === 'maint') {
        return queueService.getMaintenanceQueue();
    }
    if (key === 'map-assets' || key === 'mapassets' || key === 'assets') {
        return queueService.getMapAssetQueue();
    }
    return null;
};
router.post('/pause/:queueName', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { queueName } = req.params;
        const queue = resolveQueueByParam(queueName);
        if (!queue) {
            res.status(404).json({ success: false, error: 'Queue not found' });
            return;
        }
        await queue.pause();
        res.json({
            success: true,
            message: `Queue ${queue.name} paused`,
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to pause queue', 500, {
            queueName: req.params.queueName,
        });
        res.status(500).json({
            success: false,
            error: 'Failed to pause queue',
        });
    }
});
router.post('/resume/:queueName', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { queueName } = req.params;
        const queue = resolveQueueByParam(queueName);
        if (!queue) {
            res.status(404).json({ success: false, error: 'Queue not found' });
            return;
        }
        await queue.resume();
        res.json({
            success: true,
            message: `Queue ${queue.name} resumed`,
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to resume queue', 500, {
            queueName: req.params.queueName,
        });
        res.status(500).json({
            success: false,
            error: 'Failed to resume queue',
        });
    }
});
router.delete('/clear/:queueName', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { queueName } = req.params;
        const type = String(req.query.type || 'all').toLowerCase();
        const queue = resolveQueueByParam(queueName);
        if (!queue) {
            res.status(404).json({ success: false, error: 'Queue not found' });
            return;
        }
        const doClean = async (state) => queue.clean(0, 1000, state);
        if (type === 'all') {
            await Promise.all([
                doClean('wait'),
                doClean('completed'),
                doClean('failed'),
                doClean('delayed'),
            ]);
        }
        else if (['wait', 'completed', 'failed', 'delayed'].includes(type)) {
            await doClean(type);
        }
        else {
            res.status(400).json({ success: false, error: 'Invalid type' });
            return;
        }
        res.json({
            success: true,
            message: `Cleared ${type} jobs from queue ${queue.name}`,
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to clear queue', 500, {
            queueName: req.params.queueName,
            type: req.query.type,
        });
        res.status(500).json({
            success: false,
            error: 'Failed to clear queue',
        });
    }
});
router.get('/ping', async (req, res) => {
    try {
        const workerManager = getWorkerManagerInstance();
        if (!workerManager) {
            res.json({
                status: 'not-initialized',
                timestamp: new Date().toISOString(),
            });
            return;
        }
        const health = await workerManager.healthCheck();
        res.json({
            status: health.status,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        handleRouteError(error, req, 'Queue ping failed', 503);
        res.status(503).json({
            status: 'unhealthy',
            error: 'Queue service unavailable',
        });
    }
});
export default router;
//# sourceMappingURL=queueRoutes.js.map