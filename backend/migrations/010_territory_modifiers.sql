-- Territory Modifiers System
-- Adds special properties to territories for enhanced strategic gameplay

-- Territory modifier templates (predefined modifiers that can be applied to maps)
CREATE TABLE IF NOT EXISTS territory_modifier_templates (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL, -- emoji or icon identifier
    color TEXT NOT NULL, -- hex color for UI display
    defense_bonus INTEGER DEFAULT 0 CHECK (defense_bonus >= -3 AND defense_bonus <= 3),
    attack_bonus INTEGER DEFAULT 0 CHECK (attack_bonus >= -3 AND attack_bonus <= 3),
    troop_generation_bonus INTEGER DEFAULT 0 CHECK (troop_generation_bonus >= 0 AND troop_generation_bonus <= 5),
    movement_restriction BOOLEAN DEFAULT FALSE, -- harder to move through
    supply_line_bonus BOOLEAN DEFAULT FALSE, -- bonus for connected territories
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default modifier templates
INSERT OR IGNORE INTO territory_modifier_templates (name, icon, color, defense_bonus, attack_bonus, troop_generation_bonus, description) VALUES 
('Fortress', '🏰', '#8B4513', 2, 0, 0, 'Strong defensive position with +2 defense bonus'),
('High Ground', '⛰️', '#696969', 1, 0, 0, 'Elevated position provides +1 defense bonus'),
('Supply Depot', '📦', '#4169E1', 0, 0, 2, 'Resource hub generates +2 bonus troops per turn'),
('Training Camp', '🏋️', '#FF6347', 0, 1, 1, 'Military facility provides +1 attack and +1 troop generation'),
('Swamp', '🌿', '#556B2F', -1, -1, 0, 'Difficult terrain with -1 to both attack and defense'),
('Capital City', '🏛️', '#FFD700', 1, 0, 3, 'Major city with +1 defense and +3 troop generation'),
('Port', '⚓', '#000080', 0, 0, 1, 'Trade hub generates +1 bonus troops and enables sea routes'),
('Mountains', '🏔️', '#A0522D', 2, -1, 0, 'Natural barrier with +2 defense but -1 attack'),
('Plains', '🌾', '#F0E68C', 0, 1, 0, 'Open terrain favors attackers with +1 attack bonus'),
('Forest', '🌲', '#228B22', 1, 0, 0, 'Dense cover provides +1 defense bonus');

-- Map-specific modifier assignments (which territories have which modifiers)
CREATE TABLE IF NOT EXISTS map_territory_modifiers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    map_id TEXT NOT NULL,
    territory_id TEXT NOT NULL, -- territory identifier within the map
    modifier_template_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (modifier_template_id) REFERENCES territory_modifier_templates(id) ON DELETE CASCADE,
    UNIQUE(map_id, territory_id) -- each territory can only have one modifier per map
);

-- Game-specific territory modifiers (actual modifiers in active games)
CREATE TABLE IF NOT EXISTS game_territory_modifiers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    game_id TEXT NOT NULL,
    territory_id TEXT NOT NULL,
    -- Denormalized for performance during gameplay
    defense_bonus INTEGER DEFAULT 0 CHECK (defense_bonus >= -3 AND defense_bonus <= 3),
    attack_bonus INTEGER DEFAULT 0 CHECK (attack_bonus >= -3 AND attack_bonus <= 3),
    troop_generation_bonus INTEGER DEFAULT 0 CHECK (troop_generation_bonus >= 0 AND troop_generation_bonus <= 5),
    movement_restriction BOOLEAN DEFAULT FALSE,
    supply_line_bonus BOOLEAN DEFAULT FALSE,
    -- Visual properties for frontend
    icon TEXT,
    color TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    UNIQUE(game_id, territory_id)
);

-- Game room settings update (add modifier settings)
ALTER TABLE game_rooms ADD COLUMN use_territory_modifiers BOOLEAN DEFAULT FALSE;
ALTER TABLE game_rooms ADD COLUMN modifier_distribution TEXT DEFAULT 'balanced' 
    CHECK (modifier_distribution IN ('none', 'sparse', 'balanced', 'abundant', 'custom'));

-- Index for fast lookups during gameplay
CREATE INDEX IF NOT EXISTS idx_game_territory_modifiers_game ON game_territory_modifiers(game_id);
CREATE INDEX IF NOT EXISTS idx_game_territory_modifiers_lookup ON game_territory_modifiers(game_id, territory_id);
CREATE INDEX IF NOT EXISTS idx_map_territory_modifiers_map ON map_territory_modifiers(map_id);