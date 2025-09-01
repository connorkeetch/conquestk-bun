# Database Migration Instructions

**Last Updated**: 2025-09-01

## ⚠️ IMPORTANT: Database Change Protocol

**NEVER modify database tables directly in code!** Always follow this process:

1. Create a new migration file in `backend/migrations/postgres/`
2. Test the migration locally
3. Commit and push to trigger automatic deployment
4. Monitor production logs to ensure migration success

## Current Migration Status

### Completed Migrations:
- ✅ **001_complete_schema.sql** - Initial complete schema
- ✅ **002_add_missing_tables.sql** - Added game_rooms and map-related tables
- ✅ **003_complete_missing_tables.sql** - Comprehensive migration with all feature tables

### Production Database Status:
The production database now includes ALL required tables for the application

### 1. Local Testing (Optional)

If you want to test locally first, set your DATABASE_URL to your local PostgreSQL:
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/risk_game
npm run migrate
```

### 2. Production Migration on Railway

#### Option A: Run via Railway CLI
```bash
# Install Railway CLI if you haven't already
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run the migration in production
railway run npm run migrate
```

#### Option B: Manual Database Connection
1. Get your production DATABASE_URL from Railway dashboard
2. Set it temporarily in your terminal:
```bash
# Windows PowerShell
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST.railway.app:PORT/railway"

# Windows CMD
set DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_HOST.railway.app:PORT/railway

# Then run migration
cd backend
npm run migrate
```

#### Option C: Direct SQL Execution
1. Connect to your Railway PostgreSQL database using a tool like pgAdmin, DBeaver, or psql
2. Run the SQL file directly: `backend/migrations/postgres/002_add_missing_tables.sql`

## Creating New Migrations

When adding new database features:

```bash
# 1. Create migration file
touch backend/migrations/postgres/004_your_feature.sql

# 2. Add your SQL
CREATE TABLE IF NOT EXISTS your_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- your columns
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

# 3. Test locally
cd backend && npm run migrate

# 4. Commit and push
git add backend/migrations/postgres/004_your_feature.sql
git commit -m "Add migration for your feature"
git push origin main
```

## Complete Table Reference

### What Migration 003 Added

The comprehensive migration 003 added ALL missing tables identified in the codebase audit:

1. **Game Room & Session Tables:**
   - `game_rooms` - Active game sessions
   - `room_players` - Players in each room
   - `game_states` - Current game state
   - `game_moves` - Move history

2. **Game History & Stats:**
   - `game_history` - Completed games archive
   - `player_game_stats` - Per-game player statistics
   - `player_stats` - Aggregate player statistics

3. **Achievement System:**
   - `achievements` - Achievement definitions
   - `user_achievements` - Earned achievements
   - `achievement_progress` - Progress tracking

4. **Social Features:**
   - `user_profiles` - Extended profile data
   - `friendships` - Friend connections
   - `user_blocks` - Blocked users
   - `chat_messages` - In-game chat
   - `private_messages` - Direct messages

5. **Tournament System:**
   - `tournaments` - Tournament definitions
   - `tournament_participants` - Registered players
   - `tournament_matches` - Match brackets
   - `ranking_history` - ELO history tracking

6. **Map Workflow:**
   - `map_submissions` - Map approval queue
   - `map_reviews` - Review feedback
   - `map_test_games` - Playtesting results
   - `map_approval_history` - Approval audit trail
   - `map_featured_history` - Featured map tracking

7. **Territory Modifiers:**
   - `territory_modifiers` - Special territory effects
   - `territory_events` - Random events
   - `active_territory_effects` - In-game active effects

8. **Admin & Moderation:**
   - `user_reports` - User-submitted reports
   - `user_bans` - Ban records
   - `notifications` - System notifications
   - `game_analytics` - Game telemetry
   - `user_activity` - Activity tracking

9. **Map-related tables (from migration 002):**
   - `map_usage_stats` - Track map usage statistics
   - `map_ratings` - User ratings for maps
   - `map_comments` - User comments on maps
   - `map_downloads` - Track map downloads
   - `map_favorites` - User favorite maps
   - `map_tags` - Tags for categorizing maps
   - `map_tag_associations` - Link maps to tags

2. **Add missing columns to users table:**
   - `skill_rating` - Player skill rating (ELO)
   - `email_verified` - Email verification status
   - `email_verification_token` - Token for email verification
   - `email_verification_expires` - Token expiration
   - `password_reset_token` - Password reset token
   - `password_reset_expires` - Reset token expiration
   - `skill_deviation` - Rating uncertainty
   - `games_played` - Total games played
   - `games_won` - Total games won
   - `peak_rating` - Highest rating achieved
   - `current_tier` - Player tier (bronze, silver, etc.)
   - `last_ranked_game_at` - Last ranked game timestamp
   - Soft delete columns (`deleted_at`, `deleted_by`, `deletion_reason`)

3. **Add missing columns to maps table:**
   - `download_count` - Number of downloads
   - `play_count` - Number of times played
   - `rating_average` - Average rating
   - `rating_count` - Number of ratings
   - `featured` - Featured map flag
   - `featured_at` - When map was featured

4. **Create performance indexes** for all new tables and columns

5. **Add update triggers** for `updated_at` columns

6. **Insert default map tags** (Classic, Fantasy, Historical, etc.)

### 4. Verify Migration Success

After running the migration, you can verify it worked by:

1. Checking the Railway logs for your application - errors should be resolved
2. Running this verification query:
```sql
-- Check if new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'map_%'
ORDER BY table_name;

-- Check if user columns were added
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('skill_rating', 'email_verified')
ORDER BY column_name;
```

### 5. Important Notes

- The migration script uses `IF NOT EXISTS` clauses, so it's safe to run multiple times
- It won't delete or modify existing data
- All new columns have default values, so existing rows will be updated automatically
- The migration is logged in the `schema_migrations` table

### 6. Troubleshooting

If you encounter errors:

1. **Connection errors**: Make sure your DATABASE_URL is correct and includes SSL settings for production
2. **Permission errors**: Ensure your database user has CREATE TABLE and ALTER TABLE permissions
3. **Syntax errors**: The migration uses PostgreSQL-specific syntax (DO blocks, gen_random_uuid())

### 7. After Migration

Once the migration is complete:
1. Redeploy your application on Railway
2. Test email verification and password reset features
3. Test map rating and commenting features
4. Monitor logs for any remaining database-related errors