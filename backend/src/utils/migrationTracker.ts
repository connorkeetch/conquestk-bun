import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '../config/database.js'
import { logger } from './logger.js'

type MigrationStatusRow = {
  filename: string
  status: 'completed' | 'failed' | 'rolled_back' | null
  executed_at: Date | null
  execution_time_ms: number | null
}

export interface MigrationRecord {
  id?: number
  filename: string
  checksum: string
  executed_at: Date
  execution_time_ms: number
  status: 'completed' | 'failed' | 'rolled_back'
  rollback_sql?: string
}

export interface MigrationStatus {
  filename: string
  status: 'completed' | 'failed' | 'rolled_back' | 'pending'
  executed_at?: Date
  execution_time_ms?: number
}

export class MigrationTracker {
  private trackingTableExists = false

  private resolveStatus(status: MigrationStatusRow['status']): MigrationStatus['status'] {
    if (status === 'completed' || status === 'failed' || status === 'rolled_back') {
      return status
    }
    return 'pending'
  }

  async createTrackingTable(): Promise<void> {
    try {
      // Check if tracking table already exists
      const tableCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'schema_migrations'
        )
      `)

      if (tableCheck.rows[0].exists) {
        await this.upgradeTrackingTable()
        this.trackingTableExists = true
        logger.info('✅ Migration tracking table already exists')
        return
      }

      // Create schema_migrations table
      await query(`
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
      `)

      // Create index for performance
      await query('CREATE INDEX idx_schema_migrations_filename ON schema_migrations(filename)')
      await query('CREATE INDEX idx_schema_migrations_status ON schema_migrations(status)')

      this.trackingTableExists = true
      logger.info('✅ Created schema_migrations tracking table')
    } catch (error) {
      logger.error('❌ Failed to create migration tracking table:', error)
      throw error
    }
  }

  private async upgradeTrackingTable(): Promise<void> {
    try {
      logger.info('🔧 Ensuring schema_migrations table matches current layout')

      const columnQuery = await query<{
        column_name: string
      }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
      `)

      const columns = new Set(columnQuery.rows.map((row) => row.column_name))
      const statements: string[] = []

      if (!columns.has('checksum')) {
        statements.push('ALTER TABLE schema_migrations ADD COLUMN checksum VARCHAR(64)')
      }
      if (!columns.has('execution_time_ms')) {
        statements.push('ALTER TABLE schema_migrations ADD COLUMN execution_time_ms INTEGER')
      }
      if (!columns.has('rollback_sql')) {
        statements.push('ALTER TABLE schema_migrations ADD COLUMN rollback_sql TEXT')
      }
      if (!columns.has('created_at')) {
        statements.push(
          'ALTER TABLE schema_migrations ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
        )
      }

      for (const statement of statements) {
        await query(statement)
      }

      await query(
        "UPDATE schema_migrations SET checksum = COALESCE(checksum, 'legacy-manual-import')",
      )
      await query('UPDATE schema_migrations SET execution_time_ms = COALESCE(execution_time_ms, 0)')
      await query(
        'UPDATE schema_migrations SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)',
      )

      await query('ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL')
      await query('ALTER TABLE schema_migrations ALTER COLUMN execution_time_ms SET NOT NULL')
      await query('ALTER TABLE schema_migrations ALTER COLUMN created_at SET NOT NULL')

      await query('ALTER TABLE schema_migrations DROP CONSTRAINT IF EXISTS migration_status_check')
      await query(
        "ALTER TABLE schema_migrations ADD CONSTRAINT migration_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back'))",
      )

      await query(
        'CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations(filename)',
      )
      await query(
        'CREATE INDEX IF NOT EXISTS idx_schema_migrations_status ON schema_migrations(status)',
      )

      logger.info('✅ schema_migrations table is compatible with the modern migration runner')
    } catch (error) {
      logger.error('❌ Failed to upgrade schema_migrations table:', error)
      throw error
    }
  }

  async getAppliedMigrations(): Promise<string[]> {
    if (!this.trackingTableExists) {
      await this.createTrackingTable()
    }

    try {
      // Check which column exists (version or filename)
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'schema_migrations' 
        AND column_name IN ('filename', 'version')
      `)

      const hasFilename = columnCheck.rows.some((row) => row.column_name === 'filename')
      const hasVersion = columnCheck.rows.some((row) => row.column_name === 'version')

      if (hasFilename) {
        const result = await query<{ filename: string }>(
          `
          SELECT filename 
          FROM schema_migrations 
          WHERE status = 'completed' 
          ORDER BY executed_at ASC
        `,
        )
        return result.rows.map((row) => row.filename)
      }
      if (hasVersion) {
        // Handle older schema_migrations table format
        const result = await query<{ version: string }>(
          `
          SELECT version 
          FROM schema_migrations 
          ORDER BY applied_at ASC
        `,
        )
        // Convert version numbers to expected filename format
        return result.rows.map((row) => {
          const version = row.version
          // Map version to actual migration filenames
          if (version === '001' || version === '001_complete_schema') {
            return '001_complete_schema.sql'
          }
          if (version === '002') {
            return '002_add_missing_tables.sql'
          }
          if (version === '003') {
            return '003_complete_missing_tables.sql'
          }
          return `${version}.sql`
        })
      }
      // No migrations table or empty table
      return []
    } catch (error) {
      logger.error('❌ Failed to get applied migrations:', error)
      return []
    }
  }

  async markMigrationCompleted(record: MigrationRecord): Promise<void> {
    if (!this.trackingTableExists) {
      await this.createTrackingTable()
    }

    try {
      // Check which column exists
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'schema_migrations' 
        AND column_name IN ('filename', 'version')
      `)

      const hasFilename = columnCheck.rows.some((row) => row.column_name === 'filename')

      if (hasFilename) {
        await query(
          `
          INSERT INTO schema_migrations (filename, checksum, executed_at, execution_time_ms, status, rollback_sql)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (filename) 
          DO UPDATE SET 
            checksum = EXCLUDED.checksum,
          executed_at = EXCLUDED.executed_at,
          execution_time_ms = EXCLUDED.execution_time_ms,
          status = EXCLUDED.status,
          rollback_sql = EXCLUDED.rollback_sql
      `,
          [
            record.filename,
            record.checksum,
            record.executed_at,
            record.execution_time_ms,
            record.status,
            record.rollback_sql,
          ],
        )

        logger.debug(`✅ Marked migration as ${record.status}: ${record.filename}`)
      } else {
        // Handle older schema_migrations format - just track by version
        const version = record.filename.replace('.sql', '').split('_')[0]
        await query(
          `
          INSERT INTO schema_migrations (version, applied_at)
          VALUES ($1, $2)
          ON CONFLICT (version) DO NOTHING
          `,
          [version, record.executed_at],
        )
        logger.debug(`✅ Marked migration as completed: ${version}`)
      }
    } catch (error) {
      logger.error(`❌ Failed to mark migration ${record.filename}:`, error)
      throw error
    }
  }

  async getMigrationStatus(filename: string): Promise<MigrationStatus | null> {
    if (!this.trackingTableExists) {
      await this.createTrackingTable()
    }

    try {
      const result = await query(
        `
        SELECT filename, status, executed_at, execution_time_ms
        FROM schema_migrations 
        WHERE filename = $1
      `,
        [filename],
      )

      if (result.rows.length === 0) {
        return { filename, status: 'pending' }
      }

      const row = result.rows[0]
      return {
        filename: row.filename,
        status: row.status,
        executed_at: row.executed_at,
        execution_time_ms: row.execution_time_ms,
      }
    } catch (error) {
      logger.error(`❌ Failed to get migration status for ${filename}:`, error)
      return { filename, status: 'pending' }
    }
  }

  async validateMigrationIntegrity(filename: string): Promise<boolean> {
    try {
      // ESM-safe __dirname resolution
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const migrationPath = join(__dirname, '../../migrations', filename)
      const migrationContent = readFileSync(migrationPath, 'utf8')
      const currentChecksum = this.calculateChecksum(migrationContent)

      const status = await this.getMigrationStatus(filename)
      if (!status || status.status === 'pending') {
        return true // New migration, no integrity issues
      }

      // Allow re-running failed migrations with updated content
      if (status.status === 'failed') {
        logger.info(`🔄 Allowing re-run of failed migration with updated content: ${filename}`)
        return true
      }

      const result = await query(
        `
        SELECT checksum FROM schema_migrations WHERE filename = $1
      `,
        [filename],
      )

      if (result.rows.length === 0) {
        return true
      }

      const storedChecksum = result.rows[0].checksum
      const isValid = currentChecksum === storedChecksum

      if (!isValid) {
        logger.error(`❌ Migration integrity violation: ${filename}`)
        logger.error(`   Stored checksum:  ${storedChecksum}`)
        logger.error(`   Current checksum: ${currentChecksum}`)
      }

      return isValid
    } catch (error) {
      logger.error(`❌ Failed to validate migration integrity for ${filename}:`, error)
      return false
    }
  }

  calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex').substring(0, 16)
  }

  async getAllMigrationStatuses(): Promise<MigrationStatus[]> {
    if (!this.trackingTableExists) {
      await this.createTrackingTable()
    }

    try {
      const result = await query<MigrationStatusRow>(
        `
        SELECT filename, status, executed_at, execution_time_ms
        FROM schema_migrations 
        ORDER BY executed_at ASC
      `,
      )

      return result.rows.map((row) => ({
        filename: row.filename,
        status: this.resolveStatus(row.status),
        ...(row.executed_at ? { executed_at: row.executed_at } : {}),
        ...(typeof row.execution_time_ms === 'number'
          ? { execution_time_ms: row.execution_time_ms }
          : {}),
      }))
    } catch (error) {
      logger.error('❌ Failed to get all migration statuses:', error)
      return []
    }
  }

  async rollbackMigration(filename: string): Promise<void> {
    try {
      const result = await query(
        `
        SELECT rollback_sql FROM schema_migrations 
        WHERE filename = $1 AND status = 'completed'
      `,
        [filename],
      )

      if (result.rows.length === 0) {
        throw new Error(`No completed migration found for rollback: ${filename}`)
      }

      const rollbackSql = result.rows[0].rollback_sql
      if (!rollbackSql) {
        throw new Error(`No rollback SQL available for migration: ${filename}`)
      }

      // Execute rollback SQL
      await query(rollbackSql)

      // Mark as rolled back
      await query(
        `
        UPDATE schema_migrations 
        SET status = 'rolled_back', executed_at = CURRENT_TIMESTAMP
        WHERE filename = $1
      `,
        [filename],
      )

      logger.info(`✅ Rolled back migration: ${filename}`)
    } catch (error) {
      logger.error(`❌ Failed to rollback migration ${filename}:`, error)
      throw error
    }
  }
}
