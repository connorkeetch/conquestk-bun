# Database Migration Guide

## 🚀 Quick Reference

### Run Migrations
```bash
# Local development
cd backend && npm run migrate

# Check status
cd backend && npm run migrate:status

# Production (automatic since Sept 2025)
# Runs on deployment via backend/package.json start script
```

### Update Schema Documentation
```bash
# Regenerate the docs/operations/database-schema.md catalog after applying migrations
cd backend && npm run check:schema -- --skip-validation --export ../docs/operations/database-schema.md
```

### Direct Database Access
```bash
# Production connection
postgresql://postgres:QZCDzahSSRUZLYUERywzrSMJvUWmgbor@yamanote.proxy.rlwy.net:46553/railway

# Check database state
npx ts-node src/scripts/checkProductionDb.ts
```

## 📁 Migration Files

### Location
`backend/migrations/`

### Naming Convention
`XXX_description.sql` where XXX is a 3-digit number
- Example: `014_add_map_status_column.sql`
- Numbers determine execution order
- Never reuse numbers

### Current Migrations (Sept 2025)
- `004_user_preferences.sql` - User preferences table with theme
- `011_final_consolidated_schema.sql` - Core schema with all tables
- `012_remove_unused_is_verified_field.sql` - Cleanup migration
- `013_add_creator_id_to_maps.sql` - Map creator tracking
- `014_add_map_status_column.sql` - Map status system
- `015_consolidate_user_tables.sql` - User table consolidation
- `016_add_vip_and_premium_features.sql` - VIP flags, premium tiers, admin status

## 🔧 Common Issues & Solutions

### Issue: "column 'X' does not exist"
**Cause**: Migration hasn't run on that environment

**Solution**:
```bash
# Check if migrations ran
cd backend && npm run migrate:status

# Force run migrations
cd backend && npm run migrate

# Emergency fix (production)
# Connect with pgAdmin and run:
ALTER TABLE table_name 
ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT value;
```

### Issue: "relation 'X' does not exist"
**Cause**: Table doesn't exist (migration failed or didn't run)

**Solution**:
```bash
# Check all tables
npx ts-node src/scripts/checkProductionDb.ts

# If table missing, check migration 011
# May need to run manually via pgAdmin
```

### Issue: Admin panel 500 errors
**Cause**: Usually missing database columns/tables

**Quick Fixes**:
1. Clear browser cache (removes bad JWT tokens)
2. Check database schema: `npm run check:schema`
3. Run migrations: `npm run migrate`
4. Check specific tables:
   - `user_account_status` (from migration 011)
   - `user_preferences.theme` (from migration 004)
   - `maps.status` (from migration 014)
   - `users.is_vip`, `users.premium_tier` (from migration 016)
   - `maps.is_vip_only` (from migration 016)

### Issue: "Unexpected token '*'" in JWT
**Cause**: Browser caching null token as string "*"

**Solution**:
```javascript
// Clear in browser console
localStorage.clear()
// Or just remove token
localStorage.removeItem('token')
// Then refresh page
```

## 🛠️ Writing New Migrations

### Template
```sql
-- Migration: XXX_description
-- Date: YYYY-MM-DD
-- Purpose: Brief description

-- Add new column (safe)
ALTER TABLE table_name 
ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT value;

-- Add constraint (safe)
ALTER TABLE table_name 
ADD CONSTRAINT IF NOT EXISTS constraint_name 
CHECK (condition);

-- Create table (safe)
CREATE TABLE IF NOT EXISTS table_name (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index (safe)
CREATE INDEX IF NOT EXISTS idx_name 
ON table_name(column_name);

-- Drop column (careful!)
ALTER TABLE table_name 
DROP COLUMN IF EXISTS old_column;
```

### Best Practices
1. **Always use IF NOT EXISTS/IF EXISTS** clauses
2. **Test locally first**: `cd backend && npm run migrate`
3. **Include rollback comments** for complex changes
4. **One logical change per migration** file
5. **Never modify existing migration files** after deployment

## 🚨 Emergency Procedures

### Production Database Down
1. Check Railway status page
2. Verify connection string hasn't changed
3. Check Railway dashboard for database status
4. Contact Railway support if needed

### Failed Migration in Production
1. Check deployment logs in Railway
2. Connect via pgAdmin to inspect state
3. Manually apply missing changes
4. Create fix migration for next deployment

### Rollback Procedure
```sql
-- Example rollback for adding column
ALTER TABLE table_name 
DROP COLUMN IF EXISTS column_name;

-- Example rollback for creating table
DROP TABLE IF EXISTS table_name CASCADE;
```

## 📊 Monitoring Migration Health

### Check Script
Create `backend/src/scripts/migrationHealth.ts`:
```typescript
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function checkMigrationHealth() {
  const issues = []
  
  // Check critical tables
  const tables = ['users', 'maps', 'user_preferences', 'user_account_status']
  for (const table of tables) {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      )`,
      [table]
    )
    if (!result.rows[0].exists) {
      issues.push(`Missing table: ${table}`)
    }
  }
  
  // Check critical columns
  const columns = [
    { table: 'user_preferences', column: 'theme' },
    { table: 'maps', column: 'status' },
    { table: 'maps', column: 'creator_id' },
    { table: 'users', column: 'is_vip' },
    { table: 'users', column: 'premium_tier' },
    { table: 'users', column: 'is_admin' },
    { table: 'maps', column: 'is_vip_only' }
  ]
  
  for (const { table, column } of columns) {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = $2
      )`,
      [table, column]
    )
    if (!result.rows[0].exists) {
      issues.push(`Missing column: ${table}.${column}`)
    }
  }
  
  if (issues.length > 0) {
    console.log('❌ Migration issues found:')
    issues.forEach(issue => console.log(`  - ${issue}`))
  } else {
    console.log('✅ All migrations appear healthy')
  }
  
  await pool.end()
}

checkMigrationHealth()
```

## 📚 Additional Resources

- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- [Railway PostgreSQL Guide](https://docs.railway.app/databases/postgresql)
- [pgAdmin Documentation](https://www.pgadmin.org/docs/)
- Project migration history: `backend/migrations/`
