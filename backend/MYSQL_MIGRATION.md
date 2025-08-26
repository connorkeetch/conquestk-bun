# MySQL Migration Guide

## ✅ Migration Complete!

We've successfully migrated from PostgreSQL to MySQL, which solves all the SQL syntax incompatibility issues between development (SQLite) and production (MySQL).

## Why MySQL?

**The Problem:**
- SQLite uses `?` placeholders: `SELECT * FROM users WHERE email = ?`
- PostgreSQL uses numbered placeholders: `SELECT * FROM users WHERE email = $1`
- This caused constant "syntax error" issues in production

**The Solution:**
- MySQL also uses `?` placeholders, just like SQLite!
- No more conditional SQL checks needed
- Same syntax works in both development and production

## What Changed

### 1. Database Driver
- **Removed:** `pg` (PostgreSQL driver)
- **Added:** `mysql2` (MySQL driver)

### 2. Database Configuration
- Updated `backend/src/config/database.ts` to support MySQL
- Simplified connection logic - no more PostgreSQL-specific code

### 3. SQL Queries
- Removed ALL conditional SQL checks from `userService.ts`
- Now using the same `?` placeholder syntax everywhere

### 4. Migration Files
- Created MySQL-specific migration for extended maps schema
- Migration runner now auto-detects and uses MySQL migrations when available

## Setting Up MySQL on Railway

1. **Remove PostgreSQL Plugin** (if exists)
   - Go to your Railway project
   - Remove the PostgreSQL plugin

2. **Add MySQL Plugin**
   - Click "New" → "Database" → "MySQL"
   - Railway will automatically provision a MySQL database

3. **Environment Variables**
   - Railway automatically sets `DATABASE_URL` in this format:
     ```
     mysql://root:password@host:3306/railway
     ```
   - No manual configuration needed!

4. **Deploy**
   - Push the changes to trigger a new deployment
   - The app will automatically connect to MySQL

## Local Development

Development continues to use SQLite (no changes needed):
- Fast and lightweight
- No installation required
- Same `?` placeholder syntax as MySQL

## Testing Locally with MySQL (Optional)

If you want to test with MySQL locally:

1. **Install MySQL:**
   ```bash
   # Windows (using Chocolatey)
   choco install mysql
   
   # Or download from: https://dev.mysql.com/downloads/
   ```

2. **Create Database:**
   ```sql
   CREATE DATABASE risk_game;
   ```

3. **Update `.env.development`:**
   ```env
   DB_TYPE=mysql
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=risk_game
   DB_USER=root
   DB_PASSWORD=REMOVED_COMMITTED_CREDENTIAL
   ```

## Benefits of This Migration

1. **No More Syntax Errors** - Same SQL syntax in dev and prod
2. **Simpler Code** - Removed all conditional SQL logic
3. **Better Compatibility** - MySQL and SQLite are more similar
4. **Easier Debugging** - What works locally works in production
5. **Railway Support** - Excellent MySQL support on Railway

## Rollback Plan

If you need to switch back to PostgreSQL:
1. Install `pg` package: `npm install pg`
2. Revert `database.ts` changes
3. Add back conditional SQL in `userService.ts`
4. Switch Railway database to PostgreSQL

But you shouldn't need to - MySQL solves all the issues!