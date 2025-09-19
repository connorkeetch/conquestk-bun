-- Migration: Consolidate user tables and add missing preference columns
-- Author: System
-- Date: 2025-01-12
-- Purpose: Fix fragmented user data across multiple tables and add missing columns

-- ============================================
-- STEP 1: Add missing columns to user_preferences
-- ============================================

-- Audio preferences (currently missing, causing errors)
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'default',
ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS music_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS master_volume INTEGER DEFAULT 75,
ADD COLUMN IF NOT EXISTS sfx_volume INTEGER DEFAULT 80,
ADD COLUMN IF NOT EXISTS music_volume INTEGER DEFAULT 50;

-- Game preferences (missing, needed by frontend)
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS preferred_color VARCHAR(20) DEFAULT '#DC2626',
ADD COLUMN IF NOT EXISTS auto_ready BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS show_timer BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS show_army_numbers BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS animation_speed VARCHAR(20) DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';

-- Notification preferences (reorganize existing columns)
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS turn_notifications_browser BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS turn_notifications_email BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS turn_timer_warning_browser BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS turn_timer_warning_email BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS game_invites_browser BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS game_invites_email BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS game_ended_browser BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS game_ended_email BOOLEAN DEFAULT false;

-- Privacy preferences (rename/add missing)
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS show_online_status BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS direct_messages VARCHAR(20) DEFAULT 'friends';

-- Rename existing columns to match new naming convention if they exist
DO $$ 
BEGIN
    -- Rename chat_privacy to direct_messages if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_preferences' 
               AND column_name = 'chat_privacy') THEN
        -- Migrate data from old column to new column
        UPDATE user_preferences 
        SET direct_messages = COALESCE(chat_privacy, 'friends')
        WHERE direct_messages IS NULL;
        
        -- Drop old column
        ALTER TABLE user_preferences DROP COLUMN chat_privacy;
    END IF;
    
    -- Rename dm_privacy to direct_messages if it exists  
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_preferences' 
               AND column_name = 'dm_privacy') THEN
        UPDATE user_preferences 
        SET direct_messages = COALESCE(dm_privacy, 'friends')
        WHERE direct_messages IS NULL;
        
        ALTER TABLE user_preferences DROP COLUMN dm_privacy;
    END IF;
END $$;

-- ============================================
-- STEP 2: Migrate data from user_settings if it exists
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'user_settings') THEN
        
        -- Migrate theme data
        UPDATE user_preferences up
        SET 
            theme = COALESCE(
                (SELECT COALESCE(
                    (preferences->>'theme')::VARCHAR,
                    theme
                ) FROM user_settings WHERE user_id = up.user_id),
                up.theme
            ),
            -- Migrate notification settings from JSONB
            notification_enabled = COALESCE(
                (SELECT (notifications->>'enabled')::BOOLEAN 
                 FROM user_settings WHERE user_id = up.user_id),
                up.notification_enabled
            ),
            -- Migrate privacy settings from JSONB
            show_online_status = COALESCE(
                (SELECT (privacy->>'showOnlineStatus')::BOOLEAN 
                 FROM user_settings WHERE user_id = up.user_id),
                up.show_online_status
            ),
            direct_messages = COALESCE(
                (SELECT (privacy->>'directMessages')::VARCHAR 
                 FROM user_settings WHERE user_id = up.user_id),
                up.direct_messages
            ),
            -- Migrate game preferences from JSONB
            preferred_color = COALESCE(
                (SELECT (preferences->>'preferredColor')::VARCHAR 
                 FROM user_settings WHERE user_id = up.user_id),
                up.preferred_color
            )
        WHERE EXISTS (SELECT 1 FROM user_settings WHERE user_id = up.user_id);
        
    END IF;
END $$;

-- ============================================
-- STEP 3: Add terms acceptance to users table
-- ============================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20),
ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(20),
ADD COLUMN IF NOT EXISTS cookie_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cookie_consent_at TIMESTAMP;

-- Migrate terms acceptance data if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'user_terms_acceptance') THEN
        
        UPDATE users u
        SET 
            terms_accepted_at = (
                SELECT MAX(accepted_at) 
                FROM user_terms_acceptance 
                WHERE user_id = u.id AND (feature_type = 'terms' OR feature_type IS NULL)
            ),
            terms_version = (
                SELECT terms_version 
                FROM user_terms_acceptance 
                WHERE user_id = u.id AND (feature_type = 'terms' OR feature_type IS NULL)
                ORDER BY accepted_at DESC LIMIT 1
            ),
            privacy_accepted_at = (
                SELECT MAX(accepted_at) 
                FROM user_terms_acceptance 
                WHERE user_id = u.id AND feature_type = 'privacy'
            ),
            privacy_version = (
                SELECT terms_version 
                FROM user_terms_acceptance 
                WHERE user_id = u.id AND feature_type = 'privacy'
                ORDER BY accepted_at DESC LIMIT 1
            )
        WHERE EXISTS (SELECT 1 FROM user_terms_acceptance WHERE user_id = u.id);
        
    END IF;
END $$;

-- ============================================
-- STEP 4: Ensure all users have preference records
-- ============================================

-- Create default preferences for users who don't have them
INSERT INTO user_preferences (user_id, theme, created_at, updated_at)
SELECT 
    u.id,
    'dark',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM user_preferences up WHERE up.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- STEP 5: Clean up unused columns from user_preferences
-- ============================================

-- Drop columns that are not being used in the codebase
ALTER TABLE user_preferences
DROP COLUMN IF EXISTS profanity_filter,
DROP COLUMN IF EXISTS auto_decline_invites;

-- ============================================
-- STEP 6: Add useful indexes
-- ============================================

-- Index for faster user preference lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
ON user_preferences(user_id);

-- Index for users with terms acceptance
CREATE INDEX IF NOT EXISTS idx_users_terms_accepted 
ON users(terms_accepted_at) 
WHERE terms_accepted_at IS NOT NULL;

-- ============================================
-- STEP 7: Drop redundant tables (CAUTION: Only after confirming data migration)
-- ============================================

-- These drops are commented out for safety. Uncomment after verifying data migration.
-- You can run these manually after confirming all data has been migrated:

-- DROP TABLE IF EXISTS user_settings CASCADE;
-- DROP TABLE IF EXISTS user_profiles CASCADE;
-- DROP TABLE IF EXISTS user_terms_acceptance CASCADE;

-- ============================================
-- VERIFICATION QUERIES (Run these to confirm migration success)
-- ============================================

-- Check that all users have preferences:
-- SELECT COUNT(*) as users_without_prefs 
-- FROM users u 
-- WHERE NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = u.id);

-- Check migrated columns have data:
-- SELECT 
--     COUNT(*) as total_users,
--     COUNT(sound_enabled) as has_sound_pref,
--     COUNT(theme) as has_theme,
--     COUNT(preferred_color) as has_color_pref
-- FROM user_preferences;

-- ============================================
-- ROLLBACK INSTRUCTIONS (If needed)
-- ============================================

-- To rollback this migration:
-- 1. Restore user_settings, user_profiles, user_terms_acceptance from backup
-- 2. Drop the new columns from user_preferences
-- 3. Drop the new columns from users table
-- 4. Restore original column names (chat_privacy, etc)
