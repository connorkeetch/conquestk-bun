"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performanceMonitorService = exports.PerformanceMonitorService = void 0;
const node_crypto_1 = require("node:crypto");
const logger_js_1 = require("../utils/logger.js");
const workerManager_js_1 = require("../workers/workerManager.js");
const adminService_js_1 = require("./adminService.js");
const cdnService_js_1 = require("./cdnService.js");
const databaseClusterService_js_1 = require("./databaseClusterService.js");
const NotificationDispatcher_js_1 = require("./NotificationDispatcher.js");
const performanceAlerts_js_1 = require("./notifications/performanceAlerts.js");
const redisClusterService_js_1 = require("./redisClusterService.js");
class PerformanceMonitorService {
    constructor() {
        this.metrics = [];
        this.alerts = [];
        this.isMonitoring = false;
        this.thresholds = {
            database: {
                maxResponseTime: 1000,
                minHitRate: 85,
                maxSlowQueries: 10,
            },
            cache: {
                minHitRate: 90,
                maxMemoryUsage: 1024 * 1024 * 512,
            },
            server: {
                maxMemoryUsage: 1024 * 1024 * 1024,
                maxCpuUsage: 80,
                maxResponseTime: 500,
            },
            queues: {
                maxWaitingJobs: 100,
                maxFailureRate: 5,
            },
        };
        this.requestCounter = 0;
        this.requestTimestamps = [];
    }
    async initialize() {
        try {
            logger_js_1.logger.info('🔄 Initializing Performance Monitor Service...');
            this.startMonitoring();
            this.startAlertSystem();
            logger_js_1.logger.info('✅ Performance Monitor Service initialized');
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to initialize Performance Monitor Service:', error);
            throw error;
        }
    }
    startMonitoring() {
        if (this.isMonitoring)
            return;
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => this.collectMetrics(), 30000);
        this.collectMetrics();
        logger_js_1.logger.info('📊 Started performance monitoring');
    }
    startAlertSystem() {
        this.alertCheckInterval = setInterval(() => {
            void this.checkPerformanceAlerts();
        }, 60000);
        logger_js_1.logger.info('🚨 Started alert system');
    }
    async collectMetrics() {
        try {
            const timestamp = Date.now();
            const memoryUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const uptime = process.uptime();
            const now = Date.now();
            this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts < 60000);
            const requestsPerSecond = this.requestTimestamps.length / 60;
            const dbMetrics = await databaseClusterService_js_1.databaseClusterService.getMetrics();
            const cacheMetrics = redisClusterService_js_1.redisClusterService.getMetrics();
            const workerManager = (0, workerManager_js_1.getWorkerManagerInstance)();
            const queueHealth = workerManager ? await workerManager.getStats() : null;
            const queueMetrics = this.calculateQueueMetrics(queueHealth);
            const cdnMetrics = cdnService_js_1.cdnService.getMetrics();
            const gameMetrics = await this.collectGameMetrics();
            const systemMetrics = {
                timestamp,
                server: {
                    uptime,
                    memoryUsage,
                    cpuUsage,
                    activeConnections: 0,
                    requestsPerSecond,
                },
                database: {
                    totalQueries: dbMetrics.totalQueries,
                    avgResponseTime: dbMetrics.avgResponseTime,
                    slowQueries: dbMetrics.slowQueries,
                    connectionPoolSize: dbMetrics.nodes.reduce((sum, node) => sum + node.connectionCount, 0),
                    healthyNodes: dbMetrics.nodes.filter((node) => node.isHealthy).length,
                },
                cache: {
                    hitRate: cacheMetrics.hitRate,
                    totalRequests: cacheMetrics.totalRequests,
                    memoryUsage: 0,
                    evictions: 0,
                },
                queues: queueMetrics,
                cdn: {
                    hitRate: cdnMetrics.cacheHitRate,
                    bandwidth: cdnMetrics.bandwidth,
                    avgLoadTime: cdnMetrics.avgLoadTime,
                    healthyProviders: cdnMetrics.providers,
                },
                game: gameMetrics,
            };
            this.metrics.push(systemMetrics);
            if (this.metrics.length > 2880) {
                this.metrics.shift();
            }
            logger_js_1.logger.debug('📊 Metrics collected', {
                timestamp,
                database: systemMetrics.database.avgResponseTime,
                cache: systemMetrics.cache.hitRate,
                memory: Math.round(systemMetrics.server.memoryUsage.heapUsed / 1024 / 1024),
            });
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to collect metrics:', error);
        }
    }
    calculateQueueMetrics(queueStats) {
        let totalJobs = 0;
        let activeJobs = 0;
        let waitingJobs = 0;
        let failedJobs = 0;
        let processedJobs = 0;
        let deadLetterJobs = 0;
        if (queueStats?.queues) {
            for (const queue of Object.values(queueStats.queues)) {
                activeJobs += queue.active || 0;
                waitingJobs += queue.waiting || 0;
                failedJobs += queue.failed || 0;
                processedJobs += queue.completed || 0;
                deadLetterJobs += queue.deadLetter || 0;
                totalJobs +=
                    (queue.active || 0) +
                        (queue.waiting || 0) +
                        (queue.failed || 0) +
                        (queue.completed || 0) +
                        (queue.deadLetter || 0);
            }
        }
        return {
            totalJobs,
            activeJobs,
            waitingJobs,
            failedJobs,
            processedJobs,
            deadLetterJobs,
        };
    }
    async collectGameMetrics() {
        return {
            activeGames: 0,
            totalPlayers: 0,
            avgPlayersPerGame: 0,
            completedGames: 0,
        };
    }
    async checkPerformanceAlerts() {
        if (this.metrics.length === 0)
            return;
        const latestMetrics = this.metrics[this.metrics.length - 1];
        const newAlerts = [];
        if (latestMetrics.database.avgResponseTime > this.thresholds.database.maxResponseTime) {
            newAlerts.push(this.createAlert('critical', 'database', `Database response time is ${latestMetrics.database.avgResponseTime}ms (threshold: ${this.thresholds.database.maxResponseTime}ms)`, { responseTime: latestMetrics.database.avgResponseTime }));
        }
        if (latestMetrics.cache.hitRate < this.thresholds.cache.minHitRate) {
            newAlerts.push(this.createAlert('high', 'cache', `Cache hit rate is ${latestMetrics.cache.hitRate}% (threshold: ${this.thresholds.cache.minHitRate}%)`, { hitRate: latestMetrics.cache.hitRate }));
        }
        const memoryUsageMB = latestMetrics.server.memoryUsage.heapUsed;
        if (memoryUsageMB > this.thresholds.server.maxMemoryUsage) {
            newAlerts.push(this.createAlert('high', 'server', `Memory usage is ${Math.round(memoryUsageMB / 1024 / 1024)}MB (threshold: ${Math.round(this.thresholds.server.maxMemoryUsage / 1024 / 1024)}MB)`, { memoryUsage: memoryUsageMB }));
        }
        if (latestMetrics.queues.waitingJobs > this.thresholds.queues.maxWaitingJobs) {
            newAlerts.push(this.createAlert('medium', 'queues', `Queue backlog is ${latestMetrics.queues.waitingJobs} jobs (threshold: ${this.thresholds.queues.maxWaitingJobs})`, { waitingJobs: latestMetrics.queues.waitingJobs }));
        }
        for (const alert of newAlerts) {
            this.alerts.push(alert);
            logger_js_1.logger.warn(`🚨 Performance alert: ${alert.message}`, alert.metrics);
            await this.dispatchPerformanceAlert(alert);
        }
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.alerts = this.alerts.filter((alert) => alert.timestamp > dayAgo);
    }
    createAlert(severity, component, message, metrics) {
        return {
            id: `${component}-${Date.now()}`,
            severity,
            component,
            message,
            timestamp: Date.now(),
            resolved: false,
            metrics,
        };
    }
    async dispatchPerformanceAlert(alert) {
        try {
            const adminUserIds = await adminService_js_1.adminService.getActiveAdminUserIds();
            const event = (0, performanceAlerts_js_1.buildPerformanceAlertNotification)(alert, adminUserIds);
            await NotificationDispatcher_js_1.notificationDispatcher.dispatch({
                ...event,
                id: (0, node_crypto_1.randomUUID)(),
            });
        }
        catch (error) {
            logger_js_1.logger.error('Failed to dispatch performance alert notification', {
                alertId: alert.id,
                error,
            });
        }
    }
    trackRequest() {
        this.requestCounter++;
        this.requestTimestamps.push(Date.now());
    }
    getCurrentMetrics() {
        return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
    }
    getMetricsHistory(hours = 1) {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        return this.metrics.filter((m) => m.timestamp > cutoff);
    }
    getActiveAlerts() {
        return this.alerts.filter((alert) => !alert.resolved);
    }
    getAllAlerts() {
        return [...this.alerts];
    }
    resolveAlert(alertId) {
        const alert = this.alerts.find((a) => a.id === alertId);
        if (alert) {
            alert.resolved = true;
            logger_js_1.logger.info(`✅ Alert resolved: ${alertId}`);
            return true;
        }
        return false;
    }
    getDashboardData() {
        const current = this.getCurrentMetrics();
        const lastHour = this.getMetricsHistory(1);
        return {
            summary: {
                uptime: process.uptime(),
                totalRequests: this.requestCounter,
                avgResponseTime: current?.database.avgResponseTime || 0,
                errorRate: 0,
            },
            current,
            trends: {
                responseTime: lastHour.map((m) => m.database.avgResponseTime),
                memoryUsage: lastHour.map((m) => m.server.memoryUsage.heapUsed / 1024 / 1024),
                cacheHitRate: lastHour.map((m) => m.cache.hitRate),
                activeGames: lastHour.map((m) => m.game.activeGames),
            },
            alerts: {
                active: this.getActiveAlerts().length,
                critical: this.alerts.filter((a) => !a.resolved && a.severity === 'critical').length,
                resolved: this.alerts.filter((a) => a.resolved).length,
            },
        };
    }
    updateThresholds(newThresholds) {
        this.thresholds = { ...this.thresholds, ...newThresholds };
        logger_js_1.logger.info('⚙️ Performance thresholds updated', newThresholds);
    }
    async healthCheck() {
        const current = this.getCurrentMetrics();
        const activeAlerts = this.getActiveAlerts();
        const criticalAlerts = activeAlerts.filter((a) => a.severity === 'critical');
        return {
            status: criticalAlerts.length > 0 ? 'critical' : activeAlerts.length > 0 ? 'warning' : 'healthy',
            details: {
                monitoring: this.isMonitoring,
                metricsCollected: this.metrics.length,
                currentMetrics: current,
                activeAlerts: activeAlerts.length,
                criticalAlerts: criticalAlerts.length,
            },
        };
    }
    async shutdown() {
        logger_js_1.logger.info('🔄 Shutting down Performance Monitor Service...');
        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        if (this.alertCheckInterval) {
            clearInterval(this.alertCheckInterval);
        }
        logger_js_1.logger.info('✅ Performance Monitor Service shutdown complete');
    }
}
exports.PerformanceMonitorService = PerformanceMonitorService;
exports.performanceMonitorService = new PerformanceMonitorService();
//# sourceMappingURL=performanceMonitorService.js.map