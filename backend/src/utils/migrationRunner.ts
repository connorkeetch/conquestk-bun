import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '../config/database.js'
import { logger } from './logger.js'
import { type MigrationRecord, type MigrationStatus, MigrationTracker } from './migrationTracker.js'

export class MigrationRunner {
  private migrationTracker: MigrationTracker
  private migrationsPath: string = ''
  private static didLogPathScan = false

  constructor(migrationTracker?: MigrationTracker) {
    this.migrationTracker = migrationTracker || new MigrationTracker()

    // Try multiple possible migration paths (simplified - no postgres subdirectory)
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const rawPaths = [
      // Production paths (Railway) - check these first
      '/app/backend/dist/migrations', // Railway dist
      '/app/backend/migrations', // Railway source
      '/app/migrations', // Railway alternate

      // Development and build paths
      join(__dirname, '../migrations'), // dist/utils -> dist/migrations
      join(__dirname, '../../migrations'), // src/utils -> migrations
      join(process.cwd(), 'migrations'), // Current working directory/migrations
      join(process.cwd(), 'backend/migrations'), // Current working directory/backend/migrations
    ]

    // Deduplicate normalized paths to avoid repeated logs
    const possiblePaths = Array.from(new Set(rawPaths))

    // Log all paths being checked for debugging
    if (
      process.env.STARTUP_VERBOSE === 'true' ||
      (process.env.LOG_LEVEL || '').toLowerCase() === 'debug'
    ) {
      logger.debug('📁 Checking migration paths:')
      possiblePaths.forEach((path, index) => {
        const exists = existsSync(path)
        logger.debug(`  ${index + 1}. ${path} - ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`)
      })
    } else if (!MigrationRunner.didLogPathScan) {
      // In normal mode, only log a single line once per process
      logger.debug('📁 Scanning for migrations (paths deduplicated)')
      MigrationRunner.didLogPathScan = true
    }

    // Find the first existing path
    let foundPath = false
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        this.migrationsPath = path

        // Count SQL files in the directory
        try {
          const files = readdirSync(path).filter((f) => f.endsWith('.sql'))
          logger.debug(`✅ Found migrations at: ${this.migrationsPath}`)
          logger.debug(`  ✓ Contains ${files.length} SQL files: ${files.join(', ')}`)
          foundPath = true
          break
        } catch (err) {
          logger.debug(`⚠️  Could not read directory ${path}: ${err}`)
        }
      }
    }

    // If no path found, use a fallback
    if (!foundPath) {
      logger.error(`❌ Migrations directory not found in any of the checked paths`)
      this.migrationsPath = join(__dirname, '../migrations')
      logger.warn(`⚠️  Using fallback path: ${this.migrationsPath}`)
    }
  }

  async runPendingMigrations(): Promise<void> {
    try {
      logger.info('🔄 Starting migration system...')

      // Ensure migration tracking table exists
      await this.migrationTracker.createTrackingTable()

      // Patch legacy restores so migrations that expect the historic `games` table can run
      await this.ensureLegacyCompatibility()

      // Get all migration files
      const availableMigrations = this.getAvailableMigrations()
      const appliedMigrations = await this.migrationTracker.getAppliedMigrations()

      // Find pending migrations
      let pendingMigrations = availableMigrations.filter(
        (migration) => !appliedMigrations.includes(migration),
      )

      // Special handling for baseline migrations: never execute them via the runner.
      // Baselines are pg_dump outputs and may contain psql meta-commands (e.g. \restrict) and DROP statements.
      const baselineFiles = pendingMigrations.filter((m) =>
        /^001_.*(baseline|complete|initial).*\.sql$/i.test(m),
      )
      if (baselineFiles.length > 0) {
        // If the DB already has key tables, just mark baseline(s) as completed and skip execution.
        // Even if the DB is empty, we still do not execute baseline via this runner to avoid accidental drops.
        for (const baseline of baselineFiles) {
          try {
            const fsPath = join(this.migrationsPath, baseline)
            const content = readFileSync(fsPath, 'utf8')
            const checksum = this.migrationTracker.calculateChecksum(content)
            await this.migrationTracker.markMigrationCompleted({
              filename: baseline,
              checksum,
              executed_at: new Date(),
              execution_time_ms: 0,
              status: 'completed',
              rollback_sql: '-- baseline marker only; no rollback',
            })
            logger.warn(`⏭️  Skipped baseline migration and marked completed: ${baseline}`)
          } catch (e) {
            logger.error(`❌ Failed to mark baseline as completed: ${baseline}`, e)
            // Continue without throwing to avoid blocking other real migrations
          }
        }
        // Remove baselines from pending list
        pendingMigrations = pendingMigrations.filter((m) => !baselineFiles.includes(m))
      }

      // IMPORTANT: Check if key tables actually exist, even if migration is marked as complete
      // This handles cases where migrations were marked complete but tables are missing
      const keyTablesExist = await this.checkKeyTablesExist()
      if (!keyTablesExist && pendingMigrations.length === 0) {
        logger.warn('⚠️  Key tables missing despite migrations marked as complete')
        logger.info('🔄 Re-running initial schema migration to create missing tables...')

        // Force re-run of initial schema if it exists
        const initialSchema = availableMigrations.find((m) => m === '001_initial_schema.sql')
        if (initialSchema) {
          pendingMigrations = [initialSchema]
          // Delete the migration record so it can run fresh
          // This is safer than trying to update status to 'pending' which violates constraints
          try {
            await query(
              `
              DELETE FROM schema_migrations 
              WHERE filename = $1
            `,
              [initialSchema],
            )
            logger.info('🗑️  Cleared migration record for re-run')
          } catch (_err) {
            logger.warn('⚠️  Could not clear migration record, will attempt to run anyway')
          }
        }
      }

      if (pendingMigrations.length === 0) {
        logger.info('✅ All migrations are up to date')
        return
      }

      logger.info(
        `📋 Found ${pendingMigrations.length} pending migrations:`,
        pendingMigrations.map((m) => `  - ${m}`).join('\n'),
      )

      // Run each pending migration
      for (const migrationFile of pendingMigrations) {
        await this.runSingleMigration(migrationFile)
      }

      logger.info('🎯 All pending migrations completed successfully')
    } catch (error) {
      logger.error('❌ Migration system failed:', error)
      throw error
    }
  }

  private async ensureLegacyCompatibility(): Promise<void> {
    try {
      logger.info('🧩 Checking legacy compatibility shims before running migrations')

      await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
      await query('CREATE EXTENSION IF NOT EXISTS citext')
      await query('CREATE EXTENSION IF NOT EXISTS pg_trgm')

      // Legacy 'games' shim is no longer created. New schema treats game_rooms as the canonical table.
      // Keep existing 'games' table if present, but do not auto-create it anymore.
      const gamesExistsResult = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'games'
         ) AS exists`,
      )
      const gamesExists = Boolean(gamesExistsResult.rows[0]?.exists)
      if (gamesExists) {
        logger.info('  ✅ games table present (legacy) — leaving as-is')
      } else {
        logger.info('  ℹ️ games table missing — skipping legacy compatibility shim (deprecated)')
      }
    } catch (error) {
      logger.error('  ❌ Failed to prepare legacy compatibility tables', error)
      throw error
    }

    const clanRolesTable = await query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'clan_roles'
      ) AS exists
    `,
    )

    const clanRolesExists = Boolean(clanRolesTable.rows[0]?.exists)

    if (clanRolesExists) {
      const clanRolesIndex = await query<{ exists: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'clan_roles'
            AND indexname = 'idx_clan_roles_clan_id_lower_name'
        ) AS exists
      `,
      )

      const clanRolesIndexExists = Boolean(clanRolesIndex.rows[0]?.exists)

      if (!clanRolesIndexExists) {
        logger.info(
          '  🔐 Backfilling case-insensitive uniqueness for clan role names (idx_clan_roles_clan_id_lower_name)',
        )

        await query(
          `
          CREATE UNIQUE INDEX idx_clan_roles_clan_id_lower_name
          ON clan_roles (clan_id, LOWER(name))
        `,
        )
      } else {
        logger.info('  ✅ Case-insensitive clan role name index already present')
      }
    }

    const approvalTable = await query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'map_approval_requests'
      ) AS exists
    `,
    )

    const approvalExists = Boolean(approvalTable.rows[0]?.exists)

    if (!approvalExists) {
      // Only create compatibility table if referenced tables exist (fresh DBs run baseline first)
      const mapVersionsExistsRes = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'map_versions'
         ) AS exists`,
      )
      const usersExistsRes = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'users'
         ) AS exists`,
      )
      const mapVersionsExists = Boolean(mapVersionsExistsRes.rows[0]?.exists)
      const usersExists = Boolean(usersExistsRes.rows[0]?.exists)

      if (!mapVersionsExists || !usersExists) {
        logger.info(
          '  ℹ️ Skipping compatibility map_approval_requests creation (missing prerequisites: map_versions/users). Baseline will create full schema.',
        )
        return
      }
      logger.warn('  ⚠️ map_approval_requests table missing — creating compatibility table')

      await query(`
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
      `)

      await query(
        `
        CREATE INDEX idx_map_approval_requests_version
        ON map_approval_requests(version_id)
      `,
      )

      await query(
        `
        CREATE INDEX idx_map_approval_requests_requester
        ON map_approval_requests(requester_id)
      `,
      )

      await query(
        `
        CREATE INDEX idx_map_approval_requests_decision
        ON map_approval_requests(decision)
      `,
      )

      await query(
        `
        CREATE OR REPLACE FUNCTION update_map_approval_requests_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `,
      )

      await query(
        'DROP TRIGGER IF EXISTS trg_map_approval_requests_updated_at ON map_approval_requests',
      )

      await query(
        `
        CREATE TRIGGER trg_map_approval_requests_updated_at
        BEFORE UPDATE ON map_approval_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_map_approval_requests_updated_at()
      `,
      )

      logger.info('  ✅ Created compatibility map_approval_requests table')
    }
  }

  async runSingleMigration(migrationFile: string): Promise<void> {
    const startTime = Date.now()
    let migrationSQL: string | undefined

    try {
      // Validate migration integrity
      const isValid = await this.migrationTracker.validateMigrationIntegrity(migrationFile)
      if (!isValid) {
        throw new Error(`Migration integrity check failed: ${migrationFile}`)
      }

      // Read migration file
      const migrationPath = join(this.migrationsPath, migrationFile)
      const originalSQL = readFileSync(migrationPath, 'utf8')

      // Log original SQL characteristics
      logger.info(`📄 Processing migration: ${migrationFile}`)
      logger.info(`  Original SQL length: ${originalSQL.length} characters`)
      logger.info(
        `  Contains legacy UUID patterns: ${originalSQL.includes('randomblob') ? 'YES' : 'NO'}`,
      )
      logger.info(
        `  Contains TEXT PRIMARY KEY: ${originalSQL.includes('TEXT PRIMARY KEY') ? 'YES' : 'NO'}`,
      )

      // Convert legacy syntax to PostgreSQL if needed
      migrationSQL = this.convertLegacyToPostgreSQL(originalSQL)

      // Log conversion results
      logger.info(`  Converted SQL length: ${migrationSQL.length} characters`)
      logger.info(`  UUID conversions applied: ${originalSQL !== migrationSQL ? 'YES' : 'NO'}`)

      // Log first 500 chars of converted SQL for debugging (without sensitive data)
      if (originalSQL !== migrationSQL) {
        const preview = migrationSQL.substring(0, 500).replace(/\n/g, ' ')
        logger.info(`  Converted SQL preview: ${preview}...`)
      }

      logger.info(`🔧 Executing migration: ${migrationFile}`)

      // Execute migration in a transaction
      await this.executeInTransaction(migrationSQL, migrationFile)

      // Record successful migration
      const executionTime = Date.now() - startTime
      const checksum = this.migrationTracker.calculateChecksum(migrationSQL)

      const record: MigrationRecord = {
        filename: migrationFile,
        checksum,
        executed_at: new Date(),
        execution_time_ms: executionTime,
        status: 'completed',
        rollback_sql: this.generateRollbackHints(migrationSQL),
      }

      await this.migrationTracker.markMigrationCompleted(record)

      logger.info(`✅ Migration completed: ${migrationFile} (${executionTime}ms)`)
    } catch (error) {
      const executionTime = Date.now() - startTime

      logger.error(`❌ Migration failed: ${migrationFile}`, error)

      // Record failed migration
      try {
        const checksum = migrationSQL
          ? this.migrationTracker.calculateChecksum(migrationSQL)
          : 'unknown'
        const record: MigrationRecord = {
          filename: migrationFile,
          checksum,
          executed_at: new Date(),
          execution_time_ms: executionTime,
          status: 'failed',
        }

        await this.migrationTracker.markMigrationCompleted(record)
      } catch (trackingError) {
        logger.error('❌ Failed to record migration failure:', trackingError)
      }

      throw error
    }
  }

  private getAvailableMigrations(): string[] {
    try {
      logger.debug(`📁 Checking migration files in: ${this.migrationsPath}`)

      if (!existsSync(this.migrationsPath)) {
        logger.warn(`⚠️  Migrations directory not found: ${this.migrationsPath}`)
        return []
      }

      const allFiles = readdirSync(this.migrationsPath)
      logger.debug(`  Found ${allFiles.length} total files: ${allFiles.join(', ')}`)

      const sqlFiles = allFiles
        .filter(
          (file) => file.endsWith('.sql') && !file.includes('_mysql') && !file.includes('_sqlite'),
        )
        .sort() // Ensure migrations run in order

      logger.debug(`  ✅ Found ${sqlFiles.length} migration files: ${sqlFiles.join(', ')}`)
      return sqlFiles
    } catch (error) {
      logger.error(`❌ Failed to read migrations directory ${this.migrationsPath}:`, error)
      return []
    }
  }

  private convertLegacyToPostgreSQL(migrationSQL: string): string {
    let convertedSQL = migrationSQL

    // IMPORTANT: Convert UUID generation patterns FIRST, before changing TEXT to UUID
    // This prevents double DEFAULT clauses

    // Convert complex legacy UUID v4 pattern to PostgreSQL
    const legacyUuidV4Regex =
      /DEFAULT \(lower\(hex\(randomblob\(4\)\)\) \|\| '-' \|\| lower\(hex\(randomblob\(2\)\)\) \|\| '-4' \|\| substr\(lower\(hex\(randomblob\(2\)\)\),2\) \|\| '-' \|\| substr\('ab89',1\+abs\(random\(\)\)%4,1\) \|\| substr\(lower\(hex\(randomblob\(2\)\)\),2\) \|\| '-' \|\| lower\(hex\(randomblob\(6\)\)\)\)/g
    convertedSQL = convertedSQL.replace(legacyUuidV4Regex, 'DEFAULT uuid_generate_v4()')

    // Convert simple legacy UUID pattern (randomblob(16)) to PostgreSQL
    const legacySimpleUuidRegex = /DEFAULT \(lower\(hex\(randomblob\(16\)\)\)\)/g
    convertedSQL = convertedSQL.replace(legacySimpleUuidRegex, 'DEFAULT uuid_generate_v4()')

    // Now convert TEXT PRIMARY KEY fields to UUID PRIMARY KEY
    // Handle cases WITH existing DEFAULT clause (already converted above)
    convertedSQL = convertedSQL.replace(
      /(\w+) TEXT PRIMARY KEY DEFAULT uuid_generate_v4\(\)/g,
      '$1 UUID PRIMARY KEY DEFAULT uuid_generate_v4()',
    )

    // Handle cases WITHOUT DEFAULT clause
    convertedSQL = convertedSQL.replace(
      /(\w+) TEXT PRIMARY KEY(?! DEFAULT)/g,
      '$1 UUID PRIMARY KEY DEFAULT uuid_generate_v4()',
    )

    // Convert foreign key TEXT fields to UUID
    convertedSQL = convertedSQL.replace(/user_id TEXT/g, 'user_id UUID')
    convertedSQL = convertedSQL.replace(/creator_id TEXT/g, 'creator_id UUID')
    convertedSQL = convertedSQL.replace(/room_id TEXT/g, 'room_id UUID')
    convertedSQL = convertedSQL.replace(/game_state_id TEXT/g, 'game_state_id UUID')
    convertedSQL = convertedSQL.replace(/map_id TEXT/g, 'map_id UUID')
    convertedSQL = convertedSQL.replace(/game_mode_id TEXT/g, 'game_mode_id UUID')
    convertedSQL = convertedSQL.replace(/continent_id TEXT/g, 'continent_id UUID')
    convertedSQL = convertedSQL.replace(/ability_type_id TEXT/g, 'ability_type_id UUID')
    convertedSQL = convertedSQL.replace(/from_territory_id TEXT/g, 'from_territory_id UUID')
    convertedSQL = convertedSQL.replace(/to_territory_id TEXT/g, 'to_territory_id UUID')

    // Remove AUTOINCREMENT (PostgreSQL uses SERIAL)
    convertedSQL = convertedSQL.replace(/AUTOINCREMENT/g, '')

    // Convert DATETIME to TIMESTAMP (PostgreSQL standard)
    convertedSQL = convertedSQL.replace(/DATETIME/g, 'TIMESTAMP')

    // Convert TEXT to appropriate PostgreSQL types for JSON fields
    convertedSQL = convertedSQL.replace(/TEXT DEFAULT '\[\]'/g, "JSONB DEFAULT '[]'")
    convertedSQL = convertedSQL.replace(/TEXT DEFAULT '\{\}'/g, "JSONB DEFAULT '{}'")

    // Handle legacy INSERT OR IGNORE - convert to ON CONFLICT DO NOTHING
    convertedSQL = convertedSQL.replace(/INSERT OR IGNORE/g, 'INSERT')

    // Add ON CONFLICT DO NOTHING for INSERT statements that might conflict
    if (
      convertedSQL.includes('INSERT INTO game_modes') ||
      convertedSQL.includes('INSERT INTO territory_ability_types') ||
      convertedSQL.includes('INSERT INTO map_status')
    ) {
      // These inserts typically have unique constraints
      convertedSQL = convertedSQL.replace(
        /(INSERT INTO (?:game_modes|territory_ability_types|map_status)[^;]+);/g,
        '$1 ON CONFLICT DO NOTHING;',
      )
    }

    // Normalize unsupported UNIQUE constraints that use expressions (PostgreSQL requires a functional index instead)
    convertedSQL = convertedSQL.replace(
      'CONSTRAINT clan_roles_name_unique UNIQUE (clan_id, LOWER(name))',
      'CONSTRAINT clan_roles_name_unique UNIQUE (clan_id, name)',
    )

    return convertedSQL
  }

  private async executeInTransaction(migrationSQL: string, _migrationFile: string): Promise<void> {
    // Begin transaction
    await query('BEGIN')

    try {
      // Enable uuid-ossp extension if not exists (for UUID generation)
      logger.info('  Enabling uuid-ossp extension...')
      await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

      // Split migration into individual statements
      const statements = this.splitMigrationStatements(migrationSQL)
      logger.info(`  Migration contains ${statements.length} SQL statements`)

      // Execute each statement
      let statementCount = 0
      for (const statement of statements) {
        if (statement.trim()) {
          statementCount++
          const statementPreview = statement.substring(0, 100).replace(/\n/g, ' ')

          try {
            logger.debug(
              `  Executing statement ${statementCount}/${statements.length}: ${statementPreview}...`,
            )
            await query(statement)
          } catch (error) {
            const { message: errorMessage, code: errorCode } = this.extractErrorDetails(error)

            if (this.isAcceptableError(errorMessage, statement)) {
              logger.debug(`  ⏭️  Skipped expected error: ${errorMessage}`)
              continue
            }

            // Log detailed error information
            logger.error(`  ❌ Statement ${statementCount} failed:`)
            logger.error(`     Error code: ${errorCode}`)
            logger.error(`     Error message: ${errorMessage}`)
            logger.error(`     Statement preview: ${statementPreview}`)
            logger.error(`     Full statement (first 500 chars): ${statement.substring(0, 500)}`)

            // If parser got confused by dollar-quoted blocks, try a safe fallback.
            const msg = errorMessage.toLowerCase()
            const looksLikeDollarQuoteIssue =
              msg.includes('unterminated dollar-quoted string') ||
              msg.includes('syntax error at or near "$$"') ||
              /syntax error at or near "\$[a-z_][a-z0-9_]*\$"/i.test(errorMessage)
            if (looksLikeDollarQuoteIssue) {
              try {
                logger.warn(
                  '  ⚠️  Detected dollar-quote parsing issue. Falling back to whole-script execution',
                )
                // Abort current transaction and retry by executing the entire script at once
                await query('ROLLBACK')
                await query('BEGIN')
                await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
                await query(migrationSQL)
                await query('COMMIT')
                logger.info('  ✅ Whole-script execution succeeded after parser fallback')
                return
              } catch (fallbackErr) {
                logger.error('  ❌ Fallback whole-script execution failed:', fallbackErr)
                throw error
              }
            }
            throw error
          }
        }
      }

      // Commit transaction
      await query('COMMIT')
    } catch (error) {
      // Rollback transaction on any error
      await query('ROLLBACK')
      throw error
    }
  }

  private splitMigrationStatements(migrationSQL: string): string[] {
    const statements: string[] = []
    let currentStatement = ''
    let inFunction = false
    let inDoBlock = false
    let dollarQuoteCount = 0
    let pendingDoStart = false

    const lines = migrationSQL.split('\n')
    for (const line of lines) {
      const trimmedLine = line.trim()
      const upper = trimmedLine.toUpperCase()

      // Track dollar-quoted strings (PostgreSQL function/DO syntax). This detects $$ or $tag$
      const dollarMatches = line.match(/\$\$|\$[a-zA-Z_][a-zA-Z0-9_]*\$/g)
      if (dollarMatches) {
        dollarQuoteCount += dollarMatches.length
      }

      // Detect function blocks (outside of a DO block)
      if (
        !inDoBlock &&
        (upper.includes('CREATE FUNCTION') || upper.includes('CREATE OR REPLACE FUNCTION'))
      ) {
        inFunction = true
        pendingDoStart = false
      }

      // Detect DO blocks, including cases where the dollar quote starts on the next line
      if (!inFunction && !inDoBlock) {
        if (/^DO\b/i.test(trimmedLine)) {
          if (/\$(?:\$|[A-Za-z_][A-Za-z0-9_]*)\$/.test(trimmedLine)) {
            inDoBlock = true
            pendingDoStart = false
          } else {
            pendingDoStart = true
          }
        } else if (pendingDoStart) {
          if (/\$(?:\$|[A-Za-z_][A-Za-z0-9_]*)\$/.test(trimmedLine)) {
            inDoBlock = true
            pendingDoStart = false
          } else if (
            trimmedLine &&
            !trimmedLine.startsWith('--') &&
            !trimmedLine.startsWith('/*')
          ) {
            pendingDoStart = false
          }
        }
      }

      currentStatement += `${line}\n`

      // Determine if this line ends a statement
      if (trimmedLine.endsWith(';')) {
        const insideDollar = dollarQuoteCount % 2 !== 0

        if (inFunction) {
          // End of function when we are outside the dollar-quoted body
          if (!insideDollar) {
            statements.push(currentStatement.trim())
            currentStatement = ''
            inFunction = false
            dollarQuoteCount = 0
          }
        } else if (inDoBlock) {
          // DO blocks end when we close the dollar-quoted body and see the trailing ;
          // Common patterns: "END; $$;" or "END $$;" or just "$$;" on its own line
          if (!insideDollar) {
            statements.push(currentStatement.trim())
            currentStatement = ''
            inDoBlock = false
            dollarQuoteCount = 0
            pendingDoStart = false
          }
        } else if (!insideDollar) {
          // Regular statement (not inside function/DO body)
          statements.push(currentStatement.trim())
          currentStatement = ''
          pendingDoStart = false
        }
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim())
    }

    return statements
  }

  private isAcceptableError(errorMessage: string, statement: string): boolean {
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
    ]

    const acceptableStatements = [
      'CREATE TABLE IF NOT EXISTS',
      'CREATE INDEX IF NOT EXISTS',
      'INSERT', // For ON CONFLICT DO NOTHING
      'ALTER TABLE',
      'DROP TABLE IF EXISTS',
      'CREATE EXTENSION IF NOT EXISTS',
      'CREATE OR REPLACE FUNCTION',
    ]

    const hasAcceptableError = acceptableErrors.some((error) =>
      errorMessage.toLowerCase().includes(error),
    )

    const hasAcceptableStatement = acceptableStatements.some((stmt) =>
      statement.toUpperCase().includes(stmt),
    )

    return hasAcceptableError || hasAcceptableStatement
  }

  private generateRollbackHints(migrationSQL: string): string {
    // Generate basic rollback hints (not full rollback SQL)
    const hints: string[] = []
    const lines = migrationSQL.split('\n')

    for (const line of lines) {
      const trimmedLine = line.trim().toUpperCase()

      if (trimmedLine.startsWith('CREATE TABLE')) {
        const match = trimmedLine.match(/CREATE TABLE (?:IF NOT EXISTS )?([\\w_]+)/)
        if (match) {
          hints.push(`-- DROP TABLE IF EXISTS ${match[1]};`)
        }
      } else if (trimmedLine.startsWith('ALTER TABLE') && trimmedLine.includes('ADD COLUMN')) {
        const tableMatch = trimmedLine.match(/ALTER TABLE ([\\w_]+)/)
        const columnMatch = trimmedLine.match(/ADD COLUMN ([\\w_]+)/)
        if (tableMatch && columnMatch) {
          hints.push(`-- ALTER TABLE ${tableMatch[1]} DROP COLUMN IF EXISTS ${columnMatch[1]};`)
        }
      }
    }

    return hints.join('\n')
  }

  async checkKeyTablesExist(): Promise<boolean> {
    try {
      // Check if essential tables exist
      const keyTables = ['users', 'maps', 'game_rooms', 'game_states', 'user_admin_roles']

      for (const tableName of keyTables) {
        const result = await query(
          `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `,
          [tableName],
        )

        if (!result.rows[0].exists) {
          logger.warn(`⚠️  Key table missing: ${tableName}`)
          return false
        }
      }

      return true
    } catch (error) {
      logger.error('❌ Error checking key tables:', error)
      return false
    }
  }

  async validateSchemaIntegrity(): Promise<boolean> {
    try {
      // Basic validation - check if key tables exist
      const keyTables = ['users', 'game_rooms', 'game_states', 'maps', 'user_admin_roles']

      for (const tableName of keyTables) {
        const result = await query(
          `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `,
          [tableName],
        )

        if (!result.rows[0].exists) {
          logger.error(`❌ Schema validation failed: Missing table ${tableName}`)
          return false
        }
      }

      logger.info('✅ Schema integrity validation passed')
      return true
    } catch (error) {
      logger.error('❌ Schema integrity validation failed:', error)
      return false
    }
  }

  private extractErrorDetails(error: unknown): { message: string; code: string } {
    const message = error instanceof Error ? error.message : String(error)

    if (typeof error === 'object' && error !== null && 'code' in error) {
      const codeValue = (error as { code?: unknown }).code
      if (typeof codeValue === 'string') {
        return { message, code: codeValue }
      }
    }

    return { message, code: '' }
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    return await this.migrationTracker.getAllMigrationStatuses()
  }
}

// Legacy function - use MigrationRunner class instead
export async function runMigrations() {
  logger.warn('⚠️  Using legacy runMigrations - consider using MigrationRunner class')

  const migrationRunner = new MigrationRunner()
  await migrationRunner.runPendingMigrations()
}

// Legacy function - use MigrationRunner class instead
export async function runMigration(migrationFile: string) {
  logger.warn(
    `⚠️  Using legacy runMigration for ${migrationFile} - consider using MigrationRunner class`,
  )

  const migrationRunner = new MigrationRunner()
  await migrationRunner.runSingleMigration(migrationFile)
}
