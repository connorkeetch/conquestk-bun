-- Migration 008: Add full team support for games

-- Add team settings to game_rooms table
ALTER TABLE game_rooms 
ADD COLUMN IF NOT EXISTS team_mode VARCHAR(20) DEFAULT 'none' CHECK (team_mode IN ('none', 'teams', 'auto_balance')),
ADD COLUMN IF NOT EXISTS number_of_teams INTEGER CHECK (number_of_teams >= 2 AND number_of_teams <= 6);

-- Add team assignment to room_players table
ALTER TABLE room_players
ADD COLUMN IF NOT EXISTS team_id INTEGER CHECK (team_id >= 1 AND team_id <= 6);

-- Add team_id to game_states for tracking during gameplay
ALTER TABLE game_states
ADD COLUMN IF NOT EXISTS team_assignments JSONB DEFAULT '{}';

-- Create index for team lookups
CREATE INDEX IF NOT EXISTS idx_room_players_team_id ON room_players(room_id, team_id);

-- Update game_rooms to store team settings in the settings JSONB column as well
-- This allows for more flexible team configurations in the future
COMMENT ON COLUMN game_rooms.team_mode IS 'Team mode: none for FFA, teams for manual assignment, auto_balance for automatic';
COMMENT ON COLUMN game_rooms.number_of_teams IS 'Number of teams for team games (2-6)';
COMMENT ON COLUMN room_players.team_id IS 'Team assignment for the player (1-6)';

-- Function to auto-balance teams
CREATE OR REPLACE FUNCTION auto_balance_teams(room_id_param UUID)
RETURNS void AS $$
DECLARE
    team_count INTEGER;
    player_count INTEGER;
    current_team INTEGER := 1;
BEGIN
    -- Get the number of teams for this room
    SELECT number_of_teams INTO team_count
    FROM game_rooms
    WHERE id = room_id_param;
    
    IF team_count IS NULL OR team_count < 2 THEN
        RETURN;
    END IF;
    
    -- Count players in the room
    SELECT COUNT(*) INTO player_count
    FROM room_players
    WHERE room_id = room_id_param AND left_at IS NULL;
    
    -- Assign teams in round-robin fashion
    WITH numbered_players AS (
        SELECT user_id, ROW_NUMBER() OVER (ORDER BY joined_at) as rn
        FROM room_players
        WHERE room_id = room_id_param AND left_at IS NULL
    )
    UPDATE room_players rp
    SET team_id = ((np.rn - 1) % team_count) + 1
    FROM numbered_players np
    WHERE rp.room_id = room_id_param 
      AND rp.user_id = np.user_id;
END;
$$ LANGUAGE plpgsql;

-- Add team victory tracking
CREATE TABLE IF NOT EXISTS team_victories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    winning_team_id INTEGER NOT NULL,
    team_members UUID[] NOT NULL,
    victory_type VARCHAR(50) DEFAULT 'elimination', -- elimination, domination, points
    game_duration INTEGER, -- in seconds
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for team victory lookups
CREATE INDEX IF NOT EXISTS idx_team_victories_game_id ON team_victories(game_id);
CREATE INDEX IF NOT EXISTS idx_team_victories_team_members ON team_victories USING GIN(team_members);