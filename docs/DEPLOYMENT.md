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

### Required for Production
Set these in Railway dashboard → Variables tab:

```bash
# Core (Railway provides DATABASE_URL and PORT)
NODE_ENV=production
JWT_SECRET=[generate with: openssl rand -base64 32]
SESSION_SECRET=[generate with: openssl rand -base64 32]

# URLs
CORS_ORIGIN=https://conquestk.com
FRONTEND_URL=https://conquestk.com

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
LOG_LEVEL=info

# Database Tuning
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000
DB_STATEMENT_TIMEOUT=30000
DB_QUERY_TIMEOUT=30000
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

### Quick Rollback
```powershell
# Windows - rollback to last known good
.\scripts\rollback.ps1 -LastKnownGood

# Specify exact commit
.\scripts\rollback.ps1 -CommitHash abc123
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

## 🏠 Local Development

### Using Docker (Recommended)
```bash
# Start services
docker-compose up -d

# Use local environment
cp backend/.env.local backend/.env
npm run dev
```

### Docker Services
- PostgreSQL on localhost:5432
- Redis on localhost:6379
- Credentials in docker-compose.yml

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