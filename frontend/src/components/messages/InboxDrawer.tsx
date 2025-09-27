import { Eye, EyeOff, Loader2, LogOut, Menu, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import MessageInput from '@/components/chat/MessageInput'
import MessageList, { type DisplayMessage } from '@/components/chat/MessageList'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import friendsService, { type FriendSummary } from '@/services/friendsService'
import { leaveConversation as leaveConversationRequest } from '@/services/messagesService'
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
} from '@/store/messagesSlice'
import type { ConversationKind } from '@/types/messages'

interface InboxDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_TITLES: Record<string, string> = {
  direct: 'Direct Message',
  group: 'Group Conversation',
  game: 'Game Conversation',
}

const HIDDEN_THREADS_STORAGE_KEY = 'messages.hiddenConversations'

const CONVERSATION_KIND_META: Record<ConversationKind, { label: string; icon: string }> = {
  direct: { label: 'Direct Message', icon: '💬' },
  group: { label: 'Group Chat', icon: '🗨️' },
  game: { label: 'Game Room', icon: '🎮' },
  team: { label: 'Team Chat', icon: '👥' },
}

const CONVERSATION_BUCKET_ORDER: ConversationKind[] = ['game', 'team', 'direct', 'group']

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
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [newUsername, setNewUsername] = useState('')
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [friendsError, setFriendsError] = useState<string | null>(null)
  const [hiddenConversationIds, setHiddenConversationIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return []
    }
    try {
      const raw = window.localStorage.getItem(HIDDEN_THREADS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((item): item is string => typeof item === 'string')
    } catch {
      return []
    }
  })
  const [isThreadPickerOpen, setIsThreadPickerOpen] = useState(false)
  const [showHiddenThreads, setShowHiddenThreads] = useState(false)
  const [showEndedGames, setShowEndedGames] = useState(false)
  const [threadActionBusy, setThreadActionBusy] = useState<string | null>(null)
  const [threadActionError, setThreadActionError] = useState<string | null>(null)
  const newConversationInputId = useId()

  const drawerRef = useRef<HTMLDivElement>(null)
  const friendsFetchedRef = useRef(false)

  // Fetch once per open
  const fetchedOnOpenRef = useRef(false)
  useEffect(() => {
    if (!isOpen) {
      fetchedOnOpenRef.current = false
      return
    }
    if (!fetchedOnOpenRef.current) {
      dispatch(loadInbox())
      if (!unreadSummaryFetched) dispatch(loadUnreadSummary())
      fetchedOnOpenRef.current = true
    }
  }, [isOpen, dispatch, unreadSummaryFetched])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(HIDDEN_THREADS_STORAGE_KEY, JSON.stringify(hiddenConversationIds))
    } catch {
      // ignore storage errors
    }
  }, [hiddenConversationIds])

  useEffect(() => {
    if (!isOpen) {
      friendsFetchedRef.current = false
      return
    }
    if (friendsFetchedRef.current) {
      return
    }

    let cancelled = false

    const fetchFriends = async () => {
      setFriendsLoading(true)
      setFriendsError(null)
      try {
        const result = await friendsService.listFriends()
        if (!cancelled) {
          setFriends(result)
          friendsFetchedRef.current = true
        }
      } catch {
        if (!cancelled) {
          setFriendsError('Failed to load friends')
        }
      } finally {
        if (!cancelled) {
          setFriendsLoading(false)
        }
      }
    }

    void fetchFriends()

    return () => {
      cancelled = true
    }
  }, [isOpen])

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

  const filteredConversations = useMemo(() => {
    const base =
      filter === 'unread'
        ? sortedConversations.filter((c) => (c.unreadCount ?? 0) > 0)
        : sortedConversations
    if (!currentUserId) {
      return base
    }
    return base.filter((conversation) => conversation.memberIds.includes(currentUserId))
  }, [sortedConversations, filter, currentUserId])

  const hiddenConversationIdSet = useMemo(
    () => new Set(hiddenConversationIds),
    [hiddenConversationIds],
  )

  const visibleConversations = useMemo(
    () =>
      filteredConversations.filter(
        (conversation) =>
          !hiddenConversationIdSet.has(conversation.id) &&
          (conversation.kind !== 'game' || !conversation.isArchived),
      ),
    [filteredConversations, hiddenConversationIdSet],
  )

  const endedGameConversations = useMemo(
    () =>
      sortedConversations.filter(
        (conversation) =>
          conversation.kind === 'game' &&
          conversation.isArchived &&
          !hiddenConversationIdSet.has(conversation.id) &&
          (!currentUserId || conversation.memberIds.includes(currentUserId)),
      ),
    [sortedConversations, hiddenConversationIdSet, currentUserId],
  )

  const hiddenConversations = useMemo(
    () =>
      sortedConversations.filter(
        (conversation) =>
          hiddenConversationIdSet.has(conversation.id) &&
          (!currentUserId || conversation.memberIds.includes(currentUserId)),
      ),
    [sortedConversations, hiddenConversationIdSet, currentUserId],
  )

  type ConversationEntityType = (typeof conversations)[number]

  interface ConversationBucket {
    key: ConversationKind
    label: string
    icon: string
    conversations: ConversationEntityType[]
  }

  const conversationBuckets = useMemo<ConversationBucket[]>(() => {
    const bucketMap = new Map<ConversationKind, ConversationBucket>()
    for (const kind of CONVERSATION_BUCKET_ORDER) {
      const meta = CONVERSATION_KIND_META[kind]
      bucketMap.set(kind, { key: kind, label: meta.label, icon: meta.icon, conversations: [] })
    }

    for (const conversation of visibleConversations) {
      const bucket = bucketMap.get(conversation.kind)
      if (bucket) {
        bucket.conversations.push(conversation)
      }
    }

    return CONVERSATION_BUCKET_ORDER.map((kind) => bucketMap.get(kind)).filter(
      (bucket): bucket is ConversationBucket => Boolean(bucket && bucket.conversations.length > 0),
    )
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
    socketService.markConversationReadViaSocket(activeConversationId)
  }, [isOpen, activeConversationId, messagesByConversation])

  // Auto-select first conversation on open
  useEffect(() => {
    if (!isOpen) return
    if (!activeConversationId && visibleConversations.length > 0) {
      dispatch(messagesActions.setActiveConversationId(visibleConversations[0].id))
    }
  }, [isOpen, visibleConversations, activeConversationId, dispatch])

  useEffect(() => {
    if (!isOpen) return
    if (!activeConversationId) return
    const stillVisible = visibleConversations.some(
      (conversation) => conversation.id === activeConversationId,
    )
    if (!stillVisible) {
      if (visibleConversations.length > 0) {
        dispatch(messagesActions.setActiveConversationId(visibleConversations[0].id))
      } else {
        dispatch(messagesActions.setActiveConversationId(null))
      }
    }
  }, [isOpen, activeConversationId, visibleConversations, dispatch])

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      dispatch(messagesActions.setActiveConversationId(conversationId))
      setSendError(null)
      setThreadActionError(null)
      const existing = messagesByConversation[conversationId]
      if (!existing || existing.length === 0) {
        dispatch(loadConversationMessages({ conversationId, limit: 50 }))
      }
      dispatch(refreshConversation(conversationId))
      socketService.markConversationReadViaSocket(conversationId)
      setIsThreadPickerOpen(false)
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

  const createDirectConversation = useCallback(
    (targetUserId: string) =>
      new Promise<string>((resolve, reject) => {
        socketService.createConversation({ kind: 'direct', targetUserId }, (ack) => {
          if (!ack?.ok || !ack.conversation) {
            reject(new Error(ack?.error ?? 'Unable to start conversation'))
            return
          }
          resolve(ack.conversation.id)
        })
      }),
    [],
  )

  const openDirectConversation = useCallback(
    async (targetUserId: string, { resetInput = false }: { resetInput?: boolean } = {}) => {
      setCreateError(null)
      const conversationId = await createDirectConversation(targetUserId)
      handleSelectConversation(conversationId)
      dispatch(loadInbox())
      if (resetInput) {
        setNewUsername('')
      }
      setFilter('all')
    },
    [createDirectConversation, dispatch, handleSelectConversation],
  )

  const handleCreateConversation = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault()
      const username = newUsername.trim()
      if (!username || isCreatingConversation) return
      try {
        setIsCreatingConversation(true)
        const profile = await profileService.getProfileByUsername(username)
        await openDirectConversation(profile.id, { resetInput: true })
      } catch (error) {
        if (error instanceof Error && error.message) {
          setCreateError(error.message)
        } else {
          setCreateError('Failed to start conversation')
        }
      } finally {
        setIsCreatingConversation(false)
      }
    },
    [newUsername, isCreatingConversation, openDirectConversation],
  )

  const handleStartConversationWithFriend = useCallback(
    async (friend: FriendSummary) => {
      if (isCreatingConversation) return
      try {
        setIsCreatingConversation(true)
        await openDirectConversation(friend.userId)
      } catch (error) {
        if (error instanceof Error && error.message) {
          setCreateError(error.message)
        } else {
          setCreateError('Failed to open conversation')
        }
      } finally {
        setIsCreatingConversation(false)
      }
    },
    [isCreatingConversation, openDirectConversation],
  )

  const handleHideConversation = useCallback(
    (conversationId: string) => {
      setHiddenConversationIds((prev) => {
        if (prev.includes(conversationId)) {
          return prev
        }
        return [...prev, conversationId]
      })
      if (activeConversationId === conversationId) {
        dispatch(messagesActions.setActiveConversationId(null))
      }
    },
    [activeConversationId, dispatch],
  )

  const handleRestoreConversation = useCallback((conversationId: string) => {
    setHiddenConversationIds((prev) => prev.filter((id) => id !== conversationId))
  }, [])

  const handleLeaveConversation = useCallback(
    async (conversationId: string) => {
      setThreadActionError(null)
      try {
        setThreadActionBusy(conversationId)
        await leaveConversationRequest(conversationId)
        dispatch(messagesActions.conversationRemoved(conversationId))
        if (activeConversationId === conversationId) {
          dispatch(messagesActions.setActiveConversationId(null))
        }
        dispatch(loadInbox())
      } catch (error) {
        setThreadActionError(
          error instanceof Error && error.message ? error.message : 'Failed to leave conversation',
        )
      } finally {
        setThreadActionBusy(null)
      }
    },
    [activeConversationId, dispatch],
  )

  const renderConversationListItem = (
    conversation: ConversationEntityType,
    options?: { ended?: boolean; hidden?: boolean },
  ) => {
    const isActive = conversation.id === activeConversationId
    const unread = conversation.unreadCount ?? 0
    const subtitle = conversation.lastMessage?.body ?? 'No messages yet'
    const title =
      conversation.title ||
      (typeof conversation.metadata?.displayName === 'string'
        ? (conversation.metadata.displayName as string)
        : DEFAULT_TITLES[conversation.kind] || 'Conversation')
    const meta = CONVERSATION_KIND_META[conversation.kind]
    const relativeTime = formatRelativeTime(conversation.updatedAt)
    const isBusy = threadActionBusy === conversation.id

    const actionIcon = options?.hidden ? Eye : conversation.kind === 'group' ? LogOut : EyeOff
    const actionLabel = options?.hidden
      ? 'Restore'
      : conversation.kind === 'group'
        ? 'Leave'
        : options?.ended
          ? 'Dismiss'
          : 'Hide'
    const ActionIcon = actionIcon

    const onAction = () => {
      if (options?.hidden) {
        handleRestoreConversation(conversation.id)
        return
      }
      if (conversation.kind === 'group') {
        void handleLeaveConversation(conversation.id)
        return
      }
      handleHideConversation(conversation.id)
    }

    return (
      <li key={conversation.id}>
        <div
          className={`flex items-start gap-3 px-4 py-3 transition ${
            isActive ? 'bg-[color:var(--panel-bg-alt)]' : 'hover:bg-[color:var(--hover-bg)]'
          }`}
        >
          <button
            type="button"
            onClick={() => handleSelectConversation(conversation.id)}
            className="flex-1 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div
                  className={`text-sm font-medium ${
                    isActive ? 'text-[color:var(--heading)]' : 'text-[color:var(--text)]'
                  }`}
                >
                  {title}
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--panel-bg-alt)] px-2 py-0.5">
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </span>
                  {options?.ended && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 text-amber-200 px-2 py-0.5">
                      Ended
                    </span>
                  )}
                  {options?.hidden && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--panel-bg-alt)] px-2 py-0.5">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted truncate">{subtitle}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted">
                  {relativeTime}
                </span>
                {unread > 0 && !options?.hidden && (
                  <span className="badge">{unread > 99 ? '99+' : unread}</span>
                )}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={onAction}
            className="btn-ghost btn-icon shrink-0"
            disabled={isBusy}
            aria-label={`${actionLabel} conversation`}
          >
            <ActionIcon className="h-4 w-4" />
          </button>
        </div>
      </li>
    )
  }

  const renderThreadList = (_variant: 'desktop' | 'mobile' = 'desktop') => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--panel-border)] text-xs uppercase tracking-wide text-muted">
        <span>Conversations</span>
        <div className="inline-flex items-center gap-0.5 rounded-full bg-[color:var(--panel-bg-alt)] p-0.5">
          <button
            type="button"
            className={`px-2 py-0.5 text-[10px] rounded-full transition ${
              filter === 'all' ? 'bg-[color:var(--color-primary)] text-white' : 'text-muted'
            }`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 text-[10px] rounded-full transition ${
              filter === 'unread' ? 'bg-[color:var(--color-primary)] text-white' : 'text-muted'
            }`}
            onClick={() => setFilter('unread')}
          >
            Unread
          </button>
        </div>
      </div>

      <div className="px-3 py-3 border-b border-[color:var(--panel-border)] space-y-3">
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
              autoComplete="off"
            />
            <button type="submit" className="btn-primary btn-sm" disabled={isCreatingConversation}>
              {isCreatingConversation ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start'}
            </button>
          </div>
          {createError && (
            <div className="text-[11px] text-[color:var(--color-danger)]">{createError}</div>
          )}
        </form>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Friends</p>
          {friendsLoading ? (
            <div className="text-xs text-muted">Loading friends…</div>
          ) : friendsError ? (
            <div className="text-xs text-[color:var(--color-danger)]">{friendsError}</div>
          ) : friends.length === 0 ? (
            <div className="text-xs text-muted">
              Add friends from the Community tab to quickly start direct messages.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {friends.map((friend) => (
                <button
                  key={friend.userId}
                  type="button"
                  className="px-3 py-1 text-xs rounded-full border border-[color:var(--panel-border)] hover:bg-[color:var(--hover-bg)] transition"
                  onClick={() => void handleStartConversationWithFriend(friend)}
                  disabled={isCreatingConversation}
                >
                  {friend.username}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {threadActionError && (
        <div className="px-3 py-2 text-xs text-[color:var(--color-danger)] border-b border-[color:var(--panel-border)]">
          {threadActionError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {inboxLoading ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">Loading…</div>
        ) : inboxError ? (
          <div className="flex items-center justify-center h-full text-[color:var(--color-danger)] text-sm">
            {inboxError}
          </div>
        ) : (
          <div className="pb-4">
            {conversationBuckets.length === 0 && endedGameConversations.length === 0 ? (
              <div className="text-sm text-muted px-4 py-8 text-center">No conversations yet.</div>
            ) : (
              conversationBuckets.map((bucket) => (
                <div
                  key={bucket.key}
                  className="border-b border-[color:var(--panel-border)] last:border-b-0"
                >
                  <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-muted flex items-center gap-2">
                    <span>{bucket.icon}</span>
                    <span>{bucket.label}</span>
                  </div>
                  <ul>
                    {bucket.conversations.map((conversation) =>
                      renderConversationListItem(conversation),
                    )}
                  </ul>
                </div>
              ))
            )}

            {endedGameConversations.length > 0 && (
              <div className="mt-2 border-t border-[color:var(--panel-border)]">
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-xs uppercase tracking-wide text-muted hover:text-white transition"
                  onClick={() => setShowEndedGames((prev) => !prev)}
                >
                  {showEndedGames ? 'Hide ended games' : 'Show ended games'} (
                  {endedGameConversations.length})
                </button>
                {showEndedGames && (
                  <ul>
                    {endedGameConversations.map((conversation) =>
                      renderConversationListItem(conversation, { ended: true }),
                    )}
                  </ul>
                )}
              </div>
            )}

            {hiddenConversations.length > 0 && (
              <div className="mt-2 border-t border-[color:var(--panel-border)]">
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-xs uppercase tracking-wide text-muted hover:text-white transition"
                  onClick={() => setShowHiddenThreads((prev) => !prev)}
                >
                  {showHiddenThreads ? 'Hide hidden threads' : 'Show hidden threads'} (
                  {hiddenConversations.length})
                </button>
                {showHiddenThreads && (
                  <ul>
                    {hiddenConversations.map((conversation) =>
                      renderConversationListItem(conversation, { hidden: true }),
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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

  const conversationSubtitle = useMemo(() => {
    if (!activeConversation) return null
    switch (activeConversation.kind) {
      case 'direct':
        return 'Direct conversation'
      case 'group':
        return 'Group conversation'
      case 'team':
        return 'Team chat'
      case 'game':
        return 'Game chat'
      default:
        return null
    }
  }, [activeConversation])

  const activeConversationMeta = activeConversation
    ? CONVERSATION_KIND_META[activeConversation.kind]
    : null

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
        <div className="h-full modal flex flex-col relative">
          {isThreadPickerOpen && (
            <div className="sm:hidden absolute inset-0 z-[5]">
              <button
                type="button"
                className="absolute inset-0 bg-black/70"
                aria-label="Close thread list"
                onClick={() => setIsThreadPickerOpen(false)}
              />
              <div className="relative h-full bg-surface-1 flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--panel-border)]">
                  <h3 className="text-sm font-semibold text-[color:var(--heading)]">Threads</h3>
                  <button
                    type="button"
                    className="btn-ghost btn-icon"
                    onClick={() => setIsThreadPickerOpen(false)}
                    aria-label="Close thread list"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">{renderThreadList('mobile')}</div>
              </div>
            </div>
          )}

          <header className="modal-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost btn-icon sm:hidden"
                aria-label="Open conversation list"
                onClick={() => setIsThreadPickerOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <h2 className="text-lg font-semibold text-[color:var(--heading)]">Messages</h2>
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

          <div className="flex flex-1 min-h-0">
            <aside className="hidden sm:flex sm:flex-col sm:w-80 border-r border-[color:var(--panel-border)]">
              {renderThreadList('desktop')}
            </aside>

            <section className="flex-1 flex flex-col min-w-0">
              {activeConversation ? (
                <div className="flex flex-col h-full">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[color:var(--panel-border)]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-[color:var(--heading)]">
                          {conversationTitle}
                        </h3>
                        {activeConversationMeta && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted bg-[color:var(--panel-bg-alt)] px-2 py-0.5 rounded-full">
                            <span>{activeConversationMeta.icon}</span>
                            <span>{activeConversationMeta.label}</span>
                          </span>
                        )}
                      </div>
                      {conversationSubtitle && (
                        <p className="text-xs text-muted">{conversationSubtitle}</p>
                      )}
                    </div>
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
                <div className="flex flex-1 items-center justify-center text-sm text-muted px-4 text-center">
                  Select a thread from the list to start chatting.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
