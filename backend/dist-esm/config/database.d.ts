import { Pool, type PoolClient, type QueryResultRow } from 'pg';
export interface DatabaseQueryResult<T extends QueryResultRow = QueryResultRow> {
    rows: T[];
    rowCount: number | null;
}
type QueryValues = ReadonlyArray<unknown>;
export interface QueryOptions {
    client?: PoolClient;
}
export declare function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: QueryValues, options?: QueryOptions): Promise<DatabaseQueryResult<T>>;
export declare function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
interface WithClientOptions {
    client?: PoolClient;
}
export declare function withClient<T>(callback: (client: PoolClient) => Promise<T>, options?: WithClientOptions): Promise<T>;
export declare function initDatabase(): Promise<void>;
export declare function closeDatabase(): Promise<void>;
export declare function buildUpdateQuery(table: string, updates: Record<string, unknown>, conditions: Record<string, unknown>): {
    text: string;
    values: unknown[];
};
export declare function buildInsertQuery(table: string, data: Record<string, unknown>, returning?: string): {
    text: string;
    values: unknown[];
};
export declare function getClient(): Promise<PoolClient>;
export declare function getPool(): Pool;
interface PoolMetrics {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    config: {
        max: number | undefined;
        min: number | undefined;
        idleTimeoutMillis: number | undefined;
        connectionTimeoutMillis: number | undefined | null;
    };
    utilization: string;
}
export declare function getPoolMetrics(): PoolMetrics | {
    error: string;
};
declare const _default: {
    query: typeof query;
    transaction: typeof transaction;
    initDatabase: typeof initDatabase;
    closeDatabase: typeof closeDatabase;
    getClient: typeof getClient;
};
export default _default;
//# sourceMappingURL=database.d.ts.map