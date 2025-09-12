-- Migration: Add status column to maps table and remove is_official
-- Author: System
-- Date: 2025-09-12
-- Description: Adds status column for proper map workflow management

-- Add status column with default value
ALTER TABLE maps 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' 
CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'archived'));

-- Update existing maps based on current state
-- Set all existing maps to approved since they're already in the system
UPDATE maps 
SET status = 'approved' 
WHERE status IS NULL;

-- Drop the is_official column as it's no longer needed
ALTER TABLE maps 
DROP COLUMN IF EXISTS is_official;

-- Add index for faster status filtering
CREATE INDEX IF NOT EXISTS idx_maps_status ON maps(status);

-- Add columns for player count recommendations if they don't exist
ALTER TABLE maps 
ADD COLUMN IF NOT EXISTS min_players INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 12;

-- Update existing maps with sensible defaults
UPDATE maps 
SET min_players = 2, max_players = 6 
WHERE min_players IS NULL OR max_players IS NULL;