-- Command Points (ELO) Skill Rating System
-- Implements competitive skill-based rating for players

-- Add skill rating columns to users table
ALTER TABLE users ADD COLUMN skill_rating INTEGER DEFAULT 1000 CHECK (skill_rating >= 0);
ALTER TABLE users ADD COLUMN skill_confidence REAL DEFAULT 0.0 CHECK (skill_confidence >= 0.0 AND skill_confidence <= 1.0);
ALTER TABLE users ADD COLUMN total_ranked_games INTEGER DEFAULT 0 CHECK (total_ranked_games >= 0);
ALTER TABLE users ADD COLUMN ranked_wins INTEGER DEFAULT 0 CHECK (ranked_wins >= 0);
ALTER TABLE users ADD COLUMN ranked_losses INTEGER DEFAULT 0 CHECK (ranked_losses >= 0);
ALTER TABLE users ADD COLUMN highest_skill_rating INTEGER DEFAULT 1000 CHECK (highest_skill_rating >= 0);
ALTER TABLE users ADD COLUMN current_tier TEXT DEFAULT 'Gold' CHECK (current_tier IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Master', 'Grandmaster'));
ALTER TABLE users ADD COLUMN last_ranked_game_at DATETIME;

-- Create rating history table to track changes over time
CREATE TABLE IF NOT EXISTS rating_history (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    rating_before INTEGER NOT NULL CHECK (rating_before >= 0),
    rating_after INTEGER NOT NULL CHECK (rating_after >= 0),
    rating_change INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 1), -- Final position in the game (1 = winner, 2 = second, etc.)
    total_players INTEGER NOT NULL CHECK (total_players >= 2),
    game_duration INTEGER, -- Game duration in seconds
    territories_held INTEGER DEFAULT 0,
    armies_defeated INTEGER DEFAULT 0,
    k_factor INTEGER NOT NULL, -- K-factor used for this calculation
    expected_score REAL NOT NULL,
    actual_score REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES game_rooms(id) ON DELETE CASCADE
);

-- Add ranked game columns to game_rooms table
ALTER TABLE game_rooms ADD COLUMN is_ranked BOOLEAN DEFAULT FALSE;
ALTER TABLE game_rooms ADD COLUMN avg_skill_rating INTEGER DEFAULT 0;
ALTER TABLE game_rooms ADD COLUMN skill_variance REAL DEFAULT 0.0;
ALTER TABLE game_rooms ADD COLUMN min_skill_rating INTEGER DEFAULT 0;
ALTER TABLE game_rooms ADD COLUMN max_skill_rating INTEGER DEFAULT 0;
ALTER TABLE game_rooms ADD COLUMN skill_tier TEXT CHECK (skill_tier IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Master', 'Grandmaster', 'Mixed'));

-- Create leaderboard materialized view table for performance
-- This will be updated periodically rather than calculated on-demand
CREATE TABLE IF NOT EXISTS skill_leaderboard_cache (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    skill_rating INTEGER NOT NULL,
    skill_confidence REAL NOT NULL,
    rank_position INTEGER NOT NULL,
    tier TEXT NOT NULL,
    total_ranked_games INTEGER NOT NULL,
    win_rate REAL NOT NULL,
    recent_trend TEXT CHECK (recent_trend IN ('up', 'down', 'stable')), -- Based on last 5 games
    last_game_change INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Season tracking for competitive seasons (optional future feature)
CREATE TABLE IF NOT EXISTS rating_seasons (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    season_number INTEGER NOT NULL UNIQUE,
    season_name TEXT NOT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME,
    is_active BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Season ratings for historical tracking
CREATE TABLE IF NOT EXISTS season_ratings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('ab89',1+abs(random())%4,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    user_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    final_rating INTEGER NOT NULL,
    final_tier TEXT NOT NULL,
    games_played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    highest_rating INTEGER NOT NULL,
    final_rank INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (season_id) REFERENCES rating_seasons(id) ON DELETE CASCADE,
    UNIQUE(user_id, season_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rating_history_user ON rating_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rating_history_game ON rating_history(game_id);
CREATE INDEX IF NOT EXISTS idx_rating_history_created ON rating_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rating ON skill_leaderboard_cache(skill_rating DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON skill_leaderboard_cache(rank_position);
CREATE INDEX IF NOT EXISTS idx_game_rooms_ranked ON game_rooms(is_ranked, status);
CREATE INDEX IF NOT EXISTS idx_users_skill_rating ON users(skill_rating DESC);
CREATE INDEX IF NOT EXISTS idx_season_ratings_user ON season_ratings(user_id, season_id);

-- Insert initial season (optional)
INSERT INTO rating_seasons (season_number, season_name, start_date, is_active) 
VALUES (1, 'Inaugural Season', CURRENT_TIMESTAMP, TRUE);

-- Trigger to update user's highest rating
CREATE TRIGGER IF NOT EXISTS update_highest_rating
AFTER UPDATE OF skill_rating ON users
FOR EACH ROW
WHEN NEW.skill_rating > OLD.highest_skill_rating
BEGIN
    UPDATE users 
    SET highest_skill_rating = NEW.skill_rating 
    WHERE id = NEW.id;
END;

-- Trigger to update user's tier based on rating
CREATE TRIGGER IF NOT EXISTS update_skill_tier
AFTER UPDATE OF skill_rating ON users
FOR EACH ROW
BEGIN
    UPDATE users 
    SET current_tier = CASE
        WHEN NEW.skill_rating < 800 THEN 'Bronze'
        WHEN NEW.skill_rating < 1000 THEN 'Silver'
        WHEN NEW.skill_rating < 1200 THEN 'Gold'
        WHEN NEW.skill_rating < 1400 THEN 'Platinum'
        WHEN NEW.skill_rating < 1600 THEN 'Master'
        ELSE 'Grandmaster'
    END
    WHERE id = NEW.id;
END;