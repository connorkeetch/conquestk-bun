-- Migration 018: Add missing map columns for featured status and statistics
-- Description: Adds columns that the application code expects but were never created
-- Date: 2025-09-14

-- Add missing columns to maps table
ALTER TABLE maps
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rating_average DECIMAL(3,2) DEFAULT NULL CHECK (rating_average >= 1 AND rating_average <= 5),
ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0 CHECK (rating_count >= 0),
ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0 CHECK (play_count >= 0);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_maps_is_featured ON maps(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_maps_rating_average ON maps(rating_average) WHERE rating_average IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maps_play_count ON maps(play_count DESC);

-- Add helpful comments
COMMENT ON COLUMN maps.is_featured IS 'Admin-controlled flag to highlight quality maps';
COMMENT ON COLUMN maps.rating_average IS 'Average rating from 1-5, calculated from map_reviews';
COMMENT ON COLUMN maps.rating_count IS 'Number of ratings received';
COMMENT ON COLUMN maps.play_count IS 'Number of times this map has been played';

-- Set some default featured maps (World Map if it exists)
UPDATE maps 
SET is_featured = true 
WHERE name = 'World Map' 
  AND is_featured = false;

-- Initialize play_count from existing games if possible
-- This counts how many games have used each map
UPDATE maps m
SET play_count = COALESCE((
  SELECT COUNT(*)
  FROM games g
  WHERE g.map_id = m.id
), 0)
WHERE play_count = 0;

-- Initialize rating data from map_reviews if that table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = 'map_reviews'
  ) THEN
    UPDATE maps m
    SET 
      rating_average = (
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM map_reviews
        WHERE map_id = m.id
      ),
      rating_count = (
        SELECT COUNT(*)
        FROM map_reviews
        WHERE map_id = m.id
      )
    WHERE EXISTS (
      SELECT 1 FROM map_reviews WHERE map_id = m.id
    );
  END IF;
END $$;