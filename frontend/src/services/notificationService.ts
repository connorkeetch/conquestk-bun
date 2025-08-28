import type { Notification, NotificationType } from '../types/notification'

class NotificationService {
  private static instance: NotificationService
  private notifications: Notification[] = []
  private listeners: Set<(notifications: Notification[]) => void> = new Set()

  private constructor() {
    // Load mock notifications for development
    this.loadMockNotifications()
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  private loadMockNotifications() {
    // Mock notifications for demonstration
    const now = new Date()
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    this.notifications = [
      {
        id: '1',
        type: 'turn_reminder',
        title: 'Your Turn!',
        message: 'It\'s your turn in "6P FFA Classic World"',
        timestamp: new Date(now.getTime() - 5 * 60 * 1000), // 5 min ago
        read: false,
        actionUrl: '/room/game123',
        actionLabel: 'Play Now',
        icon: '⚔️',
        metadata: { gameId: 'game123' },
      },
      {
        id: '2',
        type: 'game_invite',
        title: 'Game Invitation',
        message: 'PlayerOne invited you to play Risk',
        timestamp: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
        read: false,
        actionUrl: '/room/game456',
        actionLabel: 'Join Game',
        icon: '📨',
        metadata: { gameId: 'game456', userId: 'player1' },
      },
      {
        id: '3',
        type: 'achievement',
        title: 'Achievement Unlocked!',
        message: 'First Victory - Win your first game',
        timestamp: hourAgo,
        read: true,
        icon: '🏆',
        metadata: { achievementId: 'first_victory' },
      },
      {
        id: '4',
        type: 'friend_request',
        title: 'Friend Request',
        message: 'StrategicMaster wants to be your friend',
        timestamp: yesterday,
        read: true,
        actionUrl: '/friends',
        actionLabel: 'View Request',
        icon: '👥',
        metadata: { userId: 'strategic_master', friendUsername: 'StrategicMaster' },
      },
      {
        id: '5',
        type: 'game_ended',
        title: 'Game Finished',
        message: 'You placed 2nd in "Ranked Europe Campaign"',
        timestamp: yesterday,
        read: true,
        actionUrl: '/history/game789',
        actionLabel: 'View Results',
        icon: '🎯',
        metadata: { gameId: 'game789' },
      },
      {
        id: '6',
        type: 'system',
        title: 'Server Maintenance',
        message: 'Scheduled maintenance at 3 AM UTC',
        timestamp: twoDaysAgo,
        read: true,
        icon: '⚙️',
      },
    ]
  }

  public getNotifications(): Notification[] {
    return [...this.notifications].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  public getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length
  }

  public markAsRead(notificationId: string): void {
    const notification = this.notifications.find((n) => n.id === notificationId)
    if (notification) {
      notification.read = true
      this.notifyListeners()
    }
  }

  public markAllAsRead(): void {
    this.notifications.forEach((n) => (n.read = true))
    this.notifyListeners()
  }

  public deleteNotification(notificationId: string): void {
    this.notifications = this.notifications.filter((n) => n.id !== notificationId)
    this.notifyListeners()
  }

  public clearAll(): void {
    this.notifications = []
    this.notifyListeners()
  }

  public addNotification(notification: Omit<Notification, 'id' | 'timestamp'>): void {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    }
    this.notifications.unshift(newNotification)
    this.notifyListeners()
  }

  public subscribe(listener: (notifications: Notification[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.getNotifications()))
  }

  // Group notifications by date for display
  public getGroupedNotifications(): { date: string; notifications: Notification[] }[] {
    const groups: Map<string, Notification[]> = new Map()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

    this.getNotifications().forEach((notification) => {
      const notifDate = new Date(notification.timestamp)
      let dateKey: string

      if (notifDate >= today) {
        dateKey = 'Today'
      } else if (notifDate >= yesterday) {
        dateKey = 'Yesterday'
      } else {
        dateKey = notifDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: notifDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        })
      }

      if (!groups.has(dateKey)) {
        groups.set(dateKey, [])
      }
      groups.get(dateKey)!.push(notification)
    })

    return Array.from(groups.entries()).map(([date, notifications]) => ({
      date,
      notifications,
    }))
  }
}

export const notificationService = NotificationService.getInstance()
