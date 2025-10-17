-- migrate:up
ALTER TABLE map_territories
  DROP COLUMN IF EXISTS continent_id,
  DROP COLUMN IF EXISTS continent;

ALTER TABLE game_configurations
  DROP COLUMN IF EXISTS continent_bonuses;

DROP TABLE IF EXISTS map_continents CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_continents_pkey') THEN
    ALTER TABLE map_sectors RENAME CONSTRAINT map_continents_pkey TO map_sectors_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_continents_map_id_name_key') THEN
    ALTER TABLE map_sectors RENAME CONSTRAINT map_continents_map_id_name_key TO map_sectors_map_id_name_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_continents_map_id_fkey') THEN
    ALTER TABLE map_sectors RENAME CONSTRAINT map_continents_map_id_fkey TO map_sectors_map_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_continents_bonus_non_negative') THEN
    ALTER TABLE map_sectors RENAME CONSTRAINT map_continents_bonus_non_negative TO map_sectors_bonus_non_negative;
  END IF;
END $$;

UPDATE maps
SET metadata = metadata
  || CASE
       WHEN metadata ? 'continents'
         THEN jsonb_build_object(
           'sectors',
           COALESCE(metadata->'sectors', metadata->'continents')
         )
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN metadata ? 'continentBonuses'
         THEN jsonb_build_object(
           'sectorBonuses',
           COALESCE(metadata->'sectorBonuses', metadata->'continentBonuses')
         )
       ELSE '{}'::jsonb
     END
  - 'continents'
  - 'continentBonuses'
WHERE metadata ? 'continents' OR metadata ? 'continentBonuses';

UPDATE map_versions
SET data = data
  || CASE
       WHEN data ? 'continents'
         THEN jsonb_build_object(
           'sectors',
           COALESCE(data->'sectors', data->'continents')
         )
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN data ? 'continentBonuses'
         THEN jsonb_build_object(
           'sectorBonuses',
           COALESCE(data->'sectorBonuses', data->'continentBonuses')
         )
       ELSE '{}'::jsonb
     END
  - 'continents'
  - 'continentBonuses'
WHERE data ? 'continents' OR data ? 'continentBonuses';

UPDATE map_drafts
SET map_data = map_data
  || CASE
       WHEN map_data ? 'continents'
         THEN jsonb_build_object(
           'sectors',
           COALESCE(map_data->'sectors', map_data->'continents')
         )
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN map_data ? 'continentBonuses'
         THEN jsonb_build_object(
           'sectorBonuses',
           COALESCE(map_data->'sectorBonuses', map_data->'continentBonuses')
         )
       ELSE '{}'::jsonb
     END
  - 'continents'
  - 'continentBonuses'
WHERE map_data ? 'continents' OR map_data ? 'continentBonuses';

UPDATE map_submissions
SET submission_data = submission_data
  || CASE
       WHEN submission_data ? 'continents'
         THEN jsonb_build_object(
           'sectors',
           COALESCE(submission_data->'sectors', submission_data->'continents')
         )
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN submission_data ? 'continentBonuses'
         THEN jsonb_build_object(
           'sectorBonuses',
           COALESCE(submission_data->'sectorBonuses', submission_data->'continentBonuses')
         )
       ELSE '{}'::jsonb
     END
  - 'continents'
  - 'continentBonuses'
WHERE submission_data ? 'continents' OR submission_data ? 'continentBonuses';

-- migrate:down
CREATE TABLE IF NOT EXISTS map_continents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  bonus_troops INTEGER NOT NULL DEFAULT 0,
  color VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE map_territories
  ADD COLUMN IF NOT EXISTS continent_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS continent VARCHAR(64);

ALTER TABLE game_configurations
  ADD COLUMN IF NOT EXISTS continent_bonuses JSONB;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_sectors_pkey') THEN
    ALTER TABLE map_sectors RENAME CONSTRAINT map_sectors_pkey TO map_continents_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_sectors_map_id_name_key') THEN
    ALTER TABLE map_sectors RENAME CONSTRAINT map_sectors_map_id_name_key TO map_continents_map_id_name_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_sectors_map_id_fkey') THEN
    ALTER TABLE map_sectors RENAME CONSTRAINT map_sectors_map_id_fkey TO map_continents_map_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'map_sectors_bonus_non_negative') THEN
    ALTER TABLE map_sectors RENAME CONSTRAINT map_sectors_bonus_non_negative TO map_continents_bonus_non_negative;
  END IF;
END $$;

UPDATE maps
SET metadata = metadata
  || CASE
       WHEN metadata ? 'sectors'
         THEN jsonb_build_object('continents', metadata->'sectors')
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN metadata ? 'sectorBonuses'
         THEN jsonb_build_object('continentBonuses', metadata->'sectorBonuses')
       ELSE '{}'::jsonb
     END;

UPDATE map_versions
SET data = data
  || CASE
       WHEN data ? 'sectors'
         THEN jsonb_build_object('continents', data->'sectors')
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN data ? 'sectorBonuses'
         THEN jsonb_build_object('continentBonuses', data->'sectorBonuses')
       ELSE '{}'::jsonb
     END;

UPDATE map_drafts
SET map_data = map_data
  || CASE
       WHEN map_data ? 'sectors'
         THEN jsonb_build_object('continents', map_data->'sectors')
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN map_data ? 'sectorBonuses'
         THEN jsonb_build_object('continentBonuses', map_data->'sectorBonuses')
       ELSE '{}'::jsonb
     END;

UPDATE map_submissions
SET submission_data = submission_data
  || CASE
       WHEN submission_data ? 'sectors'
         THEN jsonb_build_object('continents', submission_data->'sectors')
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN submission_data ? 'sectorBonuses'
         THEN jsonb_build_object('continentBonuses', submission_data->'sectorBonuses')
       ELSE '{}'::jsonb
     END;
