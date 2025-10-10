-- 005_update_game_states_schema.sql
-- Purpose:
--  - Ensure schema matches runtime writes for game state snapshots
--  - Add JSONB `game_data` column used for full-state snapshots
--  - Relax phase constraint to include modern 'reinforcement' while keeping legacy 'deployment'

BEGIN;

-- Add `game_data` column if missing for full-state snapshots
ALTER TABLE public.game_states
  ADD COLUMN IF NOT EXISTS game_data JSONB;

-- Update phase check constraint to accept current engine phases
ALTER TABLE public.game_states
  DROP CONSTRAINT IF EXISTS game_states_phase_check;

ALTER TABLE public.game_states
  ADD CONSTRAINT game_states_phase_check
  CHECK (game_phase IN ('reinforcement','deployment','attack','fortify','finished'));

COMMIT;

