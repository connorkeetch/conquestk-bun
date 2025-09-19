-- Migration 021: Ensure map workflow tables exist and align with service expectations
-- Date: 2025-02-06
-- Description: Creates missing staging/draft/review tables required by the map workflow
--              and aligns map_submissions with service code.

BEGIN;

-- =====================================================
-- MAP IMAGE STAGING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS map_images_staging (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255),
  file_url VARCHAR(500) NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  mime_type VARCHAR(100),
  upload_status VARCHAR(32) DEFAULT 'processing' NOT NULL,
  processing_error TEXT,
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_map_images_staging_user_id
  ON map_images_staging(user_id)
  WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_map_images_staging_updated_at ON map_images_staging;
CREATE TRIGGER trg_map_images_staging_updated_at
  BEFORE UPDATE ON map_images_staging
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MAP DRAFTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS map_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staging_image_id UUID REFERENCES map_images_staging(id) ON DELETE SET NULL,
  parent_map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL DEFAULT 'Untitled Map',
  description TEXT,
  map_data JSONB DEFAULT '{}'::JSONB NOT NULL,
  territories JSONB DEFAULT '[]'::JSONB NOT NULL,
  continents JSONB DEFAULT '[]'::JSONB NOT NULL,
  adjacencies JSONB DEFAULT '[]'::JSONB NOT NULL,
  capital_assignments JSONB DEFAULT '{}'::JSONB NOT NULL,
  thumbnail_url VARCHAR(500),
  image_url VARCHAR(500),
  image_width INTEGER,
  image_height INTEGER,
  tags JSONB DEFAULT '[]'::JSONB NOT NULL,
  is_public BOOLEAN DEFAULT FALSE NOT NULL,
  draft_status VARCHAR(32) DEFAULT 'editing' NOT NULL,
  validation_status VARCHAR(32),
  validation_errors JSONB DEFAULT '[]'::JSONB NOT NULL,
  auto_saved_at TIMESTAMP,
  last_edited_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_map_drafts_user_id
  ON map_drafts(user_id, draft_status);

DROP TRIGGER IF EXISTS trg_map_drafts_updated_at ON map_drafts;
CREATE TRIGGER trg_map_drafts_updated_at
  BEFORE UPDATE ON map_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MAP REVIEW QUEUE
-- =====================================================

CREATE TABLE IF NOT EXISTS map_review_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) DEFAULT 'pending' NOT NULL,
  priority INTEGER DEFAULT 0 NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  reviewed_at TIMESTAMP,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_review_queue_map_id
  ON map_review_queue(map_id);

CREATE INDEX IF NOT EXISTS idx_map_review_queue_status
  ON map_review_queue(status);

-- =====================================================
-- MAP SUBMISSION LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS map_submission_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  action VARCHAR(64) NOT NULL,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_map_submission_logs_map_id
  ON map_submission_logs(map_id);

-- =====================================================
-- MAP VERSIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS map_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  data JSONB DEFAULT '{}'::JSONB NOT NULL,
  territories JSONB DEFAULT '[]'::JSONB NOT NULL,
  continents JSONB DEFAULT '[]'::JSONB NOT NULL,
  adjacencies JSONB DEFAULT '[]'::JSONB NOT NULL,
  change_summary TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_map_versions_map_id_version
  ON map_versions(map_id, version_number DESC);

-- =====================================================
-- ADMIN NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}'::JSONB NOT NULL,
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_id
  ON admin_notifications(admin_id, is_read);

-- =====================================================
-- CONTENT APPROVAL QUEUE
-- =====================================================

CREATE TABLE IF NOT EXISTS content_approval_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type VARCHAR(50) NOT NULL,
  content_id UUID NOT NULL,
  submitter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) DEFAULT 'pending' NOT NULL,
  priority INTEGER DEFAULT 0 NOT NULL,
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  reviewed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_approval_queue_status
  ON content_approval_queue(status);

CREATE INDEX IF NOT EXISTS idx_content_approval_queue_content
  ON content_approval_queue(content_type, content_id);

-- =====================================================
-- ALIGN MAP_SUBMISSIONS TABLE
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'map_submissions' AND column_name = 'submitted_by'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'map_submissions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE map_submissions
      RENAME COLUMN submitted_by TO user_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_submissions' AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'map_submissions' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE map_submissions
      RENAME COLUMN status TO review_status;
  END IF;
END $$;

ALTER TABLE map_submissions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(32) DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;

ALTER TABLE map_submissions
  ALTER COLUMN submission_data TYPE JSONB USING submission_data::JSONB,
  ALTER COLUMN submission_data SET DEFAULT '{}'::JSONB,
  ALTER COLUMN review_status SET DEFAULT 'pending';

ALTER TABLE map_submissions
  DROP CONSTRAINT IF EXISTS map_submissions_status_check;

ALTER TABLE map_submissions
  ADD CONSTRAINT map_submissions_review_status_check
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_changes'));

CREATE INDEX IF NOT EXISTS idx_map_submissions_user_id
  ON map_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_map_submissions_review_status
  ON map_submissions(review_status);

DROP TRIGGER IF EXISTS trg_map_submissions_updated_at ON map_submissions;
CREATE TRIGGER trg_map_submissions_updated_at
  BEFORE UPDATE ON map_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
