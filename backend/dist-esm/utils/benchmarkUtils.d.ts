import { performanceTestingService } from '../services/performanceTestingService.js';
type LoadTestResult = Awaited<ReturnType<typeof performanceTestingService.runLoadTest>>;
type LoadTestMetrics = LoadTestResult['results'];
type BenchmarkBottleneck = LoadTestResult['bottlenecks'][number];
export interface PerformanceSnapshot {
    avgResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
}
export interface BenchmarkTestSummary {
    testId: string;
    timestamp?: number;
    results: LoadTestMetrics;
    bottlenecks: BenchmarkBottleneck[];
    error?: string;
}
export interface PerformanceReport {
    summary: {
        totalTests: number;
        averageGrade: PerformanceGrade;
        bestPerforming: string;
        needsImprovement: string[];
    };
    trends: {
        improving: string[];
        degrading: string[];
        stable: string[];
    };
    recommendations: string[];
    error?: string;
}
export interface BenchmarkThresholds {
    responseTime: {
        excellent: number;
        good: number;
        fair: number;
        poor: number;
    };
    throughput: {
        excellent: number;
        good: number;
        fair: number;
        poor: number;
    };
    errorRate: {
        excellent: number;
        good: number;
        fair: number;
        poor: number;
    };
    availability: {
        excellent: number;
        good: number;
        fair: number;
        poor: number;
    };
}
export declare const DEFAULT_BENCHMARKS: BenchmarkThresholds;
export type PerformanceGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
export declare function calculatePerformanceGrade(responseTime: number, throughput: number, errorRate: number, availability?: number, thresholds?: BenchmarkThresholds): {
    overall: PerformanceGrade;
    breakdown: {
        responseTime: PerformanceGrade;
        throughput: PerformanceGrade;
        errorRate: PerformanceGrade;
        availability: PerformanceGrade;
    };
    score: number;
};
export declare function comparePerformance(baseline: PerformanceSnapshot, current: PerformanceSnapshot): {
    responseTime: {
        change: number;
        improvement: boolean;
    };
    throughput: {
        change: number;
        improvement: boolean;
    };
    errorRate: {
        change: number;
        improvement: boolean;
    };
};
export declare function generatePerformanceReport(testResults: BenchmarkTestSummary[]): PerformanceReport;
export declare function runAutomatedBenchmarks(): Promise<{
    success: boolean;
    results: BenchmarkTestSummary[];
    summary: PerformanceReport;
}>;
export interface SLAThresholds {
    responseTime: number;
    availability: number;
    throughput: number;
    errorRate: number;
}
export declare function checkSLACompliance(testResults: BenchmarkTestSummary[], slaThresholds: SLAThresholds): {
    compliant: boolean;
    violations: Array<{
        metric: string;
        actual: number;
        threshold: number;
        severity: 'warning' | 'violation';
    }>;
    uptime: number;
};
export {};
//# sourceMappingURL=benchmarkUtils.d.ts.map