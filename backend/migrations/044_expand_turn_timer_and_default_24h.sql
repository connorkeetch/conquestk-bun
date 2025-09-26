-- 044_expand_turn_timer_and_default_24h.sql
-- Expand allowed turn_timer range and set default to 24 hours

BEGIN;

-- Relax the check to support long-term games up to 24 hours (86400 seconds)
ALTER TABLE game_rooms
  DROP CONSTRAINT IF EXISTS game_rooms_turn_timer_check;

ALTER TABLE game_rooms
  ADD CONSTRAINT game_rooms_turn_timer_check
  CHECK (turn_timer >= 10 AND turn_timer <= 86400);

-- Set default turn timer to 24 hours
ALTER TABLE game_rooms
  ALTER COLUMN turn_timer SET DEFAULT 86400;

COMMIT;

