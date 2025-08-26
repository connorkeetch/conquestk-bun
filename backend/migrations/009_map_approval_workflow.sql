-- Migration: Map Approval Workflow System
-- Adds comprehensive map management with drafts, reviews, and version history

-- Add status and review fields to maps table
ALTER TABLE maps ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE maps ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id);
ALTER TABLE maps ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS rating_average DECIMAL(3, 2);
ALTER TABLE maps ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS parent_map_id INTEGER REFERENCES maps(id);

-- Map drafts table for auto-saving work in progress
CREATE TABLE IF NOT EXISTS map_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    data JSON NOT NULL,
    territories JSON,
    continents JSON,
    adjacencies JSON,
    thumbnail_url VARCHAR(500),
    auto_saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map version history for tracking changes
CREATE TABLE IF NOT EXISTS map_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    data JSON NOT NULL,
    territories JSON,
    continents JSON,
    adjacencies JSON,
    change_summary TEXT,
    changed_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, version_number)
);

-- Map review queue for admin notifications
CREATE TABLE IF NOT EXISTS map_review_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    submitted_by INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    assigned_to INTEGER REFERENCES users(id),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    UNIQUE(map_id)
);

-- Map ratings from players
CREATE TABLE IF NOT EXISTS map_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_id, user_id)
);

-- Admin notifications table
CREATE TABLE IF NOT EXISTS admin_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    data JSON,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);

-- Map submission logs for audit trail
CREATE TABLE IF NOT EXISTS map_submission_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    performed_by INTEGER REFERENCES users(id),
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_maps_status ON maps(status);
CREATE INDEX IF NOT EXISTS idx_maps_creator_status ON maps(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_map_drafts_user ON map_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_map_review_queue_status ON map_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(admin_id, is_read);
CREATE INDEX IF NOT EXISTS idx_map_versions_map ON map_versions(map_id, version_number);

-- Update existing maps to have 'approved' status if they exist
UPDATE maps SET status = 'approved' WHERE status IS NULL OR status = '';

-- Insert default notification for admins about the new system
INSERT INTO admin_notifications (type, title, message, data) 
VALUES (
    'system_update',
    'Map Approval System Activated',
    'The new map approval workflow is now active. All new maps will require admin approval before becoming publicly playable.',
    json_object('feature', 'map_approval_workflow', 'version', '1.0.0')
);