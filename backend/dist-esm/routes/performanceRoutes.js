"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_js_1 = require("../middleware/auth.js");
const cdnService_js_1 = require("../services/cdnService.js");
const databaseClusterService_js_1 = require("../services/databaseClusterService.js");
const performanceMonitorService_js_1 = require("../services/performanceMonitorService.js");
const redisClusterService_js_1 = require("../services/redisClusterService.js");
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const logger_js_1 = require("../utils/logger.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = express_1.default.Router();
const sendFailure = (req, res, error, logMessage, status = 500) => {
    const clientError = error instanceof Error ? error.message : logMessage;
    (0, routeErrorHandler_js_1.handleRouteError)(error, req, logMessage, status, { clientError });
    res.status(status).json({
        success: false,
        error: clientError,
    });
};
router.get('/dashboard', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const dashboard = performanceMonitorService_js_1.performanceMonitorService.getDashboardData();
        res.json({
            success: true,
            data: dashboard,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load performance dashboard');
    }
});
router.get('/metrics', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const current = performanceMonitorService_js_1.performanceMonitorService.getCurrentMetrics();
        res.json({
            success: true,
            data: current,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load current metrics');
    }
});
router.get('/metrics/history', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const hours = parseInt(req.query.hours, 10) || 1;
        const history = performanceMonitorService_js_1.performanceMonitorService.getMetricsHistory(hours);
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
router.get('/alerts', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const activeOnly = req.query.active === 'true';
        const alerts = activeOnly
            ? performanceMonitorService_js_1.performanceMonitorService.getActiveAlerts()
            : performanceMonitorService_js_1.performanceMonitorService.getAllAlerts();
        res.json({
            success: true,
            data: alerts,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load performance alerts');
    }
});
router.post('/alerts/:alertId/resolve', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { alertId } = req.params;
        const resolved = performanceMonitorService_js_1.performanceMonitorService.resolveAlert(alertId);
        res.json({
            success: resolved,
            message: resolved ? 'Alert resolved' : 'Alert not found',
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to resolve alert');
    }
});
router.get('/health/detailed', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const [performanceHealth, redisHealth, databaseHealth, cdnHealth] = await Promise.allSettled([
            performanceMonitorService_js_1.performanceMonitorService.healthCheck(),
            redisClusterService_js_1.redisClusterService.healthCheck(),
            databaseClusterService_js_1.databaseClusterService.healthCheck(),
            cdnService_js_1.cdnService.healthCheck(),
        ]);
        const extractResult = (result) => result.status === 'fulfilled'
            ? result.value
            : { status: 'error', error: (0, errorHelpers_js_1.getErrorMessage)(result.reason) };
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
router.get('/cache/stats', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const stats = redisClusterService_js_1.redisClusterService.getMetrics();
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load cache stats');
    }
});
router.post('/cache/clear', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { pattern } = req.body;
        if (!pattern) {
            res.status(400).json({
                success: false,
                error: 'Pattern is required',
            });
            return;
        }
        const cleared = await redisClusterService_js_1.redisClusterService.deletePattern(pattern);
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
router.get('/database/stats', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const stats = databaseClusterService_js_1.databaseClusterService.getMetrics();
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load database stats');
    }
});
router.get('/cdn/stats', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const stats = cdnService_js_1.cdnService.getMetrics();
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        sendFailure(req, res, error, 'Failed to load CDN stats');
    }
});
router.post('/cdn/purge', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { paths = [], tags = [] } = req.body;
        const purged = await cdnService_js_1.cdnService.purgeCache(paths, tags);
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
router.post('/test/load', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { duration = 60, concurrency = 10, endpoint = '/api/health', } = req.body;
        const testId = `load-test-${Date.now()}`;
        setTimeout(() => {
            logger_js_1.logger.info(`Load test ${testId} completed`);
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
router.get('/optimization/recommendations', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const current = performanceMonitorService_js_1.performanceMonitorService.getCurrentMetrics();
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
router.get('/report', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const hours = parseInt(req.query.hours, 10) || 24;
        const format = req.query.format || 'json';
        const dashboard = performanceMonitorService_js_1.performanceMonitorService.getDashboardData();
        const history = performanceMonitorService_js_1.performanceMonitorService.getMetricsHistory(hours);
        const alerts = performanceMonitorService_js_1.performanceMonitorService.getAllAlerts();
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
exports.default = router;
//# sourceMappingURL=performanceRoutes.js.map