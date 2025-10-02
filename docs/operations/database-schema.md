# ConquestK Database Schema

Generated on 2025-09-30T22:47:07Z

> This document is generated via `npm run check:schema -- --skip-validation --export ../docs/operations/database-schema.md`. Run the command after any migration changes to keep it current.

## Overview

- Database: `railway`
- Schema: `public`
- PostgreSQL: PostgreSQL 17.6
- Tables: 78
- Row counts reflect the snapshot captured when this file was generated.

## Table Summary

| Table | Columns | Rows |
| --- | ---: | ---: |
| `achievement_progress` | 8 | 0 |
| `achievements` | 10 | 6 |
| `admin_activity_logs` | 9 | 128 |
| `admin_notifications` | 9 | 1 |
| `admin_roles` | 7 | 4 |
| `capital_eliminations` | 6 | 0 |
| `clan_activity_log` | 7 | 0 |
| `clan_announcements` | 9 | 0 |
| `clan_applications` | 9 | 0 |
| `clan_chat_messages` | 8 | 0 |
| `clan_invitations` | 9 | 0 |
| `clan_members` | 13 | 0 |
| `clan_objectives` | 10 | 0 |
| `clan_roles` | 8 | 0 |
| `clan_war_matches` | 10 | 0 |
| `clan_wars` | 12 | 0 |
| `clans` | 22 | 0 |
| `content_approval_queue` | 10 | 0 |
| `conversation_members` | 11 | 0 |
| `conversation_messages` | 10 | 0 |
| `conversations` | 10 | 0 |
| `email_verification_logs` | 7 | 2 |
| `events` | 8 | 5 |
| `feature_flag_audit` | 8 | 70 |
| `feature_flags` | 13 | 9 |
| `friendships` | 6 | 0 |
| `game_moves` | 9 | 0 |
| `game_results` | 9 | 0 |
| `game_rooms` | 35 | 0 |
| `game_states` | 14 | 0 |
| `game_territory_modifiers` | 8 | 0 |
| `game_variants` | 11 | 0 |
| `map_asset_purge_runs` | 10 | 503 |
| `map_collaborators` | 5 | 0 |
| `map_continents` | 6 | 0 |
| `map_drafts` | 24 | 0 |
| `map_images_staging` | 19 | 0 |
| `map_ratings` | 7 | 0 |
| `map_review_queue` | 9 | 0 |
| `map_reviews` | 10 | 0 |
| `map_submission_logs` | 6 | 0 |
| `map_submissions` | 11 | 0 |
| `map_territories` | 8 | 0 |
| `map_territory_modifiers` | 5 | 0 |
| `map_versions` | 10 | 0 |
| `maps` | 33 | 0 |
| `matchmaking_queue` | 9 | 0 |
| `message_read_receipts` | 3 | 0 |
| `notifications` | 8 | 1 |
| `password_reset_tokens` | 6 | 0 |
| `player_game_results` | 13 | 0 |
| `player_stats` | 12 | 0 |
| `rating_history` | 8 | 0 |
| `room_players` | 19 | 0 |
| `schema_migrations` | 8 | 38 |
| `seasons` | 9 | 0 |
| `skill_leaderboard_cache` | 6 | 0 |
| `territory_adjacencies` | 4 | 0 |
| `territory_modifier_templates` | 8 | 0 |
| `transactions` | 12 | 0 |
| `user_account_status` | 7 | 0 |
| `user_achievements` | 5 | 0 |
| `user_admin_roles` | 7 | 1 |
| `user_bans` | 8 | 0 |
| `user_behavior_patterns` | 9 | 0 |
| `user_blocks` | 4 | 0 |
| `user_clan_preferences` | 5 | 0 |
| `user_feature_flags` | 4 | 1 |
| `user_inventory` | 8 | 0 |
| `user_preferences` | 32 | 1 |
| `user_profiles` | 10 | 0 |
| `user_reports` | 11 | 0 |
| `user_seasonal_stats` | 13 | 0 |
| `user_sessions` | 9 | 5 |
| `user_settings` | 8 | 0 |
| `user_terms_acceptance` | 6 | 0 |
| `users` | 32 | 14 |
| `web_push_subscriptions` | 13 | 1 |

## Enum Types

### `conversation_kind`

| Value | Order |
| --- | ---: |
| `game` | 1 |
| `direct` | 2 |
| `group` | 3 |
| `team` | 4 |

### `conversation_member_role`

| Value | Order |
| --- | ---: |
| `owner` | 1 |
| `admin` | 2 |
| `member` | 3 |


## Tables

### `achievement_progress`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `achievement_id` | `uuid` | No | — |
| `current_progress` | `integer` | No | `0` |
| `total_required` | `integer` | No | — |
| `metadata` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `achievement_progress_user_id_achievement_id_key`: `user_id`, `user_id`, `achievement_id`, `achievement_id`

**Foreign keys:**
- `achievement_progress_achievement_id_fkey`: (`achievement_id`) → `achievements` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `achievement_progress_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `achievement_progress_non_negative`: CHECK (current_progress >= 0 AND total_required > 0)

**Indexes:**
- `achievement_progress_pkey`: CREATE UNIQUE INDEX achievement_progress_pkey ON public.achievement_progress USING btree (id)
- `achievement_progress_user_id_achievement_id_key`: CREATE UNIQUE INDEX achievement_progress_user_id_achievement_id_key ON public.achievement_progress USING btree (user_id, achievement_id)
- `idx_achievement_progress_metadata_gin`: CREATE INDEX idx_achievement_progress_metadata_gin ON public.achievement_progress USING gin (metadata)
- `idx_achievement_progress_user_id`: CREATE INDEX idx_achievement_progress_user_id ON public.achievement_progress USING btree (user_id)

### `achievements`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `name` | `varchar(100)` | No | — |
| `description` | `text` | No | — |
| `category` | `varchar(50)` | No | `'general'` |
| `icon` | `varchar(100)` | Yes | — |
| `points` | `integer` | No | `0` |
| `rarity` | `varchar(20)` | No | `'common'` |
| `unlock_criteria` | `jsonb` | No | — |
| `is_secret` | `boolean` | No | `false` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `achievements_name_key`: `name`

**Foreign keys:**
- —

**Check constraints:**
- `achievements_points_non_negative`: CHECK (points >= 0)
- `achievements_rarity_check`: CHECK (rarity::text = ANY (ARRAY['common'::character varying, 'uncommon'::character varying, 'rare'::character varying, 'epic'::character varying, 'legendary'::character varying]::text[]))

**Indexes:**
- `achievements_name_key`: CREATE UNIQUE INDEX achievements_name_key ON public.achievements USING btree (name)
- `achievements_pkey`: CREATE UNIQUE INDEX achievements_pkey ON public.achievements USING btree (id)
- `idx_achievements_category`: CREATE INDEX idx_achievements_category ON public.achievements USING btree (category)
- `idx_achievements_unlock_criteria_gin`: CREATE INDEX idx_achievements_unlock_criteria_gin ON public.achievements USING gin (unlock_criteria)

### `admin_activity_logs`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `admin_user_id` | `uuid` | No | — |
| `action_type` | `varchar(50)` | No | — |
| `action_details` | `jsonb` | No | `'{}'` |
| `target_type` | `varchar(50)` | Yes | — |
| `target_id` | `uuid` | Yes | — |
| `ip_address` | `inet` | Yes | — |
| `user_agent` | `text` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `admin_activity_logs_admin_user_id_fkey`: (`admin_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `admin_activity_logs_pkey`: CREATE UNIQUE INDEX admin_activity_logs_pkey ON public.admin_activity_logs USING btree (id)
- `idx_admin_activity_logs_action_details_gin`: CREATE INDEX idx_admin_activity_logs_action_details_gin ON public.admin_activity_logs USING gin (action_details)
- `idx_admin_activity_logs_admin_user_id`: CREATE INDEX idx_admin_activity_logs_admin_user_id ON public.admin_activity_logs USING btree (admin_user_id)
- `idx_admin_activity_logs_created_at`: CREATE INDEX idx_admin_activity_logs_created_at ON public.admin_activity_logs USING btree (created_at DESC)

### `admin_notifications`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `admin_id` | `uuid` | Yes | — |
| `type` | `varchar(64)` | No | — |
| `title` | `varchar(255)` | No | — |
| `message` | `text` | Yes | — |
| `data` | `jsonb` | No | `'{}'` |
| `is_read` | `boolean` | No | `false` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `read_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `admin_notifications_admin_id_fkey`: (`admin_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- —

**Indexes:**
- `admin_notifications_pkey`: CREATE UNIQUE INDEX admin_notifications_pkey ON public.admin_notifications USING btree (id)
- `idx_admin_notifications_admin_id`: CREATE INDEX idx_admin_notifications_admin_id ON public.admin_notifications USING btree (admin_id, is_read)

### `admin_roles`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `name` | `varchar(50)` | No | — |
| `description` | `text` | Yes | — |
| `permissions` | `text[]` | No | `'{}'` |
| `is_super_admin` | `boolean` | No | `false` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `admin_roles_name_key`: `name`

**Foreign keys:**
- —

**Check constraints:**
- —

**Indexes:**
- `admin_roles_name_key`: CREATE UNIQUE INDEX admin_roles_name_key ON public.admin_roles USING btree (name)
- `admin_roles_pkey`: CREATE UNIQUE INDEX admin_roles_pkey ON public.admin_roles USING btree (id)
- `idx_admin_roles_name`: CREATE INDEX idx_admin_roles_name ON public.admin_roles USING btree (name)

### `capital_eliminations`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `room_id` | `uuid` | No | — |
| `eliminated_player_id` | `uuid` | No | — |
| `eliminating_player_id` | `uuid` | No | — |
| `eliminated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `capital_territory` | `varchar(100)` | No | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `capital_eliminations_eliminated_player_id_fkey`: (`eliminated_player_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `capital_eliminations_eliminating_player_id_fkey`: (`eliminating_player_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `capital_eliminations_room_id_fkey`: (`room_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `capital_eliminations_no_self`: CHECK (eliminated_player_id <> eliminating_player_id)

**Indexes:**
- `capital_eliminations_pkey`: CREATE UNIQUE INDEX capital_eliminations_pkey ON public.capital_eliminations USING btree (id)

### `clan_activity_log`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id` | `uuid` | No | — |
| `actor_user_id` | `uuid` | Yes | — |
| `action_type` | `text` | No | — |
| `metadata` | `jsonb` | No | `'{}'` |
| `target_id` | `uuid` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `clan_activity_log_actor_user_id_fkey`: (`actor_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `clan_activity_log_clan_id_fkey`: (`clan_id`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `clan_activity_log_pkey`: CREATE UNIQUE INDEX clan_activity_log_pkey ON public.clan_activity_log USING btree (id)
- `idx_clan_activity_action`: CREATE INDEX idx_clan_activity_action ON public.clan_activity_log USING btree (action_type)
- `idx_clan_activity_clan_created_at`: CREATE INDEX idx_clan_activity_clan_created_at ON public.clan_activity_log USING btree (clan_id, created_at DESC)

### `clan_announcements`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id` | `uuid` | No | — |
| `author_user_id` | `uuid` | No | — |
| `title` | `varchar(80)` | No | — |
| `body_markdown` | `text` | No | — |
| `pinned` | `boolean` | No | `false` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `expires_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `clan_announcements_author_user_id_fkey`: (`author_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `clan_announcements_clan_id_fkey`: (`clan_id`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `clan_announcements_pkey`: CREATE UNIQUE INDEX clan_announcements_pkey ON public.clan_announcements USING btree (id)
- `idx_clan_announcements_clan`: CREATE INDEX idx_clan_announcements_clan ON public.clan_announcements USING btree (clan_id)
- `idx_clan_announcements_pinned`: CREATE INDEX idx_clan_announcements_pinned ON public.clan_announcements USING btree (clan_id, pinned)

### `clan_applications`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id` | `uuid` | No | — |
| `user_id` | `uuid` | No | — |
| `status` | `text` | No | `'pending'` |
| `message` | `text` | Yes | — |
| `reviewed_by` | `uuid` | Yes | — |
| `reviewed_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `clan_applications_clan_id_fkey`: (`clan_id`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `clan_applications_reviewed_by_fkey`: (`reviewed_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `clan_applications_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `clan_applications_status_check`: CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text]))

**Indexes:**
- `clan_applications_pkey`: CREATE UNIQUE INDEX clan_applications_pkey ON public.clan_applications USING btree (id)
- `idx_clan_applications_clan`: CREATE INDEX idx_clan_applications_clan ON public.clan_applications USING btree (clan_id)
- `idx_clan_applications_pending_unique`: CREATE UNIQUE INDEX idx_clan_applications_pending_unique ON public.clan_applications USING btree (clan_id, user_id) WHERE (status = 'pending'::text)
- `idx_clan_applications_status`: CREATE INDEX idx_clan_applications_status ON public.clan_applications USING btree (status)
- `idx_clan_applications_user`: CREATE INDEX idx_clan_applications_user ON public.clan_applications USING btree (user_id)

### `clan_chat_messages`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id` | `uuid` | No | — |
| `user_id` | `uuid` | No | — |
| `body` | `text` | No | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `edited_at` | `timestamp` | Yes | — |
| `deleted_at` | `timestamp` | Yes | — |
| `deleted_by` | `uuid` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `clan_chat_messages_clan_id_fkey`: (`clan_id`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `clan_chat_messages_deleted_by_fkey`: (`deleted_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `clan_chat_messages_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `clan_chat_messages_pkey`: CREATE UNIQUE INDEX clan_chat_messages_pkey ON public.clan_chat_messages USING btree (id)
- `idx_clan_chat_messages_clan_created`: CREATE INDEX idx_clan_chat_messages_clan_created ON public.clan_chat_messages USING btree (clan_id, created_at DESC)
- `idx_clan_chat_messages_user`: CREATE INDEX idx_clan_chat_messages_user ON public.clan_chat_messages USING btree (user_id)

### `clan_invitations`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id` | `uuid` | No | — |
| `invited_user_id` | `uuid` | No | — |
| `invited_by` | `uuid` | No | — |
| `token` | `text` | No | — |
| `expires_at` | `timestamp` | Yes | — |
| `status` | `text` | No | `'pending'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `clan_invitations_token_unique`: `token`

**Foreign keys:**
- `clan_invitations_clan_id_fkey`: (`clan_id`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `clan_invitations_invited_by_fkey`: (`invited_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `clan_invitations_invited_user_id_fkey`: (`invited_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `clan_invitations_status_check`: CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text]))

**Indexes:**
- `clan_invitations_pkey`: CREATE UNIQUE INDEX clan_invitations_pkey ON public.clan_invitations USING btree (id)
- `clan_invitations_token_unique`: CREATE UNIQUE INDEX clan_invitations_token_unique ON public.clan_invitations USING btree (token)
- `idx_clan_invitations_clan`: CREATE INDEX idx_clan_invitations_clan ON public.clan_invitations USING btree (clan_id)
- `idx_clan_invitations_status`: CREATE INDEX idx_clan_invitations_status ON public.clan_invitations USING btree (status)
- `idx_clan_invitations_user`: CREATE INDEX idx_clan_invitations_user ON public.clan_invitations USING btree (invited_user_id)

### `clan_members`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id` | `uuid` | No | — |
| `user_id` | `uuid` | No | — |
| `role_id` | `uuid` | Yes | — |
| `joined_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `probation_until` | `timestamp` | Yes | — |
| `last_active_at` | `timestamp` | Yes | — |
| `status` | `text` | No | `'active'` |
| `last_role_change_at` | `timestamp` | Yes | — |
| `contribution_xp` | `bigint` | No | `0` |
| `contribution_matches` | `integer` | No | `0` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `clan_members_unique`: `clan_id`, `clan_id`, `user_id`, `user_id`

**Foreign keys:**
- `clan_members_clan_id_fkey`: (`clan_id`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `clan_members_role_id_fkey`: (`role_id`) → `clan_roles` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `clan_members_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `clan_members_status_check`: CHECK (status = ANY (ARRAY['active'::text, 'banned'::text, 'left'::text, 'kicked'::text]))

**Indexes:**
- `clan_members_pkey`: CREATE UNIQUE INDEX clan_members_pkey ON public.clan_members USING btree (id)
- `clan_members_unique`: CREATE UNIQUE INDEX clan_members_unique ON public.clan_members USING btree (clan_id, user_id)
- `idx_clan_members_active_user`: CREATE UNIQUE INDEX idx_clan_members_active_user ON public.clan_members USING btree (user_id) WHERE (status = 'active'::text)
- `idx_clan_members_clan`: CREATE INDEX idx_clan_members_clan ON public.clan_members USING btree (clan_id)
- `idx_clan_members_status`: CREATE INDEX idx_clan_members_status ON public.clan_members USING btree (status)
- `idx_clan_members_user`: CREATE INDEX idx_clan_members_user ON public.clan_members USING btree (user_id)

### `clan_objectives`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id` | `uuid` | No | — |
| `objective_type` | `text` | No | — |
| `target_value` | `integer` | No | — |
| `progress_value` | `integer` | No | `0` |
| `start_at` | `timestamp` | No | — |
| `end_at` | `timestamp` | No | — |
| `reward` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `clan_objectives_clan_id_fkey`: (`clan_id`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `clan_objectives_pkey`: CREATE UNIQUE INDEX clan_objectives_pkey ON public.clan_objectives USING btree (id)
- `idx_clan_objectives_clan`: CREATE INDEX idx_clan_objectives_clan ON public.clan_objectives USING btree (clan_id)
- `idx_clan_objectives_window`: CREATE INDEX idx_clan_objectives_window ON public.clan_objectives USING btree (clan_id, end_at DESC)

### `clan_roles`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id` | `uuid` | No | — |
| `name` | `varchar(40)` | No | — |
| `permissions` | `jsonb` | No | `'{}'` |
| `hierarchy_rank` | `integer` | No | — |
| `display_order` | `integer` | No | `0` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `clan_roles_hierarchy_unique`: `clan_id`, `clan_id`, `hierarchy_rank`, `hierarchy_rank`

**Foreign keys:**
- `clan_roles_clan_id_fkey`: (`clan_id`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `clan_roles_hierarchy_unique`: CREATE UNIQUE INDEX clan_roles_hierarchy_unique ON public.clan_roles USING btree (clan_id, hierarchy_rank)
- `clan_roles_pkey`: CREATE UNIQUE INDEX clan_roles_pkey ON public.clan_roles USING btree (id)
- `idx_clan_roles_clan`: CREATE INDEX idx_clan_roles_clan ON public.clan_roles USING btree (clan_id)
- `idx_clan_roles_name_unique`: CREATE UNIQUE INDEX idx_clan_roles_name_unique ON public.clan_roles USING btree (clan_id, lower((name)::text))

### `clan_war_matches`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_war_id` | `uuid` | No | — |
| `game_id` | `uuid` | Yes | — |
| `map_id` | `uuid` | Yes | — |
| `participants` | `jsonb` | No | `'[]'` |
| `result` | `text` | No | — |
| `points_awarded` | `integer` | No | `0` |
| `replay_url` | `text` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `clan_war_matches_clan_war_id_fkey`: (`clan_war_id`) → `clan_wars` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `clan_war_matches_game_id_fkey`: (`game_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `clan_war_matches_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- `clan_war_matches_result_check`: CHECK (result = ANY (ARRAY['win'::text, 'loss'::text, 'draw'::text]))

**Indexes:**
- `clan_war_matches_pkey`: CREATE UNIQUE INDEX clan_war_matches_pkey ON public.clan_war_matches USING btree (id)
- `idx_clan_war_matches_result`: CREATE INDEX idx_clan_war_matches_result ON public.clan_war_matches USING btree (result)
- `idx_clan_war_matches_war`: CREATE INDEX idx_clan_war_matches_war ON public.clan_war_matches USING btree (clan_war_id)

### `clan_wars`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `clan_id_a` | `uuid` | No | — |
| `clan_id_b` | `uuid` | No | — |
| `season_id` | `uuid` | Yes | — |
| `status` | `text` | No | `'scheduled'` |
| `scheduled_start` | `timestamp` | Yes | — |
| `scheduled_end` | `timestamp` | Yes | — |
| `ruleset` | `jsonb` | No | `'{}'` |
| `score_json` | `jsonb` | No | `'{}'` |
| `rewards` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `clan_wars_clan_id_a_fkey`: (`clan_id_a`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `clan_wars_clan_id_b_fkey`: (`clan_id_b`) → `clans` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `clan_wars_status_check`: CHECK (status = ANY (ARRAY['scheduled'::text, 'active'::text, 'completed'::text, 'cancelled'::text]))

**Indexes:**
- `clan_wars_pkey`: CREATE UNIQUE INDEX clan_wars_pkey ON public.clan_wars USING btree (id)
- `idx_clan_wars_clan_a`: CREATE INDEX idx_clan_wars_clan_a ON public.clan_wars USING btree (clan_id_a)
- `idx_clan_wars_clan_b`: CREATE INDEX idx_clan_wars_clan_b ON public.clan_wars USING btree (clan_id_b)
- `idx_clan_wars_status`: CREATE INDEX idx_clan_wars_status ON public.clan_wars USING btree (status)

### `clans`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `owner_user_id` | `uuid` | No | — |
| `name` | `varchar(64)` | No | — |
| `tag` | `citext` | No | — |
| `slug` | `text` | No | — |
| `motto` | `varchar(120)` | Yes | — |
| `description` | `text` | Yes | — |
| `crest_asset_url` | `text` | Yes | — |
| `banner_asset_url` | `text` | Yes | — |
| `recruitment_policy` | `text` | No | `'application'` |
| `recruitment_status` | `text` | No | `'active'` |
| `minimum_rank` | `integer` | Yes | — |
| `auto_accept_thresholds` | `jsonb` | No | `'{}'` |
| `language` | `varchar(16)` | Yes | — |
| `region` | `varchar(32)` | Yes | — |
| `time_zone` | `varchar(64)` | Yes | — |
| `privacy` | `text` | No | `'public'` |
| `total_xp` | `bigint` | No | `0` |
| `level` | `integer` | No | `1` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `deleted_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- `clans_slug_unique`: `slug`
- `clans_tag_unique`: `tag`

**Foreign keys:**
- `clans_owner_user_id_fkey`: (`owner_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE RESTRICT

**Check constraints:**
- `clans_privacy_check`: CHECK (privacy = ANY (ARRAY['public'::text, 'hidden'::text]))
- `clans_recruitment_policy_check`: CHECK (recruitment_policy = ANY (ARRAY['open'::text, 'application'::text, 'invite'::text]))
- `clans_recruitment_status_check`: CHECK (recruitment_status = ANY (ARRAY['active'::text, 'closed'::text]))

**Indexes:**
- `clans_pkey`: CREATE UNIQUE INDEX clans_pkey ON public.clans USING btree (id)
- `clans_slug_unique`: CREATE UNIQUE INDEX clans_slug_unique ON public.clans USING btree (slug)
- `clans_tag_unique`: CREATE UNIQUE INDEX clans_tag_unique ON public.clans USING btree (tag)
- `idx_clans_created_at`: CREATE INDEX idx_clans_created_at ON public.clans USING btree (created_at DESC)
- `idx_clans_description_trgm`: CREATE INDEX idx_clans_description_trgm ON public.clans USING gin (description gin_trgm_ops)
- `idx_clans_name_trgm`: CREATE INDEX idx_clans_name_trgm ON public.clans USING gin (name gin_trgm_ops)
- `idx_clans_owner`: CREATE INDEX idx_clans_owner ON public.clans USING btree (owner_user_id)
- `idx_clans_privacy`: CREATE INDEX idx_clans_privacy ON public.clans USING btree (privacy)
- `idx_clans_region`: CREATE INDEX idx_clans_region ON public.clans USING btree (region)
- `idx_clans_status`: CREATE INDEX idx_clans_status ON public.clans USING btree (recruitment_status)
- `idx_clans_tag_trgm`: CREATE INDEX idx_clans_tag_trgm ON public.clans USING gin (((tag)::text) gin_trgm_ops)

### `content_approval_queue`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `content_type` | `varchar(50)` | No | — |
| `content_id` | `uuid` | No | — |
| `submitter_id` | `uuid` | No | — |
| `status` | `varchar(32)` | No | `'pending'` |
| `priority` | `integer` | No | `0` |
| `admin_user_id` | `uuid` | Yes | — |
| `admin_notes` | `text` | Yes | — |
| `submitted_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `reviewed_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `content_approval_queue_admin_user_id_fkey`: (`admin_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `content_approval_queue_submitter_id_fkey`: (`submitter_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `content_approval_queue_pkey`: CREATE UNIQUE INDEX content_approval_queue_pkey ON public.content_approval_queue USING btree (id)
- `idx_content_approval_queue_content`: CREATE INDEX idx_content_approval_queue_content ON public.content_approval_queue USING btree (content_type, content_id)
- `idx_content_approval_queue_status`: CREATE INDEX idx_content_approval_queue_status ON public.content_approval_queue USING btree (status)

### `conversation_members`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `conversation_id` | `uuid` | No | — |
| `user_id` | `uuid` | No | — |
| `role` | `conversation_member_role` | No | `'member'` |
| `joined_at` | `timestamptz` | No | `now()` |
| `last_read_message_id` | `char(26)` | Yes | — |
| `last_read_at` | `timestamptz` | Yes | — |
| `is_muted` | `boolean` | No | `false` |
| `is_pinned` | `boolean` | No | `false` |
| `shadow_muted` | `boolean` | No | `false` |
| `updated_at` | `timestamptz` | No | `now()` |

**Primary key:** `id`

**Unique constraints:**
- `conversation_members_conversation_id_user_id_key`: `conversation_id`, `conversation_id`, `user_id`, `user_id`

**Foreign keys:**
- `conversation_members_conversation_id_fkey`: (`conversation_id`) → `conversations` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `conversation_members_last_read_fk`: (`last_read_message_id`) → `conversation_messages` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `conversation_members_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `conversation_members_conversation_id_user_id_key`: CREATE UNIQUE INDEX conversation_members_conversation_id_user_id_key ON public.conversation_members USING btree (conversation_id, user_id)
- `conversation_members_pkey`: CREATE UNIQUE INDEX conversation_members_pkey ON public.conversation_members USING btree (id)
- `idx_conversation_members_conversation`: CREATE INDEX idx_conversation_members_conversation ON public.conversation_members USING btree (conversation_id)
- `idx_conversation_members_user_state`: CREATE INDEX idx_conversation_members_user_state ON public.conversation_members USING btree (user_id, is_pinned DESC, joined_at DESC)

### `conversation_messages`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `char(26)` | No | `generate_ulid()` |
| `conversation_id` | `uuid` | No | — |
| `sender_id` | `uuid` | Yes | — |
| `body` | `text` | No | — |
| `json_metadata` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamptz` | No | `now()` |
| `updated_at` | `timestamptz` | No | `now()` |
| `deleted_at` | `timestamptz` | Yes | — |
| `edited_at` | `timestamptz` | Yes | — |
| `shadow_muted` | `boolean` | No | `false` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `conversation_messages_conversation_id_fkey`: (`conversation_id`) → `conversations` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `conversation_messages_sender_id_fkey`: (`sender_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- —

**Indexes:**
- `conversation_messages_pkey`: CREATE UNIQUE INDEX conversation_messages_pkey ON public.conversation_messages USING btree (id)
- `idx_conversation_messages_conversation_created_at`: CREATE INDEX idx_conversation_messages_conversation_created_at ON public.conversation_messages USING btree (conversation_id, created_at DESC)
- `idx_conversation_messages_json_metadata`: CREATE INDEX idx_conversation_messages_json_metadata ON public.conversation_messages USING gin (json_metadata)
- `idx_conversation_messages_sender_created_at`: CREATE INDEX idx_conversation_messages_sender_created_at ON public.conversation_messages USING btree (sender_id, created_at DESC)

### `conversations`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `kind` | `conversation_kind` | No | — |
| `title` | `varchar(255)` | Yes | — |
| `created_by` | `uuid` | No | — |
| `created_at` | `timestamptz` | No | `now()` |
| `updated_at` | `timestamptz` | No | `now()` |
| `is_archived` | `boolean` | No | `false` |
| `is_read_only` | `boolean` | No | `false` |
| `game_id` | `uuid` | Yes | — |
| `metadata` | `jsonb` | No | `'{}'` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `conversations_created_by_fkey`: (`created_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE RESTRICT
- `conversations_game_id_fkey`: (`game_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- —

**Indexes:**
- `conversations_pkey`: CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id)
- `idx_conversations_game_id`: CREATE INDEX idx_conversations_game_id ON public.conversations USING btree (game_id)
- `idx_conversations_kind_created_at`: CREATE INDEX idx_conversations_kind_created_at ON public.conversations USING btree (kind, created_at DESC)

### `email_verification_logs`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `email` | `varchar(255)` | No | — |
| `token` | `varchar(255)` | No | — |
| `sent_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `verified_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `email_verification_logs_token_key`: `token`

**Foreign keys:**
- `email_verification_logs_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `email_verification_logs_pkey`: CREATE UNIQUE INDEX email_verification_logs_pkey ON public.email_verification_logs USING btree (id)
- `email_verification_logs_token_key`: CREATE UNIQUE INDEX email_verification_logs_token_key ON public.email_verification_logs USING btree (token)
- `idx_email_verification_logs_token`: CREATE INDEX idx_email_verification_logs_token ON public.email_verification_logs USING btree (token)
- `idx_email_verification_logs_user_id`: CREATE INDEX idx_email_verification_logs_user_id ON public.email_verification_logs USING btree (user_id)

### `events`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | Yes | — |
| `session_id` | `uuid` | Yes | — |
| `event_type` | `varchar(100)` | No | — |
| `event_data` | `jsonb` | No | `'{}'` |
| `ip_address` | `inet` | Yes | — |
| `user_agent` | `text` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `events_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- `events_type_check`: CHECK (event_type::text = ANY (ARRAY['user_login'::character varying, 'user_logout'::character varying, 'user_registration'::character varying, 'game_start'::character varying, 'game_end'::character varying, 'game_move'::character varying, 'page_view'::character varying, 'button_click'::character varying, 'feature_use'::character varying, 'error_occurred'::character varying, 'purchase_initiated'::character varying, 'purchase_completed'::character varying, 'achievement_unlocked'::character varying]::text[]))

**Indexes:**
- `events_pkey`: CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id)
- `idx_events_created_at`: CREATE INDEX idx_events_created_at ON public.events USING btree (created_at DESC)
- `idx_events_event_data_gin`: CREATE INDEX idx_events_event_data_gin ON public.events USING gin (event_data)
- `idx_events_event_type`: CREATE INDEX idx_events_event_type ON public.events USING btree (event_type)
- `idx_events_session_id`: CREATE INDEX idx_events_session_id ON public.events USING btree (session_id)
- `idx_events_user_id`: CREATE INDEX idx_events_user_id ON public.events USING btree (user_id)

### `feature_flag_audit`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `flag_name` | `varchar(100)` | No | — |
| `changed_by` | `uuid` | Yes | — |
| `change_type` | `varchar(20)` | No | — |
| `old_value` | `jsonb` | Yes | — |
| `new_value` | `jsonb` | Yes | — |
| `reason` | `text` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `feature_flag_audit_changed_by_fkey`: (`changed_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION

**Check constraints:**
- `feature_flag_audit_change_type_check`: CHECK (change_type::text = ANY (ARRAY['created'::character varying, 'updated'::character varying, 'deleted'::character varying, 'toggled'::character varying]::text[]))

**Indexes:**
- `feature_flag_audit_pkey`: CREATE UNIQUE INDEX feature_flag_audit_pkey ON public.feature_flag_audit USING btree (id)
- `idx_feature_flag_audit_changed_by`: CREATE INDEX idx_feature_flag_audit_changed_by ON public.feature_flag_audit USING btree (changed_by)
- `idx_feature_flag_audit_created_at`: CREATE INDEX idx_feature_flag_audit_created_at ON public.feature_flag_audit USING btree (created_at DESC)
- `idx_feature_flag_audit_flag_name`: CREATE INDEX idx_feature_flag_audit_flag_name ON public.feature_flag_audit USING btree (flag_name)

### `feature_flags`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `flag_name` | `varchar(100)` | No | — |
| `description` | `text` | Yes | — |
| `is_enabled` | `boolean` | No | `false` |
| `rollout_percentage` | `integer` | No | `0` |
| `target_criteria` | `jsonb` | No | `'{}'` |
| `created_by` | `uuid` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `access_level` | `varchar(20)` | Yes | `'disabled'` |
| `category` | `varchar(50)` | Yes | — |
| `dependencies` | `jsonb` | Yes | `'[]'` |
| `metrics` | `jsonb` | Yes | `'{}'` |

**Primary key:** `id`

**Unique constraints:**
- `feature_flags_flag_name_key`: `flag_name`

**Foreign keys:**
- `feature_flags_created_by_fkey`: (`created_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION

**Check constraints:**
- `feature_flags_access_level_check`: CHECK (access_level::text = ANY (ARRAY['disabled'::character varying, 'internal'::character varying, 'beta'::character varying, 'public'::character varying]::text[]))
- `feature_flags_rollout_percentage`: CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100)

**Indexes:**
- `feature_flags_flag_name_key`: CREATE UNIQUE INDEX feature_flags_flag_name_key ON public.feature_flags USING btree (flag_name)
- `feature_flags_pkey`: CREATE UNIQUE INDEX feature_flags_pkey ON public.feature_flags USING btree (id)
- `idx_feature_flags_access_level`: CREATE INDEX idx_feature_flags_access_level ON public.feature_flags USING btree (access_level)
- `idx_feature_flags_category`: CREATE INDEX idx_feature_flags_category ON public.feature_flags USING btree (category)
- `idx_feature_flags_flag_name`: CREATE INDEX idx_feature_flags_flag_name ON public.feature_flags USING btree (flag_name)
- `idx_feature_flags_is_enabled`: CREATE INDEX idx_feature_flags_is_enabled ON public.feature_flags USING btree (is_enabled)
- `idx_feature_flags_target_criteria_gin`: CREATE INDEX idx_feature_flags_target_criteria_gin ON public.feature_flags USING gin (target_criteria)

### `friendships`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `friend_id` | `uuid` | No | — |
| `status` | `varchar(20)` | No | `'pending'` |
| `requested_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `accepted_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- `friendships_user_id_friend_id_key`: `user_id`, `user_id`, `friend_id`, `friend_id`

**Foreign keys:**
- `friendships_friend_id_fkey`: (`friend_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `friendships_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `friendships_no_self`: CHECK (user_id <> friend_id)
- `friendships_status_check`: CHECK (status::text = ANY (ARRAY['pending'::character varying, 'accepted'::character varying, 'blocked'::character varying]::text[]))

**Indexes:**
- `friendships_pkey`: CREATE UNIQUE INDEX friendships_pkey ON public.friendships USING btree (id)
- `friendships_user_id_friend_id_key`: CREATE UNIQUE INDEX friendships_user_id_friend_id_key ON public.friendships USING btree (user_id, friend_id)
- `idx_friendships_friend_id`: CREATE INDEX idx_friendships_friend_id ON public.friendships USING btree (friend_id)
- `idx_friendships_status`: CREATE INDEX idx_friendships_status ON public.friendships USING btree (status)
- `idx_friendships_user_id`: CREATE INDEX idx_friendships_user_id ON public.friendships USING btree (user_id)

### `game_moves`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `room_id` | `uuid` | No | — |
| `player_id` | `uuid` | No | — |
| `turn_number` | `integer` | No | — |
| `move_type` | `varchar(20)` | No | — |
| `move_data` | `jsonb` | No | — |
| `is_valid` | `boolean` | No | `true` |
| `validation_error` | `text` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `game_moves_player_id_fkey`: (`player_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `game_moves_room_id_fkey`: (`room_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `game_moves_turn_positive`: CHECK (turn_number > 0)
- `game_moves_type_check`: CHECK (move_type::text = ANY (ARRAY['deploy'::character varying, 'attack'::character varying, 'fortify'::character varying, 'end_turn'::character varying, 'surrender'::character varying]::text[]))

**Indexes:**
- `game_moves_pkey`: CREATE UNIQUE INDEX game_moves_pkey ON public.game_moves USING btree (id)
- `idx_game_moves_move_data_gin`: CREATE INDEX idx_game_moves_move_data_gin ON public.game_moves USING gin (move_data)
- `idx_game_moves_player_id`: CREATE INDEX idx_game_moves_player_id ON public.game_moves USING btree (player_id)
- `idx_game_moves_room_id`: CREATE INDEX idx_game_moves_room_id ON public.game_moves USING btree (room_id)
- `idx_game_moves_turn`: CREATE INDEX idx_game_moves_turn ON public.game_moves USING btree (room_id, turn_number)

### `game_results`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `room_id` | `uuid` | No | — |
| `map_id` | `uuid` | Yes | — |
| `winner_id` | `uuid` | Yes | — |
| `duration_seconds` | `integer` | Yes | — |
| `total_turns` | `integer` | No | — |
| `final_state` | `jsonb` | No | — |
| `player_summary` | `jsonb` | No | — |
| `battle_log` | `jsonb` | No | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `room_id`

**Unique constraints:**
- —

**Foreign keys:**
- `game_results_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `game_results_room_id_fkey`: (`room_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `game_results_winner_id_fkey`: (`winner_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION

**Check constraints:**
- —

**Indexes:**
- `game_results_pkey`: CREATE UNIQUE INDEX game_results_pkey ON public.game_results USING btree (room_id)

### `game_rooms`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `name` | `varchar(100)` | No | — |
| `host_id` | `uuid` | No | — |
| `map_id` | `uuid` | No | — |
| `max_players` | `integer` | No | `6` |
| `is_private` | `boolean` | No | `false` |
| `password_hash` | `varchar(255)` | Yes | — |
| `status` | `varchar(20)` | No | `'lobby'` |
| `game_mode` | `varchar(20)` | No | `'classic'` |
| `turn_timer` | `integer` | No | `60` |
| `time_bank_seconds` | `integer` | No | `0` |
| `grace_window_seconds` | `integer` | No | `20` |
| `grace_actor_user_id` | `uuid` | Yes | — |
| `grace_expires_at` | `timestamp` | Yes | — |
| `team_mode` | `boolean` | No | `false` |
| `number_of_teams` | `integer` | Yes | — |
| `variant_id` | `uuid` | Yes | — |
| `season_id` | `uuid` | Yes | — |
| `is_ranked` | `boolean` | No | `true` |
| `started_at` | `timestamp` | Yes | — |
| `ended_at` | `timestamp` | Yes | — |
| `winner_id` | `uuid` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `turn_number` | `integer` | No | `0` |
| `current_turn_user_id` | `uuid` | Yes | — |
| `turn_expires_at` | `timestamptz` | Yes | — |
| `ready_check_started_at` | `timestamptz` | Yes | — |
| `treasure_config` | `jsonb` | Yes | — |
| `movement_type` | `text` | Yes | — |
| `fog_of_war` | `text` | Yes | — |
| `replacement_pending_user_id` | `uuid` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `game_rooms_current_turn_user_id_fkey`: (`current_turn_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `game_rooms_host_id_fkey`: (`host_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `game_rooms_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `game_rooms_season_id_fkey`: (`season_id`) → `seasons` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `game_rooms_variant_id_fkey`: (`variant_id`) → `game_variants` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `game_rooms_winner_id_fkey`: (`winner_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION

**Check constraints:**
- `game_rooms_max_players_check`: CHECK (max_players >= 2 AND max_players <= 12)
- `game_rooms_mode_check`: CHECK (game_mode::text = ANY (ARRAY['classic'::character varying, 'capital'::character varying, 'team'::character varying]::text[]))
- `game_rooms_status_check`: CHECK (status::text = ANY (ARRAY['lobby'::character varying, 'initializing'::character varying, 'active'::character varying, 'completed'::character varying, 'paused'::character varying, 'abandoned'::character varying]::text[]))
- `game_rooms_team_check`: CHECK (team_mode = false AND number_of_teams IS NULL OR team_mode = true AND number_of_teams >= 2 AND number_of_teams <= 6)
- `game_rooms_turn_timer_check`: CHECK (turn_timer >= 10 AND turn_timer <= 300)

**Indexes:**
- `game_rooms_pkey`: CREATE UNIQUE INDEX game_rooms_pkey ON public.game_rooms USING btree (id)
- `idx_game_rooms_created_at`: CREATE INDEX idx_game_rooms_created_at ON public.game_rooms USING btree (created_at DESC)
- `idx_game_rooms_host_id`: CREATE INDEX idx_game_rooms_host_id ON public.game_rooms USING btree (host_id)
- `idx_game_rooms_map_id`: CREATE INDEX idx_game_rooms_map_id ON public.game_rooms USING btree (map_id)
- `idx_game_rooms_started_at`: CREATE INDEX idx_game_rooms_started_at ON public.game_rooms USING btree (started_at DESC)
- `idx_game_rooms_status`: CREATE INDEX idx_game_rooms_status ON public.game_rooms USING btree (status)

### `game_states`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `room_id` | `uuid` | No | — |
| `current_player_id` | `uuid` | Yes | — |
| `game_phase` | `varchar(20)` | No | — |
| `turn_number` | `integer` | No | `1` |
| `round_number` | `integer` | No | `1` |
| `territories` | `jsonb` | No | `'{}'` |
| `player_stats` | `jsonb` | No | `'{}'` |
| `game_log` | `jsonb` | No | `'[]'` |
| `turn_stats` | `jsonb` | No | `'[]'` |
| `replay_data` | `jsonb` | No | `'{}'` |
| `ai_players` | `jsonb` | No | `'[]'` |
| `last_activity` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `winner_id` | `uuid` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- `game_states_room_id_key`: `room_id`

**Foreign keys:**
- `game_states_current_player_id_fkey`: (`current_player_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `game_states_room_id_fkey`: (`room_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `game_states_winner_id_fkey`: (`winner_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION

**Check constraints:**
- `game_states_phase_check`: CHECK (game_phase::text = ANY (ARRAY['deployment'::character varying, 'attack'::character varying, 'fortify'::character varying, 'finished'::character varying]::text[]))
- `game_states_turn_positive`: CHECK (turn_number > 0 AND round_number > 0)

**Indexes:**
- `game_states_pkey`: CREATE UNIQUE INDEX game_states_pkey ON public.game_states USING btree (id)
- `game_states_room_id_key`: CREATE UNIQUE INDEX game_states_room_id_key ON public.game_states USING btree (room_id)
- `idx_game_states_ai_players_gin`: CREATE INDEX idx_game_states_ai_players_gin ON public.game_states USING gin (ai_players)
- `idx_game_states_current_player`: CREATE INDEX idx_game_states_current_player ON public.game_states USING btree (current_player_id)
- `idx_game_states_game_log_gin`: CREATE INDEX idx_game_states_game_log_gin ON public.game_states USING gin (game_log)
- `idx_game_states_phase`: CREATE INDEX idx_game_states_phase ON public.game_states USING btree (game_phase)
- `idx_game_states_player_stats_gin`: CREATE INDEX idx_game_states_player_stats_gin ON public.game_states USING gin (player_stats)
- `idx_game_states_replay_data_gin`: CREATE INDEX idx_game_states_replay_data_gin ON public.game_states USING gin (replay_data)
- `idx_game_states_room_id`: CREATE INDEX idx_game_states_room_id ON public.game_states USING btree (room_id)
- `idx_game_states_territories_gin`: CREATE INDEX idx_game_states_territories_gin ON public.game_states USING gin (territories)

### `game_territory_modifiers`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `room_id` | `uuid` | No | — |
| `territory_name` | `varchar(100)` | No | — |
| `template_id` | `uuid` | No | — |
| `applied_by` | `uuid` | Yes | — |
| `applied_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `expires_at` | `timestamp` | Yes | — |
| `is_active` | `boolean` | No | `true` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `game_territory_modifiers_applied_by_fkey`: (`applied_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `game_territory_modifiers_room_id_fkey`: (`room_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `game_territory_modifiers_template_id_fkey`: (`template_id`) → `territory_modifier_templates` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION

**Check constraints:**
- —

**Indexes:**
- `game_territory_modifiers_pkey`: CREATE UNIQUE INDEX game_territory_modifiers_pkey ON public.game_territory_modifiers USING btree (id)

### `game_variants`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `name` | `varchar(100)` | No | — |
| `description` | `text` | Yes | — |
| `created_by` | `uuid` | Yes | — |
| `ruleset` | `jsonb` | No | — |
| `is_official` | `boolean` | No | `false` |
| `is_active` | `boolean` | No | `true` |
| `play_count` | `integer` | No | `0` |
| `rating` | `numeric(3, 2)` | Yes | `0.0` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `game_variants_name_key`: `name`

**Foreign keys:**
- `game_variants_created_by_fkey`: (`created_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- `game_variants_play_count_non_negative`: CHECK (play_count >= 0)
- `game_variants_rating_range`: CHECK (rating >= 0.0 AND rating <= 5.0)

**Indexes:**
- `game_variants_name_key`: CREATE UNIQUE INDEX game_variants_name_key ON public.game_variants USING btree (name)
- `game_variants_pkey`: CREATE UNIQUE INDEX game_variants_pkey ON public.game_variants USING btree (id)
- `idx_game_variants_created_by`: CREATE INDEX idx_game_variants_created_by ON public.game_variants USING btree (created_by)
- `idx_game_variants_is_active`: CREATE INDEX idx_game_variants_is_active ON public.game_variants USING btree (is_active)
- `idx_game_variants_is_official`: CREATE INDEX idx_game_variants_is_official ON public.game_variants USING btree (is_official)
- `idx_game_variants_name_trgm`: CREATE INDEX idx_game_variants_name_trgm ON public.game_variants USING gin (name gin_trgm_ops)
- `idx_game_variants_play_count`: CREATE INDEX idx_game_variants_play_count ON public.game_variants USING btree (play_count DESC)
- `idx_game_variants_rating`: CREATE INDEX idx_game_variants_rating ON public.game_variants USING btree (rating DESC)
- `idx_game_variants_ruleset_gin`: CREATE INDEX idx_game_variants_ruleset_gin ON public.game_variants USING gin (ruleset)

### `map_asset_purge_runs`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `run_type` | `varchar(50)` | No | `'staging'` |
| `processed_count` | `integer` | No | `0` |
| `purged_count` | `integer` | No | `0` |
| `failed_count` | `integer` | No | `0` |
| `bytes_purged` | `bigint` | No | `0` |
| `started_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `completed_at` | `timestamp` | Yes | — |
| `duration_ms` | `integer` | Yes | — |
| `metadata` | `jsonb` | No | `'{}'` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- —

**Check constraints:**
- —

**Indexes:**
- `idx_map_asset_purge_runs_type`: CREATE INDEX idx_map_asset_purge_runs_type ON public.map_asset_purge_runs USING btree (run_type, started_at DESC)
- `map_asset_purge_runs_pkey`: CREATE UNIQUE INDEX map_asset_purge_runs_pkey ON public.map_asset_purge_runs USING btree (id)

### `map_collaborators`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `map_id` | `uuid` | No | — |
| `user_id` | `uuid` | No | — |
| `role` | `varchar(32)` | No | `'editor'` |
| `assigned_by` | `uuid` | Yes | — |
| `assigned_at` | `timestamptz` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `map_id`, `map_id`, `user_id`, `user_id`

**Unique constraints:**
- —

**Foreign keys:**
- `map_collaborators_assigned_by_fkey`: (`assigned_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `map_collaborators_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `map_collaborators_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `map_collaborators_role_check`: CHECK (role::text = ANY (ARRAY['editor'::character varying, 'viewer'::character varying, 'owner'::character varying, 'reviewer'::character varying]::text[]))

**Indexes:**
- `idx_map_collaborators_map_role`: CREATE INDEX idx_map_collaborators_map_role ON public.map_collaborators USING btree (map_id, role)
- `idx_map_collaborators_user`: CREATE INDEX idx_map_collaborators_user ON public.map_collaborators USING btree (user_id)
- `map_collaborators_pkey`: CREATE UNIQUE INDEX map_collaborators_pkey ON public.map_collaborators USING btree (map_id, user_id)

### `map_continents`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `name` | `varchar(100)` | No | — |
| `bonus_troops` | `integer` | No | `0` |
| `color` | `varchar(7)` | Yes | — |
| `requirements` | `jsonb` | No | `'{}'` |

**Primary key:** `id`

**Unique constraints:**
- `map_continents_map_id_name_key`: `map_id`, `map_id`, `name`, `name`

**Foreign keys:**
- `map_continents_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `map_continents_bonus_non_negative`: CHECK (bonus_troops >= 0)

**Indexes:**
- `idx_map_continents_map_id`: CREATE INDEX idx_map_continents_map_id ON public.map_continents USING btree (map_id)
- `idx_map_continents_requirements_gin`: CREATE INDEX idx_map_continents_requirements_gin ON public.map_continents USING gin (requirements)
- `map_continents_map_id_name_key`: CREATE UNIQUE INDEX map_continents_map_id_name_key ON public.map_continents USING btree (map_id, name)
- `map_continents_pkey`: CREATE UNIQUE INDEX map_continents_pkey ON public.map_continents USING btree (id)

### `map_drafts`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `staging_image_id` | `uuid` | Yes | — |
| `parent_map_id` | `uuid` | Yes | — |
| `name` | `varchar(150)` | No | `'Untitled Map'` |
| `description` | `text` | Yes | — |
| `map_data` | `jsonb` | No | `'{}'` |
| `territories` | `jsonb` | No | `'[]'` |
| `continents` | `jsonb` | No | `'[]'` |
| `adjacencies` | `jsonb` | No | `'[]'` |
| `capital_assignments` | `jsonb` | No | `'{}'` |
| `thumbnail_url` | `varchar(500)` | Yes | — |
| `image_url` | `varchar(500)` | Yes | — |
| `image_width` | `integer` | Yes | — |
| `image_height` | `integer` | Yes | — |
| `tags` | `jsonb` | No | `'[]'` |
| `is_public` | `boolean` | No | `false` |
| `draft_status` | `varchar(32)` | No | `'editing'` |
| `validation_status` | `varchar(32)` | Yes | — |
| `validation_errors` | `jsonb` | No | `'[]'` |
| `auto_saved_at` | `timestamp` | Yes | — |
| `last_edited_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `map_drafts_parent_map_id_fkey`: (`parent_map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `map_drafts_staging_image_id_fkey`: (`staging_image_id`) → `map_images_staging` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `map_drafts_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_map_drafts_user_id`: CREATE INDEX idx_map_drafts_user_id ON public.map_drafts USING btree (user_id, draft_status)
- `map_drafts_pkey`: CREATE UNIQUE INDEX map_drafts_pkey ON public.map_drafts USING btree (id)

### `map_images_staging`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `filename` | `varchar(255)` | No | — |
| `original_filename` | `varchar(255)` | Yes | — |
| `file_url` | `varchar(500)` | No | — |
| `file_size` | `integer` | No | — |
| `width` | `integer` | Yes | — |
| `height` | `integer` | Yes | — |
| `mime_type` | `varchar(100)` | Yes | — |
| `upload_status` | `varchar(32)` | No | `'processing'` |
| `processing_error` | `text` | Yes | — |
| `is_deleted` | `boolean` | No | `false` |
| `deleted_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `deletion_attempts` | `integer` | No | `0` |
| `last_deletion_attempt` | `timestamp` | Yes | — |
| `last_deletion_error` | `text` | Yes | — |
| `purged_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `map_images_staging_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_map_images_staging_user_id`: CREATE INDEX idx_map_images_staging_user_id ON public.map_images_staging USING btree (user_id) WHERE (is_deleted = false)
- `map_images_staging_pkey`: CREATE UNIQUE INDEX map_images_staging_pkey ON public.map_images_staging USING btree (id)

### `map_ratings`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `user_id` | `uuid` | No | — |
| `rating` | `integer` | No | — |
| `review` | `text` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `map_ratings_map_id_user_id_key`: `map_id`, `map_id`, `user_id`, `user_id`

**Foreign keys:**
- `map_ratings_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `map_ratings_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `map_ratings_rating_range`: CHECK (rating >= 1 AND rating <= 5)

**Indexes:**
- `idx_map_ratings_map_id`: CREATE INDEX idx_map_ratings_map_id ON public.map_ratings USING btree (map_id)
- `map_ratings_map_id_user_id_key`: CREATE UNIQUE INDEX map_ratings_map_id_user_id_key ON public.map_ratings USING btree (map_id, user_id)
- `map_ratings_pkey`: CREATE UNIQUE INDEX map_ratings_pkey ON public.map_ratings USING btree (id)

### `map_review_queue`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `submitted_by` | `uuid` | No | — |
| `status` | `varchar(32)` | No | `'pending'` |
| `priority` | `integer` | No | `0` |
| `assigned_to` | `uuid` | Yes | — |
| `submitted_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `reviewed_at` | `timestamp` | Yes | — |
| `notes` | `text` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `map_review_queue_assigned_to_fkey`: (`assigned_to`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `map_review_queue_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `map_review_queue_submitted_by_fkey`: (`submitted_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_map_review_queue_map_id`: CREATE UNIQUE INDEX idx_map_review_queue_map_id ON public.map_review_queue USING btree (map_id)
- `idx_map_review_queue_status`: CREATE INDEX idx_map_review_queue_status ON public.map_review_queue USING btree (status)
- `map_review_queue_pkey`: CREATE UNIQUE INDEX map_review_queue_pkey ON public.map_review_queue USING btree (id)

### `map_reviews`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `reviewer_id` | `uuid` | No | — |
| `status` | `varchar(32)` | No | `'pending'` |
| `notes` | `text` | Yes | — |
| `rating` | `integer` | Yes | — |
| `review` | `text` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `reviewed_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `map_reviews_map_id_reviewer_id_key`: `map_id`, `map_id`, `reviewer_id`, `reviewer_id`

**Foreign keys:**
- `map_reviews_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `map_reviews_reviewer_id_fkey`: (`reviewer_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `map_reviews_rating_check`: CHECK (rating >= 1 AND rating <= 5)
- `map_reviews_status_check`: CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'needs_changes'::character varying]::text[]))

**Indexes:**
- `idx_map_reviews_map_id`: CREATE INDEX idx_map_reviews_map_id ON public.map_reviews USING btree (map_id)
- `idx_map_reviews_reviewer_id`: CREATE INDEX idx_map_reviews_reviewer_id ON public.map_reviews USING btree (reviewer_id)
- `map_reviews_map_id_reviewer_id_key`: CREATE UNIQUE INDEX map_reviews_map_id_reviewer_id_key ON public.map_reviews USING btree (map_id, reviewer_id)
- `map_reviews_pkey`: CREATE UNIQUE INDEX map_reviews_pkey ON public.map_reviews USING btree (id)

### `map_submission_logs`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `action` | `varchar(64)` | No | — |
| `performed_by` | `uuid` | Yes | — |
| `details` | `jsonb` | Yes | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `map_submission_logs_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `map_submission_logs_performed_by_fkey`: (`performed_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- —

**Indexes:**
- `idx_map_submission_logs_map_id`: CREATE INDEX idx_map_submission_logs_map_id ON public.map_submission_logs USING btree (map_id)
- `map_submission_logs_pkey`: CREATE UNIQUE INDEX map_submission_logs_pkey ON public.map_submission_logs USING btree (id)

### `map_submissions`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | Yes | — |
| `submission_type` | `varchar(20)` | No | — |
| `submission_data` | `jsonb` | No | `'{}'` |
| `admin_notes` | `text` | Yes | — |
| `reviewed_by` | `uuid` | Yes | — |
| `reviewed_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `user_id` | `uuid` | Yes | — |
| `review_status` | `varchar(32)` | Yes | `'pending'` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `map_submissions_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `map_submissions_reviewed_by_fkey`: (`reviewed_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `map_submissions_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `map_submissions_review_status_check`: CHECK (review_status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'needs_changes'::character varying]::text[]))
- `map_submissions_type_check`: CHECK (submission_type::text = ANY (ARRAY['new'::character varying, 'update'::character varying, 'fix'::character varying]::text[]))

**Indexes:**
- `idx_map_submissions_review_status`: CREATE INDEX idx_map_submissions_review_status ON public.map_submissions USING btree (review_status)
- `idx_map_submissions_reviewed_by`: CREATE INDEX idx_map_submissions_reviewed_by ON public.map_submissions USING btree (reviewed_by)
- `idx_map_submissions_submission_data_gin`: CREATE INDEX idx_map_submissions_submission_data_gin ON public.map_submissions USING gin (submission_data)
- `idx_map_submissions_user_id`: CREATE INDEX idx_map_submissions_user_id ON public.map_submissions USING btree (user_id)
- `map_submissions_pkey`: CREATE UNIQUE INDEX map_submissions_pkey ON public.map_submissions USING btree (id)

### `map_territories`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `name` | `varchar(100)` | No | — |
| `polygon_data` | `jsonb` | No | — |
| `continent` | `varchar(50)` | Yes | — |
| `is_capital` | `boolean` | No | `false` |
| `capital_for_players` | `jsonb` | No | `'[]'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `map_territories_map_id_name_key`: `map_id`, `map_id`, `name`, `name`

**Foreign keys:**
- `map_territories_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `map_territories_name_length`: CHECK (length(name::text) >= 1)

**Indexes:**
- `idx_map_territories_capital_for_players_gin`: CREATE INDEX idx_map_territories_capital_for_players_gin ON public.map_territories USING gin (capital_for_players)
- `idx_map_territories_map_id`: CREATE INDEX idx_map_territories_map_id ON public.map_territories USING btree (map_id)
- `idx_map_territories_polygon_data_gin`: CREATE INDEX idx_map_territories_polygon_data_gin ON public.map_territories USING gin (polygon_data)
- `map_territories_map_id_name_key`: CREATE UNIQUE INDEX map_territories_map_id_name_key ON public.map_territories USING btree (map_id, name)
- `map_territories_pkey`: CREATE UNIQUE INDEX map_territories_pkey ON public.map_territories USING btree (id)

### `map_territory_modifiers`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `territory_name` | `varchar(100)` | No | — |
| `template_id` | `uuid` | No | — |
| `is_active` | `boolean` | No | `true` |

**Primary key:** `id`

**Unique constraints:**
- `map_territory_modifiers_map_id_territory_name_template_id_key`: `map_id`, `map_id`, `map_id`, `territory_name`, `territory_name`, `territory_name`, `template_id`, `template_id`, `template_id`

**Foreign keys:**
- `map_territory_modifiers_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `map_territory_modifiers_template_id_fkey`: (`template_id`) → `territory_modifier_templates` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION

**Check constraints:**
- —

**Indexes:**
- `map_territory_modifiers_map_id_territory_name_template_id_key`: CREATE UNIQUE INDEX map_territory_modifiers_map_id_territory_name_template_id_key ON public.map_territory_modifiers USING btree (map_id, territory_name, template_id)
- `map_territory_modifiers_pkey`: CREATE UNIQUE INDEX map_territory_modifiers_pkey ON public.map_territory_modifiers USING btree (id)

### `map_versions`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `version_number` | `integer` | No | — |
| `data` | `jsonb` | No | `'{}'` |
| `territories` | `jsonb` | No | `'[]'` |
| `continents` | `jsonb` | No | `'[]'` |
| `adjacencies` | `jsonb` | No | `'[]'` |
| `change_summary` | `text` | Yes | — |
| `changed_by` | `uuid` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `map_versions_changed_by_fkey`: (`changed_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `map_versions_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_map_versions_map_id_version`: CREATE INDEX idx_map_versions_map_id_version ON public.map_versions USING btree (map_id, version_number DESC)
- `map_versions_pkey`: CREATE UNIQUE INDEX map_versions_pkey ON public.map_versions USING btree (id)

### `maps`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `name` | `varchar(100)` | No | — |
| `description` | `text` | Yes | — |
| `image_url` | `varchar(500)` | Yes | — |
| `min_players` | `integer` | No | `2` |
| `max_players` | `integer` | No | `8` |
| `is_active` | `boolean` | No | `true` |
| `creator_id` | `uuid` | Yes | — |
| `capital_assignments` | `jsonb` | No | `'{}'` |
| `capital_metadata` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `image_width` | `integer` | Yes | — |
| `image_height` | `integer` | Yes | — |
| `is_public` | `boolean` | Yes | `true` |
| `tags` | `text[]` | Yes | — |
| `capital_territories` | `jsonb` | Yes | `'[]'` |
| `metadata` | `jsonb` | Yes | `'{}'` |
| `status` | `varchar(20)` | Yes | `'draft'` |
| `is_vip_only` | `boolean` | Yes | `false` |
| `min_premium_tier` | `varchar(20)` | Yes | `NULL` |
| `is_featured` | `boolean` | Yes | `false` |
| `rating_average` | `numeric(3, 2)` | Yes | `NULL` |
| `rating_count` | `integer` | Yes | `0` |
| `play_count` | `integer` | Yes | `0` |
| `version` | `integer` | No | `1` |
| `parent_map_id` | `uuid` | Yes | — |
| `download_count` | `integer` | No | `0` |
| `submitted_at` | `timestamp` | Yes | — |
| `reviewed_at` | `timestamp` | Yes | — |
| `reviewed_by` | `uuid` | Yes | — |
| `review_notes` | `text` | Yes | — |
| `rejection_reason` | `text` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- `maps_name_key`: `name`

**Foreign keys:**
- `maps_created_by_fkey`: (`creator_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `maps_parent_map_id_fkey`: (`parent_map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
- `maps_reviewed_by_fkey`: (`reviewed_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- `maps_download_count_check`: CHECK (download_count >= 0)
- `maps_min_premium_tier_check`: CHECK (min_premium_tier::text = ANY (ARRAY[NULL::character varying, 'free'::character varying, 'premium'::character varying, 'pro'::character varying, 'enterprise'::character varying]::text[]))
- `maps_name_length`: CHECK (length(name::text) >= 3)
- `maps_play_count_check`: CHECK (play_count >= 0)
- `maps_player_count`: CHECK (min_players >= 2 AND max_players <= 12 AND min_players <= max_players)
- `maps_rating_average_check`: CHECK (rating_average >= 1::numeric AND rating_average <= 5::numeric)
- `maps_rating_count_check`: CHECK (rating_count >= 0)
- `maps_status_check`: CHECK (status::text = ANY (ARRAY['draft'::character varying, 'pending_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'archived'::character varying]::text[]))
- `maps_version_check`: CHECK (version >= 1)

**Indexes:**
- `idx_maps_capital_assignments_gin`: CREATE INDEX idx_maps_capital_assignments_gin ON public.maps USING gin (capital_assignments)
- `idx_maps_capital_metadata_gin`: CREATE INDEX idx_maps_capital_metadata_gin ON public.maps USING gin (capital_metadata)
- `idx_maps_created_at`: CREATE INDEX idx_maps_created_at ON public.maps USING btree (created_at)
- `idx_maps_created_by`: CREATE INDEX idx_maps_created_by ON public.maps USING btree (creator_id)
- `idx_maps_creator_id`: CREATE INDEX idx_maps_creator_id ON public.maps USING btree (creator_id)
- `idx_maps_is_active`: CREATE INDEX idx_maps_is_active ON public.maps USING btree (is_active)
- `idx_maps_is_featured`: CREATE INDEX idx_maps_is_featured ON public.maps USING btree (is_featured) WHERE (is_featured = true)
- `idx_maps_is_public`: CREATE INDEX idx_maps_is_public ON public.maps USING btree (is_public)
- `idx_maps_is_vip_only`: CREATE INDEX idx_maps_is_vip_only ON public.maps USING btree (is_vip_only) WHERE (is_vip_only = true)
- `idx_maps_name_trgm`: CREATE INDEX idx_maps_name_trgm ON public.maps USING gin (name gin_trgm_ops)
- `idx_maps_play_count`: CREATE INDEX idx_maps_play_count ON public.maps USING btree (play_count DESC)
- `idx_maps_rating_average`: CREATE INDEX idx_maps_rating_average ON public.maps USING btree (rating_average) WHERE (rating_average IS NOT NULL)
- `idx_maps_reviewed_at`: CREATE INDEX idx_maps_reviewed_at ON public.maps USING btree (reviewed_at)
- `idx_maps_status`: CREATE INDEX idx_maps_status ON public.maps USING btree (status)
- `idx_maps_submitted_at`: CREATE INDEX idx_maps_submitted_at ON public.maps USING btree (submitted_at)
- `maps_name_key`: CREATE UNIQUE INDEX maps_name_key ON public.maps USING btree (name)
- `maps_pkey`: CREATE UNIQUE INDEX maps_pkey ON public.maps USING btree (id)

### `matchmaking_queue`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `queue_type` | `varchar(50)` | No | — |
| `preferences` | `jsonb` | No | `'{}'` |
| `skill_rating` | `integer` | No | — |
| `joined_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `estimated_wait_time` | `integer` | Yes | — |
| `priority_score` | `integer` | No | `100` |
| `region` | `varchar(10)` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `matchmaking_queue_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `matchmaking_queue_priority_range`: CHECK (priority_score >= 1 AND priority_score <= 1000)
- `matchmaking_queue_type_check`: CHECK (queue_type::text = ANY (ARRAY['ranked'::character varying, 'casual'::character varying, 'tournament'::character varying, 'custom'::character varying]::text[]))

**Indexes:**
- `idx_matchmaking_queue_joined_at`: CREATE INDEX idx_matchmaking_queue_joined_at ON public.matchmaking_queue USING btree (joined_at)
- `idx_matchmaking_queue_preferences_gin`: CREATE INDEX idx_matchmaking_queue_preferences_gin ON public.matchmaking_queue USING gin (preferences)
- `idx_matchmaking_queue_priority_score`: CREATE INDEX idx_matchmaking_queue_priority_score ON public.matchmaking_queue USING btree (priority_score DESC)
- `idx_matchmaking_queue_queue_type`: CREATE INDEX idx_matchmaking_queue_queue_type ON public.matchmaking_queue USING btree (queue_type)
- `idx_matchmaking_queue_skill_rating`: CREATE INDEX idx_matchmaking_queue_skill_rating ON public.matchmaking_queue USING btree (skill_rating)
- `matchmaking_queue_pkey`: CREATE UNIQUE INDEX matchmaking_queue_pkey ON public.matchmaking_queue USING btree (id)

### `message_read_receipts`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `message_id` | `char(26)` | No | — |
| `user_id` | `uuid` | No | — |
| `read_at` | `timestamptz` | No | `now()` |

**Primary key:** `message_id`, `message_id`, `user_id`, `user_id`

**Unique constraints:**
- —

**Foreign keys:**
- `message_read_receipts_message_id_fkey`: (`message_id`) → `conversation_messages` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `message_read_receipts_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_message_read_receipts_user_read_at`: CREATE INDEX idx_message_read_receipts_user_read_at ON public.message_read_receipts USING btree (user_id, read_at DESC)
- `message_read_receipts_pkey`: CREATE UNIQUE INDEX message_read_receipts_pkey ON public.message_read_receipts USING btree (message_id, user_id)

### `notifications`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `type` | `varchar(50)` | No | — |
| `title` | `varchar(255)` | No | — |
| `message` | `text` | No | — |
| `data` | `jsonb` | No | `'{}'` |
| `read_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `notifications_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `notifications_type_check`: CHECK (type::text = ANY (ARRAY['friend_request'::character varying, 'game_invite'::character varying, 'game_started'::character varying, 'game_ended'::character varying, 'achievement'::character varying, 'system'::character varying, 'admin'::character varying, 'chat_message'::character varying, 'map_submission'::character varying, 'map_review'::character varying, 'map_approved'::character varying, 'map_rejected'::character varying]::text[]))

**Indexes:**
- `idx_notifications_created_at`: CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC)
- `idx_notifications_data_gin`: CREATE INDEX idx_notifications_data_gin ON public.notifications USING gin (data)
- `idx_notifications_user_id`: CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id)
- `notifications_pkey`: CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)

### `password_reset_tokens`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `token` | `varchar(255)` | No | — |
| `expires_at` | `timestamp` | No | — |
| `used_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `password_reset_tokens_token_key`: `token`

**Foreign keys:**
- `password_reset_tokens_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_password_reset_tokens_token`: CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token)
- `idx_password_reset_tokens_user_id`: CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id)
- `password_reset_tokens_pkey`: CREATE UNIQUE INDEX password_reset_tokens_pkey ON public.password_reset_tokens USING btree (id)
- `password_reset_tokens_token_key`: CREATE UNIQUE INDEX password_reset_tokens_token_key ON public.password_reset_tokens USING btree (token)

### `player_game_results`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `room_id` | `uuid` | No | — |
| `user_id` | `uuid` | No | — |
| `position` | `integer` | No | — |
| `is_winner` | `boolean` | No | — |
| `eliminated` | `boolean` | No | — |
| `territories` | `integer` | No | — |
| `armies` | `integer` | No | — |
| `elimination_order` | `integer` | Yes | — |
| `rating_before` | `integer` | Yes | — |
| `rating_after` | `integer` | Yes | — |
| `rating_change` | `integer` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `player_game_results_room_id_user_id_key`: `room_id`, `room_id`, `user_id`, `user_id`

**Foreign keys:**
- `player_game_results_room_id_fkey`: (`room_id`) → `game_results` (`room_id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `player_game_results_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_player_game_results_room_position`: CREATE INDEX idx_player_game_results_room_position ON public.player_game_results USING btree (room_id, "position")
- `idx_player_game_results_user`: CREATE INDEX idx_player_game_results_user ON public.player_game_results USING btree (user_id)
- `player_game_results_pkey`: CREATE UNIQUE INDEX player_game_results_pkey ON public.player_game_results USING btree (id)
- `player_game_results_room_id_user_id_key`: CREATE UNIQUE INDEX player_game_results_room_id_user_id_key ON public.player_game_results USING btree (room_id, user_id)

### `player_stats`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `games_played` | `integer` | No | `0` |
| `games_won` | `integer` | No | `0` |
| `games_lost` | `integer` | No | `0` |
| `total_eliminations` | `integer` | No | `0` |
| `total_territories_conquered` | `integer` | No | `0` |
| `longest_win_streak` | `integer` | No | `0` |
| `current_win_streak` | `integer` | No | `0` |
| `favorite_map_id` | `uuid` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `player_stats_user_id_key`: `user_id`

**Foreign keys:**
- `player_stats_favorite_map_id_fkey`: (`favorite_map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `player_stats_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `player_stats_games_consistency`: CHECK (games_played >= (games_won + games_lost))
- `player_stats_non_negative`: CHECK (games_played >= 0 AND games_won >= 0 AND games_lost >= 0 AND total_eliminations >= 0 AND total_territories_conquered >= 0 AND longest_win_streak >= 0 AND current_win_streak >= 0)

**Indexes:**
- `idx_player_stats_favorite_map_id`: CREATE INDEX idx_player_stats_favorite_map_id ON public.player_stats USING btree (favorite_map_id)
- `idx_player_stats_user_id`: CREATE INDEX idx_player_stats_user_id ON public.player_stats USING btree (user_id)
- `player_stats_pkey`: CREATE UNIQUE INDEX player_stats_pkey ON public.player_stats USING btree (id)
- `player_stats_user_id_key`: CREATE UNIQUE INDEX player_stats_user_id_key ON public.player_stats USING btree (user_id)

### `rating_history`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `old_rating` | `integer` | No | — |
| `new_rating` | `integer` | No | — |
| `rating_change` | `integer` | No | — |
| `game_room_id` | `uuid` | Yes | — |
| `reason` | `varchar(50)` | No | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `rating_history_game_room_id_fkey`: (`game_room_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `rating_history_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `rating_history_change_consistency`: CHECK ((new_rating - old_rating) = rating_change)

**Indexes:**
- `idx_rating_history_created_at`: CREATE INDEX idx_rating_history_created_at ON public.rating_history USING btree (created_at DESC)
- `idx_rating_history_user_id`: CREATE INDEX idx_rating_history_user_id ON public.rating_history USING btree (user_id)
- `rating_history_pkey`: CREATE UNIQUE INDEX rating_history_pkey ON public.rating_history USING btree (id)

### `room_players`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `room_id` | `uuid` | No | — |
| `user_id` | `uuid` | Yes | — |
| `joined_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `left_at` | `timestamp` | Yes | — |
| `player_order` | `integer` | Yes | — |
| `color` | `varchar(20)` | Yes | — |
| `is_eliminated` | `boolean` | No | `false` |
| `elimination_reason` | `varchar(50)` | Yes | — |
| `team_id` | `integer` | Yes | — |
| `is_ready` | `boolean` | No | `false` |
| `ready_at` | `timestamptz` | Yes | — |
| `is_ai` | `boolean` | No | `false` |
| `ai_difficulty` | `varchar(20)` | Yes | — |
| `ai_personality_seed` | `integer` | Yes | — |
| `ai_player_id` | `uuid` | Yes | — |
| `time_bank_seconds_remaining` | `integer` | Yes | — |
| `is_kicked` | `boolean` | No | `false` |
| `missed_turns` | `integer` | No | `0` |

**Primary key:** `id`

**Unique constraints:**
- `room_players_room_id_color_key`: `room_id`, `room_id`, `color`, `color`
- `room_players_room_id_player_order_key`: `room_id`, `room_id`, `player_order`, `player_order`
- `room_players_room_id_user_id_key`: `room_id`, `room_id`, `user_id`, `user_id`

**Foreign keys:**
- `room_players_room_id_fkey`: (`room_id`) → `game_rooms` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `room_players_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `room_players_ai_difficulty_check`: CHECK (ai_difficulty IS NULL OR (ai_difficulty::text = ANY (ARRAY['recruit'::character varying, 'commander'::character varying, 'grandmaster'::character varying]::text[])))
- `room_players_color_check`: CHECK (color::text = ANY (ARRAY['red'::character varying, 'blue'::character varying, 'green'::character varying, 'yellow'::character varying, 'purple'::character varying, 'orange'::character varying, 'pink'::character varying, 'cyan'::character varying, 'brown'::character varying, 'gray'::character varying, 'lime'::character varying, 'navy'::character varying]::text[]))
- `room_players_elimination_reason_check`: CHECK ((elimination_reason::text = ANY (ARRAY['defeated'::character varying, 'timeout'::character varying, 'disconnected'::character varying, 'abandoned'::character varying]::text[])) OR elimination_reason IS NULL)

**Indexes:**
- `idx_room_players_room_id`: CREATE INDEX idx_room_players_room_id ON public.room_players USING btree (room_id)
- `idx_room_players_bank`: CREATE INDEX idx_room_players_bank ON public.room_players USING btree (room_id, user_id)
- `idx_room_players_team_id`: CREATE INDEX idx_room_players_team_id ON public.room_players USING btree (team_id)
- `idx_room_players_user_id`: CREATE INDEX idx_room_players_user_id ON public.room_players USING btree (user_id)
- `room_players_pkey`: CREATE UNIQUE INDEX room_players_pkey ON public.room_players USING btree (id)
- `room_players_room_id_color_key`: CREATE UNIQUE INDEX room_players_room_id_color_key ON public.room_players USING btree (room_id, color)
- `room_players_room_id_player_order_key`: CREATE UNIQUE INDEX room_players_room_id_player_order_key ON public.room_players USING btree (room_id, player_order)
- `room_players_room_id_user_id_key`: CREATE UNIQUE INDEX room_players_room_id_user_id_key ON public.room_players USING btree (room_id, user_id)

### `schema_migrations`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `filename` | `varchar(255)` | No | — |
| `executed_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `status` | `varchar(20)` | No | `'completed'` |
| `checksum` | `varchar(64)` | Yes | — |
| `execution_time_ms` | `integer` | No | `0` |
| `rollback_sql` | `text` | Yes | — |
| `created_at` | `timestamptz` | Yes | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `schema_migrations_filename_key`: `filename`

**Foreign keys:**
- —

**Check constraints:**
- `migration_status_check`: CHECK (status::text = ANY (ARRAY['completed'::character varying, 'failed'::character varying, 'rolled_back'::character varying]::text[]))

**Indexes:**
- `idx_schema_migrations_filename`: CREATE INDEX idx_schema_migrations_filename ON public.schema_migrations USING btree (filename)
- `idx_schema_migrations_status`: CREATE INDEX idx_schema_migrations_status ON public.schema_migrations USING btree (status)
- `schema_migrations_filename_key`: CREATE UNIQUE INDEX schema_migrations_filename_key ON public.schema_migrations USING btree (filename)
- `schema_migrations_pkey`: CREATE UNIQUE INDEX schema_migrations_pkey ON public.schema_migrations USING btree (id)

### `seasons`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `name` | `varchar(100)` | No | — |
| `description` | `text` | Yes | — |
| `start_date` | `timestamp` | No | — |
| `end_date` | `timestamp` | No | — |
| `is_active` | `boolean` | No | `false` |
| `season_config` | `jsonb` | No | `'{}'` |
| `reward_config` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- —

**Check constraints:**
- `seasons_date_order`: CHECK (end_date > start_date)
- `seasons_name_not_empty`: CHECK (length(name::text) > 0)

**Indexes:**
- `idx_seasons_end_date`: CREATE INDEX idx_seasons_end_date ON public.seasons USING btree (end_date)
- `idx_seasons_is_active`: CREATE INDEX idx_seasons_is_active ON public.seasons USING btree (is_active)
- `idx_seasons_reward_config_gin`: CREATE INDEX idx_seasons_reward_config_gin ON public.seasons USING gin (reward_config)
- `idx_seasons_season_config_gin`: CREATE INDEX idx_seasons_season_config_gin ON public.seasons USING gin (season_config)
- `idx_seasons_start_date`: CREATE INDEX idx_seasons_start_date ON public.seasons USING btree (start_date)
- `seasons_pkey`: CREATE UNIQUE INDEX seasons_pkey ON public.seasons USING btree (id)

### `skill_leaderboard_cache`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `period_type` | `varchar(20)` | No | — |
| `period_start` | `date` | No | — |
| `period_end` | `date` | No | — |
| `rankings` | `jsonb` | No | — |
| `generated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `skill_leaderboard_cache_period_type_period_start_period_end_key`: `period_type`, `period_type`, `period_type`, `period_start`, `period_start`, `period_start`, `period_end`, `period_end`, `period_end`

**Foreign keys:**
- —

**Check constraints:**
- `leaderboard_period_check`: CHECK (period_type::text = ANY (ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'all_time'::character varying]::text[]))

**Indexes:**
- `idx_skill_leaderboard_cache_rankings_gin`: CREATE INDEX idx_skill_leaderboard_cache_rankings_gin ON public.skill_leaderboard_cache USING gin (rankings)
- `skill_leaderboard_cache_period_type_period_start_period_end_key`: CREATE UNIQUE INDEX skill_leaderboard_cache_period_type_period_start_period_end_key ON public.skill_leaderboard_cache USING btree (period_type, period_start, period_end)
- `skill_leaderboard_cache_pkey`: CREATE UNIQUE INDEX skill_leaderboard_cache_pkey ON public.skill_leaderboard_cache USING btree (id)

### `territory_adjacencies`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `map_id` | `uuid` | No | — |
| `territory_from` | `varchar(100)` | No | — |
| `territory_to` | `varchar(100)` | No | — |

**Primary key:** `id`

**Unique constraints:**
- `territory_adjacencies_map_id_territory_from_territory_to_key`: `map_id`, `map_id`, `map_id`, `territory_from`, `territory_from`, `territory_from`, `territory_to`, `territory_to`, `territory_to`

**Foreign keys:**
- `territory_adjacencies_map_id_fkey`: (`map_id`) → `maps` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `territory_adjacencies_no_self`: CHECK (territory_from::text <> territory_to::text)

**Indexes:**
- `idx_territory_adjacencies_map_id`: CREATE INDEX idx_territory_adjacencies_map_id ON public.territory_adjacencies USING btree (map_id)
- `territory_adjacencies_map_id_territory_from_territory_to_key`: CREATE UNIQUE INDEX territory_adjacencies_map_id_territory_from_territory_to_key ON public.territory_adjacencies USING btree (map_id, territory_from, territory_to)
- `territory_adjacencies_pkey`: CREATE UNIQUE INDEX territory_adjacencies_pkey ON public.territory_adjacencies USING btree (id)

### `territory_modifier_templates`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `name` | `varchar(100)` | No | — |
| `description` | `text` | No | — |
| `modifier_type` | `varchar(50)` | No | — |
| `effect_value` | `jsonb` | No | — |
| `duration_type` | `varchar(20)` | No | — |
| `is_active` | `boolean` | No | `true` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `territory_modifier_templates_name_key`: `name`

**Foreign keys:**
- —

**Check constraints:**
- `duration_type_check`: CHECK (duration_type::text = ANY (ARRAY['permanent'::character varying, 'turns'::character varying, 'rounds'::character varying, 'game'::character varying]::text[]))
- `modifier_type_check`: CHECK (modifier_type::text = ANY (ARRAY['bonus'::character varying, 'penalty'::character varying, 'special'::character varying]::text[]))

**Indexes:**
- `idx_territory_modifier_templates_effect_value_gin`: CREATE INDEX idx_territory_modifier_templates_effect_value_gin ON public.territory_modifier_templates USING gin (effect_value)
- `territory_modifier_templates_name_key`: CREATE UNIQUE INDEX territory_modifier_templates_name_key ON public.territory_modifier_templates USING btree (name)
- `territory_modifier_templates_pkey`: CREATE UNIQUE INDEX territory_modifier_templates_pkey ON public.territory_modifier_templates USING btree (id)

### `transactions`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `transaction_type` | `varchar(50)` | No | — |
| `amount` | `numeric(10, 2)` | No | — |
| `currency` | `varchar(3)` | Yes | `'USD'` |
| `status` | `varchar(20)` | No | `'pending'` |
| `provider` | `varchar(50)` | Yes | — |
| `provider_transaction_id` | `varchar(255)` | Yes | — |
| `items_purchased` | `jsonb` | No | `'[]'` |
| `metadata` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `completed_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `transactions_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `transactions_amount_check`: CHECK (transaction_type::text = 'refund'::text AND amount <= 0::numeric OR transaction_type::text <> 'refund'::text AND amount > 0::numeric)
- `transactions_status_check`: CHECK (status::text = ANY (ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying, 'cancelled'::character varying]::text[]))
- `transactions_type_check`: CHECK (transaction_type::text = ANY (ARRAY['purchase'::character varying, 'refund'::character varying, 'bonus'::character varying, 'reward'::character varying, 'subscription'::character varying]::text[]))

**Indexes:**
- `idx_transactions_created_at`: CREATE INDEX idx_transactions_created_at ON public.transactions USING btree (created_at DESC)
- `idx_transactions_items_purchased_gin`: CREATE INDEX idx_transactions_items_purchased_gin ON public.transactions USING gin (items_purchased)
- `idx_transactions_metadata_gin`: CREATE INDEX idx_transactions_metadata_gin ON public.transactions USING gin (metadata)
- `idx_transactions_status`: CREATE INDEX idx_transactions_status ON public.transactions USING btree (status)
- `idx_transactions_transaction_type`: CREATE INDEX idx_transactions_transaction_type ON public.transactions USING btree (transaction_type)
- `idx_transactions_user_id`: CREATE INDEX idx_transactions_user_id ON public.transactions USING btree (user_id)
- `transactions_pkey`: CREATE UNIQUE INDEX transactions_pkey ON public.transactions USING btree (id)

### `user_account_status`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `status` | `varchar(20)` | No | `'active'` |
| `reason` | `text` | Yes | — |
| `admin_user_id` | `uuid` | Yes | — |
| `status_changed_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `expires_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- `user_account_status_user_id_key`: `user_id`

**Foreign keys:**
- `user_account_status_admin_user_id_fkey`: (`admin_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `user_account_status_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `account_status_check`: CHECK (status::text = ANY (ARRAY['active'::character varying, 'suspended'::character varying, 'banned'::character varying, 'under_review'::character varying]::text[]))

**Indexes:**
- `idx_user_account_status_admin_user_id`: CREATE INDEX idx_user_account_status_admin_user_id ON public.user_account_status USING btree (admin_user_id)
- `idx_user_account_status_status`: CREATE INDEX idx_user_account_status_status ON public.user_account_status USING btree (status)
- `user_account_status_pkey`: CREATE UNIQUE INDEX user_account_status_pkey ON public.user_account_status USING btree (id)
- `user_account_status_user_id_key`: CREATE UNIQUE INDEX user_account_status_user_id_key ON public.user_account_status USING btree (user_id)

### `user_achievements`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `achievement_id` | `uuid` | No | — |
| `progress_data` | `jsonb` | No | `'{}'` |
| `unlocked_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `user_achievements_user_id_achievement_id_key`: `user_id`, `user_id`, `achievement_id`, `achievement_id`

**Foreign keys:**
- `user_achievements_achievement_id_fkey`: (`achievement_id`) → `achievements` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `user_achievements_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_user_achievements_achievement_id`: CREATE INDEX idx_user_achievements_achievement_id ON public.user_achievements USING btree (achievement_id)
- `idx_user_achievements_progress_data_gin`: CREATE INDEX idx_user_achievements_progress_data_gin ON public.user_achievements USING gin (progress_data)
- `idx_user_achievements_user_id`: CREATE INDEX idx_user_achievements_user_id ON public.user_achievements USING btree (user_id)
- `user_achievements_pkey`: CREATE UNIQUE INDEX user_achievements_pkey ON public.user_achievements USING btree (id)
- `user_achievements_user_id_achievement_id_key`: CREATE UNIQUE INDEX user_achievements_user_id_achievement_id_key ON public.user_achievements USING btree (user_id, achievement_id)

### `user_admin_roles`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `role_id` | `uuid` | No | — |
| `assigned_by` | `uuid` | Yes | — |
| `assigned_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `is_active` | `boolean` | Yes | `true` |
| `expires_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- `user_admin_roles_user_id_role_id_key`: `user_id`, `user_id`, `role_id`, `role_id`

**Foreign keys:**
- `user_admin_roles_assigned_by_fkey`: (`assigned_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `user_admin_roles_role_id_fkey`: (`role_id`) → `admin_roles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `user_admin_roles_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_user_admin_roles_assigned_by`: CREATE INDEX idx_user_admin_roles_assigned_by ON public.user_admin_roles USING btree (assigned_by)
- `idx_user_admin_roles_role_id`: CREATE INDEX idx_user_admin_roles_role_id ON public.user_admin_roles USING btree (role_id)
- `idx_user_admin_roles_user_id`: CREATE INDEX idx_user_admin_roles_user_id ON public.user_admin_roles USING btree (user_id)
- `user_admin_roles_pkey`: CREATE UNIQUE INDEX user_admin_roles_pkey ON public.user_admin_roles USING btree (id)
- `user_admin_roles_user_id_role_id_key`: CREATE UNIQUE INDEX user_admin_roles_user_id_role_id_key ON public.user_admin_roles USING btree (user_id, role_id)

### `user_bans`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `admin_id` | `uuid` | No | — |
| `ban_type` | `varchar(20)` | No | — |
| `reason` | `text` | No | — |
| `expires_at` | `timestamp` | Yes | — |
| `is_active` | `boolean` | No | `true` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `user_bans_admin_id_fkey`: (`admin_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `user_bans_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `user_bans_type_check`: CHECK (ban_type::text = ANY (ARRAY['temporary'::character varying, 'permanent'::character varying, 'chat'::character varying, 'game'::character varying]::text[]))

**Indexes:**
- `idx_user_bans_admin_id`: CREATE INDEX idx_user_bans_admin_id ON public.user_bans USING btree (admin_id)
- `idx_user_bans_user_id`: CREATE INDEX idx_user_bans_user_id ON public.user_bans USING btree (user_id)
- `user_bans_pkey`: CREATE UNIQUE INDEX user_bans_pkey ON public.user_bans USING btree (id)

### `user_behavior_patterns`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `pattern_type` | `varchar(50)` | No | — |
| `pattern_data` | `jsonb` | No | — |
| `confidence_score` | `numeric(3, 2)` | Yes | `0.0` |
| `generated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `expires_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `user_behavior_patterns_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `behavior_patterns_confidence_range`: CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0)
- `behavior_patterns_type_check`: CHECK (pattern_type::text = ANY (ARRAY['playstyle'::character varying, 'skill_trend'::character varying, 'churn_risk'::character varying, 'engagement_level'::character varying, 'spending_pattern'::character varying]::text[]))

**Indexes:**
- `idx_user_behavior_patterns_confidence_score`: CREATE INDEX idx_user_behavior_patterns_confidence_score ON public.user_behavior_patterns USING btree (confidence_score DESC)
- `idx_user_behavior_patterns_pattern_data_gin`: CREATE INDEX idx_user_behavior_patterns_pattern_data_gin ON public.user_behavior_patterns USING gin (pattern_data)
- `idx_user_behavior_patterns_pattern_type`: CREATE INDEX idx_user_behavior_patterns_pattern_type ON public.user_behavior_patterns USING btree (pattern_type)
- `idx_user_behavior_patterns_user_id`: CREATE INDEX idx_user_behavior_patterns_user_id ON public.user_behavior_patterns USING btree (user_id)
- `user_behavior_patterns_pkey`: CREATE UNIQUE INDEX user_behavior_patterns_pkey ON public.user_behavior_patterns USING btree (id)

### `user_blocks`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `blocker_id` | `uuid` | No | — |
| `blocked_id` | `uuid` | No | — |
| `created_at` | `timestamptz` | No | `now()` |

**Primary key:** `id`

**Unique constraints:**
- `user_blocks_blocker_id_blocked_id_key`: `blocker_id`, `blocker_id`, `blocked_id`, `blocked_id`

**Foreign keys:**
- `user_blocks_blocked_id_fkey`: (`blocked_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `user_blocks_blocker_id_fkey`: (`blocker_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_user_blocks_blocked`: CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id)
- `idx_user_blocks_blocker`: CREATE INDEX idx_user_blocks_blocker ON public.user_blocks USING btree (blocker_id, created_at DESC)
- `user_blocks_blocker_id_blocked_id_key`: CREATE UNIQUE INDEX user_blocks_blocker_id_blocked_id_key ON public.user_blocks USING btree (blocker_id, blocked_id)
- `user_blocks_pkey`: CREATE UNIQUE INDEX user_blocks_pkey ON public.user_blocks USING btree (id)

### `user_clan_preferences`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `user_id` | `uuid` | No | — |
| `allow_auto_invites` | `boolean` | No | `true` |
| `notification_settings` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `user_id`

**Unique constraints:**
- —

**Foreign keys:**
- `user_clan_preferences_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_user_clan_preferences_notifications`: CREATE INDEX idx_user_clan_preferences_notifications ON public.user_clan_preferences USING gin (notification_settings)
- `user_clan_preferences_pkey`: CREATE UNIQUE INDEX user_clan_preferences_pkey ON public.user_clan_preferences USING btree (user_id)

### `user_feature_flags`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `user_id` | `uuid` | No | — |
| `flag_name` | `varchar(100)` | No | — |
| `is_enabled` | `boolean` | No | `false` |
| `assigned_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `user_id`, `user_id`, `flag_name`, `flag_name`

**Unique constraints:**
- —

**Foreign keys:**
- `user_feature_flags_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_user_feature_flags_flag_name`: CREATE INDEX idx_user_feature_flags_flag_name ON public.user_feature_flags USING btree (flag_name)
- `idx_user_feature_flags_user_id`: CREATE INDEX idx_user_feature_flags_user_id ON public.user_feature_flags USING btree (user_id)
- `user_feature_flags_pkey`: CREATE UNIQUE INDEX user_feature_flags_pkey ON public.user_feature_flags USING btree (user_id, flag_name)

### `user_inventory`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `item_type` | `varchar(50)` | No | — |
| `item_id` | `varchar(100)` | No | — |
| `quantity` | `integer` | No | `1` |
| `acquired_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `expires_at` | `timestamp` | Yes | — |
| `metadata` | `jsonb` | No | `'{}'` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `user_inventory_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `user_inventory_item_type_check`: CHECK (item_type::text = ANY (ARRAY['cosmetic'::character varying, 'avatar'::character varying, 'theme'::character varying, 'currency'::character varying, 'boost'::character varying, 'premium_time'::character varying]::text[]))
- `user_inventory_quantity_positive`: CHECK (quantity > 0)

**Indexes:**
- `idx_user_inventory_expires_at`: CREATE INDEX idx_user_inventory_expires_at ON public.user_inventory USING btree (expires_at)
- `idx_user_inventory_item_type`: CREATE INDEX idx_user_inventory_item_type ON public.user_inventory USING btree (item_type)
- `idx_user_inventory_metadata_gin`: CREATE INDEX idx_user_inventory_metadata_gin ON public.user_inventory USING gin (metadata)
- `idx_user_inventory_user_id`: CREATE INDEX idx_user_inventory_user_id ON public.user_inventory USING btree (user_id)
- `user_inventory_pkey`: CREATE UNIQUE INDEX user_inventory_pkey ON public.user_inventory USING btree (id)

### `user_preferences`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `game_notifications` | `boolean` | No | `true` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `theme` | `varchar(50)` | Yes | `'default'` |
| `sound_enabled` | `boolean` | Yes | `true` |
| `music_enabled` | `boolean` | Yes | `true` |
| `master_volume` | `integer` | Yes | `75` |
| `sfx_volume` | `integer` | Yes | `80` |
| `music_volume` | `integer` | Yes | `50` |
| `preferred_color` | `varchar(20)` | Yes | `'#DC2626'` |
| `auto_ready` | `boolean` | Yes | `false` |
| `show_timer` | `boolean` | Yes | `true` |
| `show_army_numbers` | `boolean` | Yes | `true` |
| `animation_speed` | `varchar(20)` | Yes | `'normal'` |
| `language` | `varchar(10)` | Yes | `'en'` |
| `notification_enabled` | `boolean` | Yes | `true` |
| `turn_notifications_browser` | `boolean` | Yes | `true` |
| `turn_notifications_email` | `boolean` | Yes | `false` |
| `turn_timer_warning_browser` | `boolean` | Yes | `true` |
| `turn_timer_warning_email` | `boolean` | Yes | `false` |
| `game_invites_browser` | `boolean` | Yes | `true` |
| `game_invites_email` | `boolean` | Yes | `true` |
| `game_ended_browser` | `boolean` | Yes | `true` |
| `game_ended_email` | `boolean` | Yes | `false` |
| `show_online_status` | `boolean` | No | `true` |
| `direct_messages` | `varchar(20)` | Yes | `'friends'` |
| `dm_notifications_browser` | `boolean` | Yes | `true` |
| `dm_notifications_email` | `boolean` | Yes | `false` |
| `dm_policy` | `text` | Yes | `'everyone'` |
| `allow_group_invites` | `boolean` | No | `true` |

**Primary key:** `id`

**Unique constraints:**
- `user_preferences_user_id_key`: `user_id`

**Foreign keys:**
- `user_preferences_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `user_preferences_dm_policy_check`: CHECK (dm_policy = ANY (ARRAY['everyone'::text, 'friends_only'::text, 'no_one'::text]))

**Indexes:**
- `idx_user_preferences_user_id`: CREATE INDEX idx_user_preferences_user_id ON public.user_preferences USING btree (user_id)
- `user_preferences_pkey`: CREATE UNIQUE INDEX user_preferences_pkey ON public.user_preferences USING btree (id)
- `user_preferences_user_id_key`: CREATE UNIQUE INDEX user_preferences_user_id_key ON public.user_preferences USING btree (user_id)

### `user_profiles`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `display_name` | `varchar(100)` | Yes | — |
| `bio` | `text` | Yes | — |
| `avatar_url` | `varchar(500)` | Yes | — |
| `country_code` | `varchar(3)` | Yes | — |
| `timezone` | `varchar(50)` | Yes | — |
| `privacy_settings` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `user_profiles_user_id_key`: `user_id`

**Foreign keys:**
- `user_profiles_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `idx_user_profiles_privacy_settings_gin`: CREATE INDEX idx_user_profiles_privacy_settings_gin ON public.user_profiles USING gin (privacy_settings)
- `idx_user_profiles_user_id`: CREATE INDEX idx_user_profiles_user_id ON public.user_profiles USING btree (user_id)
- `user_profiles_pkey`: CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (id)
- `user_profiles_user_id_key`: CREATE UNIQUE INDEX user_profiles_user_id_key ON public.user_profiles USING btree (user_id)

### `user_reports`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `reporter_id` | `uuid` | No | — |
| `reported_user_id` | `uuid` | No | — |
| `reason` | `varchar(100)` | No | — |
| `description` | `text` | Yes | — |
| `evidence` | `jsonb` | No | `'{}'` |
| `status` | `varchar(20)` | No | `'pending'` |
| `admin_id` | `uuid` | Yes | — |
| `admin_notes` | `text` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `resolved_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `user_reports_admin_id_fkey`: (`admin_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
- `user_reports_reported_user_id_fkey`: (`reported_user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `user_reports_reporter_id_fkey`: (`reporter_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `reports_no_self`: CHECK (reporter_id <> reported_user_id)
- `reports_status_check`: CHECK (status::text = ANY (ARRAY['pending'::character varying, 'investigating'::character varying, 'resolved'::character varying, 'dismissed'::character varying]::text[]))

**Indexes:**
- `idx_user_reports_admin_id`: CREATE INDEX idx_user_reports_admin_id ON public.user_reports USING btree (admin_id)
- `idx_user_reports_evidence_gin`: CREATE INDEX idx_user_reports_evidence_gin ON public.user_reports USING gin (evidence)
- `idx_user_reports_reported_user_id`: CREATE INDEX idx_user_reports_reported_user_id ON public.user_reports USING btree (reported_user_id)
- `idx_user_reports_reporter_id`: CREATE INDEX idx_user_reports_reporter_id ON public.user_reports USING btree (reporter_id)
- `user_reports_pkey`: CREATE UNIQUE INDEX user_reports_pkey ON public.user_reports USING btree (id)

### `user_seasonal_stats`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `season_id` | `uuid` | No | — |
| `games_played` | `integer` | No | `0` |
| `games_won` | `integer` | No | `0` |
| `games_lost` | `integer` | No | `0` |
| `peak_rating` | `integer` | Yes | — |
| `current_rating` | `integer` | Yes | `1000` |
| `tier` | `varchar(20)` | Yes | `'bronze'` |
| `tier_progress` | `integer` | Yes | `0` |
| `season_rewards` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `user_seasonal_stats_user_id_season_id_key`: `user_id`, `user_id`, `season_id`, `season_id`

**Foreign keys:**
- `user_seasonal_stats_season_id_fkey`: (`season_id`) → `seasons` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
- `user_seasonal_stats_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `user_seasonal_stats_games_consistency`: CHECK (games_played >= (games_won + games_lost))
- `user_seasonal_stats_non_negative`: CHECK (games_played >= 0 AND games_won >= 0 AND games_lost >= 0 AND tier_progress >= 0)
- `user_seasonal_stats_tier_check`: CHECK (tier::text = ANY (ARRAY['bronze'::character varying, 'silver'::character varying, 'gold'::character varying, 'platinum'::character varying, 'diamond'::character varying, 'master'::character varying, 'grandmaster'::character varying]::text[]))

**Indexes:**
- `idx_user_seasonal_stats_current_rating`: CREATE INDEX idx_user_seasonal_stats_current_rating ON public.user_seasonal_stats USING btree (current_rating DESC)
- `idx_user_seasonal_stats_season_id`: CREATE INDEX idx_user_seasonal_stats_season_id ON public.user_seasonal_stats USING btree (season_id)
- `idx_user_seasonal_stats_season_rewards_gin`: CREATE INDEX idx_user_seasonal_stats_season_rewards_gin ON public.user_seasonal_stats USING gin (season_rewards)
- `idx_user_seasonal_stats_tier`: CREATE INDEX idx_user_seasonal_stats_tier ON public.user_seasonal_stats USING btree (tier)
- `idx_user_seasonal_stats_user_id`: CREATE INDEX idx_user_seasonal_stats_user_id ON public.user_seasonal_stats USING btree (user_id)
- `user_seasonal_stats_pkey`: CREATE UNIQUE INDEX user_seasonal_stats_pkey ON public.user_seasonal_stats USING btree (id)
- `user_seasonal_stats_user_id_season_id_key`: CREATE UNIQUE INDEX user_seasonal_stats_user_id_season_id_key ON public.user_seasonal_stats USING btree (user_id, season_id)

### `user_sessions`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | Yes | — |
| `started_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `ended_at` | `timestamp` | Yes | — |
| `duration_seconds` | `integer` | Yes | — |
| `ip_address` | `inet` | Yes | — |
| `user_agent` | `text` | Yes | — |
| `device_info` | `jsonb` | No | `'{}'` |
| `session_data` | `jsonb` | No | `'{}'` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `user_sessions_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL

**Check constraints:**
- `user_sessions_duration_positive`: CHECK (duration_seconds IS NULL OR duration_seconds >= 0)

**Indexes:**
- `idx_user_sessions_device_info_gin`: CREATE INDEX idx_user_sessions_device_info_gin ON public.user_sessions USING gin (device_info)
- `idx_user_sessions_ended_at`: CREATE INDEX idx_user_sessions_ended_at ON public.user_sessions USING btree (ended_at DESC)
- `idx_user_sessions_session_data_gin`: CREATE INDEX idx_user_sessions_session_data_gin ON public.user_sessions USING gin (session_data)
- `idx_user_sessions_started_at`: CREATE INDEX idx_user_sessions_started_at ON public.user_sessions USING btree (started_at DESC)
- `idx_user_sessions_user_id`: CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id)
- `user_sessions_pkey`: CREATE UNIQUE INDEX user_sessions_pkey ON public.user_sessions USING btree (id)

### `user_settings`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `theme` | `varchar(20)` | No | `'system'` |
| `notifications` | `jsonb` | No | `'{"push": false, "email": true}'` |
| `privacy` | `jsonb` | No | `'{"profile_visibility": "public"}'` |
| `preferences` | `jsonb` | No | `'{}'` |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |

**Primary key:** `id`

**Unique constraints:**
- `user_settings_user_id_key`: `user_id`

**Foreign keys:**
- `user_settings_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `user_settings_theme_check`: CHECK (theme::text = ANY (ARRAY['light'::character varying, 'dark'::character varying, 'system'::character varying]::text[]))

**Indexes:**
- `idx_user_settings_notifications_gin`: CREATE INDEX idx_user_settings_notifications_gin ON public.user_settings USING gin (notifications)
- `idx_user_settings_preferences_gin`: CREATE INDEX idx_user_settings_preferences_gin ON public.user_settings USING gin (preferences)
- `idx_user_settings_privacy_gin`: CREATE INDEX idx_user_settings_privacy_gin ON public.user_settings USING gin (privacy)
- `idx_user_settings_user_id`: CREATE INDEX idx_user_settings_user_id ON public.user_settings USING btree (user_id)
- `user_settings_pkey`: CREATE UNIQUE INDEX user_settings_pkey ON public.user_settings USING btree (id)
- `user_settings_user_id_key`: CREATE UNIQUE INDEX user_settings_user_id_key ON public.user_settings USING btree (user_id)

### `user_terms_acceptance`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `user_id` | `uuid` | No | — |
| `feature_type` | `varchar(50)` | No | — |
| `terms_version` | `varchar(20)` | No | — |
| `accepted_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `ip_address` | `inet` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- `user_terms_acceptance_user_id_feature_type_terms_version_key`: `user_id`, `user_id`, `user_id`, `feature_type`, `feature_type`, `feature_type`, `terms_version`, `terms_version`, `terms_version`

**Foreign keys:**
- `user_terms_acceptance_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- `terms_feature_type_check`: CHECK (feature_type::text = ANY (ARRAY['map_creation'::character varying, 'data_processing'::character varying, 'community_guidelines'::character varying]::text[]))

**Indexes:**
- `user_terms_acceptance_pkey`: CREATE UNIQUE INDEX user_terms_acceptance_pkey ON public.user_terms_acceptance USING btree (id)
- `user_terms_acceptance_user_id_feature_type_terms_version_key`: CREATE UNIQUE INDEX user_terms_acceptance_user_id_feature_type_terms_version_key ON public.user_terms_acceptance USING btree (user_id, feature_type, terms_version)

### `users`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | No | `uuid_generate_v4()` |
| `username` | `citext` | No | — |
| `email` | `citext` | No | — |
| `password_hash` | `varchar(255)` | No | — |
| `skill_rating` | `integer` | No | `1000` |
| `is_admin` | `boolean` | No | `false` |
| `email_verified` | `boolean` | No | `false` |
| `verification_token` | `varchar(255)` | Yes | — |
| `last_login` | `timestamp` | Yes | — |
| `timezone` | `varchar(50)` | Yes | — |
| `preferred_language` | `varchar(10)` | Yes | `'en'` |
| `marketing_consent` | `boolean` | No | `false` |
| `data_retention_consent` | `boolean` | No | `true` |
| `subscription_status` | `varchar(20)` | No | `'free'` |
| `subscription_expires_at` | `timestamp` | Yes | — |
| `created_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `updated_at` | `timestamp` | No | `CURRENT_TIMESTAMP` |
| `terms_accepted_at` | `timestamp` | Yes | — |
| `terms_version` | `varchar(20)` | Yes | — |
| `privacy_accepted_at` | `timestamp` | Yes | — |
| `privacy_version` | `varchar(20)` | Yes | — |
| `cookie_consent` | `boolean` | Yes | `false` |
| `cookie_consent_at` | `timestamp` | Yes | — |
| `is_vip` | `boolean` | Yes | `false` |
| `premium_tier` | `varchar(20)` | Yes | `'free'` |
| `vip_granted_at` | `timestamp` | Yes | — |
| `vip_granted_by` | `uuid` | Yes | — |
| `vip_reason` | `text` | Yes | — |
| `premium_expires_at` | `timestamp` | Yes | — |
| `is_beta_user` | `boolean` | Yes | `false` |
| `bio` | `text` | Yes | — |
| `deleted_at` | `timestamp` | Yes | — |

**Primary key:** `id`

**Unique constraints:**
- `users_email_key`: `email`
- `users_username_key`: `username`

**Foreign keys:**
- `users_vip_granted_by_fkey`: (`vip_granted_by`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION

**Check constraints:**
- `users_premium_tier_check`: CHECK (premium_tier::text = ANY (ARRAY['free'::character varying, 'premium'::character varying, 'pro'::character varying, 'enterprise'::character varying]::text[]))
- `users_skill_rating_check`: CHECK (skill_rating >= 0 AND skill_rating <= 5000)
- `users_subscription_status_check`: CHECK (subscription_status::text = ANY (ARRAY['free'::character varying, 'premium_monthly'::character varying, 'premium_yearly'::character varying, 'lifetime'::character varying]::text[]))
- `users_username_length`: CHECK (length(username::text) >= 3)

**Indexes:**
- `idx_users_created_at`: CREATE INDEX idx_users_created_at ON public.users USING btree (created_at DESC)
- `idx_users_email`: CREATE INDEX idx_users_email ON public.users USING btree (email)
- `idx_users_is_admin`: CREATE INDEX idx_users_is_admin ON public.users USING btree (is_admin) WHERE (is_admin = true)
- `idx_users_is_vip`: CREATE INDEX idx_users_is_vip ON public.users USING btree (is_vip) WHERE (is_vip = true)
- `idx_users_last_login`: CREATE INDEX idx_users_last_login ON public.users USING btree (last_login DESC)
- `idx_users_premium_tier`: CREATE INDEX idx_users_premium_tier ON public.users USING btree (premium_tier) WHERE ((premium_tier)::text <> 'free'::text)
- `idx_users_skill_rating`: CREATE INDEX idx_users_skill_rating ON public.users USING btree (skill_rating DESC)
- `idx_users_terms_accepted`: CREATE INDEX idx_users_terms_accepted ON public.users USING btree (terms_accepted_at) WHERE (terms_accepted_at IS NOT NULL)
- `idx_users_username`: CREATE INDEX idx_users_username ON public.users USING btree (username)
- `idx_users_username_trgm`: CREATE INDEX idx_users_username_trgm ON public.users USING gin (username gin_trgm_ops)
- `users_email_key`: CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)
- `users_pkey`: CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)
- `users_username_key`: CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username)

### `web_push_subscriptions`

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `id` | `bigint` | No | `nextval('web_push_subscriptions_id_seq')` |
| `user_id` | `uuid` | No | — |
| `endpoint` | `text` | No | — |
| `subscription` | `jsonb` | No | — |
| `expiration_time` | `timestamptz` | Yes | — |
| `p256dh_key` | `text` | Yes | — |
| `auth_key` | `text` | Yes | — |
| `failure_count` | `integer` | No | `0` |
| `last_failure_at` | `timestamptz` | Yes | — |
| `last_failure_reason` | `text` | Yes | — |
| `last_success_at` | `timestamptz` | Yes | — |
| `created_at` | `timestamptz` | No | `now()` |
| `updated_at` | `timestamptz` | No | `now()` |

**Primary key:** `id`

**Unique constraints:**
- —

**Foreign keys:**
- `web_push_subscriptions_user_id_fkey`: (`user_id`) → `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE

**Check constraints:**
- —

**Indexes:**
- `web_push_subscriptions_pkey`: CREATE UNIQUE INDEX web_push_subscriptions_pkey ON public.web_push_subscriptions USING btree (id)
- `web_push_subscriptions_user_endpoint_idx`: CREATE UNIQUE INDEX web_push_subscriptions_user_endpoint_idx ON public.web_push_subscriptions USING btree (user_id, endpoint)
- `web_push_subscriptions_user_idx`: CREATE INDEX web_push_subscriptions_user_idx ON public.web_push_subscriptions USING btree (user_id)

## Foreign Key Relationships

| Constraint | From table | Columns | To table | Columns | On Update | On Delete |
| --- | --- | --- | --- | --- | --- | --- |
| `achievement_progress_achievement_id_fkey` | `achievement_progress` | `achievement_id` | `achievements` | `id` | NO ACTION | CASCADE |
| `achievement_progress_user_id_fkey` | `achievement_progress` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `admin_activity_logs_admin_user_id_fkey` | `admin_activity_logs` | `admin_user_id` | `users` | `id` | NO ACTION | CASCADE |
| `admin_notifications_admin_id_fkey` | `admin_notifications` | `admin_id` | `users` | `id` | NO ACTION | SET NULL |
| `capital_eliminations_room_id_fkey` | `capital_eliminations` | `room_id` | `game_rooms` | `id` | NO ACTION | CASCADE |
| `capital_eliminations_eliminated_player_id_fkey` | `capital_eliminations` | `eliminated_player_id` | `users` | `id` | NO ACTION | CASCADE |
| `capital_eliminations_eliminating_player_id_fkey` | `capital_eliminations` | `eliminating_player_id` | `users` | `id` | NO ACTION | CASCADE |
| `clan_activity_log_clan_id_fkey` | `clan_activity_log` | `clan_id` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_activity_log_actor_user_id_fkey` | `clan_activity_log` | `actor_user_id` | `users` | `id` | NO ACTION | SET NULL |
| `clan_announcements_clan_id_fkey` | `clan_announcements` | `clan_id` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_announcements_author_user_id_fkey` | `clan_announcements` | `author_user_id` | `users` | `id` | NO ACTION | SET NULL |
| `clan_applications_clan_id_fkey` | `clan_applications` | `clan_id` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_applications_reviewed_by_fkey` | `clan_applications` | `reviewed_by` | `users` | `id` | NO ACTION | SET NULL |
| `clan_applications_user_id_fkey` | `clan_applications` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `clan_chat_messages_clan_id_fkey` | `clan_chat_messages` | `clan_id` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_chat_messages_deleted_by_fkey` | `clan_chat_messages` | `deleted_by` | `users` | `id` | NO ACTION | SET NULL |
| `clan_chat_messages_user_id_fkey` | `clan_chat_messages` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `clan_invitations_clan_id_fkey` | `clan_invitations` | `clan_id` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_invitations_invited_by_fkey` | `clan_invitations` | `invited_by` | `users` | `id` | NO ACTION | SET NULL |
| `clan_invitations_invited_user_id_fkey` | `clan_invitations` | `invited_user_id` | `users` | `id` | NO ACTION | CASCADE |
| `clan_members_role_id_fkey` | `clan_members` | `role_id` | `clan_roles` | `id` | NO ACTION | SET NULL |
| `clan_members_clan_id_fkey` | `clan_members` | `clan_id` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_members_user_id_fkey` | `clan_members` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `clan_objectives_clan_id_fkey` | `clan_objectives` | `clan_id` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_roles_clan_id_fkey` | `clan_roles` | `clan_id` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_war_matches_clan_war_id_fkey` | `clan_war_matches` | `clan_war_id` | `clan_wars` | `id` | NO ACTION | CASCADE |
| `clan_war_matches_game_id_fkey` | `clan_war_matches` | `game_id` | `game_rooms` | `id` | NO ACTION | SET NULL |
| `clan_war_matches_map_id_fkey` | `clan_war_matches` | `map_id` | `maps` | `id` | NO ACTION | SET NULL |
| `clan_wars_clan_id_a_fkey` | `clan_wars` | `clan_id_a` | `clans` | `id` | NO ACTION | CASCADE |
| `clan_wars_clan_id_b_fkey` | `clan_wars` | `clan_id_b` | `clans` | `id` | NO ACTION | CASCADE |
| `clans_owner_user_id_fkey` | `clans` | `owner_user_id` | `users` | `id` | NO ACTION | RESTRICT |
| `content_approval_queue_admin_user_id_fkey` | `content_approval_queue` | `admin_user_id` | `users` | `id` | NO ACTION | SET NULL |
| `content_approval_queue_submitter_id_fkey` | `content_approval_queue` | `submitter_id` | `users` | `id` | NO ACTION | CASCADE |
| `conversation_members_last_read_fk` | `conversation_members` | `last_read_message_id` | `conversation_messages` | `id` | NO ACTION | SET NULL |
| `conversation_members_conversation_id_fkey` | `conversation_members` | `conversation_id` | `conversations` | `id` | NO ACTION | CASCADE |
| `conversation_members_user_id_fkey` | `conversation_members` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `conversation_messages_conversation_id_fkey` | `conversation_messages` | `conversation_id` | `conversations` | `id` | NO ACTION | CASCADE |
| `conversation_messages_sender_id_fkey` | `conversation_messages` | `sender_id` | `users` | `id` | NO ACTION | SET NULL |
| `conversations_game_id_fkey` | `conversations` | `game_id` | `game_rooms` | `id` | NO ACTION | SET NULL |
| `conversations_created_by_fkey` | `conversations` | `created_by` | `users` | `id` | NO ACTION | RESTRICT |
| `email_verification_logs_user_id_fkey` | `email_verification_logs` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `events_user_id_fkey` | `events` | `user_id` | `users` | `id` | NO ACTION | SET NULL |
| `feature_flag_audit_changed_by_fkey` | `feature_flag_audit` | `changed_by` | `users` | `id` | NO ACTION | NO ACTION |
| `feature_flags_created_by_fkey` | `feature_flags` | `created_by` | `users` | `id` | NO ACTION | NO ACTION |
| `friendships_friend_id_fkey` | `friendships` | `friend_id` | `users` | `id` | NO ACTION | CASCADE |
| `friendships_user_id_fkey` | `friendships` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `game_moves_room_id_fkey` | `game_moves` | `room_id` | `game_rooms` | `id` | NO ACTION | CASCADE |
| `game_moves_player_id_fkey` | `game_moves` | `player_id` | `users` | `id` | NO ACTION | CASCADE |
| `game_results_room_id_fkey` | `game_results` | `room_id` | `game_rooms` | `id` | NO ACTION | CASCADE |
| `game_results_map_id_fkey` | `game_results` | `map_id` | `maps` | `id` | NO ACTION | NO ACTION |
| `game_results_winner_id_fkey` | `game_results` | `winner_id` | `users` | `id` | NO ACTION | NO ACTION |
| `game_rooms_variant_id_fkey` | `game_rooms` | `variant_id` | `game_variants` | `id` | NO ACTION | NO ACTION |
| `game_rooms_map_id_fkey` | `game_rooms` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `game_rooms_season_id_fkey` | `game_rooms` | `season_id` | `seasons` | `id` | NO ACTION | NO ACTION |
| `game_rooms_current_turn_user_id_fkey` | `game_rooms` | `current_turn_user_id` | `users` | `id` | NO ACTION | NO ACTION |
| `game_rooms_host_id_fkey` | `game_rooms` | `host_id` | `users` | `id` | NO ACTION | CASCADE |
| `game_rooms_winner_id_fkey` | `game_rooms` | `winner_id` | `users` | `id` | NO ACTION | NO ACTION |
| `game_states_room_id_fkey` | `game_states` | `room_id` | `game_rooms` | `id` | NO ACTION | CASCADE |
| `game_states_current_player_id_fkey` | `game_states` | `current_player_id` | `users` | `id` | NO ACTION | NO ACTION |
| `game_states_winner_id_fkey` | `game_states` | `winner_id` | `users` | `id` | NO ACTION | NO ACTION |
| `game_territory_modifiers_room_id_fkey` | `game_territory_modifiers` | `room_id` | `game_rooms` | `id` | NO ACTION | CASCADE |
| `game_territory_modifiers_template_id_fkey` | `game_territory_modifiers` | `template_id` | `territory_modifier_templates` | `id` | NO ACTION | NO ACTION |
| `game_territory_modifiers_applied_by_fkey` | `game_territory_modifiers` | `applied_by` | `users` | `id` | NO ACTION | NO ACTION |
| `game_variants_created_by_fkey` | `game_variants` | `created_by` | `users` | `id` | NO ACTION | SET NULL |
| `map_collaborators_map_id_fkey` | `map_collaborators` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_collaborators_assigned_by_fkey` | `map_collaborators` | `assigned_by` | `users` | `id` | NO ACTION | SET NULL |
| `map_collaborators_user_id_fkey` | `map_collaborators` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `map_continents_map_id_fkey` | `map_continents` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_drafts_staging_image_id_fkey` | `map_drafts` | `staging_image_id` | `map_images_staging` | `id` | NO ACTION | SET NULL |
| `map_drafts_parent_map_id_fkey` | `map_drafts` | `parent_map_id` | `maps` | `id` | NO ACTION | SET NULL |
| `map_drafts_user_id_fkey` | `map_drafts` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `map_images_staging_user_id_fkey` | `map_images_staging` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `map_ratings_map_id_fkey` | `map_ratings` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_ratings_user_id_fkey` | `map_ratings` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `map_review_queue_map_id_fkey` | `map_review_queue` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_review_queue_assigned_to_fkey` | `map_review_queue` | `assigned_to` | `users` | `id` | NO ACTION | SET NULL |
| `map_review_queue_submitted_by_fkey` | `map_review_queue` | `submitted_by` | `users` | `id` | NO ACTION | CASCADE |
| `map_reviews_map_id_fkey` | `map_reviews` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_reviews_reviewer_id_fkey` | `map_reviews` | `reviewer_id` | `users` | `id` | NO ACTION | CASCADE |
| `map_submission_logs_map_id_fkey` | `map_submission_logs` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_submission_logs_performed_by_fkey` | `map_submission_logs` | `performed_by` | `users` | `id` | NO ACTION | SET NULL |
| `map_submissions_map_id_fkey` | `map_submissions` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_submissions_reviewed_by_fkey` | `map_submissions` | `reviewed_by` | `users` | `id` | NO ACTION | NO ACTION |
| `map_submissions_user_id_fkey` | `map_submissions` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `map_territories_map_id_fkey` | `map_territories` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_territory_modifiers_map_id_fkey` | `map_territory_modifiers` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_territory_modifiers_template_id_fkey` | `map_territory_modifiers` | `template_id` | `territory_modifier_templates` | `id` | NO ACTION | NO ACTION |
| `map_versions_map_id_fkey` | `map_versions` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `map_versions_changed_by_fkey` | `map_versions` | `changed_by` | `users` | `id` | NO ACTION | SET NULL |
| `maps_parent_map_id_fkey` | `maps` | `parent_map_id` | `maps` | `id` | NO ACTION | SET NULL |
| `maps_created_by_fkey` | `maps` | `creator_id` | `users` | `id` | NO ACTION | NO ACTION |
| `maps_reviewed_by_fkey` | `maps` | `reviewed_by` | `users` | `id` | NO ACTION | SET NULL |
| `matchmaking_queue_user_id_fkey` | `matchmaking_queue` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `message_read_receipts_message_id_fkey` | `message_read_receipts` | `message_id` | `conversation_messages` | `id` | NO ACTION | CASCADE |
| `message_read_receipts_user_id_fkey` | `message_read_receipts` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `notifications_user_id_fkey` | `notifications` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `password_reset_tokens_user_id_fkey` | `password_reset_tokens` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `player_game_results_room_id_fkey` | `player_game_results` | `room_id` | `game_results` | `room_id` | NO ACTION | CASCADE |
| `player_game_results_user_id_fkey` | `player_game_results` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `player_stats_favorite_map_id_fkey` | `player_stats` | `favorite_map_id` | `maps` | `id` | NO ACTION | NO ACTION |
| `player_stats_user_id_fkey` | `player_stats` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `rating_history_game_room_id_fkey` | `rating_history` | `game_room_id` | `game_rooms` | `id` | NO ACTION | NO ACTION |
| `rating_history_user_id_fkey` | `rating_history` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `room_players_room_id_fkey` | `room_players` | `room_id` | `game_rooms` | `id` | NO ACTION | CASCADE |
| `room_players_user_id_fkey` | `room_players` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `territory_adjacencies_map_id_fkey` | `territory_adjacencies` | `map_id` | `maps` | `id` | NO ACTION | CASCADE |
| `transactions_user_id_fkey` | `transactions` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_account_status_admin_user_id_fkey` | `user_account_status` | `admin_user_id` | `users` | `id` | NO ACTION | NO ACTION |
| `user_account_status_user_id_fkey` | `user_account_status` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_achievements_achievement_id_fkey` | `user_achievements` | `achievement_id` | `achievements` | `id` | NO ACTION | CASCADE |
| `user_achievements_user_id_fkey` | `user_achievements` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_admin_roles_role_id_fkey` | `user_admin_roles` | `role_id` | `admin_roles` | `id` | NO ACTION | CASCADE |
| `user_admin_roles_assigned_by_fkey` | `user_admin_roles` | `assigned_by` | `users` | `id` | NO ACTION | NO ACTION |
| `user_admin_roles_user_id_fkey` | `user_admin_roles` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_bans_admin_id_fkey` | `user_bans` | `admin_id` | `users` | `id` | NO ACTION | NO ACTION |
| `user_bans_user_id_fkey` | `user_bans` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_behavior_patterns_user_id_fkey` | `user_behavior_patterns` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_blocks_blocked_id_fkey` | `user_blocks` | `blocked_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_blocks_blocker_id_fkey` | `user_blocks` | `blocker_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_clan_preferences_user_id_fkey` | `user_clan_preferences` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_feature_flags_user_id_fkey` | `user_feature_flags` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_inventory_user_id_fkey` | `user_inventory` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_preferences_user_id_fkey` | `user_preferences` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_profiles_user_id_fkey` | `user_profiles` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_reports_admin_id_fkey` | `user_reports` | `admin_id` | `users` | `id` | NO ACTION | NO ACTION |
| `user_reports_reported_user_id_fkey` | `user_reports` | `reported_user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_reports_reporter_id_fkey` | `user_reports` | `reporter_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_seasonal_stats_season_id_fkey` | `user_seasonal_stats` | `season_id` | `seasons` | `id` | NO ACTION | CASCADE |
| `user_seasonal_stats_user_id_fkey` | `user_seasonal_stats` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_sessions_user_id_fkey` | `user_sessions` | `user_id` | `users` | `id` | NO ACTION | SET NULL |
| `user_settings_user_id_fkey` | `user_settings` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `user_terms_acceptance_user_id_fkey` | `user_terms_acceptance` | `user_id` | `users` | `id` | NO ACTION | CASCADE |
| `users_vip_granted_by_fkey` | `users` | `vip_granted_by` | `users` | `id` | NO ACTION | NO ACTION |
| `web_push_subscriptions_user_id_fkey` | `web_push_subscriptions` | `user_id` | `users` | `id` | NO ACTION | CASCADE |

## Triggers

| Trigger | Table | Definition |
| --- | --- | --- |
| `update_achievement_progress_updated_at` | `achievement_progress` | CREATE TRIGGER update_achievement_progress_updated_at BEFORE UPDATE ON achievement_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_admin_roles_updated_at` | `admin_roles` | CREATE TRIGGER update_admin_roles_updated_at BEFORE UPDATE ON admin_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clan_announcements_updated_at` | `clan_announcements` | CREATE TRIGGER trg_clan_announcements_updated_at BEFORE UPDATE ON clan_announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clan_applications_updated_at` | `clan_applications` | CREATE TRIGGER trg_clan_applications_updated_at BEFORE UPDATE ON clan_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clan_invitations_updated_at` | `clan_invitations` | CREATE TRIGGER trg_clan_invitations_updated_at BEFORE UPDATE ON clan_invitations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clan_members_updated_at` | `clan_members` | CREATE TRIGGER trg_clan_members_updated_at BEFORE UPDATE ON clan_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clan_objectives_updated_at` | `clan_objectives` | CREATE TRIGGER trg_clan_objectives_updated_at BEFORE UPDATE ON clan_objectives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clan_roles_updated_at` | `clan_roles` | CREATE TRIGGER trg_clan_roles_updated_at BEFORE UPDATE ON clan_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clan_war_matches_updated_at` | `clan_war_matches` | CREATE TRIGGER trg_clan_war_matches_updated_at BEFORE UPDATE ON clan_war_matches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clan_wars_updated_at` | `clan_wars` | CREATE TRIGGER trg_clan_wars_updated_at BEFORE UPDATE ON clan_wars FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_clans_updated_at` | `clans` | CREATE TRIGGER trg_clans_updated_at BEFORE UPDATE ON clans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `conversation_members_set_updated_at` | `conversation_members` | CREATE TRIGGER conversation_members_set_updated_at BEFORE UPDATE ON conversation_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `conversation_messages_set_updated_at` | `conversation_messages` | CREATE TRIGGER conversation_messages_set_updated_at BEFORE UPDATE ON conversation_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `conversations_set_updated_at` | `conversations` | CREATE TRIGGER conversations_set_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `feature_flag_audit_trigger` | `feature_flags` | CREATE TRIGGER feature_flag_audit_trigger AFTER INSERT OR DELETE OR UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION log_feature_flag_change() |
| `update_feature_flags_updated_at` | `feature_flags` | CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_game_rooms_updated_at` | `game_rooms` | CREATE TRIGGER update_game_rooms_updated_at BEFORE UPDATE ON game_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_game_variants_updated_at` | `game_variants` | CREATE TRIGGER update_game_variants_updated_at BEFORE UPDATE ON game_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_map_drafts_updated_at` | `map_drafts` | CREATE TRIGGER trg_map_drafts_updated_at BEFORE UPDATE ON map_drafts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_map_images_staging_updated_at` | `map_images_staging` | CREATE TRIGGER trg_map_images_staging_updated_at BEFORE UPDATE ON map_images_staging FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_map_ratings_updated_at` | `map_ratings` | CREATE TRIGGER update_map_ratings_updated_at BEFORE UPDATE ON map_ratings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_map_reviews_updated_at` | `map_reviews` | CREATE TRIGGER trg_map_reviews_updated_at BEFORE UPDATE ON map_reviews FOR EACH ROW EXECUTE FUNCTION update_map_reviews_updated_at() |
| `trg_map_submissions_updated_at` | `map_submissions` | CREATE TRIGGER trg_map_submissions_updated_at BEFORE UPDATE ON map_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_maps_updated_at` | `maps` | CREATE TRIGGER update_maps_updated_at BEFORE UPDATE ON maps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_player_stats_updated_at` | `player_stats` | CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON player_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_user_behavior_patterns_updated_at` | `user_behavior_patterns` | CREATE TRIGGER update_user_behavior_patterns_updated_at BEFORE UPDATE ON user_behavior_patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `trg_user_clan_preferences_updated_at` | `user_clan_preferences` | CREATE TRIGGER trg_user_clan_preferences_updated_at BEFORE UPDATE ON user_clan_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_user_preferences_updated_at` | `user_preferences` | CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `user_preferences_updated_at` | `user_preferences` | CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_user_preferences_updated_at() |
| `update_user_profiles_updated_at` | `user_profiles` | CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_user_seasonal_stats_updated_at` | `user_seasonal_stats` | CREATE TRIGGER update_user_seasonal_stats_updated_at BEFORE UPDATE ON user_seasonal_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_user_settings_updated_at` | `user_settings` | CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `update_users_updated_at` | `users` | CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column() |
| `web_push_subscriptions_updated_at` | `web_push_subscriptions` | CREATE TRIGGER web_push_subscriptions_updated_at BEFORE UPDATE ON web_push_subscriptions FOR EACH ROW EXECUTE FUNCTION update_web_push_subscriptions_updated_at() |
