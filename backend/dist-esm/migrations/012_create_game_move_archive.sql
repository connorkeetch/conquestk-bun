-- 012_create_game_move_archive.sql
-- Purpose: Introduce archive table for completed game moves so the live table stays lean

BEGIN;

CREATE TABLE IF NOT EXISTS public.game_move_archive (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    move_type VARCHAR(50) NOT NULL,
    move_data JSONB NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    validation_error TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_move_archive_room_id ON public.game_move_archive(room_id);
CREATE INDEX IF NOT EXISTS idx_game_move_archive_player_id ON public.game_move_archive(player_id);
CREATE INDEX IF NOT EXISTS idx_game_move_archive_turn_number ON public.game_move_archive(turn_number);
CREATE INDEX IF NOT EXISTS idx_game_move_archive_move_type ON public.game_move_archive(move_type);
CREATE INDEX IF NOT EXISTS idx_game_move_archive_created_at ON public.game_move_archive(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_move_archive_archived_at ON public.game_move_archive(archived_at DESC);

COMMIT;
