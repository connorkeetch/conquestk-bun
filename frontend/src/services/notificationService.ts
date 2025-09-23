import type { Notification, NotificationType } from '../types/notification'

class NotificationService {
  private static instance: NotificationService
  private notifications: Notification[] = []
  private listeners: Set<(notifications: Notification[]) => void> = new Set()

  private constructor() {
    // Initialize with empty notifications
    // Real notifications will be added via socket events or API calls
    this.notifications = []
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
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
    for (const n of this.notifications) {
      n.read = true
    }
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

  public addNotification(notification: {
    id?: string
    type: NotificationType | (string & {})
    title: string
    message: string
    read?: boolean
    actionUrl?: string
    actionLabel?: string
    icon?: string
    metadata?: Notification['metadata']
    timestamp?: Date
  }): void {
    const newNotification: Notification = {
      id: notification.id ?? Math.random().toString(36).substring(2, 11),
      type: notification.type as NotificationType,
      title: notification.title,
      message: notification.message,
      read: notification.read ?? false,
      actionUrl: notification.actionUrl,
      actionLabel: notification.actionLabel,
      icon: notification.icon,
      metadata: notification.metadata,
      timestamp: notification.timestamp ?? new Date(),
    }
    this.notifications.unshift(newNotification)
    this.notifyListeners()
  }

  public subscribe(listener: (notifications: Notification[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.getNotifications())
    }
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
