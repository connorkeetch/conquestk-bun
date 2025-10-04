-- Migration: Add 'lobby' to game_phase constraint
-- Purpose: Allow game_states to exist during lobby phase so frontend doesn't get 404s

-- Update the CHECK constraint to include 'lobby' phase
ALTER TABLE game_states
  DROP CONSTRAINT IF EXISTS game_states_phase_check;

ALTER TABLE game_states
  ADD CONSTRAINT game_states_phase_check
  CHECK (game_phase IN ('lobby','reinforcement','deployment','attack','fortify','finished'));

-- Make game_phase nullable temporarily during migration (will re-apply NOT NULL after backfill)
ALTER TABLE game_states
  ALTER COLUMN game_phase DROP NOT NULL;

-- Backfill any existing NULL game_phase values to 'lobby'
UPDATE game_states
SET game_phase = 'lobby'
WHERE game_phase IS NULL;

-- Re-apply NOT NULL constraint
ALTER TABLE game_states
  ALTER COLUMN game_phase SET NOT NULL;
