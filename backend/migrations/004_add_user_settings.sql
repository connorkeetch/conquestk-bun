-- Migration 004: Add persistent user settings

-- Create user_settings table for settings that should sync across devices
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Theme preference (should sync across devices)
    theme VARCHAR(10) DEFAULT 'dark',
    
    -- Game preferences (should sync across devices)
    preferred_color VARCHAR(20) DEFAULT 'bright-red',
    
    -- Privacy settings (should sync across devices)
    show_online_status BOOLEAN DEFAULT true,
    direct_messages VARCHAR(10) DEFAULT 'friends', -- 'everyone'|'friends'|'nobody'
    
    -- Notification preferences (server needs to know for emails)
    notifications JSONB DEFAULT '{
        "turnNotifications": {"browser": true, "email": false},
        "turnTimerWarning": {"browser": true, "email": false},
        "gameInvites": {"browser": true, "email": true},
        "gameEnded": {"browser": false, "email": false}
    }'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one settings record per user
    UNIQUE(user_id)
);

-- Create index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_user_settings_updated_at();