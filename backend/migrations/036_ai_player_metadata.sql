-- Add AI seat metadata and feature flags for phased rollout

ALTER TABLE room_players
  ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_difficulty VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ai_personality_seed INTEGER;

DO $$
BEGIN
  ALTER TABLE room_players
    ADD CONSTRAINT room_players_ai_difficulty_check
    CHECK (
      ai_difficulty IS NULL OR ai_difficulty IN ('recruit', 'commander', 'grandmaster')
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Seed feature flags controlling AI lobby access and tier availability
INSERT INTO feature_flags (
  flag_name,
  description,
  access_level,
  category,
  is_enabled,
  rollout_percentage,
  target_criteria
) VALUES
  (
    'experimental_ai_lobby_options',
    'Expose AI seat configuration inside game lobbies',
    'internal',
    'experimental',
    false,
    0,
    '{}'
  ),
  (
    'experimental_ai_recruit',
    'Enable Recruit-tier AI decision making',
    'internal',
    'experimental',
    false,
    0,
    '{}'
  ),
  (
    'experimental_ai_commander',
    'Enable Commander-tier AI decision making',
    'internal',
    'experimental',
    false,
    0,
    '{}'
  ),
  (
    'experimental_ai_grandmaster',
    'Enable Grandmaster-tier AI decision making',
    'internal',
    'experimental',
    false,
    0,
    '{}'
  )
ON CONFLICT (flag_name) DO UPDATE
SET
  description = EXCLUDED.description,
  category = EXCLUDED.category;
