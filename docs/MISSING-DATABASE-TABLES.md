# Missing Database Tables Analysis

## 📊 Current Database Status

**Existing Tables** (from migration 003):
```sql
users ✅
game_rooms ✅  
room_players ✅
game_states ✅
game_moves ✅
maps ✅
map_territories ✅
custom_maps ✅
map_submissions ✅
map_reviews ✅
player_stats ✅
player_game_stats ✅
game_history ✅
game_analytics ✅
friendships ✅
user_blocks ✅
user_profiles ✅  -- Basic table exists
chat_messages ✅
achievements ✅  -- Basic table exists
user_achievements ✅
achievement_progress ✅
tournaments ✅
tournament_participants ✅
tournament_matches ✅
admin_roles ✅
user_admin_roles ✅
admin_activity_logs ✅
user_bans ✅
notifications ✅
user_reports ✅
territory_modifiers ✅
territory_events ✅
email_verification_logs ✅
password_reset_tokens ✅
```

## ❌ MISSING TABLES BREAKING SERVICES

### 1. Profile Service Tables

The `profileService.ts` expects these specific tables that don't match our current schema:

```sql
-- Expected by profileService.getUserProfile()
user_statistics  -- ❌ We have 'player_stats' instead
user_preferences -- ❌ Missing entirely  

-- Expected structure doesn't match current tables
user_profiles    -- ✅ Exists but wrong structure
achievements     -- ✅ Exists but may have wrong structure
user_achievements -- ✅ Exists  
game_history     -- ✅ Exists
```

### 2. Skills System Tables

The `skillsRoutes.ts` expects:
```sql
user_ratings          -- ❌ Missing
rating_history        -- ❌ Missing  
skill_leaderboard     -- ❌ Missing
leaderboard_cache     -- ❌ Missing
```

### 3. Map Workflow Tables

The `mapWorkflowController.ts` expects:
```sql
map_drafts            -- ❌ Missing
map_workflow_history  -- ❌ Missing
admin_notifications   -- ❌ Missing (different from 'notifications')
workflow_notifications -- ❌ Missing
```

### 4. Map Staging Tables

The `mapStaging.ts` routes expect:
```sql
map_versions         -- ❌ Missing
map_staging_stats    -- ❌ Missing  
```

### 5. Admin Enhanced Tables

The `adminRoutes.ts` expects:
```sql
content_moderation_queue  -- ❌ Missing
game_monitoring          -- ❌ Missing
feature_flags_audit      -- ❌ Missing
admin_performance_stats  -- ❌ Missing
```

## 🔧 TABLE STRUCTURE MISMATCHES

### Current `user_profiles` vs Expected

**Current Structure** (from migration):
```sql
CREATE TABLE user_profiles (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    bio TEXT,
    avatar_url VARCHAR(500),
    -- basic fields
);
```

**Expected by profileService**:
```sql  
-- profileService expects these additional fields:
level INTEGER
experience_points INTEGER  
total_playtime INTEGER
current_streak INTEGER
longest_streak INTEGER
join_date TIMESTAMP
last_active TIMESTAMP
preferences JSONB  -- Should be separate user_preferences table
```

### Current `player_stats` vs Expected `user_statistics`

**Current Structure**:
```sql
CREATE TABLE player_stats (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    -- basic game stats
);
```

**Expected by profileService**:
```sql
CREATE TABLE user_statistics (
    user_id UUID PRIMARY KEY,  -- Different PK structure
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,  -- 'wins' vs 'games_won'
    games_lost INTEGER DEFAULT 0,
    games_abandoned INTEGER DEFAULT 0,  -- ❌ Missing
    territories_conquered INTEGER DEFAULT 0,  -- ❌ Missing
    battles_won INTEGER DEFAULT 0,  -- ❌ Missing
    battles_lost INTEGER DEFAULT 0,  -- ❌ Missing
    continents_controlled INTEGER DEFAULT 0,  -- ❌ Missing
    average_game_length INTEGER DEFAULT 0,  -- ❌ Missing
    longest_game INTEGER DEFAULT 0,  -- ❌ Missing
    shortest_game INTEGER DEFAULT 0,  -- ❌ Missing
    best_turn_time INTEGER DEFAULT 0,  -- ❌ Missing
    maps_created INTEGER DEFAULT 0,  -- ❌ Missing
    maps_rated INTEGER DEFAULT 0,  -- ❌ Missing
    tournaments_joined INTEGER DEFAULT 0,  -- ❌ Missing
    tournaments_won INTEGER DEFAULT 0,  -- ❌ Missing
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🎯 RECOMMENDED MIGRATION STRATEGY

### Option 1: Quick Fix (Recommended)
**Goal**: Make current system work without breaking changes

1. **Fix ProfileOverview**: Remove dependency on complex profile service
2. **Add Missing Fields**: Extend current tables with missing fields
3. **Create Adapter**: Build adapter layer between current schema and profileService expectations

```sql
-- Migration 004: Extend existing tables
ALTER TABLE player_stats 
ADD COLUMN games_abandoned INTEGER DEFAULT 0,
ADD COLUMN territories_conquered INTEGER DEFAULT 0,
ADD COLUMN battles_won INTEGER DEFAULT 0,
ADD COLUMN battles_lost INTEGER DEFAULT 0;

-- Add user preferences table
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE,
    theme VARCHAR(20) DEFAULT 'dark',
    language VARCHAR(5) DEFAULT 'en', 
    timezone VARCHAR(50) DEFAULT 'UTC',
    notifications_enabled BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    sound_effects BOOLEAN DEFAULT true,
    -- etc
);

-- Create view to map current schema to expected schema
CREATE VIEW user_statistics AS 
SELECT 
    user_id,
    games_played,
    wins as games_won,
    losses as games_lost,
    games_abandoned,
    territories_conquered,
    battles_won,
    battles_lost,
    updated_at
FROM player_stats;
```

### Option 2: Full Rewrite (Future)
**Goal**: Implement proper comprehensive profile system

1. **New Migration**: Create all missing tables with proper structure
2. **Data Migration**: Migrate existing data to new schema
3. **Update Services**: Update all services to use new schema
4. **Frontend Rebuild**: Build comprehensive profile frontend

## 🚨 IMMEDIATE ACTION ITEMS

### Critical (Breaks Current Features)
1. ❌ **Fix ProfileOverview Email Verification**: We already fixed this! ✅
2. ❌ **Add `/api/game/recent` endpoint**: ProfileOverview expects this
3. ❌ **Remove broken profile service calls**: Frontend should not call unimplemented services

### High Priority (Missing Functionality)
1. **Create user_preferences table**: Many features expect this
2. **Extend player_stats**: Add missing fields for compatibility  
3. **Create skill system tables**: If leaderboards need ranking features
4. **Add `/api/game/recent` endpoint**: For profile game history

### Medium Priority (Future Features)
1. **Map workflow tables**: For map submission system
2. **Enhanced admin tables**: For advanced admin features
3. **Notification subscription tables**: For push notifications

### Low Priority (Advanced Features)  
1. **Map staging system**: For version control
2. **Tournament advanced tables**: For tournament brackets
3. **Achievement system enhancements**: For complex achievements

## 🏃‍♂️ NEXT STEPS

1. **Immediate**: Create migration 004 with user_preferences + extend player_stats
2. **This Week**: Implement `/api/game/recent` endpoint 
3. **Next Week**: Build simple profile consolidation
4. **Future**: Plan comprehensive profile system rewrite