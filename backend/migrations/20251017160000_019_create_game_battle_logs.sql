-- 019_create_game_battle_logs.sql
-- Replace legacy game_states.game_log column with structured battle log storage.

BEGIN;

CREATE TABLE IF NOT EXISTS public.game_battle_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('BATTLE', 'ENGAGEMENT_SUMMARY')),
  job_id TEXT NULL,
  engagement_id TEXT NULL,
  entry_timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  turn_number INTEGER NOT NULL DEFAULT 1,
  attacking_territory_id TEXT NULL,
  defending_territory_id TEXT NULL,
  attacker_id UUID NULL,
  defender_id UUID NULL,
  attacker_losses INTEGER NULL,
  defender_losses INTEGER NULL,
  conquered BOOLEAN NULL,
  moved_armies INTEGER NULL,
  eliminated_players JSONB NOT NULL DEFAULT '[]'::jsonb,
  initial_from_armies INTEGER NULL,
  initial_to_armies INTEGER NULL,
  total_attacker_losses INTEGER NULL,
  total_defender_losses INTEGER NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_battle_logs_game_ts
  ON public.game_battle_logs (game_id, entry_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_game_battle_logs_game_engagement
  ON public.game_battle_logs (game_id, engagement_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_battle_logs_unique_job
  ON public.game_battle_logs (game_id, job_id)
  WHERE job_id IS NOT NULL;

COMMIT;
