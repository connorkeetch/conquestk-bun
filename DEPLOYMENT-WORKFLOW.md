# Deployment Workflow & Environment Management

**Last Updated**: 2025-09-01

## 🌍 Environment Overview

```
Local Development → Feature Branch → Dev/Staging → Production
     (localhost)       (GitHub)       (Railway)     (Railway)
```

### Environment URLs
- **Local**: http://localhost:5173 (frontend) / http://localhost:5001 (backend)
- **Staging**: https://risk-game-production-9935.up.railway.app
- **Production**: https://conquestk.com

## 🔄 Git Flow Strategy

### Branch Structure
```
main (production)
  ├── dev (staging)
  │   ├── feature/new-game-mode
  │   ├── fix/score-calculation
  │   └── chore/update-deps
  └── hotfix/critical-bug
```

### Standard Development Flow

```bash
# 1. Start a new feature
git checkout dev
git pull origin dev
git checkout -b feature/your-feature

# 2. Work with Claude Code
# Tell Claude: "I'm working on feature X for staging deployment"
# Make your changes...

# 3. Commit and push
git add .
git commit -m "feat: Add your feature description"
git push origin feature/your-feature

# 4. Test locally
npm run dev

# 5. Merge to staging
git checkout dev
git merge feature/your-feature
git push origin dev
# Railway auto-deploys to staging

# 6. Test on staging
# Visit https://risk-game-production-9935.up.railway.app

# 7. If all good, deploy to production
git checkout main
git merge dev
git push origin main
# Railway auto-deploys to production
```

### Hotfix Flow (Emergency Production Fixes)

```bash
# 1. Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue

# 2. Fix the issue
# Make changes...

# 3. Test locally
npm run dev

# 4. Deploy to production
git checkout main
git merge hotfix/critical-issue
git push origin main

# 5. Backport to dev
git checkout dev
git merge hotfix/critical-issue
git push origin dev
```

## 📁 Environment Configuration

### File Structure
```
backend/
  ├── .env                    # Active config (not committed)
  ├── .env.local              # Local development template
  ├── .env.staging            # Staging template
  └── .env.production         # Production template
```

### .env.local (Local Development)
```bash
NODE_ENV=development
PORT=5001
DATABASE_URL=postgresql://postgres:password@localhost:5432/risk_game_dev
JWT_SECRET=local-dev-secret-not-for-production
SESSION_SECRET=local-session-secret
CORS_ORIGIN=http://localhost:5173

# Features
ENABLE_DEBUG_LOGS=true
ENABLE_HOT_RELOAD=true
```

### .env.staging (Staging)
```bash
NODE_ENV=staging
PORT=5001
DATABASE_URL=${RAILWAY_DATABASE_URL}
JWT_SECRET=${STAGING_JWT_SECRET}
SESSION_SECRET=${STAGING_SESSION_SECRET}
CORS_ORIGIN=https://risk-game-production-9935.up.railway.app

# Features
ENABLE_DEBUG_LOGS=true
ENABLE_NEW_FEATURES=true
```

### .env.production (Production)
```bash
NODE_ENV=production
PORT=8080
DATABASE_URL=${RAILWAY_DATABASE_URL}
JWT_SECRET=${PRODUCTION_JWT_SECRET}
SESSION_SECRET=${PRODUCTION_SESSION_SECRET}
CORS_ORIGIN=https://conquestk.com

# Features
ENABLE_DEBUG_LOGS=false
ENABLE_NEW_FEATURES=false
```

## 🚀 Deployment Commands

### Quick Deploy Scripts

Create `scripts/deploy.sh`:
```bash
#!/bin/bash

deploy_staging() {
    echo "🚀 Deploying to STAGING..."
    git checkout dev
    git pull origin dev
    git push origin dev
    echo "✅ Staging deployment triggered"
    echo "🔗 Check: https://risk-game-production-9935.up.railway.app"
}

deploy_production() {
    echo "🚀 Deploying to PRODUCTION..."
    echo "⚠️  This will deploy to conquestk.com"
    read -p "Are you sure? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git checkout main
        git pull origin main
        git merge dev
        git push origin main
        echo "✅ Production deployment triggered"
    else
        echo "❌ Deployment cancelled"
    fi
}

case "$1" in
    staging)
        deploy_staging
        ;;
    production)
        deploy_production
        ;;
    *)
        echo "Usage: ./deploy.sh [staging|production]"
        ;;
esac
```

### NPM Scripts
Add to root `package.json`:
```json
{
  "scripts": {
    "deploy:staging": "git push origin dev",
    "deploy:production": "git checkout main && git merge dev && git push origin main && git checkout dev",
    "status": "git status && echo '\\nCurrent branch:' && git branch --show-current"
  }
}
```

## 🔒 Deployment Safety Checks

### Pre-deployment Checklist
```bash
# Run before deploying to production
npm run lint           # ✅ No linting errors
npm test              # ✅ All tests pass
npm run check:schema  # ✅ Database schema valid
npm run build         # ✅ Build succeeds
```

### Feature Flags (Recommended)
```typescript
// backend/src/config/features.ts
export const features = {
  newGameMode: process.env.ENABLE_NEW_GAME_MODE === 'true',
  tournamentSystem: process.env.ENABLE_TOURNAMENTS === 'true',
  aiPlayers: process.env.ENABLE_AI_PLAYERS === 'true',
}

// Usage
if (features.newGameMode) {
  // New feature code
}
```

## 🔄 Database Migration Strategy

### Before Production Deployment
1. **Test migration locally**
   ```bash
   cd backend && npm run migrate
   ```

2. **Run on staging**
   - Deploy to dev branch
   - Check Railway staging logs
   - Verify with `npm run check:schema`

3. **Backup production**
   ```bash
   # Use Railway CLI or dashboard to create backup
   railway run --environment production pg_dump $DATABASE_URL > backup.sql
   ```

4. **Deploy to production**
   - Merge to main
   - Monitor logs
   - Verify schema

## 🤝 Working with Claude Code

### Tell Claude Your Context
```
"I'm working on a feature for staging deployment.
Branch: feature/new-feature
Target: dev branch for staging
Production deployment will happen after staging tests"
```

### Common Commands for Claude
```
"Create this feature and prepare commits for dev branch"
"Fix this bug - it needs to go to production via hotfix"
"This change should only apply to staging for now"
```

### Claude Workflow Commands
```bash
# After Claude makes changes
git add .
git commit -m "feat: Claude's feature description"

# For staging
git push origin feature/your-feature
# Then merge to dev

# For production hotfix
git push origin hotfix/issue
# Then merge to main
```

## 📊 Monitoring Deployments

### Railway Dashboard
- Check deployment status
- View logs in real-time
- Monitor resource usage

### Quick Status Checks
```bash
# Check current branch
git branch --show-current

# Check deployment status
curl https://conquestk.com/health        # Production
curl https://risk-game-production-9935.up.railway.app/health  # Staging

# View recent commits
git log --oneline -10

# Check what's different between environments
git diff dev..main  # What's in staging but not prod
```

## 🚨 Rollback Procedures

### Quick Rollback
```bash
# Find the last working commit
git log --oneline -20

# Revert to it
git checkout main
git reset --hard <commit-hash>
git push --force origin main

# Or safer: create a revert commit
git revert <bad-commit-hash>
git push origin main
```

### Database Rollback
```bash
# If migration failed
cd backend
npm run migrate:rollback  # You'll need to implement this
```

## 📋 Environment Variables in Railway

### Setting Variables
1. Go to Railway Dashboard
2. Select your service
3. Variables tab
4. Add/update variables

### Required Variables per Environment

**Staging Service:**
- `DATABASE_URL` (auto-provided by Railway)
- `STAGING_JWT_SECRET`
- `STAGING_SESSION_SECRET`
- `REDIS_URL` (if using Redis)

**Production Service:**
- `DATABASE_URL` (auto-provided by Railway)
- `PRODUCTION_JWT_SECRET`
- `PRODUCTION_SESSION_SECRET`
- `REDIS_URL` (if using Redis)
- `RESEND_API_KEY` (for emails)

## 🎯 Best Practices

1. **Never skip staging** - Always test on staging first
2. **Use descriptive commits** - Makes rollbacks easier
3. **Monitor after deploy** - Watch logs for 5-10 minutes
4. **Keep branches clean** - Delete merged feature branches
5. **Document changes** - Update CHANGELOG.md
6. **Test migrations** - Always test database changes locally first
7. **Use feature flags** - Safer production releases

## 🆘 Troubleshooting

### Deployment Didn't Trigger
```bash
# Force rebuild
git commit --allow-empty -m "chore: Force rebuild"
git push origin main
```

### Wrong Code in Production
```bash
# Check what's deployed
git log origin/main -1

# Check local vs remote
git diff main origin/main
```

### Database Issues
```bash
# Connect to production DB (carefully!)
railway run --environment production psql $DATABASE_URL

# Check migration status
railway run --environment production npm run check:schema
```

---

Remember: **All production changes flow through Git**. Never edit production directly!