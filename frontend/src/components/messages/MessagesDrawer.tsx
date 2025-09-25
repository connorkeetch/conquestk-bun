import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { socketService } from '@/services/socketService'
import MessageInput from '@/components/chat/MessageInput'
import MessageList, { type DisplayMessage } from '@/components/chat/MessageList'
import profileService from '@/services/profileService'
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

interface MessagesDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const formatRelativeTime = (timestamp: string) => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffMins < 60 * 24) return `${Math.floor(diffMins / 60)}h`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const DEFAULT_TITLES: Record<string, string> = {
  direct: 'Direct Message',
  group: 'Group Conversation',
  game: 'Game Conversation',
}

export default function MessagesDrawer({ isOpen, onClose }: MessagesDrawerProps) {
  const dispatch = useAppDispatch()
  const conversations = useAppSelector(selectAllConversations)
  const activeConversationId = useAppSelector(selectActiveConversationId)
  const inboxLoading = useAppSelector(selectMessagesInboxLoading)
  const inboxError = useAppSelector(selectMessagesInboxError)
  const totalUnread = useAppSelector(selectTotalUnreadMessages)
  const messagesByConversation = useAppSelector((state) => state.messages.messages)
  const loadingMessagesMap = useAppSelector((state) => state.messages.loadingMessages)
  const hasMoreMap = useAppSelector((state) => state.messages.hasMore)
  const currentUserId = useAppSelector((state) => state.auth.user?.id ?? null)
  const [sendError, setSendError] = useState<string | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [newUsername, setNewUsername] = useState('')
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const newConversationInputId = useId()

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime()
      const bTime = new Date(b.updatedAt).getTime()
      return bTime - aTime
    })
  }, [conversations])

  const filteredConversations = useMemo(() => {
    if (filter === 'unread') {
      return sortedConversations.filter((conversation) => (conversation.unreadCount ?? 0) > 0)
    }
    return sortedConversations
  }, [sortedConversations, filter])

  const activeConversation = useAppSelector((state) =>
    activeConversationId ? selectConversationById(state, activeConversationId) : undefined,
  )
  const activeMessages = useAppSelector((state) =>
    activeConversationId ? selectMessagesForConversation(state, activeConversationId) : [],
  )
  const typingUsers = useAppSelector((state) =>
    activeConversationId ? Object.values(state.messages.typing[activeConversationId] ?? {}) : [],
  )

  const hasMore = activeConversationId ? hasMoreMap[activeConversationId] ?? true : false
  const isThreadLoading = activeConversationId
    ? Boolean(loadingMessagesMap[activeConversationId])
    : false

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (!inboxLoading && conversations.length === 0) {
      dispatch(loadInbox())
    }

    dispatch(loadUnreadSummary())
  }, [isOpen, inboxLoading, conversations.length, dispatch])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (!activeConversationId && sortedConversations.length > 0) {
      dispatch(messagesActions.setActiveConversationId(sortedConversations[0].id))
    }
  }, [isOpen, sortedConversations, activeConversationId, dispatch])

  useEffect(() => {
    if (!isOpen || !activeConversationId) {
      return
    }

    if (activeMessages.length === 0) {
      return
    }

    socketService.markConversationReadViaSocket(activeConversationId)
  }, [isOpen, activeConversationId, activeMessages.length])

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      dispatch(messagesActions.setActiveConversationId(conversationId))
      setSendError(null)

      const existingMessages = messagesByConversation[conversationId]
      if (!existingMessages || existingMessages.length === 0) {
        dispatch(loadConversationMessages({ conversationId, limit: 50 }))
      }

      dispatch(refreshConversation(conversationId))
      socketService.markConversationReadViaSocket(conversationId)
    },
    [dispatch, messagesByConversation],
  )

  const handleLoadOlder = useCallback(() => {
    if (!activeConversationId) {
      return
    }

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

  const handleCreateConversation = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault()
      const username = newUsername.trim()
      if (!username || isCreatingConversation) {
        return
      }

      try {
        setIsCreatingConversation(true)
        setCreateError(null)

        const profile = await profileService.getProfileByUsername(username)
        const targetUserId = profile.id

        socketService.createConversation(
          { kind: 'direct', targetUserId },
          (ack) => {
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
          },
        )
      } catch (error) {
        const maybeAxios = error as { response?: { status?: number } }
        if (maybeAxios?.response?.status === 404) {
          setCreateError('User not found')
        } else {
          setCreateError('Failed to start conversation')
        }
        setIsCreatingConversation(false)
      }
    },
    [newUsername, isCreatingConversation, dispatch],
  )

  const displayMessages: DisplayMessage[] = useMemo(() => {
    return activeMessages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      senderName:
        message.senderId === currentUserId
          ? 'You'
          : typeof message.metadata?.senderName === 'string'
            ? (message.metadata.senderName as string)
            : message.senderId ?? undefined,
      body: message.body,
      createdAt: message.createdAt,
      metadata: message.metadata,
    }))
  }, [activeMessages, currentUserId])

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!activeConversationId) {
        return
      }

      socketService.sendConversationMessage(
        { conversationId: activeConversationId, body: text },
        (ack) => {
          if (!ack?.ok && ack?.error) {
            setSendError(ack.error)
          } else {
            setSendError(null)
          }
        },
      )
    },
    [activeConversationId],
  )

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!activeConversationId) {
        return
      }

      if (isTyping) {
        socketService.startConversationTyping(activeConversationId)
      } else {
        socketService.stopConversationTyping(activeConversationId)
      }
    },
    [activeConversationId],
  )

  const conversationTitle = useMemo(() => {
    if (!activeConversation) {
      return 'Messages'
    }

    const metadataTitle = typeof activeConversation.metadata?.displayName === 'string'
      ? activeConversation.metadata.displayName
      : undefined

    return (
      activeConversation.title || metadataTitle || DEFAULT_TITLES[activeConversation.kind] || 'Conversation'
    )
  }, [activeConversation])

  return (
    <div
      className={`fixed inset-0 z-[70] transition-opacity duration-300 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close messages"
        onClick={onClose}
      />

      <div
        ref={drawerRef}
        className={`absolute right-0 top-0 h-full w-full sm:w-[640px] md:w-[720px] xl:w-[840px] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full glass border-l border-white/10 backdrop-blur-xl flex flex-col">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-1/80">
            <div>
              <h2 className="text-lg font-semibold text-white">Messages</h2>
              <p className="text-xs text-muted">{totalUnread > 0 ? `${totalUnread} unread` : 'All caught up'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close messages"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          </header>

          <div className="flex flex-1 min-h-0">
            <aside className="hidden sm:flex sm:flex-col sm:w-80 border-r border-border bg-surface-1/60">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border text-xs uppercase tracking-wide text-muted">
                <span>Conversations</span>
                <div className="inline-flex items-center gap-0.5 rounded-full bg-surface-2/80 p-0.5">
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-[10px] rounded-full transition ${
                      filter === 'all' ? 'bg-primary/80 text-white' : 'text-muted'
                    }`}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-[10px] rounded-full transition ${
                      filter === 'unread' ? 'bg-primary/80 text-white' : 'text-muted'
                    }`}
                    onClick={() => setFilter('unread')}
                  >
                    Unread
                  </button>
                </div>
              </div>
              <div className="px-3 py-3 border-b border-border">
                <form onSubmit={handleCreateConversation} className="space-y-2">
                  <label htmlFor={newConversationInputId} className="text-[11px] uppercase tracking-wide text-muted block">
                    Start new conversation
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={newConversationInputId}
                      type="text"
                      value={newUsername}
                      onChange={(event) => setNewUsername(event.target.value)}
                      placeholder="Enter username"
                      className="flex-1 rounded-md bg-surface-2/80 border border-border px-3 py-2 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      type="submit"
                      className="btn-primary px-3 py-2 text-xs"
                      disabled={isCreatingConversation || !newUsername.trim()}
                    >
                      {isCreatingConversation ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Start'
                      )}
                    </button>
                  </div>
                  {createError && <div className="text-xs text-red-400">{createError}</div>}
                </form>
              </div>
              <div className="flex-1 overflow-y-auto">
                {inboxLoading && conversations.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted">Loading conversations…</div>
                ) : inboxError ? (
                  <div className="px-4 py-6 text-sm text-red-400">{inboxError}</div>
                ) : filteredConversations.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted">
                    {filter === 'unread' ? 'No unread conversations.' : 'No conversations yet.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60">
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
                              isActive ? 'bg-surface-2/80' : 'hover:bg-surface-2/40'
                            }`}
                            onClick={() => handleSelectConversation(conversation.id)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className={`text-sm font-medium ${isActive ? 'text-white' : 'text-white/90'}`}>
                                  {title}
                                </p>
                                <p className="text-xs text-muted truncate">{subtitle}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] uppercase tracking-wide text-muted">
                                  {formatRelativeTime(conversation.updatedAt)}
                                </span>
                                {unread > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-primary/80 text-[10px] font-semibold text-white">
                                    {unread}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </aside>

            <section className="flex-1 flex flex-col min-w-0">
              {activeConversation ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-1/60">
                    <div>
                      <h3 className="text-base font-semibold text-white">{conversationTitle}</h3>
                      <p className="text-xs text-muted">
                        {activeConversation.kind === 'direct'
                          ? 'Direct conversation'
                          : activeConversation.kind === 'group'
                            ? 'Group conversation'
                            : 'Game chat'}
                      </p>
                    </div>
                    {activeConversation.unreadCount > 0 && (
                      <span className="px-2 py-1 text-xs bg-primary/80 text-white rounded-full">
                        {activeConversation.unreadCount} unread
                      </span>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {hasMore && (
                      <div className="text-center">
                        <button
                          type="button"
                          className="px-3 py-1 text-xs text-muted border border-border rounded-md hover:text-white hover:bg-surface-2/60 transition"
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

                  <div className="border-t border-border bg-surface-1/80">
                    {sendError && (
                      <div className="px-4 pt-3 text-sm text-red-400">{sendError}</div>
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
