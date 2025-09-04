-- Migration 009: Fix map_id type conflict in game_rooms table

-- The issue: Migration 003 added map_id as INTEGER DEFAULT 1, but original schema defines it as UUID
-- This causes "operator does not exist: integer = uuid" errors when joining with maps table

-- First, check if there are any game_rooms with integer map_id values
-- If map_id column exists as INTEGER, we need to convert it to UUID

DO $$
BEGIN
    -- Check if map_id is INTEGER type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'game_rooms' 
        AND column_name = 'map_id' 
        AND data_type = 'integer'
    ) THEN
        -- Get the first valid map UUID to use as default
        DECLARE
            default_map_uuid UUID;
        BEGIN
            SELECT id INTO default_map_uuid FROM maps LIMIT 1;
            
            -- If no maps exist, create a default one
            IF default_map_uuid IS NULL THEN
                INSERT INTO maps (id, name, territories_count, description, is_official, created_by, created_at, updated_at, version)
                VALUES (
                    uuid_generate_v4(), 
                    'World Map', 
                    42, 
                    'Default world map for Risk game', 
                    true, 
                    (SELECT id FROM users WHERE email = 'connorkeetch@gmail.com' LIMIT 1),
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    1
                )
                RETURNING id INTO default_map_uuid;
            END IF;
            
            -- Drop the existing INTEGER column and recreate as UUID
            ALTER TABLE game_rooms DROP COLUMN IF EXISTS map_id;
            ALTER TABLE game_rooms ADD COLUMN map_id UUID REFERENCES maps(id);
            
            -- Set all game_rooms to use the default map
            UPDATE game_rooms SET map_id = default_map_uuid WHERE map_id IS NULL;
            
            RAISE NOTICE 'Fixed game_rooms.map_id type conflict: converted INTEGER to UUID';
        END;
    ELSE
        RAISE NOTICE 'game_rooms.map_id is already UUID type, no conversion needed';
    END IF;
END $$;

-- Ensure proper index exists
CREATE INDEX IF NOT EXISTS idx_game_rooms_map_id ON game_rooms(map_id);

-- Add foreign key constraint if it doesn't exist
ALTER TABLE game_rooms 
DROP CONSTRAINT IF EXISTS game_rooms_map_id_fkey,
ADD CONSTRAINT game_rooms_map_id_fkey FOREIGN KEY (map_id) REFERENCES maps(id);