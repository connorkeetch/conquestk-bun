import type { Server } from 'socket.io';
import { type QueueStats } from '../services/queueService.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/shared.js';
export declare class WorkerManager {
    private isInitialized;
    private io;
    private mapAssetWorker;
    private maintenanceWorker;
    constructor(io: Server<ClientToServerEvents, ServerToClientEvents>);
    initialize(): Promise<void>;
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy' | 'disabled';
        details: Record<string, unknown>;
    }>;
    getStats(): Promise<{
        initialized: boolean;
        queues: Record<string, QueueStats>;
        timestamp: string;
    }>;
    shutdown(): Promise<void>;
}
export declare const createWorkerManager: (io: Server<ClientToServerEvents, ServerToClientEvents>) => WorkerManager;
export declare const setWorkerManagerInstance: (instance: WorkerManager) => void;
export declare const getWorkerManagerInstance: () => WorkerManager | null;
//# sourceMappingURL=workerManager.d.ts.map