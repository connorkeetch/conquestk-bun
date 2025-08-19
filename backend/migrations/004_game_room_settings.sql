-- Add game configuration columns to game_rooms table
-- This migration adds support for extended game settings in CreateGamePage

-- Add new columns for game configuration
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS map_id TEXT REFERENCES maps(id) ON DELETE SET NULL;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS game_type TEXT DEFAULT 'quick' CHECK (game_type IN ('quick', 'custom', 'tournament'));
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS movement_type TEXT DEFAULT 'classic_adjacent' CHECK (movement_type IN ('classic_adjacent', 'adjacent_multi', 'path_single', 'path_multi'));
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS allow_team_play BOOLEAN DEFAULT FALSE;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS game_settings TEXT DEFAULT '{}'; -- JSON string for additional settings

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_rooms_map_id ON game_rooms(map_id);
CREATE INDEX IF NOT EXISTS idx_game_rooms_game_type ON game_rooms(game_type);
CREATE INDEX IF NOT EXISTS idx_game_rooms_movement_type ON game_rooms(movement_type);