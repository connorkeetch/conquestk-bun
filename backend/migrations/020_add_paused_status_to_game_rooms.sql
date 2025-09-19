-- 020_add_paused_status_to_game_rooms.sql
-- Allow game rooms to transition into a paused state for admin moderation

ALTER TABLE game_rooms
  DROP CONSTRAINT IF EXISTS game_rooms_status_check;

ALTER TABLE game_rooms
  ADD CONSTRAINT game_rooms_status_check
  CHECK (status IN ('waiting', 'starting', 'in_progress', 'finished', 'abandoned', 'paused'));

-- Ensure existing paused games remain valid (no-op if none exist)
UPDATE game_rooms
SET status = 'paused'
WHERE status = 'paused';
