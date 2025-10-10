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
> - We do not ship a `railpack.json`. Railway’s default Node builder (Nixpacks) detects the workspace, installs dependencies, builds, and starts via `npm start`. Revisit this section if we adopt a custom builder.

## 🧰 Build & Install Strategy

Railway uses its default Node builder (Nixpacks) with automatic detection:
- Installs dependencies per npm workspaces
- Builds with the root scripts (`npm run build`)
- Starts with `npm start` (runs migrations then boots Express)

Notes:
- The frontend emits static assets into `backend/public` (via Vite config). The backend serves them in production/staging.
- Optional startup tasks can be toggled via env vars without changing the build:
  - `SYNC_FEATURE_FLAGS_ON_START=true`
  - `RUN_DEPLOY_ACCOUNT_ENFORCEMENT_ON_START=true`

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
REDIS_URL=[Railway Redis addon URL]

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
```

### Staging Environment Differences
```bash
NODE_ENV=staging
CORS_ORIGIN=https://dev.conquestk.com
FRONTEND_URL=https://dev.conquestk.com
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
