import Favico from 'favico.js'
import type { Notification } from '../types/notification'
import { notificationService } from './notificationService'

type FavicoInstance = { badge: (val: number | string) => void; reset: () => void }

class FaviconBadgeService {
  private static instance: FaviconBadgeService
  private favico: FavicoInstance // Favico.js doesn't have TypeScript types
  private currentBadgeCount: number = 0
  private unsubscribe: (() => void) | null = null

  private constructor() {
    // Initialize Favico with a red badge
    this.favico = new Favico({
      animation: 'fade',
      position: 'up',
      bgColor: '#ef4444', // Tailwind red-500
      textColor: '#ffffff',
    }) as unknown as FavicoInstance

    // Subscribe to notification changes
    this.subscribeToNotifications()
  }

  public static getInstance(): FaviconBadgeService {
    if (!FaviconBadgeService.instance) {
      FaviconBadgeService.instance = new FaviconBadgeService()
    }
    return FaviconBadgeService.instance
  }

  private subscribeToNotifications(): void {
    // Subscribe to notification updates
    this.unsubscribe = notificationService.subscribe((notifications) => {
      this.updateBadgeFromNotifications(notifications)
    })

    // Initial update
    this.updateBadgeFromNotifications(notificationService.getNotifications())
  }

  private updateBadgeFromNotifications(notifications: Notification[]): void {
    // Count only unread turn_reminder notifications (your turn notifications)
    const turnNotifications = notifications.filter((n) => n.type === 'turn_reminder' && !n.read)

    this.setBadge(turnNotifications.length)
  }

  public setBadge(count: number): void {
    // Only update if the count has changed
    if (this.currentBadgeCount === count) return

    this.currentBadgeCount = count

    if (count === 0) {
      // Reset to normal favicon
      this.favico.reset()
    } else {
      // Show badge with count (max 99)
      const displayCount = count > 99 ? '99+' : count
      this.favico.badge(displayCount)
    }
  }

  public clearBadge(): void {
    this.setBadge(0)
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.favico.reset()
  }
}

export const faviconBadgeService = FaviconBadgeService.getInstance()
