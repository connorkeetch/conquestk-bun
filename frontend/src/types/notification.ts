export type NotificationType = 
  | 'game_invite'
  | 'turn_reminder'
  | 'game_started'
  | 'game_ended'
  | 'friend_request'
  | 'achievement'
  | 'system'
  | 'chat_message'

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
  metadata?: {
    gameId?: string
    userId?: string
    achievementId?: string
    friendUsername?: string
  }
}

export interface NotificationGroup {
  date: string
  notifications: Notification[]
}