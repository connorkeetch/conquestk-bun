import { existsSync, promises as fsPromises } from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'

// Load environment variables before importing database configuration.
// Prefer local overrides, then project defaults, and finally fall back to
// development credentials so the script works out of the box.
const envCandidates = ['../../.env.local', '../../.env', '../../.env.development']
for (const candidate of envCandidates) {
  const candidatePath = path.join(__dirname, candidate)
  if (existsSync(candidatePath)) {
    dotenv.config({ path: candidatePath })
    break
  }
}
// Allow environment variables that are already defined (e.g. CI) to take precedence.
dotenv.config()

import { query } from '../config/database'
import { getErrorMessage } from '../utils/errorHelpers'
import { logger } from '../utils/logger'

// Required tables mirrored from the current production schema snapshot
const REQUIRED_TABLES = [
  'achievement_progress',
  'achievements',
  'admin_activity_logs',
  'admin_roles',
  'capital_eliminations',
  // Conversations-based messaging (required)
  'conversations',
  'conversation_members',
  'conversation_messages',
  'message_read_receipts',
  'email_verification_logs',
  'events',
  'feature_flags',
  'friendships',
  'game_moves',
  'game_rooms',
  'game_states',
  'game_territory_modifiers',
  'game_variants',
  'map_continents',
  'map_ratings',
  'map_submissions',
  'map_territories',
  'map_territory_modifiers',
  'maps',
  'matchmaking_queue',
  'notifications',
  'password_reset_tokens',
  'player_stats',
  'rating_history',
  'room_players',
  'schema_migrations',
  'seasons',
  'skill_leaderboard_cache',
  'territory_adjacencies',
  'territory_modifier_templates',
  'transactions',
  'user_account_status',
  'user_achievements',
  'user_admin_roles',
  'user_bans',
  'user_behavior_patterns',
  'user_feature_flags',
  'user_inventory',
  'user_preferences',
  'user_profiles',
  'user_reports',
  'user_seasonal_stats',
  'user_sessions',
  'user_settings',
  'user_terms_acceptance',
  'users',
  'user_blocks',
]

// Tables that are being tracked for future features but are not present in production
const OPTIONAL_TABLES = [
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
  'map_reviews',
  'map_tags',
  'map_tag_associations',
  'map_test_games',
  'map_usage_stats',
  'player_game_stats',
  'private_messages',
  // Legacy chat tables retained optionally for old snapshots
  'chat_messages',
  'message_link_previews',
  'message_reactions',
  'unread_message_counts',
  'ranking_history',
  'sessions',
  'territory_events',
  'territory_modifiers',
  'tournament_matches',
  'tournament_participants',
  'tournaments',
  'user_activity',
]

interface CliOptions {
  exportPath?: string
  format: 'markdown'
  skipValidation: boolean
  includeRowCounts: boolean
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = {
    format: 'markdown',
    skipValidation: false,
    includeRowCounts: true,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--export' || arg === '--output') {
      const next = args[index + 1]
      if (next && !next.startsWith('--')) {
        options.exportPath = next
        index += 1
      } else {
        options.exportPath = '../docs/operations/database-schema.md'
      }
    } else if (arg === '--format') {
      const next = args[index + 1]
      if (next && !next.startsWith('--')) {
        if (next !== 'markdown') {
          throw new Error(`Unsupported export format: ${next}`)
        }
        options.format = 'markdown'
        index += 1
      }
    } else if (arg === '--skip-validation') {
      options.skipValidation = true
    } else if (arg === '--skip-row-counts') {
      options.includeRowCounts = false
    } else if (arg === '--include-row-counts') {
      options.includeRowCounts = true
    }
  }

  return options
}

interface TableCheckResult {
  table: string
  exists: boolean
  rowCount?: number
  error?: string
}

async function checkTable(tableName: string): Promise<TableCheckResult> {
  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName],
    )

    if (result.rows[0].count > 0) {
      // Table exists, get row count
      const countResult = await query(`SELECT COUNT(*) as count FROM ${tableName}`)
      return {
        table: tableName,
        exists: true,
        rowCount: parseInt(countResult.rows[0].count, 10),
      }
    }
    return {
      table: tableName,
      exists: false,
    }
  } catch (error) {
    return {
      table: tableName,
      exists: false,
      error: getErrorMessage(error),
    }
  }
}

async function checkRequiredColumns(): Promise<void> {
  const criticalColumns = [
    { table: 'users', columns: ['id', 'username', 'email', 'password_hash'] },
    { table: 'game_rooms', columns: ['id', 'name', 'host_id', 'status'] },
    { table: 'maps', columns: ['id', 'name', 'creator_id'] },
  ]

  for (const check of criticalColumns) {
    try {
      const result = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = $1 AND table_schema = 'public'`,
        [check.table],
      )

      const existingColumns = result.rows.map((r) => r.column_name)
      const missingColumns = check.columns.filter((col) => !existingColumns.includes(col))

      if (missingColumns.length > 0) {
        logger.warn(`⚠️  Table ${check.table} missing columns: ${missingColumns.join(', ')}`)
      }
    } catch (error) {
      logger.error(`❌ Error checking columns for ${check.table}:`, error)
    }
  }
}

async function checkMigrationStatus(): Promise<void> {
  try {
    const result = await query(
      `SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 5`,
    )

    logger.info('📋 Recent migrations:')
    for (const row of result.rows) {
      logger.info(`  - Version ${row.version}: ${new Date(row.applied_at).toLocaleString()}`)
    }
  } catch (_error) {
    logger.warn('⚠️  Could not check migration status')
  }
}

export async function validateDatabaseSchema(): Promise<boolean> {
  logger.info('🔍 Validating database schema...')
  logger.info('========================================')

  const results: TableCheckResult[] = []
  let hasErrors = false

  // Check required tables
  logger.info('📊 Checking required tables...')
  for (const table of REQUIRED_TABLES) {
    const result = await checkTable(table)
    results.push(result)

    if (!result.exists) {
      logger.error(`❌ MISSING: ${table}`)
      hasErrors = true
    } else {
      logger.info(`✅ ${table} (${result.rowCount} rows)`)
    }
  }

  // Check optional tables
  logger.info('\n📊 Checking optional tables...')
  for (const table of OPTIONAL_TABLES) {
    const result = await checkTable(table)
    if (result.exists) {
      logger.info(`✅ ${table} (${result.rowCount} rows)`)
    } else {
      logger.info(`⭕ ${table} (not present - optional)`)
    }
  }

  // Check critical columns
  logger.info('\n📊 Checking critical columns...')
  await checkRequiredColumns()

  // Check migration status
  logger.info('\n📊 Migration status:')
  await checkMigrationStatus()

  // Summary
  logger.info('\n========================================')
  const missingTables = results.filter((r) => !r.exists)
  const existingTables = results.filter((r) => r.exists)

  logger.info(`📈 Schema validation summary:`)
  logger.info(`  ✅ Tables present: ${existingTables.length}/${REQUIRED_TABLES.length}`)
  logger.info(`  ❌ Tables missing: ${missingTables.length}`)

  if (missingTables.length > 0) {
    logger.error('\n⚠️  Missing tables:')
    for (const table of missingTables) {
      logger.error(`  - ${table.table}`)
    }
    logger.error('\n💡 Run migrations to create missing tables:')
    logger.error('   cd backend && npm run migrate')
  } else {
    logger.info('\n✅ All required tables are present!')
  }

  return !hasErrors
}

interface ColumnDefinitionRow {
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
  character_maximum_length: number | null
  numeric_precision: number | null
  numeric_scale: number | null
  datetime_precision: number | null
}

interface TableColumn {
  name: string
  dataType: string
  isNullable: boolean
  defaultValue: string | null
}

interface ConstraintSummary {
  name: string
  columns: string[]
}

interface ForeignKeySummary {
  name: string
  columns: string[]
  referencedTable: string
  referencedColumns: string[]
  updateRule: string | null
  deleteRule: string | null
}

interface CheckConstraintSummary {
  name: string
  definition: string
}

interface IndexInfo {
  name: string
  definition: string
}

interface TableInfo {
  name: string
  columns: TableColumn[]
  rowCount: number | null
  primaryKey: string[]
  uniqueConstraints: ConstraintSummary[]
  foreignKeys: ForeignKeySummary[]
  checkConstraints: CheckConstraintSummary[]
  indexes: IndexInfo[]
}

interface SchemaExportOptions {
  format: 'markdown'
  outputPath: string
  includeRowCounts: boolean
}

interface SchemaMetadata {
  database: string
  schema: string
  serverVersion: string
}

const numberFormatter = new Intl.NumberFormat('en-US')

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function formatDataType(column: ColumnDefinitionRow): string {
  if (column.data_type === 'USER-DEFINED') {
    return column.udt_name
  }

  if (column.data_type === 'ARRAY') {
    const baseType = column.udt_name.startsWith('_') ? column.udt_name.slice(1) : column.udt_name
    return `${baseType}[]`
  }

  if (column.data_type === 'character varying') {
    if (column.character_maximum_length != null) {
      return `varchar(${column.character_maximum_length})`
    }
    return 'varchar'
  }

  if (column.data_type === 'character') {
    if (column.character_maximum_length != null) {
      return `char(${column.character_maximum_length})`
    }
    return 'char'
  }

  if (column.data_type === 'numeric') {
    if (column.numeric_precision != null && column.numeric_scale != null) {
      return `numeric(${column.numeric_precision}, ${column.numeric_scale})`
    }
    if (column.numeric_precision != null) {
      return `numeric(${column.numeric_precision})`
    }
    return 'numeric'
  }

  if (column.data_type === 'timestamp without time zone') {
    return 'timestamp'
  }

  if (column.data_type === 'timestamp with time zone') {
    return 'timestamptz'
  }

  return column.data_type
}

function sanitizeDefaultValue(value: string | null): string | null {
  if (!value) {
    return null
  }

  return value.replace(/::[[\]\w\s.]+/g, '')
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

function formatRowCount(rowCount: number | null): string {
  if (rowCount == null) {
    return '—'
  }

  return numberFormatter.format(rowCount)
}

function extractPostgresVersion(rawVersion: string): string {
  const match = /^PostgreSQL\s+([^\s]+)/i.exec(rawVersion)
  if (match?.[1]) {
    return `PostgreSQL ${match[1]}`
  }
  return rawVersion
}

async function getSchemaMetadata(): Promise<SchemaMetadata> {
  const result = await query<{ database: string; schema: string; version: string }>(
    `SELECT current_database() AS database, current_schema() AS schema, version() AS version`,
  )

  const row = result.rows[0]
  return {
    database: row.database,
    schema: row.schema,
    serverVersion: extractPostgresVersion(row.version),
  }
}

type EnumValue = { label: string; order: number }
type EnumType = { name: string; values: EnumValue[] }

async function getEnumTypes(): Promise<EnumType[]> {
  const result = await query<{ enum_type: string; enum_label: string; enumsortorder: number }>(
    `SELECT t.typname AS enum_type, e.enumlabel AS enum_label, e.enumsortorder
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder`,
  )

  const byType = new Map<string, EnumValue[]>()
  for (const row of result.rows) {
    const arr = byType.get(row.enum_type) ?? []
    arr.push({ label: row.enum_label, order: row.enumsortorder })
    byType.set(row.enum_type, arr)
  }

  return Array.from(byType.entries()).map(([name, values]) => ({ name, values }))
}

type TriggerInfo = { table: string; name: string; definition: string }

async function getTriggers(): Promise<TriggerInfo[]> {
  const result = await query<{ trigger_name: string; table_name: string; definition: string }>(
    `SELECT t.tgname AS trigger_name, c.relname AS table_name, pg_get_triggerdef(t.oid, true) AS definition
       FROM pg_trigger t
       JOIN pg_class c ON t.tgrelid = c.oid
       JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname`,
  )

  return result.rows.map((row) => ({
    table: row.table_name,
    name: row.trigger_name,
    definition: row.definition,
  }))
}

async function getTableNames(): Promise<string[]> {
  const result = await query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  )

  return result.rows.map((row) => row.table_name)
}

async function getColumnsForTable(tableName: string): Promise<TableColumn[]> {
  const result = await query<ColumnDefinitionRow>(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default,
            character_maximum_length, numeric_precision, numeric_scale, datetime_precision
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName],
  )

  return result.rows.map((row) => ({
    name: row.column_name,
    dataType: formatDataType(row),
    isNullable: row.is_nullable === 'YES',
    defaultValue: sanitizeDefaultValue(row.column_default),
  }))
}

async function getConstraintDetails(tableName: string): Promise<{
  primaryKey: string[]
  uniqueConstraints: ConstraintSummary[]
  foreignKeys: ForeignKeySummary[]
}> {
  const result = await query<{
    constraint_name: string
    constraint_type: string
    column_name: string | null
    foreign_table_name: string | null
    foreign_column_name: string | null
    update_rule: string | null
    delete_rule: string | null
  }>(
    `SELECT tc.constraint_name, tc.constraint_type, kcu.column_name,
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
      ORDER BY tc.constraint_name, kcu.ordinal_position`,
    [tableName],
  )

  const primaryKey: string[] = []
  const uniqueByConstraint = new Map<string, string[]>()
  const foreignByConstraint = new Map<
    string,
    {
      columns: string[]
      referencedTable: string
      referencedColumns: string[]
      updateRule: string | null
      deleteRule: string | null
    }
  >()

  for (const row of result.rows) {
    if (row.constraint_type === 'PRIMARY KEY' && row.column_name) {
      primaryKey.push(row.column_name)
    }

    if (row.constraint_type === 'UNIQUE' && row.column_name) {
      const columns = uniqueByConstraint.get(row.constraint_name) ?? []
      columns.push(row.column_name)
      uniqueByConstraint.set(row.constraint_name, columns)
    }

    if (
      row.constraint_type === 'FOREIGN KEY' &&
      row.column_name &&
      row.foreign_table_name &&
      row.foreign_column_name
    ) {
      const existing = foreignByConstraint.get(row.constraint_name)
      if (existing) {
        existing.columns.push(row.column_name)
        existing.referencedColumns.push(row.foreign_column_name)
      } else {
        foreignByConstraint.set(row.constraint_name, {
          columns: [row.column_name],
          referencedTable: row.foreign_table_name,
          referencedColumns: [row.foreign_column_name],
          updateRule: row.update_rule,
          deleteRule: row.delete_rule,
        })
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
  }
}

async function getCheckConstraints(tableName: string): Promise<CheckConstraintSummary[]> {
  const result = await query<{ name: string; definition: string }>(
    `SELECT con.conname AS name, pg_get_constraintdef(con.oid, true) AS definition
       FROM pg_constraint con
       JOIN pg_class rel ON con.conrelid = rel.oid
       JOIN pg_namespace nsp ON rel.relnamespace = nsp.oid
      WHERE con.contype = 'c'
        AND nsp.nspname = 'public'
        AND rel.relname = $1
      ORDER BY con.conname`,
    [tableName],
  )

  return result.rows.map((row) => ({
    name: row.name,
    definition: row.definition,
  }))
}

async function getIndexesForTable(tableName: string): Promise<IndexInfo[]> {
  const result = await query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
      ORDER BY indexname`,
    [tableName],
  )

  return result.rows.map((row) => ({
    name: row.indexname,
    definition: row.indexdef,
  }))
}

async function getRowCountForTable(tableName: string): Promise<number | null> {
  try {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier('public')}.${quoteIdentifier(tableName)}`,
    )
    const value = result.rows[0]?.count
    return value ? Number.parseInt(value, 10) : null
  } catch (error) {
    logger.warn(`⚠️  Unable to count rows for ${tableName}: ${getErrorMessage(error)}`)
    return null
  }
}

async function getTableInfos(includeRowCounts: boolean): Promise<TableInfo[]> {
  const tableNames = await getTableNames()
  const tables: TableInfo[] = []

  for (const tableName of tableNames) {
    const columns = await getColumnsForTable(tableName)
    const constraints = await getConstraintDetails(tableName)
    const checkConstraints = await getCheckConstraints(tableName)
    const indexes = await getIndexesForTable(tableName)
    const rowCount = includeRowCounts ? await getRowCountForTable(tableName) : null

    tables.push({
      name: tableName,
      columns,
      rowCount,
      primaryKey: constraints.primaryKey,
      uniqueConstraints: constraints.uniqueConstraints,
      foreignKeys: constraints.foreignKeys,
      checkConstraints,
      indexes,
    })
  }

  return tables
}

function buildTableSummaryMarkdown(table: TableInfo): string[] {
  const lines: string[] = []

  lines.push(`### \`${table.name}\``)
  lines.push('')
  lines.push('| Column | Type | Nullable | Default |')
  lines.push('| --- | --- | --- | --- |')

  for (const column of table.columns) {
    const defaultValue = column.defaultValue ? `\`${escapeMarkdown(column.defaultValue)}\`` : '—'
    lines.push(
      `| \`${column.name}\` | \`${escapeMarkdown(column.dataType)}\` | ${column.isNullable ? 'Yes' : 'No'} | ${defaultValue} |`,
    )
  }

  lines.push('')

  if (table.primaryKey.length > 0) {
    lines.push(`**Primary key:** \`${table.primaryKey.join('`, `')}\``)
  } else {
    lines.push('**Primary key:** —')
  }

  lines.push('')

  lines.push('**Unique constraints:**')
  if (table.uniqueConstraints.length === 0) {
    lines.push('- —')
  } else {
    for (const unique of table.uniqueConstraints) {
      lines.push(`- \`${unique.name}\`: \`${unique.columns.join('`, `')}\``)
    }
  }

  lines.push('')

  lines.push('**Foreign keys:**')
  if (table.foreignKeys.length === 0) {
    lines.push('- —')
  } else {
    for (const foreignKey of table.foreignKeys) {
      const updateRule = foreignKey.updateRule ? ` ON UPDATE ${foreignKey.updateRule}` : ''
      const deleteRule = foreignKey.deleteRule ? ` ON DELETE ${foreignKey.deleteRule}` : ''
      lines.push(
        `- \`${foreignKey.name}\`: (\`${foreignKey.columns.join('`, `')}\`) → \`${foreignKey.referencedTable}\` (\`${foreignKey.referencedColumns.join('`, `')}\`)${updateRule}${deleteRule}`,
      )
    }
  }

  lines.push('')

  lines.push('**Check constraints:**')
  if (table.checkConstraints.length === 0) {
    lines.push('- —')
  } else {
    for (const constraint of table.checkConstraints) {
      lines.push(`- \`${constraint.name}\`: ${escapeMarkdown(constraint.definition)}`)
    }
  }

  lines.push('')

  lines.push('**Indexes:**')
  if (table.indexes.length === 0) {
    lines.push('- —')
  } else {
    for (const index of table.indexes) {
      lines.push(`- \`${index.name}\`: ${escapeMarkdown(index.definition)}`)
    }
  }

  lines.push('')

  return lines
}

async function exportSchemaCatalog(options: SchemaExportOptions): Promise<void> {
  if (options.format !== 'markdown') {
    throw new Error(`Unsupported export format: ${options.format}`)
  }

  const resolvedOutputPath = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.resolve(process.cwd(), options.outputPath)

  logger.info(`📝 Exporting database schema to ${resolvedOutputPath}`)

  const [metadata, tables, enums, triggers] = await Promise.all([
    getSchemaMetadata(),
    getTableInfos(options.includeRowCounts),
    getEnumTypes(),
    getTriggers(),
  ])

  const generatedAt = new Date()
  const relationships = tables.flatMap((table) =>
    table.foreignKeys.map((foreignKey) => ({
      constraint: foreignKey.name,
      fromTable: table.name,
      fromColumns: foreignKey.columns,
      toTable: foreignKey.referencedTable,
      toColumns: foreignKey.referencedColumns,
      updateRule: foreignKey.updateRule,
      deleteRule: foreignKey.deleteRule,
    })),
  )

  relationships.sort((a, b) => {
    if (a.fromTable === b.fromTable) {
      return a.toTable.localeCompare(b.toTable)
    }
    return a.fromTable.localeCompare(b.fromTable)
  })

  const lines: string[] = []
  lines.push('# ConquestK Database Schema')
  lines.push('')
  lines.push(`Generated on ${generatedAt.toISOString()}`)
  lines.push('')
  lines.push(
    '> This document is generated via `npm run check:schema -- --skip-validation --export ../docs/operations/database-schema.md`. Run the command after any migration changes to keep it current.',
  )
  lines.push('')
  lines.push('## Overview')
  lines.push('')
  lines.push(`- Database: \`${metadata.database}\``)
  lines.push(`- Schema: \`${metadata.schema}\``)
  lines.push(`- PostgreSQL: ${metadata.serverVersion}`)
  lines.push(`- Tables: ${tables.length}`)
  if (options.includeRowCounts) {
    lines.push('- Row counts reflect the snapshot captured when this file was generated.')
  }

  lines.push('')
  lines.push('## Table Summary')
  lines.push('')
  lines.push('| Table | Columns | Rows |')
  lines.push('| --- | ---: | ---: |')
  for (const table of tables) {
    lines.push(
      `| \`${table.name}\` | ${table.columns.length} | ${formatRowCount(table.rowCount)} |`,
    )
  }

  if (enums.length > 0) {
    lines.push('')
    lines.push('## Enum Types')
    lines.push('')
    for (const et of enums) {
      lines.push(`### \`${et.name}\``)
      lines.push('')
      lines.push('| Value | Order |')
      lines.push('| --- | ---: |')
      for (const v of et.values) {
        lines.push(`| \`${escapeMarkdown(v.label)}\` | ${v.order} |`)
      }
      lines.push('')
    }
  }

  lines.push('')
  lines.push('## Tables')
  lines.push('')

  for (const table of tables) {
    lines.push(...buildTableSummaryMarkdown(table))
  }

  if (relationships.length > 0) {
    lines.push('## Foreign Key Relationships')
    lines.push('')
    lines.push('| Constraint | From table | Columns | To table | Columns | On Update | On Delete |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- |')
    for (const relationship of relationships) {
      const updateRule = relationship.updateRule ?? '—'
      const deleteRule = relationship.deleteRule ?? '—'
      lines.push(
        `| \`${relationship.constraint}\` | \`${relationship.fromTable}\` | \`${relationship.fromColumns.join('`, `')}\` | \`${relationship.toTable}\` | \`${relationship.toColumns.join('`, `')}\` | ${updateRule} | ${deleteRule} |`,
      )
    }
    lines.push('')
  }

  if (triggers.length > 0) {
    lines.push('## Triggers')
    lines.push('')
    lines.push('| Trigger | Table | Definition |')
    lines.push('| --- | --- | --- |')
    for (const tg of triggers) {
      lines.push(
        `| \`${escapeMarkdown(tg.name)}\` | \`${escapeMarkdown(tg.table)}\` | ${escapeMarkdown(tg.definition)} |`,
      )
    }
    lines.push('')
  }

  await fsPromises.mkdir(path.dirname(resolvedOutputPath), { recursive: true })
  await fsPromises.writeFile(resolvedOutputPath, `${lines.join('\n')}\n`, 'utf8')

  logger.info(`✅ Schema catalog written to ${resolvedOutputPath}`)
}

async function main(): Promise<void> {
  const options = parseCliOptions()
  let validationPassed = true

  if (!options.skipValidation) {
    validationPassed = await validateDatabaseSchema()
    if (validationPassed) {
      logger.info('✅ Database schema is valid')
    } else {
      logger.error('❌ Database schema validation failed')
    }
  }

  if (options.exportPath) {
    await exportSchemaCatalog({
      format: options.format,
      outputPath: options.exportPath,
      includeRowCounts: options.includeRowCounts,
    })
  }

  if (!options.skipValidation && !validationPassed) {
    process.exitCode = 1
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('❌ Schema validation error:', error)
    process.exitCode = 1
  })
}
