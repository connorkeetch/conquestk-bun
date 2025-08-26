-- Add capital cities system for Risk games with elimination rules

-- Add capitals configuration to maps table
ALTER TABLE maps ADD COLUMN capital_territories TEXT; -- JSON structure for player count based capitals

-- Add capitals enabled flag to game rooms
ALTER TABLE game_rooms ADD COLUMN capitals_enabled BOOLEAN DEFAULT FALSE;

-- Create game territories table for tracking territory state during games
CREATE TABLE IF NOT EXISTS game_territories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id VARCHAR(255) NOT NULL,
    territory_id INTEGER NOT NULL,
    owner_player_id INTEGER,
    troop_count INTEGER DEFAULT 1,
    is_capital BOOLEAN DEFAULT FALSE,
    capital_owner_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE
);

-- Create game players table for tracking player-specific game state
CREATE TABLE IF NOT EXISTS game_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id VARCHAR(255) NOT NULL,
    player_id INTEGER NOT NULL,
    player_color VARCHAR(20),
    player_position INTEGER,
    capital_territory_id INTEGER,
    is_eliminated BOOLEAN DEFAULT FALSE,
    eliminated_at TIMESTAMP,
    eliminated_by INTEGER,
    territories_count INTEGER DEFAULT 0,
    troops_count INTEGER DEFAULT 0,
    cards_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create capital elimination events table for tracking
CREATE TABLE IF NOT EXISTS capital_eliminations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id VARCHAR(255) NOT NULL,
    eliminated_player_id INTEGER NOT NULL,
    conqueror_player_id INTEGER NOT NULL,
    capital_territory_id INTEGER NOT NULL,
    territories_gained INTEGER DEFAULT 0,
    troops_gained INTEGER DEFAULT 0,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (eliminated_player_id) REFERENCES users(id),
    FOREIGN KEY (conqueror_player_id) REFERENCES users(id)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_territories_game ON game_territories(game_id);
CREATE INDEX IF NOT EXISTS idx_game_territories_capital ON game_territories(is_capital);
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_capital ON game_players(capital_territory_id);
CREATE INDEX IF NOT EXISTS idx_capital_eliminations_game ON capital_eliminations(game_id);

-- Default capital territories JSON structure example (to be populated by map creator):
-- {
--   "2": [1, 25],
--   "3": [1, 17, 33],
--   "4": [1, 13, 25, 37],
--   "5": [1, 10, 20, 30, 40],
--   "6": [1, 8, 16, 24, 32, 40],
--   "7": [1, 7, 14, 21, 28, 35, 42],
--   "8": [1, 6, 12, 18, 24, 30, 36, 42],
--   "9": [1, 5, 10, 15, 20, 25, 30, 35, 40],
--   "10": [1, 5, 9, 13, 17, 21, 25, 29, 33, 37],
--   "11": [1, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40],
--   "12": [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
-- }