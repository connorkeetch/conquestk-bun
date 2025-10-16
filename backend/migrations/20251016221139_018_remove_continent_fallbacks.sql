-- migrate:up
ALTER TABLE map_territories
  DROP COLUMN IF EXISTS continent_id;

ALTER TABLE map_territories
  RENAME COLUMN sector_id TO sector_id;

UPDATE map_territories
SET sector_id = map_territories.sector_id
WHERE TRUE;

ALTER TABLE game_configurations
  DROP COLUMN IF EXISTS continent_bonuses;

ALTER TABLE game_configurations
  RENAME COLUMN sector_bonuses TO sector_bonuses;

UPDATE game_configurations
SET sector_bonuses = jsonb_build_array()
WHERE sector_bonuses IS NULL;

-- migrate:down
ALTER TABLE map_territories
  ADD COLUMN IF NOT EXISTS continent_id VARCHAR(64);

ALTER TABLE game_configurations
  ADD COLUMN IF NOT EXISTS continent_bonuses JSONB;

