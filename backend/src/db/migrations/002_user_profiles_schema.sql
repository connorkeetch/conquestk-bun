-- User Profiles and Achievement System Migration
-- This migration adds comprehensive user profile management and achievement tracking

-- User profiles with extended information
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  avatar_url TEXT,
  bio TEXT,
  join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  preferences JSONB DEFAULT '{}',
  level INTEGER DEFAULT 1,
  experience_points INTEGER DEFAULT 0,
  total_playtime INTEGER DEFAULT 0, -- in minutes
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  favorite_map_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (favorite_map_id) REFERENCES maps(id) ON DELETE SET NULL
);

-- Achievement definitions
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT,
  icon_emoji VARCHAR(10) DEFAULT '🏆',
  category VARCHAR(50) DEFAULT 'general',
  points INTEGER DEFAULT 10,
  rarity VARCHAR(20) DEFAULT 'common', -- common, rare, epic, legendary
  requirements JSONB DEFAULT '{}',
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User achievements (unlocked badges)
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT,
  achievement_id TEXT,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  progress JSONB DEFAULT '{}',
  PRIMARY KEY (user_id, achievement_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

-- User statistics (detailed game analytics)
CREATE TABLE IF NOT EXISTS user_statistics (
  user_id TEXT PRIMARY KEY,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  games_abandoned INTEGER DEFAULT 0,
  territories_conquered INTEGER DEFAULT 0,
  battles_won INTEGER DEFAULT 0,
  battles_lost INTEGER DEFAULT 0,
  continents_controlled INTEGER DEFAULT 0,
  average_game_length INTEGER DEFAULT 0, -- in minutes
  longest_game INTEGER DEFAULT 0, -- in minutes
  shortest_game INTEGER DEFAULT 0, -- in minutes
  best_turn_time INTEGER DEFAULT 0, -- in seconds
  maps_created INTEGER DEFAULT 0,
  maps_rated INTEGER DEFAULT 0,
  tournaments_joined INTEGER DEFAULT 0,
  tournaments_won INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Game history (detailed match records)
CREATE TABLE IF NOT EXISTS game_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  game_id TEXT,
  map_id TEXT,
  map_name VARCHAR(100),
  player_count INTEGER,
  position INTEGER, -- final ranking in game
  result VARCHAR(20), -- 'won', 'lost', 'abandoned'
  duration INTEGER, -- game length in minutes
  territories_held INTEGER,
  max_territories INTEGER,
  turns_taken INTEGER,
  battles_initiated INTEGER,
  battles_won INTEGER,
  continents_held TEXT, -- JSON array of continent names
  game_mode VARCHAR(50),
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL
);

-- User preferences (settings and customization)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  theme VARCHAR(20) DEFAULT 'dark',
  language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'UTC',
  notifications_enabled BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT TRUE,
  sound_effects BOOLEAN DEFAULT TRUE,
  background_music BOOLEAN DEFAULT TRUE,
  auto_save_frequency INTEGER DEFAULT 30, -- seconds
  animation_speed VARCHAR(10) DEFAULT 'normal', -- slow, normal, fast
  show_territory_names BOOLEAN DEFAULT TRUE,
  show_army_counts BOOLEAN DEFAULT TRUE,
  confirm_actions BOOLEAN DEFAULT TRUE,
  privacy_level VARCHAR(20) DEFAULT 'public', -- public, friends, private
  allow_friend_requests BOOLEAN DEFAULT TRUE,
  show_online_status BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_active ON user_profiles(last_active);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_game_history_user_id ON game_history(user_id);
CREATE INDEX IF NOT EXISTS idx_game_history_started_at ON game_history(started_at);
CREATE INDEX IF NOT EXISTS idx_game_history_result ON game_history(result);

-- Insert default achievements
INSERT OR IGNORE INTO achievements (id, name, description, icon_emoji, category, points, rarity) VALUES
('first_win', 'First Victory', 'Win your first game', '🥇', 'gameplay', 25, 'common'),
('streak_5', 'Win Streak', 'Win 5 games in a row', '🔥', 'gameplay', 50, 'rare'),
('streak_10', 'Unstoppable', 'Win 10 games in a row', '⚡', 'gameplay', 100, 'epic'),
('conqueror', 'World Conqueror', 'Win 100 games', '🌍', 'gameplay', 200, 'legendary'),
('map_creator', 'Map Maker', 'Create your first custom map', '🗺️', 'creative', 30, 'common'),
('community_builder', 'Community Builder', 'Create 5 public maps', '🏗️', 'creative', 75, 'rare'),
('speed_demon', 'Speed Demon', 'Win a game in under 30 minutes', '💨', 'gameplay', 40, 'rare'),
('marathon_master', 'Marathon Master', 'Play a game longer than 3 hours', '⏰', 'gameplay', 60, 'epic'),
('social_butterfly', 'Social Butterfly', 'Add 10 friends', '🦋', 'social', 25, 'common'),
('tournament_champion', 'Tournament Champion', 'Win a tournament', '🏆', 'competitive', 150, 'legendary'),
('strategist', 'Master Strategist', 'Win without losing any battles in a turn', '🧠', 'gameplay', 80, 'epic'),
('explorer', 'World Explorer', 'Play on 10 different maps', '🧭', 'exploration', 35, 'common'),
('veteran', 'Veteran Player', 'Play 1000 games', '🎖️', 'dedication', 300, 'legendary'),
('perfectionist', 'Perfectionist', 'Get 100% win rate over 10 games', '💎', 'gameplay', 120, 'epic');

-- Insert default user statistics for existing users
INSERT OR IGNORE INTO user_statistics (user_id)
SELECT id FROM users;

-- Insert default user profiles for existing users
INSERT OR IGNORE INTO user_profiles (user_id, join_date)
SELECT id, created_at FROM users;

-- Insert default user preferences for existing users
INSERT OR IGNORE INTO user_preferences (user_id)
SELECT id FROM users;