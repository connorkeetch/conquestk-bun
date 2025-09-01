import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables before importing database
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { query } from '../config/database';
import { logger } from '../utils/logger';

// Complete list of required tables after migration 003
const REQUIRED_TABLES = [
  // Core Game Tables
  'users',
  'game_rooms',
  'room_players',
  'game_states',
  'game_moves',
  'game_history',
  'player_game_stats',
  'player_stats',
  
  // Map System
  'maps',
  'map_territories',
  'territory_adjacencies',
  'custom_maps',
  'map_submissions',
  'map_reviews',
  'map_test_games',
  'map_approval_history',
  'map_featured_history',
  'map_usage_stats',
  'map_ratings',
  'map_comments',
  'map_downloads',
  'map_favorites',
  'map_tags',
  'map_tag_associations',
  
  // Social Features
  'user_profiles',
  'friendships',
  'user_blocks',
  'chat_messages',
  'private_messages',
  
  // Achievement System
  'achievements',
  'user_achievements',
  'achievement_progress',
  
  // Tournament System
  'tournaments',
  'tournament_participants',
  'tournament_matches',
  'ranking_history',
  
  // Territory Features
  'territory_modifiers',
  'territory_events',
  'active_territory_effects',
  
  // Admin & Moderation
  'admin_roles',
  'user_admin_roles',
  'admin_activity_logs',
  'user_reports',
  'user_bans',
  'user_account_status',
  
  // Support Tables
  'notifications',
  'game_analytics',
  'user_activity',
  'map_editor_sessions',
  'schema_migrations'
];

// Tables that are referenced in code but optional
const OPTIONAL_TABLES = [
  'sessions', // Express sessions (if using database store)
  'email_queue', // Email queue (if implementing)
  'audit_logs' // General audit logs
];

interface TableCheckResult {
  table: string;
  exists: boolean;
  rowCount?: number;
  error?: string;
}

async function checkTable(tableName: string): Promise<TableCheckResult> {
  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    
    if (result.rows[0].count > 0) {
      // Table exists, get row count
      const countResult = await query(`SELECT COUNT(*) as count FROM ${tableName}`);
      return {
        table: tableName,
        exists: true,
        rowCount: parseInt(countResult.rows[0].count)
      };
    } else {
      return {
        table: tableName,
        exists: false
      };
    }
  } catch (error: any) {
    return {
      table: tableName,
      exists: false,
      error: error.message
    };
  }
}

async function checkRequiredColumns(): Promise<void> {
  const criticalColumns = [
    { table: 'users', columns: ['id', 'username', 'email', 'password'] },
    { table: 'game_rooms', columns: ['id', 'name', 'host_id', 'status'] },
    { table: 'maps', columns: ['id', 'name', 'creator_id'] }
  ];
  
  for (const check of criticalColumns) {
    try {
      const result = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = $1 AND table_schema = 'public'`,
        [check.table]
      );
      
      const existingColumns = result.rows.map(r => r.column_name);
      const missingColumns = check.columns.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length > 0) {
        logger.warn(`⚠️  Table ${check.table} missing columns: ${missingColumns.join(', ')}`);
      }
    } catch (error) {
      logger.error(`❌ Error checking columns for ${check.table}:`, error);
    }
  }
}

async function checkMigrationStatus(): Promise<void> {
  try {
    const result = await query(
      `SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 5`
    );
    
    logger.info('📋 Recent migrations:');
    for (const row of result.rows) {
      logger.info(`  - Version ${row.version}: ${new Date(row.applied_at).toLocaleString()}`);
    }
  } catch (error) {
    logger.warn('⚠️  Could not check migration status');
  }
}

export async function validateDatabaseSchema(): Promise<boolean> {
  logger.info('🔍 Validating database schema...');
  logger.info('========================================');
  
  const results: TableCheckResult[] = [];
  let hasErrors = false;
  
  // Check required tables
  logger.info('📊 Checking required tables...');
  for (const table of REQUIRED_TABLES) {
    const result = await checkTable(table);
    results.push(result);
    
    if (!result.exists) {
      logger.error(`❌ MISSING: ${table}`);
      hasErrors = true;
    } else {
      logger.info(`✅ ${table} (${result.rowCount} rows)`);
    }
  }
  
  // Check optional tables
  logger.info('\n📊 Checking optional tables...');
  for (const table of OPTIONAL_TABLES) {
    const result = await checkTable(table);
    if (result.exists) {
      logger.info(`✅ ${table} (${result.rowCount} rows)`);
    } else {
      logger.info(`⭕ ${table} (not present - optional)`);
    }
  }
  
  // Check critical columns
  logger.info('\n📊 Checking critical columns...');
  await checkRequiredColumns();
  
  // Check migration status
  logger.info('\n📊 Migration status:');
  await checkMigrationStatus();
  
  // Summary
  logger.info('\n========================================');
  const missingTables = results.filter(r => !r.exists);
  const existingTables = results.filter(r => r.exists);
  
  logger.info(`📈 Schema validation summary:`);
  logger.info(`  ✅ Tables present: ${existingTables.length}/${REQUIRED_TABLES.length}`);
  logger.info(`  ❌ Tables missing: ${missingTables.length}`);
  
  if (missingTables.length > 0) {
    logger.error('\n⚠️  Missing tables:');
    missingTables.forEach(t => logger.error(`  - ${t.table}`));
    logger.error('\n💡 Run migrations to create missing tables:');
    logger.error('   cd backend && npm run migrate');
  } else {
    logger.info('\n✅ All required tables are present!');
  }
  
  return !hasErrors;
}

// Run if called directly
if (require.main === module) {
  validateDatabaseSchema()
    .then(isValid => {
      if (isValid) {
        logger.info('✅ Database schema is valid');
        process.exit(0);
      } else {
        logger.error('❌ Database schema validation failed');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('❌ Schema validation error:', error);
      process.exit(1);
    });
}