"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkerManagerInstance = exports.setWorkerManagerInstance = exports.createWorkerManager = exports.WorkerManager = void 0;
const queueService_js_1 = require("../services/queueService.js");
const logger_js_1 = require("../utils/logger.js");
const analyticsWorker_js_1 = require("./analyticsWorker.js");
const cleanupWorker_js_1 = require("./cleanupWorker.js");
const gameActionWorker_js_1 = require("./gameActionWorker.js");
const maintenanceWorker_js_1 = require("./maintenanceWorker.js");
const mapAssetWorker_js_1 = require("./mapAssetWorker.js");
class WorkerManager {
    constructor(io) {
        this.isInitialized = false;
        this.mapAssetWorker = null;
        this.maintenanceWorker = null;
        this.io = io;
    }
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            logger_js_1.logger.info('🔄 Initializing WorkerManager...');
            await queueService_js_1.queueService.initialize();
            const gameActionWorker = (0, gameActionWorker_js_1.createGameActionWorker)(this.io);
            const cleanupWorker = (0, cleanupWorker_js_1.createCleanupWorker)();
            const mapAssetWorker = (0, mapAssetWorker_js_1.createMapAssetWorker)();
            const analyticsWorker = (0, analyticsWorker_js_1.createAnalyticsWorker)();
            const maintenanceWorker = (0, maintenanceWorker_js_1.createMaintenanceWorker)();
            await Promise.all([
                gameActionWorker.initialize(),
                cleanupWorker.initialize(),
                mapAssetWorker.initialize(),
                maintenanceWorker.initialize(),
                analyticsWorker.initialize(),
            ]);
            this.mapAssetWorker = mapAssetWorker;
            this.maintenanceWorker = maintenanceWorker;
            this.isInitialized = true;
            logger_js_1.logger.info('✅ WorkerManager initialized successfully');
            try {
                const stats = await queueService_js_1.queueService.getQueueStats();
                logger_js_1.logger.info('📊 Initial queue stats:', stats);
            }
            catch (statsError) {
                logger_js_1.logger.warn('⚠️ Unable to retrieve initial queue stats:', statsError instanceof Error ? statsError.message : statsError);
            }
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to initialize WorkerManager:', error);
            throw error;
        }
    }
    async healthCheck() {
        try {
            const queueHealth = await queueService_js_1.queueService.healthCheck();
            if (queueHealth.status === 'disabled') {
                return {
                    status: 'disabled',
                    details: {
                        workers: {
                            initialized: this.isInitialized,
                        },
                        queues: {},
                    },
                };
            }
            return {
                status: queueHealth.status === 'healthy' && this.isInitialized ? 'healthy' : 'unhealthy',
                details: {
                    workers: {
                        initialized: this.isInitialized,
                    },
                    queues: queueHealth.details.queues,
                },
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                details: { error: error.message },
            };
        }
    }
    async getStats() {
        const queueStats = await queueService_js_1.queueService.getQueueStats();
        return {
            initialized: this.isInitialized,
            queues: queueStats,
            timestamp: new Date().toISOString(),
        };
    }
    async shutdown() {
        logger_js_1.logger.info('🔄 Shutting down WorkerManager...');
        try {
            await queueService_js_1.queueService.shutdown();
            this.mapAssetWorker?.shutdown();
            this.maintenanceWorker?.shutdown();
            this.mapAssetWorker = null;
            this.maintenanceWorker = null;
            this.isInitialized = false;
            logger_js_1.logger.info('✅ WorkerManager shutdown complete');
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error during WorkerManager shutdown:', error);
            throw error;
        }
    }
}
exports.WorkerManager = WorkerManager;
const createWorkerManager = (io) => new WorkerManager(io);
exports.createWorkerManager = createWorkerManager;
let workerManagerInstance = null;
const setWorkerManagerInstance = (instance) => {
    workerManagerInstance = instance;
};
exports.setWorkerManagerInstance = setWorkerManagerInstance;
const getWorkerManagerInstance = () => workerManagerInstance;
exports.getWorkerManagerInstance = getWorkerManagerInstance;
//# sourceMappingURL=workerManager.js.map