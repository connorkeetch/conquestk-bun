interface ScalingMetrics {
    totalWorkers: number;
    activeWorkers: number;
    cpuUsage: number[];
    memoryUsage: number[];
    requestsPerWorker: number[];
    lastScaleEvent: number;
    autoScalingEnabled: boolean;
}
interface ScalingConfig {
    minWorkers: number;
    maxWorkers: number;
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    scaleUpCooldown: number;
    scaleDownCooldown: number;
    enableAutoScaling: boolean;
}
interface WorkerMetrics {
    id: number;
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    requestCount: number;
    activeConnections: number;
    status: 'active' | 'idle' | 'terminating';
    lastHealthCheck: number;
}
export declare class ScalingService {
    private workers;
    private scalingMetrics;
    private config;
    private isInitialized;
    private scalingInterval?;
    private metricsInterval?;
    constructor();
    initialize(): Promise<void>;
    private initializeMaster;
    private initializeWorker;
    private addWorkerMetrics;
    private removeWorkerMetrics;
    private updateScalingMetrics;
    private startMetricsCollection;
    private collectWorkerMetrics;
    private startAutoScaling;
    private evaluateScaling;
    scaleUp(reason: string): boolean;
    scaleDown(reason: string): boolean;
    private findLeastBusyWorker;
    private setupWorkerMonitoring;
    private setupShutdownHandlers;
    getMetrics(): ScalingMetrics;
    getWorkerMetrics(): WorkerMetrics[];
    updateConfig(newConfig: Partial<ScalingConfig>): void;
    enableAutoScaling(): void;
    disableAutoScaling(): void;
    healthCheck(): Promise<{
        status: string;
        details: Record<string, unknown>;
    }>;
    shutdown(): Promise<void>;
}
export declare const scalingService: ScalingService;
export {};
//# sourceMappingURL=scalingService.d.ts.map