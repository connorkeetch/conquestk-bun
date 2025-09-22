-- Creates the unified conversation schema for site-wide messaging (Phase 1)
-- Covers core tables, indexes, policy scaffolding, and messaging settings view

-- Ensure UUID helpers exist for default primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversation enumerations (created idempotently)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_kind') THEN
    CREATE TYPE conversation_kind AS ENUM ('game', 'direct', 'group');
  END IF;
END $$;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_member_role') THEN
    CREATE TYPE conversation_member_role AS ENUM ('owner', 'admin', 'member');
  END IF;
END $$;
$$;

-- Conversations table captures metadata for any chat surface
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind conversation_kind NOT NULL,
  title VARCHAR(255),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_read_only BOOLEAN NOT NULL DEFAULT FALSE,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_conversations_game_id ON conversations (game_id);
CREATE INDEX IF NOT EXISTS idx_conversations_kind_created_at ON conversations (kind, created_at DESC);

DROP TRIGGER IF EXISTS conversations_set_updated_at ON conversations;
CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Conversation messages table stores chat events with flexible metadata
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  json_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  shadow_muted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created_at
  ON conversation_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_sender_created_at
  ON conversation_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_json_metadata
  ON conversation_messages USING GIN (json_metadata);

DROP TRIGGER IF EXISTS conversation_messages_set_updated_at ON conversation_messages;
CREATE TRIGGER conversation_messages_set_updated_at
  BEFORE UPDATE ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Conversation membership tracks per-user state and read positions
CREATE TABLE IF NOT EXISTS conversation_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role conversation_member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_message_id UUID,
  last_read_at TIMESTAMPTZ,
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  shadow_muted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE conversation_members
  ADD CONSTRAINT conversation_members_last_read_fk
  FOREIGN KEY (last_read_message_id)
  REFERENCES conversation_messages(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_members_user_state
  ON conversation_members (user_id, is_pinned DESC, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation
  ON conversation_members (conversation_id);

-- Read receipts table tracks per-message read state
CREATE TABLE IF NOT EXISTS message_read_receipts (
  message_id UUID NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_read_receipts_user_read_at
  ON message_read_receipts (user_id, read_at DESC);

-- Messaging preference scaffolding lives on user_preferences to ease rollout
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS dm_policy TEXT;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS allow_group_invites BOOLEAN;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS show_online_status BOOLEAN;

UPDATE user_preferences
SET dm_policy = 'everyone'
WHERE dm_policy IS NULL OR dm_policy NOT IN ('everyone', 'friends_only', 'no_one');

ALTER TABLE user_preferences
  ALTER COLUMN dm_policy SET DEFAULT 'everyone';

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_dm_policy_check
  CHECK (dm_policy IN ('everyone', 'friends_only', 'no_one'));

UPDATE user_preferences
SET allow_group_invites = true
WHERE allow_group_invites IS NULL;

ALTER TABLE user_preferences
  ALTER COLUMN allow_group_invites SET DEFAULT true;
ALTER TABLE user_preferences
  ALTER COLUMN allow_group_invites SET NOT NULL;

UPDATE user_preferences
SET show_online_status = true
WHERE show_online_status IS NULL;

ALTER TABLE user_preferences
  ALTER COLUMN show_online_status SET DEFAULT true;
ALTER TABLE user_preferences
  ALTER COLUMN show_online_status SET NOT NULL;

-- View for messaging services to consume preference data without new queries
DROP VIEW IF EXISTS user_messaging_settings;
CREATE VIEW user_messaging_settings AS
SELECT
  user_id,
  dm_policy,
  allow_group_invites,
  show_online_status
FROM user_preferences;
