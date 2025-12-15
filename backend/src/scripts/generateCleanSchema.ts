/**
 * Generate a clean schema SQL from current database using SQL queries
 * No pg_dump required - pure TypeScript/SQL approach
 */
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { Pool } from 'pg'

dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '../../migrations')

async function generateCleanSchema() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  console.log('Connecting to database...')
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
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

      // Get columns
      const cols = await pool.query(
        `
        SELECT
          a.attname as name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
          a.attnotnull as notnull,
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
        if (col.default_val) {
          def += ` DEFAULT ${col.default_val}`
        }
        if (col.notnull && !pkCols.includes(col.name)) {
          def += ' NOT NULL'
        }
        colDefs.push(def)
      }

      if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pkCols.join(', ')})`)
      }

      sql += colDefs.join(',\n')
      sql += '\n);\n\n'
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

    if (fks.rows.length > 0) {
      sql += '-- Foreign Keys\n'
      for (const fk of fks.rows) {
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
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname
    `)

    if (indexes.rows.length > 0) {
      sql += '-- Indexes\n'
      for (const idx of indexes.rows) {
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
      INSERT INTO schema_migrations (filename, checksum, executed_at, status)
      VALUES ('001_initial_schema.sql', 'squashed-${Date.now()}', NOW(), 'completed')
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
