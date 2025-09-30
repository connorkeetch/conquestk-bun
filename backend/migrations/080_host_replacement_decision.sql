-- 080_host_replacement_decision.sql
-- Add pending replacement fields so the host can decide AI vs neutral after a kick

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS replacement_pending_user_id UUID NULL;

