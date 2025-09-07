-- Emergency fix for staging: Recreate missing tables without foreign key constraints
-- This will only create tables that don't exist, avoiding conflicts

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create base tables first (no foreign keys)
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
    is_admin BOOLEAN DEFAULT FALSE,
    admin_since TIMESTAMP,
    terms_accepted_at TIMESTAMP,
    privacy_accepted_at TIMESTAMP,
    skill_rating INTEGER DEFAULT 1200,
    skill_deviation INTEGER DEFAULT 350,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    peak_rating INTEGER DEFAULT 1200,
    current_tier VARCHAR(50) DEFAULT 'bronze',
    last_ranked_game_at TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by UUID,
    deletion_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_id UUID,
    image_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    is_official BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    play_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2),
    max_players INTEGER DEFAULT 6,
    min_players INTEGER DEFAULT 2,
    default_armies_per_territory INTEGER DEFAULT 1,
    submission_status VARCHAR(50) DEFAULT 'draft',
    submitted_at TIMESTAMP,
    approved_by UUID,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    download_count INTEGER DEFAULT 0,
    rating_average DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    featured_at TIMESTAMP,
    tags JSONB DEFAULT '[]',
    statistics JSONB DEFAULT '{}',
    rules_config JSONB DEFAULT '{}',
    visual_config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_by UUID NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    host_id UUID NOT NULL,
    status VARCHAR(50) DEFAULT 'waiting',
    max_players INTEGER DEFAULT 6,
    password VARCHAR(255),
    is_private BOOLEAN DEFAULT FALSE,
    map_id UUID,
    game_mode VARCHAR(50) DEFAULT 'classic',
    time_limit INTEGER,
    turn_timer INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL,
    turn_number INTEGER NOT NULL,
    current_player_id UUID,
    phase VARCHAR(50) NOT NULL,
    state_data JSONB NOT NULL,
    territories JSONB NOT NULL,
    cards JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, turn_number)
);

CREATE TABLE IF NOT EXISTS room_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL,
    user_id UUID NOT NULL,
    color VARCHAR(50),
    is_ready BOOLEAN DEFAULT FALSE,
    slot_number INTEGER,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    UNIQUE(room_id, user_id),
    UNIQUE(room_id, slot_number)
);

CREATE TABLE IF NOT EXISTS game_moves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL,
    player_id UUID NOT NULL,
    turn_number INTEGER NOT NULL,
    move_type VARCHAR(50) NOT NULL,
    move_data JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER,
    validation_errors JSONB
);

CREATE TABLE IF NOT EXISTS map_territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    polygon JSONB NOT NULL,
    center_x FLOAT NOT NULL,
    center_y FLOAT NOT NULL,
    continent VARCHAR(255),
    bonus_armies INTEGER DEFAULT 0,
    is_capital BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add remaining tables as needed...
-- Foreign key constraints will be added separately after all tables exist