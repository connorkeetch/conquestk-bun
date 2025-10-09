import { type MigrationStatus, MigrationTracker } from './migrationTracker.js';
export declare class MigrationRunner {
    private migrationTracker;
    private migrationsPath;
    private static didLogPathScan;
    constructor(migrationTracker?: MigrationTracker);
    runPendingMigrations(): Promise<void>;
    private ensureLegacyCompatibility;
    runSingleMigration(migrationFile: string): Promise<void>;
    private getAvailableMigrations;
    private convertLegacyToPostgreSQL;
    private executeInTransaction;
    private splitMigrationStatements;
    private isAcceptableError;
    private generateRollbackHints;
    checkKeyTablesExist(): Promise<boolean>;
    validateSchemaIntegrity(): Promise<boolean>;
    private extractErrorDetails;
    getMigrationStatus(): Promise<MigrationStatus[]>;
}
export declare function runMigrations(): Promise<void>;
export declare function runMigration(migrationFile: string): Promise<void>;
//# sourceMappingURL=migrationRunner.d.ts.map