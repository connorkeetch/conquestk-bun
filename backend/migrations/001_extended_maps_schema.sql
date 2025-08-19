-- Extended Maps Schema with Game Mode Support
-- This migration adds support for custom maps with special abilities and game modes

-- Drop existing custom_maps table to rebuild with new structure
DROP TABLE IF EXISTS custom_maps;

-- Main maps table
CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    name TEXT NOT NULL,
    description TEXT,
    creator_id TEXT NOT NULL,
    image_url TEXT, -- Background map image
    image_width INTEGER DEFAULT 600,
    image_height INTEGER DEFAULT 450,
    is_public BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    download_count INTEGER DEFAULT 0,
    rating_average DECIMAL(3,2) DEFAULT 0.00,
    rating_count INTEGER DEFAULT 0,
    tags TEXT, -- JSON array of tags like ["naval", "asymmetric", "fantasy"]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Game modes that can be applied to maps
CREATE TABLE IF NOT EXISTS game_modes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    config TEXT NOT NULL, -- JSON configuration for game mode rules
    is_default BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Map-specific game mode configurations
CREATE TABLE IF NOT EXISTS map_game_modes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    map_id TEXT NOT NULL,
    game_mode_id TEXT NOT NULL,
    custom_config TEXT, -- JSON override for map-specific tweaks
    is_recommended BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (game_mode_id) REFERENCES game_modes(id) ON DELETE CASCADE,
    UNIQUE(map_id, game_mode_id)
);

-- Continents/regions within maps
CREATE TABLE IF NOT EXISTS map_continents (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    map_id TEXT NOT NULL,
    name TEXT NOT NULL,
    bonus_armies INTEGER DEFAULT 0,
    color TEXT DEFAULT '#cccccc',
    special_rules TEXT, -- JSON for continent-specific rules
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
);

-- Territory special ability types
CREATE TABLE IF NOT EXISTS territory_ability_types (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT, -- Emoji or icon identifier
    effect_config TEXT NOT NULL, -- JSON describing the effect
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Territories within maps
CREATE TABLE IF NOT EXISTS map_territories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    map_id TEXT NOT NULL,
    territory_id TEXT NOT NULL, -- Unique within the map
    name TEXT NOT NULL,
    continent_id TEXT,
    boundary_coords TEXT NOT NULL, -- JSON array of polygon coordinates
    army_position_x INTEGER NOT NULL,
    army_position_y INTEGER NOT NULL,
    ability_type_id TEXT, -- Special ability reference
    custom_ability_config TEXT, -- JSON for territory-specific ability overrides
    starting_owner_slot INTEGER, -- For asymmetric modes (NULL = unassigned)
    starting_armies INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (continent_id) REFERENCES map_continents(id) ON DELETE SET NULL,
    FOREIGN KEY (ability_type_id) REFERENCES territory_ability_types(id) ON DELETE SET NULL,
    UNIQUE(map_id, territory_id)
);

-- Territory adjacencies (which territories connect to which)
CREATE TABLE IF NOT EXISTS territory_adjacencies (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    from_territory_id TEXT NOT NULL,
    to_territory_id TEXT NOT NULL,
    connection_type TEXT DEFAULT 'land', -- 'land', 'sea', 'air', 'tunnel', etc.
    is_bidirectional BOOLEAN DEFAULT TRUE,
    special_requirements TEXT, -- JSON for conditional connections
    FOREIGN KEY (from_territory_id) REFERENCES map_territories(id) ON DELETE CASCADE,
    FOREIGN KEY (to_territory_id) REFERENCES map_territories(id) ON DELETE CASCADE,
    UNIQUE(from_territory_id, to_territory_id)
);

-- Map ratings and reviews
CREATE TABLE IF NOT EXISTS map_ratings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    map_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(map_id, user_id)
);

-- Insert default game modes
INSERT OR IGNORE INTO game_modes (name, description, config, is_default) VALUES 
('Classic', 'Traditional Risk gameplay', '{"type": "classic", "eliminationOnCapitalLoss": false, "cardBonuses": true}', TRUE),
('Capital Conquest', 'Lose your capital, lose the game', '{"type": "capital", "eliminationOnCapitalLoss": true, "capitalBonus": 2}', FALSE),
('Naval Supremacy', 'Naval bases control sea routes', '{"type": "naval", "navalMovement": true, "portAdvantage": true}', FALSE),
('Resource War', 'Territories generate different resources', '{"type": "resource", "resources": ["gold", "iron", "food"], "resourceRequirements": true}', FALSE),
('Asymmetric', 'Players start with different advantages', '{"type": "asymmetric", "unequalStart": true, "playerBonuses": true}', FALSE);

-- Insert default territory ability types
INSERT OR IGNORE INTO territory_ability_types (name, description, icon, effect_config) VALUES 
('Fortress', 'Provides +2 defense dice when defending', '🏰', '{"defenseBonus": 2, "type": "defense"}'),
('Naval Base', 'Can attack across water connections', '⚓', '{"navalMovement": true, "type": "movement"}'),
('Trade Hub', 'Generates +1 army per turn', '💰', '{"incomeBonus": 1, "type": "income"}'),
('Capital', 'Generates +2 armies, elimination if lost', '👑', '{"incomeBonus": 2, "isCapital": true, "type": "special"}'),
('Artillery Position', 'Provides +1 attack dice when attacking', '🎯', '{"attackBonus": 1, "type": "attack"}'),
('Mountain Pass', 'Can only be attacked from specific directions', '🏔️', '{"restrictedAccess": true, "type": "special"}'),
('Magical Nexus', 'Special abilities and teleportation', '🔮', '{"teleport": true, "specialPowers": true, "type": "magical"}');

-- Create indexes for performance
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