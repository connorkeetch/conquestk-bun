-- 028_map_image_purge_tracking.sql
-- Adds deletion tracking columns for staging images and records purge runs for metrics

BEGIN;

ALTER TABLE map_images_staging
  ADD COLUMN IF NOT EXISTS deletion_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_deletion_attempt TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_deletion_error TEXT,
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS map_asset_purge_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_type VARCHAR(50) NOT NULL DEFAULT 'staging',
  processed_count INTEGER NOT NULL DEFAULT 0,
  purged_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  bytes_purged BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_map_asset_purge_runs_type
  ON map_asset_purge_runs(run_type, started_at DESC);

COMMIT;
