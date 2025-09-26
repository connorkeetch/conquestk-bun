-- 045_add_lobby_expiration.sql
-- Add expires_at to game_rooms so lobbies auto-expire after 30 days

BEGIN;

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days');

-- Optional sanity: ensure expires_at is not before created_at
DO $$
BEGIN
  ALTER TABLE game_rooms
    ADD CONSTRAINT game_rooms_expires_after_created_check
    CHECK (expires_at IS NULL OR expires_at >= created_at);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Backfill existing rows without expires_at (NULL) to 30 days from created_at
UPDATE game_rooms
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

-- Helpful index for pruning lookups
CREATE INDEX IF NOT EXISTS idx_game_rooms_expires_at ON game_rooms (expires_at);

COMMIT;
