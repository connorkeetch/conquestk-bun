import { type QueryResult, type QueryResultRow } from 'pg';
interface QueryMetrics {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    avgResponseTime: number;
    slowQueries: number;
    connectionErrors: number;
}
interface DatabaseHealthDetails {
    totalNodes: number;
    healthyNodes: number;
    primaryHealthy: boolean;
    metrics: ReturnType<DatabaseClusterService['getMetrics']>;
}
export declare class DatabaseClusterService {
    private nodes;
    private metrics;
    private config;
    private currentRoundRobinIndex;
    private healthCheckInterval?;
    initialize(): Promise<void>;
    private getEnvValue;
    private addDatabaseNode;
    private selectNodeForRead;
    private selectNodeForWrite;
    private selectRoundRobin;
    private selectLeastConnections;
    private selectWeightedRoundRobin;
    private selectHealthWeighted;
    query(text: string, params?: readonly unknown[], options?: {
        writeQuery?: boolean;
        retries?: number;
    }): Promise<QueryResult<QueryResultRow>>;
    private updateNodeMetrics;
    private isConnectionError;
    private markNodeUnhealthy;
    private sleep;
    private startHealthMonitoring;
    private performHealthChecks;
    getMetrics(): QueryMetrics & {
        nodes: Array<{
            id: string;
            role: string;
            isHealthy: boolean;
            connectionCount: number;
            avgResponseTime: number;
        }>;
    };
    healthCheck(): Promise<{
        status: 'healthy' | 'degraded';
        details: DatabaseHealthDetails;
    }>;
    shutdown(): Promise<void>;
}
export declare const databaseClusterService: DatabaseClusterService;
export {};
//# sourceMappingURL=databaseClusterService.d.ts.map