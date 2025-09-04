-- Migration 010: Consolidated Clean Schema
-- This migration consolidates all previous migrations into a single, clean PostgreSQL schema
-- Ensures proper types, indexes, and foreign key relationships

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop all existing tables to start fresh (since minimal production data)
DROP TABLE IF EXISTS 
    password_reset_tokens,
    email_verification_log,
    game_moves,
    game_states,
    room_players,
    game_rooms,
    territory_events,
    territory_modifiers,
    user_reports,
    notifications,
    user_bans,
    admin_activity_logs,
    user_admin_roles,
    admin_roles,
    tournament_matches,
    tournament_participants,
    tournaments,
    achievement_progress,
    user_achievements,
    achievements,
    chat_messages,
    user_blocks,
    friendships,
    game_analytics,
    game_history,
    player_game_stats,
    player_stats,
    map_reviews,
    map_submissions,
    custom_maps,
    map_territories,
    maps,
    user_profiles,
    user_settings,
    games,
    users
CASCADE;

-- ============================================================================
-- CORE USER SYSTEM
-- ============================================================================

-- Users table with comprehensive fields
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    verification_sent_at TIMESTAMP,
    profile_picture TEXT,
    bio TEXT,
    skill_rating INTEGER DEFAULT 1000,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    peak_rating INTEGER DEFAULT 1000,
    current_tier VARCHAR(50),
    last_login TIMESTAMP,
    is_admin BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User settings for preferences
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'dark',
    preferred_color VARCHAR(20) DEFAULT 'bright-red',
    show_online_status BOOLEAN DEFAULT TRUE,
    direct_messages VARCHAR(20) DEFAULT 'friends',
    notifications JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- User profiles for extended information
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    location VARCHAR(100),
    timezone VARCHAR(50),
    language VARCHAR(10) DEFAULT 'en',
    privacy_settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Email verification system
CREATE TABLE email_verification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ADMIN & MODERATION SYSTEM
-- ============================================================================

-- Admin roles for permission management
CREATE TABLE admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions TEXT[] DEFAULT '{}',
    is_super_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User admin role assignments
CREATE TABLE user_admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- Admin activity logging
CREATE TABLE admin_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID NOT NULL REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,
    action_details JSONB DEFAULT '{}',
    target_type VARCHAR(50),
    target_id UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User account status for moderation
CREATE TABLE user_account_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'pending')),
    reason TEXT,
    admin_user_id UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- User bans for severe violations
CREATE TABLE user_bans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    ban_type VARCHAR(20) DEFAULT 'permanent' CHECK (ban_type IN ('temporary', 'permanent')),
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MAPS & TERRITORIES SYSTEM
-- ============================================================================

-- Maps table for game boards
CREATE TABLE maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    territories_count INTEGER NOT NULL,
    is_official BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    difficulty_rating INTEGER DEFAULT 1 CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    recommended_players VARCHAR(20) DEFAULT '2-6',
    preview_image TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map territories with polygon data
CREATE TABLE map_territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    territory_name VARCHAR(100) NOT NULL,
    continent VARCHAR(100),
    polygon_data JSONB NOT NULL,
    center_point POINT,
    army_position POINT,
    bonus_value INTEGER DEFAULT 0,
    is_capital BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Territory adjacencies for game logic
CREATE TABLE territory_adjacencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    territory_from VARCHAR(100) NOT NULL,
    territory_to VARCHAR(100) NOT NULL,
    adjacency_type VARCHAR(20) DEFAULT 'land' CHECK (adjacency_type IN ('land', 'sea', 'air')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, territory_from, territory_to)
);

-- Custom maps submitted by users
CREATE TABLE custom_maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    map_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    submission_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map submissions for approval workflow
CREATE TABLE map_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id),
    submitted_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_changes')),
    admin_notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map reviews and ratings
CREATE TABLE map_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    is_helpful BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, user_id)
);

-- ============================================================================
-- GAME SYSTEM
-- ============================================================================

-- Game rooms for multiplayer matches
CREATE TABLE game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished', 'cancelled')),
    max_players INTEGER DEFAULT 6 CHECK (max_players >= 2 AND max_players <= 8),
    password_hash VARCHAR(255),
    is_private BOOLEAN DEFAULT FALSE,
    map_id UUID NOT NULL REFERENCES maps(id),
    game_mode VARCHAR(50) DEFAULT 'classic',
    time_limit INTEGER, -- in minutes
    turn_timer INTEGER, -- in seconds
    -- Team support
    team_mode VARCHAR(20) DEFAULT 'none' CHECK (team_mode IN ('none', 'teams', 'auto_balance')),
    number_of_teams INTEGER CHECK (number_of_teams >= 2 AND number_of_teams <= 6),
    -- Game features
    capitals_enabled BOOLEAN DEFAULT FALSE,
    movement_type VARCHAR(20) DEFAULT 'classic' CHECK (movement_type IN ('classic', 'modern')),
    allow_spectators BOOLEAN DEFAULT TRUE,
    ranked BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- Room players with team assignments
CREATE TABLE room_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_color VARCHAR(20) NOT NULL,
    team_id UUID,
    is_ready BOOLEAN DEFAULT FALSE,
    is_host BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id)
);

-- Game states for active matches
CREATE TABLE game_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    game_phase VARCHAR(20) DEFAULT 'setup' CHECK (game_phase IN ('setup', 'deploy', 'attack', 'fortify', 'finished')),
    current_player_id UUID REFERENCES users(id),
    turn_number INTEGER DEFAULT 1,
    round_number INTEGER DEFAULT 1,
    territories JSONB NOT NULL DEFAULT '{}',
    player_stats JSONB NOT NULL DEFAULT '{}',
    game_log JSONB DEFAULT '[]',
    winner_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id)
);

-- Game moves history
CREATE TABLE game_moves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES users(id),
    turn_number INTEGER NOT NULL,
    move_type VARCHAR(20) NOT NULL,
    move_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Legacy games table for compatibility
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting',
    players JSONB DEFAULT '{}',
    game_state JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STATISTICS & ANALYTICS
-- ============================================================================

-- Player statistics
CREATE TABLE player_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_games INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_lost INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0.00,
    average_game_duration INTEGER DEFAULT 0, -- in minutes
    favorite_map_id UUID REFERENCES maps(id),
    longest_win_streak INTEGER DEFAULT 0,
    current_win_streak INTEGER DEFAULT 0,
    total_eliminations INTEGER DEFAULT 0,
    times_eliminated INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Individual game statistics
CREATE TABLE player_game_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id),
    player_id UUID NOT NULL REFERENCES users(id),
    placement INTEGER, -- 1st, 2nd, 3rd place etc
    territories_controlled INTEGER DEFAULT 0,
    armies_deployed INTEGER DEFAULT 0,
    attacks_made INTEGER DEFAULT 0,
    attacks_won INTEGER DEFAULT 0,
    eliminations INTEGER DEFAULT 0,
    game_duration INTEGER, -- in minutes
    elo_change INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game history and outcomes
CREATE TABLE game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id),
    game_id UUID REFERENCES games(id),
    map_id UUID NOT NULL REFERENCES maps(id),
    winner_id UUID REFERENCES users(id),
    player_id UUID NOT NULL REFERENCES users(id),
    placement INTEGER,
    elo_before INTEGER,
    elo_after INTEGER,
    elo_change INTEGER,
    action_type VARCHAR(50),
    turn_number INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game analytics for insights
CREATE TABLE game_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    total_games INTEGER DEFAULT 0,
    total_players INTEGER DEFAULT 0,
    average_game_duration INTEGER DEFAULT 0,
    most_popular_map_id UUID REFERENCES maps(id),
    peak_concurrent_games INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date)
);

-- ============================================================================
-- SOCIAL FEATURES
-- ============================================================================

-- Friendships system
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    UNIQUE(user_id, friend_id),
    CHECK (user_id != friend_id)
);

-- User blocks for privacy
CREATE TABLE user_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

-- Chat messages system
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    recipient_id UUID REFERENCES users(id), -- for private messages
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'emote', 'image', 'link_preview')),
    is_system BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    edited_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ACHIEVEMENTS SYSTEM
-- ============================================================================

-- Available achievements
CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    icon VARCHAR(10), -- emoji
    points INTEGER DEFAULT 0,
    rarity VARCHAR(20) DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    unlock_criteria JSONB NOT NULL,
    is_secret BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User achievements earned
CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id),
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress_data JSONB DEFAULT '{}',
    UNIQUE(user_id, achievement_id)
);

-- Achievement progress tracking
CREATE TABLE achievement_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id),
    current_progress INTEGER DEFAULT 0,
    total_required INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
);

-- ============================================================================
-- TOURNAMENT SYSTEM
-- ============================================================================

-- Tournament events
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    format VARCHAR(20) DEFAULT 'single_elimination' CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin', 'swiss')),
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'registration', 'active', 'completed', 'cancelled')),
    max_participants INTEGER,
    entry_fee INTEGER DEFAULT 0,
    prize_pool INTEGER DEFAULT 0,
    organizer_id UUID NOT NULL REFERENCES users(id),
    map_id UUID NOT NULL REFERENCES maps(id),
    registration_opens TIMESTAMP,
    registration_closes TIMESTAMP,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournament participants
CREATE TABLE tournament_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    registration_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    seed_number INTEGER,
    current_round INTEGER DEFAULT 0,
    is_eliminated BOOLEAN DEFAULT FALSE,
    final_placement INTEGER,
    UNIQUE(tournament_id, user_id)
);

-- Tournament matches
CREATE TABLE tournament_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    match_number INTEGER NOT NULL,
    player1_id UUID REFERENCES users(id),
    player2_id UUID REFERENCES users(id),
    winner_id UUID REFERENCES users(id),
    game_room_id UUID REFERENCES game_rooms(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'forfeit')),
    scheduled_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- NOTIFICATION & REPORTING SYSTEM
-- ============================================================================

-- User notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User reports for moderation
CREATE TABLE user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id),
    reported_user_id UUID NOT NULL REFERENCES users(id),
    report_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    evidence JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
    admin_id UUID REFERENCES users(id),
    admin_notes TEXT,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ADVANCED GAME FEATURES
-- ============================================================================

-- Territory modifiers for advanced gameplay
CREATE TABLE territory_modifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    territory_name VARCHAR(100) NOT NULL,
    modifier_type VARCHAR(50) NOT NULL,
    modifier_value JSONB NOT NULL,
    duration_turns INTEGER,
    applied_by UUID REFERENCES users(id),
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Territory events for dynamic gameplay
CREATE TABLE territory_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    territory_name VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    triggered_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- User indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_skill_rating ON users(skill_rating DESC);
CREATE INDEX idx_users_last_login ON users(last_login DESC);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Game room indexes
CREATE INDEX idx_game_rooms_status ON game_rooms(status);
CREATE INDEX idx_game_rooms_host_id ON game_rooms(host_id);
CREATE INDEX idx_game_rooms_map_id ON game_rooms(map_id);
CREATE INDEX idx_game_rooms_created_at ON game_rooms(created_at DESC);
CREATE INDEX idx_game_rooms_started_at ON game_rooms(started_at DESC);

-- Room players indexes
CREATE INDEX idx_room_players_room_id ON room_players(room_id);
CREATE INDEX idx_room_players_user_id ON room_players(user_id);
CREATE INDEX idx_room_players_team_id ON room_players(team_id);

-- Game states indexes
CREATE INDEX idx_game_states_room_id ON game_states(room_id);
CREATE INDEX idx_game_states_current_player ON game_states(current_player_id);
CREATE INDEX idx_game_states_phase ON game_states(game_phase);

-- Game moves indexes
CREATE INDEX idx_game_moves_room_id ON game_moves(room_id);
CREATE INDEX idx_game_moves_player_id ON game_moves(player_id);
CREATE INDEX idx_game_moves_turn ON game_moves(room_id, turn_number);

-- Map indexes
CREATE INDEX idx_maps_created_by ON maps(created_by);
CREATE INDEX idx_maps_is_official ON maps(is_official);
CREATE INDEX idx_maps_is_active ON maps(is_active);
CREATE INDEX idx_map_territories_map_id ON map_territories(map_id);
CREATE INDEX idx_territory_adjacencies_map_id ON territory_adjacencies(map_id);

-- Stats indexes
CREATE INDEX idx_player_stats_user_id ON player_stats(user_id);
CREATE INDEX idx_player_game_stats_room_id ON player_game_stats(room_id);
CREATE INDEX idx_player_game_stats_player_id ON player_game_stats(player_id);
CREATE INDEX idx_game_history_winner_id ON game_history(winner_id);
CREATE INDEX idx_game_history_player_id ON game_history(player_id);
CREATE INDEX idx_game_history_timestamp ON game_history(timestamp DESC);

-- Social indexes
CREATE INDEX idx_friendships_user_id ON friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX idx_friendships_status ON friendships(status);
CREATE INDEX idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- Achievement indexes
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX idx_achievement_progress_user_id ON achievement_progress(user_id);

-- Tournament indexes
CREATE INDEX idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX idx_tournament_participants_user_id ON tournament_participants(user_id);
CREATE INDEX idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);

-- Admin indexes
CREATE INDEX idx_user_admin_roles_user_id ON user_admin_roles(user_id);
CREATE INDEX idx_user_admin_roles_role_id ON user_admin_roles(role_id);
CREATE INDEX idx_admin_activity_logs_admin_user_id ON admin_activity_logs(admin_user_id);
CREATE INDEX idx_admin_activity_logs_created_at ON admin_activity_logs(created_at DESC);

-- Notification indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_user_reports_reporter_id ON user_reports(reporter_id);
CREATE INDEX idx_user_reports_reported_user_id ON user_reports(reported_user_id);

-- Auth system indexes
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_email_verification_log_user_id ON email_verification_log(user_id);

-- ============================================================================
-- INITIAL DATA SETUP
-- ============================================================================

-- Create default admin role
INSERT INTO admin_roles (id, name, description, permissions, is_super_admin) VALUES
(
    uuid_generate_v4(),
    'Super Admin',
    'Full administrative access to all system functions',
    ARRAY['*'],
    TRUE
) ON CONFLICT (name) DO NOTHING;

-- Create default map if none exists
INSERT INTO maps (id, name, description, territories_count, is_official, created_by, created_at, updated_at, version)
SELECT 
    uuid_generate_v4(),
    'World Map',
    'Classic Risk world map with 42 territories',
    42,
    TRUE,
    (SELECT id FROM users WHERE email = 'connorkeetch@gmail.com' LIMIT 1),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    1
WHERE NOT EXISTS (SELECT 1 FROM maps WHERE name = 'World Map');

-- Grant admin privileges to owner account if it exists
INSERT INTO user_admin_roles (user_id, role_id, assigned_by, assigned_at)
SELECT 
    u.id,
    ar.id,
    u.id,
    CURRENT_TIMESTAMP
FROM users u
CROSS JOIN admin_roles ar
WHERE u.email = 'connorkeetch@gmail.com'
  AND ar.name = 'Super Admin'
  AND NOT EXISTS (
    SELECT 1 FROM user_admin_roles uar 
    WHERE uar.user_id = u.id AND uar.role_id = ar.id
  );

-- Create basic achievements
INSERT INTO achievements (name, description, category, icon, points, rarity, unlock_criteria) VALUES
('First Victory', 'Win your first game', 'gameplay', '🏆', 100, 'common', '{"type": "wins", "count": 1}'),
('World Domination', 'Win a game by controlling all territories', 'gameplay', '🌍', 500, 'rare', '{"type": "total_victory", "count": 1}'),
('Rookie', 'Play 10 games', 'participation', '🎮', 200, 'common', '{"type": "games_played", "count": 10}'),
('Veteran', 'Play 100 games', 'participation', '🎖️', 1000, 'epic', '{"type": "games_played", "count": 100}'),
('Elimination Expert', 'Eliminate 50 players', 'combat', '⚔️', 300, 'rare', '{"type": "eliminations", "count": 50}')
ON CONFLICT (name) DO NOTHING;

COMMIT;