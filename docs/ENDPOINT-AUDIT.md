# Endpoint Audit Report

## 📊 Current Backend Routes (Registered in server)

**From `/backend/src/index.ts` - Active Routes:**
```
/api/auth       → authRoutes
/api/game       → gameRoutes  
/api/maps       → mapRoutes
/api/profile    → profileRoutes
/api/skills     → skillsRoutes
/api/admin      → adminRoutes
/api/notifications → notificationRoutes
/api/users      → userRoutes
/api/workflow   → mapWorkflow routes
/api/terms      → terms routes
/api/staging    → mapStaging routes  
/api/feature-flags → featureFlags routes
```

## ✅ WORKING ENDPOINTS (Backend + Frontend Confirmed)

### 🔐 Authentication (`/api/auth`)
- **POST `/api/auth/register`** ✅ Used in `authService.ts`
- **POST `/api/auth/login`** ✅ Used in `authService.ts`
- **POST `/api/auth/logout`** ✅ Used in `authService.ts` 
- **GET `/api/auth/me`** ✅ Used in `authService.ts`
- **POST `/api/auth/verify-email/:token`** ✅ Used in `authService.ts` + `VerifyEmailToken.tsx`
- **POST `/api/auth/resend-verification`** ✅ Used in `authService.ts`
- **POST `/api/auth/forgot-password`** ✅ Used in `authService.ts`
- **POST `/api/auth/reset-password`** ✅ Used in `authService.ts`
- **POST `/api/auth/change-password`** ✅ Used in `Settings.tsx`
- **DELETE `/api/auth/delete-account`** ✅ Used in `Settings.tsx`

### 🎮 Game Management (`/api/game`)
- **GET `/api/game/rooms`** ✅ Used in `gameService.ts`
- **POST `/api/game/rooms`** ✅ Used in `gameService.ts`
- **POST `/api/game/rooms/:roomId/join`** ✅ Used in `gameService.ts`
- **DELETE `/api/game/rooms/:roomId/leave`** ✅ Used in `gameService.ts`
- **GET `/api/game/rooms/:roomId`** ✅ Used in `gameService.ts`
- **GET `/api/game/my-games`** ✅ Used in `LobbyPage.tsx` + `ActiveGamesDropdown.tsx`

### 🗺️ Maps (`/api/maps`)
- **GET `/api/maps`** ✅ Used in `mapService.ts`
- **GET `/api/maps/:mapId`** ✅ Used in `mapService.ts`
- **POST `/api/maps`** ✅ Used in `mapService.ts` + `MapEditorTokens.tsx`
- **PUT `/api/maps/:mapId`** ✅ Used in `mapService.ts`
- **DELETE `/api/maps/:mapId`** ✅ Used in `mapService.ts`
- **GET `/api/maps/my/maps`** ✅ Used in `mapService.ts`
- **POST `/api/maps/:mapId/territories`** ✅ Used in `mapService.ts`
- **POST `/api/maps/:mapId/continents`** ✅ Used in `mapService.ts`
- **POST `/api/maps/adjacencies`** ✅ Used in `mapService.ts`
- **GET `/api/maps/game-modes/list`** ✅ Used in `mapService.ts`
- **GET `/api/maps/abilities/list`** ✅ Used in `mapService.ts`
- **POST `/api/maps/:mapId/rate`** ✅ Used in `mapService.ts`

### 👨‍💼 Admin (`/api/admin`)
- **GET `/api/admin/status`** ✅ Used in `AdminPage.tsx`
- **GET `/api/admin/stats`** ✅ Used in `AdminPage.tsx`
- **GET `/api/admin/users`** ✅ Used in `AdminPage.tsx`
- **POST `/api/admin/users/:userId/ban`** ✅ Used in `AdminPage.tsx`
- **POST `/api/admin/users/:userId/unban`** ✅ Used in `AdminPage.tsx`
- **GET `/api/admin/content/queue`** ✅ Used in `AdminPage.tsx`
- **POST `/api/admin/content/:queueId/approve`** ✅ Used in `AdminPage.tsx`
- **POST `/api/admin/content/:queueId/reject`** ✅ Used in `AdminPage.tsx`
- **GET `/api/admin/games/active`** ✅ Used in `AdminPage.tsx`
- **POST `/api/admin/games/:gameId/end`** ✅ Used in `AdminPage.tsx`
- **POST `/api/admin/games/:gameId/exclude-elo`** ✅ Used in `AdminPage.tsx`
- **GET `/api/admin/feature-flags`** ✅ Used in `AdminPage.tsx`
- **POST `/api/admin/feature-flags/:flagName/toggle`** ✅ Used in `AdminPage.tsx`

### 🏆 Skills/Leaderboard (`/api/skills`)
- **GET `/api/skills/leaderboards/skill`** ✅ Used in `LeaderboardsPage.tsx`

### 🔔 Notifications (`/api/notifications`) 
- **GET `/api/notifications/vapid-public-key`** ✅ Used in `pushNotificationService.ts`
- **POST `/api/notifications/test`** ✅ Used in `Settings.tsx`

### 📋 Map Approval (`/api/map-approval`)
- **GET `/api/map-approval/approval-requests`** ✅ Used in `AdminMapReviews.tsx`
- **GET `/api/map-approval/stats/approvals`** ✅ Used in `AdminMapReviews.tsx`
- **PUT `/api/map-approval/approval-requests/:requestId/assign`** ✅ Used in `AdminMapReviews.tsx`
- **GET `/api/map-approval/approval-requests/:requestId`** ✅ Used in `AdminMapReview.tsx`
- **GET `/api/map-approval/review-criteria`** ✅ Used in `AdminMapReview.tsx`
- **POST `/api/map-approval/approval-requests/:requestId/review`** ✅ Used in `AdminMapReview.tsx`

## ❌ PROBLEM ENDPOINTS (Backend Exists, Frontend Issues)

### 👤 Profile System (`/api/profile`) - **BROKEN**
**Backend Routes Available:**
- GET `/api/profile/` → `profileService.getUserProfile()`
- PUT `/api/profile/` → `profileService.updateProfile()`  
- GET `/api/profile/stats` → `profileService.getUserStats()`
- GET `/api/profile/achievements` → `profileService.getAchievements()`
- POST `/api/profile/achievements/:achievementId` → `profileService.unlockAchievement()`
- GET `/api/profile/history` → `profileService.getGameHistory()`
- PUT `/api/profile/preferences` → `profileService.updatePreferences()`
- GET `/api/profile/leaderboard` → `profileService.getLeaderboard()`
- GET `/api/profile/:userId` → `profileService.getUserProfile(userId)`

**Frontend Usage:**
- ❌ `ProfileOverview.tsx` tries to use `/api/profile` but falls back to `authService.getProfile()` (/api/auth/me)

**Issues:**
1. ❌ **Missing Database Tables**: `profileService.ts` expects `user_profiles`, `user_statistics`, `user_achievements`, `achievements`, `user_preferences`, `game_history` tables
2. ❌ **Frontend Not Using**: No frontend components actually use the `/api/profile` endpoints
3. ❌ **Schema Mismatch**: ProfileService uses complex schema not in current migrations

### 🗄️ Users (`/api/users`) - **DUPLICATED**
**Backend Routes Available:**
- GET `/api/users/profile` → Basic user profile (duplicates `/api/auth/me`)
- POST `/api/users/check-username` → Username availability  
- PUT `/api/users/profile` → Update profile
- PUT `/api/users/change-password` → Change password (duplicates `/api/auth/change-password`)

**Frontend Usage:**
- ❌ **Not Used**: No frontend code uses `/api/users` endpoints
- ❌ **Duplicates Auth**: `/api/users/profile` duplicates `/api/auth/me`
- ❌ **Duplicates Auth**: `/api/users/change-password` duplicates `/api/auth/change-password`

## ❓ PARTIALLY IMPLEMENTED ENDPOINTS

### 📊 Game Stats
**Backend:** ❌ No endpoint for `/api/game/recent` 
**Frontend:** ❌ `ProfileOverview.tsx` tries to fetch `/api/game/recent` (fails silently)

### 🏆 Skill System (`/api/skills`)
**Backend Routes Available:**
- GET `/api/skills/users/:userId/rating` 
- GET `/api/skills/users/:userId/rating-history`
- GET `/api/skills/users/:userId/rank` 
- POST `/api/skills/leaderboards/refresh`

**Frontend Usage:**
- ✅ Only `/api/skills/leaderboards/skill` is used
- ❓ Other skill endpoints not used by frontend

## 🔍 UNUSED BACKEND ROUTES

### Map Workflow (`/api/workflow`)
**Available but unused routes:**
- POST `/api/workflow/drafts`
- GET `/api/workflow/drafts` 
- POST `/api/workflow/maps/:mapId/submit`
- GET `/api/workflow/maps/:mapId/history`
- GET `/api/workflow/admin/reviews/pending`
- POST `/api/workflow/admin/maps/:mapId/approve`
- POST `/api/workflow/admin/maps/:mapId/reject`
- POST `/api/workflow/admin/maps/:mapId/archive`
- POST `/api/workflow/admin/maps/:mapId/toggle-featured`
- GET `/api/workflow/admin/maps/status/:status`
- GET `/api/workflow/admin/notifications`
- POST `/api/workflow/admin/notifications/:notificationId/read`

### Map Staging (`/api/staging`)  
**Available but unused routes:**
- GET `/api/staging/maps/:mapId/versions`
- GET `/api/staging/versions/:versionId`
- POST `/api/staging/maps/:mapId/versions`
- PUT `/api/staging/versions/:versionId/current`
- POST `/api/staging/versions/:versionId/submit`
- GET `/api/staging/my-maps`
- DELETE `/api/staging/versions/:versionId`
- GET `/api/staging/stats`
- DELETE `/api/staging/stats/:statId`

### Terms (`/api/terms`)
**Available routes:**
- GET `/api/terms/latest`
- POST `/api/terms/accept`
- GET `/api/terms/versions`
- GET `/api/terms/content/:featureType`

### Feature Flags (`/api/feature-flags`)
**Available routes:**
- GET `/api/feature-flags/`
- GET `/api/feature-flags/admin`
- PUT `/api/feature-flags/:flagName`

### Notifications (`/api/notifications`)
**Partially used:**
- GET `/api/notifications/vapid-public-key` ✅ Used
- POST `/api/notifications/test` ✅ Used  
- POST `/api/notifications/subscribe` ❌ Not used
- POST `/api/notifications/unsubscribe` ❌ Not used

## 📋 MISSING DATABASE TABLES

Based on the audit, these tables are expected by services but don't exist:

### Profile System Tables
```sql
-- Required by profileService.ts
user_profiles
user_statistics  
user_achievements
achievements
user_preferences
game_history
```

### Map Workflow Tables
```sql
-- Required by mapWorkflow routes
map_drafts
map_submissions  
map_reviews
map_approval_history
```

### Skill System Tables
```sql
-- Required by skills routes
user_ratings
rating_history
skill_leaderboard
```

### Admin System Tables
```sql
-- Required by admin routes  
content_moderation_queue
game_monitoring
feature_flag_audit
```

## 🎯 RECOMMENDATIONS

### Immediate Fixes
1. **Fix Profile System**: Either implement missing tables OR simplify to use auth endpoints
2. **Remove Dead Code**: Delete unused `/api/users` routes that duplicate auth
3. **Add Missing Endpoint**: Implement `/api/game/recent` for ProfileOverview
4. **Update Frontend**: Make ProfileOverview use consistent data source

### Future Improvements  
1. **Implement Profile Tables**: Add comprehensive profile system with proper migrations
2. **Map Workflow**: Connect frontend to workflow endpoints for map submission system
3. **Skill System**: Build frontend for rating/leaderboard features
4. **Notification System**: Implement subscription endpoints for push notifications

### Profile System Consolidation Plan
1. **Phase 1**: Keep ProfileOverview simple, use `/api/auth/me` only
2. **Phase 2**: Implement proper profile tables + migrations
3. **Phase 3**: Build comprehensive profile frontend with stats/achievements
4. **Phase 4**: Add public profile viewing functionality