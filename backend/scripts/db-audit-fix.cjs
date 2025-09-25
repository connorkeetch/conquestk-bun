/*
  Audit and fix critical DB schema for messaging + clans.
  - Connects via DATABASE_URL (do not log it)
  - Ensures required extensions and update_updated_at_column() exist
  - Applies 031 (conversations) and 038 (clan core) if any of their tables are missing
  - Marks migrations as completed in schema_migrations
*/

const { Client } = require('pg')
const { readFileSync } = require('fs')
const { createHash } = require('crypto')
const path = require('path')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required in environment to run db-audit-fix')
  process.exit(1)
}

const MIG_DIR = path.join(__dirname, '..', 'migrations')
const MIG_031 = '031_create_conversations_schema.sql'
const MIG_038 = '038_create_clan_core_tables.sql'

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

async function query(client, text, params) {
  return await client.query(text, params)
}

async function ensureExtensions(client) {
  const exts = [
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    'CREATE EXTENSION IF NOT EXISTS pgcrypto',
    'CREATE EXTENSION IF NOT EXISTS pg_trgm',
    'CREATE EXTENSION IF NOT EXISTS citext',
  ]
  for (const stmt of exts) {
    await query(client, stmt)
  }
}

async function ensureUpdatedAtFunction(client) {
  const res = await query(
    client,
    `SELECT EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
     ) as exists`,
  )
  if (!res.rows[0].exists) {
    const fn = `CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`
    await query(client, fn)
  }
}

async function tableExists(client, table) {
  const r = await query(
    client,
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema='public' AND table_name=$1
     ) as exists` ,
     [table]
  )
  return r.rows[0].exists
}

async function ensureSchemaMigrations(client) {
  await query(
    client,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id SERIAL PRIMARY KEY,
       filename VARCHAR(255) UNIQUE NOT NULL,
       checksum VARCHAR(64) NOT NULL,
       executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
       execution_time_ms INTEGER NOT NULL,
       status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed','failed','rolled_back')),
       rollback_sql TEXT,
       created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
     )`
  )
}

async function markCompleted(client, filename, sql, ms) {
  const checksum = sha256(sql)
  await query(
    client,
    `INSERT INTO schema_migrations (filename, checksum, executed_at, execution_time_ms, status)
     VALUES ($1,$2,NOW(),$3,'completed')
     ON CONFLICT (filename) DO UPDATE SET
       checksum = EXCLUDED.checksum,
       executed_at = EXCLUDED.executed_at,
       execution_time_ms = EXCLUDED.execution_time_ms,
       status = EXCLUDED.status`,
    [filename, checksum, ms]
  )
}

function splitSqlSimple(sql) {
  // For our 038 file there are no DO $$ blocks; safe to split on semicolons.
  // Keep semicolons by adding back when running.
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s + ';')
}

async function needsConversationSchema(client) {
  const needed = [
    'conversations',
    'conversation_messages',
    'conversation_members',
    'message_read_receipts',
    'user_blocks',
  ]
  for (const t of needed) {
    if (!(await tableExists(client, t))) return true
  }
  return false
}

async function tableExistsQuick(client, name) {
  return await tableExists(client, name)
}

async function needsClanSchema(client) {
  const needed = [
    'clans',
    'clan_roles',
    'clan_members',
    'clan_applications',
    'clan_invitations',
    'clan_announcements',
    'clan_activity_log',
    'clan_wars',
    'clan_war_matches',
    'clan_objectives',
    'clan_chat_messages',
    'user_clan_preferences',
  ]
  for (const t of needed) {
    if (!(await tableExists(client, t))) return true
  }
  return false
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    console.log('🔧 Ensuring extensions and helper function...')
    await ensureExtensions(client)
    await ensureUpdatedAtFunction(client)
    await ensureSchemaMigrations(client)

    // Conversations
    if (await needsConversationSchema(client)) {
      console.log('🧩 Applying 031 (conversations schema)...')
      let sql = readFileSync(path.join(MIG_DIR, MIG_031), 'utf8')
      // Adapt FK if 'games' table does not exist in this DB (older schema uses game_rooms)
      if (!(await tableExistsQuick(client, 'games'))) {
        sql = sql.replace(/REFERENCES\s+games\(id\)/g, 'REFERENCES game_rooms(id)')
      }
      const t0 = Date.now()
      await query(client, sql)
      const dt = Date.now() - t0
      await markCompleted(client, MIG_031, sql, dt)
      console.log(`✅ 031 applied (${dt}ms)`)    
    } else {
      console.log('✅ Conversations schema present')
    }

    // Clans
    if (await needsClanSchema(client)) {
      console.log('🧩 Applying 038 (clan core tables)...')
      let sql = readFileSync(path.join(MIG_DIR, MIG_038), 'utf8')
      // 038 contains an invalid UNIQUE constraint using LOWER(name); switch to a unique index.
      sql = sql.replace(/\n\s*CONSTRAINT\s+clan_roles_name_unique\s+UNIQUE\s*\(\s*clan_id\s*,\s*LOWER\(name\)\s*\)\s*,?/i, '\n')
      // Adapt feature_flags.dependencies cast if table uses jsonb instead of text[]
      const depType = await client.query(
        `SELECT data_type, udt_name FROM information_schema.columns WHERE table_name='feature_flags' AND column_name='dependencies'`
      )
      if (depType.rows.length && depType.rows[0].data_type === 'jsonb') {
        sql = sql.replace(/'\{\}'::text\[\]/g, "'{}'::jsonb")
      }
      const t0 = Date.now()
      // Execute statement by statement to surface exact failure
      const stmts = splitSqlSimple(sql)
      for (const stmt of stmts) {
        try {
          await query(client, stmt)
        } catch (e) {
          console.error('❌ 038 failed on statement:\n---\n' + stmt + '\n---')
          console.error('    Error:', e.message)
          throw e
        }
      }
      // Ensure unique index for LOWER(name) exists
      await query(client, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_clan_roles_name_unique ON clan_roles(clan_id, LOWER(name))')
      const dt = Date.now() - t0
      await markCompleted(client, MIG_038, sql, dt)
      console.log(`✅ 038 applied (${dt}ms)`)    
    } else {
      console.log('✅ Clan schema present')
    }

    console.log('🎯 DB audit done')
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error('❌ db-audit-fix failed:', err && err.message ? err.message : err)
  process.exit(1)
})
