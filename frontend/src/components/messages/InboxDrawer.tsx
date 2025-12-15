import { Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import MessageInput from '@/components/chat/MessageInput'
import MessageList, { type DisplayMessage } from '@/components/chat/MessageList'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import friendsService, { type FriendSummary } from '@/services/friendsService'
import { searchUsers, type UserSearchResult } from '@/services/profileService'
// TODO: Re-add real-time messaging when ChatRoom is implemented
// import { colyseusService } from '@/services/colyseusService'
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
  conversations: ConversationItem[]
}

const getConversationTitle = (
  conversation: ConversationItem,
  currentUserId?: string | null,
): string => {
  if (conversation.kind === 'direct' && currentUserId) {
    const other = conversation.memberRoles?.find((m) => m.userId !== currentUserId)
    if (other?.username) return other.username
  }
  return (
    conversation.title ||
    (typeof conversation.metadata?.displayName === 'string'
      ? (conversation.metadata.displayName as string)
      : undefined) ||
    DEFAULT_TITLES[conversation.kind] ||
    'Conversation'
  )
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

  // Messages state
  const conversations = useAppSelector(selectAllConversations)
  const activeConversationId = useAppSelector(selectActiveConversationId)
  const inboxLoading = useAppSelector(selectMessagesInboxLoading)
  const inboxError = useAppSelector(selectMessagesInboxError)
  const messagesByConversation = useAppSelector((s) => s.messages.messages)
  const loadingMessagesMap = useAppSelector((s) => s.messages.loadingMessages)
  const hasMoreMap = useAppSelector((s) => s.messages.hasMore)
  const currentUser = useAppSelector((s) => s.auth.user)
  const currentUserId = currentUser?.id ?? null
  const currentUsername = currentUser?.username ?? null
  const unreadSummaryFetched = useAppSelector((s) => s.messages.unreadSummaryFetched)
  const typingMap = useAppSelector((s) => s.messages.typing)

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
  // TODO: Re-enable when ChatRoom archive is implemented
  const [deletingConversationId, _setDeletingConversationId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const searchInputId = useId()
  const mobileThreadSelectId = useId()
  const [searchActiveIndex, setSearchActiveIndex] = useState<number>(-1)

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

  // Refresh unread summary on window focus to stay authoritative if sockets dropped
  useEffect(() => {
    if (!isOpen) return
    const onFocus = () => {
      dispatch(loadUnreadSummary())
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [dispatch, isOpen])

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
        setSearchActiveIndex(filtered.length > 0 ? 0 : -1)
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

  // Close on ESC using Effect Event to always see latest onClose without retriggering the effect
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

  // Determine the active conversation for the Inbox specifically.
  // If the globally active conversation is not a DM/group (e.g. a game/team chat),
  // fall back to the first visible DM/group thread for the drawer context.
  const drawerActiveConversationId = useMemo(() => {
    if (activeConversationId && visibleConversations.some((c) => c.id === activeConversationId)) {
      return activeConversationId
    }
    // Fallback to the first unread, otherwise first visible
    const firstUnread = visibleConversations.find((c) => (c.unreadCount ?? 0) > 0)
    return firstUnread?.id ?? (visibleConversations.length > 0 ? visibleConversations[0].id : null)
  }, [activeConversationId, visibleConversations])

  const conversationSections = useMemo<ConversationSection[]>(() => {
    const sections: ConversationSection[] = [
      // Relabel leftbar section from "Direct Messages" to "Conversations"
      { key: 'direct', label: 'Conversations', conversations: [] },
      { key: 'group', label: 'Group Chats', conversations: [] },
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
    drawerActiveConversationId ? selectConversationById(s, drawerActiveConversationId) : undefined,
  )
  const activeMessages = useAppSelector((s) =>
    drawerActiveConversationId ? selectMessagesForConversation(s, drawerActiveConversationId) : [],
  )
  const typingUsers = useAppSelector((s) =>
    drawerActiveConversationId
      ? Object.values(s.messages.typing[drawerActiveConversationId] ?? {})
      : [],
  )

  // Only show "Load earlier" when we know there are older messages
  const hasMore = drawerActiveConversationId
    ? (hasMoreMap[drawerActiveConversationId] ?? false)
    : false
  const isThreadLoading = drawerActiveConversationId
    ? Boolean(loadingMessagesMap[drawerActiveConversationId])
    : false

  // Scroll behavior: only snap to newest when near bottom; offer a jump button otherwise
  const messageScrollRef = useRef<HTMLDivElement>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)

  const scrollToBottom = useCallback(() => {
    const el = messageScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    const el = messageScrollRef.current
    if (!el) return
    const onScroll = () => {
      const threshold = 100
      const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
      const near = distanceFromBottom < threshold
      setIsNearBottom(near)
      if (near) setShowJumpToLatest(false)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // When active messages change, scroll appropriately
  useEffect(() => {
    if (!drawerActiveConversationId) return
    if (isNearBottom) {
      scrollToBottom()
    } else if ((activeMessages?.length ?? 0) > 0) {
      setShowJumpToLatest(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerActiveConversationId, activeMessages.length, isNearBottom, scrollToBottom])

  // Mark read when visible and we have messages
  useEffect(() => {
    if (!isOpen || !drawerActiveConversationId) return
    if ((messagesByConversation[drawerActiveConversationId] ?? []).length === 0) return
    dispatch(messagesActions.markReadOptimistic(drawerActiveConversationId))
    // TODO: Re-add when ChatRoom is implemented
    // socketService.markConversationReadViaSocket(drawerActiveConversationId)
  }, [dispatch, isOpen, drawerActiveConversationId, messagesByConversation])

  // Auto-select first conversation on open
  useEffect(() => {
    if (!isOpen) return
    // On open, auto-focus the first unread DM/group thread if available; else most recent
    const firstUnread = visibleConversations.find((c) => (c.unreadCount ?? 0) > 0)
    const targetId =
      firstUnread?.id ?? (visibleConversations.length > 0 ? visibleConversations[0].id : null)
    if (targetId) {
      dispatch(messagesActions.setActiveConversationId(targetId))
    }
  }, [isOpen, visibleConversations, dispatch])

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      dispatch(messagesActions.setActiveConversationId(conversationId))
      setSendError(null)
      setDeleteError(null)
      const existing = messagesByConversation[conversationId]
      if (!existing || existing.length === 0) {
        // Load the most recent 20 messages on first open
        dispatch(loadConversationMessages({ conversationId, limit: 20 }))
      }
      dispatch(refreshConversation(conversationId))
      dispatch(messagesActions.markReadOptimistic(conversationId))
      // TODO: Re-add when ChatRoom is implemented
      // socketService.markConversationReadViaSocket(conversationId)
    },
    [dispatch, messagesByConversation],
  )

  const startDirectConversation = useCallback(
    (_targetUserId: string) =>
      new Promise<string>((_resolve, reject) => {
        // TODO: Re-add when ChatRoom is implemented
        reject(new Error('Direct messaging is temporarily disabled during migration'))
      }),
    [],
  )

  const handleLoadOlder = useCallback(() => {
    if (!drawerActiveConversationId) return
    const existing = messagesByConversation[drawerActiveConversationId] ?? []
    if (existing.length === 0) {
      // Initial fetch if somehow not loaded yet (20 messages)
      dispatch(loadConversationMessages({ conversationId: drawerActiveConversationId, limit: 20 }))
      return
    }
    const oldest = existing[0]
    dispatch(
      loadConversationMessages({
        conversationId: drawerActiveConversationId,
        before: oldest.id,
        // Page older messages in batches of 20
        limit: 20,
      }),
    )
  }, [drawerActiveConversationId, dispatch, messagesByConversation])

  const selfDisplayName = useMemo(() => {
    if (currentUsername && currentUsername.trim().length > 0) {
      return currentUsername
    }
    if (currentUserId) {
      return currentUserId
    }
    return 'You'
  }, [currentUserId, currentUsername])

  const displayMessages: DisplayMessage[] = useMemo(() => {
    return activeMessages.map((m) => {
      const label =
        m.senderId === currentUserId
          ? selfDisplayName
          : typeof m.metadata?.senderName === 'string'
            ? (m.metadata.senderName as string)
            : undefined
      return {
        id: m.id,
        senderId: m.senderId,
        ...(label ? { senderName: label } : {}),
        body: m.body,
        createdAt: m.createdAt,
        metadata: m.metadata,
      }
    })
  }, [activeMessages, currentUserId, selfDisplayName])

  const handleSendMessage = useCallback(
    (_text: string) => {
      if (!drawerActiveConversationId) return
      // TODO: Re-add when ChatRoom is implemented
      setSendError('Messaging is temporarily disabled during migration')
    },
    [drawerActiveConversationId],
  )

  const handleTyping = useCallback((_isTyping: boolean) => {
    // TODO: Re-add typing indicators when ChatRoom is implemented
  }, [])

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

  const handleArchiveConversation = useCallback(async (_conversation: ConversationItem) => {
    // TODO: Re-add when ChatRoom is implemented
    setDeleteError('Archive is temporarily disabled during migration')
  }, [])

  const conversationTitle = useMemo(() => {
    if (!activeConversation) return 'Messages'
    return getConversationTitle(activeConversation, currentUserId)
  }, [activeConversation, currentUserId])

  const activeConversationDescriptor = useMemo(() => {
    if (!activeConversation) {
      return null
    }
    switch (activeConversation.kind) {
      case 'direct':
        return null
      case 'group':
        return { icon: '', label: 'Group chat' }
      case 'team': {
        const teamId = activeConversation.metadata?.teamId
        const teamLabel = typeof teamId === 'number' ? `Team ${teamId}` : 'Team chat'
        return { icon: '', label: teamLabel }
      }
      case 'game': {
        const gameLabel = activeConversation.gameId
          ? `Game ${activeConversation.gameId}`
          : 'Game thread'
        return { icon: '', label: gameLabel }
      }
      default:
        return { icon: '', label: 'Conversation' }
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
            <div className="flex items-center gap-2">
              <MarkAllReadButton
                onMarkAllRead={() => {
                  for (const c of visibleConversations) {
                    const unread = c.unreadCount ?? 0
                    if (unread > 0 && !c.isArchived) {
                      dispatch(messagesActions.markReadOptimistic(c.id))
                      // TODO: Re-add when ChatRoom is implemented
                      // socketService.markConversationReadViaSocket(c.id)
                    }
                  }
                }}
                conversations={visibleConversations}
              />
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost btn-icon"
                aria-label="Close inbox"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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
                      onKeyDown={(e) => {
                        if (searchResults.length === 0) return
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          setSearchActiveIndex((i) =>
                            i < searchResults.length - 1 ? i + 1 : searchResults.length - 1,
                          )
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          setSearchActiveIndex((i) => (i > 0 ? i - 1 : 0))
                        } else if (e.key === 'Enter') {
                          e.preventDefault()
                          const target =
                            searchActiveIndex >= 0 && searchActiveIndex < searchResults.length
                              ? searchResults[searchActiveIndex]
                              : null
                          if (target) {
                            void startDirectConversation(target.id)
                            setSearchQuery('')
                            setSearchResults([])
                            setSearchActiveIndex(-1)
                          }
                        }
                      }}
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
                          {searchResults.map((user, idx) => (
                            <li
                              key={user.id}
                              className={`px-3 py-2 flex items-center justify-between gap-2 ${
                                idx === searchActiveIndex ? 'bg-[color:var(--hover-bg)]' : ''
                              }`}
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
                                    setSearchActiveIndex(-1)
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
                        <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted">
                          {section.label}
                        </div>
                        <ul>
                          {section.conversations.map((conversation) => {
                            const isActive = conversation.id === drawerActiveConversationId
                            const unread = conversation.unreadCount ?? 0
                            const typingUsers = Object.values(typingMap[conversation.id] ?? {})
                            const isTyping = typingUsers.length > 0
                            const subtitle = isTyping
                              ? 'typing…'
                              : (conversation.lastMessage?.body ?? 'No messages yet')
                            const title = getConversationTitle(conversation, currentUserId)
                            const isDirect = conversation.kind === 'direct'
                            const partnerInitial =
                              isDirect && title ? title.charAt(0).toUpperCase() : ''
                            const contextLabel =
                              conversation.kind === 'team'
                                ? conversation.metadata?.teamId !== undefined
                                  ? `Team ${conversation.metadata.teamId}`
                                  : 'Team chat'
                                : conversation.kind === 'game'
                                  ? conversation.gameId
                                    ? `Game ${conversation.gameId}`
                                    : 'Game thread'
                                  : conversation.kind === 'group'
                                    ? 'Group chat'
                                    : ''
                            return (
                              <li key={conversation.id}>
                                <button
                                  type="button"
                                  className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                                    isActive
                                      ? 'bg-[color:var(--panel-bg-alt)] border-[color:var(--color-primary)]'
                                      : 'hover:bg-[color:var(--hover-bg)] border-transparent'
                                  }`}
                                  onClick={() => handleSelectConversation(conversation.id)}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-3">
                                      {isDirect && (
                                        <div
                                          className={`mt-0.5 w-8 h-8 rounded-full bg-[color:var(--panel-bg-alt)] flex items-center justify-center text-xs font-semibold text-[color:var(--heading)] ${
                                            isActive
                                              ? 'ring-2 ring-[color:var(--color-primary)]'
                                              : ''
                                          }`}
                                        >
                                          {partnerInitial}
                                        </div>
                                      )}
                                      <div className="space-y-1">
                                        <p
                                          className={`text-sm ${
                                            isActive || unread > 0
                                              ? 'font-semibold text-[color:var(--heading)]'
                                              : 'font-medium text-[color:var(--text)]'
                                          }`}
                                          data-selected={isActive ? 'true' : 'false'}
                                        >
                                          {title}
                                        </p>
                                        {contextLabel && (
                                          <div className="text-[10px] uppercase tracking-wide text-muted">
                                            {contextLabel}
                                          </div>
                                        )}
                                        <p
                                          className={`text-xs truncate ${
                                            isTyping
                                              ? 'text-[color:var(--color-primary)] italic'
                                              : 'text-muted'
                                          }`}
                                        >
                                          {subtitle}
                                        </p>
                                      </div>
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
                    value={drawerActiveConversationId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value) {
                        handleSelectConversation(value)
                      }
                    }}
                  >
                    <option value="">Select a thread…</option>
                    {conversationSections.map((section) => (
                      <optgroup key={section.key} label={section.label}>
                        {section.conversations.map((conversation) => {
                          const title = getConversationTitle(conversation, currentUserId)
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
                    htmlFor={`${mobileThreadSelectId}-search`}
                    className="text-[11px] uppercase tracking-wide text-muted block mb-1"
                  >
                    Start a new chat
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`${mobileThreadSelectId}-search`}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (searchResults.length === 0) return
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          setSearchActiveIndex((i) =>
                            i < searchResults.length - 1 ? i + 1 : searchResults.length - 1,
                          )
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          setSearchActiveIndex((i) => (i > 0 ? i - 1 : 0))
                        } else if (e.key === 'Enter') {
                          e.preventDefault()
                          const target =
                            searchActiveIndex >= 0 && searchActiveIndex < searchResults.length
                              ? searchResults[searchActiveIndex]
                              : null
                          if (target) {
                            void startDirectConversation(target.id)
                            setSearchQuery('')
                            setSearchResults([])
                            setSearchActiveIndex(-1)
                          }
                        }
                      }}
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
                          {searchResults.map((user, idx) => (
                            <li
                              key={user.id}
                              className={`px-3 py-2 flex items-center justify-between gap-2 ${
                                idx === searchActiveIndex ? 'bg-[color:var(--hover-bg)]' : ''
                              }`}
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
                                    setSearchActiveIndex(-1)
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
                      <div className="flex items-center gap-2">
                        {activeConversation.kind === 'direct' && (
                          <div className="w-8 h-8 rounded-full bg-[color:var(--panel-bg-alt)] flex items-center justify-center text-xs font-semibold text-[color:var(--heading)]">
                            {conversationTitle.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <h3 className="text-base font-semibold text-[color:var(--heading)]">
                          {conversationTitle}
                        </h3>
                      </div>
                      {activeConversationDescriptor && (
                        <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                          {activeConversationDescriptor.label}
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

                  <div
                    ref={messageScrollRef}
                    className="relative flex-1 overflow-y-auto p-4 space-y-4"
                  >
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

                    {showJumpToLatest && (
                      <div className="absolute bottom-4 right-4">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={scrollToBottom}
                        >
                          Jump to latest
                        </button>
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

// Small presentational button that is disabled when there are no unread conversations
function MarkAllReadButton({
  conversations,
  onMarkAllRead,
}: {
  conversations: ConversationItem[]
  onMarkAllRead: () => void
}) {
  const anyUnread = conversations.some((c) => (c.unreadCount ?? 0) > 0 && !c.isArchived)
  return (
    <button
      type="button"
      className="btn-outline btn-sm"
      onClick={onMarkAllRead}
      disabled={!anyUnread}
      title={anyUnread ? 'Mark all as read' : 'No unread messages'}
    >
      Mark all read
    </button>
  )
}
