import type {
  ChatConversationType,
  ChatHistoryPayload,
  ChatMessagePayload,
  ChatUnreadCount,
  ServerToClientEvents,
} from '@shared/types'
import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import { socketService } from '../../services/socketService'
import {
  addMessage,
  deleteMessage,
  editMessage,
  loadChatHistory,
  markMessagesAsRead,
  setActiveConversation,
  setTypingUser,
  setUnreadCounts,
} from '../../store/chatSlice'
import type { ChatMessage, LinkPreview } from '../../store/chatSlice'
import MessageInput from './MessageInput'
import MessageList from './MessageList'

interface ChatContainerProps {
  conversationType: 'game' | 'team' | 'dm'
  conversationId: string // gameId for games, gameId:teamId for teams, userId for DMs
  className?: string
}

export default function ChatContainer({
  conversationType,
  conversationId,
  className = '',
}: ChatContainerProps) {
  const dispatch = useAppDispatch()
  const currentUserId = useAppSelector((state) => state.auth.user?.id)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const historyRequestedRef = useRef(false)
  const lastConversationKeyRef = useRef<string | null>(null)

  const normalizeTimestamp = (value?: string | Date | null) => {
    if (!value) return undefined
    return typeof value === 'string' ? value : value.toISOString()
  }

  const adaptLinkPreview = (
    preview: NonNullable<ChatMessagePayload['link_previews']>[number],
  ): LinkPreview => ({
    url: preview.url,
    title: preview.title,
    description: preview.description,
    image: preview.image,
    siteName:
      preview.siteName ??
      ((): string | undefined => {
        const legacy = preview as { site_name?: unknown }
        return typeof legacy.site_name === 'string' ? legacy.site_name : undefined
      })(),
  })

  const adaptChatMessage = (payload: ChatMessagePayload): ChatMessage => ({
    id: payload.id,
    sender_id: payload.sender_id,
    sender_username: payload.sender_username,
    message: payload.message,
    message_type: payload.message_type,
    game_id: payload.game_id ?? undefined,
    team_id: payload.team_id ?? undefined,
    recipient_id: payload.recipient_id ?? undefined,
    created_at: normalizeTimestamp(payload.created_at) ?? new Date().toISOString(),
    edited_at: normalizeTimestamp(payload.edited_at),
    deleted_at: normalizeTimestamp(payload.deleted_at),
    is_read: false,
    link_previews: payload.link_previews?.map(adaptLinkPreview),
  })

  // Build conversation key
  const conversationKey = `${conversationType}:${conversationId}`
  const conversation = useAppSelector((state) => state.chat.conversations[conversationKey])
  const messages = conversation?.messages || []
  const typingUsers = conversation?.typingUsers || []

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  })

  // Set up socket listeners and load history
  useEffect(() => {
    if (!socketService.getSocket() || !currentUserId) return

    const conversationChanged = lastConversationKeyRef.current !== conversationKey
    if (conversationChanged) {
      historyRequestedRef.current = false
      setIsLoadingHistory(false)
      lastConversationKeyRef.current = conversationKey
    }

    // Set active conversation
    dispatch(setActiveConversation(conversationKey))

    // Load chat history
    if (!historyRequestedRef.current) {
      historyRequestedRef.current = true
      setIsLoadingHistory(true)
      socketService.loadChatHistory({
        messageType: conversationType,
        conversationId,
        limit: 50,
        offset: 0,
      })
    }

    // Socket event handlers
    const handleMessage = (message: ChatMessagePayload) => {
      // Only add messages for this conversation
      if (conversationType === 'game' && message.game_id === conversationId) {
        dispatch(addMessage({ message: adaptChatMessage(message), currentUserId }))
      } else if (conversationType === 'team') {
        const [gameId, teamId] = conversationId.split(':')
        if (
          message.message_type === 'team' &&
          message.game_id === gameId &&
          message.team_id === parseInt(teamId, 10)
        ) {
          dispatch(addMessage({ message: adaptChatMessage(message), currentUserId }))
        }
      } else if (conversationType === 'dm') {
        const isDMForUs =
          (message.sender_id === currentUserId && message.recipient_id === conversationId) ||
          (message.sender_id === conversationId && message.recipient_id === currentUserId)
        if (isDMForUs) {
          dispatch(addMessage({ message: adaptChatMessage(message), currentUserId }))
        }
      }
    }

    const handleHistory = (data: ChatHistoryPayload) => {
      if (data.conversationId === conversationId && data.messageType === conversationType) {
        dispatch(
          loadChatHistory({
            conversationId: conversationKey,
            messages: data.messages.map(adaptChatMessage),
            hasMore: data.messages.length === 50,
          }),
        )
        setIsLoadingHistory(false)
      }
    }

    const handleTyping = (
      data: Parameters<ServerToClientEvents['chat:user-typing']>[0],
    ) => {
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

    const handleUnreadCounts = (counts: ChatUnreadCount[]) => {
      const formattedCounts = counts.map((c) => ({
        conversationType: c.conversation_type as ChatConversationType,
        conversationId: c.conversation_id,
        unreadCount: c.unread_count,
      }))
      dispatch(setUnreadCounts(formattedCounts))
    }

    const handleMessageEdited = (
      data: Parameters<ServerToClientEvents['chat:message-edited']>[0],
    ) => {
      const editedAt =
        typeof data.editedAt === 'string' ? data.editedAt : new Date(data.editedAt).toISOString()
      dispatch(
        editMessage({
          messageId: data.messageId,
          newMessage: data.newMessage,
          editedAt,
        }),
      )
    }

    const handleMessageDeleted = (
      data: Parameters<ServerToClientEvents['chat:message-deleted']>[0],
    ) => {
      dispatch(deleteMessage(data.messageId))
    }

    // Listen for events
    socketService.on('chat:message', handleMessage)
    socketService.on('chat:history', handleHistory)
    socketService.on('chat:user-typing', handleTyping)
    socketService.on('chat:unread-counts', handleUnreadCounts)
    socketService.on('chat:message-edited', handleMessageEdited)
    socketService.on('chat:message-deleted', handleMessageDeleted)

    // Mark messages as read
    socketService.markChatAsRead({
      conversationType,
      conversationId,
    })
    dispatch(markMessagesAsRead(conversationKey))

    // Request unread counts
    socketService.getChatUnreadCounts()

    return () => {
      // Clean up listeners
      socketService.off('chat:message', handleMessage)
      socketService.off('chat:history', handleHistory)
      socketService.off('chat:user-typing', handleTyping)
      socketService.off('chat:unread-counts', handleUnreadCounts)
      socketService.off('chat:message-edited', handleMessageEdited)
      socketService.off('chat:message-deleted', handleMessageDeleted)

      // Clear active conversation
      dispatch(setActiveConversation(null))
    }
  }, [conversationType, conversationId, conversationKey, currentUserId, dispatch])

  const sendMessage = (text: string) => {
    if (!socketService.getSocket() || !text.trim()) return

    let gameId: string | undefined
    let teamId: number | undefined
    let recipientId: string | undefined

    if (conversationType === 'game') {
      gameId = conversationId
    } else if (conversationType === 'team') {
      const [gId, tId] = conversationId.split(':')
      gameId = gId
      teamId = parseInt(tId, 10)
    } else if (conversationType === 'dm') {
      recipientId = conversationId
    }

    socketService.sendChatMessage({
      message: text,
      messageType: conversationType,
      gameId,
      teamId,
      recipientId,
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
      {/* Header */}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoadingHistory ? (
          <div className="text-center text-muted py-4">Loading chat history...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted py-4">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <MessageList messages={messages} currentUserId={currentUserId || ''} />
        )}

        {/* Typing indicators */}
        {typingUsers.length > 0 && (
          <div className="text-sm text-muted italic mt-2">
            {typingUsers.map((u) => u.username).join(', ')}
            {typingUsers.length === 1 ? ' is' : ' are'} typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSendMessage={sendMessage}
        onTyping={handleTyping}
        placeholder={conversationType === 'game' ? 'Message everyone...' : 'Send a message...'}
      />
    </div>
  )
}
