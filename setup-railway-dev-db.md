# 🚂 Setting Up Railway Development Database

## Option 1: Use Production Database (Simple but Risky)
**NOT RECOMMENDED** - You could damage production data

## Option 2: Create Separate Dev Database on Railway (Recommended)

### Steps to Create Dev Database on Railway:

1. **Login to Railway**
   ```bash
   railway login
   ```

2. **Create New Project for Dev**
   ```bash
   railway init
   # Name it: risk-game-dev
   ```

3. **Add PostgreSQL to Dev Project**
   ```bash
   railway add
   # Select: PostgreSQL
   ```

4. **Get Dev Database URL**
   ```bash
   railway variables
   ```
   Copy the `DATABASE_URL`

5. **Update Local .env File**
   Edit `backend/.env`:
   ```env
   # Switch to PostgreSQL for dev
   DB_TYPE=postgresql
   DATABASE_URL=postgresql://postgres:YOUR_DEV_PASSWORD@YOUR_DEV_HOST.railway.app:PORT/railway
   ```

## Option 3: Use Local PostgreSQL (Best for Development)

### Windows Setup:
1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Install with default settings
3. Create database:
   ```bash
   psql -U postgres
   CREATE DATABASE risk_game_dev;
   ```

4. Update `backend/.env`:
   ```env
   DB_TYPE=postgresql
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
   ```

## Option 4: Keep Using SQLite (Simplest)

SQLite is actually fine for development! The 500 error might be something else.

### To Fix SQLite Issues:
```bash
# Delete and recreate database
cd backend
del risk_game.db
npm run dev
```

## Current Issue Diagnosis

The 500 error on registration is likely due to:
1. **Frontend on wrong port** - Check if you're accessing localhost:3000 or localhost:5173
2. **CORS mismatch** - Frontend and backend URLs don't match
3. **Database migration issue** - Migrations didn't run properly

### Quick Fix:
```bash
# 1. Stop everything
# 2. Clear database
cd backend
del risk_game.db

# 3. Restart with fresh database
cd ..
npm run dev

# 4. Access frontend at http://localhost:3000 (NOT 5173)
```

## Recommended Development Setup

For consistency between dev and prod:

1. **Use Railway Dev Database**
   - Pros: Same as production environment
   - Cons: Requires internet, slightly slower

2. **Use Local PostgreSQL**
   - Pros: Fast, offline development
   - Cons: Need to install PostgreSQL

3. **Keep SQLite for Dev**
   - Pros: Zero setup, works offline
   - Cons: Different from production

## Environment Variables Strategy

Create these files:
- `.env.development` - Local SQLite
- `.env.staging` - Railway dev database
- `.env.production` - Railway prod database

Then switch with:
```bash
# For local dev
cp .env.development .env

# For staging
cp .env.staging .env

# Never commit .env files!
```