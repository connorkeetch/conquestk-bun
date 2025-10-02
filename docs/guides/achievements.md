# Achievements Guide

This guide summarizes how achievements are modeled, exposed, and rendered in ConquestK for the initial MVP.

## Overview
- Definitions live in the `achievements` table; user unlocks use `user_achievements`.
- For future incremental tracking, use the `progress_data` JSONB column on `user_achievements`. There is no standalone `achievement_progress` table in v1.
- Backend API surfaces the current user's unlocked and available achievements.
- The Profile page renders an Achievements tab guarded by the `ui_profile_extras` feature flag.

## Data Model
- `achievements` columns (key): `id`, `name`, `description`, `category`, `icon`, `points`, `rarity`, `unlock_criteria` (JSONB), `is_secret` (hidden), `created_at`.
- `user_achievements`: `id`, `user_id`, `achievement_id`, `progress_data` (JSONB), `unlocked_at`.

Notes
- Use `is_secret = FALSE` for publicly discoverable achievements.
- Store future badge art at `achievements/<slug>.svg` on the CDN; use slugified `name`.

## API
- `GET /api/profile/achievements`
  - Response: `{ unlocked: UserAchievement[], available: Achievement[] }`
  - Backend source: `backend/src/routes/profile.ts` → `profileService.getAchievements()`.

- `POST /api/profile/achievements/:achievementId` (admin/testing)
  - Unlocks an achievement for the current user.

## Frontend
- Service: `frontend/src/services/achievementsService.ts`
  - `getMyAchievements()` returns normalized unlocked/available lists.
- UI: `frontend/src/components/profile/AchievementsPanel.tsx`
  - Renders unlocked and all achievements; uses emoji or `/assets/achievements/<slug>.svg` fallback.
- Feature flag: `ui_profile_extras` (constant: `FEATURE_FLAGS.PROFILE_EXTRAS`)
  - Gates the Achievements tab and panel in `ProfilePage`.

## Developer Tasks (Phase 1 MVP)
- Add final definitions for v1 catalog via SQL seed or admin script.
- Wire game events to progress logic and unlock rules in backend service (follow the plan in `docs/planning/achievements-plan.md`).
- Replace placeholder badge art as assets become available.

## Verification
- Enable `ui_profile_extras` for your user via the feature flags admin or DB.
- Visit `/profile/:username` and switch to the Achievements tab.
- Confirm `GET /api/profile/achievements` returns data and the UI renders unlocked/available lists.

---
This guide complements the detailed plan in `docs/planning/achievements-plan.md`. No changes were made to `AGENTS.md` or `CLAUDE.md` in this update (they remain in sync).
