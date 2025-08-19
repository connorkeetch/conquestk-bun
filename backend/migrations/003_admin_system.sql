-- Admin System Database Schema
-- Adds admin roles, permissions, and audit logging

-- Admin Roles Table
CREATE TABLE IF NOT EXISTS admin_roles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT NOT NULL DEFAULT '[]', -- JSON array of permission strings
    is_super_admin BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Admin Assignments
CREATE TABLE IF NOT EXISTS user_admin_roles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id),
    UNIQUE(user_id, role_id)
);

-- Admin Activity Logs
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    admin_user_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'user_edit', 'content_moderate', 'game_manage', 'system_admin'
    action_details TEXT NOT NULL, -- JSON object with action specifics
    target_type TEXT, -- 'user', 'map', 'game', 'system'
    target_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES users(id)
);

-- User Account Status (for bans/suspensions)
CREATE TABLE IF NOT EXISTS user_account_status (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'banned', 'pending'
    reason TEXT,
    admin_user_id TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_user_id) REFERENCES users(id)
);

-- User Activity Logs (for monitoring)
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'login', 'logout', 'game_join', 'map_create', 'api_call'
    action_details TEXT, -- JSON object with specifics
    ip_address TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Content Approval Queue
CREATE TABLE IF NOT EXISTS content_approval_queue (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    content_type TEXT NOT NULL, -- 'map', 'review', 'profile'
    content_id TEXT NOT NULL,
    submitter_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    admin_user_id TEXT,
    admin_notes TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    FOREIGN KEY (submitter_id) REFERENCES users(id),
    FOREIGN KEY (admin_user_id) REFERENCES users(id)
);

-- Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    flag_name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_enabled BOOLEAN DEFAULT FALSE,
    config TEXT DEFAULT '{}', -- JSON configuration
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- System Metrics (for admin dashboard)
CREATE TABLE IF NOT EXISTS system_metrics (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_data TEXT, -- JSON for complex metrics
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Game Sessions (enhanced for admin monitoring)
CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    room_id TEXT NOT NULL,
    host_user_id TEXT NOT NULL,
    game_state TEXT, -- JSON game state
    player_count INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 6,
    map_id TEXT,
    game_mode TEXT,
    status TEXT DEFAULT 'waiting', -- 'waiting', 'active', 'finished', 'abandoned'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    finished_at DATETIME,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_user_id) REFERENCES users(id),
    FOREIGN KEY (map_id) REFERENCES maps(id)
);

-- Insert Default Admin Roles
INSERT OR IGNORE INTO admin_roles (name, description, permissions) VALUES 
('super_admin', 'Full system access', '["*"]'),
('content_moderator', 'Manage user content and maps', '["content.*", "users.view", "users.suspend"]'),
('user_moderator', 'Manage user accounts', '["users.*", "logs.view"]'),
('game_moderator', 'Manage games and sessions', '["games.*", "users.view"]'),
('system_viewer', 'View system metrics', '["system.view", "logs.view", "games.view"]');

-- Insert Default Feature Flags
INSERT OR IGNORE INTO feature_flags (flag_name, description, is_enabled, created_by) VALUES 
('map_approval_required', 'Require admin approval for new maps', FALSE, 'system'),
('user_registration_open', 'Allow new user registration', TRUE, 'system'),
('maintenance_mode', 'System maintenance mode', FALSE, 'system'),
('advanced_map_editor', 'Enable advanced map editor features', TRUE, 'system'),
('game_spectating', 'Allow spectating games', TRUE, 'system');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_user ON admin_activity_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_timestamp ON admin_activity_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_timestamp ON user_activity_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_content_approval_queue_status ON content_approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_last_activity ON game_sessions(last_activity);