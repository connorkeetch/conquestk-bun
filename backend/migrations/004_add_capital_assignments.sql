-- Migration: Add capital assignments for maps
-- This allows pre-calculated optimal starting positions for different player counts

-- Add capital assignments column to maps table
-- Stores capital territories for each player count (2-12 players)
ALTER TABLE maps ADD COLUMN IF NOT EXISTS capital_assignments JSONB;

-- Example structure:
-- {
--   "2": ["territory-id-1", "territory-id-2"],
--   "3": ["territory-id-1", "territory-id-2", "territory-id-3"],
--   "4": ["territory-id-1", "territory-id-2", "territory-id-3", "territory-id-4"],
--   "5": ["territory-id-1", "territory-id-2", "territory-id-3", "territory-id-4", "territory-id-5"],
--   ... up to 12 players
-- }

-- Add metadata column for tracking generation info and manual adjustments
ALTER TABLE maps ADD COLUMN IF NOT EXISTS capital_metadata JSONB DEFAULT '{}';

-- Example metadata structure:
-- {
--   "generatedAt": "2024-01-01T00:00:00Z",
--   "algorithm": "maximin-distance-v1",
--   "manuallyAdjusted": {
--     "3": true,  -- 3-player capitals were manually adjusted by map creator
--     "4": false  -- 4-player capitals are still algorithmic
--   }
-- }

-- Create index for faster queries on maps with capitals
CREATE INDEX IF NOT EXISTS idx_maps_capital_assignments ON maps USING gin(capital_assignments);

-- Add comment explaining the columns
COMMENT ON COLUMN maps.capital_assignments IS 'Pre-calculated optimal starting positions for different player counts';
COMMENT ON COLUMN maps.capital_metadata IS 'Metadata about capital generation including algorithm version and manual adjustments';