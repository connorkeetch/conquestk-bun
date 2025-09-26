import { Bell, Loader2, MessageSquare, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import MessageInput from '@/components/chat/MessageInput'
import MessageList, { type DisplayMessage } from '@/components/chat/MessageList'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { notificationService } from '@/services/notificationService'
import profileService from '@/services/profileService'
import { socketService } from '@/services/socketService'
import {
  loadConversationMessages,
  loadInbox,
  loadUnreadSummary,
  messagesActions,
  refreshConversation,
  selectActiveConversationId,
  selectAllConversations,
  selectConversationById,
  selectMessagesForConversation,
  selectMessagesInboxError,
  selectMessagesInboxLoading,
  selectTotalUnreadMessages,
} from '@/store/messagesSlice'
import type { Notification } from '@/types/notification'

interface InboxDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_TITLES: Record<string, string> = {
  direct: 'Direct Message',
  group: 'Group Conversation',
  game: 'Game Conversation',
}

const formatRelativeTime = (timestamp: string | Date) => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function InboxDrawer({ isOpen, onClose }: InboxDrawerProps) {
  const dispatch = useAppDispatch()

  // Messages state (reusing messages slice)
  const conversations = useAppSelector(selectAllConversations)
  const activeConversationId = useAppSelector(selectActiveConversationId)
  const inboxLoading = useAppSelector(selectMessagesInboxLoading)
  const inboxError = useAppSelector(selectMessagesInboxError)
  const _totalUnreadMessages = useAppSelector(selectTotalUnreadMessages)
  const messagesByConversation = useAppSelector((s) => s.messages.messages)
  const loadingMessagesMap = useAppSelector((s) => s.messages.loadingMessages)
  const hasMoreMap = useAppSelector((s) => s.messages.hasMore)
  const currentUserId = useAppSelector((s) => s.auth.user?.id ?? null)

  const [sendError, setSendError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [newUsername, setNewUsername] = useState('')
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const newConversationInputId = useId()

  const drawerRef = useRef<HTMLDivElement>(null)

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0)

  // Active tab: messages vs notifications
  const [tab, setTab] = useState<'messages' | 'notifications'>('messages')

  useEffect(() => {
    if (!isOpen) return
    if (!inboxLoading && conversations.length === 0) {
      dispatch(loadInbox())
    }
    dispatch(loadUnreadSummary())
  }, [isOpen, inboxLoading, conversations.length, dispatch])

  useEffect(() => {
    if (!isOpen) return
    const unsub = notificationService.subscribe((list) => {
      setNotifications(list)
      setUnreadNotifications(notificationService.getUnreadCount())
    })
    // initial
    setNotifications(notificationService.getNotifications())
    setUnreadNotifications(notificationService.getUnreadCount())
    return unsub
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const sortedConversations = useMemo(() => {
    return [...conversations].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  }, [conversations])

  const filteredConversations = useMemo(() => {
    return filter === 'unread'
      ? sortedConversations.filter((c) => (c.unreadCount ?? 0) > 0)
      : sortedConversations
  }, [sortedConversations, filter])

  const activeConversation = useAppSelector((s) =>
    activeConversationId ? selectConversationById(s, activeConversationId) : undefined,
  )
  const activeMessages = useAppSelector((s) =>
    activeConversationId ? selectMessagesForConversation(s, activeConversationId) : [],
  )
  const typingUsers = useAppSelector((s) =>
    activeConversationId ? Object.values(s.messages.typing[activeConversationId] ?? {}) : [],
  )

  const hasMore = activeConversationId ? (hasMoreMap[activeConversationId] ?? true) : false
  const isThreadLoading = activeConversationId
    ? Boolean(loadingMessagesMap[activeConversationId])
    : false

  useEffect(() => {
    if (!isOpen || !activeConversationId) return
    if ((messagesByConversation[activeConversationId] ?? []).length === 0) return
    socketService.markConversationReadViaSocket(activeConversationId)
  }, [isOpen, activeConversationId, messagesByConversation])

  useEffect(() => {
    if (!isOpen) return
    if (!activeConversationId && sortedConversations.length > 0) {
      dispatch(messagesActions.setActiveConversationId(sortedConversations[0].id))
    }
  }, [isOpen, sortedConversations, activeConversationId, dispatch])

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      dispatch(messagesActions.setActiveConversationId(conversationId))
      setSendError(null)
      const existing = messagesByConversation[conversationId]
      if (!existing || existing.length === 0) {
        dispatch(loadConversationMessages({ conversationId, limit: 50 }))
      }
      dispatch(refreshConversation(conversationId))
      socketService.markConversationReadViaSocket(conversationId)
    },
    [dispatch, messagesByConversation],
  )

  const handleLoadOlder = useCallback(() => {
    if (!activeConversationId) return
    const existing = messagesByConversation[activeConversationId] ?? []
    if (existing.length === 0) {
      dispatch(loadConversationMessages({ conversationId: activeConversationId, limit: 50 }))
      return
    }
    const oldest = existing[0]
    dispatch(
      loadConversationMessages({
        conversationId: activeConversationId,
        before: oldest.id,
        limit: 50,
      }),
    )
  }, [activeConversationId, dispatch, messagesByConversation])

  const displayMessages: DisplayMessage[] = useMemo(() => {
    return activeMessages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName:
        m.senderId === currentUserId
          ? 'You'
          : typeof m.metadata?.senderName === 'string'
            ? (m.metadata.senderName as string)
            : (m.senderId ?? undefined),
      body: m.body,
      createdAt: m.createdAt,
      metadata: m.metadata,
    }))
  }, [activeMessages, currentUserId])

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!activeConversationId) return
      socketService.sendConversationMessage(
        { conversationId: activeConversationId, body: text },
        (ack) => {
          if (!ack?.ok && ack?.error) setSendError(ack.error)
          else setSendError(null)
        },
      )
    },
    [activeConversationId],
  )

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!activeConversationId) return
      if (isTyping) socketService.startConversationTyping(activeConversationId)
      else socketService.stopConversationTyping(activeConversationId)
    },
    [activeConversationId],
  )

  const handleCreateConversation = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault()
      const username = newUsername.trim()
      if (!username || isCreatingConversation) return
      try {
        setIsCreatingConversation(true)
        setCreateError(null)
        const profile = await profileService.getProfileByUsername(username)
        const targetUserId = profile.id
        socketService.createConversation({ kind: 'direct', targetUserId }, (ack) => {
          if (!ack?.ok || !ack.conversation) {
            setCreateError(ack?.error ?? 'Unable to start conversation')
            setIsCreatingConversation(false)
            return
          }
          const conversationId = ack.conversation.id
          dispatch(messagesActions.setActiveConversationId(conversationId))
          dispatch(refreshConversation(conversationId))
          dispatch(loadInbox())
          socketService.markConversationReadViaSocket(conversationId)
          setNewUsername('')
          setIsCreatingConversation(false)
          setFilter('all')
        })
      } catch {
        setCreateError('Failed to start conversation')
        setIsCreatingConversation(false)
      }
    },
    [newUsername, isCreatingConversation, dispatch],
  )

  const conversationTitle = useMemo(() => {
    if (!activeConversation) return 'Messages'
    const metadataTitle =
      typeof activeConversation.metadata?.displayName === 'string'
        ? activeConversation.metadata.displayName
        : undefined
    return (
      activeConversation.title ||
      metadataTitle ||
      DEFAULT_TITLES[activeConversation.kind] ||
      'Conversation'
    )
  }, [activeConversation])

  const markAllNotificationsRead = () => notificationService.markAllAsRead()
  const clearAllNotifications = () => notificationService.clearAll()
  const handleNotificationClick = (n: Notification) => {
    notificationService.markAsRead(n.id)
    if (n.actionUrl) {
      // Use location change via link in header; we cannot use useNavigate here cleanly in a drawer without router context reset
      window.location.href = n.actionUrl
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[70] transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close inbox"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className={`absolute right-0 top-0 h-full w-full sm:w-[640px] md:w-[720px] xl:w-[840px] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full modal flex flex-col">
          <header className="modal-header flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-[color:var(--heading)]">Inbox</h2>
              <div className="segmented-control">
                <button
                  type="button"
                  onClick={() => setTab('messages')}
                  className={tab === 'messages' ? 'segmented-active' : ''}
                >
                  <MessageSquare className="inline-block mr-1 h-4 w-4" /> Messages
                </button>
                <button
                  type="button"
                  onClick={() => setTab('notifications')}
                  className={tab === 'notifications' ? 'segmented-active' : ''}
                >
                  <Bell className="inline-block mr-1 h-4 w-4" /> Notifications
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost btn-icon"
              aria-label="Close inbox"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {tab === 'messages' ? (
            <div className="flex flex-1 min-h-0">
              <aside className="hidden sm:flex sm:flex-col sm:w-80 border-r border-[color:var(--panel-border)]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--panel-border)] text-xs uppercase tracking-wide text-muted">
                  <span>Conversations</span>
                  <div className="inline-flex items-center gap-0.5 rounded-full bg-[color:var(--panel-bg-alt)] p-0.5">
                    <button
                      type="button"
                      className={`px-2 py-0.5 text-[10px] rounded-full transition ${
                        filter === 'all'
                          ? 'bg-[color:var(--color-primary)] text-white'
                          : 'text-muted'
                      }`}
                      onClick={() => setFilter('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 text-[10px] rounded-full transition ${
                        filter === 'unread'
                          ? 'bg-[color:var(--color-primary)] text-white'
                          : 'text-muted'
                      }`}
                      onClick={() => setFilter('unread')}
                    >
                      Unread
                    </button>
                  </div>
                </div>
                <div className="px-3 py-3 border-b border-[color:var(--panel-border)]">
                  <form onSubmit={handleCreateConversation} className="space-y-2">
                    <label
                      htmlFor={newConversationInputId}
                      className="text-[11px] uppercase tracking-wide text-muted block"
                    >
                      Start new conversation
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={newConversationInputId}
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        className="form-input"
                        placeholder="Username"
                      />
                      <button
                        type="submit"
                        className="btn-primary btn-sm"
                        disabled={isCreatingConversation}
                      >
                        {isCreatingConversation ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Start'
                        )}
                      </button>
                    </div>
                    {createError && (
                      <div className="text-[11px] text-[color:var(--color-danger)]">
                        {createError}
                      </div>
                    )}
                  </form>
                </div>

                {inboxLoading ? (
                  <div className="flex-1 flex items-center justify-center text-muted text-sm">
                    Loading…
                  </div>
                ) : inboxError ? (
                  <div className="flex-1 flex items-center justify-center text-[color:var(--color-danger)] text-sm">
                    {inboxError}
                  </div>
                ) : (
                  <ul className="flex-1 overflow-y-auto">
                    {filteredConversations.map((conversation) => {
                      const isActive = conversation.id === activeConversationId
                      const unread = conversation.unreadCount ?? 0
                      const subtitle = conversation.lastMessage?.body ?? 'No messages yet'
                      const title =
                        conversation.title ||
                        (typeof conversation.metadata?.displayName === 'string'
                          ? conversation.metadata.displayName
                          : undefined) ||
                        DEFAULT_TITLES[conversation.kind] ||
                        'Conversation'
                      return (
                        <li key={conversation.id}>
                          <button
                            type="button"
                            className={`w-full text-left px-4 py-3 transition-colors ${
                              isActive
                                ? 'bg-[color:var(--panel-bg-alt)]'
                                : 'hover:bg-[color:var(--hover-bg)]'
                            }`}
                            onClick={() => handleSelectConversation(conversation.id)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p
                                  className={`text-sm font-medium ${isActive ? 'text-[color:var(--heading)]' : 'text-[color:var(--text)]'}`}
                                >
                                  {title}
                                </p>
                                <p className="text-xs text-muted truncate">{subtitle}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] uppercase tracking-wide text-muted">
                                  {formatRelativeTime(conversation.updatedAt)}
                                </span>
                                {unread > 0 && <span className="badge">{unread}</span>}
                              </div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </aside>

              <section className="flex-1 flex flex-col min-w-0">
                {activeConversation ? (
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--panel-border)]">
                      <div>
                        <h3 className="text-base font-semibold text-[color:var(--heading)]">
                          {conversationTitle}
                        </h3>
                        <p className="text-xs text-muted">
                          {activeConversation.kind === 'direct'
                            ? 'Direct conversation'
                            : activeConversation.kind === 'group'
                              ? 'Group conversation'
                              : 'Game chat'}
                        </p>
                      </div>
                      {activeConversation.unreadCount > 0 && (
                        <span className="badge">{activeConversation.unreadCount} unread</span>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {hasMore && (
                        <div className="text-center">
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={handleLoadOlder}
                            disabled={isThreadLoading}
                          >
                            {isThreadLoading ? 'Loading…' : 'Load earlier messages'}
                          </button>
                        </div>
                      )}

                      {displayMessages.length === 0 && !isThreadLoading ? (
                        <div className="text-center text-muted py-6 text-sm">No messages yet.</div>
                      ) : (
                        <MessageList messages={displayMessages} currentUserId={currentUserId} />
                      )}

                      {typingUsers.length > 0 && (
                        <div className="text-sm text-muted italic">
                          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
                        </div>
                      )}
                    </div>

                    <div className="border-t border-[color:var(--panel-border)]">
                      {sendError && (
                        <div className="px-4 pt-3 text-sm text-[color:var(--color-danger)]">
                          {sendError}
                        </div>
                      )}
                      {activeConversation.isReadOnly ? (
                        <div className="px-4 py-3 text-sm text-muted">
                          This conversation is read-only.
                        </div>
                      ) : (
                        <MessageInput
                          onSendMessage={handleSendMessage}
                          onTyping={handleTyping}
                          placeholder="Send a message…"
                          maxLength={2000}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted">
                    Select a conversation to view messages.
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--panel-border)]">
                <div>
                  <h3 className="text-base font-semibold text-[color:var(--heading)]">
                    Notifications
                  </h3>
                  <p className="text-xs text-muted">
                    {unreadNotifications > 0 ? `${unreadNotifications} unread` : 'All caught up'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {unreadNotifications > 0 && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={markAllNotificationsRead}
                    >
                      Mark all read
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={clearAllNotifications}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
              {notifications.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <div className="text-4xl mb-2">🔔</div>
                  <p className="text-sm text-muted">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-[color:var(--panel-border)]">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 ${n.read ? '' : 'bg-[color:var(--hover-bg)]'}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{n.icon || '🔔'}</span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium ${n.read ? 'text-muted' : 'text-[color:var(--heading)]'}`}
                          >
                            {n.title}
                          </p>
                          <p className="text-xs text-muted mt-0.5 truncate">{n.message}</p>
                          {n.actionUrl && (
                            <button
                              type="button"
                              className="btn-primary btn-sm mt-2"
                              onClick={() => handleNotificationClick(n)}
                            >
                              {n.actionLabel || 'View'}
                            </button>
                          )}
                        </div>
                        <span className="text-xs text-muted whitespace-nowrap">
                          {formatRelativeTime(n.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
