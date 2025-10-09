"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDatabaseSchema = validateDatabaseSchema;
const node_fs_1 = require("node:fs");
const path = __importStar(require("node:path"));
const dotenv = __importStar(require("dotenv"));
const envCandidates = ['../../.env.local', '../../.env'];
for (const candidate of envCandidates) {
    const candidatePath = path.join(__dirname, candidate);
    if ((0, node_fs_1.existsSync)(candidatePath)) {
        dotenv.config({ path: candidatePath });
        break;
    }
}
dotenv.config();
const database_js_1 = require("../config/database.js");
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const logger_js_1 = require("../utils/logger.js");
const REQUIRED_TABLES = [
    'achievements',
    'admin_activity_logs',
    'admin_roles',
    'capital_eliminations',
    'conversations',
    'conversation_members',
    'conversation_messages',
    'web_push_subscriptions',
    'users',
    'user_preferences',
    'admin_roles',
    'user_admin_roles',
    'admin_activity_logs',
    'user_account_status',
    'user_bans',
    'user_reports',
    'feature_flags',
    'user_feature_flags',
    'email_verification_logs',
    'password_reset_tokens',
    'notifications',
    'events',
    'friendships',
    'game_rooms',
    'room_players',
    'game_states',
    'game_moves',
    'game_move_archive',
    'game_results',
    'player_game_results',
    'rating_history',
    'game_territory_modifiers',
    'maps',
    'map_versions',
    'map_sectors',
    'map_territories',
    'territory_adjacencies',
    'map_ratings',
    'map_submissions',
    'map_collaborators',
    'map_territory_modifiers',
    'territory_modifier_templates',
    'map_reviews',
    'schema_migrations',
    'skill_leaderboard_cache',
    'user_sessions',
];
const OPTIONAL_TABLES = [
    'map_continents',
    'chat_messages',
    'message_link_previews',
    'message_reactions',
    'unread_message_counts',
    'sessions',
    'ranking_history',
    'active_territory_effects',
    'audit_logs',
    'custom_maps',
    'email_queue',
    'game_analytics',
    'game_history',
    'map_approval_history',
    'map_comments',
    'map_downloads',
    'map_editor_sessions',
    'map_featured_history',
    'map_tags',
    'map_tag_associations',
    'map_test_games',
    'map_usage_stats',
    'player_game_stats',
    'private_messages',
    'territory_events',
    'territory_modifiers',
    'tournament_matches',
    'tournament_participants',
    'tournaments',
    'user_activity',
    'user_behavior_patterns',
    'user_terms_acceptance',
];
function parseCliOptions() {
    const args = process.argv.slice(2);
    const options = {
        format: 'markdown',
        skipValidation: false,
        includeRowCounts: true,
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--export' || arg === '--output') {
            const next = args[index + 1];
            if (next && !next.startsWith('--')) {
                options.exportPath = next;
                index += 1;
            }
            else {
                options.exportPath = '../docs/operations/database-schema.md';
            }
        }
        else if (arg === '--format') {
            const next = args[index + 1];
            if (next && !next.startsWith('--')) {
                if (next !== 'markdown') {
                    throw new Error(`Unsupported export format: ${next}`);
                }
                options.format = 'markdown';
                index += 1;
            }
        }
        else if (arg === '--skip-validation') {
            options.skipValidation = true;
        }
        else if (arg === '--skip-row-counts') {
            options.includeRowCounts = false;
        }
        else if (arg === '--include-row-counts') {
            options.includeRowCounts = true;
        }
    }
    return options;
}
async function checkTable(tableName) {
    try {
        const result = await (0, database_js_1.query)(`SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = $1`, [tableName]);
        if (result.rows[0].count > 0) {
            const countResult = await (0, database_js_1.query)(`SELECT COUNT(*) as count FROM ${tableName}`);
            return {
                table: tableName,
                exists: true,
                rowCount: parseInt(countResult.rows[0].count, 10),
            };
        }
        return {
            table: tableName,
            exists: false,
        };
    }
    catch (error) {
        return {
            table: tableName,
            exists: false,
            error: (0, errorHelpers_js_1.getErrorMessage)(error),
        };
    }
}
async function checkRequiredColumns() {
    const criticalColumns = [
        { table: 'users', columns: ['id', 'username', 'email', 'password_hash'] },
        { table: 'game_rooms', columns: ['id', 'name', 'host_id', 'status'] },
        { table: 'maps', columns: ['id', 'name', 'creator_id'] },
        { table: 'map_versions', columns: ['id', 'map_id', 'version_number'] },
        { table: 'player_game_results', columns: ['room_id', 'user_id', 'is_winner'] },
    ];
    for (const check of criticalColumns) {
        try {
            const result = await (0, database_js_1.query)(`SELECT column_name FROM information_schema.columns 
         WHERE table_name = $1 AND table_schema = 'public'`, [check.table]);
            const existingColumns = result.rows.map((r) => r.column_name);
            const missingColumns = check.columns.filter((col) => !existingColumns.includes(col));
            if (missingColumns.length > 0) {
                logger_js_1.logger.warn(`⚠️  Table ${check.table} missing columns: ${missingColumns.join(', ')}`);
            }
        }
        catch (error) {
            logger_js_1.logger.error(`❌ Error checking columns for ${check.table}:`, error);
        }
    }
}
async function checkMigrationStatus() {
    try {
        const cols = await (0, database_js_1.query)(`SELECT column_name FROM information_schema.columns WHERE table_name = 'schema_migrations' AND table_schema = 'public'`);
        const names = new Set(cols.rows.map((r) => r.column_name));
        if (names.has('version') && names.has('applied_at')) {
            const result = await (0, database_js_1.query)(`SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 5`);
            logger_js_1.logger.info('📋 Recent migrations (legacy tracker):');
            for (const row of result.rows) {
                logger_js_1.logger.info(`  - ${row.version} @ ${new Date(row.applied_at).toLocaleString()}`);
            }
            return;
        }
        const modern = await (0, database_js_1.query)(`SELECT filename, executed_at, status FROM schema_migrations ORDER BY executed_at DESC NULLS LAST, filename DESC LIMIT 5`);
        logger_js_1.logger.info('📋 Recent migrations (modern tracker / baseline):');
        for (const row of modern.rows) {
            logger_js_1.logger.info(`  - ${row.filename} @ ${row.executed_at ? new Date(row.executed_at).toLocaleString() : 'N/A'}${row.status ? ` [${row.status}]` : ''}`);
        }
    }
    catch (_error) {
        logger_js_1.logger.warn('⚠️  Could not check migration status');
    }
}
async function validateDatabaseSchema() {
    logger_js_1.logger.info('🔍 Validating database schema...');
    logger_js_1.logger.info('========================================');
    const results = [];
    let hasErrors = false;
    logger_js_1.logger.info('📊 Checking required tables...');
    for (const table of REQUIRED_TABLES) {
        const result = await checkTable(table);
        results.push(result);
        if (!result.exists) {
            logger_js_1.logger.error(`❌ MISSING: ${table}`);
            hasErrors = true;
        }
        else {
            logger_js_1.logger.info(`✅ ${table} (${result.rowCount} rows)`);
        }
    }
    logger_js_1.logger.info('\n📊 Checking optional tables...');
    for (const table of OPTIONAL_TABLES) {
        const result = await checkTable(table);
        if (result.exists) {
            logger_js_1.logger.info(`✅ ${table} (${result.rowCount} rows)`);
        }
        else {
            logger_js_1.logger.info(`⭕ ${table} (not present - optional)`);
        }
    }
    logger_js_1.logger.info('\n📊 Checking critical columns...');
    await checkRequiredColumns();
    logger_js_1.logger.info('\n📊 Migration status:');
    await checkMigrationStatus();
    logger_js_1.logger.info('\n========================================');
    const missingTables = results.filter((r) => !r.exists);
    const existingTables = results.filter((r) => r.exists);
    logger_js_1.logger.info(`📈 Schema validation summary:`);
    logger_js_1.logger.info(`  ✅ Tables present: ${existingTables.length}/${REQUIRED_TABLES.length}`);
    logger_js_1.logger.info(`  ❌ Tables missing: ${missingTables.length}`);
    logger_js_1.logger.info('\nℹ️ Baseline migrations: This project maintains a single baseline SQL file for fresh databases, plus incremental migrations as needed. If you recently switched to the baseline-only approach, ensure old migration files are removed in your repo after generating the baseline.');
    if (missingTables.length > 0) {
        logger_js_1.logger.error('\n⚠️  Missing tables:');
        for (const table of missingTables) {
            logger_js_1.logger.error(`  - ${table.table}`);
        }
        logger_js_1.logger.error('\n💡 Run migrations to create missing tables:');
        logger_js_1.logger.error('   cd backend && npm run migrate');
    }
    else {
        logger_js_1.logger.info('\n✅ All required tables are present!');
    }
    return !hasErrors;
}
const numberFormatter = new Intl.NumberFormat('en-US');
function quoteIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}
function formatDataType(column) {
    if (column.data_type === 'USER-DEFINED') {
        return column.udt_name;
    }
    if (column.data_type === 'ARRAY') {
        const baseType = column.udt_name.startsWith('_') ? column.udt_name.slice(1) : column.udt_name;
        return `${baseType}[]`;
    }
    if (column.data_type === 'character varying') {
        if (column.character_maximum_length != null) {
            return `varchar(${column.character_maximum_length})`;
        }
        return 'varchar';
    }
    if (column.data_type === 'character') {
        if (column.character_maximum_length != null) {
            return `char(${column.character_maximum_length})`;
        }
        return 'char';
    }
    if (column.data_type === 'numeric') {
        if (column.numeric_precision != null && column.numeric_scale != null) {
            return `numeric(${column.numeric_precision}, ${column.numeric_scale})`;
        }
        if (column.numeric_precision != null) {
            return `numeric(${column.numeric_precision})`;
        }
        return 'numeric';
    }
    if (column.data_type === 'timestamp without time zone') {
        return 'timestamp';
    }
    if (column.data_type === 'timestamp with time zone') {
        return 'timestamptz';
    }
    return column.data_type;
}
function sanitizeDefaultValue(value) {
    if (!value) {
        return null;
    }
    return value.replace(/::[[\]\w\s.]+/g, '');
}
function escapeMarkdown(value) {
    return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
function formatRowCount(rowCount) {
    if (rowCount == null) {
        return '—';
    }
    return numberFormatter.format(rowCount);
}
function extractPostgresVersion(rawVersion) {
    const match = /^PostgreSQL\s+([^\s]+)/i.exec(rawVersion);
    if (match?.[1]) {
        return `PostgreSQL ${match[1]}`;
    }
    return rawVersion;
}
async function getSchemaMetadata() {
    const result = await (0, database_js_1.query)(`SELECT current_database() AS database, current_schema() AS schema, version() AS version`);
    const row = result.rows[0];
    return {
        database: row.database,
        schema: row.schema,
        serverVersion: extractPostgresVersion(row.version),
    };
}
async function getEnumTypes() {
    const result = await (0, database_js_1.query)(`SELECT t.typname AS enum_type, e.enumlabel AS enum_label, e.enumsortorder
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder`);
    const byType = new Map();
    for (const row of result.rows) {
        const arr = byType.get(row.enum_type) ?? [];
        arr.push({ label: row.enum_label, order: row.enumsortorder });
        byType.set(row.enum_type, arr);
    }
    return Array.from(byType.entries()).map(([name, values]) => ({ name, values }));
}
async function getTriggers() {
    const result = await (0, database_js_1.query)(`SELECT t.tgname AS trigger_name, c.relname AS table_name, pg_get_triggerdef(t.oid, true) AS definition
       FROM pg_trigger t
       JOIN pg_class c ON t.tgrelid = c.oid
       JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname`);
    return result.rows.map((row) => ({
        table: row.table_name,
        name: row.trigger_name,
        definition: row.definition,
    }));
}
async function getTableNames() {
    const result = await (0, database_js_1.query)(`SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`);
    return result.rows.map((row) => row.table_name);
}
async function getColumnsForTable(tableName) {
    const result = await (0, database_js_1.query)(`SELECT column_name, data_type, udt_name, is_nullable, column_default,
            character_maximum_length, numeric_precision, numeric_scale, datetime_precision
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`, [tableName]);
    return result.rows.map((row) => ({
        name: row.column_name,
        dataType: formatDataType(row),
        isNullable: row.is_nullable === 'YES',
        defaultValue: sanitizeDefaultValue(row.column_default),
    }));
}
async function getConstraintDetails(tableName) {
    const result = await (0, database_js_1.query)(`SELECT tc.constraint_name, tc.constraint_type, kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.update_rule, rc.delete_rule
       FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
  LEFT JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
  LEFT JOIN information_schema.referential_constraints rc
         ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
      ORDER BY tc.constraint_name, kcu.ordinal_position`, [tableName]);
    const primaryKey = [];
    const uniqueByConstraint = new Map();
    const foreignByConstraint = new Map();
    for (const row of result.rows) {
        if (row.constraint_type === 'PRIMARY KEY' && row.column_name) {
            primaryKey.push(row.column_name);
        }
        if (row.constraint_type === 'UNIQUE' && row.column_name) {
            const columns = uniqueByConstraint.get(row.constraint_name) ?? [];
            columns.push(row.column_name);
            uniqueByConstraint.set(row.constraint_name, columns);
        }
        if (row.constraint_type === 'FOREIGN KEY' &&
            row.column_name &&
            row.foreign_table_name &&
            row.foreign_column_name) {
            const existing = foreignByConstraint.get(row.constraint_name);
            if (existing) {
                existing.columns.push(row.column_name);
                existing.referencedColumns.push(row.foreign_column_name);
            }
            else {
                foreignByConstraint.set(row.constraint_name, {
                    columns: [row.column_name],
                    referencedTable: row.foreign_table_name,
                    referencedColumns: [row.foreign_column_name],
                    updateRule: row.update_rule,
                    deleteRule: row.delete_rule,
                });
            }
        }
    }
    return {
        primaryKey,
        uniqueConstraints: Array.from(uniqueByConstraint.entries()).map(([name, columns]) => ({
            name,
            columns,
        })),
        foreignKeys: Array.from(foreignByConstraint.entries()).map(([name, value]) => ({
            name,
            columns: value.columns,
            referencedTable: value.referencedTable,
            referencedColumns: value.referencedColumns,
            updateRule: value.updateRule,
            deleteRule: value.deleteRule,
        })),
    };
}
async function getCheckConstraints(tableName) {
    const result = await (0, database_js_1.query)(`SELECT con.conname AS name, pg_get_constraintdef(con.oid, true) AS definition
       FROM pg_constraint con
       JOIN pg_class rel ON con.conrelid = rel.oid
       JOIN pg_namespace nsp ON rel.relnamespace = nsp.oid
      WHERE con.contype = 'c'
        AND nsp.nspname = 'public'
        AND rel.relname = $1
      ORDER BY con.conname`, [tableName]);
    return result.rows.map((row) => ({
        name: row.name,
        definition: row.definition,
    }));
}
async function getIndexesForTable(tableName) {
    const result = await (0, database_js_1.query)(`SELECT indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
      ORDER BY indexname`, [tableName]);
    return result.rows.map((row) => ({
        name: row.indexname,
        definition: row.indexdef,
    }));
}
async function getRowCountForTable(tableName) {
    try {
        const result = await (0, database_js_1.query)(`SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier('public')}.${quoteIdentifier(tableName)}`);
        const value = result.rows[0]?.count;
        return value ? Number.parseInt(value, 10) : null;
    }
    catch (error) {
        logger_js_1.logger.warn(`⚠️  Unable to count rows for ${tableName}: ${(0, errorHelpers_js_1.getErrorMessage)(error)}`);
        return null;
    }
}
async function getTableInfos(includeRowCounts) {
    const tableNames = await getTableNames();
    const tables = [];
    for (const tableName of tableNames) {
        const columns = await getColumnsForTable(tableName);
        const constraints = await getConstraintDetails(tableName);
        const checkConstraints = await getCheckConstraints(tableName);
        const indexes = await getIndexesForTable(tableName);
        const rowCount = includeRowCounts ? await getRowCountForTable(tableName) : null;
        tables.push({
            name: tableName,
            columns,
            rowCount,
            primaryKey: constraints.primaryKey,
            uniqueConstraints: constraints.uniqueConstraints,
            foreignKeys: constraints.foreignKeys,
            checkConstraints,
            indexes,
        });
    }
    return tables;
}
function buildTableSummaryMarkdown(table) {
    const lines = [];
    lines.push(`### \`${table.name}\``);
    lines.push('');
    lines.push('| Column | Type | Nullable | Default |');
    lines.push('| --- | --- | --- | --- |');
    for (const column of table.columns) {
        const defaultValue = column.defaultValue ? `\`${escapeMarkdown(column.defaultValue)}\`` : '—';
        lines.push(`| \`${column.name}\` | \`${escapeMarkdown(column.dataType)}\` | ${column.isNullable ? 'Yes' : 'No'} | ${defaultValue} |`);
    }
    lines.push('');
    if (table.primaryKey.length > 0) {
        lines.push(`**Primary key:** \`${table.primaryKey.join('`, `')}\``);
    }
    else {
        lines.push('**Primary key:** —');
    }
    lines.push('');
    lines.push('**Unique constraints:**');
    if (table.uniqueConstraints.length === 0) {
        lines.push('- —');
    }
    else {
        for (const unique of table.uniqueConstraints) {
            lines.push(`- \`${unique.name}\`: \`${unique.columns.join('`, `')}\``);
        }
    }
    lines.push('');
    lines.push('**Foreign keys:**');
    if (table.foreignKeys.length === 0) {
        lines.push('- —');
    }
    else {
        for (const foreignKey of table.foreignKeys) {
            const updateRule = foreignKey.updateRule ? ` ON UPDATE ${foreignKey.updateRule}` : '';
            const deleteRule = foreignKey.deleteRule ? ` ON DELETE ${foreignKey.deleteRule}` : '';
            lines.push(`- \`${foreignKey.name}\`: (\`${foreignKey.columns.join('`, `')}\`) → \`${foreignKey.referencedTable}\` (\`${foreignKey.referencedColumns.join('`, `')}\`)${updateRule}${deleteRule}`);
        }
    }
    lines.push('');
    lines.push('**Check constraints:**');
    if (table.checkConstraints.length === 0) {
        lines.push('- —');
    }
    else {
        for (const constraint of table.checkConstraints) {
            lines.push(`- \`${constraint.name}\`: ${escapeMarkdown(constraint.definition)}`);
        }
    }
    lines.push('');
    lines.push('**Indexes:**');
    if (table.indexes.length === 0) {
        lines.push('- —');
    }
    else {
        for (const index of table.indexes) {
            lines.push(`- \`${index.name}\`: ${escapeMarkdown(index.definition)}`);
        }
    }
    lines.push('');
    return lines;
}
async function exportSchemaCatalog(options) {
    if (options.format !== 'markdown') {
        throw new Error(`Unsupported export format: ${options.format}`);
    }
    const resolvedOutputPath = path.isAbsolute(options.outputPath)
        ? options.outputPath
        : path.resolve(process.cwd(), options.outputPath);
    logger_js_1.logger.info(`📝 Exporting database schema to ${resolvedOutputPath}`);
    const [metadata, tables, enums, triggers] = await Promise.all([
        getSchemaMetadata(),
        getTableInfos(options.includeRowCounts),
        getEnumTypes(),
        getTriggers(),
    ]);
    const generatedAt = new Date();
    const relationships = tables.flatMap((table) => table.foreignKeys.map((foreignKey) => ({
        constraint: foreignKey.name,
        fromTable: table.name,
        fromColumns: foreignKey.columns,
        toTable: foreignKey.referencedTable,
        toColumns: foreignKey.referencedColumns,
        updateRule: foreignKey.updateRule,
        deleteRule: foreignKey.deleteRule,
    })));
    relationships.sort((a, b) => {
        if (a.fromTable === b.fromTable) {
            return a.toTable.localeCompare(b.toTable);
        }
        return a.fromTable.localeCompare(b.fromTable);
    });
    const lines = [];
    lines.push('# ConquestK Database Schema');
    lines.push('');
    lines.push(`Generated on ${generatedAt.toISOString()}`);
    lines.push('');
    lines.push('> This document is generated via `npm run check:schema -- --skip-validation --export ../docs/operations/database-schema.md`. Run the command after any migration changes to keep it current.');
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(`- Database: \`${metadata.database}\``);
    lines.push(`- Schema: \`${metadata.schema}\``);
    lines.push(`- PostgreSQL: ${metadata.serverVersion}`);
    lines.push(`- Tables: ${tables.length}`);
    if (options.includeRowCounts) {
        lines.push('- Row counts reflect the snapshot captured when this file was generated.');
    }
    lines.push('');
    lines.push('## Table Summary');
    lines.push('');
    lines.push('| Table | Columns | Rows |');
    lines.push('| --- | ---: | ---: |');
    for (const table of tables) {
        lines.push(`| \`${table.name}\` | ${table.columns.length} | ${formatRowCount(table.rowCount)} |`);
    }
    if (enums.length > 0) {
        lines.push('');
        lines.push('## Enum Types');
        lines.push('');
        for (const et of enums) {
            lines.push(`### \`${et.name}\``);
            lines.push('');
            lines.push('| Value | Order |');
            lines.push('| --- | ---: |');
            for (const v of et.values) {
                lines.push(`| \`${escapeMarkdown(v.label)}\` | ${v.order} |`);
            }
            lines.push('');
        }
    }
    lines.push('');
    lines.push('## Tables');
    lines.push('');
    for (const table of tables) {
        lines.push(...buildTableSummaryMarkdown(table));
    }
    if (relationships.length > 0) {
        lines.push('## Foreign Key Relationships');
        lines.push('');
        lines.push('| Constraint | From table | Columns | To table | Columns | On Update | On Delete |');
        lines.push('| --- | --- | --- | --- | --- | --- | --- |');
        for (const relationship of relationships) {
            const updateRule = relationship.updateRule ?? '—';
            const deleteRule = relationship.deleteRule ?? '—';
            lines.push(`| \`${relationship.constraint}\` | \`${relationship.fromTable}\` | \`${relationship.fromColumns.join('`, `')}\` | \`${relationship.toTable}\` | \`${relationship.toColumns.join('`, `')}\` | ${updateRule} | ${deleteRule} |`);
        }
        lines.push('');
    }
    if (triggers.length > 0) {
        lines.push('## Triggers');
        lines.push('');
        lines.push('| Trigger | Table | Definition |');
        lines.push('| --- | --- | --- |');
        for (const tg of triggers) {
            lines.push(`| \`${escapeMarkdown(tg.name)}\` | \`${escapeMarkdown(tg.table)}\` | ${escapeMarkdown(tg.definition)} |`);
        }
        lines.push('');
    }
    await node_fs_1.promises.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await node_fs_1.promises.writeFile(resolvedOutputPath, `${lines.join('\n')}\n`, 'utf8');
    logger_js_1.logger.info(`✅ Schema catalog written to ${resolvedOutputPath}`);
}
async function main() {
    const options = parseCliOptions();
    let validationPassed = true;
    if (!options.skipValidation) {
        validationPassed = await validateDatabaseSchema();
        if (validationPassed) {
            logger_js_1.logger.info('✅ Database schema is valid');
        }
        else {
            logger_js_1.logger.error('❌ Database schema validation failed');
        }
    }
    if (options.exportPath) {
        await exportSchemaCatalog({
            format: options.format,
            outputPath: options.exportPath,
            includeRowCounts: options.includeRowCounts,
        });
    }
    if (!options.skipValidation && !validationPassed) {
        process.exitCode = 1;
    }
}
if (require.main === module) {
    main().catch((error) => {
        logger_js_1.logger.error('❌ Schema validation error:', error);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=checkSchema.js.map