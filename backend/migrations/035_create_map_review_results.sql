-- Migration 035: Ensure map review criteria and results tables exist with PostgreSQL semantics
-- Date: 2025-09-24
-- Description: Creates or aligns map_review_criteria and map_review_results tables so that
--              the approval workflow can store per-criteria decisions using native PostgreSQL syntax.

BEGIN;

CREATE TABLE IF NOT EXISTS map_review_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  weight INTEGER NOT NULL DEFAULT 1,
  check_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_review_criteria_name
  ON map_review_criteria(name);

DROP TRIGGER IF EXISTS trg_map_review_criteria_updated_at ON map_review_criteria;
CREATE TRIGGER trg_map_review_criteria_updated_at
  BEFORE UPDATE ON map_review_criteria
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS map_review_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_request_id UUID NOT NULL REFERENCES map_approval_requests(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES map_review_criteria(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL,
  reviewer_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT map_review_results_status_check CHECK (status IN ('pass', 'fail', 'warning', 'not_applicable')),
  CONSTRAINT map_review_results_unique UNIQUE (approval_request_id, criteria_id)
);

CREATE INDEX IF NOT EXISTS idx_map_review_results_request
  ON map_review_results(approval_request_id);

CREATE INDEX IF NOT EXISTS idx_map_review_results_criteria
  ON map_review_results(criteria_id);

DROP TRIGGER IF EXISTS trg_map_review_results_updated_at ON map_review_results;
CREATE TRIGGER trg_map_review_results_updated_at
  BEFORE UPDATE ON map_review_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
