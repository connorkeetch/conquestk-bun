-- Migration: Authoritative Server Refactor
-- Remove lockstep tables and create event-sourced architecture

-- Drop old lockstep tables
DROP TABLE IF EXISTS match_frames CASCADE;
DROP TABLE IF EXISTS match_checksums CASCADE;

-- Create event log for authoritative server
CREATE TABLE game_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    seq BIGSERIAL NOT NULL,
    game_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    version BIGINT NOT NULL,
    player_id UUID,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create state snapshots for recovery
CREATE TABLE game_state_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    version BIGINT NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE UNIQUE INDEX game_events_game_seq_idx ON game_events(game_id, seq);
CREATE INDEX game_events_game_created_idx ON game_events(game_id, created_at DESC);
CREATE INDEX game_events_game_version_idx ON game_events(game_id, version);

CREATE UNIQUE INDEX game_snapshots_game_version_idx ON game_state_snapshots(game_id, version);
CREATE INDEX game_snapshots_game_created_idx ON game_state_snapshots(game_id, created_at DESC);

-- Add version tracking to game_rooms if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'game_rooms' AND column_name = 'state_version'
    ) THEN
        ALTER TABLE game_rooms ADD COLUMN state_version BIGINT NOT NULL DEFAULT 0;
    END IF;
END $$;
