-- Migration 013: Rename created_by to creator_id in maps table
-- The code expects creator_id but the migration created created_by
-- This renames the column to match what the code expects

-- Rename created_by to creator_id if created_by exists and creator_id doesn't
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'maps' 
    AND column_name = 'created_by'
  ) AND NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'maps' 
    AND column_name = 'creator_id'
  ) THEN
    ALTER TABLE maps RENAME COLUMN created_by TO creator_id;
  END IF;
END
$$;

-- Add missing columns that the code expects
ALTER TABLE maps 
ADD COLUMN IF NOT EXISTS image_width INTEGER,
ADD COLUMN IF NOT EXISTS image_height INTEGER,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS capital_territories JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_maps_creator_id ON maps(creator_id);
CREATE INDEX IF NOT EXISTS idx_maps_is_public ON maps(is_public);
CREATE INDEX IF NOT EXISTS idx_maps_created_at ON maps(created_at);