-- 024_game_lifecycle_state_machine.sql
-- Introduce lifecycle states, ready tracking, and timing metadata for game rooms

BEGIN;

-- Normalize existing statuses into the new lifecycle terminology
UPDATE game_rooms
SET status = CASE status
  WHEN 'waiting' THEN 'lobby'
  WHEN 'starting' THEN 'initializing'
  WHEN 'in_progress' THEN 'active'
  WHEN 'finished' THEN 'completed'
  ELSE status
END;

-- Expand lifecycle metadata on game_rooms
ALTER TABLE game_rooms
  DROP CONSTRAINT IF EXISTS game_rooms_status_check;

ALTER TABLE game_rooms
  ADD CONSTRAINT game_rooms_status_check
  CHECK (status IN ('lobby', 'initializing', 'active', 'completed', 'paused', 'abandoned'));

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS lifecycle_phase VARCHAR(32) DEFAULT 'lobby' NOT NULL;

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS turn_number INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS current_turn_user_id UUID REFERENCES users(id);

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS turn_expires_at TIMESTAMPTZ;

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS ready_check_started_at TIMESTAMPTZ;

-- Track ready state per participant
ALTER TABLE room_players
  ADD COLUMN IF NOT EXISTS is_ready BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE room_players
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

COMMIT;
