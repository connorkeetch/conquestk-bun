import cluster from 'node:cluster';
import os from 'node:os';
import { logger } from '../utils/logger.js';
export class ScalingService {
    workers = new Map();
    scalingMetrics;
    config;
    isInitialized = false;
    scalingInterval;
    metricsInterval;
    constructor() {
        this.config = {
            minWorkers: parseInt(process.env.MIN_WORKERS || '2', 10),
            maxWorkers: parseInt(process.env.MAX_WORKERS || String(os.cpus().length), 10),
            scaleUpThreshold: 80,
            scaleDownThreshold: 30,
            scaleUpCooldown: 5 * 60 * 1000,
            scaleDownCooldown: 10 * 60 * 1000,
            enableAutoScaling: process.env.ENABLE_AUTO_SCALING !== 'false',
        };
        this.scalingMetrics = {
            totalWorkers: 0,
            activeWorkers: 0,
            cpuUsage: [],
            memoryUsage: [],
            requestsPerWorker: [],
            lastScaleEvent: 0,
            autoScalingEnabled: this.config.enableAutoScaling,
        };
    }
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            logger.info('🔄 Initializing Scaling Service...', {
                environment: process.env.NODE_ENV,
                isMaster: cluster.isPrimary,
                cpuCount: os.cpus().length,
                config: this.config,
            });
            if (cluster.isPrimary) {
                await this.initializeMaster();
            }
            else {
                await this.initializeWorker();
            }
            this.isInitialized = true;
            logger.info('✅ Scaling Service initialized');
        }
        catch (error) {
            logger.error('❌ Failed to initialize Scaling Service:', error);
            throw error;
        }
    }
    async initializeMaster() {
        logger.info('👑 Initializing as master process');
        cluster.on('online', (worker) => {
            logger.info(`🟢 Worker ${worker.id} is online (PID: ${worker.process.pid})`);
            this.addWorkerMetrics(worker);
        });
        cluster.on('exit', (worker, code, signal) => {
            logger.warn(`🔴 Worker ${worker.id} died (${signal || code})`);
            this.removeWorkerMetrics(worker.id);
            if (!worker.exitedAfterDisconnect) {
                logger.info(`🔄 Restarting worker ${worker.id}...`);
                cluster.fork();
            }
        });
        cluster.on('listening', (worker, address) => {
            logger.info(`📡 Worker ${worker.id} listening on ${address.address}:${address.port}`);
        });
        cluster.on('disconnect', (worker) => {
            logger.warn(`📵 Worker ${worker.id} disconnected`);
        });
        const initialWorkers = Math.max(this.config.minWorkers, 1);
        for (let i = 0; i < initialWorkers; i++) {
            cluster.fork();
        }
        this.startMetricsCollection();
        this.startAutoScaling();
        this.setupShutdownHandlers();
    }
    async initializeWorker() {
        logger.info(`👷 Worker ${process.pid} initialized`);
        this.setupWorkerMonitoring();
    }
    addWorkerMetrics(worker) {
        const pid = worker.process?.pid ?? process.pid;
        const metrics = {
            id: worker.id,
            pid,
            uptime: 0,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            requestCount: 0,
            activeConnections: 0,
            status: 'active',
            lastHealthCheck: Date.now(),
        };
        this.workers.set(worker.id, metrics);
        this.updateScalingMetrics();
    }
    removeWorkerMetrics(workerId) {
        this.workers.delete(workerId);
        this.updateScalingMetrics();
    }
    updateScalingMetrics() {
        const activeWorkers = Array.from(this.workers.values()).filter((worker) => worker.status === 'active');
        this.scalingMetrics.totalWorkers = this.workers.size;
        this.scalingMetrics.activeWorkers = activeWorkers.length;
        this.scalingMetrics.cpuUsage = activeWorkers.map(() => 0);
        this.scalingMetrics.memoryUsage = activeWorkers.map((worker) => worker.memoryUsage.heapUsed / 1024 / 1024);
        this.scalingMetrics.requestsPerWorker = activeWorkers.map((worker) => worker.requestCount);
    }
    startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            this.collectWorkerMetrics();
        }, 30000);
        logger.info('📊 Started metrics collection for scaling');
    }
    collectWorkerMetrics() {
        const clusterWorkers = cluster.workers ?? {};
        Object.values(clusterWorkers).forEach((worker) => {
            worker?.send?.({ type: 'health-check' });
        });
        this.updateScalingMetrics();
        logger.debug('📊 Scaling metrics collected', {
            totalWorkers: this.scalingMetrics.totalWorkers,
            activeWorkers: this.scalingMetrics.activeWorkers,
            avgMemory: this.scalingMetrics.memoryUsage.reduce((a, b) => a + b, 0) /
                this.scalingMetrics.memoryUsage.length || 0,
        });
    }
    startAutoScaling() {
        if (!this.config.enableAutoScaling) {
            logger.info('⚠️ Auto-scaling is disabled');
            return;
        }
        this.scalingInterval = setInterval(() => {
            this.evaluateScaling();
        }, 60000);
        logger.info('🔄 Started auto-scaling monitor');
    }
    evaluateScaling() {
        const now = Date.now();
        const timeSinceLastScale = now - this.scalingMetrics.lastScaleEvent;
        const avgCpuUsage = this.scalingMetrics.cpuUsage.reduce((a, b) => a + b, 0) /
            this.scalingMetrics.cpuUsage.length || 0;
        const avgMemoryUsage = this.scalingMetrics.memoryUsage.reduce((a, b) => a + b, 0) /
            this.scalingMetrics.memoryUsage.length || 0;
        if (avgCpuUsage > this.config.scaleUpThreshold &&
            this.scalingMetrics.activeWorkers < this.config.maxWorkers &&
            timeSinceLastScale > this.config.scaleUpCooldown) {
            this.scaleUp('High CPU usage detected');
            return;
        }
        if (avgCpuUsage < this.config.scaleDownThreshold &&
            avgMemoryUsage < 200 &&
            this.scalingMetrics.activeWorkers > this.config.minWorkers &&
            timeSinceLastScale > this.config.scaleDownCooldown) {
            this.scaleDown('Low resource usage detected');
            return;
        }
        logger.debug('🔍 Scaling evaluation completed', {
            avgCpuUsage,
            avgMemoryUsage,
            activeWorkers: this.scalingMetrics.activeWorkers,
            decision: 'no scaling needed',
        });
    }
    scaleUp(reason) {
        if (this.scalingMetrics.activeWorkers >= this.config.maxWorkers) {
            logger.warn('⚠️ Cannot scale up: already at maximum workers');
            return false;
        }
        try {
            const newWorker = cluster.fork();
            this.scalingMetrics.lastScaleEvent = Date.now();
            logger.info('📈 Scaling up: forked new worker', {
                reason,
                workerId: newWorker.id,
                totalWorkers: this.scalingMetrics.totalWorkers + 1,
            });
            return true;
        }
        catch (error) {
            logger.error('❌ Failed to scale up:', error);
            return false;
        }
    }
    scaleDown(reason) {
        if (this.scalingMetrics.activeWorkers <= this.config.minWorkers) {
            logger.warn('⚠️ Cannot scale down: already at minimum workers');
            return false;
        }
        try {
            const leastBusyWorker = this.findLeastBusyWorker();
            if (!leastBusyWorker) {
                logger.warn('⚠️ No suitable worker found for scaling down');
                return false;
            }
            const clusterWorkers = cluster.workers ?? {};
            const worker = Object.values(clusterWorkers).find((candidate) => candidate?.id === leastBusyWorker.id);
            if (worker) {
                worker.disconnect();
                this.scalingMetrics.lastScaleEvent = Date.now();
                const metrics = this.workers.get(leastBusyWorker.id);
                if (metrics) {
                    metrics.status = 'terminating';
                }
                logger.info('📉 Scaling down: terminating worker', {
                    reason,
                    workerId: leastBusyWorker.id,
                    totalWorkers: this.scalingMetrics.totalWorkers - 1,
                });
                setTimeout(() => {
                    if (worker && !worker.isDead()) {
                        worker.kill();
                    }
                }, 30000);
                return true;
            }
        }
        catch (error) {
            logger.error('❌ Failed to scale down:', error);
        }
        return false;
    }
    findLeastBusyWorker() {
        const activeWorkers = Array.from(this.workers.values()).filter((worker) => worker.status === 'active');
        if (activeWorkers.length === 0)
            return null;
        return activeWorkers.reduce((least, current) => current.activeConnections < least.activeConnections ? current : least);
    }
    setupWorkerMonitoring() {
        process.on('message', (message) => {
            if (typeof message === 'object' && message && 'type' in message) {
                const typedMessage = message;
                if (typedMessage.type === 'health-check') {
                    process.send?.({
                        type: 'health-response',
                        metrics: {
                            memoryUsage: process.memoryUsage(),
                            cpuUsage: process.cpuUsage(),
                            uptime: process.uptime(),
                        },
                    });
                }
            }
        });
        setInterval(() => {
            if (process.send) {
                process.send({
                    type: 'worker-metrics',
                    data: {
                        pid: process.pid,
                        memoryUsage: process.memoryUsage(),
                        uptime: process.uptime(),
                    },
                });
            }
        }, 60000);
    }
    setupShutdownHandlers() {
        const shutdown = (signal) => {
            logger.info(`🔄 Received ${signal}, starting graceful shutdown...`);
            if (this.scalingInterval) {
                clearInterval(this.scalingInterval);
            }
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
            }
            const clusterWorkers = cluster.workers ?? {};
            Object.values(clusterWorkers).forEach((worker) => {
                if (worker) {
                    worker.disconnect();
                }
            });
            setTimeout(() => {
                logger.warn('⚠️ Force exiting after shutdown timeout');
                process.exit(1);
            }, 30000);
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    getMetrics() {
        return { ...this.scalingMetrics };
    }
    getWorkerMetrics() {
        return Array.from(this.workers.values());
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('⚙️ Scaling configuration updated', newConfig);
    }
    enableAutoScaling() {
        if (!this.scalingMetrics.autoScalingEnabled) {
            this.config.enableAutoScaling = true;
            this.scalingMetrics.autoScalingEnabled = true;
            this.startAutoScaling();
            logger.info('✅ Auto-scaling enabled');
        }
    }
    disableAutoScaling() {
        if (this.scalingMetrics.autoScalingEnabled) {
            this.config.enableAutoScaling = false;
            this.scalingMetrics.autoScalingEnabled = false;
            if (this.scalingInterval) {
                clearInterval(this.scalingInterval);
            }
            logger.info('⏸️ Auto-scaling disabled');
        }
    }
    async healthCheck() {
        const healthyWorkers = Array.from(this.workers.values()).filter((worker) => worker.status === 'active' && Date.now() - worker.lastHealthCheck < 120000);
        const status = healthyWorkers.length >= this.config.minWorkers ? 'healthy' : 'degraded';
        return {
            status,
            details: {
                totalWorkers: this.scalingMetrics.totalWorkers,
                activeWorkers: this.scalingMetrics.activeWorkers,
                healthyWorkers: healthyWorkers.length,
                autoScalingEnabled: this.scalingMetrics.autoScalingEnabled,
                config: this.config,
                workers: this.getWorkerMetrics().map((w) => ({
                    id: w.id,
                    pid: w.pid,
                    status: w.status,
                    uptime: w.uptime,
                    memoryMB: Math.round(w.memoryUsage.heapUsed / 1024 / 1024),
                })),
            },
        };
    }
    async shutdown() {
        logger.info('🔄 Shutting down Scaling Service...');
        if (this.scalingInterval) {
            clearInterval(this.scalingInterval);
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        logger.info('✅ Scaling Service shutdown complete');
    }
}
export const scalingService = new ScalingService();
//# sourceMappingURL=scalingService.js.map