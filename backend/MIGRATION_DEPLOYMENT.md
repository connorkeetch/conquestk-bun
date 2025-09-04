# Consolidated Migration Deployment Guide

## Overview
This guide covers deploying the consolidated database schema migration (010_consolidated_schema.sql) that combines all previous migrations into a single, clean PostgreSQL schema.

## 🚨 Important Notes
- **Data Loss**: This migration drops all existing tables and recreates them
- **Backup Required**: User data will be backed up and restored automatically
- **Minimal Data**: As noted, there's minimal production data aside from user account

## 🛠️ Pre-Deployment Checklist

### 1. Environment Setup
Ensure the following environment variables are set:
```bash
DATABASE_URL=postgresql://...  # Production PostgreSQL URL
```

### 2. Verify Current Status
Check current database state:
```bash
cd backend
npm run check:schema
```

### 3. Stop Application (if running in production)
To prevent data corruption during migration:
```bash
# On Railway/production server
pm2 stop all  # or equivalent
```

## 🚀 Deployment Steps

### Option 1: Automated Deployment (Recommended)
```bash
cd backend
npm run deploy:consolidated
```

This script will:
1. ✅ Create backup of existing user data
2. ✅ Execute consolidated migration
3. ✅ Verify table creation
4. ✅ Restore user data
5. ✅ Confirm migration success

### Option 2: Manual Deployment
```bash
# 1. Create backup
cd backend
npm run backup:production

# 2. Run migration manually
psql "$DATABASE_URL" -f migrations/010_consolidated_schema.sql

# 3. Verify tables were created
npm run check:schema
```

## 📋 What Gets Migrated

### ✅ Preserved Data
- User accounts (username, email, password, ratings)
- User settings (theme, preferred color, notifications)
- User profiles (if they exist)

### 🆕 New Tables Created
- Complete admin system (roles, permissions, activity logs)
- Full game system (rooms, states, moves, analytics)
- Map system (territories, adjacencies, custom maps)
- Social features (friends, chat, notifications)
- Achievement system (achievements, progress tracking)
- Tournament system (tournaments, matches, participants)
- Content moderation (reports, reviews, bans)

### 🗑️ Dropped Data
- Any existing game rooms (will be recreated as needed)
- Old admin role assignments (will need to be reassigned)
- Temporary data (sessions, tokens, etc.)

## 🔍 Post-Migration Verification

### 1. Check Core Tables
```bash
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
```

Expected tables: `achievements`, `admin_roles`, `game_rooms`, `maps`, `users`, and 35+ others.

### 2. Verify User Data
```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) as user_count FROM users;"
psql "$DATABASE_URL" -c "SELECT username, email_verified, skill_rating FROM users LIMIT 5;"
```

### 3. Test Application
- ✅ User login/registration
- ✅ Profile page functionality  
- ✅ Settings page
- ✅ Admin panel (after assigning admin roles)
- ✅ Game creation (basic functionality)

## 🛡️ Rollback Plan

If issues occur, restore from backup:

### 1. Check Available Backups
```bash
ls -la backend/backups/
```

### 2. Restore Latest Backup
```bash
# Use the most recent backup file
psql "$DATABASE_URL" < backend/backups/production-backup-YYYY-MM-DDTHH-MM-SS.sql
```

### 3. Revert to Previous Migration State
```bash
# Drop consolidated tables
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-run individual migrations 001-009
cd backend
npm run migrate
```

## 🧹 Cleanup Steps

After successful deployment and verification:

### 1. Remove Old Migration Files (Optional)
```bash
# Move to archive directory
mkdir -p backend/migrations/archive
mv backend/migrations/001_*.sql backend/migrations/archive/
mv backend/migrations/002_*.sql backend/migrations/archive/
# ... up to 009
```

### 2. Update Migration Tracking
```bash
# Update migration tracking table to reflect consolidated state
psql "$DATABASE_URL" -c "INSERT INTO migration_log (migration_file, executed_at) VALUES ('010_consolidated_schema.sql', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;"
```

### 3. Clean Old Backups
```bash
# Keep only the most recent backup
find backend/backups/ -name "production-backup-*.sql" -mtime +7 -delete
```

## 🚨 Emergency Contacts

If issues arise during deployment:
- Check Railway logs for detailed error messages
- Review Sentry error tracking for application errors
- Use backup files in `backend/backups/` directory

## 📊 Expected Improvements

After successful deployment:
- ✅ Fixed production database type conflicts
- ✅ Proper PostgreSQL syntax throughout
- ✅ Comprehensive indexes for better performance
- ✅ Clean, maintainable schema structure
- ✅ All features ready for implementation
- ✅ Proper foreign key relationships

## 🎯 Next Steps

1. Test all application features
2. Reassign admin roles to appropriate users
3. Create initial game maps and territories
4. Set up achievement definitions
5. Configure tournament settings
6. Test real-time features (Socket.io)

---

**Success Criteria**: 
- All tables created successfully
- User data preserved and accessible
- Application starts without errors
- Login/authentication works
- Profile pages render correctly