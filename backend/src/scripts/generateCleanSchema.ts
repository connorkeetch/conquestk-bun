/**
 * Generate a clean schema SQL from current database using SQL queries
 * No pg_dump required - pure TypeScript/SQL approach
 *
 * The output is a single, runner-executable baseline (no psql meta-commands or
 * SET statements like pg_dump emits). It is applied as one transactional script
 * by MigrationRunner.executeBaselineInTransaction, so object ordering matters:
 *   Extensions -> Enums -> Sequences -> Functions -> Tables
 *     -> Sequence Ownership -> Foreign Keys -> Indexes
 * Sequences and functions are emitted BEFORE tables because table column
 * DEFAULTs reference them (e.g. nextval('client_metrics_id_seq'),
 * generate_ulid()) and those references are resolved at table-creation time.
 *
 * Known residual gaps (intentionally NOT emitted — they are not bootstrap
 * blockers, but this file is therefore not a 100% faithful schema dump):
 *   - Triggers and trigger functions are only partially covered: plain
 *     functions are emitted (pg_get_functiondef), but TRIGGERs themselves are
 *     not. updated_at columns still default to now(), so inserts succeed.
 *   - CHECK constraints are not emitted (they live in pg_constraint contype='c').
 * If full fidelity is ever required, prefer pg_dump --schema-only and teach the
 * runner to apply that file directly.
 */
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { Pool } from 'pg'

dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '../../migrations')

// Tables that are owned by the migration runner itself, not part of the
// application schema. schema_migrations is created/maintained by
// MigrationTracker.createTrackingTable(); emitting it here would conflict with
// the table that already exists when the baseline runs. Anything related to it
// (its sequence, indexes) is excluded too.
const EXCLUDED_TABLES = new Set<string>(['schema_migrations'])

async function generateCleanSchema() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  // Only negotiate SSL for managed/remote databases (Railway, production).
  // Local Postgres (docker-compose) does not support SSL, and forcing it there
  // makes regeneration/verification impossible.
  const needsSsl = databaseUrl.includes('railway') || process.env.NODE_ENV === 'production'

  console.log('Connecting to database...')
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    max: 1,
  })

  try {
    let sql = `-- ConquestK Database Schema
-- Generated: ${new Date().toISOString()}
-- Single squashed migration for clean deployments

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

`

    // Get enum types
    console.log('Extracting enum types...')
    const enums = await pool.query(`
      SELECT
        t.typname as enum_name,
        string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname
    `)

    if (enums.rows.length > 0) {
      sql += '-- Enum Types\n'
      for (const e of enums.rows) {
        const values = e.enum_values
          .split(',')
          .map((v: string) => `'${v}'`)
          .join(', ')
        sql += `CREATE TYPE ${e.enum_name} AS ENUM (${values});\n`
      }
      sql += '\n'
    }

    // Discover sequence ownership (deptype 'a' = sequence auto-owned by a column,
    // i.e. the result of SERIAL/BIGSERIAL). Used both to skip sequences belonging
    // to excluded tables and to re-emit ALTER SEQUENCE ... OWNED BY after tables.
    const ownership = await pool.query(`
      SELECT seq.relname AS sequence_name,
             tab.relname AS table_name,
             att.attname AS column_name
      FROM pg_depend d
      JOIN pg_class seq ON seq.oid = d.objid AND seq.relkind = 'S'
      JOIN pg_class tab ON tab.oid = d.refobjid
      JOIN pg_attribute att ON att.attrelid = d.refobjid AND att.attnum = d.refobjsubid
      JOIN pg_namespace n ON n.oid = seq.relnamespace
      WHERE d.deptype = 'a' AND n.nspname = 'public'
    `)
    const ownerBySequence = new Map<string, { table: string; column: string }>()
    for (const row of ownership.rows) {
      ownerBySequence.set(row.sequence_name, { table: row.table_name, column: row.column_name })
    }

    // Get sequences (must come before the tables whose column DEFAULTs call
    // nextval()). Skip sequences owned by excluded tables.
    console.log('Extracting sequences...')
    const sequences = await pool.query(`
      SELECT sequencename,
             data_type::text AS data_type,
             start_value,
             increment_by
      FROM pg_sequences
      WHERE schemaname = 'public'
      ORDER BY sequencename
    `)

    const emittedSequences = sequences.rows.filter((s) => {
      const owner = ownerBySequence.get(s.sequencename)
      return !owner || !EXCLUDED_TABLES.has(owner.table)
    })

    if (emittedSequences.length > 0) {
      sql += '-- Sequences\n'
      for (const s of emittedSequences) {
        sql +=
          `CREATE SEQUENCE IF NOT EXISTS ${s.sequencename} AS ${s.data_type} ` +
          `START WITH ${s.start_value} INCREMENT BY ${s.increment_by};\n`
      }
      sql += '\n'
    }

    // Get user-defined functions (must come before tables when a column DEFAULT
    // calls one, e.g. generate_ulid()). pg_get_functiondef emits complete,
    // correctly dollar-quoted CREATE OR REPLACE FUNCTION statements. Extension-
    // provided functions (deptype 'e') are excluded.
    console.log('Extracting functions...')
    const functions = await pool.query(`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
        )
      ORDER BY p.proname
    `)

    if (functions.rows.length > 0) {
      sql += '-- Functions\n'
      for (const fn of functions.rows) {
        sql += `${fn.definition};\n\n`
      }
    }

    // Get tables in dependency order (no FKs first, then tables with FKs)
    console.log('Extracting tables...')
    const tables = await pool.query(`
      SELECT c.relname as table_name
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname NOT LIKE 'pg_%'
      ORDER BY c.relname
    `)

    sql += '-- Tables\n'

    for (const table of tables.rows) {
      const tableName = table.table_name
      if (EXCLUDED_TABLES.has(tableName)) {
        continue
      }

      // Get columns. attgenerated = 's' marks a STORED generated column; for
      // those the pg_attrdef expression is the generation expression, NOT a
      // DEFAULT, and must be emitted as GENERATED ALWAYS AS (...) STORED.
      const cols = await pool.query(
        `
        SELECT
          a.attname as name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
          a.attnotnull as notnull,
          a.attgenerated as generated,
          (SELECT pg_get_expr(d.adbin, d.adrelid)
           FROM pg_attrdef d
           WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum) as default_val
        FROM pg_attribute a
        WHERE a.attrelid = $1::regclass
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
      `,
        [`public.${tableName}`],
      )

      // Get primary key columns
      const pkResult = await pool.query(
        `
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
      `,
        [`public.${tableName}`],
      )

      const pkCols = pkResult.rows.map((r) => r.attname)

      sql += `CREATE TABLE ${tableName} (\n`

      const colDefs: string[] = []
      for (const col of cols.rows) {
        let def = `  ${col.name} ${col.type}`
        if (col.generated === 's' && col.default_val) {
          // STORED generated column. pg_get_expr already wraps the expression in
          // parentheses, but guard in case it ever doesn't.
          const expr = col.default_val.startsWith('(') ? col.default_val : `(${col.default_val})`
          def += ` GENERATED ALWAYS AS ${expr} STORED`
          if (col.notnull && !pkCols.includes(col.name)) {
            def += ' NOT NULL'
          }
        } else {
          if (col.default_val) {
            def += ` DEFAULT ${col.default_val}`
          }
          if (col.notnull && !pkCols.includes(col.name)) {
            def += ' NOT NULL'
          }
        }
        colDefs.push(def)
      }

      if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pkCols.join(', ')})`)
      }

      sql += colDefs.join(',\n')
      sql += '\n);\n\n'
    }

    // Re-attach SERIAL/BIGSERIAL sequence ownership now that the tables exist.
    // Standalone sequences (no owner) and excluded tables are skipped.
    const ownedToEmit = emittedSequences
      .map((s) => ({ sequence: s.sequencename, owner: ownerBySequence.get(s.sequencename) }))
      .filter((s) => s.owner && !EXCLUDED_TABLES.has(s.owner.table))

    if (ownedToEmit.length > 0) {
      sql += '-- Sequence Ownership\n'
      for (const s of ownedToEmit) {
        sql += `ALTER SEQUENCE ${s.sequence} OWNED BY ${s.owner?.table}.${s.owner?.column};\n`
      }
      sql += '\n'
    }

    // Get foreign keys
    console.log('Extracting foreign keys...')
    const fks = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS ref_table,
        ccu.column_name AS ref_column,
        tc.constraint_name,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name
    `)

    const emittedFks = fks.rows.filter(
      (fk) => !EXCLUDED_TABLES.has(fk.table_name) && !EXCLUDED_TABLES.has(fk.ref_table),
    )

    if (emittedFks.length > 0) {
      sql += '-- Foreign Keys\n'
      for (const fk of emittedFks) {
        sql += `ALTER TABLE ${fk.table_name} ADD CONSTRAINT ${fk.constraint_name} `
        sql += `FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.ref_table}(${fk.ref_column})`
        if (fk.delete_rule === 'CASCADE') {
          sql += ' ON DELETE CASCADE'
        } else if (fk.delete_rule === 'SET NULL') {
          sql += ' ON DELETE SET NULL'
        }
        sql += ';\n'
      }
      sql += '\n'
    }

    // Get indexes (non-primary key, non-unique constraint)
    console.log('Extracting indexes...')
    const indexes = await pool.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname
    `)

    const emittedIndexes = indexes.rows.filter((idx) => !EXCLUDED_TABLES.has(idx.tablename))

    if (emittedIndexes.length > 0) {
      sql += '-- Indexes\n'
      for (const idx of emittedIndexes) {
        sql += `${idx.indexdef};\n`
      }
      sql += '\n'
    }

    // Delete old migrations
    console.log('\nRemoving old migrations...')
    const oldMigrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    for (const file of oldMigrations) {
      unlinkSync(join(migrationsDir, file))
      console.log(`  Deleted: ${file}`)
    }

    // Write new migration
    const newPath = join(migrationsDir, '001_initial_schema.sql')
    writeFileSync(newPath, sql)
    console.log(`\n✅ Created: 001_initial_schema.sql (${(sql.length / 1024).toFixed(1)} KB)`)

    // Reset migration tracking
    console.log('\nResetting migration tracking...')
    await pool.query('DELETE FROM schema_migrations')
    await pool.query(`
      INSERT INTO schema_migrations (filename, checksum, executed_at, execution_time_ms, status)
      VALUES ('001_initial_schema.sql', 'squashed-${Date.now()}', NOW(), 0, 'completed')
    `)

    console.log('\n🎉 Done! Migrations squashed into single file.')
    console.log('Your database schema is unchanged - only migration files were updated.')
  } catch (error) {
    console.error('❌ Failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

generateCleanSchema()
