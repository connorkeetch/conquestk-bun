-- Map Approval and Versioning System
-- This migration adds comprehensive version control and approval workflows for custom maps

-- Map Status and Approval Workflow
CREATE TABLE IF NOT EXISTS map_status (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    workflow_order INTEGER NOT NULL, -- 1=draft, 2=submitted, 3=under_review, 4=approved, 5=published, 6=rejected, 7=archived
    color TEXT DEFAULT '#gray-400',
    is_public_visible BOOLEAN DEFAULT FALSE, -- Can regular users see maps with this status?
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default map statuses
INSERT OR IGNORE INTO map_status (name, description, workflow_order, color, is_public_visible) VALUES 
('draft', 'Work in progress, not yet submitted for review', 1, '#gray-400', FALSE),
('submitted', 'Submitted for moderator review', 2, '#blue-400', FALSE),
('under_review', 'Being reviewed by moderators', 3, '#yellow-400', FALSE),
('approved', 'Approved and ready for publication', 4, '#green-400', FALSE),
('published', 'Live and available to all users', 5, '#green-600', TRUE),
('rejected', 'Rejected with feedback, needs changes', 6, '#red-400', FALSE),
('archived', 'No longer available for new games', 7, '#gray-600', FALSE);

-- Map Versions - Full version control system
CREATE TABLE IF NOT EXISTS map_versions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    map_id TEXT NOT NULL,
    version_number TEXT NOT NULL, -- Semantic versioning: 1.0.0, 1.1.0, etc.
    version_major INTEGER NOT NULL DEFAULT 1,
    version_minor INTEGER NOT NULL DEFAULT 0,
    version_patch INTEGER NOT NULL DEFAULT 0,
    is_current BOOLEAN DEFAULT FALSE, -- Only one current version per map
    status_id TEXT NOT NULL,
    
    -- Snapshot of map data at this version
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    image_width INTEGER DEFAULT 600,
    image_height INTEGER DEFAULT 450,
    tags TEXT, -- JSON array
    
    -- Version metadata
    changelog TEXT, -- What changed in this version
    created_by TEXT NOT NULL, -- User who created this version
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME, -- When this version was published (if ever)
    
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (status_id) REFERENCES map_status(id),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(map_id, version_number),
    CHECK (version_major >= 0 AND version_minor >= 0 AND version_patch >= 0)
);

-- Map Approval Requests
CREATE TABLE IF NOT EXISTS map_approval_requests (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    version_id TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    assigned_moderator_id TEXT, -- Which admin is reviewing this
    
    -- Request details
    submission_notes TEXT, -- Creator's notes for reviewers
    priority_level TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    estimated_review_time INTEGER, -- Hours estimated for review
    
    -- Review process
    review_started_at DATETIME,
    review_completed_at DATETIME,
    decision TEXT, -- 'approved', 'rejected', 'needs_changes'
    moderator_feedback TEXT,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (version_id) REFERENCES map_versions(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_moderator_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Map Review Checklist - Standardized review criteria
CREATE TABLE IF NOT EXISTS map_review_criteria (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- 'technical', 'gameplay', 'content', 'visual'
    is_required BOOLEAN DEFAULT TRUE, -- Must pass to be approved
    weight INTEGER DEFAULT 1, -- Importance weight for scoring
    check_order INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default review criteria
INSERT OR IGNORE INTO map_review_criteria (name, description, category, is_required, weight, check_order) VALUES 
-- Technical Criteria
('valid_territories', 'All territories have valid coordinates and adjacencies', 'technical', TRUE, 10, 1),
('continent_balance', 'Continent bonuses are reasonable and balanced', 'technical', TRUE, 8, 2),
('connectivity_check', 'Map is fully connected with no isolated territories', 'technical', TRUE, 10, 3),
('territory_count', 'Reasonable number of territories (15-100)', 'technical', TRUE, 7, 4),

-- Gameplay Criteria  
('strategic_depth', 'Map offers meaningful strategic choices', 'gameplay', TRUE, 9, 5),
('balance_assessment', 'No starting positions have overwhelming advantages', 'gameplay', TRUE, 9, 6),
('game_flow', 'Territory distribution supports good game flow', 'gameplay', FALSE, 6, 7),
('special_abilities', 'Territory abilities are balanced and fun', 'gameplay', FALSE, 5, 8),

-- Content Criteria
('appropriate_content', 'No offensive, inappropriate, or copyrighted content', 'content', TRUE, 10, 9),
('clear_naming', 'Territory and continent names are clear and appropriate', 'content', TRUE, 6, 10),
('theme_consistency', 'Map theme is consistent throughout', 'content', FALSE, 4, 11),

-- Visual Criteria
('image_quality', 'Background image is clear and high quality', 'visual', FALSE, 5, 12),
('territory_visibility', 'Territory boundaries are clearly visible', 'visual', TRUE, 7, 13),
('army_positions', 'Army positions are well-placed and readable', 'visual', TRUE, 6, 14);

-- Map Review Results - Track individual criteria checks
CREATE TABLE IF NOT EXISTS map_review_results (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    approval_request_id TEXT NOT NULL,
    criteria_id TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pass', 'fail', 'warning', 'not_applicable'
    reviewer_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (approval_request_id) REFERENCES map_approval_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (criteria_id) REFERENCES map_review_criteria(id) ON DELETE CASCADE,
    UNIQUE(approval_request_id, criteria_id)
);

-- Map Moderation Actions - Audit trail of all moderation actions
CREATE TABLE IF NOT EXISTS map_moderation_actions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    map_id TEXT NOT NULL,
    version_id TEXT, -- NULL for map-wide actions
    moderator_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'approve', 'reject', 'archive', 'feature', 'unfeature', 'flag', 'unflag'
    reason TEXT,
    details TEXT, -- JSON with action-specific details
    previous_status TEXT, -- What status was changed from
    new_status TEXT, -- What status was changed to
    is_automated BOOLEAN DEFAULT FALSE, -- Was this an automated action?
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (version_id) REFERENCES map_versions(id) ON DELETE CASCADE,
    FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User Map Permissions - Fine-grained permissions for collaborative editing
CREATE TABLE IF NOT EXISTS map_permissions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    map_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    permission_type TEXT NOT NULL, -- 'owner', 'editor', 'viewer', 'collaborator'
    granted_by TEXT NOT NULL, -- Who granted this permission
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME, -- NULL for permanent permissions
    
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(map_id, user_id)
);

-- Map Usage Analytics - Track how maps are used
CREATE TABLE IF NOT EXISTS map_usage_stats (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    map_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    
    -- Usage metrics
    games_started INTEGER DEFAULT 0,
    games_completed INTEGER DEFAULT 0,
    total_play_time_minutes INTEGER DEFAULT 0,
    average_game_duration_minutes INTEGER DEFAULT 0,
    player_count_distribution TEXT, -- JSON: {"2": 15, "3": 8, "4": 22}
    
    -- Quality metrics
    early_quit_rate DECIMAL(5,4) DEFAULT 0, -- % of games ending in first 30min
    completion_rate DECIMAL(5,4) DEFAULT 0, -- % of games played to finish
    replay_rate DECIMAL(5,4) DEFAULT 0, -- % of players who play again
    
    -- Time period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (version_id) REFERENCES map_versions(id) ON DELETE CASCADE,
    UNIQUE(map_id, version_id, period_start)
);

-- Map Comments and Feedback
CREATE TABLE IF NOT EXISTS map_comments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    map_id TEXT NOT NULL,
    version_id TEXT, -- NULL for general map comments
    user_id TEXT NOT NULL,
    parent_comment_id TEXT, -- For threaded discussions
    
    comment_text TEXT NOT NULL,
    comment_type TEXT DEFAULT 'general', -- 'general', 'bug_report', 'suggestion', 'praise'
    is_public BOOLEAN DEFAULT TRUE,
    is_moderator_note BOOLEAN DEFAULT FALSE,
    
    -- Moderation
    is_hidden BOOLEAN DEFAULT FALSE,
    hidden_by TEXT, -- Moderator who hid the comment
    hidden_reason TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (version_id) REFERENCES map_versions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES map_comments(id) ON DELETE CASCADE,
    FOREIGN KEY (hidden_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Update main maps table to reference current version and status
ALTER TABLE maps ADD COLUMN IF NOT EXISTS current_version_id TEXT 
    REFERENCES map_versions(id) ON DELETE SET NULL;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS status_id TEXT 
    REFERENCES map_status(id) DEFAULT (SELECT id FROM map_status WHERE name = 'draft');

-- Add useful indexes for performance
CREATE INDEX IF NOT EXISTS idx_map_versions_map_id ON map_versions(map_id);
CREATE INDEX IF NOT EXISTS idx_map_versions_status ON map_versions(status_id);
CREATE INDEX IF NOT EXISTS idx_map_versions_current ON map_versions(map_id, is_current);
CREATE INDEX IF NOT EXISTS idx_map_approval_requests_version ON map_approval_requests(version_id);
CREATE INDEX IF NOT EXISTS idx_map_approval_requests_moderator ON map_approval_requests(assigned_moderator_id);
CREATE INDEX IF NOT EXISTS idx_map_approval_requests_status ON map_approval_requests(decision);
CREATE INDEX IF NOT EXISTS idx_map_moderation_actions_map ON map_moderation_actions(map_id);
CREATE INDEX IF NOT EXISTS idx_map_moderation_actions_moderator ON map_moderation_actions(moderator_id);
CREATE INDEX IF NOT EXISTS idx_map_permissions_map_user ON map_permissions(map_id, user_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_map_id ON map_comments(map_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_version ON map_comments(version_id);
CREATE INDEX IF NOT EXISTS idx_map_comments_parent ON map_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_map_usage_stats_map_period ON map_usage_stats(map_id, period_start);

-- Create triggers to maintain data consistency
CREATE TRIGGER IF NOT EXISTS update_map_current_version 
    AFTER UPDATE OF is_current ON map_versions
    WHEN NEW.is_current = 1
BEGIN
    -- Ensure only one current version per map
    UPDATE map_versions SET is_current = 0 
    WHERE map_id = NEW.map_id AND id != NEW.id;
    
    -- Update maps table to reference current version
    UPDATE maps SET current_version_id = NEW.id 
    WHERE id = NEW.map_id;
END;

CREATE TRIGGER IF NOT EXISTS update_map_status_from_version
    AFTER UPDATE OF status_id ON map_versions
    WHEN NEW.is_current = 1
BEGIN
    -- Update map status to match current version status
    UPDATE maps SET status_id = NEW.status_id 
    WHERE id = NEW.map_id;
END;

CREATE TRIGGER IF NOT EXISTS update_timestamps_approval_requests
    AFTER UPDATE ON map_approval_requests
BEGIN
    UPDATE map_approval_requests SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_timestamps_map_comments
    AFTER UPDATE ON map_comments
BEGIN
    UPDATE map_comments SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;