-- 027_update_notification_types.sql
-- Expands notification type constraint to cover chat and map workflow events

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'friend_request',
      'game_invite',
      'game_started',
      'game_ended',
      'achievement',
      'system',
      'admin',
      'chat_message',
      'map_submission',
      'map_review',
      'map_approved',
      'map_rejected'
    )
  );
