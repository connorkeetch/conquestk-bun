-- ConquestK Database Schema
-- Generated: 2025-12-12T21:21:18.782Z
-- Single squashed migration for clean deployments

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enum Types
CREATE TYPE conversation_kind AS ENUM ('game', 'direct', 'group', 'team');
CREATE TYPE conversation_member_role AS ENUM ('owner', 'admin', 'member');

-- Sequences
-- Must be created before the tables whose columns default to nextval(); the
-- DEFAULT expression resolves '<name>'::regclass at table-creation time.
CREATE SEQUENCE IF NOT EXISTS client_metrics_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS game_events_seq_seq AS bigint;
CREATE SEQUENCE IF NOT EXISTS web_push_subscriptions_id_seq AS bigint;
CREATE SEQUENCE IF NOT EXISTS game_room_code_seq START WITH 10000;

-- Functions
-- generate_ulid() backs conversation_messages.id (CHAR(26) DEFAULT generate_ulid()).
-- Must exist before that table is created. Relies on pgcrypto's gen_random_bytes().
CREATE OR REPLACE FUNCTION generate_ulid()
RETURNS CHAR(26) AS $$
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
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION public.grant_vip_status(target_user_id uuid, granting_admin_id uuid, reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.log_feature_flag_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.recalc_user_is_admin(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE users u
  SET is_admin = u.is_admin OR EXISTS (
    SELECT 1
    FROM user_admin_roles uar
    WHERE uar.user_id = _user_id
      AND COALESCE(uar.is_active, TRUE) = TRUE
      AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
  )
  WHERE u.id = _user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_vip_status(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_map_approval_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $function$;

CREATE OR REPLACE FUNCTION public.update_map_reviews_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_preferences_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_web_push_subscriptions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_admin_roles_sync_is_admin()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalc_user_is_admin(NEW.user_id);
  ELSIF TG_OP = 'UPDATE' THEN
    -- If a record moved users, recalc both old and new
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      PERFORM public.recalc_user_is_admin(OLD.user_id);
    END IF;
    PERFORM public.recalc_user_is_admin(NEW.user_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_user_is_admin(OLD.user_id);
  END IF;
  RETURN NULL;
END;
$function$;

-- Tables
CREATE TABLE achievements (
  id uuid DEFAULT uuid_generate_v4(),
  name character varying(100) NOT NULL,
  description text NOT NULL,
  category character varying(50) DEFAULT 'general'::character varying NOT NULL,
  icon character varying(100),
  points integer DEFAULT 0 NOT NULL,
  rarity character varying(20) DEFAULT 'common'::character varying NOT NULL,
  unlock_criteria jsonb NOT NULL,
  is_secret boolean DEFAULT false NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE admin_activity_logs (
  id uuid DEFAULT uuid_generate_v4(),
  admin_user_id uuid NOT NULL,
  action_type character varying(50) NOT NULL,
  action_details jsonb DEFAULT '{}'::jsonb NOT NULL,
  target_type character varying(50),
  target_id uuid,
  ip_address inet,
  user_agent text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE admin_notifications (
  id uuid DEFAULT uuid_generate_v4(),
  admin_id uuid,
  type character varying(64) NOT NULL,
  title character varying(255) NOT NULL,
  message text,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_read boolean DEFAULT false NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  read_at timestamp without time zone,
  PRIMARY KEY (id)
);

CREATE TABLE admin_roles (
  id uuid DEFAULT uuid_generate_v4(),
  name character varying(50) NOT NULL,
  description text,
  permissions text[] DEFAULT '{}'::text[] NOT NULL,
  is_super_admin boolean DEFAULT false NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE capital_eliminations (
  id uuid DEFAULT uuid_generate_v4(),
  game_id uuid NOT NULL,
  eliminated_player_id uuid NOT NULL,
  conqueror_player_id uuid NOT NULL,
  eliminated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  capital_territory_id character varying(100) NOT NULL,
  territories_gained integer DEFAULT 0 NOT NULL,
  troops_gained integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_activity_log (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  actor_user_id uuid,
  action_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  target_id uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_announcements (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  title character varying(80) NOT NULL,
  body_markdown text NOT NULL,
  pinned boolean DEFAULT false NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expires_at timestamp without time zone,
  PRIMARY KEY (id)
);

CREATE TABLE clan_applications (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  message text,
  reviewed_by uuid,
  reviewed_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_chat_messages (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  edited_at timestamp without time zone,
  deleted_at timestamp without time zone,
  deleted_by uuid,
  PRIMARY KEY (id)
);

CREATE TABLE clan_invitations (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  invited_user_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  token text NOT NULL,
  expires_at timestamp without time zone,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_join_requests (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  message text,
  created_by uuid NOT NULL,
  token text,
  expires_at timestamp without time zone,
  reviewed_by uuid,
  reviewed_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_members (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid,
  joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  probation_until timestamp without time zone,
  last_active_at timestamp without time zone,
  status text DEFAULT 'active'::text NOT NULL,
  last_role_change_at timestamp without time zone,
  contribution_xp bigint DEFAULT 0 NOT NULL,
  contribution_matches integer DEFAULT 0 NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_objectives (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  objective_type text NOT NULL,
  target_value integer NOT NULL,
  progress_value integer DEFAULT 0 NOT NULL,
  start_at timestamp without time zone NOT NULL,
  end_at timestamp without time zone NOT NULL,
  reward jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_roles (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id uuid NOT NULL,
  name character varying(40) NOT NULL,
  permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
  hierarchy_rank integer NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_war_matches (
  id uuid DEFAULT uuid_generate_v4(),
  clan_war_id uuid NOT NULL,
  game_id uuid,
  map_id uuid,
  participants jsonb DEFAULT '[]'::jsonb NOT NULL,
  result text NOT NULL,
  points_awarded integer DEFAULT 0 NOT NULL,
  replay_url text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clan_wars (
  id uuid DEFAULT uuid_generate_v4(),
  clan_id_a uuid NOT NULL,
  clan_id_b uuid NOT NULL,
  season_id uuid,
  status text DEFAULT 'scheduled'::text NOT NULL,
  scheduled_start timestamp without time zone,
  scheduled_end timestamp without time zone,
  ruleset jsonb DEFAULT '{}'::jsonb NOT NULL,
  score_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  rewards jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE clans (
  id uuid DEFAULT uuid_generate_v4(),
  owner_user_id uuid NOT NULL,
  name character varying(64) NOT NULL,
  tag citext NOT NULL,
  slug text NOT NULL,
  motto character varying(120),
  description text,
  crest_asset_url text,
  banner_asset_url text,
  recruitment_policy text DEFAULT 'application'::text NOT NULL,
  recruitment_status text DEFAULT 'active'::text NOT NULL,
  minimum_rank integer,
  auto_accept_thresholds jsonb DEFAULT '{}'::jsonb NOT NULL,
  language character varying(16),
  region character varying(32),
  time_zone character varying(64),
  privacy text DEFAULT 'public'::text NOT NULL,
  total_xp bigint DEFAULT 0 NOT NULL,
  level integer DEFAULT 1 NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deleted_at timestamp without time zone,
  PRIMARY KEY (id)
);

CREATE TABLE client_metrics (
  id integer DEFAULT nextval('client_metrics_id_seq'::regclass),
  user_id character varying(255),
  session_id character varying(255) NOT NULL,
  game_id character varying(255),
  metrics jsonb NOT NULL,
  stats jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE conversation_members (
  id uuid DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role conversation_member_role DEFAULT 'member'::conversation_member_role NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL,
  last_read_message_id character(26),
  last_read_at timestamp with time zone,
  is_muted boolean DEFAULT false NOT NULL,
  is_pinned boolean DEFAULT false NOT NULL,
  shadow_muted boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE conversation_messages (
  id character(26) DEFAULT generate_ulid(),
  conversation_id uuid NOT NULL,
  sender_id uuid,
  body text NOT NULL,
  json_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  edited_at timestamp with time zone,
  shadow_muted boolean DEFAULT false NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE conversations (
  id uuid DEFAULT uuid_generate_v4(),
  kind conversation_kind NOT NULL,
  title character varying(255),
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_archived boolean DEFAULT false NOT NULL,
  is_read_only boolean DEFAULT false NOT NULL,
  game_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  clan_id uuid,
  PRIMARY KEY (id)
);

CREATE TABLE email_verification_logs (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  email character varying(255) NOT NULL,
  token character varying(255) NOT NULL,
  sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  verified_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE events (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid,
  session_id uuid,
  event_type character varying(100) NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  ip_address inet,
  user_agent text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE feature_flag_audit (
  id uuid DEFAULT uuid_generate_v4(),
  flag_name character varying(100) NOT NULL,
  changed_by uuid,
  change_type character varying(20) NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE feature_flags (
  id uuid DEFAULT uuid_generate_v4(),
  flag_name character varying(100) NOT NULL,
  description text,
  is_enabled boolean DEFAULT false NOT NULL,
  rollout_percentage integer DEFAULT 0 NOT NULL,
  target_criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  access_level character varying(20) DEFAULT 'disabled'::character varying,
  category character varying(50),
  dependencies jsonb DEFAULT '[]'::jsonb,
  metrics jsonb DEFAULT '{}'::jsonb,
  PRIMARY KEY (id)
);

CREATE TABLE friendships (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  friend_id uuid NOT NULL,
  status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  accepted_at timestamp without time zone,
  PRIMARY KEY (id)
);

CREATE TABLE game_battle_logs (
  id uuid DEFAULT uuid_generate_v4(),
  game_id uuid NOT NULL,
  entry_type text NOT NULL,
  job_id text,
  engagement_id text,
  entry_timestamp timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  turn_number integer DEFAULT 1 NOT NULL,
  attacking_territory_id text,
  defending_territory_id text,
  attacker_id uuid,
  defender_id uuid,
  attacker_losses integer,
  defender_losses integer,
  conquered boolean,
  moved_armies integer,
  eliminated_players jsonb DEFAULT '[]'::jsonb NOT NULL,
  initial_from_armies integer,
  initial_to_armies integer,
  total_attacker_losses integer,
  total_defender_losses integer,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE game_events (
  id uuid DEFAULT gen_random_uuid(),
  seq bigint DEFAULT nextval('game_events_seq_seq'::regclass) NOT NULL,
  game_id uuid NOT NULL,
  event_type character varying(50) NOT NULL,
  version bigint NOT NULL,
  player_id uuid,
  payload jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE game_logs (
  id uuid DEFAULT uuid_generate_v4(),
  game_id uuid NOT NULL,
  ts timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  turn_number integer DEFAULT 1 NOT NULL,
  phase character varying(32) DEFAULT 'reinforcement'::character varying NOT NULL,
  move_type character varying(64) NOT NULL,
  actor_id uuid,
  from_territory_id uuid,
  to_territory_id uuid,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE game_move_archive (
  id uuid,
  room_id uuid NOT NULL,
  player_id uuid NOT NULL,
  turn_number integer NOT NULL,
  move_type character varying(50) NOT NULL,
  move_data jsonb NOT NULL,
  is_valid boolean DEFAULT true NOT NULL,
  validation_error text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  archived_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE game_moves (
  id uuid DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL,
  player_id uuid NOT NULL,
  turn_number integer NOT NULL,
  move_type character varying(20) NOT NULL,
  move_data jsonb NOT NULL,
  is_valid boolean DEFAULT true NOT NULL,
  validation_error text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE game_results (
  room_id uuid,
  map_id uuid,
  winner_id uuid,
  duration_seconds integer,
  total_turns integer NOT NULL,
  final_state jsonb NOT NULL,
  player_summary jsonb NOT NULL,
  battle_log jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (room_id)
);

CREATE TABLE game_rooms (
  id uuid DEFAULT uuid_generate_v4(),
  name character varying(100) NOT NULL,
  host_id uuid NOT NULL,
  map_id uuid NOT NULL,
  max_players integer DEFAULT 6 NOT NULL,
  is_private boolean DEFAULT false NOT NULL,
  password_hash character varying(255),
  status character varying(20) DEFAULT 'lobby'::character varying NOT NULL,
  game_mode character varying(20) DEFAULT 'classic'::character varying NOT NULL,
  turn_timer integer DEFAULT 86400 NOT NULL,
  team_mode boolean DEFAULT false NOT NULL,
  number_of_teams integer,
  is_ranked boolean DEFAULT true NOT NULL,
  started_at timestamp without time zone,
  ended_at timestamp without time zone,
  winner_id uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  turn_number integer DEFAULT 0 NOT NULL,
  current_turn_user_id uuid,
  turn_expires_at timestamp with time zone,
  ready_check_started_at timestamp with time zone,
  treasure_config jsonb,
  movement_type text,
  fog_of_war text,
  expires_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + '30 days'::interval),
  room_code bigint DEFAULT nextval('game_room_code_seq'::regclass),
  time_bank_seconds integer DEFAULT 0 NOT NULL,
  grace_window_seconds integer DEFAULT 20 NOT NULL,
  grace_actor_user_id uuid,
  grace_expires_at timestamp without time zone,
  replacement_pending_user_id uuid,
  king_of_the_hill_config jsonb,
  using_time_bank boolean DEFAULT false NOT NULL,
  state_version bigint DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE game_state_snapshots (
  id uuid DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  version bigint NOT NULL,
  state jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE game_states (
  id uuid DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL,
  current_player_id uuid,
  game_phase character varying(20) NOT NULL,
  turn_number integer DEFAULT 1 NOT NULL,
  round_number integer DEFAULT 1 NOT NULL,
  territories jsonb DEFAULT '{}'::jsonb NOT NULL,
  player_stats jsonb DEFAULT '{}'::jsonb NOT NULL,
  replay_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  ai_players jsonb DEFAULT '[]'::jsonb NOT NULL,
  last_activity timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  winner_id uuid,
  turn_stats jsonb DEFAULT '[]'::jsonb NOT NULL,
  game_data jsonb,
  PRIMARY KEY (id)
);

CREATE TABLE game_territory_modifiers (
  id uuid DEFAULT uuid_generate_v4(),
  game_id uuid NOT NULL,
  territory_name character varying(100) NOT NULL,
  template_id uuid NOT NULL,
  applied_by uuid,
  applied_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expires_at timestamp without time zone,
  is_active boolean DEFAULT true NOT NULL,
  territory_id character varying(100),
  defense_bonus integer DEFAULT 0 NOT NULL,
  attack_bonus integer DEFAULT 0 NOT NULL,
  troop_generation_bonus integer DEFAULT 0 NOT NULL,
  movement_restriction boolean DEFAULT false NOT NULL,
  supply_line_bonus boolean DEFAULT false NOT NULL,
  icon character varying(100) DEFAULT '✨'::character varying,
  color character varying(20) DEFAULT '#a855f7'::character varying,
  name character varying(100) DEFAULT 'Special Territory'::character varying,
  PRIMARY KEY (id)
);

CREATE TABLE map_approval_requests (
  id uuid DEFAULT uuid_generate_v4(),
  version_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  assigned_moderator_id uuid,
  submission_notes text,
  priority_level character varying(20) DEFAULT 'normal'::character varying NOT NULL,
  estimated_review_time integer,
  review_started_at timestamp with time zone,
  review_completed_at timestamp with time zone,
  decision character varying(32),
  moderator_feedback text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_asset_purge_runs (
  id uuid DEFAULT uuid_generate_v4(),
  run_type character varying(50) DEFAULT 'staging'::character varying NOT NULL,
  processed_count integer DEFAULT 0 NOT NULL,
  purged_count integer DEFAULT 0 NOT NULL,
  failed_count integer DEFAULT 0 NOT NULL,
  bytes_purged bigint DEFAULT 0 NOT NULL,
  started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at timestamp without time zone,
  duration_ms integer,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_collaborators (
  map_id uuid,
  user_id uuid,
  role character varying(32) DEFAULT 'editor'::character varying NOT NULL,
  assigned_by uuid,
  assigned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (map_id, user_id)
);

CREATE TABLE map_continents (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  name character varying(64) NOT NULL,
  bonus_troops integer DEFAULT 0 NOT NULL,
  color character varying(20),
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_drafts (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  staging_image_id uuid,
  parent_map_id uuid,
  name character varying(150) DEFAULT 'Untitled Map'::character varying NOT NULL,
  description text,
  map_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  territories jsonb DEFAULT '[]'::jsonb NOT NULL,
  sectors jsonb DEFAULT '[]'::jsonb NOT NULL,
  adjacencies jsonb DEFAULT '[]'::jsonb NOT NULL,
  capital_assignments jsonb DEFAULT '{}'::jsonb NOT NULL,
  thumbnail_url character varying(500),
  image_url character varying(500),
  image_width integer,
  image_height integer,
  tags jsonb DEFAULT '[]'::jsonb NOT NULL,
  is_public boolean DEFAULT false NOT NULL,
  draft_status character varying(32) DEFAULT 'editing'::character varying NOT NULL,
  validation_status character varying(32),
  validation_errors jsonb DEFAULT '[]'::jsonb NOT NULL,
  auto_saved_at timestamp without time zone,
  last_edited_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_images_staging (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  filename character varying(255) NOT NULL,
  original_filename character varying(255),
  file_url character varying(500) NOT NULL,
  file_size integer NOT NULL,
  width integer,
  height integer,
  mime_type character varying(100),
  upload_status character varying(32) DEFAULT 'processing'::character varying NOT NULL,
  processing_error text,
  is_deleted boolean DEFAULT false NOT NULL,
  deleted_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deletion_attempts integer DEFAULT 0 NOT NULL,
  last_deletion_attempt timestamp without time zone,
  last_deletion_error text,
  purged_at timestamp without time zone,
  PRIMARY KEY (id)
);

CREATE TABLE map_ratings (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating integer NOT NULL,
  review text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_reviews (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
  notes text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  reviewed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_sectors (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  name character varying(100) NOT NULL,
  bonus_troops integer DEFAULT 0 NOT NULL,
  color character varying(7),
  requirements jsonb DEFAULT '{}'::jsonb NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_submission_logs (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  action character varying(64) NOT NULL,
  performed_by uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_submissions (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid,
  submission_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  user_id uuid,
  review_status character varying(32) DEFAULT 'pending'::character varying,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_territories (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  name character varying(100) NOT NULL,
  polygon_data jsonb NOT NULL,
  sector character varying(50),
  is_capital boolean DEFAULT false NOT NULL,
  capital_for_players jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  continent_id character varying(64),
  continent character varying(64),
  PRIMARY KEY (id)
);

CREATE TABLE map_territory_modifiers (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  territory_id character varying(100),
  modifier_template_id uuid,
  name character varying(100),
  icon character varying(100),
  color character varying(20),
  defense_bonus integer DEFAULT 0 NOT NULL,
  attack_bonus integer DEFAULT 0 NOT NULL,
  troop_generation_bonus integer DEFAULT 0 NOT NULL,
  movement_restriction boolean DEFAULT false NOT NULL,
  supply_line_bonus boolean DEFAULT false NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE map_versions (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  version_number integer NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  territories jsonb DEFAULT '[]'::jsonb NOT NULL,
  sectors jsonb DEFAULT '[]'::jsonb NOT NULL,
  adjacencies jsonb DEFAULT '[]'::jsonb NOT NULL,
  change_summary text,
  changed_by uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE maps (
  id uuid DEFAULT uuid_generate_v4(),
  name character varying(100) NOT NULL,
  description text,
  image_url character varying(500),
  min_players integer DEFAULT 2 NOT NULL,
  max_players integer DEFAULT 8 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  creator_id uuid,
  capital_assignments jsonb DEFAULT '{}'::jsonb NOT NULL,
  capital_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  image_width integer,
  image_height integer,
  is_public boolean DEFAULT true,
  tags text[],
  capital_territories jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  status character varying(20) DEFAULT 'draft'::character varying,
  is_vip_only boolean DEFAULT false,
  min_premium_tier character varying(20) DEFAULT NULL::character varying,
  is_featured boolean DEFAULT false,
  rating_average numeric(3,2) DEFAULT NULL::numeric,
  rating_count integer DEFAULT 0,
  play_count integer DEFAULT 0,
  version integer DEFAULT 1 NOT NULL,
  parent_map_id uuid,
  download_count integer DEFAULT 0 NOT NULL,
  submitted_at timestamp without time zone,
  reviewed_at timestamp without time zone,
  reviewed_by uuid,
  review_notes text,
  rejection_reason text,
  PRIMARY KEY (id)
);

CREATE TABLE match_checksums (
  id uuid DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  seq bigint NOT NULL,
  crc32 integer NOT NULL,
  snapshot bytea,
  computed_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE match_frames (
  id uuid DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  seq bigint NOT NULL,
  player_id uuid NOT NULL,
  commands jsonb NOT NULL,
  committed_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE notifications (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  type character varying(50) NOT NULL,
  title character varying(255) NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  read_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE password_reset_tokens (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  token character varying(255) NOT NULL,
  expires_at timestamp without time zone NOT NULL,
  used_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE player_game_results (
  id uuid DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL,
  user_id uuid NOT NULL,
  position integer NOT NULL,
  is_winner boolean NOT NULL,
  eliminated boolean NOT NULL,
  territories integer NOT NULL,
  armies integer NOT NULL,
  elimination_order integer,
  rating_before integer,
  rating_after integer,
  rating_change integer,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE player_stats (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  games_played integer DEFAULT 0 NOT NULL,
  games_won integer DEFAULT 0 NOT NULL,
  games_lost integer DEFAULT 0 NOT NULL,
  total_eliminations integer DEFAULT 0 NOT NULL,
  total_territories_conquered integer DEFAULT 0 NOT NULL,
  longest_win_streak integer DEFAULT 0 NOT NULL,
  current_win_streak integer DEFAULT 0 NOT NULL,
  favorite_map_id uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE rating_history (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  old_rating integer NOT NULL,
  new_rating integer NOT NULL,
  rating_change integer NOT NULL,
  game_room_id uuid,
  reason character varying(50) NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE room_players (
  id uuid DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL,
  user_id uuid,
  joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  left_at timestamp without time zone,
  player_order integer,
  is_eliminated boolean DEFAULT false NOT NULL,
  elimination_reason character varying(50),
  team_id integer,
  is_ready boolean DEFAULT false NOT NULL,
  ready_at timestamp with time zone,
  is_ai boolean DEFAULT false NOT NULL,
  ai_difficulty character varying(20),
  ai_personality_seed integer,
  ai_player_id uuid,
  selected_color character varying(50),
  time_bank_seconds_remaining integer,
  is_kicked boolean DEFAULT false NOT NULL,
  missed_turns integer DEFAULT 0 NOT NULL,
  last_missed_turn_at timestamp with time zone,
  PRIMARY KEY (id)
);

-- NOTE: schema_migrations is intentionally omitted from the baseline. It is the
-- migration runner's own bookkeeping table, created and maintained by
-- MigrationTracker.createTrackingTable(); including it here would conflict with
-- that table (which already exists when the baseline runs).

CREATE TABLE skill_leaderboard_cache (
  id uuid DEFAULT uuid_generate_v4(),
  period_type character varying(20) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  rankings jsonb NOT NULL,
  generated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE territory_adjacencies (
  id uuid DEFAULT uuid_generate_v4(),
  map_id uuid NOT NULL,
  territory_from character varying(100) NOT NULL,
  territory_to character varying(100) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE territory_modifier_templates (
  id uuid DEFAULT uuid_generate_v4(),
  name character varying(100) NOT NULL,
  description text NOT NULL,
  modifier_type character varying(50) NOT NULL,
  effect_value jsonb NOT NULL,
  duration_type character varying(20) NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE user_account_status (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  status character varying(20) DEFAULT 'active'::character varying NOT NULL,
  reason text,
  admin_user_id uuid,
  status_changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expires_at timestamp without time zone,
  PRIMARY KEY (id)
);

CREATE TABLE user_achievements (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  progress_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  unlocked_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE user_admin_roles (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_active boolean DEFAULT true,
  expires_at timestamp without time zone,
  PRIMARY KEY (id)
);

CREATE TABLE user_bans (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  ban_type character varying(20) NOT NULL,
  reason text NOT NULL,
  expires_at timestamp without time zone,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE user_blocks (
  id uuid DEFAULT uuid_generate_v4(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE user_clan_preferences (
  user_id uuid,
  allow_auto_invites boolean DEFAULT true NOT NULL,
  notification_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (user_id)
);

CREATE TABLE user_feature_flags (
  user_id uuid,
  flag_name character varying(100),
  is_enabled boolean DEFAULT false NOT NULL,
  assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (user_id, flag_name)
);

CREATE TABLE user_preferences (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  game_notifications boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  theme character varying(50) DEFAULT 'default'::character varying,
  sound_enabled boolean DEFAULT true,
  music_enabled boolean DEFAULT true,
  master_volume integer DEFAULT 75,
  sfx_volume integer DEFAULT 80,
  music_volume integer DEFAULT 50,
  preferred_color character varying(20) DEFAULT '#DC2626'::character varying,
  auto_ready boolean DEFAULT false,
  show_timer boolean DEFAULT true,
  show_army_numbers boolean DEFAULT true,
  animation_speed character varying(20) DEFAULT 'normal'::character varying,
  language character varying(10) DEFAULT 'en'::character varying,
  notification_enabled boolean DEFAULT true,
  turn_notifications_browser boolean DEFAULT true,
  turn_notifications_email boolean DEFAULT false,
  turn_timer_warning_browser boolean DEFAULT true,
  turn_timer_warning_email boolean DEFAULT false,
  game_invites_browser boolean DEFAULT true,
  game_invites_email boolean DEFAULT true,
  game_ended_browser boolean DEFAULT true,
  game_ended_email boolean DEFAULT false,
  show_online_status boolean DEFAULT true NOT NULL,
  direct_messages character varying(20) DEFAULT 'friends'::character varying,
  dm_notifications_browser boolean DEFAULT true,
  dm_notifications_email boolean DEFAULT false,
  dm_policy text DEFAULT 'everyone'::text,
  allow_group_invites boolean DEFAULT true NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE user_reports (
  id uuid DEFAULT uuid_generate_v4(),
  reporter_id uuid NOT NULL,
  reported_user_id uuid NOT NULL,
  reason character varying(100) NOT NULL,
  description text,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  admin_id uuid,
  admin_notes text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  resolved_at timestamp without time zone,
  PRIMARY KEY (id)
);

CREATE TABLE user_sessions (
  id uuid DEFAULT uuid_generate_v4(),
  user_id uuid,
  started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  ended_at timestamp without time zone,
  duration_seconds integer,
  ip_address inet,
  user_agent text,
  device_info jsonb DEFAULT '{}'::jsonb NOT NULL,
  session_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE users (
  id uuid DEFAULT uuid_generate_v4(),
  username citext NOT NULL,
  email citext NOT NULL,
  password_hash character varying(255) NOT NULL,
  skill_rating integer DEFAULT 800 NOT NULL,
  is_admin boolean DEFAULT false NOT NULL,
  email_verified boolean DEFAULT false NOT NULL,
  verification_token character varying(255),
  last_login timestamp without time zone,
  timezone character varying(50),
  preferred_language character varying(10) DEFAULT 'en'::character varying,
  marketing_consent boolean DEFAULT false NOT NULL,
  data_retention_consent boolean DEFAULT true NOT NULL,
  subscription_status character varying(20) DEFAULT 'free'::character varying NOT NULL,
  subscription_expires_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  terms_accepted_at timestamp without time zone,
  terms_version character varying(20),
  privacy_accepted_at timestamp without time zone,
  privacy_version character varying(20),
  cookie_consent boolean DEFAULT false,
  cookie_consent_at timestamp without time zone,
  is_vip boolean DEFAULT false,
  premium_tier character varying(20) DEFAULT 'free'::character varying,
  vip_granted_at timestamp without time zone,
  vip_granted_by uuid,
  vip_reason text,
  premium_expires_at timestamp without time zone,
  is_beta_user boolean DEFAULT false,
  bio text,
  deleted_at timestamp without time zone,
  tagline text DEFAULT 'Commander of the Conquest Realms'::text,
  ranked_wins integer DEFAULT 0 NOT NULL,
  ranked_losses integer DEFAULT 0 NOT NULL,
  total_ranked_games integer GENERATED ALWAYS AS (ranked_wins + ranked_losses) STORED,
  highest_skill_rating integer DEFAULT 800 NOT NULL,
  last_ranked_game_at timestamp without time zone,
  current_tier character varying(32),
  skill_confidence double precision DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE web_push_subscriptions (
  id bigint DEFAULT nextval('web_push_subscriptions_id_seq'::regclass),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  subscription jsonb NOT NULL,
  expiration_time timestamp with time zone,
  p256dh_key text,
  auth_key text,
  failure_count integer DEFAULT 0 NOT NULL,
  last_failure_at timestamp with time zone,
  last_failure_reason text,
  last_success_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- Sequence Ownership
-- Tie SERIAL/BIGSERIAL-derived sequences to their columns so they drop with the
-- table (game_room_code_seq is intentionally standalone, matching its origin).
ALTER SEQUENCE client_metrics_id_seq OWNED BY client_metrics.id;
ALTER SEQUENCE game_events_seq_seq OWNED BY game_events.seq;
ALTER SEQUENCE web_push_subscriptions_id_seq OWNED BY web_push_subscriptions.id;

-- CHECK Constraints
ALTER TABLE achievements ADD CONSTRAINT achievements_points_non_negative CHECK ((points >= 0));
ALTER TABLE achievements ADD CONSTRAINT achievements_rarity_check CHECK (((rarity)::text = ANY (ARRAY[('common'::character varying)::text, ('uncommon'::character varying)::text, ('rare'::character varying)::text, ('epic'::character varying)::text, ('legendary'::character varying)::text])));
ALTER TABLE capital_eliminations ADD CONSTRAINT capital_eliminations_no_self CHECK ((eliminated_player_id <> conqueror_player_id));
ALTER TABLE clan_applications ADD CONSTRAINT clan_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text])));
ALTER TABLE clan_invitations ADD CONSTRAINT clan_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])));
ALTER TABLE clan_join_requests ADD CONSTRAINT clan_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text, 'revoked'::text, 'expired'::text])));
ALTER TABLE clan_join_requests ADD CONSTRAINT clan_join_requests_type_check CHECK ((type = ANY (ARRAY['application'::text, 'invite'::text])));
ALTER TABLE clan_members ADD CONSTRAINT clan_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'banned'::text, 'left'::text, 'kicked'::text])));
ALTER TABLE clan_war_matches ADD CONSTRAINT clan_war_matches_result_check CHECK ((result = ANY (ARRAY['win'::text, 'loss'::text, 'draw'::text])));
ALTER TABLE clan_wars ADD CONSTRAINT clan_wars_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE clans ADD CONSTRAINT clans_privacy_check CHECK ((privacy = ANY (ARRAY['public'::text, 'hidden'::text])));
ALTER TABLE clans ADD CONSTRAINT clans_recruitment_policy_check CHECK ((recruitment_policy = ANY (ARRAY['open'::text, 'application'::text, 'invite'::text])));
ALTER TABLE clans ADD CONSTRAINT clans_recruitment_status_check CHECK ((recruitment_status = ANY (ARRAY['active'::text, 'closed'::text])));
ALTER TABLE events ADD CONSTRAINT events_type_check CHECK (((event_type)::text = ANY (ARRAY[('user_login'::character varying)::text, ('user_logout'::character varying)::text, ('user_registration'::character varying)::text, ('game_start'::character varying)::text, ('game_end'::character varying)::text, ('game_move'::character varying)::text, ('page_view'::character varying)::text, ('button_click'::character varying)::text, ('feature_use'::character varying)::text, ('error_occurred'::character varying)::text, ('purchase_initiated'::character varying)::text, ('purchase_completed'::character varying)::text, ('achievement_unlocked'::character varying)::text])));
ALTER TABLE feature_flag_audit ADD CONSTRAINT feature_flag_audit_change_type_check CHECK (((change_type)::text = ANY (ARRAY[('created'::character varying)::text, ('updated'::character varying)::text, ('deleted'::character varying)::text, ('toggled'::character varying)::text])));
ALTER TABLE feature_flags ADD CONSTRAINT feature_flags_access_level_check CHECK (((access_level)::text = ANY (ARRAY[('disabled'::character varying)::text, ('internal'::character varying)::text, ('beta'::character varying)::text, ('public'::character varying)::text])));
ALTER TABLE feature_flags ADD CONSTRAINT feature_flags_rollout_percentage CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)));
ALTER TABLE friendships ADD CONSTRAINT friendships_no_self CHECK ((user_id <> friend_id));
ALTER TABLE friendships ADD CONSTRAINT friendships_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('accepted'::character varying)::text, ('blocked'::character varying)::text])));
ALTER TABLE game_battle_logs ADD CONSTRAINT game_battle_logs_entry_type_check CHECK ((entry_type = ANY (ARRAY['BATTLE'::text, 'ENGAGEMENT_SUMMARY'::text])));
ALTER TABLE game_moves ADD CONSTRAINT game_moves_turn_positive CHECK ((turn_number > 0));
ALTER TABLE game_moves ADD CONSTRAINT game_moves_type_check CHECK (((move_type)::text = ANY (ARRAY['deploy'::text, 'attack'::text, 'fortify'::text, 'end_turn'::text, 'surrender'::text, 'trade_cards'::text, 'transfer_conquest'::text])));
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_expires_after_created_check CHECK (((expires_at IS NULL) OR (expires_at >= created_at)));
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_max_players_check CHECK (((max_players >= 2) AND (max_players <= 12)));
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_mode_check CHECK (((game_mode)::text = ANY (ARRAY[('classic'::character varying)::text, ('capital'::character varying)::text, ('team'::character varying)::text])));
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_name_length CHECK (((length((name)::text) >= 3) AND (length((name)::text) <= 50))) NOT VALID;
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_status_check CHECK (((status)::text = ANY ((ARRAY['lobby'::character varying, 'initializing'::character varying, 'active'::character varying, 'completed'::character varying, 'paused'::character varying, 'abandoned'::character varying])::text[])));
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_team_check CHECK ((((team_mode = false) AND (number_of_teams IS NULL)) OR ((team_mode = true) AND (number_of_teams >= 2) AND (number_of_teams <= 6))));
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_turn_timer_check CHECK (((turn_timer >= 10) AND (turn_timer <= 86400)));
ALTER TABLE game_states ADD CONSTRAINT game_states_phase_check CHECK (((game_phase)::text = ANY ((ARRAY['lobby'::character varying, 'reinforcement'::character varying, 'deployment'::character varying, 'attack'::character varying, 'fortify'::character varying, 'finished'::character varying])::text[])));
ALTER TABLE game_states ADD CONSTRAINT game_states_turn_positive CHECK (((turn_number > 0) AND (round_number > 0)));
ALTER TABLE map_collaborators ADD CONSTRAINT map_collaborators_role_check CHECK (((role)::text = ANY (ARRAY[('editor'::character varying)::text, ('viewer'::character varying)::text, ('owner'::character varying)::text, ('reviewer'::character varying)::text])));
ALTER TABLE map_ratings ADD CONSTRAINT map_ratings_rating_range CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE map_reviews ADD CONSTRAINT map_reviews_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('needs_changes'::character varying)::text])));
ALTER TABLE map_sectors ADD CONSTRAINT map_sectors_bonus_non_negative CHECK ((bonus_troops >= 0));
ALTER TABLE map_submissions ADD CONSTRAINT map_submissions_review_status_check CHECK (((review_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('needs_changes'::character varying)::text])));
ALTER TABLE map_territories ADD CONSTRAINT map_territories_name_length CHECK ((length((name)::text) >= 1));
ALTER TABLE maps ADD CONSTRAINT maps_download_count_check CHECK ((download_count >= 0));
ALTER TABLE maps ADD CONSTRAINT maps_min_premium_tier_check CHECK (((min_premium_tier)::text = ANY (ARRAY[(NULL::character varying)::text, ('free'::character varying)::text, ('premium'::character varying)::text, ('pro'::character varying)::text, ('enterprise'::character varying)::text])));
ALTER TABLE maps ADD CONSTRAINT maps_name_length CHECK ((length((name)::text) >= 3));
ALTER TABLE maps ADD CONSTRAINT maps_play_count_check CHECK ((play_count >= 0));
ALTER TABLE maps ADD CONSTRAINT maps_player_count CHECK (((min_players >= 2) AND (max_players <= 12) AND (min_players <= max_players)));
ALTER TABLE maps ADD CONSTRAINT maps_rating_average_check CHECK (((rating_average >= (1)::numeric) AND (rating_average <= (5)::numeric)));
ALTER TABLE maps ADD CONSTRAINT maps_rating_count_check CHECK ((rating_count >= 0));
ALTER TABLE maps ADD CONSTRAINT maps_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending_review'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('archived'::character varying)::text])));
ALTER TABLE maps ADD CONSTRAINT maps_version_check CHECK ((version >= 1));
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (((type)::text = ANY (ARRAY[('friend_request'::character varying)::text, ('game_invite'::character varying)::text, ('game_started'::character varying)::text, ('game_ended'::character varying)::text, ('achievement'::character varying)::text, ('system'::character varying)::text, ('admin'::character varying)::text, ('chat_message'::character varying)::text, ('map_submission'::character varying)::text, ('map_review'::character varying)::text, ('map_approved'::character varying)::text, ('map_rejected'::character varying)::text])));
ALTER TABLE player_stats ADD CONSTRAINT player_stats_games_consistency CHECK ((games_played >= (games_won + games_lost)));
ALTER TABLE player_stats ADD CONSTRAINT player_stats_non_negative CHECK (((games_played >= 0) AND (games_won >= 0) AND (games_lost >= 0) AND (total_eliminations >= 0) AND (total_territories_conquered >= 0) AND (longest_win_streak >= 0) AND (current_win_streak >= 0)));
ALTER TABLE rating_history ADD CONSTRAINT rating_history_change_consistency CHECK (((new_rating - old_rating) = rating_change));
ALTER TABLE room_players ADD CONSTRAINT room_players_ai_difficulty_check CHECK (((ai_difficulty IS NULL) OR ((ai_difficulty)::text = ANY (ARRAY[('recruit'::character varying)::text, ('commander'::character varying)::text, ('grandmaster'::character varying)::text]))));
ALTER TABLE room_players ADD CONSTRAINT room_players_elimination_reason_check CHECK ((((elimination_reason)::text = ANY (ARRAY[('defeated'::character varying)::text, ('timeout'::character varying)::text, ('disconnected'::character varying)::text, ('abandoned'::character varying)::text])) OR (elimination_reason IS NULL)));
ALTER TABLE skill_leaderboard_cache ADD CONSTRAINT leaderboard_period_check CHECK (((period_type)::text = ANY (ARRAY[('daily'::character varying)::text, ('weekly'::character varying)::text, ('monthly'::character varying)::text, ('all_time'::character varying)::text])));
ALTER TABLE territory_adjacencies ADD CONSTRAINT territory_adjacencies_no_self CHECK (((territory_from)::text <> (territory_to)::text));
ALTER TABLE territory_modifier_templates ADD CONSTRAINT duration_type_check CHECK (((duration_type)::text = ANY (ARRAY[('permanent'::character varying)::text, ('turns'::character varying)::text, ('rounds'::character varying)::text, ('game'::character varying)::text])));
ALTER TABLE territory_modifier_templates ADD CONSTRAINT modifier_type_check CHECK (((modifier_type)::text = ANY (ARRAY[('bonus'::character varying)::text, ('penalty'::character varying)::text, ('special'::character varying)::text])));
ALTER TABLE user_account_status ADD CONSTRAINT account_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('suspended'::character varying)::text, ('banned'::character varying)::text, ('under_review'::character varying)::text])));
ALTER TABLE user_bans ADD CONSTRAINT user_bans_type_check CHECK (((ban_type)::text = ANY (ARRAY[('temporary'::character varying)::text, ('permanent'::character varying)::text, ('chat'::character varying)::text, ('game'::character varying)::text])));
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_dm_policy_check CHECK ((dm_policy = ANY (ARRAY['everyone'::text, 'friends_only'::text, 'no_one'::text])));
ALTER TABLE user_reports ADD CONSTRAINT reports_no_self CHECK ((reporter_id <> reported_user_id));
ALTER TABLE user_reports ADD CONSTRAINT reports_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('investigating'::character varying)::text, ('resolved'::character varying)::text, ('dismissed'::character varying)::text])));
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_duration_positive CHECK (((duration_seconds IS NULL) OR (duration_seconds >= 0)));
ALTER TABLE users ADD CONSTRAINT users_premium_tier_check CHECK (((premium_tier)::text = ANY (ARRAY[('free'::character varying)::text, ('premium'::character varying)::text, ('pro'::character varying)::text, ('enterprise'::character varying)::text])));
ALTER TABLE users ADD CONSTRAINT users_skill_rating_check CHECK (((skill_rating >= 0) AND (skill_rating <= 5000)));
ALTER TABLE users ADD CONSTRAINT users_subscription_status_check CHECK (((subscription_status)::text = ANY (ARRAY[('free'::character varying)::text, ('premium_monthly'::character varying)::text, ('premium_yearly'::character varying)::text, ('lifetime'::character varying)::text])));
ALTER TABLE users ADD CONSTRAINT users_username_length CHECK ((length((username)::text) >= 3));
ALTER TABLE users ADD CONSTRAINT users_username_max_length CHECK ((length((username)::text) <= 20)) NOT VALID;

-- Foreign Keys
ALTER TABLE admin_activity_logs ADD CONSTRAINT admin_activity_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE admin_notifications ADD CONSTRAINT admin_notifications_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE capital_eliminations ADD CONSTRAINT capital_eliminations_eliminated_player_id_fkey FOREIGN KEY (eliminated_player_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE capital_eliminations ADD CONSTRAINT capital_eliminations_eliminating_player_id_fkey FOREIGN KEY (conqueror_player_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE capital_eliminations ADD CONSTRAINT capital_eliminations_room_id_fkey FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE clan_activity_log ADD CONSTRAINT clan_activity_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clan_activity_log ADD CONSTRAINT clan_activity_log_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_announcements ADD CONSTRAINT clan_announcements_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clan_announcements ADD CONSTRAINT clan_announcements_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_applications ADD CONSTRAINT clan_applications_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_applications ADD CONSTRAINT clan_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clan_applications ADD CONSTRAINT clan_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE clan_chat_messages ADD CONSTRAINT clan_chat_messages_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_chat_messages ADD CONSTRAINT clan_chat_messages_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clan_chat_messages ADD CONSTRAINT clan_chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE clan_invitations ADD CONSTRAINT clan_invitations_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_invitations ADD CONSTRAINT clan_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clan_invitations ADD CONSTRAINT clan_invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE clan_join_requests ADD CONSTRAINT clan_join_requests_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_join_requests ADD CONSTRAINT clan_join_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE clan_join_requests ADD CONSTRAINT clan_join_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clan_join_requests ADD CONSTRAINT clan_join_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE clan_members ADD CONSTRAINT clan_members_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_members ADD CONSTRAINT clan_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES clan_roles(id) ON DELETE SET NULL;
ALTER TABLE clan_members ADD CONSTRAINT clan_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE clan_objectives ADD CONSTRAINT clan_objectives_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_roles ADD CONSTRAINT clan_roles_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_war_matches ADD CONSTRAINT clan_war_matches_clan_war_id_fkey FOREIGN KEY (clan_war_id) REFERENCES clan_wars(id) ON DELETE CASCADE;
ALTER TABLE clan_war_matches ADD CONSTRAINT clan_war_matches_game_id_fkey FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE SET NULL;
ALTER TABLE clan_war_matches ADD CONSTRAINT clan_war_matches_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL;
ALTER TABLE clan_wars ADD CONSTRAINT clan_wars_clan_id_a_fkey FOREIGN KEY (clan_id_a) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clan_wars ADD CONSTRAINT clan_wars_clan_id_b_fkey FOREIGN KEY (clan_id_b) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE clans ADD CONSTRAINT clans_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE conversation_members ADD CONSTRAINT conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE conversation_members ADD CONSTRAINT conversation_members_last_read_fk FOREIGN KEY (last_read_message_id) REFERENCES conversation_messages(id) ON DELETE SET NULL;
ALTER TABLE conversation_members ADD CONSTRAINT conversation_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE conversation_messages ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE conversation_messages ADD CONSTRAINT conversation_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD CONSTRAINT conversations_clan_id_fkey FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE conversations ADD CONSTRAINT conversations_game_id_fkey FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE SET NULL;
ALTER TABLE email_verification_logs ADD CONSTRAINT email_verification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE events ADD CONSTRAINT events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE feature_flag_audit ADD CONSTRAINT feature_flag_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE feature_flags ADD CONSTRAINT feature_flags_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE friendships ADD CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE friendships ADD CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE game_battle_logs ADD CONSTRAINT game_battle_logs_game_id_fkey FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_events ADD CONSTRAINT game_events_game_id_fkey FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_logs ADD CONSTRAINT game_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE game_logs ADD CONSTRAINT game_logs_game_id_fkey FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_move_archive ADD CONSTRAINT game_move_archive_player_id_fkey FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE game_move_archive ADD CONSTRAINT game_move_archive_room_id_fkey FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_moves ADD CONSTRAINT game_moves_player_id_fkey FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE game_moves ADD CONSTRAINT game_moves_room_id_fkey FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_results ADD CONSTRAINT game_results_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL;
ALTER TABLE game_results ADD CONSTRAINT game_results_room_id_fkey FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_results ADD CONSTRAINT game_results_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES users(id);
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_current_turn_user_id_fkey FOREIGN KEY (current_turn_user_id) REFERENCES users(id);
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES users(id);
ALTER TABLE game_state_snapshots ADD CONSTRAINT game_state_snapshots_game_id_fkey FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_states ADD CONSTRAINT game_states_current_player_id_fkey FOREIGN KEY (current_player_id) REFERENCES users(id);
ALTER TABLE game_states ADD CONSTRAINT game_states_room_id_fkey FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_states ADD CONSTRAINT game_states_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES users(id);
ALTER TABLE game_territory_modifiers ADD CONSTRAINT game_territory_modifiers_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES users(id);
ALTER TABLE game_territory_modifiers ADD CONSTRAINT game_territory_modifiers_room_id_fkey FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE game_territory_modifiers ADD CONSTRAINT game_territory_modifiers_template_id_fkey FOREIGN KEY (template_id) REFERENCES territory_modifier_templates(id);
ALTER TABLE map_approval_requests ADD CONSTRAINT map_approval_requests_assigned_moderator_id_fkey FOREIGN KEY (assigned_moderator_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE map_approval_requests ADD CONSTRAINT map_approval_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE map_approval_requests ADD CONSTRAINT map_approval_requests_version_id_fkey FOREIGN KEY (version_id) REFERENCES map_versions(id) ON DELETE CASCADE;
ALTER TABLE map_collaborators ADD CONSTRAINT map_collaborators_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE map_collaborators ADD CONSTRAINT map_collaborators_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_collaborators ADD CONSTRAINT map_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE map_continents ADD CONSTRAINT map_continents_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_drafts ADD CONSTRAINT map_drafts_parent_map_id_fkey FOREIGN KEY (parent_map_id) REFERENCES maps(id) ON DELETE SET NULL;
ALTER TABLE map_drafts ADD CONSTRAINT map_drafts_staging_image_id_fkey FOREIGN KEY (staging_image_id) REFERENCES map_images_staging(id) ON DELETE SET NULL;
ALTER TABLE map_drafts ADD CONSTRAINT map_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE map_images_staging ADD CONSTRAINT map_images_staging_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE map_ratings ADD CONSTRAINT map_ratings_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_ratings ADD CONSTRAINT map_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE map_reviews ADD CONSTRAINT map_reviews_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_reviews ADD CONSTRAINT map_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE map_sectors ADD CONSTRAINT map_sectors_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_submission_logs ADD CONSTRAINT map_submission_logs_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_submission_logs ADD CONSTRAINT map_submission_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE map_submissions ADD CONSTRAINT map_submissions_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_submissions ADD CONSTRAINT map_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE map_territories ADD CONSTRAINT map_territories_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_territory_modifiers ADD CONSTRAINT map_territory_modifiers_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE map_territory_modifiers ADD CONSTRAINT map_territory_modifiers_modifier_template_id_fkey FOREIGN KEY (modifier_template_id) REFERENCES territory_modifier_templates(id);
ALTER TABLE map_versions ADD CONSTRAINT map_versions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE map_versions ADD CONSTRAINT map_versions_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE maps ADD CONSTRAINT maps_created_by_fkey FOREIGN KEY (creator_id) REFERENCES users(id);
ALTER TABLE maps ADD CONSTRAINT maps_parent_map_id_fkey FOREIGN KEY (parent_map_id) REFERENCES maps(id) ON DELETE SET NULL;
ALTER TABLE maps ADD CONSTRAINT maps_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE match_checksums ADD CONSTRAINT match_checksums_match_id_fkey FOREIGN KEY (match_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE match_frames ADD CONSTRAINT match_frames_match_id_fkey FOREIGN KEY (match_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE player_game_results ADD CONSTRAINT player_game_results_room_id_fkey FOREIGN KEY (room_id) REFERENCES game_results(room_id) ON DELETE CASCADE;
ALTER TABLE player_game_results ADD CONSTRAINT player_game_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE player_stats ADD CONSTRAINT player_stats_favorite_map_id_fkey FOREIGN KEY (favorite_map_id) REFERENCES maps(id);
ALTER TABLE player_stats ADD CONSTRAINT player_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE rating_history ADD CONSTRAINT rating_history_game_room_id_fkey FOREIGN KEY (game_room_id) REFERENCES game_rooms(id);
ALTER TABLE rating_history ADD CONSTRAINT rating_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE room_players ADD CONSTRAINT room_players_room_id_fkey FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE;
ALTER TABLE room_players ADD CONSTRAINT room_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE territory_adjacencies ADD CONSTRAINT territory_adjacencies_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
ALTER TABLE user_account_status ADD CONSTRAINT user_account_status_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES users(id);
ALTER TABLE user_account_status ADD CONSTRAINT user_account_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_achievements ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE;
ALTER TABLE user_achievements ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_admin_roles ADD CONSTRAINT user_admin_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE user_admin_roles ADD CONSTRAINT user_admin_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE;
ALTER TABLE user_admin_roles ADD CONSTRAINT user_admin_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_bans ADD CONSTRAINT user_bans_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id);
ALTER TABLE user_bans ADD CONSTRAINT user_bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_clan_preferences ADD CONSTRAINT user_clan_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_feature_flags ADD CONSTRAINT user_feature_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_reports ADD CONSTRAINT user_reports_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id);
ALTER TABLE user_reports ADD CONSTRAINT user_reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_reports ADD CONSTRAINT user_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD CONSTRAINT users_vip_granted_by_fkey FOREIGN KEY (vip_granted_by) REFERENCES users(id);
ALTER TABLE web_push_subscriptions ADD CONSTRAINT web_push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Indexes
CREATE UNIQUE INDEX achievements_name_key ON public.achievements USING btree (name);
CREATE INDEX idx_achievements_category ON public.achievements USING btree (category);
CREATE INDEX idx_achievements_unlock_criteria_gin ON public.achievements USING gin (unlock_criteria);
CREATE INDEX idx_admin_activity_logs_action_details_gin ON public.admin_activity_logs USING gin (action_details);
CREATE INDEX idx_admin_activity_logs_admin_user_id ON public.admin_activity_logs USING btree (admin_user_id);
CREATE INDEX idx_admin_activity_logs_created_at ON public.admin_activity_logs USING btree (created_at DESC);
CREATE INDEX idx_admin_notifications_admin_id ON public.admin_notifications USING btree (admin_id, is_read);
CREATE UNIQUE INDEX admin_roles_name_key ON public.admin_roles USING btree (name);
CREATE INDEX idx_admin_roles_name ON public.admin_roles USING btree (name);
CREATE INDEX idx_clan_activity_action ON public.clan_activity_log USING btree (action_type);
CREATE INDEX idx_clan_activity_clan_created_at ON public.clan_activity_log USING btree (clan_id, created_at DESC);
CREATE INDEX idx_clan_announcements_clan ON public.clan_announcements USING btree (clan_id);
CREATE INDEX idx_clan_announcements_pinned ON public.clan_announcements USING btree (clan_id, pinned);
CREATE INDEX idx_clan_applications_clan ON public.clan_applications USING btree (clan_id);
CREATE UNIQUE INDEX idx_clan_applications_pending_unique ON public.clan_applications USING btree (clan_id, user_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_clan_applications_status ON public.clan_applications USING btree (status);
CREATE INDEX idx_clan_applications_user ON public.clan_applications USING btree (user_id);
CREATE INDEX idx_clan_chat_messages_clan_created ON public.clan_chat_messages USING btree (clan_id, created_at DESC);
CREATE INDEX idx_clan_chat_messages_user ON public.clan_chat_messages USING btree (user_id);
CREATE UNIQUE INDEX clan_invitations_token_unique ON public.clan_invitations USING btree (token);
CREATE INDEX idx_clan_invitations_clan ON public.clan_invitations USING btree (clan_id);
CREATE INDEX idx_clan_invitations_status ON public.clan_invitations USING btree (status);
CREATE INDEX idx_clan_invitations_user ON public.clan_invitations USING btree (invited_user_id);
CREATE UNIQUE INDEX clan_join_requests_token_key ON public.clan_join_requests USING btree (token);
CREATE INDEX idx_clan_join_requests_clan ON public.clan_join_requests USING btree (clan_id);
CREATE UNIQUE INDEX idx_clan_join_requests_pending_unique ON public.clan_join_requests USING btree (clan_id, user_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_clan_join_requests_status ON public.clan_join_requests USING btree (status);
CREATE INDEX idx_clan_join_requests_user ON public.clan_join_requests USING btree (user_id);
CREATE UNIQUE INDEX clan_members_unique ON public.clan_members USING btree (clan_id, user_id);
CREATE UNIQUE INDEX idx_clan_members_active_user ON public.clan_members USING btree (user_id) WHERE (status = 'active'::text);
CREATE INDEX idx_clan_members_clan ON public.clan_members USING btree (clan_id);
CREATE INDEX idx_clan_members_status ON public.clan_members USING btree (status);
CREATE INDEX idx_clan_members_user ON public.clan_members USING btree (user_id);
CREATE INDEX idx_clan_objectives_clan ON public.clan_objectives USING btree (clan_id);
CREATE INDEX idx_clan_objectives_window ON public.clan_objectives USING btree (clan_id, end_at DESC);
CREATE UNIQUE INDEX clan_roles_hierarchy_unique ON public.clan_roles USING btree (clan_id, hierarchy_rank);
CREATE INDEX idx_clan_roles_clan ON public.clan_roles USING btree (clan_id);
CREATE UNIQUE INDEX idx_clan_roles_clan_id_lower_name ON public.clan_roles USING btree (clan_id, lower((name)::text));
CREATE UNIQUE INDEX idx_clan_roles_name_unique ON public.clan_roles USING btree (clan_id, lower((name)::text));
CREATE INDEX idx_clan_war_matches_result ON public.clan_war_matches USING btree (result);
CREATE INDEX idx_clan_war_matches_war ON public.clan_war_matches USING btree (clan_war_id);
CREATE INDEX idx_clan_wars_clan_a ON public.clan_wars USING btree (clan_id_a);
CREATE INDEX idx_clan_wars_clan_b ON public.clan_wars USING btree (clan_id_b);
CREATE INDEX idx_clan_wars_status ON public.clan_wars USING btree (status);
CREATE UNIQUE INDEX clans_slug_unique ON public.clans USING btree (slug);
CREATE UNIQUE INDEX clans_tag_unique ON public.clans USING btree (tag);
CREATE INDEX idx_clans_created_at ON public.clans USING btree (created_at DESC);
CREATE INDEX idx_clans_description_trgm ON public.clans USING gin (description gin_trgm_ops);
CREATE INDEX idx_clans_name_trgm ON public.clans USING gin (name gin_trgm_ops);
CREATE INDEX idx_clans_owner ON public.clans USING btree (owner_user_id);
CREATE INDEX idx_clans_privacy ON public.clans USING btree (privacy);
CREATE INDEX idx_clans_region ON public.clans USING btree (region);
CREATE INDEX idx_clans_status ON public.clans USING btree (recruitment_status);
CREATE INDEX idx_clans_tag_trgm ON public.clans USING gin (((tag)::text) gin_trgm_ops);
CREATE INDEX idx_client_metrics_created ON public.client_metrics USING btree (created_at DESC);
CREATE INDEX idx_client_metrics_game ON public.client_metrics USING btree (game_id);
CREATE INDEX idx_client_metrics_session ON public.client_metrics USING btree (session_id);
CREATE INDEX idx_client_metrics_user ON public.client_metrics USING btree (user_id);
CREATE UNIQUE INDEX conversation_members_conversation_id_user_id_key ON public.conversation_members USING btree (conversation_id, user_id);
CREATE INDEX idx_conversation_members_conversation ON public.conversation_members USING btree (conversation_id);
CREATE INDEX idx_conversation_members_user_state ON public.conversation_members USING btree (user_id, is_pinned DESC, joined_at DESC);
CREATE INDEX idx_conversation_messages_conversation_created_at ON public.conversation_messages USING btree (conversation_id, created_at DESC);
CREATE INDEX idx_conversation_messages_json_metadata ON public.conversation_messages USING gin (json_metadata);
CREATE INDEX idx_conversation_messages_sender_created_at ON public.conversation_messages USING btree (sender_id, created_at DESC);
CREATE INDEX idx_conversations_clan_id ON public.conversations USING btree (clan_id);
CREATE INDEX idx_conversations_game_id ON public.conversations USING btree (game_id);
CREATE INDEX idx_conversations_kind_created_at ON public.conversations USING btree (kind, created_at DESC);
CREATE UNIQUE INDEX email_verification_logs_token_key ON public.email_verification_logs USING btree (token);
CREATE INDEX idx_email_verification_logs_token ON public.email_verification_logs USING btree (token);
CREATE INDEX idx_email_verification_logs_user_id ON public.email_verification_logs USING btree (user_id);
CREATE INDEX idx_events_created_at ON public.events USING btree (created_at DESC);
CREATE INDEX idx_events_event_data_gin ON public.events USING gin (event_data);
CREATE INDEX idx_events_event_type ON public.events USING btree (event_type);
CREATE INDEX idx_events_session_id ON public.events USING btree (session_id);
CREATE INDEX idx_events_user_id ON public.events USING btree (user_id);
CREATE INDEX idx_feature_flag_audit_changed_by ON public.feature_flag_audit USING btree (changed_by);
CREATE INDEX idx_feature_flag_audit_created_at ON public.feature_flag_audit USING btree (created_at DESC);
CREATE INDEX idx_feature_flag_audit_flag_name ON public.feature_flag_audit USING btree (flag_name);
CREATE UNIQUE INDEX feature_flags_flag_name_key ON public.feature_flags USING btree (flag_name);
CREATE INDEX idx_feature_flags_access_level ON public.feature_flags USING btree (access_level);
CREATE INDEX idx_feature_flags_category ON public.feature_flags USING btree (category);
CREATE INDEX idx_feature_flags_flag_name ON public.feature_flags USING btree (flag_name);
CREATE INDEX idx_feature_flags_is_enabled ON public.feature_flags USING btree (is_enabled);
CREATE INDEX idx_feature_flags_target_criteria_gin ON public.feature_flags USING gin (target_criteria);
CREATE UNIQUE INDEX friendships_user_id_friend_id_key ON public.friendships USING btree (user_id, friend_id);
CREATE INDEX idx_friendships_friend_id ON public.friendships USING btree (friend_id);
CREATE INDEX idx_friendships_status ON public.friendships USING btree (status);
CREATE INDEX idx_friendships_user_id ON public.friendships USING btree (user_id);
CREATE INDEX idx_game_battle_logs_game_engagement ON public.game_battle_logs USING btree (game_id, engagement_id);
CREATE INDEX idx_game_battle_logs_game_ts ON public.game_battle_logs USING btree (game_id, entry_timestamp DESC);
CREATE UNIQUE INDEX idx_game_battle_logs_unique_job ON public.game_battle_logs USING btree (game_id, job_id) WHERE (job_id IS NOT NULL);
CREATE INDEX game_events_game_created_idx ON public.game_events USING btree (game_id, created_at DESC);
CREATE UNIQUE INDEX game_events_game_seq_idx ON public.game_events USING btree (game_id, seq);
CREATE INDEX game_events_game_version_idx ON public.game_events USING btree (game_id, version);
CREATE INDEX idx_game_logs_actor ON public.game_logs USING btree (actor_id);
CREATE INDEX idx_game_logs_game_ts ON public.game_logs USING btree (game_id, ts DESC);
CREATE INDEX idx_game_logs_game_type_ts ON public.game_logs USING btree (game_id, move_type, ts DESC);
CREATE INDEX idx_game_move_archive_archived_at ON public.game_move_archive USING btree (archived_at DESC);
CREATE INDEX idx_game_move_archive_created_at ON public.game_move_archive USING btree (created_at DESC);
CREATE INDEX idx_game_move_archive_move_type ON public.game_move_archive USING btree (move_type);
CREATE INDEX idx_game_move_archive_player_id ON public.game_move_archive USING btree (player_id);
CREATE INDEX idx_game_move_archive_room_id ON public.game_move_archive USING btree (room_id);
CREATE INDEX idx_game_move_archive_turn_number ON public.game_move_archive USING btree (turn_number);
CREATE INDEX idx_game_moves_created_at ON public.game_moves USING btree (created_at DESC);
CREATE INDEX idx_game_moves_move_data_gin ON public.game_moves USING gin (move_data);
CREATE INDEX idx_game_moves_move_type ON public.game_moves USING btree (move_type);
CREATE INDEX idx_game_moves_player_id ON public.game_moves USING btree (player_id);
CREATE INDEX idx_game_moves_room_id ON public.game_moves USING btree (room_id);
CREATE INDEX idx_game_moves_room_turn ON public.game_moves USING btree (room_id, turn_number DESC);
CREATE INDEX idx_game_moves_turn ON public.game_moves USING btree (room_id, turn_number);
CREATE INDEX idx_game_moves_turn_number ON public.game_moves USING btree (turn_number);
CREATE INDEX idx_game_rooms_created_at ON public.game_rooms USING btree (created_at DESC);
CREATE INDEX idx_game_rooms_expires_at ON public.game_rooms USING btree (expires_at);
CREATE INDEX idx_game_rooms_host_id ON public.game_rooms USING btree (host_id);
CREATE INDEX idx_game_rooms_map_id ON public.game_rooms USING btree (map_id);
CREATE UNIQUE INDEX idx_game_rooms_room_code_unique ON public.game_rooms USING btree (room_code);
CREATE INDEX idx_game_rooms_started_at ON public.game_rooms USING btree (started_at DESC);
CREATE INDEX idx_game_rooms_status ON public.game_rooms USING btree (status);
CREATE INDEX game_snapshots_game_created_idx ON public.game_state_snapshots USING btree (game_id, created_at DESC);
CREATE UNIQUE INDEX game_snapshots_game_version_idx ON public.game_state_snapshots USING btree (game_id, version);
CREATE UNIQUE INDEX game_states_room_id_key ON public.game_states USING btree (room_id);
CREATE INDEX idx_game_states_ai_players_gin ON public.game_states USING gin (ai_players);
CREATE INDEX idx_game_states_current_player ON public.game_states USING btree (current_player_id);
CREATE INDEX idx_game_states_phase ON public.game_states USING btree (game_phase);
CREATE INDEX idx_game_states_player_stats_gin ON public.game_states USING gin (player_stats);
CREATE INDEX idx_game_states_replay_data_gin ON public.game_states USING gin (replay_data);
CREATE INDEX idx_game_states_room_id ON public.game_states USING btree (room_id);
CREATE INDEX idx_game_states_territories_gin ON public.game_states USING gin (territories);
CREATE INDEX idx_game_territory_modifiers_game ON public.game_territory_modifiers USING btree (game_id);
CREATE INDEX idx_map_approval_requests_decision ON public.map_approval_requests USING btree (decision);
CREATE INDEX idx_map_approval_requests_pending ON public.map_approval_requests USING btree (created_at) WHERE (decision IS NULL);
CREATE INDEX idx_map_approval_requests_requester ON public.map_approval_requests USING btree (requester_id);
CREATE INDEX idx_map_approval_requests_version ON public.map_approval_requests USING btree (version_id);
CREATE INDEX idx_map_asset_purge_runs_type ON public.map_asset_purge_runs USING btree (run_type, started_at DESC);
CREATE INDEX idx_map_collaborators_map_role ON public.map_collaborators USING btree (map_id, role);
CREATE INDEX idx_map_collaborators_user ON public.map_collaborators USING btree (user_id);
CREATE INDEX idx_map_drafts_user_id ON public.map_drafts USING btree (user_id, draft_status);
CREATE INDEX idx_map_images_staging_user_id ON public.map_images_staging USING btree (user_id) WHERE (is_deleted = false);
CREATE INDEX idx_map_ratings_map_id ON public.map_ratings USING btree (map_id);
CREATE UNIQUE INDEX map_ratings_map_id_user_id_key ON public.map_ratings USING btree (map_id, user_id);
CREATE INDEX idx_map_reviews_map_id ON public.map_reviews USING btree (map_id);
CREATE INDEX idx_map_reviews_reviewer_id ON public.map_reviews USING btree (reviewer_id);
CREATE UNIQUE INDEX map_reviews_map_id_reviewer_id_key ON public.map_reviews USING btree (map_id, reviewer_id);
CREATE INDEX idx_map_sectors_map_id ON public.map_sectors USING btree (map_id);
CREATE INDEX idx_map_sectors_requirements_gin ON public.map_sectors USING gin (requirements);
CREATE UNIQUE INDEX map_sectors_map_id_name_key ON public.map_sectors USING btree (map_id, name);
CREATE INDEX idx_map_submission_logs_map_id ON public.map_submission_logs USING btree (map_id);
CREATE INDEX idx_map_submissions_review_status ON public.map_submissions USING btree (review_status);
CREATE INDEX idx_map_submissions_submission_data_gin ON public.map_submissions USING gin (submission_data);
CREATE INDEX idx_map_submissions_user_id ON public.map_submissions USING btree (user_id);
CREATE INDEX idx_map_territories_capital_for_players_gin ON public.map_territories USING gin (capital_for_players);
CREATE INDEX idx_map_territories_map_id ON public.map_territories USING btree (map_id);
CREATE INDEX idx_map_territories_polygon_data_gin ON public.map_territories USING gin (polygon_data);
CREATE UNIQUE INDEX map_territories_map_id_name_key ON public.map_territories USING btree (map_id, name);
CREATE INDEX idx_map_territory_modifiers_map ON public.map_territory_modifiers USING btree (map_id);
CREATE UNIQUE INDEX idx_map_territory_modifiers_unique ON public.map_territory_modifiers USING btree (map_id, territory_id, modifier_template_id);
CREATE INDEX idx_map_versions_map_id_version ON public.map_versions USING btree (map_id, version_number DESC);
CREATE INDEX idx_maps_capital_assignments_gin ON public.maps USING gin (capital_assignments);
CREATE INDEX idx_maps_capital_metadata_gin ON public.maps USING gin (capital_metadata);
CREATE INDEX idx_maps_created_at ON public.maps USING btree (created_at);
CREATE INDEX idx_maps_created_by ON public.maps USING btree (creator_id);
CREATE INDEX idx_maps_creator_id ON public.maps USING btree (creator_id);
CREATE INDEX idx_maps_is_active ON public.maps USING btree (is_active);
CREATE INDEX idx_maps_is_featured ON public.maps USING btree (is_featured) WHERE (is_featured = true);
CREATE INDEX idx_maps_is_public ON public.maps USING btree (is_public);
CREATE INDEX idx_maps_is_vip_only ON public.maps USING btree (is_vip_only) WHERE (is_vip_only = true);
CREATE INDEX idx_maps_name_trgm ON public.maps USING gin (name gin_trgm_ops);
CREATE INDEX idx_maps_play_count ON public.maps USING btree (play_count DESC);
CREATE INDEX idx_maps_rating_average ON public.maps USING btree (rating_average) WHERE (rating_average IS NOT NULL);
CREATE INDEX idx_maps_reviewed_at ON public.maps USING btree (reviewed_at);
CREATE INDEX idx_maps_status ON public.maps USING btree (status);
CREATE INDEX idx_maps_submitted_at ON public.maps USING btree (submitted_at);
CREATE UNIQUE INDEX maps_name_key ON public.maps USING btree (name);
CREATE UNIQUE INDEX match_checksums_match_seq_idx ON public.match_checksums USING btree (match_id, seq);
CREATE INDEX match_frames_match_committed_idx ON public.match_frames USING btree (match_id, committed_at);
CREATE UNIQUE INDEX match_frames_match_seq_idx ON public.match_frames USING btree (match_id, seq);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_data_gin ON public.notifications USING gin (data);
CREATE INDEX idx_notifications_user_created_at ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
CREATE INDEX idx_password_reset_tokens_expires_at ON public.password_reset_tokens USING btree (expires_at);
CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);
CREATE INDEX idx_password_reset_tokens_user_created_at ON public.password_reset_tokens USING btree (user_id, created_at DESC);
CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);
CREATE UNIQUE INDEX password_reset_tokens_token_key ON public.password_reset_tokens USING btree (token);
CREATE INDEX idx_pgr_user_created_at ON public.player_game_results USING btree (user_id, created_at DESC);
CREATE INDEX idx_pgr_user_wins ON public.player_game_results USING btree (user_id) WHERE (is_winner = true);
CREATE INDEX idx_player_game_results_room_position ON public.player_game_results USING btree (room_id, "position");
CREATE INDEX idx_player_game_results_user ON public.player_game_results USING btree (user_id);
CREATE UNIQUE INDEX player_game_results_room_id_user_id_key ON public.player_game_results USING btree (room_id, user_id);
CREATE INDEX idx_player_stats_favorite_map_id ON public.player_stats USING btree (favorite_map_id);
CREATE INDEX idx_player_stats_user_id ON public.player_stats USING btree (user_id);
CREATE UNIQUE INDEX player_stats_user_id_key ON public.player_stats USING btree (user_id);
CREATE INDEX idx_rating_history_created_at ON public.rating_history USING btree (created_at DESC);
CREATE INDEX idx_rating_history_user_id ON public.rating_history USING btree (user_id);
CREATE INDEX idx_room_players_bank ON public.room_players USING btree (room_id, user_id);
CREATE INDEX idx_room_players_room_id ON public.room_players USING btree (room_id);
CREATE INDEX idx_room_players_team_id ON public.room_players USING btree (team_id);
CREATE UNIQUE INDEX idx_room_players_unique_color ON public.room_players USING btree (room_id, selected_color) WHERE (selected_color IS NOT NULL);
CREATE INDEX idx_room_players_user_id ON public.room_players USING btree (user_id);
CREATE UNIQUE INDEX room_players_room_id_player_order_key ON public.room_players USING btree (room_id, player_order);
CREATE UNIQUE INDEX room_players_room_id_user_id_key ON public.room_players USING btree (room_id, user_id);
CREATE INDEX idx_skill_leaderboard_cache_rankings_gin ON public.skill_leaderboard_cache USING gin (rankings);
CREATE UNIQUE INDEX skill_leaderboard_cache_period_type_period_start_period_end_key ON public.skill_leaderboard_cache USING btree (period_type, period_start, period_end);
CREATE INDEX idx_territory_adjacencies_map_id ON public.territory_adjacencies USING btree (map_id);
CREATE UNIQUE INDEX territory_adjacencies_map_id_territory_from_territory_to_key ON public.territory_adjacencies USING btree (map_id, territory_from, territory_to);
CREATE INDEX idx_territory_modifier_templates_effect_value_gin ON public.territory_modifier_templates USING gin (effect_value);
CREATE UNIQUE INDEX territory_modifier_templates_name_key ON public.territory_modifier_templates USING btree (name);
CREATE INDEX idx_user_account_status_admin_user_id ON public.user_account_status USING btree (admin_user_id);
CREATE INDEX idx_user_account_status_status ON public.user_account_status USING btree (status);
CREATE UNIQUE INDEX user_account_status_user_id_key ON public.user_account_status USING btree (user_id);
CREATE INDEX idx_user_achievements_achievement_id ON public.user_achievements USING btree (achievement_id);
CREATE INDEX idx_user_achievements_progress_data_gin ON public.user_achievements USING gin (progress_data);
CREATE INDEX idx_user_achievements_user_id ON public.user_achievements USING btree (user_id);
CREATE UNIQUE INDEX user_achievements_user_id_achievement_id_key ON public.user_achievements USING btree (user_id, achievement_id);
CREATE INDEX idx_user_admin_roles_assigned_by ON public.user_admin_roles USING btree (assigned_by);
CREATE INDEX idx_user_admin_roles_role_id ON public.user_admin_roles USING btree (role_id);
CREATE INDEX idx_user_admin_roles_user_id ON public.user_admin_roles USING btree (user_id);
CREATE UNIQUE INDEX user_admin_roles_user_id_role_id_key ON public.user_admin_roles USING btree (user_id, role_id);
CREATE INDEX idx_user_bans_admin_id ON public.user_bans USING btree (admin_id);
CREATE INDEX idx_user_bans_user_id ON public.user_bans USING btree (user_id);
CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id);
CREATE INDEX idx_user_blocks_blocker ON public.user_blocks USING btree (blocker_id, created_at DESC);
CREATE UNIQUE INDEX user_blocks_blocker_id_blocked_id_key ON public.user_blocks USING btree (blocker_id, blocked_id);
CREATE INDEX idx_user_clan_preferences_notifications ON public.user_clan_preferences USING gin (notification_settings);
CREATE INDEX idx_user_feature_flags_flag_name ON public.user_feature_flags USING btree (flag_name);
CREATE INDEX idx_user_feature_flags_user_id ON public.user_feature_flags USING btree (user_id);
CREATE INDEX idx_user_preferences_user_id ON public.user_preferences USING btree (user_id);
CREATE UNIQUE INDEX user_preferences_user_id_key ON public.user_preferences USING btree (user_id);
CREATE INDEX idx_user_reports_admin_id ON public.user_reports USING btree (admin_id);
CREATE INDEX idx_user_reports_evidence_gin ON public.user_reports USING gin (evidence);
CREATE INDEX idx_user_reports_reported_user_id ON public.user_reports USING btree (reported_user_id);
CREATE INDEX idx_user_reports_reporter_id ON public.user_reports USING btree (reporter_id);
CREATE INDEX idx_user_reports_status ON public.user_reports USING btree (status);
CREATE INDEX idx_user_sessions_device_info_gin ON public.user_sessions USING gin (device_info);
CREATE INDEX idx_user_sessions_ended_at ON public.user_sessions USING btree (ended_at DESC);
CREATE INDEX idx_user_sessions_session_data_gin ON public.user_sessions USING gin (session_data);
CREATE INDEX idx_user_sessions_started_at ON public.user_sessions USING btree (started_at DESC);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);
CREATE INDEX idx_users_created_at ON public.users USING btree (created_at DESC);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_is_admin ON public.users USING btree (is_admin) WHERE (is_admin = true);
CREATE INDEX idx_users_is_vip ON public.users USING btree (is_vip) WHERE (is_vip = true);
CREATE INDEX idx_users_last_login ON public.users USING btree (last_login DESC);
CREATE INDEX idx_users_premium_tier ON public.users USING btree (premium_tier) WHERE ((premium_tier)::text <> 'free'::text);
CREATE INDEX idx_users_skill_created ON public.users USING btree (skill_rating DESC, created_at);
CREATE INDEX idx_users_skill_rating ON public.users USING btree (skill_rating DESC);
CREATE INDEX idx_users_terms_accepted ON public.users USING btree (terms_accepted_at) WHERE (terms_accepted_at IS NOT NULL);
CREATE INDEX idx_users_username ON public.users USING btree (username);
CREATE INDEX idx_users_username_trgm ON public.users USING gin (username gin_trgm_ops);
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username);
CREATE UNIQUE INDEX web_push_subscriptions_user_endpoint_idx ON public.web_push_subscriptions USING btree (user_id, endpoint);
CREATE INDEX web_push_subscriptions_user_idx ON public.web_push_subscriptions USING btree (user_id);

-- Triggers
CREATE TRIGGER update_admin_roles_updated_at BEFORE UPDATE ON public.admin_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_announcements_updated_at BEFORE UPDATE ON public.clan_announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_applications_updated_at BEFORE UPDATE ON public.clan_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_invitations_updated_at BEFORE UPDATE ON public.clan_invitations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_join_requests_updated_at BEFORE UPDATE ON public.clan_join_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_members_updated_at BEFORE UPDATE ON public.clan_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_objectives_updated_at BEFORE UPDATE ON public.clan_objectives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_roles_updated_at BEFORE UPDATE ON public.clan_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_war_matches_updated_at BEFORE UPDATE ON public.clan_war_matches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clan_wars_updated_at BEFORE UPDATE ON public.clan_wars FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_clans_updated_at BEFORE UPDATE ON public.clans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER conversation_members_set_updated_at BEFORE UPDATE ON public.conversation_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER conversation_messages_set_updated_at BEFORE UPDATE ON public.conversation_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER conversations_set_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER feature_flag_audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION log_feature_flag_change();
CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_game_rooms_updated_at BEFORE UPDATE ON public.game_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_map_approval_requests_updated_at BEFORE UPDATE ON public.map_approval_requests FOR EACH ROW EXECUTE FUNCTION update_map_approval_requests_updated_at();
CREATE TRIGGER trg_map_drafts_updated_at BEFORE UPDATE ON public.map_drafts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_map_images_staging_updated_at BEFORE UPDATE ON public.map_images_staging FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_map_ratings_updated_at BEFORE UPDATE ON public.map_ratings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_map_reviews_updated_at BEFORE UPDATE ON public.map_reviews FOR EACH ROW EXECUTE FUNCTION update_map_reviews_updated_at();
CREATE TRIGGER trg_map_submissions_updated_at BEFORE UPDATE ON public.map_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maps_updated_at BEFORE UPDATE ON public.maps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE ON public.player_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER user_admin_roles_sync_is_admin_trg AFTER INSERT OR DELETE OR UPDATE ON public.user_admin_roles FOR EACH ROW EXECUTE FUNCTION user_admin_roles_sync_is_admin();
CREATE TRIGGER trg_user_clan_preferences_updated_at BEFORE UPDATE ON public.user_clan_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION update_user_preferences_updated_at();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER web_push_subscriptions_updated_at BEFORE UPDATE ON public.web_push_subscriptions FOR EACH ROW EXECUTE FUNCTION update_web_push_subscriptions_updated_at();
