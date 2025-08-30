-- Migration to add missing tables and columns
-- This fixes the production deployment issues

-- ============================================
-- MAP RELATED TABLES (Missing from original migration)
-- ============================================

-- Map Usage Statistics
CREATE TABLE IF NOT EXISTS map_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    download_type VARCHAR(50) DEFAULT 'web',
    ip_address VARCHAR(45),
    user_agent TEXT,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map Favorites
CREATE TABLE IF NOT EXISTS map_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, user_id)
);

-- Map Tags
CREATE TABLE IF NOT EXISTS map_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map Tag Associations
CREATE TABLE IF NOT EXISTS map_tag_associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES map_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, tag_id)
);

-- ============================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- Add missing columns to users table if they don't exist
DO $$ 
BEGIN
    -- Add skill_rating if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='skill_rating') THEN
        ALTER TABLE users ADD COLUMN skill_rating INTEGER DEFAULT 1200;
    END IF;
    
    -- Add email_verified if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='email_verified') THEN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add email_verification_token if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='email_verification_token') THEN
        ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255);
    END IF;
    
    -- Add email_verification_expires if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='email_verification_expires') THEN
        ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMP;
    END IF;
    
    -- Add password_reset_token if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='password_reset_token') THEN
        ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255);
    END IF;
    
    -- Add password_reset_expires if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='password_reset_expires') THEN
        ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMP;
    END IF;
    
    -- Add skill_deviation if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='skill_deviation') THEN
        ALTER TABLE users ADD COLUMN skill_deviation INTEGER DEFAULT 350;
    END IF;
    
    -- Add games_played if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='games_played') THEN
        ALTER TABLE users ADD COLUMN games_played INTEGER DEFAULT 0;
    END IF;
    
    -- Add games_won if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='games_won') THEN
        ALTER TABLE users ADD COLUMN games_won INTEGER DEFAULT 0;
    END IF;
    
    -- Add peak_rating if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='peak_rating') THEN
        ALTER TABLE users ADD COLUMN peak_rating INTEGER DEFAULT 1200;
    END IF;
    
    -- Add current_tier if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='current_tier') THEN
        ALTER TABLE users ADD COLUMN current_tier VARCHAR(50) DEFAULT 'bronze';
    END IF;
    
    -- Add last_ranked_game_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='last_ranked_game_at') THEN
        ALTER TABLE users ADD COLUMN last_ranked_game_at TIMESTAMP;
    END IF;
    
    -- Add soft delete columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='deleted_at') THEN
        ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='deleted_by') THEN
        ALTER TABLE users ADD COLUMN deleted_by UUID REFERENCES users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='deletion_reason') THEN
        ALTER TABLE users ADD COLUMN deletion_reason TEXT;
    END IF;
END $$;

-- Add missing columns to maps table if they don't exist
DO $$ 
BEGIN
    -- Add download_count if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='maps' AND column_name='download_count') THEN
        ALTER TABLE maps ADD COLUMN download_count INTEGER DEFAULT 0;
    END IF;
    
    -- Add play_count if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='maps' AND column_name='play_count') THEN
        ALTER TABLE maps ADD COLUMN play_count INTEGER DEFAULT 0;
    END IF;
    
    -- Add rating_average if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='maps' AND column_name='rating_average') THEN
        ALTER TABLE maps ADD COLUMN rating_average DECIMAL(3,2) DEFAULT 0;
    END IF;
    
    -- Add rating_count if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='maps' AND column_name='rating_count') THEN
        ALTER TABLE maps ADD COLUMN rating_count INTEGER DEFAULT 0;
    END IF;
    
    -- Add featured if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='maps' AND column_name='featured') THEN
        ALTER TABLE maps ADD COLUMN featured BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add featured_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='maps' AND column_name='featured_at') THEN
        ALTER TABLE maps ADD COLUMN featured_at TIMESTAMP;
    END IF;
END $$;

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Indexes for map_usage_stats
CREATE INDEX IF NOT EXISTS idx_map_usage_stats_map_id ON map_usage_stats(map_id);
CREATE INDEX IF NOT EXISTS idx_map_usage_stats_popularity ON map_usage_stats(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_map_usage_stats_last_played ON map_usage_stats(last_played_at DESC);

-- Indexes for map_ratings
CREATE INDEX IF NOT EXISTS idx_map_ratings_map_id ON map_ratings(map_id);
CREATE INDEX IF NOT EXISTS idx_map_ratings_user_id ON map_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_map_ratings_rating ON map_ratings(rating);

-- Indexes for map_comments
CREATE INDEX IF NOT EXISTS idx_map_comments_map_id ON map_comments(map_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_user_id ON map_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_parent ON map_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_created ON map_comments(created_at DESC);

-- Indexes for map_downloads
CREATE INDEX IF NOT EXISTS idx_map_downloads_map_id ON map_downloads(map_id);
CREATE INDEX IF NOT EXISTS idx_map_downloads_user_id ON map_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_map_downloads_date ON map_downloads(downloaded_at DESC);

-- Indexes for map_favorites
CREATE INDEX IF NOT EXISTS idx_map_favorites_map_id ON map_favorites(map_id);
CREATE INDEX IF NOT EXISTS idx_map_favorites_user_id ON map_favorites(user_id);

-- Indexes for map_tag_associations
CREATE INDEX IF NOT EXISTS idx_map_tag_associations_map_id ON map_tag_associations(map_id);
CREATE INDEX IF NOT EXISTS idx_map_tag_associations_tag_id ON map_tag_associations(tag_id);

-- Indexes for users table (skill rating)
CREATE INDEX IF NOT EXISTS idx_users_skill_rating ON users(skill_rating DESC);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

-- Indexes for maps table
CREATE INDEX IF NOT EXISTS idx_maps_featured ON maps(featured, featured_at DESC);
CREATE INDEX IF NOT EXISTS idx_maps_rating ON maps(rating_average DESC);
CREATE INDEX IF NOT EXISTS idx_maps_play_count ON maps(play_count DESC);

-- ============================================
-- UPDATE TRIGGERS FOR UPDATED_AT
-- ============================================

-- Create or replace trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for new tables
DROP TRIGGER IF EXISTS update_map_usage_stats_updated_at ON map_usage_stats;
CREATE TRIGGER update_map_usage_stats_updated_at BEFORE UPDATE ON map_usage_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_map_ratings_updated_at ON map_ratings;
CREATE TRIGGER update_map_ratings_updated_at BEFORE UPDATE ON map_ratings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_map_comments_updated_at ON map_comments;
CREATE TRIGGER update_map_comments_updated_at BEFORE UPDATE ON map_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INSERT DEFAULT DATA
-- ============================================

-- Insert some default map tags
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

-- Log migration completion (handle different schema_migrations table structures)
DO $$
DECLARE
    col_count INTEGER;
BEGIN
    -- Check if schema_migrations table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations') THEN
        -- Count columns to determine which version we have
        SELECT COUNT(*) INTO col_count
        FROM information_schema.columns
        WHERE table_name = 'schema_migrations';
        
        IF col_count >= 3 THEN
            -- Newer version with description and executed_at
            INSERT INTO schema_migrations (version, description, executed_at)
            VALUES ('002', 'Add missing map-related tables and user columns', CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING;
        ELSIF col_count = 2 THEN
            -- Check which columns exist
            IF EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'schema_migrations' AND column_name = 'applied_at') THEN
                -- Version with applied_at
                INSERT INTO schema_migrations (version, applied_at)
                VALUES ('002', CURRENT_TIMESTAMP)
                ON CONFLICT DO NOTHING;
            ELSE
                -- Try just version
                INSERT INTO schema_migrations (version)
                VALUES ('002')
                ON CONFLICT DO NOTHING;
            END IF;
        ELSE
            -- Minimal version - just version column
            INSERT INTO schema_migrations (version)
            VALUES ('002')
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    
    -- If we get here, migration was successful
    RAISE NOTICE 'Migration 002 completed successfully';
END $$;