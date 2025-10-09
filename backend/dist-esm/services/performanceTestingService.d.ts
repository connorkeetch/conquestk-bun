interface LoadTestConfig {
    duration: number;
    concurrency: number;
    rampUp: number;
    endpoints: Array<{
        path: string;
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        weight: number;
        payload?: RequestPayload;
        headers?: Record<string, string>;
    }>;
}
type RequestPayload = Record<string, unknown> | unknown[] | string | number | boolean | null;
interface GameScenarioConfig {
    players: number;
    gameCount: number;
    actionsPerMinute: number;
    duration: number;
    scenario: 'quick_game' | 'tournament' | 'peak_load' | 'stress_test';
}
interface BenchmarkResult {
    testId: string;
    timestamp: number;
    config: LoadTestConfig | GameScenarioConfig;
    results: {
        totalRequests: number;
        successfulRequests: number;
        failedRequests: number;
        avgResponseTime: number;
        p95ResponseTime: number;
        p99ResponseTime: number;
        requestsPerSecond: number;
        errorsPerSecond: number;
        throughputMBps: number;
    };
    systemMetrics: {
        cpuUsage: number[];
        memoryUsage: number[];
        dbConnections: number[];
        cacheHitRate: number[];
        activeWorkers: number[];
    };
    bottlenecks: Array<{
        component: string;
        issue: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        recommendation: string;
    }>;
}
interface StressTestResult extends BenchmarkResult {
    breakingPoint: {
        maxConcurrentUsers: number;
        maxRequestsPerSecond: number;
        firstFailureAt: number;
        recoveryTime: number;
    };
    degradationPoints: Array<{
        concurrency: number;
        responseTimeMs: number;
        errorRate: number;
    }>;
}
export declare class PerformanceTestingService {
    private activeTests;
    private benchmarkHistory;
    private testScenarios;
    constructor();
    private initializeTestScenarios;
    runLoadTest(scenarioName: string): Promise<BenchmarkResult>;
    runGameScenarioTest(config: GameScenarioConfig): Promise<BenchmarkResult>;
    runStressTest(maxConcurrency?: number): Promise<StressTestResult>;
    private executeLoadTest;
    private createLoadTestWorker;
    private selectWeightedEndpoint;
    private executeGameScenario;
    private startMetricsCollection;
    private stopMetricsCollection;
    private analyzeBottlenecks;
    getActiveTests(): string[];
    getBenchmarkHistory(limit?: number): BenchmarkResult[];
    getTestScenarios(): string[];
    stopTest(testId: string): Promise<boolean>;
    generateBenchmarkReport(): {
        summary: {
            totalTests: number;
            avgResponseTime: number;
            avgThroughput: number;
            commonBottlenecks: string[];
        };
        trends: {
            responseTimeImprovement: number;
            throughputImprovement: number;
            stabilityImprovement: number;
        };
        recommendations: string[];
    };
}
export declare const performanceTestingService: PerformanceTestingService;
export {};
//# sourceMappingURL=performanceTestingService.d.ts.map