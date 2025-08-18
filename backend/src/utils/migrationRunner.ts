import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../config/database';
import { logger } from './logger';

export async function runMigration(migrationFile: string) {
  try {
    const migrationPath = join(__dirname, '../db/migrations', migrationFile);
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    logger.info(`Running migration: ${migrationFile}`);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await query(statement);
        } catch (error) {
          // Log but don't fail on DROP TABLE IF EXISTS
          if (statement.includes('DROP TABLE IF EXISTS')) {
            logger.debug(`Drop statement: ${statement.substring(0, 50)}...`);
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
    '001_extended_maps_schema.sql'
  ];
  
  for (const migration of migrations) {
    await runMigration(migration);
  }
  
  logger.info('🎯 All migrations completed successfully');
}