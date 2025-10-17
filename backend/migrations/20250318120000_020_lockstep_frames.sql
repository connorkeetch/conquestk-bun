CREATE TABLE match_frames (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,
    player_id UUID NOT NULL,
    commands JSONB NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX match_frames_match_seq_idx ON match_frames (match_id, seq);
CREATE INDEX match_frames_match_committed_idx ON match_frames (match_id, committed_at);

CREATE TABLE match_checksums (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,
    crc32 INTEGER NOT NULL,
    snapshot BYTEA,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX match_checksums_match_seq_idx ON match_checksums (match_id, seq);
