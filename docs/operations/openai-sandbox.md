# OpenAI Sandbox Deployment Guide

This guide documents the exact steps required to run ConquestK inside the OpenAI
agent sandbox. The environment blocks arbitrary outbound TCP ports and starts
without PostgreSQL, so a few extra provisioning steps are required compared to a
normal local machine.

## 1. Install dependencies

```bash
npm install
npm run build:shared
```

> `ts-node` looks for the compiled `@conquestk/shared` package at runtime. If you
> skip `npm run build:shared`, backend startup fails with
> `Cannot find module '@conquestk/shared/dist/types/themes.js'`.

## 2. Provision PostgreSQL locally

The sandbox disallows direct connections to Railway's dev database (port 46553
is blocked behind an HTTP CONNECT proxy), so we install PostgreSQL 16 locally
instead.

```bash
sudo apt-get update
sudo apt-get install -y postgresql
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'localpassword123';"
sudo -u postgres psql -c "CREATE DATABASE conquestk_local;"
```

These commands:

- install the database server,
- start the default cluster (not auto-started in the sandbox),
- set a password the application can use, and
- create a dedicated database that mirrors the expected development schema.

## 3. Configure environment variables

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and ensure it contains the sandbox‑friendly connection string:

```
DATABASE_URL=postgresql://postgres:localpassword123@127.0.0.1:5432/conquestk_local
```

If you ever run the project outside the sandbox, swap the value for your Railway
URL (managed in the Railway dashboard). Production/staging never load a `.env` file.

## 4. Apply database migrations

1. **Bootstrap from the baseline** (creates all core tables and constraints):

   ```bash
   sudo -u postgres psql -d conquestk_local \
     -f backend/migrations/001_baseline_schema.sql
   ```

   If a baseline hasn’t been generated yet in your branch, you can instead run
   the app’s migration runner directly and it will apply the current set of SQL
   files in `backend/migrations/`.

2. **Run the app’s migration runner** (safe to rerun):
   
   ```bash
   cd backend
   npm run migrate
   ```

   The migration tracker adds the missing bookkeeping columns, rebuilds the
   constraint on `status`, and fills in placeholders for the consolidated
   import. Subsequent runs simply apply any pending migrations, so it's safe to
   rerun the command after editing SQL or resetting your database.

## 5. Run the backend

For production-mode validation (the same process Railway executes):

```bash
cd backend
npm run build
npm start
```

For iterative development once the database is in place:

```bash
cd backend
npm run dev:manual  # or npm run dev:backend from the repo root
```

Remember that Redis is optional inside the sandbox. Without it the server falls
back to in-memory rate limiting, which is sufficient for smoke testing.

## 6. Frontend notes

1. Copy `frontend/.env.example` to `frontend/.env` and update `VITE_API_URL` to
   `http://localhost:5001/api` if it differs.
2. Start the client with `npm run dev:frontend`.

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `connect ENETUNREACH 66.33.22.242:46553` | Confirm you're using the local `DATABASE_URL` from step 3. The sandbox blocks outbound TCP tunnels to Railway. |
| `Cannot find module '@/config/database'` while running `npm run dev` | Run `npm run build:shared` once before starting the backend so the workspace dependency is compiled. |
| `psql: could not connect to server` | Ensure `pg_ctlcluster 16 main start` succeeded and rerun it if necessary. |

With the steps above the backend starts cleanly, migrations run against the
local database, and the sandbox build behaves the same as Railway deployments
(without needing external TCP access).
