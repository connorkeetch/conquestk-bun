-- Railway PostgreSQL Database Initialization
-- Run this SQL in Railway's PostgreSQL database to create all required tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game rooms table
CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    max_players INTEGER NOT NULL DEFAULT 6,
    is_private BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Room players table (junction table)
CREATE TABLE IF NOT EXISTS room_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id)
);

-- Game states table
CREATE TABLE IF NOT EXISTS game_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    game_data JSONB NOT NULL,
    turn_number INTEGER DEFAULT 1,
    current_player_id UUID REFERENCES users(id),
    phase VARCHAR(20) DEFAULT 'setup' CHECK (phase IN ('setup', 'reinforcement', 'attack', 'fortify', 'finished')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game moves/actions table
CREATE TABLE IF NOT EXISTS game_moves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_state_id UUID NOT NULL REFERENCES game_states(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    move_type VARCHAR(50) NOT NULL,
    move_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Custom maps table
CREATE TABLE IF NOT EXISTS custom_maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_data JSONB NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player statistics table
CREATE TABLE IF NOT EXISTS player_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_lost INTEGER DEFAULT 0,
    total_playtime_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Extended Maps Schema - Game Modes and Custom Maps
CREATE TABLE IF NOT EXISTS maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT,
    image_width INTEGER DEFAULT 600,
    image_height INTEGER DEFAULT 450,
    is_public BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    download_count INTEGER DEFAULT 0,
    rating_average DECIMAL(3,2) DEFAULT 0.00,
    rating_count INTEGER DEFAULT 0,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game modes that can be applied to maps
CREATE TABLE IF NOT EXISTS game_modes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    config JSONB NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map-specific game mode configurations
CREATE TABLE IF NOT EXISTS map_game_modes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    game_mode_id UUID NOT NULL REFERENCES game_modes(id) ON DELETE CASCADE,
    custom_config JSONB,
    is_recommended BOOLEAN DEFAULT FALSE,
    UNIQUE(map_id, game_mode_id)
);

-- Continents/regions within maps
CREATE TABLE IF NOT EXISTS map_continents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    bonus_armies INTEGER DEFAULT 0,
    color VARCHAR(7) DEFAULT '#cccccc',
    special_rules JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Territory special ability types
CREATE TABLE IF NOT EXISTS territory_ability_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(10),
    effect_config JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Territories within maps
CREATE TABLE IF NOT EXISTS map_territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    territory_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    continent_id UUID REFERENCES map_continents(id) ON DELETE SET NULL,
    boundary_coords JSONB NOT NULL,
    army_position_x INTEGER NOT NULL,
    army_position_y INTEGER NOT NULL,
    ability_type_id UUID REFERENCES territory_ability_types(id) ON DELETE SET NULL,
    custom_ability_config JSONB,
    starting_owner_slot INTEGER,
    starting_armies INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, territory_id)
);

-- Territory adjacencies
CREATE TABLE IF NOT EXISTS territory_adjacencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_territory_id UUID NOT NULL REFERENCES map_territories(id) ON DELETE CASCADE,
    to_territory_id UUID NOT NULL REFERENCES map_territories(id) ON DELETE CASCADE,
    connection_type VARCHAR(50) DEFAULT 'land',
    is_bidirectional BOOLEAN DEFAULT TRUE,
    special_requirements JSONB,
    UNIQUE(from_territory_id, to_territory_id)
);

-- Map ratings and reviews
CREATE TABLE IF NOT EXISTS map_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, user_id)
);

-- Insert default game modes
INSERT INTO game_modes (name, description, config, is_default) 
VALUES 
('Classic', 'Traditional Risk gameplay', '{"type": "classic", "eliminationOnCapitalLoss": false, "cardBonuses": true}', TRUE),
('Capital Conquest', 'Lose your capital, lose the game', '{"type": "capital", "eliminationOnCapitalLoss": true, "capitalBonus": 2}', FALSE),
('Naval Supremacy', 'Naval bases control sea routes', '{"type": "naval", "navalMovement": true, "portAdvantage": true}', FALSE),
('Resource War', 'Territories generate different resources', '{"type": "resource", "resources": ["gold", "iron", "food"], "resourceRequirements": true}', FALSE),
('Asymmetric', 'Players start with different advantages', '{"type": "asymmetric", "unequalStart": true, "playerBonuses": true}', FALSE)
ON CONFLICT (name) DO NOTHING;

-- Insert default territory ability types
INSERT INTO territory_ability_types (name, description, icon, effect_config) 
VALUES 
('Fortress', 'Provides +2 defense dice when defending', '🏰', '{"defenseBonus": 2, "type": "defense"}'),
('Naval Base', 'Can attack across water connections', '⚓', '{"navalMovement": true, "type": "movement"}'),
('Trade Hub', 'Generates +1 army per turn', '💰', '{"incomeBonus": 1, "type": "income"}'),
('Capital', 'Generates +2 armies, elimination if lost', '👑', '{"incomeBonus": 2, "isCapital": true, "type": "special"}'),
('Artillery Position', 'Provides +1 attack dice when attacking', '🎯', '{"attackBonus": 1, "type": "attack"}'),
('Mountain Pass', 'Can only be attacked from specific directions', '🏔️', '{"restrictedAccess": true, "type": "special"}'),
('Magical Nexus', 'Special abilities and teleportation', '🔮', '{"teleport": true, "specialPowers": true, "type": "magical"}')
ON CONFLICT (name) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_game_rooms_host_id ON game_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_states_room_id ON game_states(room_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_game_state_id ON game_moves(game_state_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_player_id ON game_moves(player_id);
CREATE INDEX IF NOT EXISTS idx_custom_maps_creator_id ON custom_maps(creator_id);
CREATE INDEX IF NOT EXISTS idx_custom_maps_public ON custom_maps(is_public);
CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);

-- Extended Maps Indexes
CREATE INDEX IF NOT EXISTS idx_maps_creator_id ON maps(creator_id);
CREATE INDEX IF NOT EXISTS idx_maps_public ON maps(is_public);
CREATE INDEX IF NOT EXISTS idx_maps_featured ON maps(is_featured);
CREATE INDEX IF NOT EXISTS idx_map_territories_map_id ON map_territories(map_id);
CREATE INDEX IF NOT EXISTS idx_map_territories_continent_id ON map_territories(continent_id);
CREATE INDEX IF NOT EXISTS idx_map_continents_map_id ON map_continents(map_id);
CREATE INDEX IF NOT EXISTS idx_territory_adjacencies_from ON territory_adjacencies(from_territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_adjacencies_to ON territory_adjacencies(to_territory_id);
CREATE INDEX IF NOT EXISTS idx_map_ratings_map_id ON map_ratings(map_id);
CREATE INDEX IF NOT EXISTS idx_map_game_modes_map_id ON map_game_modes(map_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER IF NOT EXISTS update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_game_rooms_updated_at BEFORE UPDATE ON game_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_game_states_updated_at BEFORE UPDATE ON game_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_custom_maps_updated_at BEFORE UPDATE ON custom_maps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_player_stats_updated_at BEFORE UPDATE ON player_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_maps_updated_at BEFORE UPDATE ON maps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();