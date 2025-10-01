CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--
-- PostgreSQL database dump
--

\restrict bO8vj6y8B3Isr9gsXXGgeg5wV5vr3ZQ0TRHpElb7bgsAMoTPAABjxLe18Cl68fX

-- Dumped from database version 17.6 (Debian 17.6-2.pgdg13+1)
-- Dumped by pg_dump version 17.6 (Ubuntu 17.6-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY "public"."web_push_subscriptions" DROP CONSTRAINT IF EXISTS "web_push_subscriptions_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."users" DROP CONSTRAINT IF EXISTS "users_vip_granted_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_terms_acceptance" DROP CONSTRAINT IF EXISTS "user_terms_acceptance_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_reports" DROP CONSTRAINT IF EXISTS "user_reports_reporter_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_reports" DROP CONSTRAINT IF EXISTS "user_reports_reported_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_reports" DROP CONSTRAINT IF EXISTS "user_reports_admin_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_preferences" DROP CONSTRAINT IF EXISTS "user_preferences_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_feature_flags" DROP CONSTRAINT IF EXISTS "user_feature_flags_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_clan_preferences" DROP CONSTRAINT IF EXISTS "user_clan_preferences_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_blocks" DROP CONSTRAINT IF EXISTS "user_blocks_blocker_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_blocks" DROP CONSTRAINT IF EXISTS "user_blocks_blocked_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_behavior_patterns" DROP CONSTRAINT IF EXISTS "user_behavior_patterns_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_bans" DROP CONSTRAINT IF EXISTS "user_bans_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_bans" DROP CONSTRAINT IF EXISTS "user_bans_admin_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_admin_roles" DROP CONSTRAINT IF EXISTS "user_admin_roles_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_admin_roles" DROP CONSTRAINT IF EXISTS "user_admin_roles_role_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_admin_roles" DROP CONSTRAINT IF EXISTS "user_admin_roles_assigned_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_achievements" DROP CONSTRAINT IF EXISTS "user_achievements_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_achievements" DROP CONSTRAINT IF EXISTS "user_achievements_achievement_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_account_status" DROP CONSTRAINT IF EXISTS "user_account_status_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."user_account_status" DROP CONSTRAINT IF EXISTS "user_account_status_admin_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."territory_adjacencies" DROP CONSTRAINT IF EXISTS "territory_adjacencies_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."room_players" DROP CONSTRAINT IF EXISTS "room_players_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."room_players" DROP CONSTRAINT IF EXISTS "room_players_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."rating_history" DROP CONSTRAINT IF EXISTS "rating_history_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."rating_history" DROP CONSTRAINT IF EXISTS "rating_history_game_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."player_stats" DROP CONSTRAINT IF EXISTS "player_stats_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."player_stats" DROP CONSTRAINT IF EXISTS "player_stats_favorite_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."player_game_results" DROP CONSTRAINT IF EXISTS "player_game_results_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."player_game_results" DROP CONSTRAINT IF EXISTS "player_game_results_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."notifications" DROP CONSTRAINT IF EXISTS "notifications_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."matchmaking_queue" DROP CONSTRAINT IF EXISTS "matchmaking_queue_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."maps" DROP CONSTRAINT IF EXISTS "maps_reviewed_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."maps" DROP CONSTRAINT IF EXISTS "maps_parent_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."maps" DROP CONSTRAINT IF EXISTS "maps_created_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_versions" DROP CONSTRAINT IF EXISTS "map_versions_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_versions" DROP CONSTRAINT IF EXISTS "map_versions_changed_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_territory_modifiers" DROP CONSTRAINT IF EXISTS "map_territory_modifiers_modifier_template_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_territory_modifiers" DROP CONSTRAINT IF EXISTS "map_territory_modifiers_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_territories" DROP CONSTRAINT IF EXISTS "map_territories_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_submissions" DROP CONSTRAINT IF EXISTS "map_submissions_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_submissions" DROP CONSTRAINT IF EXISTS "map_submissions_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_submission_logs" DROP CONSTRAINT IF EXISTS "map_submission_logs_performed_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_submission_logs" DROP CONSTRAINT IF EXISTS "map_submission_logs_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_reviews" DROP CONSTRAINT IF EXISTS "map_reviews_reviewer_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_reviews" DROP CONSTRAINT IF EXISTS "map_reviews_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_ratings" DROP CONSTRAINT IF EXISTS "map_ratings_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_ratings" DROP CONSTRAINT IF EXISTS "map_ratings_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_images_staging" DROP CONSTRAINT IF EXISTS "map_images_staging_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_drafts" DROP CONSTRAINT IF EXISTS "map_drafts_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_drafts" DROP CONSTRAINT IF EXISTS "map_drafts_staging_image_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_drafts" DROP CONSTRAINT IF EXISTS "map_drafts_parent_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_sectors" DROP CONSTRAINT IF EXISTS "map_continents_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_collaborators" DROP CONSTRAINT IF EXISTS "map_collaborators_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_collaborators" DROP CONSTRAINT IF EXISTS "map_collaborators_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_collaborators" DROP CONSTRAINT IF EXISTS "map_collaborators_assigned_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_approval_requests" DROP CONSTRAINT IF EXISTS "map_approval_requests_version_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_approval_requests" DROP CONSTRAINT IF EXISTS "map_approval_requests_requester_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."map_approval_requests" DROP CONSTRAINT IF EXISTS "map_approval_requests_assigned_moderator_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_territory_modifiers" DROP CONSTRAINT IF EXISTS "game_territory_modifiers_template_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_territory_modifiers" DROP CONSTRAINT IF EXISTS "game_territory_modifiers_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_territory_modifiers" DROP CONSTRAINT IF EXISTS "game_territory_modifiers_applied_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_states" DROP CONSTRAINT IF EXISTS "game_states_winner_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_states" DROP CONSTRAINT IF EXISTS "game_states_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_states" DROP CONSTRAINT IF EXISTS "game_states_current_player_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_rooms" DROP CONSTRAINT IF EXISTS "game_rooms_winner_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_rooms" DROP CONSTRAINT IF EXISTS "game_rooms_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_rooms" DROP CONSTRAINT IF EXISTS "game_rooms_host_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_rooms" DROP CONSTRAINT IF EXISTS "game_rooms_current_turn_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_results" DROP CONSTRAINT IF EXISTS "game_results_winner_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_results" DROP CONSTRAINT IF EXISTS "game_results_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_results" DROP CONSTRAINT IF EXISTS "game_results_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_moves" DROP CONSTRAINT IF EXISTS "game_moves_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."game_moves" DROP CONSTRAINT IF EXISTS "game_moves_player_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."friendships" DROP CONSTRAINT IF EXISTS "friendships_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."friendships" DROP CONSTRAINT IF EXISTS "friendships_friend_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."feature_flags" DROP CONSTRAINT IF EXISTS "feature_flags_created_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."feature_flag_audit" DROP CONSTRAINT IF EXISTS "feature_flag_audit_changed_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."events" DROP CONSTRAINT IF EXISTS "events_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."email_verification_logs" DROP CONSTRAINT IF EXISTS "email_verification_logs_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."conversations" DROP CONSTRAINT IF EXISTS "conversations_game_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."conversations" DROP CONSTRAINT IF EXISTS "conversations_created_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."conversations" DROP CONSTRAINT IF EXISTS "conversations_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."conversation_messages" DROP CONSTRAINT IF EXISTS "conversation_messages_sender_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."conversation_messages" DROP CONSTRAINT IF EXISTS "conversation_messages_conversation_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."conversation_members" DROP CONSTRAINT IF EXISTS "conversation_members_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."conversation_members" DROP CONSTRAINT IF EXISTS "conversation_members_last_read_fk";
ALTER TABLE IF EXISTS ONLY "public"."conversation_members" DROP CONSTRAINT IF EXISTS "conversation_members_conversation_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clans" DROP CONSTRAINT IF EXISTS "clans_owner_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_wars" DROP CONSTRAINT IF EXISTS "clan_wars_clan_id_b_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_wars" DROP CONSTRAINT IF EXISTS "clan_wars_clan_id_a_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_war_matches" DROP CONSTRAINT IF EXISTS "clan_war_matches_map_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_war_matches" DROP CONSTRAINT IF EXISTS "clan_war_matches_game_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_war_matches" DROP CONSTRAINT IF EXISTS "clan_war_matches_clan_war_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_roles" DROP CONSTRAINT IF EXISTS "clan_roles_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_objectives" DROP CONSTRAINT IF EXISTS "clan_objectives_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_members" DROP CONSTRAINT IF EXISTS "clan_members_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_members" DROP CONSTRAINT IF EXISTS "clan_members_role_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_members" DROP CONSTRAINT IF EXISTS "clan_members_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_join_requests" DROP CONSTRAINT IF EXISTS "clan_join_requests_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_join_requests" DROP CONSTRAINT IF EXISTS "clan_join_requests_reviewed_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_join_requests" DROP CONSTRAINT IF EXISTS "clan_join_requests_created_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_join_requests" DROP CONSTRAINT IF EXISTS "clan_join_requests_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_invitations" DROP CONSTRAINT IF EXISTS "clan_invitations_invited_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_invitations" DROP CONSTRAINT IF EXISTS "clan_invitations_invited_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_invitations" DROP CONSTRAINT IF EXISTS "clan_invitations_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_chat_messages" DROP CONSTRAINT IF EXISTS "clan_chat_messages_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_chat_messages" DROP CONSTRAINT IF EXISTS "clan_chat_messages_deleted_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_chat_messages" DROP CONSTRAINT IF EXISTS "clan_chat_messages_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_applications" DROP CONSTRAINT IF EXISTS "clan_applications_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_applications" DROP CONSTRAINT IF EXISTS "clan_applications_reviewed_by_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_applications" DROP CONSTRAINT IF EXISTS "clan_applications_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_announcements" DROP CONSTRAINT IF EXISTS "clan_announcements_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_announcements" DROP CONSTRAINT IF EXISTS "clan_announcements_author_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_activity_log" DROP CONSTRAINT IF EXISTS "clan_activity_log_clan_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_activity_log" DROP CONSTRAINT IF EXISTS "clan_activity_log_actor_user_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."capital_eliminations" DROP CONSTRAINT IF EXISTS "capital_eliminations_room_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."capital_eliminations" DROP CONSTRAINT IF EXISTS "capital_eliminations_eliminating_player_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."capital_eliminations" DROP CONSTRAINT IF EXISTS "capital_eliminations_eliminated_player_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."admin_notifications" DROP CONSTRAINT IF EXISTS "admin_notifications_admin_id_fkey";
ALTER TABLE IF EXISTS ONLY "public"."admin_activity_logs" DROP CONSTRAINT IF EXISTS "admin_activity_logs_admin_user_id_fkey";
DROP TRIGGER IF EXISTS "web_push_subscriptions_updated_at" ON "public"."web_push_subscriptions";
DROP TRIGGER IF EXISTS "user_preferences_updated_at" ON "public"."user_preferences";
DROP TRIGGER IF EXISTS "update_users_updated_at" ON "public"."users";
DROP TRIGGER IF EXISTS "update_user_preferences_updated_at" ON "public"."user_preferences";
DROP TRIGGER IF EXISTS "update_user_behavior_patterns_updated_at" ON "public"."user_behavior_patterns";
DROP TRIGGER IF EXISTS "update_player_stats_updated_at" ON "public"."player_stats";
DROP TRIGGER IF EXISTS "update_maps_updated_at" ON "public"."maps";
DROP TRIGGER IF EXISTS "update_map_ratings_updated_at" ON "public"."map_ratings";
DROP TRIGGER IF EXISTS "update_game_rooms_updated_at" ON "public"."game_rooms";
DROP TRIGGER IF EXISTS "update_feature_flags_updated_at" ON "public"."feature_flags";
DROP TRIGGER IF EXISTS "update_admin_roles_updated_at" ON "public"."admin_roles";
DROP TRIGGER IF EXISTS "trg_user_clan_preferences_updated_at" ON "public"."user_clan_preferences";
DROP TRIGGER IF EXISTS "trg_map_submissions_updated_at" ON "public"."map_submissions";
DROP TRIGGER IF EXISTS "trg_map_reviews_updated_at" ON "public"."map_reviews";
DROP TRIGGER IF EXISTS "trg_map_images_staging_updated_at" ON "public"."map_images_staging";
DROP TRIGGER IF EXISTS "trg_map_drafts_updated_at" ON "public"."map_drafts";
DROP TRIGGER IF EXISTS "trg_map_approval_requests_updated_at" ON "public"."map_approval_requests";
DROP TRIGGER IF EXISTS "trg_clans_updated_at" ON "public"."clans";
DROP TRIGGER IF EXISTS "trg_clan_wars_updated_at" ON "public"."clan_wars";
DROP TRIGGER IF EXISTS "trg_clan_war_matches_updated_at" ON "public"."clan_war_matches";
DROP TRIGGER IF EXISTS "trg_clan_roles_updated_at" ON "public"."clan_roles";
DROP TRIGGER IF EXISTS "trg_clan_objectives_updated_at" ON "public"."clan_objectives";
DROP TRIGGER IF EXISTS "trg_clan_members_updated_at" ON "public"."clan_members";
DROP TRIGGER IF EXISTS "trg_clan_join_requests_updated_at" ON "public"."clan_join_requests";
DROP TRIGGER IF EXISTS "trg_clan_invitations_updated_at" ON "public"."clan_invitations";
DROP TRIGGER IF EXISTS "trg_clan_applications_updated_at" ON "public"."clan_applications";
DROP TRIGGER IF EXISTS "trg_clan_announcements_updated_at" ON "public"."clan_announcements";
DROP TRIGGER IF EXISTS "feature_flag_audit_trigger" ON "public"."feature_flags";
DROP TRIGGER IF EXISTS "conversations_set_updated_at" ON "public"."conversations";
DROP TRIGGER IF EXISTS "conversation_messages_set_updated_at" ON "public"."conversation_messages";
DROP TRIGGER IF EXISTS "conversation_members_set_updated_at" ON "public"."conversation_members";
DROP INDEX IF EXISTS "public"."web_push_subscriptions_user_idx";
DROP INDEX IF EXISTS "public"."web_push_subscriptions_user_endpoint_idx";
DROP INDEX IF EXISTS "public"."idx_users_username_trgm";
DROP INDEX IF EXISTS "public"."idx_users_username";
DROP INDEX IF EXISTS "public"."idx_users_terms_accepted";
DROP INDEX IF EXISTS "public"."idx_users_skill_rating";
DROP INDEX IF EXISTS "public"."idx_users_premium_tier";
DROP INDEX IF EXISTS "public"."idx_users_last_login";
DROP INDEX IF EXISTS "public"."idx_users_is_vip";
DROP INDEX IF EXISTS "public"."idx_users_is_admin";
DROP INDEX IF EXISTS "public"."idx_users_email";
DROP INDEX IF EXISTS "public"."idx_users_created_at";
DROP INDEX IF EXISTS "public"."idx_user_terms_acceptance_unique";
DROP INDEX IF EXISTS "public"."idx_user_sessions_user_id";
DROP INDEX IF EXISTS "public"."idx_user_sessions_started_at";
DROP INDEX IF EXISTS "public"."idx_user_sessions_session_data_gin";
DROP INDEX IF EXISTS "public"."idx_user_sessions_ended_at";
DROP INDEX IF EXISTS "public"."idx_user_sessions_device_info_gin";
DROP INDEX IF EXISTS "public"."idx_user_reports_status";
DROP INDEX IF EXISTS "public"."idx_user_reports_reporter_id";
DROP INDEX IF EXISTS "public"."idx_user_reports_reported_user_id";
DROP INDEX IF EXISTS "public"."idx_user_reports_evidence_gin";
DROP INDEX IF EXISTS "public"."idx_user_reports_admin_id";
DROP INDEX IF EXISTS "public"."idx_user_preferences_user_id";
DROP INDEX IF EXISTS "public"."idx_user_feature_flags_user_id";
DROP INDEX IF EXISTS "public"."idx_user_feature_flags_flag_name";
DROP INDEX IF EXISTS "public"."idx_user_clan_preferences_notifications";
DROP INDEX IF EXISTS "public"."idx_user_blocks_blocker";
DROP INDEX IF EXISTS "public"."idx_user_blocks_blocked";
DROP INDEX IF EXISTS "public"."idx_user_behavior_patterns_user_id";
DROP INDEX IF EXISTS "public"."idx_user_behavior_patterns_pattern_type";
DROP INDEX IF EXISTS "public"."idx_user_behavior_patterns_pattern_data_gin";
DROP INDEX IF EXISTS "public"."idx_user_behavior_patterns_confidence_score";
DROP INDEX IF EXISTS "public"."idx_user_bans_user_id";
DROP INDEX IF EXISTS "public"."idx_user_bans_admin_id";
DROP INDEX IF EXISTS "public"."idx_user_admin_roles_user_id";
DROP INDEX IF EXISTS "public"."idx_user_admin_roles_role_id";
DROP INDEX IF EXISTS "public"."idx_user_admin_roles_assigned_by";
DROP INDEX IF EXISTS "public"."idx_user_achievements_user_id";
DROP INDEX IF EXISTS "public"."idx_user_achievements_progress_data_gin";
DROP INDEX IF EXISTS "public"."idx_user_achievements_achievement_id";
DROP INDEX IF EXISTS "public"."idx_user_account_status_status";
DROP INDEX IF EXISTS "public"."idx_user_account_status_admin_user_id";
DROP INDEX IF EXISTS "public"."idx_territory_modifier_templates_effect_value_gin";
DROP INDEX IF EXISTS "public"."idx_territory_adjacencies_map_id";
DROP INDEX IF EXISTS "public"."idx_skill_leaderboard_cache_rankings_gin";
DROP INDEX IF EXISTS "public"."idx_schema_migrations_status";
DROP INDEX IF EXISTS "public"."idx_schema_migrations_filename";
DROP INDEX IF EXISTS "public"."idx_room_players_user_id";
DROP INDEX IF EXISTS "public"."idx_room_players_unique_color";
DROP INDEX IF EXISTS "public"."idx_room_players_team_id";
DROP INDEX IF EXISTS "public"."idx_room_players_room_id";
DROP INDEX IF EXISTS "public"."idx_room_players_bank";
DROP INDEX IF EXISTS "public"."idx_rating_history_user_id";
DROP INDEX IF EXISTS "public"."idx_rating_history_created_at";
DROP INDEX IF EXISTS "public"."idx_player_stats_user_id";
DROP INDEX IF EXISTS "public"."idx_player_stats_favorite_map_id";
DROP INDEX IF EXISTS "public"."idx_player_game_results_user";
DROP INDEX IF EXISTS "public"."idx_player_game_results_room_position";
DROP INDEX IF EXISTS "public"."idx_pgr_user_wins";
DROP INDEX IF EXISTS "public"."idx_pgr_user_created_at";
DROP INDEX IF EXISTS "public"."idx_password_reset_tokens_user_id";
DROP INDEX IF EXISTS "public"."idx_password_reset_tokens_user_created_at";
DROP INDEX IF EXISTS "public"."idx_password_reset_tokens_token";
DROP INDEX IF EXISTS "public"."idx_password_reset_tokens_expires_at";
DROP INDEX IF EXISTS "public"."idx_notifications_user_unread";
DROP INDEX IF EXISTS "public"."idx_notifications_user_id";
DROP INDEX IF EXISTS "public"."idx_notifications_user_created_at";
DROP INDEX IF EXISTS "public"."idx_notifications_data_gin";
DROP INDEX IF EXISTS "public"."idx_notifications_created_at";
DROP INDEX IF EXISTS "public"."idx_matchmaking_queue_skill_rating";
DROP INDEX IF EXISTS "public"."idx_matchmaking_queue_queue_type";
DROP INDEX IF EXISTS "public"."idx_matchmaking_queue_priority_score";
DROP INDEX IF EXISTS "public"."idx_matchmaking_queue_preferences_gin";
DROP INDEX IF EXISTS "public"."idx_matchmaking_queue_joined_at";
DROP INDEX IF EXISTS "public"."idx_maps_submitted_at";
DROP INDEX IF EXISTS "public"."idx_maps_status";
DROP INDEX IF EXISTS "public"."idx_maps_reviewed_at";
DROP INDEX IF EXISTS "public"."idx_maps_rating_average";
DROP INDEX IF EXISTS "public"."idx_maps_play_count";
DROP INDEX IF EXISTS "public"."idx_maps_name_trgm";
DROP INDEX IF EXISTS "public"."idx_maps_is_vip_only";
DROP INDEX IF EXISTS "public"."idx_maps_is_public";
DROP INDEX IF EXISTS "public"."idx_maps_is_featured";
DROP INDEX IF EXISTS "public"."idx_maps_is_active";
DROP INDEX IF EXISTS "public"."idx_maps_creator_id";
DROP INDEX IF EXISTS "public"."idx_maps_created_by";
DROP INDEX IF EXISTS "public"."idx_maps_created_at";
DROP INDEX IF EXISTS "public"."idx_maps_capital_metadata_gin";
DROP INDEX IF EXISTS "public"."idx_maps_capital_assignments_gin";
DROP INDEX IF EXISTS "public"."idx_map_versions_map_id_version";
DROP INDEX IF EXISTS "public"."idx_map_territory_modifiers_unique";
DROP INDEX IF EXISTS "public"."idx_map_territory_modifiers_map";
DROP INDEX IF EXISTS "public"."idx_map_territories_polygon_data_gin";
DROP INDEX IF EXISTS "public"."idx_map_territories_map_id";
DROP INDEX IF EXISTS "public"."idx_map_territories_capital_for_players_gin";
DROP INDEX IF EXISTS "public"."idx_map_submissions_user_id";
DROP INDEX IF EXISTS "public"."idx_map_submissions_submission_data_gin";
DROP INDEX IF EXISTS "public"."idx_map_submissions_review_status";
DROP INDEX IF EXISTS "public"."idx_map_submission_logs_map_id";
DROP INDEX IF EXISTS "public"."idx_map_sectors_requirements_gin";
DROP INDEX IF EXISTS "public"."idx_map_sectors_map_id";
DROP INDEX IF EXISTS "public"."idx_map_reviews_reviewer_id";
DROP INDEX IF EXISTS "public"."idx_map_reviews_map_id";
DROP INDEX IF EXISTS "public"."idx_map_ratings_map_id";
DROP INDEX IF EXISTS "public"."idx_map_images_staging_user_id";
DROP INDEX IF EXISTS "public"."idx_map_drafts_user_id";
DROP INDEX IF EXISTS "public"."idx_map_collaborators_user";
DROP INDEX IF EXISTS "public"."idx_map_collaborators_map_role";
DROP INDEX IF EXISTS "public"."idx_map_asset_purge_runs_type";
DROP INDEX IF EXISTS "public"."idx_map_approval_requests_version";
DROP INDEX IF EXISTS "public"."idx_map_approval_requests_requester";
DROP INDEX IF EXISTS "public"."idx_map_approval_requests_pending";
DROP INDEX IF EXISTS "public"."idx_map_approval_requests_decision";
DROP INDEX IF EXISTS "public"."idx_game_territory_modifiers_game";
DROP INDEX IF EXISTS "public"."idx_game_states_territories_gin";
DROP INDEX IF EXISTS "public"."idx_game_states_room_id";
DROP INDEX IF EXISTS "public"."idx_game_states_replay_data_gin";
DROP INDEX IF EXISTS "public"."idx_game_states_player_stats_gin";
DROP INDEX IF EXISTS "public"."idx_game_states_phase";
DROP INDEX IF EXISTS "public"."idx_game_states_game_log_gin";
DROP INDEX IF EXISTS "public"."idx_game_states_current_player";
DROP INDEX IF EXISTS "public"."idx_game_states_ai_players_gin";
DROP INDEX IF EXISTS "public"."idx_game_rooms_status";
DROP INDEX IF EXISTS "public"."idx_game_rooms_started_at";
DROP INDEX IF EXISTS "public"."idx_game_rooms_room_code_unique";
DROP INDEX IF EXISTS "public"."idx_game_rooms_map_id";
DROP INDEX IF EXISTS "public"."idx_game_rooms_host_id";
DROP INDEX IF EXISTS "public"."idx_game_rooms_expires_at";
DROP INDEX IF EXISTS "public"."idx_game_rooms_created_at";
DROP INDEX IF EXISTS "public"."idx_game_moves_turn";
DROP INDEX IF EXISTS "public"."idx_game_moves_room_id";
DROP INDEX IF EXISTS "public"."idx_game_moves_player_id";
DROP INDEX IF EXISTS "public"."idx_game_moves_move_data_gin";
DROP INDEX IF EXISTS "public"."idx_friendships_user_id";
DROP INDEX IF EXISTS "public"."idx_friendships_status";
DROP INDEX IF EXISTS "public"."idx_friendships_friend_id";
DROP INDEX IF EXISTS "public"."idx_feature_flags_target_criteria_gin";
DROP INDEX IF EXISTS "public"."idx_feature_flags_is_enabled";
DROP INDEX IF EXISTS "public"."idx_feature_flags_flag_name";
DROP INDEX IF EXISTS "public"."idx_feature_flags_category";
DROP INDEX IF EXISTS "public"."idx_feature_flags_access_level";
DROP INDEX IF EXISTS "public"."idx_feature_flag_audit_flag_name";
DROP INDEX IF EXISTS "public"."idx_feature_flag_audit_created_at";
DROP INDEX IF EXISTS "public"."idx_feature_flag_audit_changed_by";
DROP INDEX IF EXISTS "public"."idx_events_user_id";
DROP INDEX IF EXISTS "public"."idx_events_session_id";
DROP INDEX IF EXISTS "public"."idx_events_event_type";
DROP INDEX IF EXISTS "public"."idx_events_event_data_gin";
DROP INDEX IF EXISTS "public"."idx_events_created_at";
DROP INDEX IF EXISTS "public"."idx_email_verification_logs_user_id";
DROP INDEX IF EXISTS "public"."idx_email_verification_logs_token";
DROP INDEX IF EXISTS "public"."idx_conversations_kind_created_at";
DROP INDEX IF EXISTS "public"."idx_conversations_game_id";
DROP INDEX IF EXISTS "public"."idx_conversations_clan_id";
DROP INDEX IF EXISTS "public"."idx_conversation_messages_sender_created_at";
DROP INDEX IF EXISTS "public"."idx_conversation_messages_json_metadata";
DROP INDEX IF EXISTS "public"."idx_conversation_messages_conversation_created_at";
DROP INDEX IF EXISTS "public"."idx_conversation_members_user_state";
DROP INDEX IF EXISTS "public"."idx_conversation_members_conversation";
DROP INDEX IF EXISTS "public"."idx_clans_tag_trgm";
DROP INDEX IF EXISTS "public"."idx_clans_status";
DROP INDEX IF EXISTS "public"."idx_clans_region";
DROP INDEX IF EXISTS "public"."idx_clans_privacy";
DROP INDEX IF EXISTS "public"."idx_clans_owner";
DROP INDEX IF EXISTS "public"."idx_clans_name_trgm";
DROP INDEX IF EXISTS "public"."idx_clans_description_trgm";
DROP INDEX IF EXISTS "public"."idx_clans_created_at";
DROP INDEX IF EXISTS "public"."idx_clan_wars_status";
DROP INDEX IF EXISTS "public"."idx_clan_wars_clan_b";
DROP INDEX IF EXISTS "public"."idx_clan_wars_clan_a";
DROP INDEX IF EXISTS "public"."idx_clan_war_matches_war";
DROP INDEX IF EXISTS "public"."idx_clan_war_matches_result";
DROP INDEX IF EXISTS "public"."idx_clan_roles_name_unique";
DROP INDEX IF EXISTS "public"."idx_clan_roles_clan_id_lower_name";
DROP INDEX IF EXISTS "public"."idx_clan_roles_clan";
DROP INDEX IF EXISTS "public"."idx_clan_objectives_window";
DROP INDEX IF EXISTS "public"."idx_clan_objectives_clan";
DROP INDEX IF EXISTS "public"."idx_clan_members_user";
DROP INDEX IF EXISTS "public"."idx_clan_members_status";
DROP INDEX IF EXISTS "public"."idx_clan_members_clan";
DROP INDEX IF EXISTS "public"."idx_clan_members_active_user";
DROP INDEX IF EXISTS "public"."idx_clan_join_requests_user";
DROP INDEX IF EXISTS "public"."idx_clan_join_requests_status";
DROP INDEX IF EXISTS "public"."idx_clan_join_requests_pending_unique";
DROP INDEX IF EXISTS "public"."idx_clan_join_requests_clan";
DROP INDEX IF EXISTS "public"."idx_clan_invitations_user";
DROP INDEX IF EXISTS "public"."idx_clan_invitations_status";
DROP INDEX IF EXISTS "public"."idx_clan_invitations_clan";
DROP INDEX IF EXISTS "public"."idx_clan_chat_messages_user";
DROP INDEX IF EXISTS "public"."idx_clan_chat_messages_clan_created";
DROP INDEX IF EXISTS "public"."idx_clan_applications_user";
DROP INDEX IF EXISTS "public"."idx_clan_applications_status";
DROP INDEX IF EXISTS "public"."idx_clan_applications_pending_unique";
DROP INDEX IF EXISTS "public"."idx_clan_applications_clan";
DROP INDEX IF EXISTS "public"."idx_clan_announcements_pinned";
DROP INDEX IF EXISTS "public"."idx_clan_announcements_clan";
DROP INDEX IF EXISTS "public"."idx_clan_activity_clan_created_at";
DROP INDEX IF EXISTS "public"."idx_clan_activity_action";
DROP INDEX IF EXISTS "public"."idx_admin_roles_name";
DROP INDEX IF EXISTS "public"."idx_admin_notifications_admin_id";
DROP INDEX IF EXISTS "public"."idx_admin_activity_logs_created_at";
DROP INDEX IF EXISTS "public"."idx_admin_activity_logs_admin_user_id";
DROP INDEX IF EXISTS "public"."idx_admin_activity_logs_action_details_gin";
DROP INDEX IF EXISTS "public"."idx_achievements_unlock_criteria_gin";
DROP INDEX IF EXISTS "public"."idx_achievements_category";
ALTER TABLE IF EXISTS ONLY "public"."web_push_subscriptions" DROP CONSTRAINT IF EXISTS "web_push_subscriptions_pkey";
ALTER TABLE IF EXISTS ONLY "public"."users" DROP CONSTRAINT IF EXISTS "users_username_key";
ALTER TABLE IF EXISTS ONLY "public"."users" DROP CONSTRAINT IF EXISTS "users_pkey";
ALTER TABLE IF EXISTS ONLY "public"."users" DROP CONSTRAINT IF EXISTS "users_email_key";
ALTER TABLE IF EXISTS ONLY "public"."user_terms_acceptance" DROP CONSTRAINT IF EXISTS "user_terms_acceptance_user_id_feature_type_terms_version_key";
ALTER TABLE IF EXISTS ONLY "public"."user_terms_acceptance" DROP CONSTRAINT IF EXISTS "user_terms_acceptance_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_reports" DROP CONSTRAINT IF EXISTS "user_reports_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_preferences" DROP CONSTRAINT IF EXISTS "user_preferences_user_id_key";
ALTER TABLE IF EXISTS ONLY "public"."user_preferences" DROP CONSTRAINT IF EXISTS "user_preferences_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_feature_flags" DROP CONSTRAINT IF EXISTS "user_feature_flags_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_clan_preferences" DROP CONSTRAINT IF EXISTS "user_clan_preferences_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_blocks" DROP CONSTRAINT IF EXISTS "user_blocks_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_blocks" DROP CONSTRAINT IF EXISTS "user_blocks_blocker_id_blocked_id_key";
ALTER TABLE IF EXISTS ONLY "public"."user_behavior_patterns" DROP CONSTRAINT IF EXISTS "user_behavior_patterns_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_bans" DROP CONSTRAINT IF EXISTS "user_bans_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_admin_roles" DROP CONSTRAINT IF EXISTS "user_admin_roles_user_id_role_id_key";
ALTER TABLE IF EXISTS ONLY "public"."user_admin_roles" DROP CONSTRAINT IF EXISTS "user_admin_roles_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_achievements" DROP CONSTRAINT IF EXISTS "user_achievements_user_id_achievement_id_key";
ALTER TABLE IF EXISTS ONLY "public"."user_achievements" DROP CONSTRAINT IF EXISTS "user_achievements_pkey";
ALTER TABLE IF EXISTS ONLY "public"."user_account_status" DROP CONSTRAINT IF EXISTS "user_account_status_user_id_key";
ALTER TABLE IF EXISTS ONLY "public"."user_account_status" DROP CONSTRAINT IF EXISTS "user_account_status_pkey";
ALTER TABLE IF EXISTS ONLY "public"."territory_modifier_templates" DROP CONSTRAINT IF EXISTS "territory_modifier_templates_pkey";
ALTER TABLE IF EXISTS ONLY "public"."territory_modifier_templates" DROP CONSTRAINT IF EXISTS "territory_modifier_templates_name_key";
ALTER TABLE IF EXISTS ONLY "public"."territory_adjacencies" DROP CONSTRAINT IF EXISTS "territory_adjacencies_pkey";
ALTER TABLE IF EXISTS ONLY "public"."territory_adjacencies" DROP CONSTRAINT IF EXISTS "territory_adjacencies_map_id_territory_from_territory_to_key";
ALTER TABLE IF EXISTS ONLY "public"."skill_leaderboard_cache" DROP CONSTRAINT IF EXISTS "skill_leaderboard_cache_pkey";
ALTER TABLE IF EXISTS ONLY "public"."skill_leaderboard_cache" DROP CONSTRAINT IF EXISTS "skill_leaderboard_cache_period_type_period_start_period_end_key";
ALTER TABLE IF EXISTS ONLY "public"."schema_migrations" DROP CONSTRAINT IF EXISTS "schema_migrations_pkey";
ALTER TABLE IF EXISTS ONLY "public"."schema_migrations" DROP CONSTRAINT IF EXISTS "schema_migrations_filename_key";
ALTER TABLE IF EXISTS ONLY "public"."room_players" DROP CONSTRAINT IF EXISTS "room_players_room_id_user_id_key";
ALTER TABLE IF EXISTS ONLY "public"."room_players" DROP CONSTRAINT IF EXISTS "room_players_room_id_player_order_key";
ALTER TABLE IF EXISTS ONLY "public"."room_players" DROP CONSTRAINT IF EXISTS "room_players_pkey";
ALTER TABLE IF EXISTS ONLY "public"."rating_history" DROP CONSTRAINT IF EXISTS "rating_history_pkey";
ALTER TABLE IF EXISTS ONLY "public"."player_stats" DROP CONSTRAINT IF EXISTS "player_stats_user_id_key";
ALTER TABLE IF EXISTS ONLY "public"."player_stats" DROP CONSTRAINT IF EXISTS "player_stats_pkey";
ALTER TABLE IF EXISTS ONLY "public"."player_game_results" DROP CONSTRAINT IF EXISTS "player_game_results_room_id_user_id_key";
ALTER TABLE IF EXISTS ONLY "public"."player_game_results" DROP CONSTRAINT IF EXISTS "player_game_results_pkey";
ALTER TABLE IF EXISTS ONLY "public"."password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_token_key";
ALTER TABLE IF EXISTS ONLY "public"."password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_pkey";
ALTER TABLE IF EXISTS ONLY "public"."notifications" DROP CONSTRAINT IF EXISTS "notifications_pkey";
ALTER TABLE IF EXISTS ONLY "public"."matchmaking_queue" DROP CONSTRAINT IF EXISTS "matchmaking_queue_pkey";
ALTER TABLE IF EXISTS ONLY "public"."maps" DROP CONSTRAINT IF EXISTS "maps_pkey";
ALTER TABLE IF EXISTS ONLY "public"."maps" DROP CONSTRAINT IF EXISTS "maps_name_key";
ALTER TABLE IF EXISTS ONLY "public"."map_versions" DROP CONSTRAINT IF EXISTS "map_versions_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_territory_modifiers" DROP CONSTRAINT IF EXISTS "map_territory_modifiers_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_territories" DROP CONSTRAINT IF EXISTS "map_territories_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_territories" DROP CONSTRAINT IF EXISTS "map_territories_map_id_name_key";
ALTER TABLE IF EXISTS ONLY "public"."map_submissions" DROP CONSTRAINT IF EXISTS "map_submissions_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_submission_logs" DROP CONSTRAINT IF EXISTS "map_submission_logs_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_reviews" DROP CONSTRAINT IF EXISTS "map_reviews_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_reviews" DROP CONSTRAINT IF EXISTS "map_reviews_map_id_reviewer_id_key";
ALTER TABLE IF EXISTS ONLY "public"."map_ratings" DROP CONSTRAINT IF EXISTS "map_ratings_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_ratings" DROP CONSTRAINT IF EXISTS "map_ratings_map_id_user_id_key";
ALTER TABLE IF EXISTS ONLY "public"."map_images_staging" DROP CONSTRAINT IF EXISTS "map_images_staging_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_drafts" DROP CONSTRAINT IF EXISTS "map_drafts_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_sectors" DROP CONSTRAINT IF EXISTS "map_continents_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_sectors" DROP CONSTRAINT IF EXISTS "map_continents_map_id_name_key";
ALTER TABLE IF EXISTS ONLY "public"."map_collaborators" DROP CONSTRAINT IF EXISTS "map_collaborators_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_asset_purge_runs" DROP CONSTRAINT IF EXISTS "map_asset_purge_runs_pkey";
ALTER TABLE IF EXISTS ONLY "public"."map_approval_requests" DROP CONSTRAINT IF EXISTS "map_approval_requests_pkey";
ALTER TABLE IF EXISTS ONLY "public"."game_territory_modifiers" DROP CONSTRAINT IF EXISTS "game_territory_modifiers_pkey";
ALTER TABLE IF EXISTS ONLY "public"."game_states" DROP CONSTRAINT IF EXISTS "game_states_room_id_key";
ALTER TABLE IF EXISTS ONLY "public"."game_states" DROP CONSTRAINT IF EXISTS "game_states_pkey";
ALTER TABLE IF EXISTS ONLY "public"."game_rooms" DROP CONSTRAINT IF EXISTS "game_rooms_pkey";
ALTER TABLE IF EXISTS ONLY "public"."game_results" DROP CONSTRAINT IF EXISTS "game_results_pkey";
ALTER TABLE IF EXISTS ONLY "public"."game_moves" DROP CONSTRAINT IF EXISTS "game_moves_pkey";
ALTER TABLE IF EXISTS ONLY "public"."friendships" DROP CONSTRAINT IF EXISTS "friendships_user_id_friend_id_key";
ALTER TABLE IF EXISTS ONLY "public"."friendships" DROP CONSTRAINT IF EXISTS "friendships_pkey";
ALTER TABLE IF EXISTS ONLY "public"."feature_flags" DROP CONSTRAINT IF EXISTS "feature_flags_pkey";
ALTER TABLE IF EXISTS ONLY "public"."feature_flags" DROP CONSTRAINT IF EXISTS "feature_flags_flag_name_key";
ALTER TABLE IF EXISTS ONLY "public"."feature_flag_audit" DROP CONSTRAINT IF EXISTS "feature_flag_audit_pkey";
ALTER TABLE IF EXISTS ONLY "public"."events" DROP CONSTRAINT IF EXISTS "events_pkey";
ALTER TABLE IF EXISTS ONLY "public"."email_verification_logs" DROP CONSTRAINT IF EXISTS "email_verification_logs_token_key";
ALTER TABLE IF EXISTS ONLY "public"."email_verification_logs" DROP CONSTRAINT IF EXISTS "email_verification_logs_pkey";
ALTER TABLE IF EXISTS ONLY "public"."conversations" DROP CONSTRAINT IF EXISTS "conversations_pkey";
ALTER TABLE IF EXISTS ONLY "public"."conversation_messages" DROP CONSTRAINT IF EXISTS "conversation_messages_pkey";
ALTER TABLE IF EXISTS ONLY "public"."conversation_members" DROP CONSTRAINT IF EXISTS "conversation_members_pkey";
ALTER TABLE IF EXISTS ONLY "public"."conversation_members" DROP CONSTRAINT IF EXISTS "conversation_members_conversation_id_user_id_key";
ALTER TABLE IF EXISTS ONLY "public"."clans" DROP CONSTRAINT IF EXISTS "clans_tag_unique";
ALTER TABLE IF EXISTS ONLY "public"."clans" DROP CONSTRAINT IF EXISTS "clans_slug_unique";
ALTER TABLE IF EXISTS ONLY "public"."clans" DROP CONSTRAINT IF EXISTS "clans_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_wars" DROP CONSTRAINT IF EXISTS "clan_wars_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_war_matches" DROP CONSTRAINT IF EXISTS "clan_war_matches_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_roles" DROP CONSTRAINT IF EXISTS "clan_roles_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_roles" DROP CONSTRAINT IF EXISTS "clan_roles_hierarchy_unique";
ALTER TABLE IF EXISTS ONLY "public"."clan_objectives" DROP CONSTRAINT IF EXISTS "clan_objectives_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_members" DROP CONSTRAINT IF EXISTS "clan_members_unique";
ALTER TABLE IF EXISTS ONLY "public"."clan_members" DROP CONSTRAINT IF EXISTS "clan_members_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_join_requests" DROP CONSTRAINT IF EXISTS "clan_join_requests_token_key";
ALTER TABLE IF EXISTS ONLY "public"."clan_join_requests" DROP CONSTRAINT IF EXISTS "clan_join_requests_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_invitations" DROP CONSTRAINT IF EXISTS "clan_invitations_token_unique";
ALTER TABLE IF EXISTS ONLY "public"."clan_invitations" DROP CONSTRAINT IF EXISTS "clan_invitations_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_chat_messages" DROP CONSTRAINT IF EXISTS "clan_chat_messages_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_applications" DROP CONSTRAINT IF EXISTS "clan_applications_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_announcements" DROP CONSTRAINT IF EXISTS "clan_announcements_pkey";
ALTER TABLE IF EXISTS ONLY "public"."clan_activity_log" DROP CONSTRAINT IF EXISTS "clan_activity_log_pkey";
ALTER TABLE IF EXISTS ONLY "public"."capital_eliminations" DROP CONSTRAINT IF EXISTS "capital_eliminations_pkey";
ALTER TABLE IF EXISTS ONLY "public"."admin_roles" DROP CONSTRAINT IF EXISTS "admin_roles_pkey";
ALTER TABLE IF EXISTS ONLY "public"."admin_roles" DROP CONSTRAINT IF EXISTS "admin_roles_name_key";
ALTER TABLE IF EXISTS ONLY "public"."admin_notifications" DROP CONSTRAINT IF EXISTS "admin_notifications_pkey";
ALTER TABLE IF EXISTS ONLY "public"."admin_activity_logs" DROP CONSTRAINT IF EXISTS "admin_activity_logs_pkey";
ALTER TABLE IF EXISTS ONLY "public"."achievements" DROP CONSTRAINT IF EXISTS "achievements_pkey";
ALTER TABLE IF EXISTS ONLY "public"."achievements" DROP CONSTRAINT IF EXISTS "achievements_name_key";
ALTER TABLE IF EXISTS "public"."web_push_subscriptions" ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "public"."web_push_subscriptions_id_seq";
DROP TABLE IF EXISTS "public"."web_push_subscriptions";
DROP TABLE IF EXISTS "public"."user_terms_acceptance";
DROP TABLE IF EXISTS "public"."user_sessions";
DROP TABLE IF EXISTS "public"."user_reports";
DROP VIEW IF EXISTS "public"."user_messaging_settings";
DROP TABLE IF EXISTS "public"."user_preferences";
DROP TABLE IF EXISTS "public"."user_feature_flags";
DROP TABLE IF EXISTS "public"."user_clan_preferences";
DROP TABLE IF EXISTS "public"."user_blocks";
DROP TABLE IF EXISTS "public"."user_behavior_patterns";
DROP TABLE IF EXISTS "public"."user_bans";
DROP TABLE IF EXISTS "public"."user_admin_roles";
DROP TABLE IF EXISTS "public"."user_achievements";
DROP TABLE IF EXISTS "public"."territory_modifier_templates";
DROP TABLE IF EXISTS "public"."territory_adjacencies";
DROP TABLE IF EXISTS "public"."skill_leaderboard_cache";
DROP TABLE IF EXISTS "public"."schema_migrations";
DROP TABLE IF EXISTS "public"."rating_history";
DROP TABLE IF EXISTS "public"."player_game_results";
DROP TABLE IF EXISTS "public"."password_reset_tokens";
DROP TABLE IF EXISTS "public"."notifications";
DROP TABLE IF EXISTS "public"."matchmaking_queue";
DROP TABLE IF EXISTS "public"."map_versions";
DROP TABLE IF EXISTS "public"."map_territory_modifiers";
DROP TABLE IF EXISTS "public"."map_territories";
DROP TABLE IF EXISTS "public"."map_submissions";
DROP TABLE IF EXISTS "public"."map_submission_logs";
DROP TABLE IF EXISTS "public"."map_sectors";
DROP TABLE IF EXISTS "public"."map_reviews";
DROP TABLE IF EXISTS "public"."map_ratings";
DROP TABLE IF EXISTS "public"."map_images_staging";
DROP TABLE IF EXISTS "public"."map_drafts";
DROP TABLE IF EXISTS "public"."map_collaborators";
DROP TABLE IF EXISTS "public"."map_asset_purge_runs";
DROP TABLE IF EXISTS "public"."map_approval_requests";
DROP TABLE IF EXISTS "public"."game_territory_modifiers";
DROP TABLE IF EXISTS "public"."game_states";
DROP TABLE IF EXISTS "public"."game_results";
DROP TABLE IF EXISTS "public"."game_moves";
DROP TABLE IF EXISTS "public"."friendships";
DROP TABLE IF EXISTS "public"."feature_flags";
DROP TABLE IF EXISTS "public"."feature_flag_audit";
DROP TABLE IF EXISTS "public"."events";
DROP TABLE IF EXISTS "public"."email_verification_logs";
DROP TABLE IF EXISTS "public"."conversations";
DROP TABLE IF EXISTS "public"."conversation_messages";
DROP TABLE IF EXISTS "public"."conversation_members";
DROP TABLE IF EXISTS "public"."clans";
DROP TABLE IF EXISTS "public"."clan_wars";
DROP TABLE IF EXISTS "public"."clan_war_matches";
DROP TABLE IF EXISTS "public"."clan_roles";
DROP TABLE IF EXISTS "public"."clan_objectives";
DROP TABLE IF EXISTS "public"."clan_members";
DROP TABLE IF EXISTS "public"."clan_join_requests";
DROP TABLE IF EXISTS "public"."clan_invitations";
DROP TABLE IF EXISTS "public"."clan_chat_messages";
DROP TABLE IF EXISTS "public"."clan_applications";
DROP TABLE IF EXISTS "public"."clan_announcements";
DROP TABLE IF EXISTS "public"."clan_activity_log";
DROP TABLE IF EXISTS "public"."capital_eliminations";
DROP VIEW IF EXISTS "public"."admin_user_overview";
DROP TABLE IF EXISTS "public"."users";
DROP TABLE IF EXISTS "public"."user_account_status";
DROP TABLE IF EXISTS "public"."room_players";
DROP TABLE IF EXISTS "public"."player_stats";
DROP TABLE IF EXISTS "public"."maps";
DROP TABLE IF EXISTS "public"."game_rooms";
DROP SEQUENCE IF EXISTS "public"."game_room_code_seq";
DROP TABLE IF EXISTS "public"."admin_roles";
DROP TABLE IF EXISTS "public"."admin_notifications";
DROP TABLE IF EXISTS "public"."admin_activity_logs";
DROP TABLE IF EXISTS "public"."achievements";
DROP FUNCTION IF EXISTS "public"."update_web_push_subscriptions_updated_at"();
DROP FUNCTION IF EXISTS "public"."update_user_preferences_updated_at"();
DROP FUNCTION IF EXISTS "public"."update_updated_at_column"();
DROP FUNCTION IF EXISTS "public"."update_map_reviews_updated_at"();
DROP FUNCTION IF EXISTS "public"."update_map_approval_requests_updated_at"();
DROP FUNCTION IF EXISTS "public"."revoke_vip_status"("target_user_id" "uuid");
DROP FUNCTION IF EXISTS "public"."log_feature_flag_change"();
DROP FUNCTION IF EXISTS "public"."grant_vip_status"("target_user_id" "uuid", "granting_admin_id" "uuid", "reason" "text");
DROP FUNCTION IF EXISTS "public"."generate_ulid"();
DROP TYPE IF EXISTS "public"."conversation_member_role";
DROP TYPE IF EXISTS "public"."conversation_kind";
DROP SCHEMA IF EXISTS "public";
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "public";


--
-- Name: conversation_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."conversation_kind" AS ENUM (
    'game',
    'direct',
    'group',
    'team'
);


--
-- Name: conversation_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."conversation_member_role" AS ENUM (
    'owner',
    'admin',
    'member'
);


--
-- Name: generate_ulid(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."generate_ulid"() RETURNS character
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  timestamp_ms NUMERIC := floor(extract(epoch FROM clock_timestamp()) * 1000);
  random_component BYTEA := gen_random_bytes(10);
  base32_alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  ulid_value NUMERIC;
  encoded TEXT := '';
  i INT;
  remainder INT;
BEGIN
  ulid_value := timestamp_ms * power(2::numeric, 80);

  FOR i IN 0..9 LOOP
    ulid_value := ulid_value + get_byte(random_component, i) * power(2::numeric, (9 - i) * 8);
  END LOOP;

  FOR i IN 1..26 LOOP
    remainder := mod(ulid_value, 32)::INT;
    encoded := substr(base32_alphabet, remainder + 1, 1) || encoded;
    ulid_value := floor(ulid_value / 32);
  END LOOP;

  RETURN encoded::CHAR(26);
END;
$$;


--
-- Name: grant_vip_status("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."grant_vip_status"("target_user_id" "uuid", "granting_admin_id" "uuid", "reason" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE users
    SET 
        is_vip = true,
        vip_granted_at = CURRENT_TIMESTAMP,
        vip_granted_by = granting_admin_id,
        vip_reason = reason
    WHERE id = target_user_id;
    
    RETURN FOUND;
END;
$$;


--
-- Name: log_feature_flag_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."log_feature_flag_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO feature_flag_audit (flag_name, changed_by, change_type, new_value)
    VALUES (NEW.flag_name, NEW.created_by, 'created', row_to_json(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_enabled != NEW.is_enabled THEN
      INSERT INTO feature_flag_audit (flag_name, changed_by, change_type, old_value, new_value)
      VALUES (NEW.flag_name, NEW.created_by, 'toggled', row_to_json(OLD), row_to_json(NEW));
    ELSE
      INSERT INTO feature_flag_audit (flag_name, changed_by, change_type, old_value, new_value)
      VALUES (NEW.flag_name, NEW.created_by, 'updated', row_to_json(OLD), row_to_json(NEW));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO feature_flag_audit (flag_name, changed_by, change_type, old_value)
    VALUES (OLD.flag_name, OLD.created_by, 'deleted', row_to_json(OLD));
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: revoke_vip_status("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."revoke_vip_status"("target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE users
    SET 
        is_vip = false,
        vip_granted_at = NULL,
        vip_granted_by = NULL,
        vip_reason = NULL
    WHERE id = target_user_id;
    
    RETURN FOUND;
END;
$$;


--
-- Name: update_map_approval_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_map_approval_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$;


--
-- Name: update_map_reviews_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_map_reviews_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_user_preferences_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_user_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_web_push_subscriptions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_web_push_subscriptions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."achievements" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text" NOT NULL,
    "category" character varying(50) DEFAULT 'general'::character varying NOT NULL,
    "icon" character varying(100),
    "points" integer DEFAULT 0 NOT NULL,
    "rarity" character varying(20) DEFAULT 'common'::character varying NOT NULL,
    "unlock_criteria" "jsonb" NOT NULL,
    "is_secret" boolean DEFAULT false NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "achievements_points_non_negative" CHECK (("points" >= 0)),
    CONSTRAINT "achievements_rarity_check" CHECK ((("rarity")::"text" = ANY ((ARRAY['common'::character varying, 'uncommon'::character varying, 'rare'::character varying, 'epic'::character varying, 'legendary'::character varying])::"text"[])))
);


--
-- Name: admin_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_activity_logs" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "action_type" character varying(50) NOT NULL,
    "action_details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "target_type" character varying(50),
    "target_id" "uuid",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_notifications" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "admin_id" "uuid",
    "type" character varying(64) NOT NULL,
    "title" character varying(255) NOT NULL,
    "message" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "read_at" timestamp without time zone
);


--
-- Name: admin_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_roles" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "description" "text",
    "permissions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: game_room_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."game_room_code_seq"
    START WITH 10000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: game_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_rooms" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "host_id" "uuid" NOT NULL,
    "map_id" "uuid" NOT NULL,
    "max_players" integer DEFAULT 6 NOT NULL,
    "is_private" boolean DEFAULT false NOT NULL,
    "password_hash" character varying(255),
    "status" character varying(20) DEFAULT 'waiting'::character varying NOT NULL,
    "game_mode" character varying(20) DEFAULT 'classic'::character varying NOT NULL,
    "turn_timer" integer DEFAULT 86400 NOT NULL,
    "team_mode" boolean DEFAULT false NOT NULL,
    "number_of_teams" integer,
    "is_ranked" boolean DEFAULT true NOT NULL,
    "spectators_allowed" boolean DEFAULT false NOT NULL,
    "replay_available" boolean DEFAULT true NOT NULL,
    "started_at" timestamp without time zone,
    "ended_at" timestamp without time zone,
    "winner_id" "uuid",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lifecycle_phase" character varying(32) DEFAULT 'lobby'::character varying NOT NULL,
    "turn_number" integer DEFAULT 0 NOT NULL,
    "current_turn_user_id" "uuid",
    "turn_expires_at" timestamp with time zone,
    "ready_check_started_at" timestamp with time zone,
    "treasure_config" "jsonb",
    "movement_type" "text",
    "fog_of_war" "text",
    "expires_at" timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + '30 days'::interval),
    "room_code" bigint DEFAULT "nextval"('"public"."game_room_code_seq"'::"regclass"),
    "time_bank_seconds" integer DEFAULT 0 NOT NULL,
    "grace_window_seconds" integer DEFAULT 20 NOT NULL,
    "grace_actor_user_id" "uuid",
    "grace_expires_at" timestamp without time zone,
    "replacement_pending_user_id" "uuid",
    CONSTRAINT "game_rooms_expires_after_created_check" CHECK ((("expires_at" IS NULL) OR ("expires_at" >= "created_at"))),
    CONSTRAINT "game_rooms_max_players_check" CHECK ((("max_players" >= 2) AND ("max_players" <= 12))),
    CONSTRAINT "game_rooms_mode_check" CHECK ((("game_mode")::"text" = ANY ((ARRAY['classic'::character varying, 'capital'::character varying, 'team'::character varying])::"text"[]))),
    CONSTRAINT "game_rooms_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['lobby'::character varying, 'initializing'::character varying, 'active'::character varying, 'completed'::character varying, 'paused'::character varying, 'abandoned'::character varying])::"text"[]))),
    CONSTRAINT "game_rooms_team_check" CHECK (((("team_mode" = false) AND ("number_of_teams" IS NULL)) OR (("team_mode" = true) AND ("number_of_teams" >= 2) AND ("number_of_teams" <= 6)))),
    CONSTRAINT "game_rooms_turn_timer_check" CHECK ((("turn_timer" >= 10) AND ("turn_timer" <= 86400)))
);


--
-- Name: maps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."maps" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "image_url" character varying(500),
    "min_players" integer DEFAULT 2 NOT NULL,
    "max_players" integer DEFAULT 8 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "creator_id" "uuid",
    "capital_assignments" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "capital_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "image_width" integer,
    "image_height" integer,
    "is_public" boolean DEFAULT true,
    "tags" "text"[],
    "capital_territories" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "status" character varying(20) DEFAULT 'draft'::character varying,
    "is_vip_only" boolean DEFAULT false,
    "min_premium_tier" character varying(20) DEFAULT NULL::character varying,
    "is_featured" boolean DEFAULT false,
    "rating_average" numeric(3,2) DEFAULT NULL::numeric,
    "rating_count" integer DEFAULT 0,
    "play_count" integer DEFAULT 0,
    "version" integer DEFAULT 1 NOT NULL,
    "parent_map_id" "uuid",
    "download_count" integer DEFAULT 0 NOT NULL,
    "submitted_at" timestamp without time zone,
    "reviewed_at" timestamp without time zone,
    "reviewed_by" "uuid",
    "review_notes" "text",
    "rejection_reason" "text",
    CONSTRAINT "maps_download_count_check" CHECK (("download_count" >= 0)),
    CONSTRAINT "maps_min_premium_tier_check" CHECK ((("min_premium_tier")::"text" = ANY ((ARRAY[NULL::character varying, 'free'::character varying, 'premium'::character varying, 'pro'::character varying, 'enterprise'::character varying])::"text"[]))),
    CONSTRAINT "maps_name_length" CHECK (("length"(("name")::"text") >= 3)),
    CONSTRAINT "maps_play_count_check" CHECK (("play_count" >= 0)),
    CONSTRAINT "maps_player_count" CHECK ((("min_players" >= 2) AND ("max_players" <= 12) AND ("min_players" <= "max_players"))),
    CONSTRAINT "maps_rating_average_check" CHECK ((("rating_average" >= (1)::numeric) AND ("rating_average" <= (5)::numeric))),
    CONSTRAINT "maps_rating_count_check" CHECK (("rating_count" >= 0)),
    CONSTRAINT "maps_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'pending_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'archived'::character varying])::"text"[]))),
    CONSTRAINT "maps_version_check" CHECK (("version" >= 1))
);


--
-- Name: COLUMN "maps"."is_vip_only"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."maps"."is_vip_only" IS 'Map only accessible to VIP users';


--
-- Name: COLUMN "maps"."min_premium_tier"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."maps"."min_premium_tier" IS 'Minimum premium tier required to access this map';


--
-- Name: COLUMN "maps"."is_featured"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."maps"."is_featured" IS 'Admin-controlled flag to highlight quality maps';


--
-- Name: COLUMN "maps"."rating_average"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."maps"."rating_average" IS 'Average rating from 1-5, calculated from map_reviews';


--
-- Name: COLUMN "maps"."rating_count"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."maps"."rating_count" IS 'Number of ratings received';


--
-- Name: COLUMN "maps"."play_count"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."maps"."play_count" IS 'Number of times this map has been played';


--
-- Name: player_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."player_stats" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "games_played" integer DEFAULT 0 NOT NULL,
    "games_won" integer DEFAULT 0 NOT NULL,
    "games_lost" integer DEFAULT 0 NOT NULL,
    "total_eliminations" integer DEFAULT 0 NOT NULL,
    "total_territories_conquered" integer DEFAULT 0 NOT NULL,
    "longest_win_streak" integer DEFAULT 0 NOT NULL,
    "current_win_streak" integer DEFAULT 0 NOT NULL,
    "favorite_map_id" "uuid",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "player_stats_games_consistency" CHECK (("games_played" >= ("games_won" + "games_lost"))),
    CONSTRAINT "player_stats_non_negative" CHECK ((("games_played" >= 0) AND ("games_won" >= 0) AND ("games_lost" >= 0) AND ("total_eliminations" >= 0) AND ("total_territories_conquered" >= 0) AND ("longest_win_streak" >= 0) AND ("current_win_streak" >= 0)))
);


--
-- Name: room_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."room_players" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "joined_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "left_at" timestamp without time zone,
    "player_order" integer,
    "is_eliminated" boolean DEFAULT false NOT NULL,
    "elimination_reason" character varying(50),
    "team_id" integer,
    "is_ready" boolean DEFAULT false NOT NULL,
    "ready_at" timestamp with time zone,
    "is_ai" boolean DEFAULT false NOT NULL,
    "ai_difficulty" character varying(20),
    "ai_personality_seed" integer,
    "ai_player_id" "uuid",
    "selected_color" character varying(50),
    "time_bank_seconds_remaining" integer,
    "is_kicked" boolean DEFAULT false NOT NULL,
    "missed_turns" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "room_players_ai_difficulty_check" CHECK ((("ai_difficulty" IS NULL) OR (("ai_difficulty")::"text" = ANY ((ARRAY['recruit'::character varying, 'commander'::character varying, 'grandmaster'::character varying])::"text"[])))),
    CONSTRAINT "room_players_elimination_reason_check" CHECK (((("elimination_reason")::"text" = ANY ((ARRAY['defeated'::character varying, 'timeout'::character varying, 'disconnected'::character varying, 'abandoned'::character varying])::"text"[])) OR ("elimination_reason" IS NULL)))
);


--
-- Name: user_account_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_account_status" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "reason" "text",
    "admin_user_id" "uuid",
    "status_changed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expires_at" timestamp without time zone,
    CONSTRAINT "account_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'banned'::character varying, 'under_review'::character varying])::"text"[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."users" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "username" "public"."citext" NOT NULL,
    "email" "public"."citext" NOT NULL,
    "password_hash" character varying(255) NOT NULL,
    "skill_rating" integer DEFAULT 1000 NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "email_verified" boolean DEFAULT false NOT NULL,
    "verification_token" character varying(255),
    "last_login" timestamp without time zone,
    "timezone" character varying(50),
    "preferred_language" character varying(10) DEFAULT 'en'::character varying,
    "marketing_consent" boolean DEFAULT false NOT NULL,
    "data_retention_consent" boolean DEFAULT true NOT NULL,
    "subscription_status" character varying(20) DEFAULT 'free'::character varying NOT NULL,
    "subscription_expires_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "terms_accepted_at" timestamp without time zone,
    "terms_version" character varying(20),
    "privacy_accepted_at" timestamp without time zone,
    "privacy_version" character varying(20),
    "cookie_consent" boolean DEFAULT false,
    "cookie_consent_at" timestamp without time zone,
    "is_vip" boolean DEFAULT false,
    "premium_tier" character varying(20) DEFAULT 'free'::character varying,
    "vip_granted_at" timestamp without time zone,
    "vip_granted_by" "uuid",
    "vip_reason" "text",
    "premium_expires_at" timestamp without time zone,
    "is_beta_user" boolean DEFAULT false,
    "bio" "text",
    "deleted_at" timestamp without time zone,
    "tagline" "text" DEFAULT 'Commander of the Conquest Realms'::"text",
    CONSTRAINT "users_premium_tier_check" CHECK ((("premium_tier")::"text" = ANY ((ARRAY['free'::character varying, 'premium'::character varying, 'pro'::character varying, 'enterprise'::character varying])::"text"[]))),
    CONSTRAINT "users_skill_rating_check" CHECK ((("skill_rating" >= 0) AND ("skill_rating" <= 5000))),
    CONSTRAINT "users_subscription_status_check" CHECK ((("subscription_status")::"text" = ANY ((ARRAY['free'::character varying, 'premium_monthly'::character varying, 'premium_yearly'::character varying, 'lifetime'::character varying])::"text"[]))),
    CONSTRAINT "users_username_length" CHECK (("length"(("username")::"text") >= 3))
);


--
-- Name: COLUMN "users"."is_admin"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."is_admin" IS 'Quick admin check flag, synced with user_admin_roles';


--
-- Name: COLUMN "users"."email_verified"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."email_verified" IS 'Boolean indicating if user has verified their email address via verification link';


--
-- Name: COLUMN "users"."is_vip"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."is_vip" IS 'VIP status for special users (friends, testers, early access)';


--
-- Name: COLUMN "users"."premium_tier"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."premium_tier" IS 'User subscription tier: free, premium, pro, enterprise';


--
-- Name: COLUMN "users"."vip_granted_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."vip_granted_at" IS 'When VIP status was granted';


--
-- Name: COLUMN "users"."vip_granted_by"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."vip_granted_by" IS 'Admin who granted VIP status';


--
-- Name: COLUMN "users"."vip_reason"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."vip_reason" IS 'Reason for VIP status (friend, tester, contributor, etc.)';


--
-- Name: COLUMN "users"."premium_expires_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."premium_expires_at" IS 'When premium subscription expires (NULL for lifetime)';


--
-- Name: admin_user_overview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."admin_user_overview" AS
 SELECT "u"."id",
    "u"."username",
    "u"."email",
    "u"."is_vip",
    "u"."is_admin",
    "u"."premium_tier",
    "u"."vip_reason",
    "u"."created_at",
    "u"."last_login",
    "u"."email_verified",
    COALESCE("uas"."status", 'active'::character varying) AS "status",
    COALESCE("ps"."games_played", 0) AS "games_played",
    COALESCE("ps"."games_won", 0) AS "games_won",
    COALESCE("u"."skill_rating", 1000) AS "elo_rating",
    "count"(DISTINCT "m"."id") AS "maps_created",
    "count"(DISTINCT "gr"."id") FILTER (WHERE (("gr"."status")::"text" = ANY ((ARRAY['waiting'::character varying, 'in_progress'::character varying])::"text"[]))) AS "active_games"
   FROM ((((("public"."users" "u"
     LEFT JOIN "public"."user_account_status" "uas" ON (("u"."id" = "uas"."user_id")))
     LEFT JOIN "public"."player_stats" "ps" ON (("u"."id" = "ps"."user_id")))
     LEFT JOIN "public"."maps" "m" ON (("u"."id" = "m"."creator_id")))
     LEFT JOIN "public"."room_players" "rp" ON (("u"."id" = "rp"."user_id")))
     LEFT JOIN "public"."game_rooms" "gr" ON (("rp"."room_id" = "gr"."id")))
  GROUP BY "u"."id", "u"."username", "u"."email", "u"."is_vip", "u"."is_admin", "u"."premium_tier", "u"."vip_reason", "u"."created_at", "u"."last_login", "u"."email_verified", "u"."skill_rating", "uas"."status", "ps"."games_played", "ps"."games_won";


--
-- Name: capital_eliminations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."capital_eliminations" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "eliminated_player_id" "uuid" NOT NULL,
    "conqueror_player_id" "uuid" NOT NULL,
    "eliminated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "capital_territory_id" character varying(100) NOT NULL,
    "territories_gained" integer DEFAULT 0 NOT NULL,
    "troops_gained" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "capital_eliminations_no_self" CHECK (("eliminated_player_id" <> "conqueror_player_id"))
);


--
-- Name: clan_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_activity_log" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "action_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "target_id" "uuid",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: clan_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_announcements" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "author_user_id" "uuid" NOT NULL,
    "title" character varying(80) NOT NULL,
    "body_markdown" "text" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expires_at" timestamp without time zone
);


--
-- Name: clan_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_applications" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "clan_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'withdrawn'::"text"])))
);


--
-- Name: clan_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_chat_messages" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "edited_at" timestamp without time zone,
    "deleted_at" timestamp without time zone,
    "deleted_by" "uuid"
);


--
-- Name: clan_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_invitations" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "invited_user_id" "uuid" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp without time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "clan_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);


--
-- Name: clan_join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_join_requests" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "created_by" "uuid" NOT NULL,
    "token" "text",
    "expires_at" timestamp without time zone,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "clan_join_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'withdrawn'::"text", 'revoked'::"text", 'expired'::"text"]))),
    CONSTRAINT "clan_join_requests_type_check" CHECK (("type" = ANY (ARRAY['application'::"text", 'invite'::"text"])))
);


--
-- Name: clan_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_members" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid",
    "joined_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "probation_until" timestamp without time zone,
    "last_active_at" timestamp without time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_role_change_at" timestamp without time zone,
    "contribution_xp" bigint DEFAULT 0 NOT NULL,
    "contribution_matches" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "clan_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'banned'::"text", 'left'::"text", 'kicked'::"text"])))
);


--
-- Name: clan_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_objectives" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "objective_type" "text" NOT NULL,
    "target_value" integer NOT NULL,
    "progress_value" integer DEFAULT 0 NOT NULL,
    "start_at" timestamp without time zone NOT NULL,
    "end_at" timestamp without time zone NOT NULL,
    "reward" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: clan_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_roles" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id" "uuid" NOT NULL,
    "name" character varying(40) NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "hierarchy_rank" integer NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: clan_war_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_war_matches" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_war_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "map_id" "uuid",
    "participants" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "result" "text" NOT NULL,
    "points_awarded" integer DEFAULT 0 NOT NULL,
    "replay_url" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "clan_war_matches_result_check" CHECK (("result" = ANY (ARRAY['win'::"text", 'loss'::"text", 'draw'::"text"])))
);


--
-- Name: clan_wars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clan_wars" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "clan_id_a" "uuid" NOT NULL,
    "clan_id_b" "uuid" NOT NULL,
    "season_id" "uuid",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "scheduled_start" timestamp without time zone,
    "scheduled_end" timestamp without time zone,
    "ruleset" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "score_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rewards" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "clan_wars_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


--
-- Name: clans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clans" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "name" character varying(64) NOT NULL,
    "tag" "public"."citext" NOT NULL,
    "slug" "text" NOT NULL,
    "motto" character varying(120),
    "description" "text",
    "crest_asset_url" "text",
    "banner_asset_url" "text",
    "recruitment_policy" "text" DEFAULT 'application'::"text" NOT NULL,
    "recruitment_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "minimum_rank" integer,
    "auto_accept_thresholds" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "language" character varying(16),
    "region" character varying(32),
    "time_zone" character varying(64),
    "privacy" "text" DEFAULT 'public'::"text" NOT NULL,
    "total_xp" bigint DEFAULT 0 NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deleted_at" timestamp without time zone,
    CONSTRAINT "clans_privacy_check" CHECK (("privacy" = ANY (ARRAY['public'::"text", 'hidden'::"text"]))),
    CONSTRAINT "clans_recruitment_policy_check" CHECK (("recruitment_policy" = ANY (ARRAY['open'::"text", 'application'::"text", 'invite'::"text"]))),
    CONSTRAINT "clans_recruitment_status_check" CHECK (("recruitment_status" = ANY (ARRAY['active'::"text", 'closed'::"text"])))
);


--
-- Name: conversation_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."conversation_members" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."conversation_member_role" DEFAULT 'member'::"public"."conversation_member_role" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_read_message_id" character(26),
    "last_read_at" timestamp with time zone,
    "is_muted" boolean DEFAULT false NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "shadow_muted" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."conversation_messages" (
    "id" character(26) DEFAULT "public"."generate_ulid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "body" "text" NOT NULL,
    "json_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "edited_at" timestamp with time zone,
    "shadow_muted" boolean DEFAULT false NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."conversations" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "kind" "public"."conversation_kind" NOT NULL,
    "title" character varying(255),
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "is_read_only" boolean DEFAULT false NOT NULL,
    "game_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "clan_id" "uuid"
);


--
-- Name: email_verification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_verification_logs" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "token" character varying(255) NOT NULL,
    "sent_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "verified_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."events" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "session_id" "uuid",
    "event_type" character varying(100) NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "events_type_check" CHECK ((("event_type")::"text" = ANY ((ARRAY['user_login'::character varying, 'user_logout'::character varying, 'user_registration'::character varying, 'game_start'::character varying, 'game_end'::character varying, 'game_move'::character varying, 'page_view'::character varying, 'button_click'::character varying, 'feature_use'::character varying, 'error_occurred'::character varying, 'purchase_initiated'::character varying, 'purchase_completed'::character varying, 'achievement_unlocked'::character varying])::"text"[])))
);


--
-- Name: feature_flag_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."feature_flag_audit" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "flag_name" character varying(100) NOT NULL,
    "changed_by" "uuid",
    "change_type" character varying(20) NOT NULL,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "reason" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "feature_flag_audit_change_type_check" CHECK ((("change_type")::"text" = ANY ((ARRAY['created'::character varying, 'updated'::character varying, 'deleted'::character varying, 'toggled'::character varying])::"text"[])))
);


--
-- Name: TABLE "feature_flag_audit"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."feature_flag_audit" IS 'Audit log for all feature flag changes';


--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."feature_flags" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "flag_name" character varying(100) NOT NULL,
    "description" "text",
    "is_enabled" boolean DEFAULT false NOT NULL,
    "rollout_percentage" integer DEFAULT 0 NOT NULL,
    "target_criteria" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "access_level" character varying(20) DEFAULT 'disabled'::character varying,
    "category" character varying(50),
    "dependencies" "jsonb" DEFAULT '[]'::"jsonb",
    "metrics" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "feature_flags_access_level_check" CHECK ((("access_level")::"text" = ANY ((ARRAY['disabled'::character varying, 'internal'::character varying, 'beta'::character varying, 'public'::character varying])::"text"[]))),
    CONSTRAINT "feature_flags_rollout_percentage" CHECK ((("rollout_percentage" >= 0) AND ("rollout_percentage" <= 100)))
);


--
-- Name: TABLE "feature_flags"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."feature_flags" IS 'Feature flag definitions with access levels and rollout controls';


--
-- Name: COLUMN "feature_flags"."access_level"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."feature_flags"."access_level" IS 'Access level: disabled, internal (admin/tester), beta, or public';


--
-- Name: COLUMN "feature_flags"."category"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."feature_flags"."category" IS 'Feature category: gameplay, ui, experimental, premium, vip';


--
-- Name: COLUMN "feature_flags"."dependencies"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."feature_flags"."dependencies" IS 'Array of flag names this flag depends on';


--
-- Name: COLUMN "feature_flags"."metrics"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."feature_flags"."metrics" IS 'Usage metrics and performance data';


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."friendships" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "friend_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "requested_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "accepted_at" timestamp without time zone,
    CONSTRAINT "friendships_no_self" CHECK (("user_id" <> "friend_id")),
    CONSTRAINT "friendships_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'blocked'::character varying])::"text"[])))
);


--
-- Name: game_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_moves" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "turn_number" integer NOT NULL,
    "move_type" character varying(20) NOT NULL,
    "move_data" "jsonb" NOT NULL,
    "is_valid" boolean DEFAULT true NOT NULL,
    "validation_error" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "game_moves_turn_positive" CHECK (("turn_number" > 0)),
    CONSTRAINT "game_moves_type_check" CHECK ((("move_type")::"text" = ANY ((ARRAY['deploy'::character varying, 'attack'::character varying, 'fortify'::character varying, 'end_turn'::character varying, 'surrender'::character varying, 'trade_cards'::character varying])::"text"[])))
);


--
-- Name: game_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_results" (
    "room_id" "uuid" NOT NULL,
    "map_id" "uuid",
    "winner_id" "uuid",
    "duration_seconds" integer,
    "total_turns" integer NOT NULL,
    "final_state" "jsonb" NOT NULL,
    "player_summary" "jsonb" NOT NULL,
    "battle_log" "jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: game_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_states" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "current_player_id" "uuid",
    "game_phase" character varying(20) NOT NULL,
    "turn_number" integer DEFAULT 1 NOT NULL,
    "round_number" integer DEFAULT 1 NOT NULL,
    "territories" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "player_stats" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "game_log" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "replay_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ai_players" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_activity" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "winner_id" "uuid",
    "turn_stats" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "game_states_phase_check" CHECK ((("game_phase")::"text" = ANY ((ARRAY['deployment'::character varying, 'attack'::character varying, 'fortify'::character varying, 'finished'::character varying])::"text"[]))),
    CONSTRAINT "game_states_turn_positive" CHECK ((("turn_number" > 0) AND ("round_number" > 0)))
);


--
-- Name: game_territory_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."game_territory_modifiers" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "territory_name" character varying(100) NOT NULL,
    "template_id" "uuid" NOT NULL,
    "applied_by" "uuid",
    "applied_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expires_at" timestamp without time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "territory_id" character varying(100),
    "defense_bonus" integer DEFAULT 0 NOT NULL,
    "attack_bonus" integer DEFAULT 0 NOT NULL,
    "troop_generation_bonus" integer DEFAULT 0 NOT NULL,
    "movement_restriction" boolean DEFAULT false NOT NULL,
    "supply_line_bonus" boolean DEFAULT false NOT NULL,
    "icon" character varying(100) DEFAULT '✨'::character varying,
    "color" character varying(20) DEFAULT '#a855f7'::character varying,
    "name" character varying(100) DEFAULT 'Special Territory'::character varying
);


--
-- Name: map_approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_approval_requests" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "assigned_moderator_id" "uuid",
    "submission_notes" "text",
    "priority_level" character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    "estimated_review_time" integer,
    "review_started_at" timestamp with time zone,
    "review_completed_at" timestamp with time zone,
    "decision" character varying(32),
    "moderator_feedback" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: map_asset_purge_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_asset_purge_runs" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "run_type" character varying(50) DEFAULT 'staging'::character varying NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "purged_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "bytes_purged" bigint DEFAULT 0 NOT NULL,
    "started_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completed_at" timestamp without time zone,
    "duration_ms" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: map_collaborators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_collaborators" (
    "map_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" character varying(32) DEFAULT 'editor'::character varying NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "map_collaborators_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['editor'::character varying, 'viewer'::character varying, 'owner'::character varying, 'reviewer'::character varying])::"text"[])))
);


--
-- Name: TABLE "map_collaborators"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."map_collaborators" IS 'Users granted collaborative access to author maps created by others.';


--
-- Name: COLUMN "map_collaborators"."role"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."map_collaborators"."role" IS 'editor=full edit rights, viewer=read-only, owner=delegated owner, reviewer=approval workflow support.';


--
-- Name: COLUMN "map_collaborators"."assigned_by"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."map_collaborators"."assigned_by" IS 'Admin or map owner that granted the collaboration access.';


--
-- Name: map_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_drafts" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "staging_image_id" "uuid",
    "parent_map_id" "uuid",
    "name" character varying(150) DEFAULT 'Untitled Map'::character varying NOT NULL,
    "description" "text",
    "map_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "territories" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sectors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "adjacencies" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "capital_assignments" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "thumbnail_url" character varying(500),
    "image_url" character varying(500),
    "image_width" integer,
    "image_height" integer,
    "tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "draft_status" character varying(32) DEFAULT 'editing'::character varying NOT NULL,
    "validation_status" character varying(32),
    "validation_errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "auto_saved_at" timestamp without time zone,
    "last_edited_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: map_images_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_images_staging" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "filename" character varying(255) NOT NULL,
    "original_filename" character varying(255),
    "file_url" character varying(500) NOT NULL,
    "file_size" integer NOT NULL,
    "width" integer,
    "height" integer,
    "mime_type" character varying(100),
    "upload_status" character varying(32) DEFAULT 'processing'::character varying NOT NULL,
    "processing_error" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deletion_attempts" integer DEFAULT 0 NOT NULL,
    "last_deletion_attempt" timestamp without time zone,
    "last_deletion_error" "text",
    "purged_at" timestamp without time zone
);


--
-- Name: map_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_ratings" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "review" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "map_ratings_rating_range" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


--
-- Name: map_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_reviews" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "status" character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    "notes" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reviewed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "map_reviews_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'needs_changes'::character varying])::"text"[])))
);


--
-- Name: map_sectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_sectors" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "bonus_troops" integer DEFAULT 0 NOT NULL,
    "color" character varying(7),
    "requirements" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "map_continents_bonus_non_negative" CHECK (("bonus_troops" >= 0))
);


--
-- Name: map_submission_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_submission_logs" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid" NOT NULL,
    "action" character varying(64) NOT NULL,
    "performed_by" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: map_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_submissions" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid",
    "submission_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "user_id" "uuid",
    "review_status" character varying(32) DEFAULT 'pending'::character varying,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "map_submissions_review_status_check" CHECK ((("review_status")::"text" = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'needs_changes'::character varying])::"text"[])))
);


--
-- Name: map_territories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_territories" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "polygon_data" "jsonb" NOT NULL,
    "sector" character varying(50),
    "is_capital" boolean DEFAULT false NOT NULL,
    "capital_for_players" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "map_territories_name_length" CHECK (("length"(("name")::"text") >= 1))
);


--
-- Name: map_territory_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_territory_modifiers" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "territory_id" character varying(100),
    "modifier_template_id" "uuid",
    "name" character varying(100),
    "icon" character varying(100),
    "color" character varying(20),
    "defense_bonus" integer DEFAULT 0 NOT NULL,
    "attack_bonus" integer DEFAULT 0 NOT NULL,
    "troop_generation_bonus" integer DEFAULT 0 NOT NULL,
    "movement_restriction" boolean DEFAULT false NOT NULL,
    "supply_line_bonus" boolean DEFAULT false NOT NULL
);


--
-- Name: map_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."map_versions" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "territories" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sectors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "adjacencies" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "change_summary" "text",
    "changed_by" "uuid",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: matchmaking_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."matchmaking_queue" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "queue_type" character varying(50) NOT NULL,
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "skill_rating" integer NOT NULL,
    "joined_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "estimated_wait_time" integer,
    "priority_score" integer DEFAULT 100 NOT NULL,
    "region" character varying(10),
    CONSTRAINT "matchmaking_queue_priority_range" CHECK ((("priority_score" >= 1) AND ("priority_score" <= 1000))),
    CONSTRAINT "matchmaking_queue_type_check" CHECK ((("queue_type")::"text" = ANY ((ARRAY['ranked'::character varying, 'casual'::character varying, 'tournament'::character varying, 'custom'::character varying])::"text"[])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" character varying(50) NOT NULL,
    "title" character varying(255) NOT NULL,
    "message" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['friend_request'::character varying, 'game_invite'::character varying, 'game_started'::character varying, 'game_ended'::character varying, 'achievement'::character varying, 'system'::character varying, 'admin'::character varying, 'chat_message'::character varying, 'map_submission'::character varying, 'map_review'::character varying, 'map_approved'::character varying, 'map_rejected'::character varying])::"text"[])))
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."password_reset_tokens" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" character varying(255) NOT NULL,
    "expires_at" timestamp without time zone NOT NULL,
    "used_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_game_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."player_game_results" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "is_winner" boolean NOT NULL,
    "eliminated" boolean NOT NULL,
    "territories" integer NOT NULL,
    "armies" integer NOT NULL,
    "elimination_order" integer,
    "rating_before" integer,
    "rating_after" integer,
    "rating_change" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: rating_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."rating_history" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "old_rating" integer NOT NULL,
    "new_rating" integer NOT NULL,
    "rating_change" integer NOT NULL,
    "game_room_id" "uuid",
    "reason" character varying(50) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "rating_history_change_consistency" CHECK ((("new_rating" - "old_rating") = "rating_change"))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."schema_migrations" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "filename" character varying(255) NOT NULL,
    "executed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "status" character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    "checksum" character varying(64) NOT NULL,
    "execution_time_ms" integer DEFAULT 0 NOT NULL,
    "rollback_sql" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "migration_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'rolled_back'::character varying])::"text"[])))
);


--
-- Name: skill_leaderboard_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."skill_leaderboard_cache" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "period_type" character varying(20) NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "rankings" "jsonb" NOT NULL,
    "generated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "leaderboard_period_check" CHECK ((("period_type")::"text" = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'all_time'::character varying])::"text"[])))
);


--
-- Name: territory_adjacencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."territory_adjacencies" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "map_id" "uuid" NOT NULL,
    "territory_from" character varying(100) NOT NULL,
    "territory_to" character varying(100) NOT NULL,
    CONSTRAINT "territory_adjacencies_no_self" CHECK ((("territory_from")::"text" <> ("territory_to")::"text"))
);


--
-- Name: territory_modifier_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."territory_modifier_templates" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text" NOT NULL,
    "modifier_type" character varying(50) NOT NULL,
    "effect_value" "jsonb" NOT NULL,
    "duration_type" character varying(20) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "duration_type_check" CHECK ((("duration_type")::"text" = ANY ((ARRAY['permanent'::character varying, 'turns'::character varying, 'rounds'::character varying, 'game'::character varying])::"text"[]))),
    CONSTRAINT "modifier_type_check" CHECK ((("modifier_type")::"text" = ANY ((ARRAY['bonus'::character varying, 'penalty'::character varying, 'special'::character varying])::"text"[])))
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_achievements" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "achievement_id" "uuid" NOT NULL,
    "progress_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "unlocked_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_admin_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_admin_roles" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "is_active" boolean DEFAULT true,
    "expires_at" timestamp without time zone
);


--
-- Name: user_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_bans" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "ban_type" character varying(20) NOT NULL,
    "reason" "text" NOT NULL,
    "expires_at" timestamp without time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "user_bans_type_check" CHECK ((("ban_type")::"text" = ANY ((ARRAY['temporary'::character varying, 'permanent'::character varying, 'chat'::character varying, 'game'::character varying])::"text"[])))
);


--
-- Name: user_behavior_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_behavior_patterns" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pattern_type" character varying(50) NOT NULL,
    "pattern_data" "jsonb" NOT NULL,
    "confidence_score" numeric(3,2) DEFAULT 0.0,
    "generated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expires_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "behavior_patterns_confidence_range" CHECK ((("confidence_score" >= 0.0) AND ("confidence_score" <= 1.0))),
    CONSTRAINT "behavior_patterns_type_check" CHECK ((("pattern_type")::"text" = ANY ((ARRAY['playstyle'::character varying, 'skill_trend'::character varying, 'churn_risk'::character varying, 'engagement_level'::character varying, 'spending_pattern'::character varying])::"text"[])))
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_blocks" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_clan_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_clan_preferences" (
    "user_id" "uuid" NOT NULL,
    "allow_auto_invites" boolean DEFAULT true NOT NULL,
    "notification_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_feature_flags" (
    "user_id" "uuid" NOT NULL,
    "flag_name" character varying(100) NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "assigned_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_preferences" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "game_notifications" boolean DEFAULT true NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "theme" character varying(50) DEFAULT 'default'::character varying,
    "sound_enabled" boolean DEFAULT true,
    "music_enabled" boolean DEFAULT true,
    "master_volume" integer DEFAULT 75,
    "sfx_volume" integer DEFAULT 80,
    "music_volume" integer DEFAULT 50,
    "preferred_color" character varying(20) DEFAULT '#DC2626'::character varying,
    "auto_ready" boolean DEFAULT false,
    "show_timer" boolean DEFAULT true,
    "show_army_numbers" boolean DEFAULT true,
    "animation_speed" character varying(20) DEFAULT 'normal'::character varying,
    "language" character varying(10) DEFAULT 'en'::character varying,
    "notification_enabled" boolean DEFAULT true,
    "turn_notifications_browser" boolean DEFAULT true,
    "turn_notifications_email" boolean DEFAULT false,
    "turn_timer_warning_browser" boolean DEFAULT true,
    "turn_timer_warning_email" boolean DEFAULT false,
    "game_invites_browser" boolean DEFAULT true,
    "game_invites_email" boolean DEFAULT true,
    "game_ended_browser" boolean DEFAULT true,
    "game_ended_email" boolean DEFAULT false,
    "show_online_status" boolean DEFAULT true NOT NULL,
    "direct_messages" character varying(20) DEFAULT 'friends'::character varying,
    "dm_notifications_browser" boolean DEFAULT true,
    "dm_notifications_email" boolean DEFAULT false,
    "dm_policy" "text" DEFAULT 'everyone'::"text",
    "allow_group_invites" boolean DEFAULT true NOT NULL,
    CONSTRAINT "user_preferences_dm_policy_check" CHECK (("dm_policy" = ANY (ARRAY['everyone'::"text", 'friends_only'::"text", 'no_one'::"text"])))
);


--
-- Name: user_messaging_settings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."user_messaging_settings" AS
 SELECT "user_id",
    "dm_policy",
    "allow_group_invites",
    "show_online_status"
   FROM "public"."user_preferences";


--
-- Name: user_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_reports" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_user_id" "uuid" NOT NULL,
    "reason" character varying(100) NOT NULL,
    "description" "text",
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "admin_id" "uuid",
    "admin_notes" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolved_at" timestamp without time zone,
    CONSTRAINT "reports_no_self" CHECK (("reporter_id" <> "reported_user_id")),
    CONSTRAINT "reports_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'investigating'::character varying, 'resolved'::character varying, 'dismissed'::character varying])::"text"[])))
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_sessions" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "started_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ended_at" timestamp without time zone,
    "duration_seconds" integer,
    "ip_address" "inet",
    "user_agent" "text",
    "device_info" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "session_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "user_sessions_duration_positive" CHECK ((("duration_seconds" IS NULL) OR ("duration_seconds" >= 0)))
);


--
-- Name: user_terms_acceptance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_terms_acceptance" (
    "id" "uuid" DEFAULT "public"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feature_type" character varying(50) NOT NULL,
    "terms_version" character varying(20) NOT NULL,
    "accepted_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ip_address" "inet",
    CONSTRAINT "terms_feature_type_check" CHECK ((("feature_type")::"text" = ANY ((ARRAY['map_creation'::character varying, 'data_processing'::character varying, 'community_guidelines'::character varying])::"text"[])))
);


--
-- Name: web_push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."web_push_subscriptions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "expiration_time" timestamp with time zone,
    "p256dh_key" "text",
    "auth_key" "text",
    "failure_count" integer DEFAULT 0 NOT NULL,
    "last_failure_at" timestamp with time zone,
    "last_failure_reason" "text",
    "last_success_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: web_push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."web_push_subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: web_push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."web_push_subscriptions_id_seq" OWNED BY "public"."web_push_subscriptions"."id";


--
-- Name: web_push_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."web_push_subscriptions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."web_push_subscriptions_id_seq"'::"regclass");


--
-- Name: achievements achievements_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_name_key" UNIQUE ("name");


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");


--
-- Name: admin_activity_logs admin_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id");


--
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id");


--
-- Name: admin_roles admin_roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_name_key" UNIQUE ("name");


--
-- Name: admin_roles admin_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id");


--
-- Name: capital_eliminations capital_eliminations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."capital_eliminations"
    ADD CONSTRAINT "capital_eliminations_pkey" PRIMARY KEY ("id");


--
-- Name: clan_activity_log clan_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_activity_log"
    ADD CONSTRAINT "clan_activity_log_pkey" PRIMARY KEY ("id");


--
-- Name: clan_announcements clan_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_announcements"
    ADD CONSTRAINT "clan_announcements_pkey" PRIMARY KEY ("id");


--
-- Name: clan_applications clan_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_applications"
    ADD CONSTRAINT "clan_applications_pkey" PRIMARY KEY ("id");


--
-- Name: clan_chat_messages clan_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_chat_messages"
    ADD CONSTRAINT "clan_chat_messages_pkey" PRIMARY KEY ("id");


--
-- Name: clan_invitations clan_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_invitations"
    ADD CONSTRAINT "clan_invitations_pkey" PRIMARY KEY ("id");


--
-- Name: clan_invitations clan_invitations_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_invitations"
    ADD CONSTRAINT "clan_invitations_token_unique" UNIQUE ("token");


--
-- Name: clan_join_requests clan_join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_join_requests"
    ADD CONSTRAINT "clan_join_requests_pkey" PRIMARY KEY ("id");


--
-- Name: clan_join_requests clan_join_requests_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_join_requests"
    ADD CONSTRAINT "clan_join_requests_token_key" UNIQUE ("token");


--
-- Name: clan_members clan_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_members"
    ADD CONSTRAINT "clan_members_pkey" PRIMARY KEY ("id");


--
-- Name: clan_members clan_members_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_members"
    ADD CONSTRAINT "clan_members_unique" UNIQUE ("clan_id", "user_id");


--
-- Name: clan_objectives clan_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_objectives"
    ADD CONSTRAINT "clan_objectives_pkey" PRIMARY KEY ("id");


--
-- Name: clan_roles clan_roles_hierarchy_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_roles"
    ADD CONSTRAINT "clan_roles_hierarchy_unique" UNIQUE ("clan_id", "hierarchy_rank");


--
-- Name: clan_roles clan_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_roles"
    ADD CONSTRAINT "clan_roles_pkey" PRIMARY KEY ("id");


--
-- Name: clan_war_matches clan_war_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_war_matches"
    ADD CONSTRAINT "clan_war_matches_pkey" PRIMARY KEY ("id");


--
-- Name: clan_wars clan_wars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_wars"
    ADD CONSTRAINT "clan_wars_pkey" PRIMARY KEY ("id");


--
-- Name: clans clans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clans"
    ADD CONSTRAINT "clans_pkey" PRIMARY KEY ("id");


--
-- Name: clans clans_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clans"
    ADD CONSTRAINT "clans_slug_unique" UNIQUE ("slug");


--
-- Name: clans clans_tag_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clans"
    ADD CONSTRAINT "clans_tag_unique" UNIQUE ("tag");


--
-- Name: conversation_members conversation_members_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");


--
-- Name: conversation_members conversation_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id");


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");


--
-- Name: email_verification_logs email_verification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_verification_logs"
    ADD CONSTRAINT "email_verification_logs_pkey" PRIMARY KEY ("id");


--
-- Name: email_verification_logs email_verification_logs_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_verification_logs"
    ADD CONSTRAINT "email_verification_logs_token_key" UNIQUE ("token");


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");


--
-- Name: feature_flag_audit feature_flag_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feature_flag_audit"
    ADD CONSTRAINT "feature_flag_audit_pkey" PRIMARY KEY ("id");


--
-- Name: feature_flags feature_flags_flag_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_flag_name_key" UNIQUE ("flag_name");


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id");


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");


--
-- Name: friendships friendships_user_id_friend_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_friend_id_key" UNIQUE ("user_id", "friend_id");


--
-- Name: game_moves game_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_moves"
    ADD CONSTRAINT "game_moves_pkey" PRIMARY KEY ("id");


--
-- Name: game_results game_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_results"
    ADD CONSTRAINT "game_results_pkey" PRIMARY KEY ("room_id");


--
-- Name: game_rooms game_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_rooms"
    ADD CONSTRAINT "game_rooms_pkey" PRIMARY KEY ("id");


--
-- Name: game_states game_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_states"
    ADD CONSTRAINT "game_states_pkey" PRIMARY KEY ("id");


--
-- Name: game_states game_states_room_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_states"
    ADD CONSTRAINT "game_states_room_id_key" UNIQUE ("room_id");


--
-- Name: game_territory_modifiers game_territory_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_territory_modifiers"
    ADD CONSTRAINT "game_territory_modifiers_pkey" PRIMARY KEY ("id");


--
-- Name: map_approval_requests map_approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_approval_requests"
    ADD CONSTRAINT "map_approval_requests_pkey" PRIMARY KEY ("id");


--
-- Name: map_asset_purge_runs map_asset_purge_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_asset_purge_runs"
    ADD CONSTRAINT "map_asset_purge_runs_pkey" PRIMARY KEY ("id");


--
-- Name: map_collaborators map_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_collaborators"
    ADD CONSTRAINT "map_collaborators_pkey" PRIMARY KEY ("map_id", "user_id");


--
-- Name: map_sectors map_continents_map_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_sectors"
    ADD CONSTRAINT "map_continents_map_id_name_key" UNIQUE ("map_id", "name");


--
-- Name: map_sectors map_continents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_sectors"
    ADD CONSTRAINT "map_continents_pkey" PRIMARY KEY ("id");


--
-- Name: map_drafts map_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_drafts"
    ADD CONSTRAINT "map_drafts_pkey" PRIMARY KEY ("id");


--
-- Name: map_images_staging map_images_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_images_staging"
    ADD CONSTRAINT "map_images_staging_pkey" PRIMARY KEY ("id");


--
-- Name: map_ratings map_ratings_map_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_ratings"
    ADD CONSTRAINT "map_ratings_map_id_user_id_key" UNIQUE ("map_id", "user_id");


--
-- Name: map_ratings map_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_ratings"
    ADD CONSTRAINT "map_ratings_pkey" PRIMARY KEY ("id");


--
-- Name: map_reviews map_reviews_map_id_reviewer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_reviews"
    ADD CONSTRAINT "map_reviews_map_id_reviewer_id_key" UNIQUE ("map_id", "reviewer_id");


--
-- Name: map_reviews map_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_reviews"
    ADD CONSTRAINT "map_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: map_submission_logs map_submission_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_submission_logs"
    ADD CONSTRAINT "map_submission_logs_pkey" PRIMARY KEY ("id");


--
-- Name: map_submissions map_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_submissions"
    ADD CONSTRAINT "map_submissions_pkey" PRIMARY KEY ("id");


--
-- Name: map_territories map_territories_map_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_territories"
    ADD CONSTRAINT "map_territories_map_id_name_key" UNIQUE ("map_id", "name");


--
-- Name: map_territories map_territories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_territories"
    ADD CONSTRAINT "map_territories_pkey" PRIMARY KEY ("id");


--
-- Name: map_territory_modifiers map_territory_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_territory_modifiers"
    ADD CONSTRAINT "map_territory_modifiers_pkey" PRIMARY KEY ("id");


--
-- Name: map_versions map_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_versions"
    ADD CONSTRAINT "map_versions_pkey" PRIMARY KEY ("id");


--
-- Name: maps maps_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maps"
    ADD CONSTRAINT "maps_name_key" UNIQUE ("name");


--
-- Name: maps maps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maps"
    ADD CONSTRAINT "maps_pkey" PRIMARY KEY ("id");


--
-- Name: matchmaking_queue matchmaking_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."matchmaking_queue"
    ADD CONSTRAINT "matchmaking_queue_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_token_key" UNIQUE ("token");


--
-- Name: player_game_results player_game_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_game_results"
    ADD CONSTRAINT "player_game_results_pkey" PRIMARY KEY ("id");


--
-- Name: player_game_results player_game_results_room_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_game_results"
    ADD CONSTRAINT "player_game_results_room_id_user_id_key" UNIQUE ("room_id", "user_id");


--
-- Name: player_stats player_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_stats"
    ADD CONSTRAINT "player_stats_pkey" PRIMARY KEY ("id");


--
-- Name: player_stats player_stats_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_stats"
    ADD CONSTRAINT "player_stats_user_id_key" UNIQUE ("user_id");


--
-- Name: rating_history rating_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rating_history"
    ADD CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id");


--
-- Name: room_players room_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_pkey" PRIMARY KEY ("id");


--
-- Name: room_players room_players_room_id_player_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_room_id_player_order_key" UNIQUE ("room_id", "player_order");


--
-- Name: room_players room_players_room_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_room_id_user_id_key" UNIQUE ("room_id", "user_id");


--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_filename_key" UNIQUE ("filename");


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("id");


--
-- Name: skill_leaderboard_cache skill_leaderboard_cache_period_type_period_start_period_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."skill_leaderboard_cache"
    ADD CONSTRAINT "skill_leaderboard_cache_period_type_period_start_period_end_key" UNIQUE ("period_type", "period_start", "period_end");


--
-- Name: skill_leaderboard_cache skill_leaderboard_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."skill_leaderboard_cache"
    ADD CONSTRAINT "skill_leaderboard_cache_pkey" PRIMARY KEY ("id");


--
-- Name: territory_adjacencies territory_adjacencies_map_id_territory_from_territory_to_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."territory_adjacencies"
    ADD CONSTRAINT "territory_adjacencies_map_id_territory_from_territory_to_key" UNIQUE ("map_id", "territory_from", "territory_to");


--
-- Name: territory_adjacencies territory_adjacencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."territory_adjacencies"
    ADD CONSTRAINT "territory_adjacencies_pkey" PRIMARY KEY ("id");


--
-- Name: territory_modifier_templates territory_modifier_templates_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."territory_modifier_templates"
    ADD CONSTRAINT "territory_modifier_templates_name_key" UNIQUE ("name");


--
-- Name: territory_modifier_templates territory_modifier_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."territory_modifier_templates"
    ADD CONSTRAINT "territory_modifier_templates_pkey" PRIMARY KEY ("id");


--
-- Name: user_account_status user_account_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_account_status"
    ADD CONSTRAINT "user_account_status_pkey" PRIMARY KEY ("id");


--
-- Name: user_account_status user_account_status_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_account_status"
    ADD CONSTRAINT "user_account_status_user_id_key" UNIQUE ("user_id");


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id");


--
-- Name: user_achievements user_achievements_user_id_achievement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_achievement_id_key" UNIQUE ("user_id", "achievement_id");


--
-- Name: user_admin_roles user_admin_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_admin_roles"
    ADD CONSTRAINT "user_admin_roles_pkey" PRIMARY KEY ("id");


--
-- Name: user_admin_roles user_admin_roles_user_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_admin_roles"
    ADD CONSTRAINT "user_admin_roles_user_id_role_id_key" UNIQUE ("user_id", "role_id");


--
-- Name: user_bans user_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_pkey" PRIMARY KEY ("id");


--
-- Name: user_behavior_patterns user_behavior_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_behavior_patterns"
    ADD CONSTRAINT "user_behavior_patterns_pkey" PRIMARY KEY ("id");


--
-- Name: user_blocks user_blocks_blocker_id_blocked_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id");


--
-- Name: user_clan_preferences user_clan_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_clan_preferences"
    ADD CONSTRAINT "user_clan_preferences_pkey" PRIMARY KEY ("user_id");


--
-- Name: user_feature_flags user_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_feature_flags"
    ADD CONSTRAINT "user_feature_flags_pkey" PRIMARY KEY ("user_id", "flag_name");


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id");


--
-- Name: user_reports user_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id");


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: user_terms_acceptance user_terms_acceptance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_terms_acceptance"
    ADD CONSTRAINT "user_terms_acceptance_pkey" PRIMARY KEY ("id");


--
-- Name: user_terms_acceptance user_terms_acceptance_user_id_feature_type_terms_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_terms_acceptance"
    ADD CONSTRAINT "user_terms_acceptance_user_id_feature_type_terms_version_key" UNIQUE ("user_id", "feature_type", "terms_version");


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");


--
-- Name: web_push_subscriptions web_push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."web_push_subscriptions"
    ADD CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: idx_achievements_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_achievements_category" ON "public"."achievements" USING "btree" ("category");


--
-- Name: idx_achievements_unlock_criteria_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_achievements_unlock_criteria_gin" ON "public"."achievements" USING "gin" ("unlock_criteria");


--
-- Name: idx_admin_activity_logs_action_details_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_activity_logs_action_details_gin" ON "public"."admin_activity_logs" USING "gin" ("action_details");


--
-- Name: idx_admin_activity_logs_admin_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_activity_logs_admin_user_id" ON "public"."admin_activity_logs" USING "btree" ("admin_user_id");


--
-- Name: idx_admin_activity_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_activity_logs_created_at" ON "public"."admin_activity_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_admin_notifications_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_notifications_admin_id" ON "public"."admin_notifications" USING "btree" ("admin_id", "is_read");


--
-- Name: idx_admin_roles_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_roles_name" ON "public"."admin_roles" USING "btree" ("name");


--
-- Name: idx_clan_activity_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_activity_action" ON "public"."clan_activity_log" USING "btree" ("action_type");


--
-- Name: idx_clan_activity_clan_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_activity_clan_created_at" ON "public"."clan_activity_log" USING "btree" ("clan_id", "created_at" DESC);


--
-- Name: idx_clan_announcements_clan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_announcements_clan" ON "public"."clan_announcements" USING "btree" ("clan_id");


--
-- Name: idx_clan_announcements_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_announcements_pinned" ON "public"."clan_announcements" USING "btree" ("clan_id", "pinned");


--
-- Name: idx_clan_applications_clan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_applications_clan" ON "public"."clan_applications" USING "btree" ("clan_id");


--
-- Name: idx_clan_applications_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_clan_applications_pending_unique" ON "public"."clan_applications" USING "btree" ("clan_id", "user_id") WHERE ("status" = 'pending'::"text");


--
-- Name: idx_clan_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_applications_status" ON "public"."clan_applications" USING "btree" ("status");


--
-- Name: idx_clan_applications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_applications_user" ON "public"."clan_applications" USING "btree" ("user_id");


--
-- Name: idx_clan_chat_messages_clan_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_chat_messages_clan_created" ON "public"."clan_chat_messages" USING "btree" ("clan_id", "created_at" DESC);


--
-- Name: idx_clan_chat_messages_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_chat_messages_user" ON "public"."clan_chat_messages" USING "btree" ("user_id");


--
-- Name: idx_clan_invitations_clan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_invitations_clan" ON "public"."clan_invitations" USING "btree" ("clan_id");


--
-- Name: idx_clan_invitations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_invitations_status" ON "public"."clan_invitations" USING "btree" ("status");


--
-- Name: idx_clan_invitations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_invitations_user" ON "public"."clan_invitations" USING "btree" ("invited_user_id");


--
-- Name: idx_clan_join_requests_clan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_join_requests_clan" ON "public"."clan_join_requests" USING "btree" ("clan_id");


--
-- Name: idx_clan_join_requests_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_clan_join_requests_pending_unique" ON "public"."clan_join_requests" USING "btree" ("clan_id", "user_id") WHERE ("status" = 'pending'::"text");


--
-- Name: idx_clan_join_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_join_requests_status" ON "public"."clan_join_requests" USING "btree" ("status");


--
-- Name: idx_clan_join_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_join_requests_user" ON "public"."clan_join_requests" USING "btree" ("user_id");


--
-- Name: idx_clan_members_active_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_clan_members_active_user" ON "public"."clan_members" USING "btree" ("user_id") WHERE ("status" = 'active'::"text");


--
-- Name: idx_clan_members_clan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_members_clan" ON "public"."clan_members" USING "btree" ("clan_id");


--
-- Name: idx_clan_members_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_members_status" ON "public"."clan_members" USING "btree" ("status");


--
-- Name: idx_clan_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_members_user" ON "public"."clan_members" USING "btree" ("user_id");


--
-- Name: idx_clan_objectives_clan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_objectives_clan" ON "public"."clan_objectives" USING "btree" ("clan_id");


--
-- Name: idx_clan_objectives_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_objectives_window" ON "public"."clan_objectives" USING "btree" ("clan_id", "end_at" DESC);


--
-- Name: idx_clan_roles_clan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_roles_clan" ON "public"."clan_roles" USING "btree" ("clan_id");


--
-- Name: idx_clan_roles_clan_id_lower_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_clan_roles_clan_id_lower_name" ON "public"."clan_roles" USING "btree" ("clan_id", "lower"(("name")::"text"));


--
-- Name: idx_clan_roles_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_clan_roles_name_unique" ON "public"."clan_roles" USING "btree" ("clan_id", "lower"(("name")::"text"));


--
-- Name: idx_clan_war_matches_result; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_war_matches_result" ON "public"."clan_war_matches" USING "btree" ("result");


--
-- Name: idx_clan_war_matches_war; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_war_matches_war" ON "public"."clan_war_matches" USING "btree" ("clan_war_id");


--
-- Name: idx_clan_wars_clan_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_wars_clan_a" ON "public"."clan_wars" USING "btree" ("clan_id_a");


--
-- Name: idx_clan_wars_clan_b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_wars_clan_b" ON "public"."clan_wars" USING "btree" ("clan_id_b");


--
-- Name: idx_clan_wars_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clan_wars_status" ON "public"."clan_wars" USING "btree" ("status");


--
-- Name: idx_clans_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clans_created_at" ON "public"."clans" USING "btree" ("created_at" DESC);


--
-- Name: idx_clans_description_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clans_description_trgm" ON "public"."clans" USING "gin" ("description" "public"."gin_trgm_ops");


--
-- Name: idx_clans_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clans_name_trgm" ON "public"."clans" USING "gin" ("name" "public"."gin_trgm_ops");


--
-- Name: idx_clans_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clans_owner" ON "public"."clans" USING "btree" ("owner_user_id");


--
-- Name: idx_clans_privacy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clans_privacy" ON "public"."clans" USING "btree" ("privacy");


--
-- Name: idx_clans_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clans_region" ON "public"."clans" USING "btree" ("region");


--
-- Name: idx_clans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clans_status" ON "public"."clans" USING "btree" ("recruitment_status");


--
-- Name: idx_clans_tag_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clans_tag_trgm" ON "public"."clans" USING "gin" ((("tag")::"text") "public"."gin_trgm_ops");


--
-- Name: idx_conversation_members_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversation_members_conversation" ON "public"."conversation_members" USING "btree" ("conversation_id");


--
-- Name: idx_conversation_members_user_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversation_members_user_state" ON "public"."conversation_members" USING "btree" ("user_id", "is_pinned" DESC, "joined_at" DESC);


--
-- Name: idx_conversation_messages_conversation_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversation_messages_conversation_created_at" ON "public"."conversation_messages" USING "btree" ("conversation_id", "created_at" DESC);


--
-- Name: idx_conversation_messages_json_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversation_messages_json_metadata" ON "public"."conversation_messages" USING "gin" ("json_metadata");


--
-- Name: idx_conversation_messages_sender_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversation_messages_sender_created_at" ON "public"."conversation_messages" USING "btree" ("sender_id", "created_at" DESC);


--
-- Name: idx_conversations_clan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversations_clan_id" ON "public"."conversations" USING "btree" ("clan_id");


--
-- Name: idx_conversations_game_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversations_game_id" ON "public"."conversations" USING "btree" ("game_id");


--
-- Name: idx_conversations_kind_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_conversations_kind_created_at" ON "public"."conversations" USING "btree" ("kind", "created_at" DESC);


--
-- Name: idx_email_verification_logs_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_verification_logs_token" ON "public"."email_verification_logs" USING "btree" ("token");


--
-- Name: idx_email_verification_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_verification_logs_user_id" ON "public"."email_verification_logs" USING "btree" ("user_id");


--
-- Name: idx_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_events_created_at" ON "public"."events" USING "btree" ("created_at" DESC);


--
-- Name: idx_events_event_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_events_event_data_gin" ON "public"."events" USING "gin" ("event_data");


--
-- Name: idx_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_events_event_type" ON "public"."events" USING "btree" ("event_type");


--
-- Name: idx_events_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_events_session_id" ON "public"."events" USING "btree" ("session_id");


--
-- Name: idx_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_events_user_id" ON "public"."events" USING "btree" ("user_id");


--
-- Name: idx_feature_flag_audit_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_feature_flag_audit_changed_by" ON "public"."feature_flag_audit" USING "btree" ("changed_by");


--
-- Name: idx_feature_flag_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_feature_flag_audit_created_at" ON "public"."feature_flag_audit" USING "btree" ("created_at" DESC);


--
-- Name: idx_feature_flag_audit_flag_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_feature_flag_audit_flag_name" ON "public"."feature_flag_audit" USING "btree" ("flag_name");


--
-- Name: idx_feature_flags_access_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_feature_flags_access_level" ON "public"."feature_flags" USING "btree" ("access_level");


--
-- Name: idx_feature_flags_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_feature_flags_category" ON "public"."feature_flags" USING "btree" ("category");


--
-- Name: idx_feature_flags_flag_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_feature_flags_flag_name" ON "public"."feature_flags" USING "btree" ("flag_name");


--
-- Name: idx_feature_flags_is_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_feature_flags_is_enabled" ON "public"."feature_flags" USING "btree" ("is_enabled");


--
-- Name: idx_feature_flags_target_criteria_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_feature_flags_target_criteria_gin" ON "public"."feature_flags" USING "gin" ("target_criteria");


--
-- Name: idx_friendships_friend_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_friendships_friend_id" ON "public"."friendships" USING "btree" ("friend_id");


--
-- Name: idx_friendships_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_friendships_status" ON "public"."friendships" USING "btree" ("status");


--
-- Name: idx_friendships_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_friendships_user_id" ON "public"."friendships" USING "btree" ("user_id");


--
-- Name: idx_game_moves_move_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_moves_move_data_gin" ON "public"."game_moves" USING "gin" ("move_data");


--
-- Name: idx_game_moves_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_moves_player_id" ON "public"."game_moves" USING "btree" ("player_id");


--
-- Name: idx_game_moves_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_moves_room_id" ON "public"."game_moves" USING "btree" ("room_id");


--
-- Name: idx_game_moves_turn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_moves_turn" ON "public"."game_moves" USING "btree" ("room_id", "turn_number");


--
-- Name: idx_game_rooms_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_rooms_created_at" ON "public"."game_rooms" USING "btree" ("created_at" DESC);


--
-- Name: idx_game_rooms_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_rooms_expires_at" ON "public"."game_rooms" USING "btree" ("expires_at");


--
-- Name: idx_game_rooms_host_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_rooms_host_id" ON "public"."game_rooms" USING "btree" ("host_id");


--
-- Name: idx_game_rooms_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_rooms_map_id" ON "public"."game_rooms" USING "btree" ("map_id");


--
-- Name: idx_game_rooms_room_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_game_rooms_room_code_unique" ON "public"."game_rooms" USING "btree" ("room_code");


--
-- Name: idx_game_rooms_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_rooms_started_at" ON "public"."game_rooms" USING "btree" ("started_at" DESC);


--
-- Name: idx_game_rooms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_rooms_status" ON "public"."game_rooms" USING "btree" ("status");


--
-- Name: idx_game_states_ai_players_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_states_ai_players_gin" ON "public"."game_states" USING "gin" ("ai_players");


--
-- Name: idx_game_states_current_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_states_current_player" ON "public"."game_states" USING "btree" ("current_player_id");


--
-- Name: idx_game_states_game_log_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_states_game_log_gin" ON "public"."game_states" USING "gin" ("game_log");


--
-- Name: idx_game_states_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_states_phase" ON "public"."game_states" USING "btree" ("game_phase");


--
-- Name: idx_game_states_player_stats_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_states_player_stats_gin" ON "public"."game_states" USING "gin" ("player_stats");


--
-- Name: idx_game_states_replay_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_states_replay_data_gin" ON "public"."game_states" USING "gin" ("replay_data");


--
-- Name: idx_game_states_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_states_room_id" ON "public"."game_states" USING "btree" ("room_id");


--
-- Name: idx_game_states_territories_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_states_territories_gin" ON "public"."game_states" USING "gin" ("territories");


--
-- Name: idx_game_territory_modifiers_game; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_game_territory_modifiers_game" ON "public"."game_territory_modifiers" USING "btree" ("game_id");


--
-- Name: idx_map_approval_requests_decision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_approval_requests_decision" ON "public"."map_approval_requests" USING "btree" ("decision");


--
-- Name: idx_map_approval_requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_approval_requests_pending" ON "public"."map_approval_requests" USING "btree" ("created_at") WHERE ("decision" IS NULL);


--
-- Name: idx_map_approval_requests_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_approval_requests_requester" ON "public"."map_approval_requests" USING "btree" ("requester_id");


--
-- Name: idx_map_approval_requests_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_approval_requests_version" ON "public"."map_approval_requests" USING "btree" ("version_id");


--
-- Name: idx_map_asset_purge_runs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_asset_purge_runs_type" ON "public"."map_asset_purge_runs" USING "btree" ("run_type", "started_at" DESC);


--
-- Name: idx_map_collaborators_map_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_collaborators_map_role" ON "public"."map_collaborators" USING "btree" ("map_id", "role");


--
-- Name: idx_map_collaborators_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_collaborators_user" ON "public"."map_collaborators" USING "btree" ("user_id");


--
-- Name: idx_map_drafts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_drafts_user_id" ON "public"."map_drafts" USING "btree" ("user_id", "draft_status");


--
-- Name: idx_map_images_staging_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_images_staging_user_id" ON "public"."map_images_staging" USING "btree" ("user_id") WHERE ("is_deleted" = false);


--
-- Name: idx_map_ratings_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_ratings_map_id" ON "public"."map_ratings" USING "btree" ("map_id");


--
-- Name: idx_map_reviews_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_reviews_map_id" ON "public"."map_reviews" USING "btree" ("map_id");


--
-- Name: idx_map_reviews_reviewer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_reviews_reviewer_id" ON "public"."map_reviews" USING "btree" ("reviewer_id");


--
-- Name: idx_map_sectors_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_sectors_map_id" ON "public"."map_sectors" USING "btree" ("map_id");


--
-- Name: idx_map_sectors_requirements_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_sectors_requirements_gin" ON "public"."map_sectors" USING "gin" ("requirements");


--
-- Name: idx_map_submission_logs_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_submission_logs_map_id" ON "public"."map_submission_logs" USING "btree" ("map_id");


--
-- Name: idx_map_submissions_review_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_submissions_review_status" ON "public"."map_submissions" USING "btree" ("review_status");


--
-- Name: idx_map_submissions_submission_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_submissions_submission_data_gin" ON "public"."map_submissions" USING "gin" ("submission_data");


--
-- Name: idx_map_submissions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_submissions_user_id" ON "public"."map_submissions" USING "btree" ("user_id");


--
-- Name: idx_map_territories_capital_for_players_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_territories_capital_for_players_gin" ON "public"."map_territories" USING "gin" ("capital_for_players");


--
-- Name: idx_map_territories_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_territories_map_id" ON "public"."map_territories" USING "btree" ("map_id");


--
-- Name: idx_map_territories_polygon_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_territories_polygon_data_gin" ON "public"."map_territories" USING "gin" ("polygon_data");


--
-- Name: idx_map_territory_modifiers_map; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_territory_modifiers_map" ON "public"."map_territory_modifiers" USING "btree" ("map_id");


--
-- Name: idx_map_territory_modifiers_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_map_territory_modifiers_unique" ON "public"."map_territory_modifiers" USING "btree" ("map_id", "territory_id", "modifier_template_id");


--
-- Name: idx_map_versions_map_id_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_map_versions_map_id_version" ON "public"."map_versions" USING "btree" ("map_id", "version_number" DESC);


--
-- Name: idx_maps_capital_assignments_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_capital_assignments_gin" ON "public"."maps" USING "gin" ("capital_assignments");


--
-- Name: idx_maps_capital_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_capital_metadata_gin" ON "public"."maps" USING "gin" ("capital_metadata");


--
-- Name: idx_maps_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_created_at" ON "public"."maps" USING "btree" ("created_at");


--
-- Name: idx_maps_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_created_by" ON "public"."maps" USING "btree" ("creator_id");


--
-- Name: idx_maps_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_creator_id" ON "public"."maps" USING "btree" ("creator_id");


--
-- Name: idx_maps_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_is_active" ON "public"."maps" USING "btree" ("is_active");


--
-- Name: idx_maps_is_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_is_featured" ON "public"."maps" USING "btree" ("is_featured") WHERE ("is_featured" = true);


--
-- Name: idx_maps_is_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_is_public" ON "public"."maps" USING "btree" ("is_public");


--
-- Name: idx_maps_is_vip_only; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_is_vip_only" ON "public"."maps" USING "btree" ("is_vip_only") WHERE ("is_vip_only" = true);


--
-- Name: idx_maps_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_name_trgm" ON "public"."maps" USING "gin" ("name" "public"."gin_trgm_ops");


--
-- Name: idx_maps_play_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_play_count" ON "public"."maps" USING "btree" ("play_count" DESC);


--
-- Name: idx_maps_rating_average; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_rating_average" ON "public"."maps" USING "btree" ("rating_average") WHERE ("rating_average" IS NOT NULL);


--
-- Name: idx_maps_reviewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_reviewed_at" ON "public"."maps" USING "btree" ("reviewed_at");


--
-- Name: idx_maps_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_status" ON "public"."maps" USING "btree" ("status");


--
-- Name: idx_maps_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_maps_submitted_at" ON "public"."maps" USING "btree" ("submitted_at");


--
-- Name: idx_matchmaking_queue_joined_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_matchmaking_queue_joined_at" ON "public"."matchmaking_queue" USING "btree" ("joined_at");


--
-- Name: idx_matchmaking_queue_preferences_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_matchmaking_queue_preferences_gin" ON "public"."matchmaking_queue" USING "gin" ("preferences");


--
-- Name: idx_matchmaking_queue_priority_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_matchmaking_queue_priority_score" ON "public"."matchmaking_queue" USING "btree" ("priority_score" DESC);


--
-- Name: idx_matchmaking_queue_queue_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_matchmaking_queue_queue_type" ON "public"."matchmaking_queue" USING "btree" ("queue_type");


--
-- Name: idx_matchmaking_queue_skill_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_matchmaking_queue_skill_rating" ON "public"."matchmaking_queue" USING "btree" ("skill_rating");


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);


--
-- Name: idx_notifications_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_data_gin" ON "public"."notifications" USING "gin" ("data");


--
-- Name: idx_notifications_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user_created_at" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read_at" IS NULL);


--
-- Name: idx_password_reset_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_password_reset_tokens_expires_at" ON "public"."password_reset_tokens" USING "btree" ("expires_at");


--
-- Name: idx_password_reset_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_password_reset_tokens_token" ON "public"."password_reset_tokens" USING "btree" ("token");


--
-- Name: idx_password_reset_tokens_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_password_reset_tokens_user_created_at" ON "public"."password_reset_tokens" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_password_reset_tokens_user_id" ON "public"."password_reset_tokens" USING "btree" ("user_id");


--
-- Name: idx_pgr_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pgr_user_created_at" ON "public"."player_game_results" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_pgr_user_wins; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pgr_user_wins" ON "public"."player_game_results" USING "btree" ("user_id") WHERE ("is_winner" = true);


--
-- Name: idx_player_game_results_room_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_player_game_results_room_position" ON "public"."player_game_results" USING "btree" ("room_id", "position");


--
-- Name: idx_player_game_results_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_player_game_results_user" ON "public"."player_game_results" USING "btree" ("user_id");


--
-- Name: idx_player_stats_favorite_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_player_stats_favorite_map_id" ON "public"."player_stats" USING "btree" ("favorite_map_id");


--
-- Name: idx_player_stats_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_player_stats_user_id" ON "public"."player_stats" USING "btree" ("user_id");


--
-- Name: idx_rating_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rating_history_created_at" ON "public"."rating_history" USING "btree" ("created_at" DESC);


--
-- Name: idx_rating_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rating_history_user_id" ON "public"."rating_history" USING "btree" ("user_id");


--
-- Name: idx_room_players_bank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_room_players_bank" ON "public"."room_players" USING "btree" ("room_id", "user_id");


--
-- Name: idx_room_players_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_room_players_room_id" ON "public"."room_players" USING "btree" ("room_id");


--
-- Name: idx_room_players_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_room_players_team_id" ON "public"."room_players" USING "btree" ("team_id");


--
-- Name: idx_room_players_unique_color; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_room_players_unique_color" ON "public"."room_players" USING "btree" ("room_id", "selected_color") WHERE ("selected_color" IS NOT NULL);


--
-- Name: idx_room_players_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_room_players_user_id" ON "public"."room_players" USING "btree" ("user_id");


--
-- Name: idx_schema_migrations_filename; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_schema_migrations_filename" ON "public"."schema_migrations" USING "btree" ("filename");


--
-- Name: idx_schema_migrations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_schema_migrations_status" ON "public"."schema_migrations" USING "btree" ("status");


--
-- Name: idx_skill_leaderboard_cache_rankings_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_skill_leaderboard_cache_rankings_gin" ON "public"."skill_leaderboard_cache" USING "gin" ("rankings");


--
-- Name: idx_territory_adjacencies_map_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_territory_adjacencies_map_id" ON "public"."territory_adjacencies" USING "btree" ("map_id");


--
-- Name: idx_territory_modifier_templates_effect_value_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_territory_modifier_templates_effect_value_gin" ON "public"."territory_modifier_templates" USING "gin" ("effect_value");


--
-- Name: idx_user_account_status_admin_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_account_status_admin_user_id" ON "public"."user_account_status" USING "btree" ("admin_user_id");


--
-- Name: idx_user_account_status_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_account_status_status" ON "public"."user_account_status" USING "btree" ("status");


--
-- Name: idx_user_achievements_achievement_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_achievements_achievement_id" ON "public"."user_achievements" USING "btree" ("achievement_id");


--
-- Name: idx_user_achievements_progress_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_achievements_progress_data_gin" ON "public"."user_achievements" USING "gin" ("progress_data");


--
-- Name: idx_user_achievements_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_achievements_user_id" ON "public"."user_achievements" USING "btree" ("user_id");


--
-- Name: idx_user_admin_roles_assigned_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_admin_roles_assigned_by" ON "public"."user_admin_roles" USING "btree" ("assigned_by");


--
-- Name: idx_user_admin_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_admin_roles_role_id" ON "public"."user_admin_roles" USING "btree" ("role_id");


--
-- Name: idx_user_admin_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_admin_roles_user_id" ON "public"."user_admin_roles" USING "btree" ("user_id");


--
-- Name: idx_user_bans_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_bans_admin_id" ON "public"."user_bans" USING "btree" ("admin_id");


--
-- Name: idx_user_bans_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_bans_user_id" ON "public"."user_bans" USING "btree" ("user_id");


--
-- Name: idx_user_behavior_patterns_confidence_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_behavior_patterns_confidence_score" ON "public"."user_behavior_patterns" USING "btree" ("confidence_score" DESC);


--
-- Name: idx_user_behavior_patterns_pattern_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_behavior_patterns_pattern_data_gin" ON "public"."user_behavior_patterns" USING "gin" ("pattern_data");


--
-- Name: idx_user_behavior_patterns_pattern_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_behavior_patterns_pattern_type" ON "public"."user_behavior_patterns" USING "btree" ("pattern_type");


--
-- Name: idx_user_behavior_patterns_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_behavior_patterns_user_id" ON "public"."user_behavior_patterns" USING "btree" ("user_id");


--
-- Name: idx_user_blocks_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_blocks_blocked" ON "public"."user_blocks" USING "btree" ("blocked_id");


--
-- Name: idx_user_blocks_blocker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_blocks_blocker" ON "public"."user_blocks" USING "btree" ("blocker_id", "created_at" DESC);


--
-- Name: idx_user_clan_preferences_notifications; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_clan_preferences_notifications" ON "public"."user_clan_preferences" USING "gin" ("notification_settings");


--
-- Name: idx_user_feature_flags_flag_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_feature_flags_flag_name" ON "public"."user_feature_flags" USING "btree" ("flag_name");


--
-- Name: idx_user_feature_flags_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_feature_flags_user_id" ON "public"."user_feature_flags" USING "btree" ("user_id");


--
-- Name: idx_user_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_preferences_user_id" ON "public"."user_preferences" USING "btree" ("user_id");


--
-- Name: idx_user_reports_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_reports_admin_id" ON "public"."user_reports" USING "btree" ("admin_id");


--
-- Name: idx_user_reports_evidence_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_reports_evidence_gin" ON "public"."user_reports" USING "gin" ("evidence");


--
-- Name: idx_user_reports_reported_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_reports_reported_user_id" ON "public"."user_reports" USING "btree" ("reported_user_id");


--
-- Name: idx_user_reports_reporter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_reports_reporter_id" ON "public"."user_reports" USING "btree" ("reporter_id");


--
-- Name: idx_user_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_reports_status" ON "public"."user_reports" USING "btree" ("status");


--
-- Name: idx_user_sessions_device_info_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_sessions_device_info_gin" ON "public"."user_sessions" USING "gin" ("device_info");


--
-- Name: idx_user_sessions_ended_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_sessions_ended_at" ON "public"."user_sessions" USING "btree" ("ended_at" DESC);


--
-- Name: idx_user_sessions_session_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_sessions_session_data_gin" ON "public"."user_sessions" USING "gin" ("session_data");


--
-- Name: idx_user_sessions_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_sessions_started_at" ON "public"."user_sessions" USING "btree" ("started_at" DESC);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_sessions_user_id" ON "public"."user_sessions" USING "btree" ("user_id");


--
-- Name: idx_user_terms_acceptance_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_user_terms_acceptance_unique" ON "public"."user_terms_acceptance" USING "btree" ("user_id", "feature_type", "terms_version");


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_created_at" ON "public"."users" USING "btree" ("created_at" DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");


--
-- Name: idx_users_is_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_is_admin" ON "public"."users" USING "btree" ("is_admin") WHERE ("is_admin" = true);


--
-- Name: idx_users_is_vip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_is_vip" ON "public"."users" USING "btree" ("is_vip") WHERE ("is_vip" = true);


--
-- Name: idx_users_last_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_last_login" ON "public"."users" USING "btree" ("last_login" DESC);


--
-- Name: idx_users_premium_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_premium_tier" ON "public"."users" USING "btree" ("premium_tier") WHERE (("premium_tier")::"text" <> 'free'::"text");


--
-- Name: idx_users_skill_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_skill_rating" ON "public"."users" USING "btree" ("skill_rating" DESC);


--
-- Name: idx_users_terms_accepted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_terms_accepted" ON "public"."users" USING "btree" ("terms_accepted_at") WHERE ("terms_accepted_at" IS NOT NULL);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_username" ON "public"."users" USING "btree" ("username");


--
-- Name: idx_users_username_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_username_trgm" ON "public"."users" USING "gin" ("username" "public"."gin_trgm_ops");


--
-- Name: web_push_subscriptions_user_endpoint_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "web_push_subscriptions_user_endpoint_idx" ON "public"."web_push_subscriptions" USING "btree" ("user_id", "endpoint");


--
-- Name: web_push_subscriptions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "web_push_subscriptions_user_idx" ON "public"."web_push_subscriptions" USING "btree" ("user_id");


--
-- Name: conversation_members conversation_members_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "conversation_members_set_updated_at" BEFORE UPDATE ON "public"."conversation_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: conversation_messages conversation_messages_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "conversation_messages_set_updated_at" BEFORE UPDATE ON "public"."conversation_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: conversations conversations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "conversations_set_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: feature_flags feature_flag_audit_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "feature_flag_audit_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."feature_flags" FOR EACH ROW EXECUTE FUNCTION "public"."log_feature_flag_change"();


--
-- Name: clan_announcements trg_clan_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_announcements_updated_at" BEFORE UPDATE ON "public"."clan_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clan_applications trg_clan_applications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_applications_updated_at" BEFORE UPDATE ON "public"."clan_applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clan_invitations trg_clan_invitations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_invitations_updated_at" BEFORE UPDATE ON "public"."clan_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clan_join_requests trg_clan_join_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_join_requests_updated_at" BEFORE UPDATE ON "public"."clan_join_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clan_members trg_clan_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_members_updated_at" BEFORE UPDATE ON "public"."clan_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clan_objectives trg_clan_objectives_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_objectives_updated_at" BEFORE UPDATE ON "public"."clan_objectives" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clan_roles trg_clan_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_roles_updated_at" BEFORE UPDATE ON "public"."clan_roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clan_war_matches trg_clan_war_matches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_war_matches_updated_at" BEFORE UPDATE ON "public"."clan_war_matches" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clan_wars trg_clan_wars_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clan_wars_updated_at" BEFORE UPDATE ON "public"."clan_wars" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: clans trg_clans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clans_updated_at" BEFORE UPDATE ON "public"."clans" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: map_approval_requests trg_map_approval_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_map_approval_requests_updated_at" BEFORE UPDATE ON "public"."map_approval_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_map_approval_requests_updated_at"();


--
-- Name: map_drafts trg_map_drafts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_map_drafts_updated_at" BEFORE UPDATE ON "public"."map_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: map_images_staging trg_map_images_staging_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_map_images_staging_updated_at" BEFORE UPDATE ON "public"."map_images_staging" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: map_reviews trg_map_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_map_reviews_updated_at" BEFORE UPDATE ON "public"."map_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_map_reviews_updated_at"();


--
-- Name: map_submissions trg_map_submissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_map_submissions_updated_at" BEFORE UPDATE ON "public"."map_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: user_clan_preferences trg_user_clan_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_user_clan_preferences_updated_at" BEFORE UPDATE ON "public"."user_clan_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: admin_roles update_admin_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_admin_roles_updated_at" BEFORE UPDATE ON "public"."admin_roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: feature_flags update_feature_flags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_feature_flags_updated_at" BEFORE UPDATE ON "public"."feature_flags" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: game_rooms update_game_rooms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_game_rooms_updated_at" BEFORE UPDATE ON "public"."game_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: map_ratings update_map_ratings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_map_ratings_updated_at" BEFORE UPDATE ON "public"."map_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: maps update_maps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_maps_updated_at" BEFORE UPDATE ON "public"."maps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: player_stats update_player_stats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_player_stats_updated_at" BEFORE UPDATE ON "public"."player_stats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: user_behavior_patterns update_user_behavior_patterns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_user_behavior_patterns_updated_at" BEFORE UPDATE ON "public"."user_behavior_patterns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: user_preferences update_user_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: user_preferences user_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_preferences_updated_at"();


--
-- Name: web_push_subscriptions web_push_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "web_push_subscriptions_updated_at" BEFORE UPDATE ON "public"."web_push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_web_push_subscriptions_updated_at"();


--
-- Name: admin_activity_logs admin_activity_logs_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: admin_notifications admin_notifications_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: capital_eliminations capital_eliminations_eliminated_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."capital_eliminations"
    ADD CONSTRAINT "capital_eliminations_eliminated_player_id_fkey" FOREIGN KEY ("eliminated_player_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: capital_eliminations capital_eliminations_eliminating_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."capital_eliminations"
    ADD CONSTRAINT "capital_eliminations_eliminating_player_id_fkey" FOREIGN KEY ("conqueror_player_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: capital_eliminations capital_eliminations_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."capital_eliminations"
    ADD CONSTRAINT "capital_eliminations_room_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;


--
-- Name: clan_activity_log clan_activity_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_activity_log"
    ADD CONSTRAINT "clan_activity_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: clan_activity_log clan_activity_log_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_activity_log"
    ADD CONSTRAINT "clan_activity_log_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_announcements clan_announcements_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_announcements"
    ADD CONSTRAINT "clan_announcements_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: clan_announcements clan_announcements_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_announcements"
    ADD CONSTRAINT "clan_announcements_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_applications clan_applications_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_applications"
    ADD CONSTRAINT "clan_applications_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_applications clan_applications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_applications"
    ADD CONSTRAINT "clan_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: clan_applications clan_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_applications"
    ADD CONSTRAINT "clan_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: clan_chat_messages clan_chat_messages_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_chat_messages"
    ADD CONSTRAINT "clan_chat_messages_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_chat_messages clan_chat_messages_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_chat_messages"
    ADD CONSTRAINT "clan_chat_messages_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: clan_chat_messages clan_chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_chat_messages"
    ADD CONSTRAINT "clan_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: clan_invitations clan_invitations_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_invitations"
    ADD CONSTRAINT "clan_invitations_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_invitations clan_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_invitations"
    ADD CONSTRAINT "clan_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: clan_invitations clan_invitations_invited_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_invitations"
    ADD CONSTRAINT "clan_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: clan_join_requests clan_join_requests_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_join_requests"
    ADD CONSTRAINT "clan_join_requests_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_join_requests clan_join_requests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_join_requests"
    ADD CONSTRAINT "clan_join_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: clan_join_requests clan_join_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_join_requests"
    ADD CONSTRAINT "clan_join_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: clan_join_requests clan_join_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_join_requests"
    ADD CONSTRAINT "clan_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: clan_members clan_members_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_members"
    ADD CONSTRAINT "clan_members_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_members clan_members_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_members"
    ADD CONSTRAINT "clan_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."clan_roles"("id") ON DELETE SET NULL;


--
-- Name: clan_members clan_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_members"
    ADD CONSTRAINT "clan_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: clan_objectives clan_objectives_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_objectives"
    ADD CONSTRAINT "clan_objectives_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_roles clan_roles_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_roles"
    ADD CONSTRAINT "clan_roles_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_war_matches clan_war_matches_clan_war_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_war_matches"
    ADD CONSTRAINT "clan_war_matches_clan_war_id_fkey" FOREIGN KEY ("clan_war_id") REFERENCES "public"."clan_wars"("id") ON DELETE CASCADE;


--
-- Name: clan_war_matches clan_war_matches_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_war_matches"
    ADD CONSTRAINT "clan_war_matches_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."game_rooms"("id") ON DELETE SET NULL;


--
-- Name: clan_war_matches clan_war_matches_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_war_matches"
    ADD CONSTRAINT "clan_war_matches_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE SET NULL;


--
-- Name: clan_wars clan_wars_clan_id_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_wars"
    ADD CONSTRAINT "clan_wars_clan_id_a_fkey" FOREIGN KEY ("clan_id_a") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clan_wars clan_wars_clan_id_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clan_wars"
    ADD CONSTRAINT "clan_wars_clan_id_b_fkey" FOREIGN KEY ("clan_id_b") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: clans clans_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clans"
    ADD CONSTRAINT "clans_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: conversation_members conversation_members_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;


--
-- Name: conversation_members conversation_members_last_read_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_last_read_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE SET NULL;


--
-- Name: conversation_members conversation_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: conversations conversations_clan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE CASCADE;


--
-- Name: conversations conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: conversations conversations_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."game_rooms"("id") ON DELETE SET NULL;


--
-- Name: email_verification_logs email_verification_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_verification_logs"
    ADD CONSTRAINT "email_verification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: events events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: feature_flag_audit feature_flag_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feature_flag_audit"
    ADD CONSTRAINT "feature_flag_audit_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id");


--
-- Name: feature_flags feature_flags_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: friendships friendships_friend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: friendships friendships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: game_moves game_moves_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_moves"
    ADD CONSTRAINT "game_moves_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: game_moves game_moves_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_moves"
    ADD CONSTRAINT "game_moves_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;


--
-- Name: game_results game_results_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_results"
    ADD CONSTRAINT "game_results_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE SET NULL;


--
-- Name: game_results game_results_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_results"
    ADD CONSTRAINT "game_results_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;


--
-- Name: game_results game_results_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_results"
    ADD CONSTRAINT "game_results_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id");


--
-- Name: game_rooms game_rooms_current_turn_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_rooms"
    ADD CONSTRAINT "game_rooms_current_turn_user_id_fkey" FOREIGN KEY ("current_turn_user_id") REFERENCES "public"."users"("id");


--
-- Name: game_rooms game_rooms_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_rooms"
    ADD CONSTRAINT "game_rooms_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: game_rooms game_rooms_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_rooms"
    ADD CONSTRAINT "game_rooms_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: game_rooms game_rooms_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_rooms"
    ADD CONSTRAINT "game_rooms_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id");


--
-- Name: game_states game_states_current_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_states"
    ADD CONSTRAINT "game_states_current_player_id_fkey" FOREIGN KEY ("current_player_id") REFERENCES "public"."users"("id");


--
-- Name: game_states game_states_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_states"
    ADD CONSTRAINT "game_states_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;


--
-- Name: game_states game_states_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_states"
    ADD CONSTRAINT "game_states_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id");


--
-- Name: game_territory_modifiers game_territory_modifiers_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_territory_modifiers"
    ADD CONSTRAINT "game_territory_modifiers_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id");


--
-- Name: game_territory_modifiers game_territory_modifiers_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_territory_modifiers"
    ADD CONSTRAINT "game_territory_modifiers_room_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;


--
-- Name: game_territory_modifiers game_territory_modifiers_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."game_territory_modifiers"
    ADD CONSTRAINT "game_territory_modifiers_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."territory_modifier_templates"("id");


--
-- Name: map_approval_requests map_approval_requests_assigned_moderator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_approval_requests"
    ADD CONSTRAINT "map_approval_requests_assigned_moderator_id_fkey" FOREIGN KEY ("assigned_moderator_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: map_approval_requests map_approval_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_approval_requests"
    ADD CONSTRAINT "map_approval_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: map_approval_requests map_approval_requests_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_approval_requests"
    ADD CONSTRAINT "map_approval_requests_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."map_versions"("id") ON DELETE CASCADE;


--
-- Name: map_collaborators map_collaborators_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_collaborators"
    ADD CONSTRAINT "map_collaborators_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: map_collaborators map_collaborators_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_collaborators"
    ADD CONSTRAINT "map_collaborators_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: map_collaborators map_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_collaborators"
    ADD CONSTRAINT "map_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: map_sectors map_continents_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_sectors"
    ADD CONSTRAINT "map_continents_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: map_drafts map_drafts_parent_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_drafts"
    ADD CONSTRAINT "map_drafts_parent_map_id_fkey" FOREIGN KEY ("parent_map_id") REFERENCES "public"."maps"("id") ON DELETE SET NULL;


--
-- Name: map_drafts map_drafts_staging_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_drafts"
    ADD CONSTRAINT "map_drafts_staging_image_id_fkey" FOREIGN KEY ("staging_image_id") REFERENCES "public"."map_images_staging"("id") ON DELETE SET NULL;


--
-- Name: map_drafts map_drafts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_drafts"
    ADD CONSTRAINT "map_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: map_images_staging map_images_staging_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_images_staging"
    ADD CONSTRAINT "map_images_staging_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: map_ratings map_ratings_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_ratings"
    ADD CONSTRAINT "map_ratings_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: map_ratings map_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_ratings"
    ADD CONSTRAINT "map_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: map_reviews map_reviews_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_reviews"
    ADD CONSTRAINT "map_reviews_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: map_reviews map_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_reviews"
    ADD CONSTRAINT "map_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: map_submission_logs map_submission_logs_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_submission_logs"
    ADD CONSTRAINT "map_submission_logs_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: map_submission_logs map_submission_logs_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_submission_logs"
    ADD CONSTRAINT "map_submission_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: map_submissions map_submissions_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_submissions"
    ADD CONSTRAINT "map_submissions_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: map_submissions map_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_submissions"
    ADD CONSTRAINT "map_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: map_territories map_territories_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_territories"
    ADD CONSTRAINT "map_territories_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: map_territory_modifiers map_territory_modifiers_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_territory_modifiers"
    ADD CONSTRAINT "map_territory_modifiers_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: map_territory_modifiers map_territory_modifiers_modifier_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_territory_modifiers"
    ADD CONSTRAINT "map_territory_modifiers_modifier_template_id_fkey" FOREIGN KEY ("modifier_template_id") REFERENCES "public"."territory_modifier_templates"("id");


--
-- Name: map_versions map_versions_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_versions"
    ADD CONSTRAINT "map_versions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: map_versions map_versions_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."map_versions"
    ADD CONSTRAINT "map_versions_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: maps maps_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maps"
    ADD CONSTRAINT "maps_created_by_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id");


--
-- Name: maps maps_parent_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maps"
    ADD CONSTRAINT "maps_parent_map_id_fkey" FOREIGN KEY ("parent_map_id") REFERENCES "public"."maps"("id") ON DELETE SET NULL;


--
-- Name: maps maps_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."maps"
    ADD CONSTRAINT "maps_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: matchmaking_queue matchmaking_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."matchmaking_queue"
    ADD CONSTRAINT "matchmaking_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: player_game_results player_game_results_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_game_results"
    ADD CONSTRAINT "player_game_results_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_results"("room_id") ON DELETE CASCADE;


--
-- Name: player_game_results player_game_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_game_results"
    ADD CONSTRAINT "player_game_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: player_stats player_stats_favorite_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_stats"
    ADD CONSTRAINT "player_stats_favorite_map_id_fkey" FOREIGN KEY ("favorite_map_id") REFERENCES "public"."maps"("id");


--
-- Name: player_stats player_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_stats"
    ADD CONSTRAINT "player_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: rating_history rating_history_game_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rating_history"
    ADD CONSTRAINT "rating_history_game_room_id_fkey" FOREIGN KEY ("game_room_id") REFERENCES "public"."game_rooms"("id");


--
-- Name: rating_history rating_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rating_history"
    ADD CONSTRAINT "rating_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: room_players room_players_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE;


--
-- Name: room_players room_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_players"
    ADD CONSTRAINT "room_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: territory_adjacencies territory_adjacencies_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."territory_adjacencies"
    ADD CONSTRAINT "territory_adjacencies_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE CASCADE;


--
-- Name: user_account_status user_account_status_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_account_status"
    ADD CONSTRAINT "user_account_status_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id");


--
-- Name: user_account_status user_account_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_account_status"
    ADD CONSTRAINT "user_account_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_admin_roles user_admin_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_admin_roles"
    ADD CONSTRAINT "user_admin_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id");


--
-- Name: user_admin_roles user_admin_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_admin_roles"
    ADD CONSTRAINT "user_admin_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE CASCADE;


--
-- Name: user_admin_roles user_admin_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_admin_roles"
    ADD CONSTRAINT "user_admin_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_bans user_bans_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id");


--
-- Name: user_bans user_bans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_behavior_patterns user_behavior_patterns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_behavior_patterns"
    ADD CONSTRAINT "user_behavior_patterns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_clan_preferences user_clan_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_clan_preferences"
    ADD CONSTRAINT "user_clan_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_feature_flags user_feature_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_feature_flags"
    ADD CONSTRAINT "user_feature_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_reports user_reports_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id");


--
-- Name: user_reports user_reports_reported_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_reports user_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: user_terms_acceptance user_terms_acceptance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_terms_acceptance"
    ADD CONSTRAINT "user_terms_acceptance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: users users_vip_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_vip_granted_by_fkey" FOREIGN KEY ("vip_granted_by") REFERENCES "public"."users"("id");


--
-- Name: web_push_subscriptions web_push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."web_push_subscriptions"
    ADD CONSTRAINT "web_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict bO8vj6y8B3Isr9gsXXGgeg5wV5vr3ZQ0TRHpElb7bgsAMoTPAABjxLe18Cl68fX

