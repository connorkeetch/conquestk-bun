import { queueService } from '../services/queueService.js';
import { logger } from '../utils/logger.js';
import { createAnalyticsWorker } from './analyticsWorker.js';
import { createCleanupWorker } from './cleanupWorker.js';
import { createGameActionWorker } from './gameActionWorker.js';
import { createMaintenanceWorker } from './maintenanceWorker.js';
import { createMapAssetWorker } from './mapAssetWorker.js';
export class WorkerManager {
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
            logger.info('🔄 Initializing WorkerManager...');
            await queueService.initialize();
            const gameActionWorker = createGameActionWorker(this.io);
            const cleanupWorker = createCleanupWorker();
            const mapAssetWorker = createMapAssetWorker();
            const analyticsWorker = createAnalyticsWorker();
            const maintenanceWorker = createMaintenanceWorker();
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
            logger.info('✅ WorkerManager initialized successfully');
            try {
                const stats = await queueService.getQueueStats();
                logger.info('📊 Initial queue stats:', stats);
            }
            catch (statsError) {
                logger.warn('⚠️ Unable to retrieve initial queue stats:', statsError instanceof Error ? statsError.message : statsError);
            }
        }
        catch (error) {
            logger.error('❌ Failed to initialize WorkerManager:', error);
            throw error;
        }
    }
    async healthCheck() {
        try {
            const queueHealth = await queueService.healthCheck();
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
        const queueStats = await queueService.getQueueStats();
        return {
            initialized: this.isInitialized,
            queues: queueStats,
            timestamp: new Date().toISOString(),
        };
    }
    async shutdown() {
        logger.info('🔄 Shutting down WorkerManager...');
        try {
            await queueService.shutdown();
            this.mapAssetWorker?.shutdown();
            this.maintenanceWorker?.shutdown();
            this.mapAssetWorker = null;
            this.maintenanceWorker = null;
            this.isInitialized = false;
            logger.info('✅ WorkerManager shutdown complete');
        }
        catch (error) {
            logger.error('❌ Error during WorkerManager shutdown:', error);
            throw error;
        }
    }
}
export const createWorkerManager = (io) => new WorkerManager(io);
let workerManagerInstance = null;
export const setWorkerManagerInstance = (instance) => {
    workerManagerInstance = instance;
};
export const getWorkerManagerInstance = () => workerManagerInstance;
//# sourceMappingURL=workerManager.js.map