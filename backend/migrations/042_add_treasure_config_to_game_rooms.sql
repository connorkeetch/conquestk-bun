-- 042_add_treasure_config_to_game_rooms.sql
-- Persist room-level Hidden Treasures configuration

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS treasure_config JSONB;

