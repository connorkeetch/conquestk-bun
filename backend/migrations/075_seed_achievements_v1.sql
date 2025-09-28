-- Seed initial v1 achievements (id auto-generated; names are unique keys)

INSERT INTO achievements (name, description, category, icon, points, rarity, unlock_criteria, is_secret)
VALUES
  (
    'World Eater',
    'Win your first multiplayer game.',
    'gameplay',
    NULL,
    50,
    'common',
    '{"type":"first_win"}',
    FALSE
  ),
  (
    'Classic Conqueror',
    'Win a standard game by total domination (all opponents eliminated).',
    'gameplay',
    NULL,
    150,
    'uncommon',
    '{"type":"win_by_domination","game_mode":"normal"}',
    FALSE
  ),
  (
    'Crown Jewel',
    'Win a Capitals game (retain your capital to the end).',
    'gameplay',
    NULL,
    150,
    'uncommon',
    '{"type":"win_mode","game_mode":"capitals"}',
    FALSE
  )
ON CONFLICT (name) DO NOTHING;

