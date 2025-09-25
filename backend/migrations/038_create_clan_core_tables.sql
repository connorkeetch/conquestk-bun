-- Migration 036: Create core clan tables and feature flag scaffold
-- Date: 2025-09-25
-- Description: Establishes the foundational schema for the clan system including
--              identity, membership, applications, invitations, announcements,
--              wars, objectives, chat logging, and user preferences. Also seeds
--              the clans feature flag for controlled rollout.

BEGIN;

CREATE TABLE IF NOT EXISTS clans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(64) NOT NULL,
  tag CITEXT NOT NULL,
  slug TEXT NOT NULL,
  motto VARCHAR(120),
  description TEXT,
  crest_asset_url TEXT,
  banner_asset_url TEXT,
  recruitment_policy TEXT NOT NULL DEFAULT 'application',
  recruitment_status TEXT NOT NULL DEFAULT 'active',
  minimum_rank INTEGER,
  auto_accept_thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
  language VARCHAR(16),
  region VARCHAR(32),
  time_zone VARCHAR(64),
  privacy TEXT NOT NULL DEFAULT 'public',
  total_xp BIGINT NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CONSTRAINT clans_recruitment_policy_check CHECK (recruitment_policy IN ('open', 'application', 'invite')),
  CONSTRAINT clans_recruitment_status_check CHECK (recruitment_status IN ('active', 'closed')),
  CONSTRAINT clans_privacy_check CHECK (privacy IN ('public', 'hidden')),
  CONSTRAINT clans_tag_unique UNIQUE (tag),
  CONSTRAINT clans_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_clans_owner ON clans(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_clans_region ON clans(region);
CREATE INDEX IF NOT EXISTS idx_clans_status ON clans(recruitment_status);
CREATE INDEX IF NOT EXISTS idx_clans_privacy ON clans(privacy);
CREATE INDEX IF NOT EXISTS idx_clans_created_at ON clans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clans_name_trgm ON clans USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clans_tag_trgm ON clans USING gin ((tag::text) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clans_description_trgm ON clans USING gin (description gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_clans_updated_at ON clans;
CREATE TRIGGER trg_clans_updated_at
  BEFORE UPDATE ON clans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  hierarchy_rank INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT clan_roles_name_unique UNIQUE (clan_id, LOWER(name)),
  CONSTRAINT clan_roles_hierarchy_unique UNIQUE (clan_id, hierarchy_rank)
);

CREATE INDEX IF NOT EXISTS idx_clan_roles_clan ON clan_roles(clan_id);

DROP TRIGGER IF EXISTS trg_clan_roles_updated_at ON clan_roles;
CREATE TRIGGER trg_clan_roles_updated_at
  BEFORE UPDATE ON clan_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES clan_roles(id) ON DELETE SET NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  probation_until TIMESTAMP,
  last_active_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active',
  last_role_change_at TIMESTAMP,
  contribution_xp BIGINT NOT NULL DEFAULT 0,
  contribution_matches INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT clan_members_status_check CHECK (status IN ('active', 'banned', 'left', 'kicked')),
  CONSTRAINT clan_members_unique UNIQUE (clan_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_user ON clan_members(user_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_status ON clan_members(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clan_members_active_user
  ON clan_members(user_id)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_clan_members_updated_at ON clan_members;
CREATE TRIGGER trg_clan_members_updated_at
  BEFORE UPDATE ON clan_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT clan_applications_status_check CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn'))
);

CREATE INDEX IF NOT EXISTS idx_clan_applications_clan ON clan_applications(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_applications_user ON clan_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_clan_applications_status ON clan_applications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clan_applications_pending_unique
  ON clan_applications(clan_id, user_id)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_clan_applications_updated_at ON clan_applications;
CREATE TRIGGER trg_clan_applications_updated_at
  BEFORE UPDATE ON clan_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT clan_invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT clan_invitations_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_clan_invitations_clan ON clan_invitations(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_invitations_user ON clan_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_clan_invitations_status ON clan_invitations(status);

DROP TRIGGER IF EXISTS trg_clan_invitations_updated_at ON clan_invitations;
CREATE TRIGGER trg_clan_invitations_updated_at
  BEFORE UPDATE ON clan_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(80) NOT NULL,
  body_markdown TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clan_announcements_clan ON clan_announcements(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_announcements_pinned ON clan_announcements(clan_id, pinned);

DROP TRIGGER IF EXISTS trg_clan_announcements_updated_at ON clan_announcements;
CREATE TRIGGER trg_clan_announcements_updated_at
  BEFORE UPDATE ON clan_announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clan_activity_clan_created_at
  ON clan_activity_log(clan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clan_activity_action
  ON clan_activity_log(action_type);

CREATE TABLE IF NOT EXISTS clan_wars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id_a UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  clan_id_b UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  season_id UUID,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_start TIMESTAMP,
  scheduled_end TIMESTAMP,
  ruleset JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rewards JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT clan_wars_status_check CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_clan_wars_clan_a ON clan_wars(clan_id_a);
CREATE INDEX IF NOT EXISTS idx_clan_wars_clan_b ON clan_wars(clan_id_b);
CREATE INDEX IF NOT EXISTS idx_clan_wars_status ON clan_wars(status);

DROP TRIGGER IF EXISTS trg_clan_wars_updated_at ON clan_wars;
CREATE TRIGGER trg_clan_wars_updated_at
  BEFORE UPDATE ON clan_wars
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_war_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_war_id UUID NOT NULL REFERENCES clan_wars(id) ON DELETE CASCADE,
  game_id UUID REFERENCES game_rooms(id) ON DELETE SET NULL,
  map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  result TEXT NOT NULL,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  replay_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT clan_war_matches_result_check CHECK (result IN ('win', 'loss', 'draw'))
);

CREATE INDEX IF NOT EXISTS idx_clan_war_matches_war ON clan_war_matches(clan_war_id);
CREATE INDEX IF NOT EXISTS idx_clan_war_matches_result ON clan_war_matches(result);

DROP TRIGGER IF EXISTS trg_clan_war_matches_updated_at ON clan_war_matches;
CREATE TRIGGER trg_clan_war_matches_updated_at
  BEFORE UPDATE ON clan_war_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_objectives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  objective_type TEXT NOT NULL,
  target_value INTEGER NOT NULL,
  progress_value INTEGER NOT NULL DEFAULT 0,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  reward JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clan_objectives_clan ON clan_objectives(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_objectives_window ON clan_objectives(clan_id, end_at DESC);

DROP TRIGGER IF EXISTS trg_clan_objectives_updated_at ON clan_objectives;
CREATE TRIGGER trg_clan_objectives_updated_at
  BEFORE UPDATE ON clan_objectives
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS clan_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at TIMESTAMP,
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clan_chat_messages_clan_created
  ON clan_chat_messages(clan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clan_chat_messages_user
  ON clan_chat_messages(user_id);

CREATE TABLE IF NOT EXISTS user_clan_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allow_auto_invites BOOLEAN NOT NULL DEFAULT TRUE,
  notification_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_clan_preferences_notifications
  ON user_clan_preferences USING gin (notification_settings);

DROP TRIGGER IF EXISTS trg_user_clan_preferences_updated_at ON user_clan_preferences;
CREATE TRIGGER trg_user_clan_preferences_updated_at
  BEFORE UPDATE ON user_clan_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO feature_flags (
  id,
  flag_name,
  description,
  access_level,
  category,
  is_enabled,
  rollout_percentage,
  target_criteria,
  dependencies
)
SELECT
  uuid_generate_v4(),
  'clans_enabled',
  'Enables the clan system backend routes and UI surfaces',
  'beta',
  'gameplay',
  FALSE,
  0,
  '{}'::jsonb,
  '{}'::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags WHERE flag_name = 'clans_enabled'
);

COMMIT;
