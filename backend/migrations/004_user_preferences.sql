-- Migration: Add user preferences table for theme persistence and other settings
-- Author: System
-- Date: 2025-01-10
-- Updated: 2025-09-12 - Force redeployment to run migration on production

-- Ensure required extensions exist before using UUID defaults
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user_preferences table if it doesn't exist (uses UUIDs to match live schema)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_preferences' AND table_schema = 'public'
    ) THEN
        CREATE TABLE user_preferences (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            theme VARCHAR(50) DEFAULT 'default',
            sound_enabled BOOLEAN DEFAULT true,
            music_enabled BOOLEAN DEFAULT true,
            notification_enabled BOOLEAN DEFAULT true,
            auto_ready BOOLEAN DEFAULT false,
            show_timer BOOLEAN DEFAULT true,
            show_army_numbers BOOLEAN DEFAULT true,
            animation_speed VARCHAR(20) DEFAULT 'normal',
            language VARCHAR(10) DEFAULT 'en',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    END IF;
END $$;

-- Align existing table structure with latest expectations
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4(),
    ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE,
    ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS music_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS auto_ready BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS show_timer BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_army_numbers BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS animation_speed VARCHAR(20) DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Backfill UUID primary key if the column was added to a legacy table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_preferences' AND column_name = 'id'
    ) THEN
        UPDATE user_preferences
        SET id = uuid_generate_v4()
        WHERE id IS NULL;

        ALTER TABLE user_preferences
            ALTER COLUMN id SET NOT NULL,
            ALTER COLUMN id SET DEFAULT uuid_generate_v4();
    END IF;
END $$;

-- Ensure user_id column has the correct type and constraints
ALTER TABLE user_preferences
    ALTER COLUMN user_id SET NOT NULL;

-- Recreate unique constraint on user_id if it was lost
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_preferences_user_id_key'
    ) THEN
        ALTER TABLE user_preferences
            ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_preferences_updated_at ON user_preferences;
CREATE TRIGGER user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_preferences_updated_at();

-- Insert default preferences for existing users
INSERT INTO user_preferences (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM user_preferences)
ON CONFLICT (user_id) DO NOTHING;
