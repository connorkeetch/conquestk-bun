-- 040_conversation_schema_fixes.sql
-- Align conversation schema with service code

-- 1) Add updated_at to conversation_members for state updates
ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure trigger exists to maintain updated_at automatically
DROP TRIGGER IF EXISTS conversation_members_set_updated_at ON conversation_members;
CREATE TRIGGER conversation_members_set_updated_at
  BEFORE UPDATE ON conversation_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2) Ensure conversation_kind includes 'team' used for team chats
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'conversation_kind' AND e.enumlabel = 'team'
  ) THEN
    ALTER TYPE conversation_kind ADD VALUE 'team';
  END IF;
END $$;

-- 3) Point conversations.game_id to game_rooms(id) instead of games(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name = 'conversations_game_id_fkey'
      AND tc.table_name = 'conversations'
  ) THEN
    ALTER TABLE conversations DROP CONSTRAINT conversations_game_id_fkey;
  END IF;
END $$;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_game_id_fkey
  FOREIGN KEY (game_id)
  REFERENCES game_rooms(id)
  ON DELETE SET NULL;

