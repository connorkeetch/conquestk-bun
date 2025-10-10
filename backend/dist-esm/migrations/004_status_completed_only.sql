-- 004_status_completed_only.sql
-- Purpose:
--  - Migrate legacy game_rooms.status 'finished' => 'completed'
--  - Tighten status CHECK constraint to disallow 'finished'

BEGIN;

-- Update any remaining rows
UPDATE public.game_rooms SET status = 'completed' WHERE status = 'finished';

-- Tighten the constraint
ALTER TABLE public.game_rooms DROP CONSTRAINT IF EXISTS game_rooms_status_check;
ALTER TABLE public.game_rooms
  ADD CONSTRAINT game_rooms_status_check
  CHECK (status IN ('lobby','initializing','active','completed','paused','abandoned'));

COMMIT;

