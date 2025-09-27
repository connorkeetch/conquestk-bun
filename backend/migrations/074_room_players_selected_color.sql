-- 074_room_players_selected_color.sql
-- Adds per-room selected_color for players and enforces uniqueness per room when set.

ALTER TABLE room_players
  ADD COLUMN IF NOT EXISTS selected_color VARCHAR(50);

-- Ensure each selected_color is unique within a room (ignoring NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_players_unique_color
  ON room_players (room_id, selected_color)
  WHERE selected_color IS NOT NULL;

