import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { notificationService } from '../services/notificationService'
import type { Notification } from '../types/notification'

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Subscribe to notification updates
    const unsubscribe = notificationService.subscribe((newNotifications) => {
      setNotifications(newNotifications)
      setUnreadCount(notificationService.getUnreadCount())
    })

    // Initial load
    setNotifications(notificationService.getNotifications())
    setUnreadCount(notificationService.getUnreadCount())

    return unsubscribe
  }, [])

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleNotificationClick = (notification: Notification) => {
    notificationService.markAsRead(notification.id)
    if (notification.actionUrl) {
      setIsOpen(false)
    }
  }

  const handleMarkAllRead = () => {
    notificationService.markAllAsRead()
  }

  const handleClearAll = () => {
    notificationService.clearAll()
    setIsOpen(false)
  }

  const groupedNotifications = notificationService.getGroupedNotifications()

  const getRelativeTime = (timestamp: Date) => {
    const now = new Date()
    const diff = now.getTime() - timestamp.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getNotificationIcon = (notification: Notification) => {
    return notification.icon || '🔔'
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80"
        aria-label="Notifications"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          className="fill-white/70 hover:fill-white transition-colors"
        >
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="fixed sm:absolute inset-x-4 sm:inset-x-auto sm:right-0 sm:left-auto top-16 sm:top-auto sm:mt-2 w-auto sm:w-96 bg-surface-1 border border-gray-800 rounded-lg shadow-2xl z-50 max-h-[60vh] sm:max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-semibold text-white">Notifications</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-violet-soft hover:text-violet-soft transition-colors"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-muted hover:text-muted transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-3 sm:px-4 py-6 sm:py-8 text-center">
                <div className="text-4xl mb-2">🔔</div>
                <p className="text-muted">No notifications yet</p>
                <p className="text-xs text-muted mt-1">
                  We'll notify you when something happens
                </p>
              </div>
            ) : (
              <div className="py-2">
                {groupedNotifications.map((group) => (
                  <div key={group.date}>
                    <div className="px-3 sm:px-4 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
                      {group.date}
                    </div>
                    {group.notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`px-3 sm:px-4 py-2 sm:py-3 hover:bg-surface-1 transition-colors cursor-pointer border-l-2 ${
                          notification.read
                            ? 'border-transparent'
                            : 'border-violet bg-blue-900/10'
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex gap-3">
                          {/* Icon */}
                          <div className="flex-shrink-0 text-2xl">
                            {getNotificationIcon(notification)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p
                                  className={`text-sm font-medium ${
                                    notification.read ? 'text-muted' : 'text-white'
                                  }`}
                                >
                                  {notification.title}
                                </p>
                                <p className="text-xs text-muted mt-0.5">
                                  {notification.message}
                                </p>

                                {/* Action Button */}
                                {notification.actionUrl && (
                                  <Link
                                    to={notification.actionUrl}
                                    className="inline-block mt-2 px-3 py-1 bg-violet hover:bg-violet text-white text-xs rounded transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {notification.actionLabel || 'View'}
                                  </Link>
                                )}
                              </div>

                              {/* Time and Actions */}
                              <div className="flex items-center gap-2 ml-2">
                                <span className="text-xs text-muted">
                                  {getRelativeTime(notification.timestamp)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    notificationService.deleteNotification(notification.id)
                                  }}
                                  className="text-muted hover:text-red-400 transition-colors"
                                  aria-label="Delete notification"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    className="fill-current"
                                  >
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-gray-800">
              <Link
                to="/notifications"
                className="text-sm text-violet-soft hover:text-violet-soft transition-colors text-center block"
                onClick={() => setIsOpen(false)}
              >
                View all notifications →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
