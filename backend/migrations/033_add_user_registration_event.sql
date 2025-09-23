-- Description: Allow events table to store user_registration entries for audit logging
-- Dependencies: 011_final_consolidated_schema

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;

ALTER TABLE events
  ADD CONSTRAINT events_type_check CHECK (
    event_type IN (
      'user_login',
      'user_logout',
      'user_registration',
      'game_start',
      'game_end',
      'game_move',
      'page_view',
      'button_click',
      'feature_use',
      'error_occurred',
      'purchase_initiated',
      'purchase_completed',
      'achievement_unlocked'
    )
  );
