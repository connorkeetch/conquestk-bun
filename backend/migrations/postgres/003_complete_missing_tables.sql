-- Complete Missing Tables Migration for Risk Game
-- This migration adds ALL missing tables identified in the codebase audit
-- Fixes production deployment issues

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- GAME ROOM AND SESSION TABLES (Critical for game functionality)
-- ============================================

-- Game Rooms table
CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    max_players INTEGER NOT NULL DEFAULT 6,
    is_private BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished', 'cancelled')),
    password_hash VARCHAR(255),
    game_mode VARCHAR(50) DEFAULT 'classic',
    map_id UUID REFERENCES maps(id),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- Room Players
CREATE TABLE IF NOT EXISTS room_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_color VARCHAR(50),
    player_order INTEGER,
    is_ready BOOLEAN DEFAULT FALSE,
    is_ai BOOLEAN DEFAULT FALSE,
    ai_difficulty VARCHAR(20),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    UNIQUE(room_id, user_id)
);

-- Game States
CREATE TABLE IF NOT EXISTS game_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    game_data JSONB NOT NULL,
    turn_number INTEGER DEFAULT 1,
    current_player_id UUID REFERENCES users(id),
    phase VARCHAR(20) DEFAULT 'setup' CHECK (phase IN ('setup', 'reinforcement', 'attack', 'fortify', 'finished')),
    round_number INTEGER DEFAULT 1,
    winner_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game Moves/History
CREATE TABLE IF NOT EXISTS game_moves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_state_id UUID NOT NULL REFERENCES game_states(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    move_type VARCHAR(50) NOT NULL,
    move_data JSONB NOT NULL,
    move_number INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- GAME HISTORY AND STATS TABLES
-- ============================================

-- Game History (completed games)
CREATE TABLE IF NOT EXISTS game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES game_rooms(id) ON DELETE SET NULL,
    game_mode VARCHAR(50),
    map_id UUID REFERENCES maps(id),
    map_name VARCHAR(200),
    winner_id UUID REFERENCES users(id),
    total_turns INTEGER,
    total_rounds INTEGER,
    duration_minutes INTEGER,
    players JSONB NOT NULL,
    final_state JSONB,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Game Stats
CREATE TABLE IF NOT EXISTS player_game_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_history_id UUID NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    placement INTEGER NOT NULL,
    territories_conquered INTEGER DEFAULT 0,
    armies_deployed INTEGER DEFAULT 0,
    armies_lost INTEGER DEFAULT 0,
    battles_won INTEGER DEFAULT 0,
    battles_lost INTEGER DEFAULT 0,
    cards_earned INTEGER DEFAULT 0,
    eliminations INTEGER DEFAULT 0,
    was_eliminated BOOLEAN DEFAULT FALSE,
    eliminated_by UUID REFERENCES users(id),
    time_played_minutes INTEGER,
    final_territory_count INTEGER,
    peak_territory_count INTEGER,
    rating_change INTEGER,
    new_rating INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Stats (aggregate)
CREATE TABLE IF NOT EXISTS player_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_lost INTEGER DEFAULT 0,
    games_abandoned INTEGER DEFAULT 0,
    total_playtime_minutes INTEGER DEFAULT 0,
    favorite_map_id UUID REFERENCES maps(id),
    win_streak INTEGER DEFAULT 0,
    best_win_streak INTEGER DEFAULT 0,
    total_territories_conquered INTEGER DEFAULT 0,
    total_armies_deployed INTEGER DEFAULT 0,
    total_battles_won INTEGER DEFAULT 0,
    total_battles_lost INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ============================================
-- ACHIEVEMENT SYSTEM TABLES
-- ============================================

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50),
    points INTEGER DEFAULT 10,
    icon_url VARCHAR(500),
    requirement_type VARCHAR(50),
    requirement_value INTEGER,
    is_secret BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Achievements
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    game_id UUID REFERENCES game_history(id),
    progress INTEGER DEFAULT 0,
    UNIQUE(user_id, achievement_id)
);

-- Achievement Progress
CREATE TABLE IF NOT EXISTS achievement_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    current_progress INTEGER DEFAULT 0,
    target_progress INTEGER NOT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
);

-- ============================================
-- PROFILE AND SOCIAL TABLES
-- ============================================

-- User Profiles (extended profile data)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    banner_url VARCHAR(500),
    bio TEXT,
    location VARCHAR(200),
    website VARCHAR(500),
    social_links JSONB DEFAULT '{}',
    badges JSONB DEFAULT '[]',
    theme_preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Friendships
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    UNIQUE(user_id, friend_id),
    CHECK (user_id != friend_id)
);

-- User Blocks
CREATE TABLE IF NOT EXISTS user_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

-- ============================================
-- RANKING AND TOURNAMENT TABLES
-- ============================================

-- Ranking History
CREATE TABLE IF NOT EXISTS ranking_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    deviation INTEGER NOT NULL,
    rank INTEGER,
    tier VARCHAR(50),
    games_played INTEGER,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    tournament_type VARCHAR(50) DEFAULT 'single_elimination',
    status VARCHAR(50) DEFAULT 'upcoming',
    max_participants INTEGER,
    current_participants INTEGER DEFAULT 0,
    entry_requirements JSONB DEFAULT '{}',
    prizes JSONB DEFAULT '[]',
    rules JSONB DEFAULT '{}',
    registration_opens TIMESTAMP,
    registration_closes TIMESTAMP,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournament Participants
CREATE TABLE IF NOT EXISTS tournament_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seed INTEGER,
    current_round INTEGER DEFAULT 1,
    placement INTEGER,
    is_eliminated BOOLEAN DEFAULT FALSE,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, user_id)
);

-- Tournament Matches
CREATE TABLE IF NOT EXISTS tournament_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    match_number INTEGER NOT NULL,
    game_room_id UUID REFERENCES game_rooms(id),
    player1_id UUID REFERENCES users(id),
    player2_id UUID REFERENCES users(id),
    winner_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending',
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(tournament_id, round_number, match_number)
);

-- ============================================
-- MAP APPROVAL WORKFLOW TABLES
-- ============================================

-- Map Submissions
CREATE TABLE IF NOT EXISTS map_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    submitter_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending',
    submission_notes TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewer_id UUID REFERENCES users(id),
    review_notes TEXT,
    rejection_reason TEXT,
    version INTEGER DEFAULT 1,
    changes_requested JSONB DEFAULT '[]'
);

-- Map Reviews
CREATE TABLE IF NOT EXISTS map_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    submission_id UUID REFERENCES map_submissions(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    balance_score INTEGER CHECK (balance_score >= 1 AND balance_score <= 10),
    creativity_score INTEGER CHECK (creativity_score >= 1 AND creativity_score <= 10),
    playability_score INTEGER CHECK (playability_score >= 1 AND playability_score <= 10),
    review_text TEXT,
    is_approved BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map Test Games
CREATE TABLE IF NOT EXISTS map_test_games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    submission_id UUID REFERENCES map_submissions(id),
    game_room_id UUID REFERENCES game_rooms(id),
    tester_feedback JSONB DEFAULT '[]',
    balance_issues JSONB DEFAULT '[]',
    bug_reports JSONB DEFAULT '[]',
    overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
    recommendation VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map Approval History
CREATE TABLE IF NOT EXISTS map_approval_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map Featured History
CREATE TABLE IF NOT EXISTS map_featured_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    featured_by UUID NOT NULL REFERENCES users(id),
    featured_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    featured_until TIMESTAMP,
    reason TEXT,
    position INTEGER
);

-- ============================================
-- TERRITORY MODIFIERS TABLES
-- ============================================

-- Territory Modifiers
CREATE TABLE IF NOT EXISTS territory_modifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    territory_id UUID NOT NULL REFERENCES map_territories(id) ON DELETE CASCADE,
    modifier_type VARCHAR(50) NOT NULL,
    modifier_value DECIMAL(10,2) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, territory_id, modifier_type)
);

-- Territory Events
CREATE TABLE IF NOT EXISTS territory_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    trigger_condition JSONB NOT NULL,
    effect JSONB NOT NULL,
    probability DECIMAL(3,2) DEFAULT 1.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Active Territory Effects (during games)
CREATE TABLE IF NOT EXISTS active_territory_effects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_state_id UUID NOT NULL REFERENCES game_states(id) ON DELETE CASCADE,
    territory_id UUID NOT NULL REFERENCES map_territories(id),
    effect_type VARCHAR(50) NOT NULL,
    effect_value JSONB NOT NULL,
    expires_at_turn INTEGER,
    applied_at_turn INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CUSTOM MAPS AND MAP EDITOR TABLES
-- ============================================

-- Custom Maps (if not exists)
CREATE TABLE IF NOT EXISTS custom_maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_data JSONB NOT NULL,
    thumbnail_url VARCHAR(500),
    is_public BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    play_count INTEGER DEFAULT 0,
    fork_count INTEGER DEFAULT 0,
    forked_from UUID REFERENCES custom_maps(id),
    version VARCHAR(20) DEFAULT '1.0.0',
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map Editor Sessions
CREATE TABLE IF NOT EXISTS map_editor_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_id UUID REFERENCES custom_maps(id),
    session_data JSONB NOT NULL,
    is_autosave BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CHAT AND MESSAGING TABLES
-- ============================================

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type VARCHAR(20) DEFAULT 'text',
    content TEXT NOT NULL,
    is_system_message BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Private Messages
CREATE TABLE IF NOT EXISTS private_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(200),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    is_deleted_by_sender BOOLEAN DEFAULT FALSE,
    is_deleted_by_recipient BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ADMIN AND MODERATION TABLES
-- ============================================

-- User Reports
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reported_content_type VARCHAR(50),
    reported_content_id UUID,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    moderator_id UUID REFERENCES users(id),
    moderator_notes TEXT,
    action_taken VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- User Bans
CREATE TABLE IF NOT EXISTS user_bans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by UUID NOT NULL REFERENCES users(id),
    ban_type VARCHAR(50) DEFAULT 'temporary',
    reason TEXT NOT NULL,
    evidence JSONB DEFAULT '{}',
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    unbanned_by UUID REFERENCES users(id),
    unbanned_at TIMESTAMP,
    unban_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NOTIFICATION TABLES
-- ============================================

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ANALYTICS AND TELEMETRY TABLES
-- ============================================

-- Game Analytics
CREATE TABLE IF NOT EXISTS game_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES game_history(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    player_id UUID REFERENCES users(id),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Activity
CREATE TABLE IF NOT EXISTS user_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL,
    activity_data JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Game room indexes
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_game_rooms_host_id ON game_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_game_rooms_created_at ON game_rooms(created_at DESC);

-- Room players indexes
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id);

-- Game states indexes
CREATE INDEX IF NOT EXISTS idx_game_states_room_id ON game_states(room_id);
CREATE INDEX IF NOT EXISTS idx_game_states_current_player ON game_states(current_player_id);

-- Game history indexes
CREATE INDEX IF NOT EXISTS idx_game_history_winner_id ON game_history(winner_id);
CREATE INDEX IF NOT EXISTS idx_game_history_ended_at ON game_history(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_history_map_id ON game_history(map_id);

-- Player stats indexes
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player_id ON player_game_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_game_id ON player_game_stats(game_history_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);

-- Achievement indexes
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievement_progress_user_id ON achievement_progress(user_id);

-- Social indexes
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- Ranking indexes
CREATE INDEX IF NOT EXISTS idx_ranking_history_user_id ON ranking_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ranking_history_recorded_at ON ranking_history(recorded_at DESC);

-- Tournament indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON tournament_participants(user_id);

-- Map approval indexes
CREATE INDEX IF NOT EXISTS idx_map_submissions_status ON map_submissions(status);
CREATE INDEX IF NOT EXISTS idx_map_submissions_map_id ON map_submissions(map_id);
CREATE INDEX IF NOT EXISTS idx_map_reviews_map_id ON map_reviews(map_id);

-- Chat indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- Notification indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================
-- CREATE UPDATE TRIGGERS
-- ============================================

-- Function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for tables with updated_at columns
DO $$ 
DECLARE
    t record;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t.table_name, t.table_name);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t.table_name, t.table_name);
    END LOOP;
END $$;

-- ============================================
-- MIGRATION COMPLETION
-- ============================================

-- Log migration completion
DO $$
BEGIN
    -- Check if schema_migrations table exists and insert record
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations') THEN
        INSERT INTO schema_migrations (version, applied_at)
        VALUES ('003', CURRENT_TIMESTAMP)
        ON CONFLICT (version) DO NOTHING;
    END IF;
    
    RAISE NOTICE 'Migration 003 completed successfully';
END $$;