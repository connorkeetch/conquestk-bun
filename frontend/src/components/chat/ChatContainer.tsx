import type { ChatConversationType } from '@shared/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import { socketService } from '../../services/socketService'
import {
  addMessage,
  deleteMessage,
  editMessage,
  loadChatHistory as legacyLoadChatHistory,
  markMessagesAsRead,
  setActiveConversation,
  setTypingUser,
  setUnreadCounts,
} from '../../store/chatSlice'
import {
  loadConversationMessages,
  messagesActions,
  refreshConversation,
  selectConversationById,
  selectHasMoreMessages,
  selectMessagesForConversation,
  selectTypingUsers,
} from '../../store/messagesSlice'
import type { ChatMessage } from '../../store/chatSlice'
import MessageInput from './MessageInput'
import MessageList, { type DisplayMessage } from './MessageList'

type ChatContainerProps = {
  conversationType: ChatConversationType
  conversationId: string
  className?: string
}

export default function ChatContainer(props: ChatContainerProps) {
  if (props.conversationType === 'dm') {
    return <DirectMessageChat {...props} />
  }

  return <LegacyChat {...props} />
}

function DirectMessageChat({ conversationId: partnerId, className = '' }: ChatContainerProps) {
  const dispatch = useAppDispatch()
  const currentUserId = useAppSelector((state) => state.auth.user?.id)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const conversation = useAppSelector((state) =>
    conversationId ? selectConversationById(state, conversationId) : undefined,
  )
  const rawMessages = useAppSelector((state) =>
    conversationId ? selectMessagesForConversation(state, conversationId) : [],
  )
  const typingUsersMap = useAppSelector((state) =>
    conversationId ? selectTypingUsers(state, conversationId) : {},
  )
  const hasMore = useAppSelector((state) =>
    conversationId ? selectHasMoreMessages(state, conversationId) : false,
  )
  const isLoadingMessages = useAppSelector(
    (state) => conversationId && state.messages.loadingMessages[conversationId],
  )

  useEffect(() => {
    if (!partnerId || !currentUserId) {
      return
    }

    if (!socketService.getSocket()) {
      return
    }

    let cancelled = false
    setInitializing(true)
    setError(null)

    socketService.createConversation(
      { kind: 'direct', targetUserId: partnerId },
      (ack) => {
        if (cancelled) {
          return
        }

        if (ack?.ok && ack.conversation) {
          setConversationId(ack.conversation.id)
          dispatch(refreshConversation(ack.conversation.id))
        } else {
          setError(ack?.error ?? 'Failed to open conversation')
        }

        setInitializing(false)
      },
    )

    return () => {
      cancelled = true
      setConversationId(null)
      dispatch(messagesActions.setActiveConversationId(null))
    }
  }, [partnerId, currentUserId, dispatch])

  useEffect(() => {
    if (!conversationId || !currentUserId) {
      return
    }

    dispatch(messagesActions.setActiveConversationId(conversationId))
    dispatch(loadConversationMessages({ conversationId, limit: 50 }))
    socketService.markConversationReadViaSocket(conversationId)
  }, [conversationId, currentUserId, dispatch])

  useEffect(() => {
    if (!conversationId || rawMessages.length === 0) {
      return
    }
    socketService.markConversationReadViaSocket(conversationId)
  }, [conversationId, rawMessages.length])

  useEffect(() => {
    if (rawMessages.length === 0) {
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [rawMessages.length])

  const typingUsers = useMemo(() => Object.values(typingUsersMap), [typingUsersMap])

  const loadOlder = useCallback(() => {
    if (!conversationId || rawMessages.length === 0) {
      return
    }
    const oldestMessage = rawMessages[0]
    dispatch(
      loadConversationMessages({
        conversationId,
        before: oldestMessage.id,
        limit: 50,
      }),
    )
  }, [conversationId, rawMessages, dispatch])

  const messages: DisplayMessage[] = useMemo(
    () =>
      rawMessages.map((message) => ({
        id: message.id,
        senderId: message.senderId,
        body: message.body,
        createdAt: message.createdAt,
        metadata: message.metadata,
      })),
    [rawMessages],
  )

  const partnerLabel = conversation?.metadata?.displayName ?? partnerId

  const getDisplayName = useCallback(
    (_message: DisplayMessage, isOwn: boolean) => {
      if (isOwn) {
        return 'You'
      }
      return partnerLabel
    },
    [partnerLabel],
  )

  const sendMessage = useCallback(
    (text: string) => {
      if (!conversationId || !text.trim()) {
        return
      }
      socketService.sendConversationMessage(
        {
          conversationId,
          body: text,
        },
        (ack) => {
          if (!ack?.ok && ack?.error) {
            setError(ack.error)
          }
        },
      )
    },
    [conversationId],
  )

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!conversationId) {
        return
      }
      if (isTyping) {
        socketService.startConversationTyping(conversationId)
      } else {
        socketService.stopConversationTyping(conversationId)
      }
    },
    [conversationId],
  )

  const headerTitle = conversation?.title || `Direct Message (${partnerLabel})`
  const unreadCount = conversation?.unreadCount ?? 0

  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 bg-surface-1 border-b border-border rounded-t-lg">
        <h3 className="font-semibold text-white">{headerTitle}</h3>
        {unreadCount > 0 && (
          <span className="px-2 py-1 text-xs bg-red-600 text-white rounded-full">
            {unreadCount} unread
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {initializing ? (
          <div className="text-center text-muted py-4">Connecting to conversation…</div>
        ) : error ? (
          <div className="text-center text-red-400 py-4">{error}</div>
        ) : conversationId === null ? (
          <div className="text-center text-muted py-4">Preparing conversation…</div>
        ) : messages.length === 0 && isLoadingMessages ? (
          <div className="text-center text-muted py-4">Loading messages…</div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center mb-4">
                <button
                  type="button"
                  className="px-3 py-1 text-sm text-muted hover:text-white hover:bg-surface-2 rounded-md border border-border"
                  onClick={loadOlder}
                  disabled={Boolean(isLoadingMessages)}
                >
                  {isLoadingMessages ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="text-center text-muted py-4">
                No messages yet. Start the conversation!
              </div>
            ) : (
              <MessageList
                messages={messages}
                currentUserId={currentUserId}
                getDisplayName={getDisplayName}
              />
            )}
          </>
        )}

        {typingUsers.length > 0 && (
          <div className="text-sm text-muted italic mt-2">
            {typingUsers.join(', ')}
            {typingUsers.length === 1 ? ' is' : ' are'} typing…
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <MessageInput
        onSendMessage={sendMessage}
        onTyping={handleTyping}
        placeholder="Send a direct message…"
        maxLength={2000}
      />
    </div>
  )
}

function LegacyChat({ conversationType, conversationId, className = '' }: ChatContainerProps) {
  const dispatch = useAppDispatch()
  const currentUserId = useAppSelector((state) => state.auth.user?.id)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const conversationKey = `${conversationType}:${conversationId}`
  const conversation = useAppSelector((state) => state.chat.conversations[conversationKey])
  const messages = conversation?.messages ?? []
  const typingUsers = conversation?.typingUsers ?? []
  const isLoadingHistory = conversation?.isLoading ?? false

  const normalizeMessage = useCallback((message: ChatMessage): DisplayMessage => {
    const linkPreviews =
      message.link_previews && message.link_previews.length > 0
        ? { linkPreviews: message.link_previews }
        : undefined

    return {
      id: message.id,
      senderId: message.sender_id,
      senderName: message.sender_username,
      body: message.message,
      createdAt: message.created_at,
      editedAt: message.edited_at ?? null,
      deletedAt: message.deleted_at ?? null,
      metadata: linkPreviews,
    }
  }, [])

  const displayMessages = useMemo(() => messages.map(normalizeMessage), [messages, normalizeMessage])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  })

  useEffect(() => {
    if (!socketService.getSocket() || !currentUserId) return

    const conversationChanged = conversation?.id !== conversationKey
    if (conversationChanged) {
      dispatch(legacyLoadChatHistory({
        conversationId: conversationKey,
        messages: [],
        hasMore: true,
      }))
    }

    dispatch(setActiveConversation(conversationKey))

    if (!conversation) {
      socketService.loadChatHistory({
        messageType: conversationType,
        conversationId,
        limit: 50,
        offset: 0,
      })
    }

    const handleMessage = (messagePayload: ChatMessage) => {
      if (conversationType === 'game' && messagePayload.game_id === conversationId) {
        dispatch(addMessage({ message: messagePayload, currentUserId }))
      } else if (conversationType === 'team') {
        const [gameId, teamId] = conversationId.split(':')
        if (
          messagePayload.message_type === 'team' &&
          messagePayload.game_id === gameId &&
          messagePayload.team_id === parseInt(teamId, 10)
        ) {
          dispatch(addMessage({ message: messagePayload, currentUserId }))
        }
      }
    }

    const handleHistory = (data: { conversationId: string; messageType: ChatConversationType; messages: ChatMessage[] }) => {
      if (data.conversationId === conversationId && data.messageType === conversationType) {
        dispatch(
          legacyLoadChatHistory({
            conversationId: conversationKey,
            messages: data.messages,
            hasMore: data.messages.length === 50,
          }),
        )
      }
    }

    const handleTyping = (data: { conversationType: ChatConversationType; conversationId: string; userId: string; username: string; isTyping: boolean }) => {
      if (data.conversationType === conversationType && data.conversationId === conversationId) {
        dispatch(
          setTypingUser({
            conversationId: conversationKey,
            userId: data.userId,
            username: data.username,
            isTyping: data.isTyping,
          }),
        )
      }
    }

    const handleUnreadCounts = (counts: Array<{ conversation_type: ChatConversationType; conversation_id: string; unread_count: number }>) => {
      const formattedCounts = counts.map((c) => ({
        conversationType: c.conversation_type,
        conversationId: c.conversation_id,
        unreadCount: c.unread_count,
      }))
      dispatch(setUnreadCounts(formattedCounts))
    }

    const handleMessageEdited = (data: { messageId: string; newMessage: string; editedAt: string | Date }) => {
      dispatch(
        editMessage({
          messageId: data.messageId,
          newMessage: data.newMessage,
          editedAt: typeof data.editedAt === 'string' ? data.editedAt : data.editedAt.toISOString(),
        }),
      )
    }

    const handleMessageDeleted = (data: { messageId: string }) => {
      dispatch(deleteMessage(data.messageId))
    }

    socketService.on('chat:message', handleMessage)
    socketService.on('chat:history', handleHistory)
    socketService.on('chat:user-typing', handleTyping)
    socketService.on('chat:unread-counts', handleUnreadCounts)
    socketService.on('chat:message-edited', handleMessageEdited)
    socketService.on('chat:message-deleted', handleMessageDeleted)

    socketService.markChatAsRead({ conversationType, conversationId })
    dispatch(markMessagesAsRead(conversationKey))
    socketService.getChatUnreadCounts()

    return () => {
      socketService.off('chat:message', handleMessage)
      socketService.off('chat:history', handleHistory)
      socketService.off('chat:user-typing', handleTyping)
      socketService.off('chat:unread-counts', handleUnreadCounts)
      socketService.off('chat:message-edited', handleMessageEdited)
      socketService.off('chat:message-deleted', handleMessageDeleted)
      dispatch(setActiveConversation(null))
    }
  }, [conversation, conversationId, conversationKey, conversationType, currentUserId, dispatch])

  const sendMessage = (text: string) => {
    if (!socketService.getSocket() || !text.trim()) return

    let gameId: string | undefined
    let teamId: number | undefined

    if (conversationType === 'game') {
      gameId = conversationId
    } else if (conversationType === 'team') {
      const [gId, tId] = conversationId.split(':')
      gameId = gId
      teamId = parseInt(tId, 10)
    }

    socketService.sendChatMessage({
      message: text,
      messageType: conversationType,
      gameId,
      teamId,
    })
  }

  const handleTyping = (isTyping: boolean) => {
    if (!socketService.getSocket()) return

    socketService.sendTypingIndicator({
      conversationType,
      conversationId,
      isTyping,
    })
  }

  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 bg-surface-1 border-b border-border rounded-t-lg">
        <h3 className="font-semibold text-white">
          {conversationType === 'game'
            ? '🎮 Game Chat'
            : conversationType === 'team'
              ? '👥 Team Chat'
              : '💬 Direct Message'}
        </h3>
        {conversation?.unreadCount > 0 && (
          <span className="px-2 py-1 text-xs bg-red-600 text-white rounded-full">
            {conversation.unreadCount} unread
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoadingHistory ? (
          <div className="text-center text-muted py-4">Loading chat history...</div>
        ) : displayMessages.length === 0 ? (
          <div className="text-center text-muted py-4">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <MessageList
            messages={displayMessages}
            currentUserId={currentUserId}
            getDisplayName={(msg, isOwn) => (isOwn ? 'You' : msg.senderName)}
          />
        )}

        {typingUsers.length > 0 && (
          <div className="text-sm text-muted italic mt-2">
            {typingUsers.map((u) => u.username).join(', ')}
            {typingUsers.length === 1 ? ' is' : ' are'} typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <MessageInput
        onSendMessage={sendMessage}
        onTyping={handleTyping}
        placeholder={conversationType === 'game' ? 'Message everyone...' : 'Send a message...'}
      />
    </div>
  )
}
