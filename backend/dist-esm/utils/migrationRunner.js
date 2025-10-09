"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationRunner = void 0;
exports.runMigrations = runMigrations;
exports.runMigration = runMigration;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("./logger.js");
const migrationTracker_js_1 = require("./migrationTracker.js");
class MigrationRunner {
    constructor(migrationTracker) {
        this.migrationsPath = '';
        this.migrationTracker = migrationTracker || new migrationTracker_js_1.MigrationTracker();
        const rawPaths = [
            '/app/backend/dist/migrations',
            '/app/backend/migrations',
            '/app/migrations',
            (0, node_path_1.join)(__dirname, '../migrations'),
            (0, node_path_1.join)(__dirname, '../../migrations'),
            (0, node_path_1.join)(process.cwd(), 'migrations'),
            (0, node_path_1.join)(process.cwd(), 'backend/migrations'),
        ];
        const possiblePaths = Array.from(new Set(rawPaths));
        if (process.env.STARTUP_VERBOSE === 'true' ||
            (process.env.LOG_LEVEL || '').toLowerCase() === 'debug') {
            logger_js_1.logger.debug('📁 Checking migration paths:');
            possiblePaths.forEach((path, index) => {
                const exists = (0, node_fs_1.existsSync)(path);
                logger_js_1.logger.debug(`  ${index + 1}. ${path} - ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
            });
        }
        else if (!MigrationRunner.didLogPathScan) {
            logger_js_1.logger.debug('📁 Scanning for migrations (paths deduplicated)');
            MigrationRunner.didLogPathScan = true;
        }
        let foundPath = false;
        for (const path of possiblePaths) {
            if ((0, node_fs_1.existsSync)(path)) {
                this.migrationsPath = path;
                try {
                    const files = (0, node_fs_1.readdirSync)(path).filter((f) => f.endsWith('.sql'));
                    logger_js_1.logger.debug(`✅ Found migrations at: ${this.migrationsPath}`);
                    logger_js_1.logger.debug(`  ✓ Contains ${files.length} SQL files: ${files.join(', ')}`);
                    foundPath = true;
                    break;
                }
                catch (err) {
                    logger_js_1.logger.debug(`⚠️  Could not read directory ${path}: ${err}`);
                }
            }
        }
        if (!foundPath) {
            logger_js_1.logger.error(`❌ Migrations directory not found in any of the checked paths`);
            this.migrationsPath = (0, node_path_1.join)(__dirname, '../migrations');
            logger_js_1.logger.warn(`⚠️  Using fallback path: ${this.migrationsPath}`);
        }
    }
    async runPendingMigrations() {
        try {
            logger_js_1.logger.info('🔄 Starting migration system...');
            await this.migrationTracker.createTrackingTable();
            await this.ensureLegacyCompatibility();
            const availableMigrations = this.getAvailableMigrations();
            const appliedMigrations = await this.migrationTracker.getAppliedMigrations();
            let pendingMigrations = availableMigrations.filter((migration) => !appliedMigrations.includes(migration));
            const baselineFiles = pendingMigrations.filter((m) => /^001_.*(baseline|complete|initial).*\.sql$/i.test(m));
            if (baselineFiles.length > 0) {
                for (const baseline of baselineFiles) {
                    try {
                        const fsPath = (0, node_path_1.join)(this.migrationsPath, baseline);
                        const content = (0, node_fs_1.readFileSync)(fsPath, 'utf8');
                        const checksum = this.migrationTracker.calculateChecksum(content);
                        await this.migrationTracker.markMigrationCompleted({
                            filename: baseline,
                            checksum,
                            executed_at: new Date(),
                            execution_time_ms: 0,
                            status: 'completed',
                            rollback_sql: '-- baseline marker only; no rollback',
                        });
                        logger_js_1.logger.warn(`⏭️  Skipped baseline migration and marked completed: ${baseline}`);
                    }
                    catch (e) {
                        logger_js_1.logger.error(`❌ Failed to mark baseline as completed: ${baseline}`, e);
                    }
                }
                pendingMigrations = pendingMigrations.filter((m) => !baselineFiles.includes(m));
            }
            const keyTablesExist = await this.checkKeyTablesExist();
            if (!keyTablesExist && pendingMigrations.length === 0) {
                logger_js_1.logger.warn('⚠️  Key tables missing despite migrations marked as complete');
                logger_js_1.logger.info('🔄 Re-running initial schema migration to create missing tables...');
                const initialSchema = availableMigrations.find((m) => m === '001_initial_schema.sql');
                if (initialSchema) {
                    pendingMigrations = [initialSchema];
                    try {
                        await (0, database_js_1.query)(`
              DELETE FROM schema_migrations 
              WHERE filename = $1
            `, [initialSchema]);
                        logger_js_1.logger.info('🗑️  Cleared migration record for re-run');
                    }
                    catch (_err) {
                        logger_js_1.logger.warn('⚠️  Could not clear migration record, will attempt to run anyway');
                    }
                }
            }
            if (pendingMigrations.length === 0) {
                logger_js_1.logger.info('✅ All migrations are up to date');
                return;
            }
            logger_js_1.logger.info(`📋 Found ${pendingMigrations.length} pending migrations:`, pendingMigrations.map((m) => `  - ${m}`).join('\n'));
            for (const migrationFile of pendingMigrations) {
                await this.runSingleMigration(migrationFile);
            }
            logger_js_1.logger.info('🎯 All pending migrations completed successfully');
        }
        catch (error) {
            logger_js_1.logger.error('❌ Migration system failed:', error);
            throw error;
        }
    }
    async ensureLegacyCompatibility() {
        try {
            logger_js_1.logger.info('🧩 Checking legacy compatibility shims before running migrations');
            await (0, database_js_1.query)('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
            await (0, database_js_1.query)('CREATE EXTENSION IF NOT EXISTS citext');
            await (0, database_js_1.query)('CREATE EXTENSION IF NOT EXISTS pg_trgm');
            const gamesExistsResult = await (0, database_js_1.query)(`SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'games'
         ) AS exists`);
            const gamesExists = Boolean(gamesExistsResult.rows[0]?.exists);
            if (gamesExists) {
                logger_js_1.logger.info('  ✅ games table present (legacy) — leaving as-is');
            }
            else {
                logger_js_1.logger.info('  ℹ️ games table missing — skipping legacy compatibility shim (deprecated)');
            }
        }
        catch (error) {
            logger_js_1.logger.error('  ❌ Failed to prepare legacy compatibility tables', error);
            throw error;
        }
        const clanRolesTable = await (0, database_js_1.query)(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'clan_roles'
      ) AS exists
    `);
        const clanRolesExists = Boolean(clanRolesTable.rows[0]?.exists);
        if (clanRolesExists) {
            const clanRolesIndex = await (0, database_js_1.query)(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'clan_roles'
            AND indexname = 'idx_clan_roles_clan_id_lower_name'
        ) AS exists
      `);
            const clanRolesIndexExists = Boolean(clanRolesIndex.rows[0]?.exists);
            if (!clanRolesIndexExists) {
                logger_js_1.logger.info('  🔐 Backfilling case-insensitive uniqueness for clan role names (idx_clan_roles_clan_id_lower_name)');
                await (0, database_js_1.query)(`
          CREATE UNIQUE INDEX idx_clan_roles_clan_id_lower_name
          ON clan_roles (clan_id, LOWER(name))
        `);
            }
            else {
                logger_js_1.logger.info('  ✅ Case-insensitive clan role name index already present');
            }
        }
        const approvalTable = await (0, database_js_1.query)(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'map_approval_requests'
      ) AS exists
    `);
        const approvalExists = Boolean(approvalTable.rows[0]?.exists);
        if (!approvalExists) {
            const mapVersionsExistsRes = await (0, database_js_1.query)(`SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'map_versions'
         ) AS exists`);
            const usersExistsRes = await (0, database_js_1.query)(`SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'users'
         ) AS exists`);
            const mapVersionsExists = Boolean(mapVersionsExistsRes.rows[0]?.exists);
            const usersExists = Boolean(usersExistsRes.rows[0]?.exists);
            if (!mapVersionsExists || !usersExists) {
                logger_js_1.logger.info('  ℹ️ Skipping compatibility map_approval_requests creation (missing prerequisites: map_versions/users). Baseline will create full schema.');
                return;
            }
            logger_js_1.logger.warn('  ⚠️ map_approval_requests table missing — creating compatibility table');
            await (0, database_js_1.query)(`
        CREATE TABLE map_approval_requests (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          version_id UUID NOT NULL REFERENCES map_versions(id) ON DELETE CASCADE,
          requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          assigned_moderator_id UUID REFERENCES users(id) ON DELETE SET NULL,
          submission_notes TEXT,
          priority_level VARCHAR(20) NOT NULL DEFAULT 'normal',
          estimated_review_time INTEGER,
          review_started_at TIMESTAMP WITH TIME ZONE,
          review_completed_at TIMESTAMP WITH TIME ZONE,
          decision VARCHAR(32),
          moderator_feedback TEXT,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
            await (0, database_js_1.query)(`
        CREATE INDEX idx_map_approval_requests_version
        ON map_approval_requests(version_id)
      `);
            await (0, database_js_1.query)(`
        CREATE INDEX idx_map_approval_requests_requester
        ON map_approval_requests(requester_id)
      `);
            await (0, database_js_1.query)(`
        CREATE INDEX idx_map_approval_requests_decision
        ON map_approval_requests(decision)
      `);
            await (0, database_js_1.query)(`
        CREATE OR REPLACE FUNCTION update_map_approval_requests_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
            await (0, database_js_1.query)('DROP TRIGGER IF EXISTS trg_map_approval_requests_updated_at ON map_approval_requests');
            await (0, database_js_1.query)(`
        CREATE TRIGGER trg_map_approval_requests_updated_at
        BEFORE UPDATE ON map_approval_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_map_approval_requests_updated_at()
      `);
            logger_js_1.logger.info('  ✅ Created compatibility map_approval_requests table');
        }
    }
    async runSingleMigration(migrationFile) {
        const startTime = Date.now();
        let migrationSQL;
        try {
            const isValid = await this.migrationTracker.validateMigrationIntegrity(migrationFile);
            if (!isValid) {
                throw new Error(`Migration integrity check failed: ${migrationFile}`);
            }
            const migrationPath = (0, node_path_1.join)(this.migrationsPath, migrationFile);
            const originalSQL = (0, node_fs_1.readFileSync)(migrationPath, 'utf8');
            logger_js_1.logger.info(`📄 Processing migration: ${migrationFile}`);
            logger_js_1.logger.info(`  Original SQL length: ${originalSQL.length} characters`);
            logger_js_1.logger.info(`  Contains legacy UUID patterns: ${originalSQL.includes('randomblob') ? 'YES' : 'NO'}`);
            logger_js_1.logger.info(`  Contains TEXT PRIMARY KEY: ${originalSQL.includes('TEXT PRIMARY KEY') ? 'YES' : 'NO'}`);
            migrationSQL = this.convertLegacyToPostgreSQL(originalSQL);
            logger_js_1.logger.info(`  Converted SQL length: ${migrationSQL.length} characters`);
            logger_js_1.logger.info(`  UUID conversions applied: ${originalSQL !== migrationSQL ? 'YES' : 'NO'}`);
            if (originalSQL !== migrationSQL) {
                const preview = migrationSQL.substring(0, 500).replace(/\n/g, ' ');
                logger_js_1.logger.info(`  Converted SQL preview: ${preview}...`);
            }
            logger_js_1.logger.info(`🔧 Executing migration: ${migrationFile}`);
            await this.executeInTransaction(migrationSQL, migrationFile);
            const executionTime = Date.now() - startTime;
            const checksum = this.migrationTracker.calculateChecksum(migrationSQL);
            const record = {
                filename: migrationFile,
                checksum,
                executed_at: new Date(),
                execution_time_ms: executionTime,
                status: 'completed',
                rollback_sql: this.generateRollbackHints(migrationSQL),
            };
            await this.migrationTracker.markMigrationCompleted(record);
            logger_js_1.logger.info(`✅ Migration completed: ${migrationFile} (${executionTime}ms)`);
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            logger_js_1.logger.error(`❌ Migration failed: ${migrationFile}`, error);
            try {
                const checksum = migrationSQL
                    ? this.migrationTracker.calculateChecksum(migrationSQL)
                    : 'unknown';
                const record = {
                    filename: migrationFile,
                    checksum,
                    executed_at: new Date(),
                    execution_time_ms: executionTime,
                    status: 'failed',
                };
                await this.migrationTracker.markMigrationCompleted(record);
            }
            catch (trackingError) {
                logger_js_1.logger.error('❌ Failed to record migration failure:', trackingError);
            }
            throw error;
        }
    }
    getAvailableMigrations() {
        try {
            logger_js_1.logger.debug(`📁 Checking migration files in: ${this.migrationsPath}`);
            if (!(0, node_fs_1.existsSync)(this.migrationsPath)) {
                logger_js_1.logger.warn(`⚠️  Migrations directory not found: ${this.migrationsPath}`);
                return [];
            }
            const allFiles = (0, node_fs_1.readdirSync)(this.migrationsPath);
            logger_js_1.logger.debug(`  Found ${allFiles.length} total files: ${allFiles.join(', ')}`);
            const sqlFiles = allFiles
                .filter((file) => file.endsWith('.sql') && !file.includes('_mysql') && !file.includes('_sqlite'))
                .sort();
            logger_js_1.logger.debug(`  ✅ Found ${sqlFiles.length} migration files: ${sqlFiles.join(', ')}`);
            return sqlFiles;
        }
        catch (error) {
            logger_js_1.logger.error(`❌ Failed to read migrations directory ${this.migrationsPath}:`, error);
            return [];
        }
    }
    convertLegacyToPostgreSQL(migrationSQL) {
        let convertedSQL = migrationSQL;
        const legacyUuidV4Regex = /DEFAULT \(lower\(hex\(randomblob\(4\)\)\) \|\| '-' \|\| lower\(hex\(randomblob\(2\)\)\) \|\| '-4' \|\| substr\(lower\(hex\(randomblob\(2\)\)\),2\) \|\| '-' \|\| substr\('ab89',1\+abs\(random\(\)\)%4,1\) \|\| substr\(lower\(hex\(randomblob\(2\)\)\),2\) \|\| '-' \|\| lower\(hex\(randomblob\(6\)\)\)\)/g;
        convertedSQL = convertedSQL.replace(legacyUuidV4Regex, 'DEFAULT uuid_generate_v4()');
        const legacySimpleUuidRegex = /DEFAULT \(lower\(hex\(randomblob\(16\)\)\)\)/g;
        convertedSQL = convertedSQL.replace(legacySimpleUuidRegex, 'DEFAULT uuid_generate_v4()');
        convertedSQL = convertedSQL.replace(/(\w+) TEXT PRIMARY KEY DEFAULT uuid_generate_v4\(\)/g, '$1 UUID PRIMARY KEY DEFAULT uuid_generate_v4()');
        convertedSQL = convertedSQL.replace(/(\w+) TEXT PRIMARY KEY(?! DEFAULT)/g, '$1 UUID PRIMARY KEY DEFAULT uuid_generate_v4()');
        convertedSQL = convertedSQL.replace(/user_id TEXT/g, 'user_id UUID');
        convertedSQL = convertedSQL.replace(/creator_id TEXT/g, 'creator_id UUID');
        convertedSQL = convertedSQL.replace(/room_id TEXT/g, 'room_id UUID');
        convertedSQL = convertedSQL.replace(/game_state_id TEXT/g, 'game_state_id UUID');
        convertedSQL = convertedSQL.replace(/map_id TEXT/g, 'map_id UUID');
        convertedSQL = convertedSQL.replace(/game_mode_id TEXT/g, 'game_mode_id UUID');
        convertedSQL = convertedSQL.replace(/continent_id TEXT/g, 'continent_id UUID');
        convertedSQL = convertedSQL.replace(/ability_type_id TEXT/g, 'ability_type_id UUID');
        convertedSQL = convertedSQL.replace(/from_territory_id TEXT/g, 'from_territory_id UUID');
        convertedSQL = convertedSQL.replace(/to_territory_id TEXT/g, 'to_territory_id UUID');
        convertedSQL = convertedSQL.replace(/AUTOINCREMENT/g, '');
        convertedSQL = convertedSQL.replace(/DATETIME/g, 'TIMESTAMP');
        convertedSQL = convertedSQL.replace(/TEXT DEFAULT '\[\]'/g, "JSONB DEFAULT '[]'");
        convertedSQL = convertedSQL.replace(/TEXT DEFAULT '\{\}'/g, "JSONB DEFAULT '{}'");
        convertedSQL = convertedSQL.replace(/INSERT OR IGNORE/g, 'INSERT');
        if (convertedSQL.includes('INSERT INTO game_modes') ||
            convertedSQL.includes('INSERT INTO territory_ability_types') ||
            convertedSQL.includes('INSERT INTO map_status')) {
            convertedSQL = convertedSQL.replace(/(INSERT INTO (?:game_modes|territory_ability_types|map_status)[^;]+);/g, '$1 ON CONFLICT DO NOTHING;');
        }
        convertedSQL = convertedSQL.replace('CONSTRAINT clan_roles_name_unique UNIQUE (clan_id, LOWER(name))', 'CONSTRAINT clan_roles_name_unique UNIQUE (clan_id, name)');
        return convertedSQL;
    }
    async executeInTransaction(migrationSQL, _migrationFile) {
        await (0, database_js_1.query)('BEGIN');
        try {
            logger_js_1.logger.info('  Enabling uuid-ossp extension...');
            await (0, database_js_1.query)('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
            const statements = this.splitMigrationStatements(migrationSQL);
            logger_js_1.logger.info(`  Migration contains ${statements.length} SQL statements`);
            let statementCount = 0;
            for (const statement of statements) {
                if (statement.trim()) {
                    statementCount++;
                    const statementPreview = statement.substring(0, 100).replace(/\n/g, ' ');
                    try {
                        logger_js_1.logger.debug(`  Executing statement ${statementCount}/${statements.length}: ${statementPreview}...`);
                        await (0, database_js_1.query)(statement);
                    }
                    catch (error) {
                        const { message: errorMessage, code: errorCode } = this.extractErrorDetails(error);
                        if (this.isAcceptableError(errorMessage, statement)) {
                            logger_js_1.logger.debug(`  ⏭️  Skipped expected error: ${errorMessage}`);
                            continue;
                        }
                        logger_js_1.logger.error(`  ❌ Statement ${statementCount} failed:`);
                        logger_js_1.logger.error(`     Error code: ${errorCode}`);
                        logger_js_1.logger.error(`     Error message: ${errorMessage}`);
                        logger_js_1.logger.error(`     Statement preview: ${statementPreview}`);
                        logger_js_1.logger.error(`     Full statement (first 500 chars): ${statement.substring(0, 500)}`);
                        const msg = errorMessage.toLowerCase();
                        const looksLikeDollarQuoteIssue = msg.includes('unterminated dollar-quoted string') ||
                            msg.includes('syntax error at or near "$$"') ||
                            /syntax error at or near "\$[a-z_][a-z0-9_]*\$"/i.test(errorMessage);
                        if (looksLikeDollarQuoteIssue) {
                            try {
                                logger_js_1.logger.warn('  ⚠️  Detected dollar-quote parsing issue. Falling back to whole-script execution');
                                await (0, database_js_1.query)('ROLLBACK');
                                await (0, database_js_1.query)('BEGIN');
                                await (0, database_js_1.query)('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
                                await (0, database_js_1.query)(migrationSQL);
                                await (0, database_js_1.query)('COMMIT');
                                logger_js_1.logger.info('  ✅ Whole-script execution succeeded after parser fallback');
                                return;
                            }
                            catch (fallbackErr) {
                                logger_js_1.logger.error('  ❌ Fallback whole-script execution failed:', fallbackErr);
                                throw error;
                            }
                        }
                        throw error;
                    }
                }
            }
            await (0, database_js_1.query)('COMMIT');
        }
        catch (error) {
            await (0, database_js_1.query)('ROLLBACK');
            throw error;
        }
    }
    splitMigrationStatements(migrationSQL) {
        const statements = [];
        let currentStatement = '';
        let inFunction = false;
        let inDoBlock = false;
        let dollarQuoteCount = 0;
        let pendingDoStart = false;
        const lines = migrationSQL.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            const upper = trimmedLine.toUpperCase();
            const dollarMatches = line.match(/\$\$|\$[a-zA-Z_][a-zA-Z0-9_]*\$/g);
            if (dollarMatches) {
                dollarQuoteCount += dollarMatches.length;
            }
            if (!inDoBlock &&
                (upper.includes('CREATE FUNCTION') || upper.includes('CREATE OR REPLACE FUNCTION'))) {
                inFunction = true;
                pendingDoStart = false;
            }
            if (!inFunction && !inDoBlock) {
                if (/^DO\b/i.test(trimmedLine)) {
                    if (/\$(?:\$|[A-Za-z_][A-Za-z0-9_]*)\$/.test(trimmedLine)) {
                        inDoBlock = true;
                        pendingDoStart = false;
                    }
                    else {
                        pendingDoStart = true;
                    }
                }
                else if (pendingDoStart) {
                    if (/\$(?:\$|[A-Za-z_][A-Za-z0-9_]*)\$/.test(trimmedLine)) {
                        inDoBlock = true;
                        pendingDoStart = false;
                    }
                    else if (trimmedLine &&
                        !trimmedLine.startsWith('--') &&
                        !trimmedLine.startsWith('/*')) {
                        pendingDoStart = false;
                    }
                }
            }
            currentStatement += `${line}\n`;
            if (trimmedLine.endsWith(';')) {
                const insideDollar = dollarQuoteCount % 2 !== 0;
                if (inFunction) {
                    if (!insideDollar) {
                        statements.push(currentStatement.trim());
                        currentStatement = '';
                        inFunction = false;
                        dollarQuoteCount = 0;
                    }
                }
                else if (inDoBlock) {
                    if (!insideDollar) {
                        statements.push(currentStatement.trim());
                        currentStatement = '';
                        inDoBlock = false;
                        dollarQuoteCount = 0;
                        pendingDoStart = false;
                    }
                }
                else if (!insideDollar) {
                    statements.push(currentStatement.trim());
                    currentStatement = '';
                    pendingDoStart = false;
                }
            }
        }
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }
        return statements;
    }
    isAcceptableError(errorMessage, statement) {
        const acceptableErrors = [
            'already exists',
            'duplicate key',
            'duplicate column',
            'relation already exists',
            'index already exists',
            'constraint already exists',
            'extension "uuid-ossp" already exists',
            'column already exists',
            'table already exists',
        ];
        const acceptableStatements = [
            'CREATE TABLE IF NOT EXISTS',
            'CREATE INDEX IF NOT EXISTS',
            'INSERT',
            'ALTER TABLE',
            'DROP TABLE IF EXISTS',
            'CREATE EXTENSION IF NOT EXISTS',
            'CREATE OR REPLACE FUNCTION',
        ];
        const hasAcceptableError = acceptableErrors.some((error) => errorMessage.toLowerCase().includes(error));
        const hasAcceptableStatement = acceptableStatements.some((stmt) => statement.toUpperCase().includes(stmt));
        return hasAcceptableError || hasAcceptableStatement;
    }
    generateRollbackHints(migrationSQL) {
        const hints = [];
        const lines = migrationSQL.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim().toUpperCase();
            if (trimmedLine.startsWith('CREATE TABLE')) {
                const match = trimmedLine.match(/CREATE TABLE (?:IF NOT EXISTS )?([\\w_]+)/);
                if (match) {
                    hints.push(`-- DROP TABLE IF EXISTS ${match[1]};`);
                }
            }
            else if (trimmedLine.startsWith('ALTER TABLE') && trimmedLine.includes('ADD COLUMN')) {
                const tableMatch = trimmedLine.match(/ALTER TABLE ([\\w_]+)/);
                const columnMatch = trimmedLine.match(/ADD COLUMN ([\\w_]+)/);
                if (tableMatch && columnMatch) {
                    hints.push(`-- ALTER TABLE ${tableMatch[1]} DROP COLUMN IF EXISTS ${columnMatch[1]};`);
                }
            }
        }
        return hints.join('\n');
    }
    async checkKeyTablesExist() {
        try {
            const keyTables = ['users', 'maps', 'game_rooms', 'game_states', 'user_admin_roles'];
            for (const tableName of keyTables) {
                const result = await (0, database_js_1.query)(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [tableName]);
                if (!result.rows[0].exists) {
                    logger_js_1.logger.warn(`⚠️  Key table missing: ${tableName}`);
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error checking key tables:', error);
            return false;
        }
    }
    async validateSchemaIntegrity() {
        try {
            const keyTables = ['users', 'game_rooms', 'game_states', 'maps', 'user_admin_roles'];
            for (const tableName of keyTables) {
                const result = await (0, database_js_1.query)(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [tableName]);
                if (!result.rows[0].exists) {
                    logger_js_1.logger.error(`❌ Schema validation failed: Missing table ${tableName}`);
                    return false;
                }
            }
            logger_js_1.logger.info('✅ Schema integrity validation passed');
            return true;
        }
        catch (error) {
            logger_js_1.logger.error('❌ Schema integrity validation failed:', error);
            return false;
        }
    }
    extractErrorDetails(error) {
        const message = error instanceof Error ? error.message : String(error);
        if (typeof error === 'object' && error !== null && 'code' in error) {
            const codeValue = error.code;
            if (typeof codeValue === 'string') {
                return { message, code: codeValue };
            }
        }
        return { message, code: '' };
    }
    async getMigrationStatus() {
        return await this.migrationTracker.getAllMigrationStatuses();
    }
}
exports.MigrationRunner = MigrationRunner;
MigrationRunner.didLogPathScan = false;
async function runMigrations() {
    logger_js_1.logger.warn('⚠️  Using legacy runMigrations - consider using MigrationRunner class');
    const migrationRunner = new MigrationRunner();
    await migrationRunner.runPendingMigrations();
}
async function runMigration(migrationFile) {
    logger_js_1.logger.warn(`⚠️  Using legacy runMigration for ${migrationFile} - consider using MigrationRunner class`);
    const migrationRunner = new MigrationRunner();
    await migrationRunner.runSingleMigration(migrationFile);
}
//# sourceMappingURL=migrationRunner.js.map