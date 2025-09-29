-- Add time bank support: per-room capacity and per-player remaining

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS time_bank_seconds INTEGER NOT NULL DEFAULT 0;

ALTER TABLE room_players
  ADD COLUMN IF NOT EXISTS time_bank_seconds_remaining INTEGER;

-- Index to quickly fetch current player's remaining bank in lifecycle queries
CREATE INDEX IF NOT EXISTS idx_room_players_bank ON room_players (room_id, user_id);

