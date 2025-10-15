-- 015_create_game_logs.sql
-- Append-only textual game logs for fog-aware rendering and fast pagination

BEGIN;

CREATE TABLE IF NOT EXISTS public.game_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  ts TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  turn_number INTEGER NOT NULL DEFAULT 1,
  phase VARCHAR(32) NOT NULL DEFAULT 'reinforcement',
  move_type VARCHAR(64) NOT NULL,
  actor_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  from_territory_id TEXT NULL,
  to_territory_id TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_logs_game_ts ON public.game_logs (game_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_game_type_ts ON public.game_logs (game_id, move_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_actor ON public.game_logs (actor_id);

COMMIT;

