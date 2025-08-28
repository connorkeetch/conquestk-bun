-- Add is_admin field to users table and set initial admin
-- This migration adds a simple admin flag for easier checking

-- Add is_admin column to users table
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN admin_level INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN admin_since DATETIME;

-- Set connorkeetch@gmail.com as the first super admin
UPDATE users 
SET is_admin = TRUE, 
    admin_level = 3,
    admin_since = CURRENT_TIMESTAMP
WHERE email = 'connorkeetch@gmail.com';

-- Also assign super_admin role through the roles system
INSERT INTO user_admin_roles (user_id, role_id, assigned_by, is_active)
SELECT 
    u.id,
    r.id,
    u.id,
    TRUE
FROM users u
CROSS JOIN admin_roles r
WHERE u.email = 'connorkeetch@gmail.com' 
AND r.name = 'super_admin'
AND NOT EXISTS (
    SELECT 1 FROM user_admin_roles uar 
    WHERE uar.user_id = u.id 
    AND uar.role_id = r.id
);

-- Create admin_logs table for simple action logging
CREATE TABLE IF NOT EXISTS admin_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    admin_id TEXT NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id TEXT,
    details TEXT,
    ip_address VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- Create banned_users table for managing bans
CREATE TABLE IF NOT EXISTS banned_users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL UNIQUE,
    banned_by TEXT NOT NULL,
    reason TEXT,
    banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (banned_by) REFERENCES users(id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action_type ON admin_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_banned_users_user_id ON banned_users(user_id);
CREATE INDEX IF NOT EXISTS idx_banned_users_is_active ON banned_users(is_active);