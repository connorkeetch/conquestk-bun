export type NotificationType =
  | 'game_invite'
  | 'turn_reminder'
  | 'game_started'
  | 'game_ended'
  | 'friend_request'
  | 'achievement'
  | 'system'
  | 'chat_message'
  | 'admin'
  | 'map_submission'
  | 'map_review'
  | 'map_approved'
  | 'map_rejected'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: Date
  read: boolean
  actionUrl?: string
  actionLabel?: string
  icon?: string
  metadata?: Record<string, unknown> & {
    gameId?: string
    userId?: string
    achievementId?: string
    friendUsername?: string
    mapId?: string
    requestId?: string
  }
}

export interface NotificationGroup {
  date: string
  notifications: Notification[]
}
