-- Complete PostgreSQL Schema for Risk Game
-- This is the single source of truth for the database schema
-- Run this on a fresh PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE USER TABLES
-- ============================================

-- Users table (already exists in production, so using IF NOT EXISTS)
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
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- ============================================
-- ADMIN SYSTEM TABLES
-- ============================================

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

-- Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),  -- Made nullable for system flags
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MAPS AND TERRITORIES
-- ============================================

-- Maps table (already exists in production)
CREATE TABLE IF NOT EXISTS maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_id UUID REFERENCES users(id),
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
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Metadata
    tags JSONB DEFAULT '[]',
    statistics JSONB DEFAULT '{}',
    rules_config JSONB DEFAULT '{}',
    visual_config JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- ============================================
-- GAMES AND SESSIONS
-- ============================================

-- Games table (already exists in production)
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

-- Game Players
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

-- Game History/Moves
CREATE TABLE IF NOT EXISTS game_moves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES users(id),
    move_type VARCHAR(50) NOT NULL,
    move_data JSONB NOT NULL,
    turn_number INTEGER NOT NULL,
    phase VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SOCIAL AND RANKING
-- ============================================

-- Friends
CREATE TABLE IF NOT EXISTS friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id)
);

-- User Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
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

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_skill_rating ON users(skill_rating DESC);

-- Admin indexes
CREATE INDEX IF NOT EXISTS idx_admin_activity_admin ON admin_activity_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_timestamp ON admin_activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_admin_roles_user ON user_admin_roles(user_id);

-- Game indexes
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_game ON game_moves(game_id);

-- Map indexes
CREATE INDEX IF NOT EXISTS idx_maps_creator ON maps(creator_id);
CREATE INDEX IF NOT EXISTS idx_maps_official ON maps(is_official);
CREATE INDEX IF NOT EXISTS idx_map_territories_map ON map_territories(map_id);

-- Notification indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

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

-- Insert default feature flags (created_by is NULL for system flags)
INSERT INTO feature_flags (flag_name, description, is_enabled) VALUES 
('map_approval_required', 'Require admin approval for new maps', FALSE),
('user_registration_open', 'Allow new user registration', TRUE),
('maintenance_mode', 'System maintenance mode', FALSE),
('advanced_map_editor', 'Enable advanced map editor features', TRUE),
('game_spectating', 'Allow spectating games', TRUE)
ON CONFLICT (flag_name) DO NOTHING;

-- ============================================
-- MIGRATION TRACKING
-- ============================================

-- Track which migrations have been applied
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('001_complete_schema')
ON CONFLICT (version) DO NOTHING;