# Deployment & Operations Guide

_Last updated: March 7, 2026_

## 🚀 Quick Deploy

### Production Deploy (conquestk.com)
```bash
git checkout main
git merge dev
git push origin main  # GitHub Actions builds, tests, then triggers Railway via webhook
```

### Staging Deploy (dev.conquestk.com)
```bash
git checkout dev
git push origin dev  # GitHub Actions builds, tests, then triggers Railway via webhook
```

> Configuration notes
>
> - The repo no longer ships a legacy `railway.json`. Manage services and environment variables directly in the Railway dashboard. Document changes in the dashboard when you update them.
> - Railway builds from the repository and uses the configured Install/Build/Start commands (Railpack-style). We do not ship a `railway.json`; configure Build/Start in the Railway GUI.

## 🧰 Build & Install Strategy

Railway uses Railpack by default with automatic detection:
- Installs dependencies per npm workspaces
- Builds with the root scripts (`npm run build`)
- Starts with `npm start` (runs migrations then boots Express)

Notes:
- The frontend emits static assets into `backend/public` (via Vite config). The backend serves them in production/staging.
- Optional startup tasks can be toggled via env vars without changing the build:
  - `SYNC_FEATURE_FLAGS_ON_START=true`
  - `RUN_DEPLOY_ACCOUNT_ENFORCEMENT_ON_START=true`

### WASM Odds in Railway (Railpack-style build commands)

To ensure the Rust→WASM odds package exists at runtime (so `ODDS_ENGINE=shadow|wasm` works), add the following in your Railway service settings:

- Install Command:
```
npm ci
```

- Build Command (paste as multiline, no extra wrappers):
```
set -eu
# Install Rust toolchain
curl -sSf https://sh.rustup.rs | sh -s -- -y
# Make cargo available in PATH for this shell
export PATH="$HOME/.cargo/bin:$PATH"
# Install wasm-pack (prebuilt binary)
curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh
# Show versions for traceability
rustc --version
cargo --version
wasm-pack --version
# Build WASM package and then the workspace
npm run odds:build
npm run build
```

Single-line (POSIX sh compatible):
```


```

- Start Command:
```
npm start
```

Notes:
- The backend will fall back to the TypeScript engine if WASM is unavailable at runtime, but with these commands WASM artifacts (`shared/wasm-odds/pkg-node/**`) will be present.
- If you only want to test shadow mode on staging, set `ODDS_ENGINE=shadow` in the staging environment in Railway. Production can remain `ts` until you’re ready to flip.

Alternative (no custom Build Command):
- The repository tracks prebuilt WASM artifacts under `shared/wasm-odds/pkg-node/**` and `shared/wasm-odds/pkg/**`.
- With these committed, you can skip installing Rust/wasm-pack in Railway and just run the standard build (`npm run build`). The odds loader will find the bundled `wasm_odds.js` and `wasm_odds_bg.wasm` at runtime.
- Use `/api/odds/status` to confirm `wasmAvailable: true` after deploy.

## 🔐 Environment Variables

### Current Production Setup (verified March 2026)
```bash
# Core (Railway auto-provides DATABASE_URL and PORT)
NODE_ENV=production
JWT_SECRET=[32+ char secret]
SESSION_SECRET=[32+ char secret]

# URLs & CORS
CORS_ORIGIN=https://conquestk.com
FRONTEND_URL=https://conquestk.com
CANONICAL_HOST=conquestk.com
VITE_CANONICAL_HOST=conquestk.com
VITE_CANONICAL_REDIRECT_HOSTS=www.conquestk.com

# Email Service (Resend or SMTP)
EMAIL_ENABLED=true
EMAIL_FROM=noreply@updates.conquestk.com
EMAIL_FROM_NAME=ConquestK
EMAIL_VERIFICATION_EXPIRE_HOURS=24
REQUIRE_EMAIL_VERIFICATION=true
RESEND_API_KEY=[Resend API key]  # or provide SMTP_* credentials instead

# Redis & caching
# Prefer Railway private networking via a Variable Reference.
REDIS_URL=[Railway Redis add-on private URL]

# Optional: if you must use the public endpoint instead of the private network
# (for services outside the Railway project or custom networking), set:
# REDIS_PUBLIC_URL=[rediss://… public TLS URL from the Redis add-on]

# Notes
# - Use REDIS_URL (private) for services within the same Railway project.
# - Only use REDIS_PUBLIC_URL when private DNS isn’t available.
# - Keep BULL_PREFIX consistent across backend and Bull Board (default: "bull").

# Logging & telemetry
LOG_LEVEL=info
SENTRY_DSN=[Sentry DSN]

# Worker scaling (optional but supported)
ENABLE_AUTO_SCALING=true
MIN_WORKERS=2
MAX_WORKERS=4

# Optional external notifications
ENABLE_EXTERNAL_NOTIFICATIONS=false
NOTIFICATION_CHANNELS=webpush,slack
SLACK_NOTIFICATIONS_ENABLED=false
SLACK_WEBHOOK_URL=[Slack webhook]
DISCORD_NOTIFICATIONS_ENABLED=false
DISCORD_WEBHOOK_URL=[Discord webhook]

# Engines (Odds + AI evaluation)
# Use 'ts' in production unless you've validated WASM stability in staging.
# Options: ts | wasm | shadow (shadow computes both + logs divergence, returns TS)
ODDS_ENGINE=ts
AI_EVAL_ENGINE=ts
```

### Staging Environment Differences
```bash
NODE_ENV=staging
CORS_ORIGIN=https://dev.conquestk.com
FRONTEND_URL=https://dev.conquestk.com
# Safe rollout defaults in staging
ODDS_ENGINE=shadow
AI_EVAL_ENGINE=shadow
```

> If `FRONTEND_URL` is unset, the backend falls back to the incoming request origin. Always set it explicitly for production and staging so verification/password reset emails generate correct links.

### Generate Secure Secrets
```bash
openssl rand -base64 32  # JWT and session secrets
```

## 📊 Monitoring

### Health Checks
- Production: https://conquestk.com/api/health (behind proxy)
- Staging: https://dev.conquestk.com/health

### Bull Board (Queues UI)
- Bull Board runs as a separate Railway service. See `services/bullboard/README.md`.
- Set `REDIS_URL` via Variable Reference to the same Redis used by the backend (and the same `BULL_PREFIX`).
- Health: `GET https://<bullboard-domain>/health` (Basic Auth)
- Metrics: `GET https://<bullboard-domain>/metrics` (Basic Auth)

### Odds Engine Status
- Endpoint: `/api/odds/status` (no auth)
- Response example:
```json
{
  "success": true,
  "data": {
    "engine": "ts | wasm | shadow",
    "wasmAvailable": true,
    "wasmVersion": "wasm-odds x.y.z"
  }
}
```
- Use this to confirm Railway has built the WASM module when `ODDS_ENGINE=shadow|wasm` is set.

### AI Eval Engine

- `AI_EVAL_ENGINE=ts|wasm|shadow`
  - `ts`: score AI candidates in TypeScript (default)
  - `wasm`: score via Rust→WASM; falls back to TS if unavailable
  - `shadow`: compute both, log divergences, return TS scores (safe rollout)
- Admin benchmark: `POST /api/benchmark/ai-eval-bench` returns candidates/sec for TS vs WASM

Response shape:
```json
{
  "status": "OK",
  "server": "running",
  "database": "connected",
  "redis": "connected",
  "queues": "healthy",
  "environment": "production",
  "databaseUrl": "configured",
  "redisUrl": "configured",
  "sentry": "configured",
  "timestamp": "2026-03-07T00:00:00.000Z",
  "queueError": null,
  "databaseError": null,
  "redisError": null
}
```
Errors are included only when a subsystem is degraded.

### Error Tracking (Sentry)
- Captures all unhandled errors
- Environment separation (dev/staging/prod) mirrors `NODE_ENV`
- Performance monitoring uses the Sentry sampling defaults; adjust via env vars if needed.
- Test endpoint: `/debug-sentry` (non-production only)

### Uptime Monitoring
Configure UptimeRobot or similar:
- Monitor `/api/health` (prod) and `/health` (staging)
- 5-minute intervals
- Alert on 2+ consecutive failures

## 🔔 Notifications

### Manual Dispatch CLI

Use the backend utility to verify Slack/Discord/WebPush routing without shipping new code:

```bash
cd backend
npm run notify -- \
  --type map.workflow.approved \
  --title "Map Approved" \
  --body '"Aurora Isles" cleared review' \
  --user <creator-user-id>
```

- Requires `DATABASE_URL`, Slack/Discord webhook env vars, and VAPID keys to be present.
- Add `--role admin` (repeatable) to target all administrators without listing IDs.
- Additional flags: `--severity <info|warning|critical>`, `--context key=value`, `--cta label=url`.
- Use staging webhooks first; confirm payload formatting before enabling production secrets.

## 🔄 CI/CD Pipeline

GitHub Actions (`.github/workflows/deploy.yml`) runs on pushes and pull requests targeting `dev` or `main`:
1. `typecheck` job (Node 24.x) runs `npm ci` + `npm run typecheck`.
2. `lint` job runs Biome once typecheck passes.
3. `unit-tests` job spins up PostgreSQL 17 and runs Jest + Vitest.
4. `build` job compiles all workspaces.
5. `e2e-smoke` job executes Playwright smoke tests (installs browsers).
6. `deploy-staging` or `deploy-production` posts to the appropriate Railway webhook after the preceding jobs succeed and performs a health check before finishing.

### Branch Strategy
```
main (production) ← dev (staging) ← feature branches
```

## 🚨 Emergency Procedures

### Quick Rollback
```bash
# Railway CLI method (recommended)
railway rollback --environment production

# Git method
git revert HEAD --no-edit
git push origin main  # Auto-deploys rollback

# Specific commit rollback
git reset --hard <last-good-commit-hash>
git push origin main --force-with-lease
```

### Database Recovery
```bash
# Connect to production database
railway run --environment production psql $DATABASE_URL

# Check migration status
SELECT * FROM schema_migrations ORDER BY executed_at DESC;

# Manual rollback if needed
# The migration runner only supports forward migrations.
# Create and deploy a new rollback migration or restore a Railway snapshot.
```

### Database Backups (2026 refresh)
- Prefer Railway's built-in PostgreSQL snapshots for automated retention and point-in-time recovery.
- For ad-hoc exports, run `pg_dump` to a directory **outside** the repository so we never commit SQL dumps again.

```bash
pg_dump "$DATABASE_URL" > ~/backups/conquestk-$(date +%Y%m%d-%H%M%S).sql
```

### Incident Response Checklist
- Notify the Discord ops channel with a short summary and current mitigation status.
- Create a GitHub issue tagged `incident` with timelines, impact, and remediation steps.
- Capture logs/metrics snapshots before restarting services so we can analyze root cause post-mortem.

## 🧭 Operational Dashboards
- `/api/performance/dashboard` surfaces live queue, Redis, and worker metrics (requires admin auth).
- `/api/queues/health` exposes per-queue stats for manual verification during incidents (auth required). See also `/api/queues/ping` (public).
