-- Add Gunt's Prescriptions feature flag
INSERT INTO feature_flags (name, enabled, description, created_at)
VALUES (
  'gunts_prescriptions',
  false,
  'Fun doctor-themed messages for game creation and losses',
  CURRENT_TIMESTAMP
)
ON CONFLICT (name) DO NOTHING;