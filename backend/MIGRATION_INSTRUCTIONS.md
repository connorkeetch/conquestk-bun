# Database Migration Instructions

## Production Migration Fix

The production database is missing several tables and columns that are required for the application to run properly. Follow these steps to fix the issue:

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

### 3. What This Migration Does

The migration script (`002_add_missing_tables.sql`) will:

1. **Create missing map-related tables:**
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