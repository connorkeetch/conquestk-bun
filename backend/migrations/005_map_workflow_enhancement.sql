-- Migration 005: Enhanced Map Editor Workflow
-- Adds staging areas, quotas, terms acceptance, and admin review workflow

-- ============================================
-- TERMS & CONDITIONS ACCEPTANCE
-- ============================================

-- Track user acceptance of terms for different features
CREATE TABLE IF NOT EXISTS user_terms_acceptance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_type VARCHAR(50) NOT NULL,
    terms_version VARCHAR(20) NOT NULL,
    accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    UNIQUE(user_id, feature_type, terms_version)
);

CREATE INDEX idx_user_terms_user_feature ON user_terms_acceptance(user_id, feature_type);

-- ============================================
-- MAP IMAGE STAGING AREA
-- ============================================

-- Staging area for uploaded map images
CREATE TABLE IF NOT EXISTS map_images_staging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500),
    file_url VARCHAR(1000) NOT NULL,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    mime_type VARCHAR(100),
    upload_status VARCHAR(50) DEFAULT 'pending',
    processing_error TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_map_images_user ON map_images_staging(user_id);
CREATE INDEX idx_map_images_status ON map_images_staging(upload_status);
CREATE INDEX idx_map_images_created ON map_images_staging(created_at DESC);

-- ============================================
-- ENHANCED MAP DRAFTS
-- ============================================

-- Enhanced map_drafts table
CREATE TABLE IF NOT EXISTS map_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    staging_image_id UUID REFERENCES map_images_staging(id) ON DELETE SET NULL,
    parent_map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
    name VARCHAR(255),
    description TEXT,
    map_data JSONB DEFAULT '{}',
    territories JSONB DEFAULT '[]',
    continents JSONB DEFAULT '[]', 
    adjacencies JSONB DEFAULT '[]',
    capital_assignments JSONB DEFAULT '{}',
    image_url VARCHAR(1000),
    thumbnail_url VARCHAR(500),
    image_width INTEGER,
    image_height INTEGER,
    draft_status VARCHAR(50) DEFAULT 'editing',
    validation_status VARCHAR(50),
    validation_errors JSONB DEFAULT '[]',
    is_public BOOLEAN DEFAULT FALSE,
    tags JSONB DEFAULT '[]',
    auto_saved_at TIMESTAMP,
    last_edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_map_drafts_user ON map_drafts(user_id);
CREATE INDEX idx_map_drafts_status ON map_drafts(draft_status);
CREATE INDEX idx_map_drafts_updated ON map_drafts(updated_at DESC);

-- ============================================
-- MAP SUBMISSIONS QUEUE
-- ============================================

-- Maps submitted for review
CREATE TABLE IF NOT EXISTS map_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draft_id UUID REFERENCES map_drafts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_data JSONB NOT NULL,
    review_status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    assigned_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    review_started_at TIMESTAMP,
    review_completed_at TIMESTAMP,
    review_notes TEXT,
    rejection_reason TEXT,
    approval_notes TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submission_ip VARCHAR(45),
    submission_version INTEGER DEFAULT 1,
    previous_submission_id UUID REFERENCES map_submissions(id),
    approved_map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submissions_user ON map_submissions(user_id);
CREATE INDEX idx_submissions_status ON map_submissions(review_status);
CREATE INDEX idx_submissions_priority ON map_submissions(priority DESC, submitted_at ASC);
CREATE INDEX idx_submissions_reviewer ON map_submissions(assigned_reviewer_id);

-- ============================================
-- USER QUOTAS
-- ============================================

-- Track user content quotas
CREATE TABLE IF NOT EXISTS user_content_quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL,
    current_count INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    max_count INTEGER,
    max_size_bytes BIGINT,
    quota_override_reason TEXT,
    quota_override_by UUID REFERENCES users(id),
    quota_override_at TIMESTAMP,
    last_calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, content_type)
);

CREATE INDEX idx_quotas_user_type ON user_content_quotas(user_id, content_type);

-- ============================================
-- REVIEW ACTION HISTORY
-- ============================================

-- Track all review actions for audit trail
CREATE TABLE IF NOT EXISTS map_review_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES map_submissions(id) ON DELETE CASCADE,
    map_id UUID REFERENCES maps(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    performed_by UUID NOT NULL REFERENCES users(id),
    action_data JSONB DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_review_history_submission ON map_review_history(submission_id);
CREATE INDEX idx_review_history_map ON map_review_history(map_id);
CREATE INDEX idx_review_history_user ON map_review_history(performed_by);
CREATE INDEX idx_review_history_created ON map_review_history(created_at DESC);

-- ============================================
-- ADMIN NOTIFICATION PREFERENCES
-- ============================================

-- Which admins want notifications for what
CREATE TABLE IF NOT EXISTS admin_notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT FALSE,
    push_enabled BOOLEAN DEFAULT FALSE,
    UNIQUE(admin_id, notification_type)
);

-- ============================================
-- COPYRIGHT & CONTENT FLAGS
-- ============================================

-- Track potential copyright/content issues
CREATE TABLE IF NOT EXISTS content_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_type VARCHAR(50) NOT NULL,
    content_id UUID NOT NULL,
    flagged_by UUID NOT NULL REFERENCES users(id),
    flag_reason VARCHAR(100) NOT NULL,
    flag_details TEXT,
    review_status VARCHAR(50) DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    resolution_notes TEXT,
    action_taken VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_flags_content ON content_flags(content_type, content_id);
CREATE INDEX idx_flags_status ON content_flags(review_status);
CREATE INDEX idx_flags_user ON content_flags(flagged_by);

-- ============================================
-- UPDATE EXISTING MAPS TABLE
-- ============================================

-- Add workflow-related columns to maps table if they don't exist
ALTER TABLE maps ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(50) DEFAULT 'production';
ALTER TABLE maps ADD COLUMN IF NOT EXISTS original_submission_id UUID REFERENCES map_submissions(id);
ALTER TABLE maps ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default quota settings for new users
INSERT INTO user_content_quotas (user_id, content_type, max_count, max_size_bytes)
SELECT 
    id as user_id,
    'map_staging' as content_type,
    CASE WHEN is_admin THEN NULL ELSE 5 END as max_count,
    CASE WHEN is_admin THEN NULL ELSE 52428800 END as max_size_bytes
FROM users
ON CONFLICT (user_id, content_type) DO NOTHING;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_maps_workflow_status ON maps(workflow_status);
CREATE INDEX IF NOT EXISTS idx_maps_verified ON maps(is_verified);