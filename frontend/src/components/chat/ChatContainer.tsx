import type { ChatConversationType } from '@shared/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import { socketService } from '../../services/socketService'
import {
  ensureDirectConversation,
  ensureGameConversation,
  ensureTeamConversation,
  loadConversationMessages,
  messagesActions,
  refreshConversation,
  selectConversationById,
  selectHasMoreMessages,
  selectMessagesForConversation,
} from '../../store/messagesSlice'
import type { ConversationDetail } from '../../types/messages'
import MessageInput from './MessageInput'
import MessageList, { type DisplayMessage } from './MessageList'

type ChatContainerProps = {
  conversationType: ChatConversationType
  conversationId: string
  className?: string
}

export default function ChatContainer({
  conversationType,
  conversationId,
  className = '',
}: ChatContainerProps) {
  const dispatch = useAppDispatch()
  const currentUserId = useAppSelector((state) => state.auth.user?.id ?? null)
  const [resolvedConversationId, setResolvedConversationId] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const conversation = useAppSelector((state) =>
    resolvedConversationId ? selectConversationById(state, resolvedConversationId) : undefined,
  )
  const rawMessages = useAppSelector((state) =>
    resolvedConversationId ? selectMessagesForConversation(state, resolvedConversationId) : [],
  )
  const hasMore = useAppSelector((state) =>
    resolvedConversationId ? selectHasMoreMessages(state, resolvedConversationId) : false,
  )
  const isLoadingMessages = useAppSelector((state) =>
    resolvedConversationId
      ? Boolean(state.messages.loadingMessages[resolvedConversationId])
      : false,
  )
  const typingUsers = useAppSelector((state) =>
    resolvedConversationId
      ? Object.values(state.messages.typing[resolvedConversationId] ?? {})
      : [],
  )

  useEffect(() => {
    let cancelled = false

    const ensureConversation = async () => {
      setInitializing(true)
      setError(null)
      setResolvedConversationId(null)

      try {
        let detail: ConversationDetail

        switch (conversationType) {
          case 'dm': {
            detail = await dispatch(ensureDirectConversation(conversationId)).unwrap()
            break
          }
          case 'game': {
            detail = await dispatch(ensureGameConversation(conversationId)).unwrap()
            break
          }
          case 'team': {
            const [gameId, teamIdPart] = conversationId.split(':')
            const teamId = Number(teamIdPart)
            if (!gameId || Number.isNaN(teamId)) {
              throw new Error('Invalid team conversation identifier')
            }
            detail = await dispatch(ensureTeamConversation({ gameId, teamId })).unwrap()
            break
          }
          default:
            throw new Error('Unsupported conversation type')
        }

        if (cancelled) {
          return
        }

        const id = detail.conversation.id
        setResolvedConversationId(id)
        dispatch(messagesActions.setActiveConversationId(id))
        dispatch(loadConversationMessages({ conversationId: id, limit: 50 }))
        dispatch(refreshConversation(id))
        dispatch(messagesActions.markReadOptimistic(id))
        socketService.markConversationReadViaSocket(id)
      } catch (ensureError) {
        if (!cancelled) {
          setError(
            ensureError instanceof Error ? ensureError.message : 'Failed to load conversation',
          )
        }
      } finally {
        if (!cancelled) {
          setInitializing(false)
        }
      }
    }

    void ensureConversation()

    return () => {
      cancelled = true
      setResolvedConversationId(null)
      dispatch(messagesActions.setActiveConversationId(null))
    }
  }, [conversationType, conversationId, dispatch])

  useEffect(() => {
    if (rawMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [rawMessages.length])

  useEffect(() => {
    if (!resolvedConversationId || rawMessages.length === 0) {
      return
    }
    dispatch(messagesActions.markReadOptimistic(resolvedConversationId))
    socketService.markConversationReadViaSocket(resolvedConversationId)
  }, [dispatch, resolvedConversationId, rawMessages.length])

  const displayMessages: DisplayMessage[] = useMemo(() => {
    const memberNameMap = new Map(
      (conversation?.memberRoles ?? []).map((member) => [
        member.userId,
        member.username ?? member.userId,
      ]),
    )

    return rawMessages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      senderName:
        message.senderId === currentUserId
          ? 'You'
          : typeof message.metadata?.senderName === 'string'
            ? message.metadata.senderName
            : message.senderId
              ? (memberNameMap.get(message.senderId) ?? 'Player')
              : 'System',
      body: message.body,
      createdAt: message.createdAt,
      metadata: message.metadata,
    }))
  }, [conversation?.memberRoles, rawMessages, currentUserId])

  const handleLoadOlder = useCallback(() => {
    if (!resolvedConversationId) {
      return
    }
    const existing = rawMessages
    if (existing.length === 0) {
      dispatch(loadConversationMessages({ conversationId: resolvedConversationId, limit: 50 }))
      return
    }
    const oldest = existing[0]
    dispatch(
      loadConversationMessages({
        conversationId: resolvedConversationId,
        before: oldest.id,
        limit: 50,
      }),
    )
  }, [dispatch, rawMessages, resolvedConversationId])

  const sendMessage = useCallback(
    (text: string) => {
      if (!resolvedConversationId || !text.trim()) {
        return
      }

      socketService.sendConversationMessage(
        { conversationId: resolvedConversationId, body: text },
        (ack) => {
          if (!ack?.ok && ack?.error) {
            setError(ack.error)
          }
        },
      )
    },
    [resolvedConversationId],
  )

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!resolvedConversationId) {
        return
      }
      if (isTyping) {
        socketService.startConversationTyping(resolvedConversationId)
      } else {
        socketService.stopConversationTyping(resolvedConversationId)
      }
    },
    [resolvedConversationId],
  )

  // We intentionally suppress the header/subheader inside the chat container
  // to keep the panel clean in the game room. Tab labels convey context.

  if (initializing) {
    return (
      <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
        <div className="flex-1 flex items-center justify-center text-sm text-muted">
          Connecting…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
        <div className="flex-1 flex items-center justify-center text-sm text-red-400">{error}</div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {hasMore && (
          <div className="text-center">
            <button
              type="button"
              className="px-3 py-1 text-xs text-muted border border-border rounded-md hover:text-white hover:bg-surface-2/60 transition"
              onClick={handleLoadOlder}
              disabled={isLoadingMessages}
            >
              {isLoadingMessages ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {displayMessages.length === 0 && !isLoadingMessages ? (
          <div className="text-center text-muted py-6 text-sm">No messages yet.</div>
        ) : (
          <MessageList messages={displayMessages} currentUserId={currentUserId} />
        )}

        {typingUsers.length > 0 && (
          <div className="text-sm text-muted italic">
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border bg-surface-1/80">
        {conversation?.isReadOnly ? (
          <div className="px-4 py-3 text-sm text-muted">This conversation is read-only.</div>
        ) : (
          <MessageInput
            onSendMessage={sendMessage}
            onTyping={handleTyping}
            placeholder={conversationType === 'game' ? 'Message everyone…' : 'Send a message…'}
            maxLength={2000}
          />
        )}
      </div>
    </div>
  )
}
