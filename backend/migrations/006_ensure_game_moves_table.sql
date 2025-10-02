-- 006_ensure_game_moves_table.sql
-- Purpose: Ensure game_moves table exists for recording all gameplay actions
-- This table is critical for:
--  - Troubleshooting game issues
--  - Maintaining phase/turn synchronization
--  - Gameplay analytics
--  - Player move history

BEGIN;

-- Create game_moves table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.game_moves (
    id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    move_type VARCHAR(50) NOT NULL,
    move_data JSONB NOT NULL,
    is_valid BOOLEAN DEFAULT true NOT NULL,
    validation_error TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT game_moves_turn_positive CHECK (turn_number > 0)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_game_moves_room_id ON public.game_moves(room_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_player_id ON public.game_moves(player_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_turn_number ON public.game_moves(turn_number);
CREATE INDEX IF NOT EXISTS idx_game_moves_move_type ON public.game_moves(move_type);
CREATE INDEX IF NOT EXISTS idx_game_moves_created_at ON public.game_moves(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_game_moves_room_turn ON public.game_moves(room_id, turn_number DESC);

COMMIT;
