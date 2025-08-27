-- Add metadata column to maps table for storing territories and continents data
-- This allows the map editor to save all map data in a single request

-- For SQLite
ALTER TABLE maps ADD COLUMN metadata TEXT;

-- For PostgreSQL (if using PostgreSQL in production)
-- ALTER TABLE maps ADD COLUMN metadata JSONB;

-- For MySQL (if using MySQL)
-- ALTER TABLE maps ADD COLUMN metadata JSON;