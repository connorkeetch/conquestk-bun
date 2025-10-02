# ConquestK Database Schema

Generated on 2025-10-02T17:56:02.737Z

> This document is generated via `npm run check:schema -- --skip-validation --export ../docs/operations/database-schema.md`. Run the command after any migration changes to keep it current.

## Overview

- Database: `risk_game_local`
- Schema: `public`
- PostgreSQL: PostgreSQL 18.0
- Tables: 1
- Row counts reflect the snapshot captured when this file was generated.

## Table Summary

| Table | Columns | Rows |
| --- | ---: | ---: |
| `schema_migrations` | 8 | 3 |

## Tables

### `schema_migrations`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `integer` | No | `nextval('schema_migrations_id_seq')` |
| `filename` | `varchar(255)` | No | — |
| `checksum` | `varchar(64)` | No | — |
| `executed_at` | `timestamptz` | Yes | `CURRENT_TIMESTAMP` |
| `execution_time_ms` | `integer` | No | — |
| `status` | `varchar(20)` | Yes | `'completed'` |
| `rollback_sql` | `text` | Yes | — |
| `created_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `schema_migrations_filename_key`: `filename`

**Foreign keys:**
- —

**Check constraints:**
- `migration_status_check`: CHECK (status::text = ANY (ARRAY['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'rolled_back'::character varying]::text[]))
- `schema_migrations_status_check`: CHECK (status::text = ANY (ARRAY['completed'::character varying, 'failed'::character varying, 'rolled_back'::character varying]::text[]))

**Indexes:**
- `idx_schema_migrations_filename`: CREATE INDEX idx_schema_migrations_filename ON public.schema_migrations USING btree (filename)
- `idx_schema_migrations_status`: CREATE INDEX idx_schema_migrations_status ON public.schema_migrations USING btree (status)
- `schema_migrations_filename_key`: CREATE UNIQUE INDEX schema_migrations_filename_key ON public.schema_migrations USING btree (filename)
- `schema_migrations_pkey`: CREATE UNIQUE INDEX schema_migrations_pkey ON public.schema_migrations USING btree (id)

