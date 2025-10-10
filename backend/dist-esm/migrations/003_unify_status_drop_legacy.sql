-- 003_unify_status_drop_legacy.sql
-- Purpose:
--  - Drop legacy/unused columns from game_rooms
--  - Migrate lifecycle_phase semantics into status where needed
--  - Drop legacy compatibility 'games' table and related trigger/function

BEGIN;

-- 1) Migrate status from lifecycle_phase when present
--    - Map in-game phases to coarse lifecycle buckets for status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'game_rooms' AND column_name = 'lifecycle_phase'
  ) THEN
    -- Normalize status using lifecycle_phase as source of truth when available
    UPDATE public.game_rooms
    SET status = CASE
      WHEN lifecycle_phase IN ('lobby', 'initializing') THEN lifecycle_phase
      WHEN lifecycle_phase IN ('reinforcement', 'deployment', 'attack', 'fortify') THEN 'active'
      WHEN lifecycle_phase IN ('finished', 'completed') THEN 'completed'
      ELSE status
    END
    WHERE lifecycle_phase IS NOT NULL;
  END IF;
END$$;

-- 2) Drop unused columns
ALTER TABLE public.game_rooms DROP COLUMN IF EXISTS spectators_allowed;
ALTER TABLE public.game_rooms DROP COLUMN IF EXISTS replay_available;

-- 3) Drop lifecycle_phase column
ALTER TABLE public.game_rooms DROP COLUMN IF EXISTS lifecycle_phase;

-- 4) Ensure status constraint and default are aligned with current usage
--    Allow both 'completed' and 'finished' to preserve existing data while we normalize writes.
ALTER TABLE public.game_rooms DROP CONSTRAINT IF EXISTS game_rooms_status_check;
ALTER TABLE public.game_rooms
  ADD CONSTRAINT game_rooms_status_check
  CHECK (status IN ('lobby','initializing','active','completed','finished','paused','abandoned'));

-- Default to 'lobby' for new rooms
ALTER TABLE public.game_rooms ALTER COLUMN status SET DEFAULT 'lobby';

-- 5) Remove legacy compatibility shim for conversation migrations
DROP TRIGGER IF EXISTS trg_game_rooms_sync_games ON public.game_rooms;
DROP FUNCTION IF EXISTS public.sync_games_from_game_rooms();
DROP TABLE IF EXISTS public.games;

COMMIT;
