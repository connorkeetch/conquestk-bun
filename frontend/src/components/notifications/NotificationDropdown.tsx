import { Bell, MessageSquare } from 'lucide-react'
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react'
import { notificationService } from '@/services/notificationService'
import { ratingChangeModalService } from '@/services/ratingChangeModalService'
import type { Notification } from '@/types/notification'

interface NotificationDropdownProps {
  isOpen: boolean
  onClose: () => void
  onOpenMessages: () => void
  // Optional: treat clicks on the trigger as inside, to support toggle-close
  triggerRef?: RefObject<HTMLElement | null>
}

const formatRelativeTime = (date: Date) => {
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NotificationDropdown({
  isOpen,
  onClose,
  onOpenMessages,
  triggerRef,
}: NotificationDropdownProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = notificationService.subscribe((list) => {
      setNotifications(list)
      setUnread(notificationService.getUnreadCount())
    })
    // initialize
    setNotifications(notificationService.getNotifications())
    setUnread(notificationService.getUnreadCount())
    return unsub
  }, [])

  const onEscape = useEffectEvent(() => {
    onClose()
  })
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onEscape])

  const onOutside = useEffectEvent(() => {
    onClose()
  })
  useEffect(() => {
    if (!isOpen) return
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      const target = e.target as Node
      const clickedInsidePanel = containerRef.current.contains(target)
      const clickedOnTrigger = triggerRef?.current?.contains(target) ?? false
      if (!clickedInsidePanel && !clickedOnTrigger) {
        onOutside()
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [isOpen, triggerRef, onOutside])

  // Do not auto-mark as read on open; users can mark per-item or use the button

  const handleNotificationClick = (n: Notification) => {
    notificationService.markAsRead(n.id)
    if (n.type === 'rank_update') {
      const meta = (n.metadata ?? {}) as Record<string, unknown>
      const change = Number(meta.change)
      if (Number.isFinite(change)) {
        const payload: Parameters<typeof ratingChangeModalService.open>[0] = {
          change: Math.trunc(change as number),
        }
        if (typeof meta.oldRating === 'number') payload.oldRating = meta.oldRating
        if (typeof meta.newRating === 'number') payload.newRating = meta.newRating
        if (typeof meta.oldRank === 'string') payload.oldRank = meta.oldRank
        if (typeof meta.newRank === 'string') payload.newRank = meta.newRank
        ratingChangeModalService.open(payload)
      }
      // Auto-close the dropdown when opening the rating change overlay
      onClose()
      return
    }
    if (n.actionUrl) {
      window.location.href = n.actionUrl
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      {/* Dropdown panel */}
      <div
        ref={containerRef}
        className="pointer-events-auto absolute right-2 top-16 w-[360px] max-h-[70vh] overflow-hidden rounded-lg shadow-2xl border border-[color:var(--modal-border)] bg-[color:var(--modal-bg)]"
      >
        <div className="px-4 py-3 border-b border-[color:var(--panel-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted" />
            <h3 className="text-sm font-semibold text-[color:var(--heading)]">Notifications</h3>
            {unread > 0 && (
              <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] bg-[color:var(--color-primary)] text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                type="button"
                className="btn-secondary btn-xs"
                onClick={() => notificationService.markAllAsRead()}
                title="Mark all as read"
              >
                Mark all
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                className="btn-outline btn-xs"
                onClick={() => notificationService.clearAll()}
                title="Clear all notifications"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">No notifications yet</div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-[color:var(--panel-border)]">
            {notifications.slice(0, 12).map((n) => (
              <div key={n.id} className="relative">
                <button
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-[color:var(--hover-bg)] transition ${
                    n.read
                      ? 'opacity-80'
                      : 'bg-[color:var(--panel-bg-alt)] border-l-2 border-[color:var(--color-primary)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl leading-none">{n.icon || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          n.read ? 'text-muted' : 'text-[color:var(--heading)]'
                        } truncate`}
                      >
                        {n.title}
                      </p>
                      <p className="text-xs text-muted truncate">{n.message}</p>
                    </div>
                    <span className="text-[10px] text-muted whitespace-nowrap">
                      {formatRelativeTime(n.timestamp)}
                    </span>
                  </div>
                </button>
                {/* Per-notification delete (X) button */}
                <button
                  type="button"
                  aria-label="Delete notification"
                  className="absolute top-2 right-2 text-muted hover:text-[color:var(--heading)]"
                  onClick={(e) => {
                    e.stopPropagation()
                    notificationService.deleteNotification(n.id)
                  }}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-3 border-t border-[color:var(--panel-border)] flex items-center justify-end">
          <button
            type="button"
            className="btn-primary btn-sm inline-flex items-center gap-1"
            onClick={() => {
              onClose()
              onOpenMessages()
            }}
            title="Open messages"
          >
            <MessageSquare className="h-4 w-4" />
            Open Messages
          </button>
        </div>
      </div>
    </div>
  )
}
