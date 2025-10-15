-- 002_user_ranked_stats.sql
-- Add derived ranked stats to users and backfill from existing game data
-- Safe to run multiple times due to IF NOT EXISTS guards

BEGIN;

-- Core counters for ranked results
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ranked_wins integer NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ranked_losses integer NOT NULL DEFAULT 0;

-- Generated total, avoids drift and writes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'total_ranked_games'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN total_ranked_games integer GENERATED ALWAYS AS (ranked_wins + ranked_losses) STORED;
  END IF;
END $$;

-- Additional skill metadata used by routes (kept optional)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS highest_skill_rating integer NOT NULL DEFAULT 800;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_ranked_game_at timestamp without time zone;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_tier character varying(32);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS skill_confidence double precision NOT NULL DEFAULT 0;

-- Backfill counters from game history (ranked, completed games only)
-- Wins/Losses
WITH ranked_results AS (
  SELECT
    pgr.user_id,
    COUNT(*) FILTER (WHERE pgr.is_winner) AS wins,
    COUNT(*) FILTER (WHERE NOT pgr.is_winner) AS losses
  FROM player_game_results pgr
  JOIN game_rooms gr ON gr.id = pgr.room_id
  WHERE gr.status = 'completed' AND gr.is_ranked = TRUE
  GROUP BY pgr.user_id
)
UPDATE users u
SET ranked_wins = rr.wins,
    ranked_losses = rr.losses
FROM ranked_results rr
WHERE u.id = rr.user_id;

-- Last ranked game timestamp
WITH last_ranked AS (
  SELECT pgr.user_id, MAX(gr.ended_at) AS last_played
  FROM player_game_results pgr
  JOIN game_rooms gr ON gr.id = pgr.room_id
  WHERE gr.status = 'completed' AND gr.is_ranked = TRUE
  GROUP BY pgr.user_id
)
UPDATE users u
SET last_ranked_game_at = lr.last_played
FROM last_ranked lr
WHERE u.id = lr.user_id;

-- Highest skill rating using rating_history, fallback to current skill_rating
UPDATE users u
SET highest_skill_rating = GREATEST(
  u.highest_skill_rating,
  COALESCE((SELECT MAX(rh.new_rating) FROM rating_history rh WHERE rh.user_id = u.id), u.skill_rating)
);

-- Helpful index for leaderboard fallback ordering
CREATE INDEX IF NOT EXISTS idx_users_skill_created
  ON public.users (skill_rating DESC, created_at ASC);

COMMIT;
