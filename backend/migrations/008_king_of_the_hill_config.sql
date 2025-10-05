-- Add king_of_the_hill_config column to game_rooms table
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS king_of_the_hill_config JSONB DEFAULT NULL;

-- Comment describing the column
COMMENT ON COLUMN game_rooms.king_of_the_hill_config IS 'Configuration for King of the Hill game mode including target points, neutral armies, rotation settings, and eligible territories';
