Squashing Migrations (Pre‑Launch)

When to use
- Before public launch, when there’s no production data to preserve and a long history of incremental migrations is causing confusion.
- Do not squash if you already have live users or production data that must be migrated incrementally.

What this does
- Creates a single “baseline” SQL migration that reflects the current schema.
- Lets you archive or remove the old migration files so new environments bootstrap quickly and unambiguously.

Prerequisites
- Database with the latest schema applied (local works fine), or the ability to create a temporary database on the same server.
- PostgreSQL client tools installed (pg_dump on PATH).
- NODE_ENV not set to production.

Generate a baseline
1) Create a baseline from a clean scratch DB (recommended)
   - This creates a temp database, runs all migrations against it, and dumps the schema.
   - From repository root:
     npm run migrate:squash -- --output backend/migrations/001_baseline_schema.sql --temp-db --yes

   - Output is written to backend/migrations/001_baseline_schema.sql. The script will drop the temp DB after dump.

2) Or dump from your current DB (if you’re sure it’s fully migrated)
   npm run migrate:squash -- --output backend/migrations/001_baseline_schema.sql --yes

What to keep and what to remove
- Keep the single baseline file you generated.
- Keep only seed migrations you explicitly still want. For example, 075_seed_achievements_v1.sql adds initial data you might want to retain. If in doubt, roll those statements into a dedicated 002_seed.sql.
- Archive the rest under backend/migrations_archive/ before deleting, so you can recover quickly if needed.

Resetting migration tracking
- After swapping migrations to the baseline, reset the tracking table in non‑prod DBs:
  TRUNCATE schema_migrations;
- For production (when you eventually go live), prefer starting with a clean, empty DB and running the baseline once.

Validating the squash
- Start with an empty DB
  - Apply the baseline (npm run migrate)
  - Run backend health checks (npm run check:schema)
  - Run unit/integration tests (npm run test:backend)
- Start the app locally and exercise core flows (sign‑up, create/join room, basic game loop, maps, messaging if enabled).

Deployment notes
- Railway builds copy backend/migrations to dist/migrations automatically. Once you’ve swapped to the baseline, deployments will use it.
- If you previously had any partial schema in the Railway Postgres, create a new database or drop all objects before relying on the baseline to avoid conflicts.

Roll‑forward policy
- After squashing, resume normal practice: add new numbered migrations and never edit existing ones.
- Treat the baseline as immutable history from which all future changes apply.

