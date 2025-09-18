-- Migration 019: Create map_reviews table for moderator decisions and optional ratings
-- Description: Adds a dedicated table to capture map review outcomes so admin status updates do not fail.
-- Date: 2025-09-19

CREATE TABLE IF NOT EXISTS map_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_changes')),
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(map_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_map_reviews_map_id ON map_reviews(map_id);
CREATE INDEX IF NOT EXISTS idx_map_reviews_reviewer_id ON map_reviews(reviewer_id);

CREATE OR REPLACE FUNCTION update_map_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_map_reviews_updated_at ON map_reviews;

CREATE TRIGGER trg_map_reviews_updated_at
BEFORE UPDATE ON map_reviews
FOR EACH ROW
EXECUTE FUNCTION update_map_reviews_updated_at();
