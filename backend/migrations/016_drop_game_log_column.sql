-- 016_drop_game_log_column.sql
-- Destructive: remove game_states.game_log JSON column (moved to game_logs)

BEGIN;

ALTER TABLE public.game_states
  DROP COLUMN IF EXISTS game_log;

COMMIT;

