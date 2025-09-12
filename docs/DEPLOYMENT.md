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

# Email Service (Resend - REQUIRED)
RESEND_API_KEY=[from Resend dashboard]
EMAIL_FROM=noreply@updates.conquestk.com  # Updates subdomain verified
EMAIL_FROM_NAME=ConquestK
EMAIL_ENABLED=true
EMAIL_VERIFICATION_EXPIRE_HOURS=24
REQUIRE_EMAIL_VERIFICATION=true

# Error Tracking
SENTRY_DSN=[your-sentry-dsn]
LOG_LEVEL=info

# Performance & Scaling (Enterprise Features)
REDIS_URL=[Railway Redis addon if using caching]
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_AUTO_SCALING=true

# Node.js 24 Features
NODE_ENV=production  # Enables Node.js 24 optimizations
ENGINE_VERSION=24    # Explicit version specification
```

### Staging Environment Differences
```bash
NODE_ENV=staging  # Important: staging mode, not production
CORS_ORIGIN=https://risk-game-production-9935.up.railway.app
FRONTEND_URL=https://risk-game-production-9935.up.railway.app
ENABLE_DEBUG_LOGS=true
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
  "sentry": "configured",
  "environment": "production"
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
railway run --environment production npm run migrate:rollback
```

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
npx ts-node src/scripts/checkProductionDb.ts
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