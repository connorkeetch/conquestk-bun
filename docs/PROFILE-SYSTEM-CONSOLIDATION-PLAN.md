# Profile System Consolidation Plan

## 🎯 GOAL
Fix the inconsistent profile system where we have two different approaches:
1. **Simple Profile**: Using `/api/auth/me` for basic user info
2. **Complex Profile**: Using `/api/profile` for comprehensive stats (currently broken)

## 📊 CURRENT STATUS

### ✅ WORKING: Simple Auth Profile
- **Endpoint**: `/api/auth/me` 
- **Controller**: `authController.getProfile()`
- **Data**: Basic user info (id, username, email, emailVerified, isAdmin)
- **Frontend**: Used by `authService.getProfile()`, `LobbyPage.tsx`
- **Database**: Uses `users` table only

### ❌ BROKEN: Complex Profile Service
- **Endpoint**: `/api/profile/*` 
- **Service**: `profileService.ts` (registered but unusable)
- **Data**: Comprehensive stats, achievements, game history, preferences
- **Frontend**: `ProfileOverview.tsx` tries to use but falls back to auth
- **Database**: Expects tables that don't exist (`user_profiles`, `user_statistics`, `user_preferences`)

## 🔧 CONSOLIDATION STRATEGY

### Phase 1: Immediate Fixes (This Week)
**Goal**: Make current system work consistently

#### 1.1 Fix ProfileOverview Component ✅ DONE
- ✅ Use `authService.getProfile()` consistently
- ✅ Fix email verification field name consistency 
- ✅ Remove broken `/api/profile` calls

#### 1.2 Add Missing Game Recent Endpoint
**Problem**: `ProfileOverview.tsx` calls `/api/game/recent` which doesn't exist

**Solution**: Add endpoint to `gameController.ts`
```typescript
// Add to gameController.ts
async getRecentGames(req: Request, res: Response) {
  try {
    const userId = (req as any).userId
    const limit = parseInt(req.query.limit as string) || 10
    
    const games = await query(`
      SELECT 
        gr.id,
        gr.name,
        gr.created_at,
        gr.status,
        COUNT(rp.id) as player_count,
        gr.max_players,
        CASE WHEN rp.user_id = $1 THEN true ELSE false END as is_player
      FROM game_rooms gr
      LEFT JOIN room_players rp ON gr.id = rp.room_id
      WHERE rp.user_id = $1 OR gr.host_user_id = $1
      GROUP BY gr.id, rp.user_id
      ORDER BY gr.created_at DESC
      LIMIT $2
    `, [userId, limit])
    
    res.json({ games: games.rows })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recent games' })
  }
}
```

**Add to routes**: `router.get('/recent', authenticateToken, gameController.getRecentGames)`

#### 1.3 Create Basic User Preferences Table
**Problem**: Many features expect user preferences

**Solution**: Create migration 004
```sql
-- Migration 004: Add user preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'dark',
    language VARCHAR(5) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    notifications_enabled BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    sound_effects BOOLEAN DEFAULT true,
    background_music BOOLEAN DEFAULT true,
    auto_save_frequency INTEGER DEFAULT 30,
    animation_speed VARCHAR(10) DEFAULT 'normal',
    show_territory_names BOOLEAN DEFAULT true,
    show_army_counts BOOLEAN DEFAULT true,
    confirm_actions BOOLEAN DEFAULT true,
    privacy_level VARCHAR(10) DEFAULT 'public',
    allow_friend_requests BOOLEAN DEFAULT true,
    show_online_status BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
```

### Phase 2: Enhanced Simple Profile (Next Week)
**Goal**: Extend auth system to include preferences and basic stats

#### 2.1 Extend AuthController.getProfile()
```typescript
// Update authController.getProfile() to include preferences and stats
async getProfile(req: Request, res: Response) {
  try {
    const userId = (req as any).userId
    const user = await this.userService.findById(userId)
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Get user preferences
    const preferences = await query(
      'SELECT * FROM user_preferences WHERE user_id = $1', 
      [userId]
    )
    
    // Get basic stats
    const stats = await query(
      'SELECT * FROM player_stats WHERE user_id = $1',
      [userId]
    )

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.email_verified,
        isAdmin: user.is_admin || false,
        preferences: preferences.rows[0] || null,
        stats: stats.rows[0] || null,
      },
    })
  } catch (error) {
    logger.error('Get profile error:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
```

#### 2.2 Add Preferences Update Endpoint
```typescript
// Add to authController.ts
async updatePreferences(req: Request, res: Response) {
  try {
    const userId = (req as any).userId
    const { preferences } = req.body
    
    // Upsert user preferences
    await query(`
      INSERT INTO user_preferences (user_id, theme, language, notifications_enabled)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        theme = EXCLUDED.theme,
        language = EXCLUDED.language, 
        notifications_enabled = EXCLUDED.notifications_enabled,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, preferences.theme, preferences.language, preferences.notifications_enabled])
    
    res.json({ message: 'Preferences updated successfully' })
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preferences' })
  }
}
```

**Add route**: `router.put('/preferences', authenticateToken, authController.updatePreferences)`

#### 2.3 Update ProfileOverview to Use Enhanced Data
```typescript
// ProfileOverview.tsx - use enhanced auth profile
const fetchProfileData = async () => {
  try {
    const profileResponse = await authService.getProfile()
    const userData = profileResponse.user
    
    setProfile({
      id: userData.id,
      username: userData.username,
      email: userData.email,
      email_verified: userData.emailVerified,
      preferences: userData.preferences || defaultPreferences,
      stats: userData.stats || defaultStats
    })
  } catch (error) {
    console.error('Failed to fetch profile:', error)
  }
}
```

### Phase 3: Comprehensive Profile System (Future)
**Goal**: Build full-featured profile system when needed

#### 3.1 Implement Full Profile Tables
- Create comprehensive migration with all profile tables
- Implement proper `profileService` with working database schema
- Build advanced profile frontend with achievements, detailed stats, etc.

#### 3.2 Advanced Profile Features
- Public profile viewing (`/profile/:username`)
- Achievement system with unlocking mechanics
- Detailed game statistics and analytics
- Social features (friends, activity feed)
- Advanced privacy controls

## 🚀 IMPLEMENTATION TIMELINE

### Week 1: Critical Fixes
- [x] ✅ Fix ProfileOverview email verification (DONE)
- [ ] Add `/api/game/recent` endpoint
- [ ] Create user_preferences table (migration 004)
- [ ] Test email verification flow end-to-end

### Week 2: Enhanced Simple Profile
- [ ] Extend authController.getProfile() with preferences/stats
- [ ] Add preferences update endpoint  
- [ ] Update ProfileOverview to use enhanced data
- [ ] Add settings page preferences management

### Week 3: Polish & Testing
- [ ] Add proper error handling for all profile endpoints
- [ ] Write comprehensive tests for profile system
- [ ] Update documentation and API specs
- [ ] Performance optimization for profile queries

### Future: Comprehensive System
- [ ] Design full profile system architecture
- [ ] Create comprehensive database migration
- [ ] Build advanced profile frontend
- [ ] Implement social features and public profiles

## 🎯 SUCCESS METRICS

### Phase 1 Success:
- ✅ Email verification works consistently across all pages
- ✅ ProfileOverview loads without errors
- ✅ No more failed API calls in browser console
- ✅ Users can see basic profile information

### Phase 2 Success:
- ✅ Users can update preferences from settings
- ✅ Profile shows game statistics
- ✅ Recent games display correctly
- ✅ All profile data loads from single auth endpoint

### Phase 3 Success:
- ✅ Full featured profile system with achievements
- ✅ Public profile viewing
- ✅ Advanced statistics and analytics
- ✅ Social features working

## 📋 NEXT ACTIONS

1. **Create Migration 004**: Add user_preferences table
2. **Implement `/api/game/recent`**: Fix ProfileOverview game history
3. **Test end-to-end**: Ensure email verification + profile work together
4. **Document changes**: Update API documentation and frontend guides

The key insight from this audit is that we should **keep the profile system simple** for now by extending the working auth system, rather than trying to make the complex profile service work with missing database tables.