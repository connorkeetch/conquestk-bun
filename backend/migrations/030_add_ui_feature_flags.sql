-- Adds UI feature flags to gate coming-soon surfaces

INSERT INTO feature_flags (
  flag_name,
  description,
  access_level,
  category,
  is_enabled,
  rollout_percentage,
  target_criteria
)
VALUES
  ('ui_map_polygon_editor', 'Enable the polygon-based map editor experience', 'internal', 'ui', false, 0, '{}'),
  ('ui_tournaments', 'Expose tournament-related navigation and notifications', 'internal', 'ui', false, 0, '{}'),
  ('ui_profile_extras', 'Show profile match history and achievements sections', 'internal', 'ui', false, 0, '{}')
ON CONFLICT (flag_name) DO UPDATE
SET
  description = EXCLUDED.description,
  category = EXCLUDED.category;
