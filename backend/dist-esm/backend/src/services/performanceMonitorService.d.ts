interface SystemMetrics {
    timestamp: number;
    server: {
        uptime: number;
        memoryUsage: NodeJS.MemoryUsage;
        cpuUsage: NodeJS.CpuUsage;
        activeConnections: number;
        requestsPerSecond: number;
    };
    database: {
        totalQueries: number;
        avgResponseTime: number;
        slowQueries: number;
        connectionPoolSize: number;
        healthyNodes: number;
    };
    cache: {
        hitRate: number;
        totalRequests: number;
        memoryUsage: number;
        evictions: number;
    };
    queues: {
        totalJobs: number;
        activeJobs: number;
        waitingJobs: number;
        failedJobs: number;
        processedJobs: number;
        deadLetterJobs: number;
    };
    cdn: {
        hitRate: number;
        bandwidth: number;
        avgLoadTime: number;
        healthyProviders: number;
    };
    game: {
        activeGames: number;
        totalPlayers: number;
        avgPlayersPerGame: number;
        completedGames: number;
    };
}
export interface PerformanceAlert {
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    component: string;
    message: string;
    timestamp: number;
    resolved: boolean;
    metrics?: MetricDetails;
}
type MetricValue = string | number | boolean | null | undefined;
type MetricDetails = Record<string, MetricValue | MetricValue[]>;
type HealthStatus = 'healthy' | 'warning' | 'critical';
type HealthCheckDetails = {
    monitoring: boolean;
    metricsCollected: number;
    currentMetrics: SystemMetrics | null;
    activeAlerts: number;
    criticalAlerts: number;
};
interface PerformanceThresholds {
    database: {
        maxResponseTime: number;
        minHitRate: number;
        maxSlowQueries: number;
    };
    cache: {
        minHitRate: number;
        maxMemoryUsage: number;
    };
    server: {
        maxMemoryUsage: number;
        maxCpuUsage: number;
        maxResponseTime: number;
    };
    queues: {
        maxWaitingJobs: number;
        maxFailureRate: number;
    };
}
export declare class PerformanceMonitorService {
    private metrics;
    private alerts;
    private isMonitoring;
    private monitoringInterval?;
    private alertCheckInterval?;
    private thresholds;
    private requestCounter;
    private requestTimestamps;
    initialize(): Promise<void>;
    private startMonitoring;
    private startAlertSystem;
    private collectMetrics;
    private calculateQueueMetrics;
    private collectGameMetrics;
    private checkPerformanceAlerts;
    private createAlert;
    private dispatchPerformanceAlert;
    trackRequest(): void;
    getCurrentMetrics(): SystemMetrics | null;
    getMetricsHistory(hours?: number): SystemMetrics[];
    getActiveAlerts(): PerformanceAlert[];
    getAllAlerts(): PerformanceAlert[];
    resolveAlert(alertId: string): boolean;
    getDashboardData(): {
        summary: {
            uptime: number;
            totalRequests: number;
            avgResponseTime: number;
            errorRate: number;
        };
        current: SystemMetrics | null;
        trends: {
            responseTime: number[];
            memoryUsage: number[];
            cacheHitRate: number[];
            activeGames: number[];
        };
        alerts: {
            active: number;
            critical: number;
            resolved: number;
        };
    };
    updateThresholds(newThresholds: Partial<PerformanceThresholds>): void;
    healthCheck(): Promise<{
        status: HealthStatus;
        details: HealthCheckDetails;
    }>;
    shutdown(): Promise<void>;
}
export declare const performanceMonitorService: PerformanceMonitorService;
export {};
//# sourceMappingURL=performanceMonitorService.d.ts.map