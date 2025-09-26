-- 043_add_room_movement_and_fog.sql
-- Persist selected movement type and fog of war on rooms

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS movement_type TEXT,
  ADD COLUMN IF NOT EXISTS fog_of_war TEXT;

-- Optional: ensure turn_timer exists and is in bounds (already present in 011)
-- We rely on existing CHECK constraint from base schema.

