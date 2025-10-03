# Deployment & Operations Guide

## 🚀 Quick Deploy

### Production Deploy (conquestk.com)
```bash
git checkout main
git merge dev
git push origin main  # Auto-deploys via Railway
```

### Staging Deploy (risk-game-production-9935.up.railway.app)
```bash
git checkout dev
git push origin dev  # Auto-deploys via Railway
```

> Configuration notes
>
> - (September 2025) The repo no longer ships a legacy `railway.json`. Manage services and environment variables directly in the Railway dashboard to avoid the deployment regression that file triggered. Document any changes in the GUI so the team can keep this guide current.
> - (October 2025) We now include a `railpack.json` at the repository root to guide Nixpacks build steps (install/build/start). This is not the old `railway.json` and does not define services or environment variables; it only standardizes how Nixpacks installs dependencies, builds, prunes dev dependencies, and starts the server.

## 🧰 Build & Install Strategy (Nixpacks/Railpack)

We use Nixpacks on Railway with a repo‑root `railpack.json` that makes installs reproducible and eliminates npm’s production warning.

Key choices:
- Install with `npm ci` (keeps devDependencies available for TypeScript/Vite builds).
- Build with `npm run build`.
- Prune devDependencies for runtime with `npm prune --omit=dev`.
- Start with Node directly (no `npm start`) to avoid the npm production warning.

railpack.json (excerpt):
```json
{
  "steps": {
    "install": { "commands": ["npm ci"], "caches": ["npm-install"] },
    "build": {
      "inputs": [{ "step": "install" }],
      "commands": ["npm run build", "npm prune --omit=dev"],
      "caches": ["npm-install"]
    }
  },
  "deploy": {
    "startCommand": "node backend/dist/index.js"
  }
}
```

Why not `npm ci --omit=dev`? Because the build requires devDependencies (TypeScript, Vite). We install devDependencies for the build and prune them afterward so the runtime image only contains production dependencies.

Runtime expectations:
- The frontend build outputs into `backend/public` (via Vite config). The backend serves these static assets in production/staging.
- The backend server entry is `backend/dist/index.js`.
- Optional startup tasks can be toggled via env vars without changing the build:
  - `SYNC_FEATURE_FLAGS_ON_START=true` to sync feature flags used in code into the DB at boot.
  - `RUN_DEPLOY_ACCOUNT_ENFORCEMENT_ON_START=true` to normalize owner/test accounts at boot (use in staging when needed).

## 🔐 Environment Variables

### Current Production Setup (September 2025)
**Verified working configuration in Railway:**

```bash
# Core (Railway auto-provides DATABASE_URL and PORT)
NODE_ENV=production
JWT_SECRET=[32+ char secret - rotate every 90 days]
SESSION_SECRET=[32+ char secret - rotate every 90 days]

# URLs & CORS
CORS_ORIGIN=https://conquestk.com
FRONTEND_URL=https://conquestk.com
CANONICAL_HOST=conquestk.com
VITE_CANONICAL_HOST=conquestk.com
# Optional: comma separated aliases that should redirect to the canonical host
VITE_CANONICAL_REDIRECT_HOSTS=www.conquestk.com

# Email Service (Resend or SMTP)
EMAIL_ENABLED=true
EMAIL_FROM=noreply@updates.conquestk.com
EMAIL_FROM_NAME=ConquestK
EMAIL_VERIFICATION_EXPIRE_HOURS=24
REQUIRE_EMAIL_VERIFICATION=true
RESEND_API_KEY=[Resend API key]  # or provide SMTP_* credentials instead

# Redis & caching (strongly recommended in prod)
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
NODE_ENV=staging  # Important: staging mode, not production
CORS_ORIGIN=https://risk-game-production-9935.up.railway.app
FRONTEND_URL=https://risk-game-production-9935.up.railway.app

> Note: If `FRONTEND_URL` is not set, the backend derives the base URL from the incoming request's protocol and host (trusting proxies). This makes links in verification and password reset emails work by default in most environments, but you should still set `FRONTEND_URL` explicitly in production and staging to avoid surprises.
SENTRY_ENVIRONMENT=staging
```

### Generate Secure Secrets
```bash
# JWT and Session secrets
openssl rand -base64 32
```

## 📊 Monitoring

### Health Checks
- Production: https://conquestk.com/health
- Staging: https://risk-game-production-9935.up.railway.app/health

Response includes:
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
  "timestamp": "2025-09-30T23:00:00.000Z"
}
```

### Error Tracking (Sentry)
- Captures all unhandled errors
- Environment separation (dev/staging/prod)
- Performance monitoring (10% sample rate in prod)
- Test endpoint: `/debug-sentry` (non-production only)

### Uptime Monitoring
Configure UptimeRobot or similar:
- Monitor `/health` endpoint
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

GitHub Actions (`.github/workflows/deploy.yml`) automatically:
1. Run tests on push to dev/main
2. Build and verify code
3. Deploy to staging (dev branch)
4. Deploy to production (main branch, manual approval)

### Branch Strategy
```
main (production) ← dev (staging) ← feature branches
```

## 🚨 Emergency Procedures

### Quick Rollback (September 2025)
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

### Database Backups (January 2026 update)
- Prefer Railway's built-in PostgreSQL snapshots for automated retention and point-in-time recovery.
- For ad-hoc exports, run `pg_dump` to a directory **outside** the repository so we never commit SQL dumps again:

```bash
mkdir -p ~/conquestk-backups
railway run --environment production \
  pg_dump "$DATABASE_URL" --format=custom --no-owner \
  > ~/conquestk-backups/conquestk-prod-$(date +%Y%m%d%H%M).dump
```

- Document the backup location in the incident ticket and rotate the dump after verification. Upload to secure object storage if the dump must persist beyond the incident response window.

### Common Issues & Fixes

**Deployment Not Triggering**
```bash
# Force rebuild
git commit --allow-empty -m "Force rebuild"
git push origin main
```

**Memory Issues**
- Check Railway metrics dashboard
- Review Socket.io connection count
- Look for memory leaks in logs

**Database Connection Issues**
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Kill stuck queries
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' 
AND query_start < NOW() - INTERVAL '10 minutes';
```

## 🏠 Local Development (Current Setup)

### Railway PostgreSQL (Recommended)
```bash
# Current working setup (September 2025)
npm install                    # Install all dependencies
npm run setup                  # Configure environment
npm run dev                    # Start both frontend (5173) and backend (5001)
```

**Default Configuration:**
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:5001  
- **Database**: Railway PostgreSQL (shared dev instance)
- **No Docker required** - Railway handles database hosting

### Alternative: Docker (If needed)
```bash
# Only if Railway connection issues
docker-compose up -d postgres redis
cp backend/.env.example backend/.env
# Update DATABASE_URL to localhost
npm run dev
```

## 📋 Deployment Checklist

Before production deploy:
- [ ] All tests pass: `npm test`
- [ ] No lint errors: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Database migrations ready
- [ ] Environment variables set in Railway
- [ ] Recent database backup exists
- [ ] Sentry configured
- [ ] Health checks passing

## 🗄️ Database Migrations

### Automatic Migrations (Sept 2025+)
Migrations now run automatically on deployment via the backend start script:
```json
// backend/package.json
"start": "node dist/scripts/runMigration.js && node dist/index.js"
```

### Manual Migration Commands
```bash
# Run migrations locally
cd backend && npm run migrate

# Check migration status
cd backend && npm run migrate:status

# Check database schema
cd backend && npm run check:schema

# Direct database inspection (requires ts-node)
cd backend && npm run check:schema
```

### Migration Files
- Location: `backend/migrations/`
- Format: `XXX_description.sql` (e.g., `014_add_map_status_column.sql`)
- Migrations run in numeric order
- Use `IF NOT EXISTS` clauses for safety
- Always test locally before production

### Common Migration Issues
1. **"column does not exist"** - Migration hasn't run
2. **"relation does not exist"** - Table hasn't been created
3. **Duplicate migrations** - Check migration_history table
4. **Failed migrations** - Check logs, may need manual intervention

## 🔍 Verification Steps

After deployment:
1. Check health endpoint
2. Test user registration/login
3. Create and join a game
4. Verify Socket.io connections
5. Check Sentry for errors
6. Monitor memory usage (first 30 min)
7. Test file uploads

## 🚀 Performance Optimization

### Database
- Indexes on foreign keys and frequently queried columns
- Connection pooling (20 connections max)
- Query timeout (30 seconds)

### Application
- Compression enabled
- Static asset caching (1 day)
- Rate limiting configured
- Memory limits monitored

## 🔗 Important URLs

- **Production**: https://conquestk.com
- **Staging**: https://risk-game-production-9935.up.railway.app
- **Railway Dashboard**: https://railway.app/dashboard
- **GitHub Actions**: https://github.com/connorkeetch/risk-game/actions
- **Sentry Dashboard**: https://sentry.io

## 📝 Logs & Debugging

### View Logs
```bash
# Railway CLI
railway logs --environment production

# Or use Railway dashboard for real-time logs
```

### Debug Endpoints (non-production)
- `/debug/env` - Environment variables (redacted)
- `/debug/tables` - Database tables and counts
- `/debug/migrations` - Migration status
- `/debug-sentry` - Test Sentry error

## 🔒 Security Notes

- Never commit `.env` files
- Rotate secrets every 90 days
- Use different secrets per environment
- Enable 2FA on Railway account
- Audit Railway team access monthly
## 🔁 Post‑Deploy Migration Notes (September 2025)

Terminology update: continents → sectors
- Apply DB migration 022 on all environments.

Local
```bash
cd backend && npm run migrate
```

Production/Staging
- Migrations run on app start via `npm start`. Confirm applied:
```sql
SELECT * FROM schema_migrations ORDER BY executed_at DESC;
```

API compatibility
- New: `POST /api/maps/:mapId/sectors`
- Alias: `POST /api/maps/:mapId/continents` (kept for backward compatibility)
- Territory payload accepts `sectorId` (preferred) or `continentId` (deprecated)
- Map metadata uses `sectors` (preferred); `continents` still read and mapped

UI
- Visible labels now say “Sectors.” Internally, the editor still uses `continents` state; the service layer maps responses.
