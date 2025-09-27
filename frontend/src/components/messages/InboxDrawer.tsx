import { Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import MessageInput from '@/components/chat/MessageInput'
import MessageList, { type DisplayMessage } from '@/components/chat/MessageList'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import friendsService, { type FriendSummary } from '@/services/friendsService'
import { searchUsers, type UserSearchResult } from '@/services/profileService'
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
} from '@/store/messagesSlice'

interface InboxDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_TITLES: Record<string, string> = {
  direct: 'Direct Message',
  group: 'Group Conversation',
  game: 'Game Conversation',
}

type ConversationItem = ReturnType<typeof selectAllConversations>[number]

interface ConversationSection {
  key: 'game' | 'team' | 'direct' | 'group'
  label: string
  icon: string
  conversations: ConversationItem[]
}

const getConversationTitle = (conversation: ConversationItem): string =>
  conversation.title ||
  (typeof conversation.metadata?.displayName === 'string'
    ? conversation.metadata.displayName
    : undefined) ||
  DEFAULT_TITLES[conversation.kind] ||
  'Conversation'

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

  // Messages state
  const conversations = useAppSelector(selectAllConversations)
  const activeConversationId = useAppSelector(selectActiveConversationId)
  const inboxLoading = useAppSelector(selectMessagesInboxLoading)
  const inboxError = useAppSelector(selectMessagesInboxError)
  const messagesByConversation = useAppSelector((s) => s.messages.messages)
  const loadingMessagesMap = useAppSelector((s) => s.messages.loadingMessages)
  const hasMoreMap = useAppSelector((s) => s.messages.hasMore)
  const currentUserId = useAppSelector((s) => s.auth.user?.id ?? null)
  const unreadSummaryFetched = useAppSelector((s) => s.messages.unreadSummaryFetched)

  // Local UI state
  const [sendError, setSendError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [friendStartError, setFriendStartError] = useState<string | null>(null)
  const [friendActionMessage, setFriendActionMessage] = useState<string | null>(null)
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [friendsError, setFriendsError] = useState<string | null>(null)
  const [requestedUserIds, setRequestedUserIds] = useState<Record<string, boolean>>({})
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const searchInputId = useId()
  const mobileThreadSelectId = useId()

  const drawerRef = useRef<HTMLDivElement>(null)
  const friendsLoadedRef = useRef(false)

  // Fetch once per open
  const fetchedOnOpenRef = useRef(false)
  useEffect(() => {
    if (!isOpen) {
      fetchedOnOpenRef.current = false
      friendsLoadedRef.current = false
      return
    }
    if (!fetchedOnOpenRef.current) {
      dispatch(loadInbox())
      if (!unreadSummaryFetched) dispatch(loadUnreadSummary())
      fetchedOnOpenRef.current = true
    }
  }, [isOpen, dispatch, unreadSummaryFetched])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    if (friendsLoadedRef.current) {
      return
    }

    let cancelled = false
    const loadFriends = async () => {
      try {
        setFriendsLoading(true)
        setFriendsError(null)
        const friendList = await friendsService.listFriends()
        if (!cancelled) {
          setFriends(friendList)
        }
      } catch (_error) {
        if (!cancelled) {
          setFriendsError('Failed to load friends')
        }
      } finally {
        if (!cancelled) {
          setFriendsLoading(false)
        }
      }
    }

    friendsLoadedRef.current = true
    void loadFriends()

    return () => {
      cancelled = true
    }
  }, [isOpen])

  // Debounced user search
  useEffect(() => {
    if (!isOpen) return
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    setSearchError(null)
    setFriendActionMessage(null)
    const ctrl = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const results = await searchUsers(q, 10, { signal: ctrl.signal })
        const filtered = currentUserId ? results.filter((u) => u.id !== currentUserId) : results
        setSearchResults(filtered)
      } catch (_e) {
        if (!ctrl.signal.aborted) setSearchError('Failed to search users')
      } finally {
        if (!ctrl.signal.aborted) setSearchLoading(false)
      }
    }, 250)
    return () => {
      ctrl.abort()
      clearTimeout(timeout)
      setSearchLoading(false)
    }
  }, [searchQuery, isOpen, currentUserId])

  // Close on ESC
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

  const visibleConversations = useMemo(() => {
    // Only show direct and group conversations in the Inbox
    let base = sortedConversations.filter((c) => c.kind === 'direct' || c.kind === 'group')
    if (filter === 'unread') {
      base = base.filter((c) => !c.isArchived && (c.unreadCount ?? 0) > 0)
    } else if (filter === 'all') {
      base = base.filter((c) => !c.isArchived)
    } else if (filter === 'archived') {
      base = base.filter((c) => c.isArchived)
    }
    if (!currentUserId) {
      return base
    }
    return base.filter((conversation) => conversation.memberIds.includes(currentUserId))
  }, [sortedConversations, filter, currentUserId])

  const conversationSections = useMemo<ConversationSection[]>(() => {
    const sections: ConversationSection[] = [
      { key: 'direct', label: 'Direct Messages', icon: '💬', conversations: [] },
      { key: 'group', label: 'Group Chats', icon: '🗂️', conversations: [] },
    ]

    for (const conversation of visibleConversations) {
      const targetSection = sections.find((section) => section.key === conversation.kind)
      if (targetSection) {
        targetSection.conversations.push(conversation)
      }
    }

    return sections.filter((section) => section.conversations.length > 0)
  }, [visibleConversations])

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

  // Mark read when visible and we have messages
  useEffect(() => {
    if (!isOpen || !activeConversationId) return
    if ((messagesByConversation[activeConversationId] ?? []).length === 0) return
    dispatch(messagesActions.markReadOptimistic(activeConversationId))
    socketService.markConversationReadViaSocket(activeConversationId)
  }, [dispatch, isOpen, activeConversationId, messagesByConversation])

  // Auto-select first conversation on open
  useEffect(() => {
    if (!isOpen) return
    if (!activeConversationId && visibleConversations.length > 0) {
      dispatch(messagesActions.setActiveConversationId(visibleConversations[0].id))
    }
  }, [isOpen, visibleConversations, activeConversationId, dispatch])

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      dispatch(messagesActions.setActiveConversationId(conversationId))
      setSendError(null)
      setDeleteError(null)
      const existing = messagesByConversation[conversationId]
      if (!existing || existing.length === 0) {
        dispatch(loadConversationMessages({ conversationId, limit: 50 }))
      }
      dispatch(refreshConversation(conversationId))
      dispatch(messagesActions.markReadOptimistic(conversationId))
      socketService.markConversationReadViaSocket(conversationId)
    },
    [dispatch, messagesByConversation],
  )

  const startDirectConversation = useCallback(
    (targetUserId: string) =>
      new Promise<string>((resolve, reject) => {
        socketService.createConversation({ kind: 'direct', targetUserId }, (ack) => {
          if (!ack?.ok || !ack.conversation) {
            reject(new Error(ack?.error ?? 'Unable to start conversation'))
            return
          }
          const conversationId = ack.conversation.id
          dispatch(messagesActions.setActiveConversationId(conversationId))
          dispatch(refreshConversation(conversationId))
          dispatch(loadInbox())
          socketService.markConversationReadViaSocket(conversationId)
          resolve(conversationId)
        })
      }),
    [dispatch],
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

  const handleAddFriend = useCallback(async (userId: string) => {
    try {
      setFriendStartError(null)
      setFriendActionMessage(null)
      await friendsService.sendRequest(userId)
      setRequestedUserIds((prev) => ({ ...prev, [userId]: true }))
    } catch (error) {
      setFriendStartError(error instanceof Error ? error.message : 'Failed to send request')
    }
  }, [])

  const handleStartFriendConversation = useCallback(
    async (friend: FriendSummary) => {
      try {
        setFriendStartError(null)
        await startDirectConversation(friend.userId)
        setFilter('all')
      } catch (error) {
        setFriendStartError(error instanceof Error ? error.message : 'Unable to message friend')
      }
    },
    [startDirectConversation],
  )

  const handleArchiveConversation = useCallback(
    async (conversation: ConversationItem) => {
      try {
        setDeleteError(null)
        setDeletingConversationId(conversation.id)
        // Archive this thread on the server (applies to direct/group)
        await new Promise<void>((resolve, reject) => {
          socketService.archiveConversation(conversation.id, (ack) => {
            if (!ack?.ok) return reject(new Error(ack?.error ?? 'Failed to archive'))
            resolve()
          })
        })
        // Refresh inbox; also expect conversation.updated event to arrive
        dispatch(loadInbox())
      } catch (error) {
        setDeleteError(error instanceof Error ? error.message : 'Failed to archive conversation')
      } finally {
        setDeletingConversationId(null)
      }
    },
    [dispatch],
  )

  const conversationTitle = useMemo(() => {
    if (!activeConversation) return 'Messages'
    return getConversationTitle(activeConversation)
  }, [activeConversation])

  const activeConversationDescriptor = useMemo(() => {
    if (!activeConversation) {
      return null
    }
    switch (activeConversation.kind) {
      case 'direct':
        return { icon: '💬', label: 'Direct message' }
      case 'group':
        return { icon: '🗂️', label: 'Group chat' }
      case 'team': {
        const teamId = activeConversation.metadata?.teamId
        const teamLabel = typeof teamId === 'number' ? `Team ${teamId}` : 'Team chat'
        return { icon: '👥', label: teamLabel }
      }
      case 'game': {
        const gameLabel = activeConversation.gameId
          ? `Game ${activeConversation.gameId}`
          : 'Game thread'
        return { icon: '🎮', label: gameLabel }
      }
      default:
        return { icon: '💬', label: 'Conversation' }
    }
  }, [activeConversation])

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
            <h2 className="text-lg font-semibold text-[color:var(--heading)]">Messages</h2>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost btn-icon"
              aria-label="Close inbox"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex flex-1 min-h-0">
            <aside className="hidden sm:flex sm:flex-col sm:w-80 border-r border-[color:var(--panel-border)]">
              <div className="flex items-center justify-end px-3 py-2 border-b border-[color:var(--panel-border)] text-xs uppercase tracking-wide text-muted">
                <div className="inline-flex items-center gap-0.5 rounded-full bg-[color:var(--panel-bg-alt)] p-0.5">
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-[10px] rounded-full transition ${filter === 'all' ? 'bg-[color:var(--color-primary)] text-white' : 'text-muted'}`}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-[10px] rounded-full transition ${filter === 'unread' ? 'bg-[color:var(--color-primary)] text-white' : 'text-muted'}`}
                    onClick={() => setFilter('unread')}
                  >
                    Unread
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-[10px] rounded-full transition ${filter === 'archived' ? 'bg-[color:var(--color-primary)] text-white' : 'text-muted'}`}
                    onClick={() => setFilter('archived')}
                  >
                    Archived
                  </button>
                </div>
              </div>

              <div className="px-3 py-3 border-b border-[color:var(--panel-border)]">
                <div className="space-y-2">
                  <label
                    htmlFor={searchInputId}
                    className="text-[11px] uppercase tracking-wide text-muted block"
                  >
                    Start a new chat
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={searchInputId}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="form-input"
                      placeholder="Search users…"
                      autoComplete="off"
                    />
                    {searchLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                  {searchError && (
                    <div className="text-[11px] text-[color:var(--color-danger)]">
                      {searchError}
                    </div>
                  )}
                  {friendActionMessage && (
                    <div className="text-[11px] text-[color:var(--color-success, #22c55e)]">
                      {friendActionMessage}
                    </div>
                  )}
                  {searchQuery.trim().length >= 2 && (
                    <div className="max-h-48 overflow-y-auto rounded-md border border-[color:var(--panel-border)]">
                      {searchResults.length === 0 && !searchLoading ? (
                        <div className="px-3 py-2 text-xs text-muted">No users found</div>
                      ) : (
                        <ul className="divide-y divide-[color:var(--panel-border)]">
                          {searchResults.map((user) => (
                            <li
                              key={user.id}
                              className="px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <span className="text-sm">{user.username}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="btn-outline btn-xs"
                                  onClick={() => {
                                    void startDirectConversation(user.id)
                                    setSearchQuery('')
                                    setSearchResults([])
                                  }}
                                >
                                  Message
                                </button>
                                {requestedUserIds[user.id] ? (
                                  <span className="text-[11px] text-muted">Requested</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-ghost btn-xs"
                                    onClick={() => void handleAddFriend(user.id)}
                                  >
                                    Add friend
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {searchQuery.trim().length < 2 && (
                    <div className="text-[11px] text-muted">
                      Type at least 2 characters to search
                    </div>
                  )}
                </div>
                <div className="pt-3 mt-3 border-t border-[color:var(--panel-border)]">
                  <p className="text-[11px] uppercase tracking-wide text-muted mb-2">
                    Message a friend
                  </p>
                  {friendsLoading ? (
                    <p className="text-xs text-muted">Loading friends…</p>
                  ) : friendsError ? (
                    <p className="text-xs text-[color:var(--color-danger)]">{friendsError}</p>
                  ) : friends.length === 0 ? (
                    <p className="text-xs text-muted">No friends yet</p>
                  ) : (
                    <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {friends.map((friend) => (
                        <li key={friend.userId}>
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1 rounded-md text-sm transition hover:bg-[color:var(--hover-bg)]"
                            onClick={() => handleStartFriendConversation(friend)}
                          >
                            {friend.username}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {friendStartError && (
                    <p className="mt-2 text-[11px] text-[color:var(--color-danger)]">
                      {friendStartError}
                    </p>
                  )}
                </div>
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
                <div className="flex-1 overflow-y-auto">
                  {conversationSections.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted">
                      No conversations yet.
                    </div>
                  ) : (
                    conversationSections.map((section) => (
                      <div key={section.key}>
                        <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted flex items-center gap-2">
                          <span>{section.icon}</span>
                          <span>{section.label}</span>
                        </div>
                        <ul>
                          {section.conversations.map((conversation) => {
                            const isActive = conversation.id === activeConversationId
                            const unread = conversation.unreadCount ?? 0
                            const subtitle = conversation.lastMessage?.body ?? 'No messages yet'
                            const title = getConversationTitle(conversation)
                            const contextLabel =
                              conversation.kind === 'team'
                                ? conversation.metadata?.teamId !== undefined
                                  ? `Team ${conversation.metadata.teamId}`
                                  : 'Team chat'
                                : conversation.kind === 'game'
                                  ? conversation.gameId
                                    ? `Game ${conversation.gameId}`
                                    : 'Game thread'
                                  : conversation.kind === 'direct'
                                    ? 'Direct message'
                                    : 'Group chat'
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
                                    <div className="space-y-1">
                                      <p
                                        className={`text-sm font-medium ${
                                          isActive
                                            ? 'text-[color:var(--heading)]'
                                            : 'text-[color:var(--text)]'
                                        }`}
                                      >
                                        {title}
                                      </p>
                                      <div className="text-[10px] uppercase tracking-wide text-muted flex items-center gap-1">
                                        <span>{section.icon}</span>
                                        <span>{contextLabel}</span>
                                      </div>
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
                      </div>
                    ))
                  )}
                </div>
              )}
            </aside>

            <section className="flex-1 flex flex-col min-w-0">
              <div className="sm:hidden border-b border-[color:var(--panel-border)] px-4 py-3 space-y-3">
                <div>
                  <label
                    htmlFor={mobileThreadSelectId}
                    className="text-[11px] uppercase tracking-wide text-muted block mb-1"
                  >
                    Thread
                  </label>
                  <select
                    id={mobileThreadSelectId}
                    className="form-select w-full"
                    value={activeConversationId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value) {
                        handleSelectConversation(value)
                      }
                    }}
                  >
                    <option value="">Select a thread…</option>
                    {conversationSections.map((section) => (
                      <optgroup key={section.key} label={`${section.icon} ${section.label}`}>
                        {section.conversations.map((conversation) => {
                          const title = getConversationTitle(conversation)
                          const unread = conversation.unreadCount ?? 0
                          return (
                            <option key={conversation.id} value={conversation.id}>
                              {title}
                              {unread > 0 ? ` (${unread})` : ''}
                            </option>
                          )
                        })}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={mobileThreadSelectId + '-search'}
                    className="text-[11px] uppercase tracking-wide text-muted block mb-1"
                  >
                    Start a new chat
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={mobileThreadSelectId + '-search'}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="form-input w-full"
                      placeholder="Search users…"
                      autoComplete="off"
                    />
                    {searchLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                  {searchError && (
                    <div className="text-[11px] text-[color:var(--color-danger)]">
                      {searchError}
                    </div>
                  )}
                  {searchQuery.trim().length >= 2 && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-[color:var(--panel-border)]">
                      {searchResults.length === 0 && !searchLoading ? (
                        <div className="px-3 py-2 text-xs text-muted">No users found</div>
                      ) : (
                        <ul className="divide-y divide-[color:var(--panel-border)]">
                          {searchResults.map((user) => (
                            <li
                              key={user.id}
                              className="px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <span className="text-sm">{user.username}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="btn-outline btn-xs"
                                  onClick={() => {
                                    void startDirectConversation(user.id)
                                    setSearchQuery('')
                                    setSearchResults([])
                                  }}
                                >
                                  Message
                                </button>
                                {requestedUserIds[user.id] ? (
                                  <span className="text-[11px] text-muted">Requested</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-ghost btn-xs"
                                    onClick={() => void handleAddFriend(user.id)}
                                  >
                                    Add friend
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Friends</p>
                  {friendsLoading ? (
                    <p className="text-xs text-muted">Loading friends…</p>
                  ) : friendsError ? (
                    <p className="text-xs text-[color:var(--color-danger)]">{friendsError}</p>
                  ) : friends.length === 0 ? (
                    <p className="text-xs text-muted">No friends yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {friends.map((friend) => (
                        <button
                          key={friend.userId}
                          type="button"
                          className="px-3 py-1 rounded-full text-xs bg-[color:var(--panel-bg-alt)] text-[color:var(--text)] hover:bg-[color:var(--hover-bg)] transition"
                          onClick={() => handleStartFriendConversation(friend)}
                        >
                          {friend.username}
                        </button>
                      ))}
                    </div>
                  )}
                  {friendStartError && (
                    <p className="mt-2 text-[11px] text-[color:var(--color-danger)]">
                      {friendStartError}
                    </p>
                  )}
                </div>
              </div>

              {activeConversation ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--panel-border)]">
                    <div>
                      <h3 className="text-base font-semibold text-[color:var(--heading)]">
                        {conversationTitle}
                      </h3>
                      {activeConversationDescriptor && (
                        <div className="mt-1 inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
                          <span>{activeConversationDescriptor.icon}</span>
                          <span>{activeConversationDescriptor.label}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {activeConversation.unreadCount > 0 && (
                        <span className="badge">{activeConversation.unreadCount} unread</span>
                      )}
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        onClick={() => handleArchiveConversation(activeConversation)}
                        disabled={deletingConversationId === activeConversation.id}
                        title="Archive this thread"
                      >
                        {deletingConversationId === activeConversation.id
                          ? 'Archiving…'
                          : 'Archive thread'}
                      </button>
                    </div>
                  </div>

                  {deleteError && (
                    <div className="px-4 py-2 text-sm text-[color:var(--color-danger)]">
                      {deleteError}
                    </div>
                  )}

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
        </div>
      </div>
    </div>
  )
}
