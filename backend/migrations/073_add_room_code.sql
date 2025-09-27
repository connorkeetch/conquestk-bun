-- 073_add_room_code.sql
-- Adds a short numeric room_code to game_rooms, unique and sequential starting at 10000.

-- 1) Add column if missing
ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS room_code BIGINT;

-- 2) Create sequence if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'game_room_code_seq'
  ) THEN
    CREATE SEQUENCE game_room_code_seq START WITH 10000;
  END IF;
END $$;

-- 3) Ensure sequence is at least max(room_code)
SELECT setval(
  'game_room_code_seq',
  GREATEST( (SELECT COALESCE(MAX(room_code), 9999) FROM game_rooms), 9999 )
);

-- 4) Set default on column
ALTER TABLE game_rooms
  ALTER COLUMN room_code SET DEFAULT nextval('game_room_code_seq');

-- 5) Backfill existing rows
UPDATE game_rooms
SET room_code = nextval('game_room_code_seq')
WHERE room_code IS NULL;

-- 6) Enforce uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_rooms_room_code_unique ON game_rooms (room_code);

