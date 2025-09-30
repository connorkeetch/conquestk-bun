-- 081_turn_stats_column.sql
-- Persist per-turn stats for richer post-game analytics

ALTER TABLE game_states
  ADD COLUMN IF NOT EXISTS turn_stats JSONB NOT NULL DEFAULT '[]';

