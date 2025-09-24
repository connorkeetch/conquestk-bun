-- Ensure game room records referencing a map are removed when the map is deleted
ALTER TABLE game_rooms
  DROP CONSTRAINT IF EXISTS game_rooms_map_id_fkey;

ALTER TABLE game_rooms
  ADD CONSTRAINT game_rooms_map_id_fkey
  FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE;
