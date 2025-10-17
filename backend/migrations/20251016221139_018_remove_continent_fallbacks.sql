-- migrate:up
ALTER TABLE map_territories
  DROP COLUMN IF EXISTS continent_id;

ALTER TABLE game_configurations
  DROP COLUMN IF EXISTS continent_bonuses;

-- migrate:down
ALTER TABLE map_territories
  ADD COLUMN IF NOT EXISTS continent_id VARCHAR(64);

ALTER TABLE game_configurations
  ADD COLUMN IF NOT EXISTS continent_bonuses JSONB;

