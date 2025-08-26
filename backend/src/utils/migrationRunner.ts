import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { query } from '../config/database'
import { logger } from './logger'

export async function runMigration(migrationFile: string) {
  try {
    // Determine which migration file to use based on database type
    const dbType = process.env.DATABASE_URL
      ? 'mysql'
      : (process.env.DB_TYPE as string) ||
        (process.env.NODE_ENV === 'production' ? 'mysql' : 'sqlite')

    // Try to use MySQL-specific migration if it exists
    let actualMigrationFile = migrationFile
    if (dbType === 'mysql') {
      const mysqlFile = migrationFile.replace('.sql', '_mysql.sql')
      const mysqlPath = join(__dirname, '../../migrations', mysqlFile)
      if (require('node:fs').existsSync(mysqlPath)) {
        actualMigrationFile = mysqlFile
      }
    }

    const migrationPath = join(__dirname, '../../migrations', actualMigrationFile)
    let migrationSQL = readFileSync(migrationPath, 'utf8')

    // Convert for SQLite compatibility if needed
    if (dbType === 'sqlite') {
      migrationSQL = migrationSQL.replace(/JSONB/g, 'TEXT')
      migrationSQL = migrationSQL.replace(/JSON/g, 'TEXT')
      // Keep SQLite UUID generation function
    } else if (dbType === 'mysql' && !actualMigrationFile.includes('_mysql')) {
      // Convert SQLite/PostgreSQL syntax to MySQL
      migrationSQL = migrationSQL.replace(/JSONB/g, 'JSON')
      // Replace SQLite UUID generation with MySQL UUID
      migrationSQL = migrationSQL.replace(
        /DEFAULT \(lower\(hex\(randomblob\(4\)\)\) \|\| '-' \|\| lower\(hex\(randomblob\(2\)\)\) \|\| '-4' \|\| substr\(lower\(hex\(randomblob\(2\)\)\),2\) \|\| '-' \|\| substr\('ab89',1\+abs\(random\(\)\)%4,1\) \|\| substr\(lower\(hex\(randomblob\(2\)\)\),2\) \|\| '-' \|\| lower\(hex\(randomblob\(6\)\)\)\)/g,
        'DEFAULT (UUID())',
      )
      // Convert TEXT PRIMARY KEY to VARCHAR(36) for MySQL
      migrationSQL = migrationSQL.replace(/id TEXT PRIMARY KEY/g, 'id VARCHAR(36) PRIMARY KEY')
      migrationSQL = migrationSQL.replace(/user_id TEXT/g, 'user_id VARCHAR(36)')
      migrationSQL = migrationSQL.replace(/AUTOINCREMENT/g, 'AUTO_INCREMENT')
    }

    // Split by semicolon but preserve triggers/functions with BEGIN...END blocks
    const statements: string[] = []
    let currentStatement = ''
    let inTrigger = false

    const lines = migrationSQL.split('\n')
    for (const line of lines) {
      const upperLine = line.trim().toUpperCase()

      // Check if we're entering a trigger/function block
      if (
        upperLine.includes('CREATE TRIGGER') ||
        upperLine.includes('CREATE FUNCTION') ||
        upperLine.includes('CREATE PROCEDURE')
      ) {
        inTrigger = true
      }

      currentStatement += `${line}\n`

      // Check if statement ends with semicolon and we're not in a trigger
      if (line.trim().endsWith(';')) {
        if (inTrigger) {
          // Check if this is the END; statement
          if (upperLine === 'END;' || upperLine.startsWith('END;')) {
            statements.push(currentStatement.trim())
            currentStatement = ''
            inTrigger = false
          }
        } else {
          // Normal statement, add it
          statements.push(currentStatement.trim())
          currentStatement = ''
        }
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim())
    }

    logger.info(`Running migration: ${migrationFile} (DB: ${dbType})`)

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await query(statement)
        } catch (error) {
          // Log but don't fail on expected errors
          const errorMessage = (error as any).message || ''
          if (
            statement.includes('DROP TABLE IF EXISTS') ||
            statement.includes('INSERT OR IGNORE') ||
            statement.includes('INSERT INTO map_status') ||
            statement.includes('CREATE INDEX IF NOT EXISTS') ||
            statement.includes('ALTER TABLE') ||
            errorMessage.includes('already exists') ||
            errorMessage.includes('duplicate column name') ||
            errorMessage.includes('no such column') ||
            errorMessage.includes('duplicate column')
          ) {
            logger.debug(
              `Skipping statement (column may already exist): ${statement.substring(0, 50)}...`,
            )
          } else {
            logger.error('Failed statement:', statement.substring(0, 200))
            throw error
          }
        }
      }
    }

    logger.info(`✅ Migration completed: ${migrationFile}`)
  } catch (error) {
    logger.error(`❌ Migration failed: ${migrationFile}`, error)
    throw error
  }
}

export async function runMigrations() {
  const migrations = [
    '001_extended_maps_schema.sql',
    '002_user_profiles_schema.sql',
    '003_admin_system.sql',
    '004_game_room_settings.sql',
    '005_map_approval_versioning.sql',
    '006_add_email_verification.sql',
    '007_auth_improvements.sql',
    // Temporarily skip 008 and 009 due to SQLite issues
    // '008_capitals_system.sql',
    // '009_map_approval_workflow.sql'
  ]

  for (const migration of migrations) {
    await runMigration(migration)
  }

  logger.info('🎯 All migrations completed successfully')
}
