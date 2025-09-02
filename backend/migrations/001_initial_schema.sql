-- Complete PostgreSQL Schema for Risk Game
-- Single consolidated migration combining all previous migrations
-- Run this on a fresh PostgreSQL database

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- BASE TABLES (No foreign key dependencies)
-- ============================================

-- Users table (core user accounts)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMP,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    profile_picture VARCHAR(500),
    bio TEXT,
    country VARCHAR(2),
    preferred_color VARCHAR(50),
    preferred_language VARCHAR(10) DEFAULT 'en',
    notification_preferences JSONB DEFAULT '{"email": true, "push": false}',
    privacy_settings JSONB DEFAULT '{"profile_visible": true, "stats_visible": true}',
    
    -- Admin fields
    is_admin BOOLEAN DEFAULT FALSE,
    admin_since TIMESTAMP,
    
    -- Legal
    terms_accepted_at TIMESTAMP,
    privacy_accepted_at TIMESTAMP,
    
    -- Skill rating
    skill_rating INTEGER DEFAULT 1200,
    skill_deviation INTEGER DEFAULT 350,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    peak_rating INTEGER DEFAULT 1200,
    current_tier VARCHAR(50) DEFAULT 'bronze',
    last_ranked_game_at TIMESTAMP,
    
    -- Soft delete support
    deleted_at TIMESTAMP,
    deleted_by UUID, -- Self-reference added after table creation
    deletion_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Maps table (map definitions)
CREATE TABLE IF NOT EXISTS maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_id UUID, -- Reference added after users table
    image_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    is_official BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    play_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2),
    
    -- Map configuration
    max_players INTEGER DEFAULT 6,
    min_players INTEGER DEFAULT 2,
    default_armies_per_territory INTEGER DEFAULT 1,
    
    -- Approval workflow
    submission_status VARCHAR(50) DEFAULT 'draft',
    submitted_at TIMESTAMP,
    approved_by UUID, -- Reference added after users table
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- New columns from migration 002
    download_count INTEGER DEFAULT 0,
    rating_average DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    featured_at TIMESTAMP,
    
    -- Metadata
    tags JSONB DEFAULT '[]',
    statistics JSONB DEFAULT '{}',
    rules_config JSONB DEFAULT '{}',
    visual_config JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Roles
CREATE TABLE IF NOT EXISTS admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    is_super_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{}',
    created_by UUID, -- Reference added after users table
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seasons for competitive play
CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    season_number INTEGER NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Map Tags
CREATE TABLE IF NOT EXISTS map_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    created_by UUID, -- Reference added after users table
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DEPENDENT TABLES (With foreign key references)
-- ============================================

-- Add foreign key references to base tables
ALTER TABLE users ADD CONSTRAINT fk_users_deleted_by 
    FOREIGN KEY (deleted_by) REFERENCES users(id);
    
ALTER TABLE maps ADD CONSTRAINT fk_maps_creator_id 
    FOREIGN KEY (creator_id) REFERENCES users(id);
    
ALTER TABLE maps ADD CONSTRAINT fk_maps_approved_by 
    FOREIGN KEY (approved_by) REFERENCES users(id);
    
ALTER TABLE feature_flags ADD CONSTRAINT fk_feature_flags_created_by 
    FOREIGN KEY (created_by) REFERENCES users(id);
    
ALTER TABLE tournaments ADD CONSTRAINT fk_tournaments_created_by 
    FOREIGN KEY (created_by) REFERENCES users(id);

-- User Admin Role Assignments
CREATE TABLE IF NOT EXISTS user_admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- Admin Activity Logs
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID NOT NULL REFERENCES users(id),
    action_type VARCHAR(100) NOT NULL,
    action_details JSONB NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Account Status
CREATE TABLE IF NOT EXISTS user_account_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    reason TEXT,
    admin_user_id UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content Approval Queue
CREATE TABLE IF NOT EXISTS content_approval_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_type VARCHAR(50) NOT NULL,
    content_id VARCHAR(255) NOT NULL,
    submitter_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    admin_user_id UUID REFERENCES users(id),
    admin_notes TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP
);

-- Map Territories
CREATE TABLE IF NOT EXISTS map_territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    continent VARCHAR(255),
    x_position INTEGER NOT NULL,
    y_position INTEGER NOT NULL,
    polygon_points TEXT,
    
    -- Territory modifiers
    defense_bonus INTEGER DEFAULT 0,
    attack_bonus INTEGER DEFAULT 0,
    movement_cost INTEGER DEFAULT 1,
    can_produce_units BOOLEAN DEFAULT TRUE,
    special_properties JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, name)
);

-- Territory Adjacencies
CREATE TABLE IF NOT EXISTS territory_adjacencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    territory_from UUID NOT NULL REFERENCES map_territories(id) ON DELETE CASCADE,
    territory_to UUID NOT NULL REFERENCES map_territories(id) ON DELETE CASCADE,
    connection_type VARCHAR(50) DEFAULT 'land',
    is_bidirectional BOOLEAN DEFAULT TRUE,
    UNIQUE(territory_from, territory_to)
);

-- Map Continents
CREATE TABLE IF NOT EXISTS map_continents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    bonus_armies INTEGER DEFAULT 0,
    color VARCHAR(7),
    requirements JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, name)
);

-- Game Rooms
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

-- Games table (legacy, keeping for compatibility)
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255),
    map_id UUID REFERENCES maps(id),
    created_by UUID REFERENCES users(id),
    
    -- Game state
    status VARCHAR(50) DEFAULT 'waiting',
    phase VARCHAR(50) DEFAULT 'setup',
    turn_count INTEGER DEFAULT 0,
    current_turn UUID REFERENCES users(id),
    
    -- Game settings
    max_players INTEGER DEFAULT 6,
    min_players INTEGER DEFAULT 2,
    is_private BOOLEAN DEFAULT FALSE,
    password VARCHAR(255),
    turn_time_limit INTEGER,
    game_mode VARCHAR(50) DEFAULT 'classic',
    fog_of_war BOOLEAN DEFAULT FALSE,
    allow_alliances BOOLEAN DEFAULT FALSE,
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- Game Players (for legacy games table)
CREATE TABLE IF NOT EXISTS game_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    player_order INTEGER NOT NULL,
    color VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    eliminated_at TIMESTAMP,
    final_position INTEGER,
    territories_count INTEGER DEFAULT 0,
    armies_count INTEGER DEFAULT 0,
    cards_count INTEGER DEFAULT 0,
    
    -- Stats
    territories_conquered INTEGER DEFAULT 0,
    armies_killed INTEGER DEFAULT 0,
    armies_lost INTEGER DEFAULT 0,
    
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, user_id)
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

-- Game Territories (game state)
CREATE TABLE IF NOT EXISTS game_territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    territory_id UUID NOT NULL REFERENCES map_territories(id),
    owner_id UUID REFERENCES users(id),
    armies INTEGER DEFAULT 1,
    
    -- Special states
    is_capital BOOLEAN DEFAULT FALSE,
    has_fortress BOOLEAN DEFAULT FALSE,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, territory_id)
);

-- Game Moves/History
CREATE TABLE IF NOT EXISTS game_moves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_state_id UUID REFERENCES game_states(id) ON DELETE CASCADE,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    move_type VARCHAR(50) NOT NULL,
    move_data JSONB NOT NULL,
    turn_number INTEGER,
    phase VARCHAR(50),
    move_number INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    
    -- Game state tracking
    turn_number INTEGER NOT NULL,
    phase VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    action_data JSONB NOT NULL,
    game_state_before JSONB,
    game_state_after JSONB,
    client_timestamp TIMESTAMP,
    processing_time_ms INTEGER,
    
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

-- Friends
CREATE TABLE IF NOT EXISTS friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id)
);

-- Friendships (enhanced version)
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

-- User Profiles
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

-- User Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50),
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    message TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skill Rating History
CREATE TABLE IF NOT EXISTS skill_rating_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id UUID REFERENCES games(id),
    old_rating INTEGER NOT NULL,
    new_rating INTEGER NOT NULL,
    rating_change INTEGER NOT NULL,
    old_deviation INTEGER,
    new_deviation INTEGER,
    old_tier VARCHAR(50),
    new_tier VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Statistics History (for ELO tracking over time)
CREATE TABLE IF NOT EXISTS player_stats_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id UUID REFERENCES games(id) ON DELETE SET NULL,
    elo_before INTEGER,
    elo_after INTEGER,
    elo_change INTEGER,
    wins_before INTEGER,
    wins_after INTEGER,
    losses_before INTEGER,
    losses_after INTEGER,
    game_mode VARCHAR(50),
    opponent_elos JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Map Usage Statistics
CREATE TABLE IF NOT EXISTS map_usage_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    total_games INTEGER DEFAULT 0,
    total_players INTEGER DEFAULT 0,
    avg_game_duration INTEGER,
    avg_player_count DECIMAL(3,1),
    popularity_score DECIMAL(5,2) DEFAULT 0,
    last_played_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id)
);

-- Map Ratings
CREATE TABLE IF NOT EXISTS map_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, user_id)
);

-- Map Comments
CREATE TABLE IF NOT EXISTS map_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES map_comments(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map Downloads
CREATE TABLE IF NOT EXISTS map_downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    download_type VARCHAR(50) DEFAULT 'web',
    ip_address VARCHAR(45),
    user_agent TEXT,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map Favorites
CREATE TABLE IF NOT EXISTS map_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, user_id)
);

-- Map Tag Associations
CREATE TABLE IF NOT EXISTS map_tag_associations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES map_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, tag_id)
);

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

-- Active Territory Effects
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

-- Custom Maps
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

-- Game Events
CREATE TABLE IF NOT EXISTS game_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    player_id UUID REFERENCES users(id),
    event_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    entity_details JSONB,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'success',
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Compliance fields
    retention_date DATE,
    gdpr_relevant BOOLEAN DEFAULT FALSE,
    security_relevant BOOLEAN DEFAULT FALSE
);

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
-- INDEXES FOR PERFORMANCE
-- ============================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_skill_rating ON users(skill_rating DESC);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Admin indexes
CREATE INDEX IF NOT EXISTS idx_admin_activity_admin ON admin_activity_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_timestamp ON admin_activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_admin_roles_user ON user_admin_roles(user_id);

-- Game indexes
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at);
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_players_game_user ON game_players(game_id, user_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_game ON game_moves(game_id);

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
CREATE INDEX IF NOT EXISTS idx_game_history_game_id ON game_history(game_id);
CREATE INDEX IF NOT EXISTS idx_game_history_player_id ON game_history(player_id);
CREATE INDEX IF NOT EXISTS idx_game_history_timestamp ON game_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_game_history_action_type ON game_history(action_type);
CREATE INDEX IF NOT EXISTS idx_game_history_turn ON game_history(game_id, turn_number);

-- Player stats indexes
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player_id ON player_game_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_game_id ON player_game_stats(game_history_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_history_user_id ON player_stats_history(user_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_history_created_at ON player_stats_history(created_at);

-- Map indexes
CREATE INDEX IF NOT EXISTS idx_maps_creator ON maps(creator_id);
CREATE INDEX IF NOT EXISTS idx_maps_official ON maps(is_official);
CREATE INDEX IF NOT EXISTS idx_maps_is_public ON maps(is_public);
CREATE INDEX IF NOT EXISTS idx_maps_created_at ON maps(created_at);
CREATE INDEX IF NOT EXISTS idx_maps_creator_id ON maps(creator_id);
CREATE INDEX IF NOT EXISTS idx_maps_featured ON maps(featured, featured_at DESC);
CREATE INDEX IF NOT EXISTS idx_maps_rating ON maps(rating_average DESC);
CREATE INDEX IF NOT EXISTS idx_maps_play_count ON maps(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_map_territories_map ON map_territories(map_id);

-- Map usage stats indexes
CREATE INDEX IF NOT EXISTS idx_map_usage_stats_map_id ON map_usage_stats(map_id);
CREATE INDEX IF NOT EXISTS idx_map_usage_stats_popularity ON map_usage_stats(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_map_usage_stats_last_played ON map_usage_stats(last_played_at DESC);

-- Map ratings indexes
CREATE INDEX IF NOT EXISTS idx_map_ratings_map_id ON map_ratings(map_id);
CREATE INDEX IF NOT EXISTS idx_map_ratings_user_id ON map_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_map_ratings_rating ON map_ratings(rating);

-- Map comments indexes
CREATE INDEX IF NOT EXISTS idx_map_comments_map_id ON map_comments(map_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_user_id ON map_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_parent ON map_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_created ON map_comments(created_at DESC);

-- Map downloads indexes
CREATE INDEX IF NOT EXISTS idx_map_downloads_map_id ON map_downloads(map_id);
CREATE INDEX IF NOT EXISTS idx_map_downloads_user_id ON map_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_map_downloads_date ON map_downloads(downloaded_at DESC);

-- Map favorites indexes
CREATE INDEX IF NOT EXISTS idx_map_favorites_map_id ON map_favorites(map_id);
CREATE INDEX IF NOT EXISTS idx_map_favorites_user_id ON map_favorites(user_id);

-- Map tag associations indexes
CREATE INDEX IF NOT EXISTS idx_map_tag_associations_map_id ON map_tag_associations(map_id);
CREATE INDEX IF NOT EXISTS idx_map_tag_associations_tag_id ON map_tag_associations(tag_id);

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
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- Game events indexes
CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_game_events_unprocessed ON game_events(processed, created_at) WHERE processed = FALSE;

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_security ON audit_logs(security_relevant) WHERE security_relevant = TRUE;

-- ============================================
-- UPDATE TRIGGERS
-- ============================================

-- Function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $trigger_func$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$trigger_func$ LANGUAGE plpgsql;

-- Add triggers for all tables with updated_at columns
DO $trigger_creation$ 
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
END
$trigger_creation$ LANGUAGE plpgsql;

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default admin roles
INSERT INTO admin_roles (name, description, permissions, is_super_admin) VALUES 
('super_admin', 'Full system access', '["*"]', true),
('content_moderator', 'Manage user content and maps', '["content.*", "users.view", "users.suspend"]', false),
('user_moderator', 'Manage user accounts', '["users.*", "logs.view"]', false),
('game_moderator', 'Manage games and sessions', '["games.*", "users.view"]', false),
('system_viewer', 'View system metrics', '["system.view", "logs.view", "games.view"]', false)
ON CONFLICT (name) DO NOTHING;

-- Insert default feature flags
INSERT INTO feature_flags (flag_name, description, is_enabled) VALUES 
('map_approval_required', 'Require admin approval for new maps', FALSE),
('user_registration_open', 'Allow new user registration', TRUE),
('maintenance_mode', 'System maintenance mode', FALSE),
('advanced_map_editor', 'Enable advanced map editor features', TRUE),
('game_spectating', 'Allow spectating games', TRUE)
ON CONFLICT (flag_name) DO NOTHING;

-- Insert default map tags
INSERT INTO map_tags (name, description) VALUES
('Classic', 'Traditional Risk-style maps'),
('Fantasy', 'Fantasy-themed maps'),
('Historical', 'Based on historical periods'),
('Sci-Fi', 'Science fiction themed maps'),
('Small', 'Maps with fewer than 20 territories'),
('Medium', 'Maps with 20-42 territories'),
('Large', 'Maps with more than 42 territories'),
('Balanced', 'Well-balanced for competitive play'),
('Asymmetric', 'Intentionally unbalanced starting positions'),
('Quick', 'Designed for quick games')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- MIGRATION TRACKING
-- ============================================

-- Track which migrations have been applied
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('001_initial_schema')
ON CONFLICT (version) DO NOTHING;

-- ============================================
-- COMPLETION
-- ============================================

-- Log successful completion
DO $completion_log$
BEGIN
    RAISE NOTICE 'Migration 001_initial_schema completed successfully at %', CURRENT_TIMESTAMP;
    RAISE NOTICE 'All tables, indexes, and triggers have been created';
    RAISE NOTICE 'Default data has been inserted';
END
$completion_log$ LANGUAGE plpgsql;