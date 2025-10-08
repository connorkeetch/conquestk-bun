-- Add explicit tracking for missed turn timestamps and whether a player is using time bank.
ALTER TABLE room_players
  ADD COLUMN IF NOT EXISTS last_missed_turn_at timestamptz;

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS using_time_bank boolean DEFAULT FALSE NOT NULL;
