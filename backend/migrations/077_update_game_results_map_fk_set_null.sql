-- Migration 077: Allow deleting maps without losing historical results
-- Changes FK on game_results.map_id to ON DELETE SET NULL

DO $$
BEGIN
  -- Drop the existing FK if it exists (name is typically game_results_map_id_fkey)
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name = 'game_results_map_id_fkey'
      AND tc.table_name = 'game_results'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE game_results DROP CONSTRAINT game_results_map_id_fkey;
  END IF;

  -- Recreate the FK with ON DELETE SET NULL to preserve results history
  ALTER TABLE game_results
    ADD CONSTRAINT game_results_map_id_fkey
    FOREIGN KEY (map_id)
    REFERENCES maps(id)
    ON DELETE SET NULL;
END $$;

