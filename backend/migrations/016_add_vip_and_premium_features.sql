-- Migration 016: Add VIP and Premium Features
-- Adds VIP flags, premium tiers, and admin status to users and maps

-- Add missing columns to user_admin_roles table
ALTER TABLE user_admin_roles
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Add VIP and premium columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS premium_tier VARCHAR(20) DEFAULT 'free' CHECK (premium_tier IN ('free', 'premium', 'pro', 'enterprise')),
ADD COLUMN IF NOT EXISTS vip_granted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS vip_granted_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS vip_reason TEXT,
ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP;

-- Add VIP-only flag to maps table
ALTER TABLE maps
ADD COLUMN IF NOT EXISTS is_vip_only BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS min_premium_tier VARCHAR(20) DEFAULT NULL CHECK (min_premium_tier IN (NULL, 'free', 'premium', 'pro', 'enterprise'));

-- Create index for VIP users for faster queries
CREATE INDEX IF NOT EXISTS idx_users_is_vip ON users(is_vip) WHERE is_vip = true;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_premium_tier ON users(premium_tier) WHERE premium_tier != 'free';
CREATE INDEX IF NOT EXISTS idx_maps_is_vip_only ON maps(is_vip_only) WHERE is_vip_only = true;

-- Update existing admin users (if you have any)
-- This finds users who already have admin roles and sets their is_admin flag
UPDATE users u
SET is_admin = true
WHERE EXISTS (
    SELECT 1 FROM user_admin_roles uar
    JOIN admin_roles ar ON uar.role_id = ar.id
    WHERE uar.user_id = u.id
    AND ar.name IN ('super_admin', 'admin', 'moderator')
);

-- Add some helpful comments
COMMENT ON COLUMN users.is_vip IS 'VIP status for special users (friends, testers, early access)';
COMMENT ON COLUMN users.is_admin IS 'Quick admin check flag, synced with user_admin_roles';
COMMENT ON COLUMN users.premium_tier IS 'User subscription tier: free, premium, pro, enterprise';
COMMENT ON COLUMN users.vip_granted_at IS 'When VIP status was granted';
COMMENT ON COLUMN users.vip_granted_by IS 'Admin who granted VIP status';
COMMENT ON COLUMN users.vip_reason IS 'Reason for VIP status (friend, tester, contributor, etc.)';
COMMENT ON COLUMN users.premium_expires_at IS 'When premium subscription expires (NULL for lifetime)';
COMMENT ON COLUMN maps.is_vip_only IS 'Map only accessible to VIP users';
COMMENT ON COLUMN maps.min_premium_tier IS 'Minimum premium tier required to access this map';

-- Create a view for easier admin user management
CREATE OR REPLACE VIEW admin_user_overview AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.is_vip,
    u.is_admin,
    u.premium_tier,
    u.vip_reason,
    u.created_at,
    u.last_login,
    u.email_verified,
    COALESCE(uas.status, 'active') as status,
    COALESCE(ps.games_played, 0) as games_played,
    COALESCE(ps.games_won, 0) as games_won,
    COALESCE(u.skill_rating, 1000) as elo_rating,
    COUNT(DISTINCT m.id) as maps_created,
    COUNT(DISTINCT g.id) as active_games
FROM users u
LEFT JOIN user_account_status uas ON u.id = uas.user_id
LEFT JOIN player_stats ps ON u.id = ps.user_id
LEFT JOIN maps m ON u.id = m.creator_id
LEFT JOIN game_players gp ON u.id = gp.user_id
LEFT JOIN games g ON gp.game_id = g.id AND g.status IN ('waiting', 'in_progress')
GROUP BY u.id, u.username, u.email, u.is_vip, u.is_admin, u.premium_tier, 
         u.vip_reason, u.created_at, u.last_login, u.email_verified, u.skill_rating, uas.status,
         ps.games_played, ps.games_won;

-- Function to grant VIP status
CREATE OR REPLACE FUNCTION grant_vip_status(
    target_user_id UUID,
    granting_admin_id UUID,
    reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE users
    SET 
        is_vip = true,
        vip_granted_at = CURRENT_TIMESTAMP,
        vip_granted_by = granting_admin_id,
        vip_reason = reason
    WHERE id = target_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke VIP status
CREATE OR REPLACE FUNCTION revoke_vip_status(
    target_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE users
    SET 
        is_vip = false,
        vip_granted_at = NULL,
        vip_granted_by = NULL,
        vip_reason = NULL
    WHERE id = target_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;