"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationTracker = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("./logger.js");
class MigrationTracker {
    constructor() {
        this.trackingTableExists = false;
    }
    resolveStatus(status) {
        if (status === 'completed' || status === 'failed' || status === 'rolled_back') {
            return status;
        }
        return 'pending';
    }
    async createTrackingTable() {
        try {
            const tableCheck = await (0, database_js_1.query)(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'schema_migrations'
        )
      `);
            if (tableCheck.rows[0].exists) {
                await this.upgradeTrackingTable();
                this.trackingTableExists = true;
                logger_js_1.logger.info('✅ Migration tracking table already exists');
                return;
            }
            await (0, database_js_1.query)(`
        CREATE TABLE schema_migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          execution_time_ms INTEGER NOT NULL,
          status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'rolled_back')),
          rollback_sql TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
            await (0, database_js_1.query)('CREATE INDEX idx_schema_migrations_filename ON schema_migrations(filename)');
            await (0, database_js_1.query)('CREATE INDEX idx_schema_migrations_status ON schema_migrations(status)');
            this.trackingTableExists = true;
            logger_js_1.logger.info('✅ Created schema_migrations tracking table');
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to create migration tracking table:', error);
            throw error;
        }
    }
    async upgradeTrackingTable() {
        try {
            logger_js_1.logger.info('🔧 Ensuring schema_migrations table matches current layout');
            const columnQuery = await (0, database_js_1.query)(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
      `);
            const columns = new Set(columnQuery.rows.map((row) => row.column_name));
            const statements = [];
            if (!columns.has('checksum')) {
                statements.push('ALTER TABLE schema_migrations ADD COLUMN checksum VARCHAR(64)');
            }
            if (!columns.has('execution_time_ms')) {
                statements.push('ALTER TABLE schema_migrations ADD COLUMN execution_time_ms INTEGER');
            }
            if (!columns.has('rollback_sql')) {
                statements.push('ALTER TABLE schema_migrations ADD COLUMN rollback_sql TEXT');
            }
            if (!columns.has('created_at')) {
                statements.push('ALTER TABLE schema_migrations ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
            }
            for (const statement of statements) {
                await (0, database_js_1.query)(statement);
            }
            await (0, database_js_1.query)("UPDATE schema_migrations SET checksum = COALESCE(checksum, 'legacy-manual-import')");
            await (0, database_js_1.query)('UPDATE schema_migrations SET execution_time_ms = COALESCE(execution_time_ms, 0)');
            await (0, database_js_1.query)('UPDATE schema_migrations SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)');
            await (0, database_js_1.query)('ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL');
            await (0, database_js_1.query)('ALTER TABLE schema_migrations ALTER COLUMN execution_time_ms SET NOT NULL');
            await (0, database_js_1.query)('ALTER TABLE schema_migrations ALTER COLUMN created_at SET NOT NULL');
            await (0, database_js_1.query)('ALTER TABLE schema_migrations DROP CONSTRAINT IF EXISTS migration_status_check');
            await (0, database_js_1.query)("ALTER TABLE schema_migrations ADD CONSTRAINT migration_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back'))");
            await (0, database_js_1.query)('CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations(filename)');
            await (0, database_js_1.query)('CREATE INDEX IF NOT EXISTS idx_schema_migrations_status ON schema_migrations(status)');
            logger_js_1.logger.info('✅ schema_migrations table is compatible with the modern migration runner');
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to upgrade schema_migrations table:', error);
            throw error;
        }
    }
    async getAppliedMigrations() {
        if (!this.trackingTableExists) {
            await this.createTrackingTable();
        }
        try {
            const columnCheck = await (0, database_js_1.query)(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'schema_migrations' 
        AND column_name IN ('filename', 'version')
      `);
            const hasFilename = columnCheck.rows.some((row) => row.column_name === 'filename');
            const hasVersion = columnCheck.rows.some((row) => row.column_name === 'version');
            if (hasFilename) {
                const result = await (0, database_js_1.query)(`
          SELECT filename 
          FROM schema_migrations 
          WHERE status = 'completed' 
          ORDER BY executed_at ASC
        `);
                return result.rows.map((row) => row.filename);
            }
            if (hasVersion) {
                const result = await (0, database_js_1.query)(`
          SELECT version 
          FROM schema_migrations 
          ORDER BY applied_at ASC
        `);
                return result.rows.map((row) => {
                    const version = row.version;
                    if (version === '001' || version === '001_complete_schema') {
                        return '001_complete_schema.sql';
                    }
                    if (version === '002') {
                        return '002_add_missing_tables.sql';
                    }
                    if (version === '003') {
                        return '003_complete_missing_tables.sql';
                    }
                    return `${version}.sql`;
                });
            }
            return [];
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to get applied migrations:', error);
            return [];
        }
    }
    async markMigrationCompleted(record) {
        if (!this.trackingTableExists) {
            await this.createTrackingTable();
        }
        try {
            const columnCheck = await (0, database_js_1.query)(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'schema_migrations' 
        AND column_name IN ('filename', 'version')
      `);
            const hasFilename = columnCheck.rows.some((row) => row.column_name === 'filename');
            if (hasFilename) {
                await (0, database_js_1.query)(`
          INSERT INTO schema_migrations (filename, checksum, executed_at, execution_time_ms, status, rollback_sql)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (filename) 
          DO UPDATE SET 
            checksum = EXCLUDED.checksum,
          executed_at = EXCLUDED.executed_at,
          execution_time_ms = EXCLUDED.execution_time_ms,
          status = EXCLUDED.status,
          rollback_sql = EXCLUDED.rollback_sql
      `, [
                    record.filename,
                    record.checksum,
                    record.executed_at,
                    record.execution_time_ms,
                    record.status,
                    record.rollback_sql,
                ]);
                logger_js_1.logger.debug(`✅ Marked migration as ${record.status}: ${record.filename}`);
            }
            else {
                const version = record.filename.replace('.sql', '').split('_')[0];
                await (0, database_js_1.query)(`
          INSERT INTO schema_migrations (version, applied_at)
          VALUES ($1, $2)
          ON CONFLICT (version) DO NOTHING
          `, [version, record.executed_at]);
                logger_js_1.logger.debug(`✅ Marked migration as completed: ${version}`);
            }
        }
        catch (error) {
            logger_js_1.logger.error(`❌ Failed to mark migration ${record.filename}:`, error);
            throw error;
        }
    }
    async getMigrationStatus(filename) {
        if (!this.trackingTableExists) {
            await this.createTrackingTable();
        }
        try {
            const result = await (0, database_js_1.query)(`
        SELECT filename, status, executed_at, execution_time_ms
        FROM schema_migrations 
        WHERE filename = $1
      `, [filename]);
            if (result.rows.length === 0) {
                return { filename, status: 'pending' };
            }
            const row = result.rows[0];
            return {
                filename: row.filename,
                status: row.status,
                executed_at: row.executed_at,
                execution_time_ms: row.execution_time_ms,
            };
        }
        catch (error) {
            logger_js_1.logger.error(`❌ Failed to get migration status for ${filename}:`, error);
            return { filename, status: 'pending' };
        }
    }
    async validateMigrationIntegrity(filename) {
        try {
            const migrationPath = (0, node_path_1.join)(__dirname, '../../migrations', filename);
            const migrationContent = (0, node_fs_1.readFileSync)(migrationPath, 'utf8');
            const currentChecksum = this.calculateChecksum(migrationContent);
            const status = await this.getMigrationStatus(filename);
            if (!status || status.status === 'pending') {
                return true;
            }
            if (status.status === 'failed') {
                logger_js_1.logger.info(`🔄 Allowing re-run of failed migration with updated content: ${filename}`);
                return true;
            }
            const result = await (0, database_js_1.query)(`
        SELECT checksum FROM schema_migrations WHERE filename = $1
      `, [filename]);
            if (result.rows.length === 0) {
                return true;
            }
            const storedChecksum = result.rows[0].checksum;
            const isValid = currentChecksum === storedChecksum;
            if (!isValid) {
                logger_js_1.logger.error(`❌ Migration integrity violation: ${filename}`);
                logger_js_1.logger.error(`   Stored checksum:  ${storedChecksum}`);
                logger_js_1.logger.error(`   Current checksum: ${currentChecksum}`);
            }
            return isValid;
        }
        catch (error) {
            logger_js_1.logger.error(`❌ Failed to validate migration integrity for ${filename}:`, error);
            return false;
        }
    }
    calculateChecksum(content) {
        return node_crypto_1.default.createHash('sha256').update(content.trim()).digest('hex').substring(0, 16);
    }
    async getAllMigrationStatuses() {
        if (!this.trackingTableExists) {
            await this.createTrackingTable();
        }
        try {
            const result = await (0, database_js_1.query)(`
        SELECT filename, status, executed_at, execution_time_ms
        FROM schema_migrations 
        ORDER BY executed_at ASC
      `);
            return result.rows.map((row) => ({
                filename: row.filename,
                status: this.resolveStatus(row.status),
                executed_at: row.executed_at ?? undefined,
                execution_time_ms: row.execution_time_ms ?? undefined,
            }));
        }
        catch (error) {
            logger_js_1.logger.error('❌ Failed to get all migration statuses:', error);
            return [];
        }
    }
    async rollbackMigration(filename) {
        try {
            const result = await (0, database_js_1.query)(`
        SELECT rollback_sql FROM schema_migrations 
        WHERE filename = $1 AND status = 'completed'
      `, [filename]);
            if (result.rows.length === 0) {
                throw new Error(`No completed migration found for rollback: ${filename}`);
            }
            const rollbackSql = result.rows[0].rollback_sql;
            if (!rollbackSql) {
                throw new Error(`No rollback SQL available for migration: ${filename}`);
            }
            await (0, database_js_1.query)(rollbackSql);
            await (0, database_js_1.query)(`
        UPDATE schema_migrations 
        SET status = 'rolled_back', executed_at = CURRENT_TIMESTAMP
        WHERE filename = $1
      `, [filename]);
            logger_js_1.logger.info(`✅ Rolled back migration: ${filename}`);
        }
        catch (error) {
            logger_js_1.logger.error(`❌ Failed to rollback migration ${filename}:`, error);
            throw error;
        }
    }
}
exports.MigrationTracker = MigrationTracker;
//# sourceMappingURL=migrationTracker.js.map