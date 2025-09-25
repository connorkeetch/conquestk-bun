-- Allow AI seats in room_players by making user_id optional and storing AI identifiers

ALTER TABLE room_players
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE room_players
  ADD COLUMN IF NOT EXISTS ai_player_id UUID;

-- Backfill existing AI rows (if any) with generated identifiers
UPDATE room_players
SET ai_player_id = uuid_generate_v4()
WHERE is_ai = TRUE AND ai_player_id IS NULL;
