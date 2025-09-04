import { useEffect } from 'react'
import { faviconBadgeService } from '../services/faviconBadgeService'

/**
 * Hook to initialize and manage the favicon badge service
 * Should be used once at the app root level
 */
export const useFaviconBadge = () => {
  useEffect(() => {
    // Service initializes itself and subscribes to notifications
    // Just ensure it's created
    faviconBadgeService

    // Optional: Clear badge when window gains focus
    const handleFocus = () => {
      // When user focuses the window, mark turn notifications as read
      const notifications = notificationService.getNotifications()
      notifications
        .filter((n) => n.type === 'turn_reminder' && !n.read)
        .forEach((n) => notificationService.markAsRead(n.id))
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [])
}

// Import notification service for marking as read
import { notificationService } from '../services/notificationService'