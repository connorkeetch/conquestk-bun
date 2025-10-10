-- 007_game_state_snapshots.sql
-- Purpose: Store per-turn/phase immutable state snapshots for admin analysis and replays

BEGIN;

CREATE TABLE IF NOT EXISTS public.game_state_snapshots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL CHECK (turn_number > 0),
    phase VARCHAR(20) NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Prevent duplicate snapshots for the same room/turn/phase
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_state_snapshots_room_turn_phase
  ON public.game_state_snapshots(room_id, turn_number, phase);

-- Helpful indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_game_state_snapshots_room_created
  ON public.game_state_snapshots(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_state_snapshots_room_turn
  ON public.game_state_snapshots(room_id, turn_number DESC);

COMMIT;

