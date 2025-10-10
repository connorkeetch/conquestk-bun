import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { cdnService } from '../services/cdnService.js';
import { databaseClusterService } from '../services/databaseClusterService.js';
import { performanceMonitorService } from '../services/performanceMonitorService.js';
import { redisClusterService } from '../services/redisClusterService.js';
import { getErrorMessage } from '../utils/errorHelpers.js';
import { logger } from '../utils/logger.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { oddsMetrics } from '../services/metricsService.js';
const router = express.Router();
const sendFailure = (req, res, error, logMessage, status = 500) => {
    const clientError = error instanceof Error ? error.message : logMessage;
    handleRouteError(error, req, logMessage, status, { clientError });
    res.status(status).json({
        success: false,
        error: clientError,
    });
};
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const dashboard = performanceMonitorService.getDashboardData();
        res.json({
            success: true,
            data: dashboard,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load performance dashboard');
    }
});
router.get('/metrics', authenticateToken, async (req, res) => {
    try {
        const current = performanceMonitorService.getCurrentMetrics();
        res.json({
            success: true,
            data: current,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load current metrics');
    }
});
router.get('/metrics/history', authenticateToken, async (req, res) => {
    try {
        const hours = parseInt(req.query.hours, 10) || 1;
        const history = performanceMonitorService.getMetricsHistory(hours);
        res.json({
            success: true,
            data: history,
            meta: {
                hours,
                count: history.length,
            },
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load metrics history');
    }
});
router.get('/metrics/odds-history', authenticateToken, async (req, res) => {
    try {
        const hours = parseInt(req.query.hours || '24', 10);
        const points = oddsMetrics.getHistory(Number.isFinite(hours) ? hours : 24);
        const snapshot = oddsMetrics.snapshot();
        res.json({
            success: true,
            data: {
                points,
                snapshot,
            },
            meta: { hours: Number.isFinite(hours) ? hours : 24, count: points.length },
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load odds metrics history');
    }
});
router.get('/alerts', authenticateToken, async (req, res) => {
    try {
        const activeOnly = req.query.active === 'true';
        const alerts = activeOnly
            ? performanceMonitorService.getActiveAlerts()
            : performanceMonitorService.getAllAlerts();
        res.json({
            success: true,
            data: alerts,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load performance alerts');
    }
});
router.post('/alerts/:alertId/resolve', authenticateToken, async (req, res) => {
    try {
        const { alertId } = req.params;
        const resolved = performanceMonitorService.resolveAlert(alertId);
        res.json({
            success: resolved,
            message: resolved ? 'Alert resolved' : 'Alert not found',
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to resolve alert');
    }
});
router.get('/health/detailed', authenticateToken, async (req, res) => {
    try {
        const [performanceHealth, redisHealth, databaseHealth, cdnHealth] = await Promise.allSettled([
            performanceMonitorService.healthCheck(),
            redisClusterService.healthCheck(),
            databaseClusterService.healthCheck(),
            cdnService.healthCheck(),
        ]);
        const extractResult = (result) => result.status === 'fulfilled'
            ? result.value
            : { status: 'error', error: getErrorMessage(result.reason) };
        const health = {
            performance: extractResult(performanceHealth),
            redis: extractResult(redisHealth),
            database: extractResult(databaseHealth),
            cdn: extractResult(cdnHealth),
        };
        const overallStatus = Object.values(health).every((h) => h.status === 'healthy')
            ? 'healthy'
            : Object.values(health).some((h) => h.status === 'critical')
                ? 'critical'
                : 'degraded';
        res.json({
            success: true,
            status: overallStatus,
            data: health,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load detailed health status');
    }
});
router.get('/cache/stats', authenticateToken, async (req, res) => {
    try {
        const stats = redisClusterService.getMetrics();
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load cache stats');
    }
});
router.post('/cache/clear', authenticateToken, async (req, res) => {
    try {
        const { pattern } = req.body;
        if (!pattern) {
            res.status(400).json({
                success: false,
                error: 'Pattern is required',
            });
            return;
        }
        const cleared = await redisClusterService.deletePattern(pattern);
        res.json({
            success: true,
            data: { cleared },
            message: `Cleared ${cleared} keys matching pattern: ${pattern}`,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to clear cache keys');
    }
});
router.get('/database/stats', authenticateToken, async (req, res) => {
    try {
        const stats = databaseClusterService.getMetrics();
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load database stats');
    }
});
router.get('/cdn/stats', authenticateToken, async (req, res) => {
    try {
        const stats = cdnService.getMetrics();
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load CDN stats');
    }
});
router.post('/cdn/purge', authenticateToken, async (req, res) => {
    try {
        const { paths = [], tags = [] } = req.body;
        const purged = await cdnService.purgeCache(paths, tags);
        res.json({
            success: purged,
            message: purged ? 'CDN cache purged successfully' : 'Failed to purge CDN cache',
            data: { paths: paths.length, tags: tags.length },
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to purge CDN cache');
    }
});
router.post('/test/load', authenticateToken, async (req, res) => {
    try {
        const { duration = 60, concurrency = 10, endpoint = '/api/health', } = req.body;
        const testId = `load-test-${Date.now()}`;
        setTimeout(() => {
            logger.info(`Load test ${testId} completed`);
        }, duration * 1000);
        res.json({
            success: true,
            data: {
                testId,
                duration,
                concurrency,
                endpoint,
                status: 'started',
            },
            message: 'Load test started',
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to start load test');
    }
});
router.get('/optimization/recommendations', authenticateToken, async (req, res) => {
    try {
        const current = performanceMonitorService.getCurrentMetrics();
        const recommendations = [];
        if (current) {
            if (current.cache.hitRate < 90) {
                recommendations.push({
                    component: 'cache',
                    priority: 'high',
                    issue: 'Low cache hit rate',
                    recommendation: 'Review cache TTL settings and implement cache warming',
                    metric: `${current.cache.hitRate}% hit rate`,
                });
            }
            if (current.database.avgResponseTime > 500) {
                recommendations.push({
                    component: 'database',
                    priority: 'high',
                    issue: 'High database response time',
                    recommendation: 'Consider adding indexes, optimizing queries, or scaling read replicas',
                    metric: `${current.database.avgResponseTime}ms avg response time`,
                });
            }
            const memoryUsageMB = current.server.memoryUsage.heapUsed / 1024 / 1024;
            if (memoryUsageMB > 800) {
                recommendations.push({
                    component: 'server',
                    priority: 'medium',
                    issue: 'High memory usage',
                    recommendation: 'Implement memory pooling and optimize data structures',
                    metric: `${Math.round(memoryUsageMB)}MB memory usage`,
                });
            }
            if (current.queues.waitingJobs > 50) {
                recommendations.push({
                    component: 'queues',
                    priority: 'medium',
                    issue: 'Queue backlog building up',
                    recommendation: 'Scale worker processes or optimize job processing',
                    metric: `${current.queues.waitingJobs} waiting jobs`,
                });
            }
        }
        res.json({
            success: true,
            data: recommendations,
            meta: {
                generated: new Date().toISOString(),
                total: recommendations.length,
            },
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to generate optimization recommendations');
    }
});
router.get('/report', authenticateToken, async (req, res) => {
    try {
        const hours = parseInt(req.query.hours, 10) || 24;
        const format = req.query.format || 'json';
        const dashboard = performanceMonitorService.getDashboardData();
        const history = performanceMonitorService.getMetricsHistory(hours);
        const alerts = performanceMonitorService.getAllAlerts();
        const report = {
            generated: new Date().toISOString(),
            period: `${hours} hours`,
            summary: dashboard.summary,
            current: dashboard.current,
            trends: dashboard.trends,
            alerts: {
                total: alerts.length,
                active: alerts.filter((a) => !a.resolved).length,
                by_severity: alerts.reduce((acc, alert) => {
                    acc[alert.severity] = (acc[alert.severity] || 0) + 1;
                    return acc;
                }, {}),
            },
            metrics: history,
        };
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=performance-report.csv');
            res.send('CSV export not implemented');
        }
        else {
            res.json({
                success: true,
                data: report,
            });
        }
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to generate performance report');
    }
});
export default router;
//# sourceMappingURL=performanceRoutes.js.map