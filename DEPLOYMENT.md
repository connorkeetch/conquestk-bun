# Deployment & Environment Documentation

## 🌐 Live Environments

### Production
- **URL**: https://conquestk.com
- **Branch**: `main`
- **Database**: Railway Production (yamanote.proxy.rlwy.net:46553)
- **Features**: Redis sessions, Resend emails, full production config

### Staging/Development
- **URL**: https://risk-game-production-9935.up.railway.app/
- **Branch**: `dev`
- **Database**: Railway Development (yamabiko.proxy.rlwy.net:25470)
- **Features**: Testing environment, no email verification required

## 🚀 Deployment Process

### Deploy to Staging (Dev)
```bash
git checkout dev
git merge main        # Get latest changes from main
git push origin dev   # Auto-deploys to Railway staging
```

### Deploy to Production
```bash
git checkout main
git merge dev         # After testing on staging
git push origin main  # Auto-deploys to Railway production
```

## 💾 Database Configuration

### Production Database
```
Host: yamanote.proxy.rlwy.net
Port: 46553
Database: railway
Connection String: postgresql://postgres:[PASSWORD]@yamanote.proxy.rlwy.net:46553/railway
```

### Development Database
```
Host: yamabiko.proxy.rlwy.net
Port: 25470
Database: railway
Connection String: postgresql://postgres:[PASSWORD]@yamabiko.proxy.rlwy.net:25470/railway
```

### Important Database Notes
- Both databases are hosted on Railway
- SSL is required for connections (configured in `backend/src/config/database.ts`)
- Connection timeout increased to 10s for Railway connections
- PostgreSQL 17.6 running on both instances

## 🔧 Local Development Setup

### Quick Start
```bash
# Install dependencies
npm install

# Use development database for local work
cd backend
cp .env.development .env

# Start development servers
npm run dev
```

### Environment Files
- `.env` - Active configuration (not committed)
- `.env.development` - Development template with dev database
- `.env.production.local` - Production template (for reference)
- `.env.example` - Template for new developers

## 🔑 Environment Variables

### Essential Variables
```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
JWT_SECRET=minimum-32-characters
SESSION_SECRET=minimum-32-characters

# Services (Production only)
REDIS_URL=redis://...
RESEND_API_KEY=re_...

# Features
EMAIL_ENABLED=true/false
REQUIRE_EMAIL_VERIFICATION=true/false
```

### Railway-Specific Variables
Railway automatically injects:
- `PORT` - Server port
- `RAILWAY_ENVIRONMENT` - Current environment
- `DATABASE_URL` - When database is attached

## 📝 SQL Compatibility

### PostgreSQL Placeholders
All SQL queries use PostgreSQL format:
```javascript
// Correct (PostgreSQL)
query('SELECT * FROM users WHERE email = $1', [email])

// Wrong (MySQL format - will fail)
query('SELECT * FROM users WHERE email = ?', [email])
```

Fixed in: `backend/src/services/userService.ts`

## 🧪 Testing

### Run Playwright Tests
```bash
# Start servers first
npm run dev

# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/auth.spec.ts

# Run with UI
npx playwright test --ui
```

### Test Files Created
- `tests/auth.spec.ts` - Authentication flow
- `tests/redis-session.spec.ts` - Session management
- `tests/resend-email.spec.ts` - Email functionality  
- `tests/game-session.spec.ts` - Game creation/joining
- `tests/integration.spec.ts` - Basic infrastructure

## 🚂 Railway Configuration

### Branch Deployments
1. Go to Railway project settings
2. Enable "Branch Deployments"
3. Add `dev` branch to auto-deploy list
4. Each branch gets its own service

### Service Configuration

#### Production Service
- Name: `risk-game-prod`
- Branch: `main`
- Domain: conquestk.com
- Database: Production (yamanote)

#### Development Service  
- Name: `risk-game-dev`
- Branch: `dev`
- Domain: risk-game-production-9935.up.railway.app
- Database: Development (yamabiko)

## 🐛 Troubleshooting

### Database Connection Issues
- Check Railway dashboard for database status
- Verify DATABASE_URL is correct
- Ensure SSL is enabled for Railway connections
- Connection timeout is set to 10s for Railway

### Login/Authentication Issues
- Verify SQL placeholders are PostgreSQL format ($1, $2)
- Check JWT_SECRET is set (minimum 32 characters)
- For dev: Email verification is disabled
- For prod: Resend API key must be configured

### Port Conflicts
```bash
# Windows - Find process using port
netstat -ano | findstr :5001

# Kill process
taskkill /PID [process_id] /F
```

## 📊 Recent Fixes (2025-08-31)

1. **PostgreSQL Compatibility**
   - Fixed all SQL placeholders from `?` to `$1, $2...` format
   - Updated `userService.ts` for PostgreSQL syntax

2. **Database Connection**
   - Increased timeout from 2s to 10s for Railway
   - Added SSL configuration for Railway connections
   - Fixed connection string parsing

3. **Environment Setup**
   - Created `dev` branch for staging
   - Configured branch-based deployments
   - Added railway.json for deployment config

4. **Testing**
   - Created Playwright test suite
   - Fixed test configuration for available browsers
   - Added integration tests for basic functionality

## 📚 Additional Resources

- [Railway Dashboard](https://railway.app/dashboard)
- [GitHub Repository](https://github.com/connorkeetch/risk-game)
- [Production Site](https://conquestk.com)
- [Staging Site](https://risk-game-production-9935.up.railway.app/)

## 🔄 Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Work on feature
git add .
git commit -m "Add new feature"

# Test on dev first
git checkout dev
git merge feature/new-feature
git push origin dev
# Wait for Railway deployment and test

# If tests pass, merge to main
git checkout main
git merge dev
git push origin main
# Auto-deploys to production
```

---
Last Updated: 2025-08-31