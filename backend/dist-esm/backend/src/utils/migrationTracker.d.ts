export interface MigrationRecord {
    id?: number;
    filename: string;
    checksum: string;
    executed_at: Date;
    execution_time_ms: number;
    status: 'completed' | 'failed' | 'rolled_back';
    rollback_sql?: string;
}
export interface MigrationStatus {
    filename: string;
    status: 'completed' | 'failed' | 'rolled_back' | 'pending';
    executed_at?: Date;
    execution_time_ms?: number;
}
export declare class MigrationTracker {
    private trackingTableExists;
    private resolveStatus;
    createTrackingTable(): Promise<void>;
    private upgradeTrackingTable;
    getAppliedMigrations(): Promise<string[]>;
    markMigrationCompleted(record: MigrationRecord): Promise<void>;
    getMigrationStatus(filename: string): Promise<MigrationStatus | null>;
    validateMigrationIntegrity(filename: string): Promise<boolean>;
    calculateChecksum(content: string): string;
    getAllMigrationStatuses(): Promise<MigrationStatus[]>;
    rollbackMigration(filename: string): Promise<void>;
}
//# sourceMappingURL=migrationTracker.d.ts.map