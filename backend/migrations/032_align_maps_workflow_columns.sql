-- Migration 032: Align maps table with workflow expectations
-- Date: 2025-02-10
-- Adds review tracking columns required by map workflow services

BEGIN;

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL CHECK (version >= 1),
  ADD COLUMN IF NOT EXISTS parent_map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0 NOT NULL CHECK (download_count >= 0),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

UPDATE maps
SET version = COALESCE(version, 1),
    download_count = COALESCE(download_count, 0)
WHERE version IS NULL OR download_count IS NULL;

UPDATE maps
SET submitted_at = COALESCE(submitted_at, created_at),
    reviewed_at = COALESCE(reviewed_at, updated_at)
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_maps_submitted_at ON maps(submitted_at);
CREATE INDEX IF NOT EXISTS idx_maps_reviewed_at ON maps(reviewed_at);

COMMIT;
