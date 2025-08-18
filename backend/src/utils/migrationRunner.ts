import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../config/database';
import { logger } from './logger';

export async function runMigration(migrationFile: string) {
  try {
    const migrationPath = join(__dirname, '../db/migrations', migrationFile);
    let migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Convert JSONB to TEXT for SQLite compatibility
    const dbType = process.env.DATABASE_URL ? 'postgresql' : 
      (process.env.DB_TYPE as string) || 
      (process.env.NODE_ENV === 'production' ? 'postgresql' : 'sqlite');
      
    if (dbType === 'sqlite') {
      migrationSQL = migrationSQL.replace(/JSONB/g, 'TEXT');
    }
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    logger.info(`Running migration: ${migrationFile} (DB: ${dbType})`);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await query(statement);
        } catch (error) {
          // Log but don't fail on DROP TABLE IF EXISTS or duplicate inserts
          if (statement.includes('DROP TABLE IF EXISTS') || 
              statement.includes('INSERT OR IGNORE') ||
              (error as any).message?.includes('already exists')) {
            logger.debug(`Skipping statement: ${statement.substring(0, 50)}...`);
          } else {
            throw error;
          }
        }
      }
    }
    
    logger.info(`✅ Migration completed: ${migrationFile}`);
  } catch (error) {
    logger.error(`❌ Migration failed: ${migrationFile}`, error);
    throw error;
  }
}

export async function runMigrations() {
  const migrations = [
    '001_extended_maps_schema.sql',
    '002_user_profiles_schema.sql'
  ];
  
  for (const migration of migrations) {
    await runMigration(migration);
  }
  
  logger.info('🎯 All migrations completed successfully');
}