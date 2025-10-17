import type { ChatConversationType } from '@shared/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { getPlayerTextColor, type PlayerColor } from '@/constants/colors'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { socketService } from '@/services/socketService'
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
  const currentUser = useAppSelector((state) => state.auth.user)
  const currentUserId = currentUser?.id ?? null
  const currentUsername = currentUser?.username ?? null
  const [resolvedConversationId, setResolvedConversationId] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)

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
  const [profileUsername, setProfileUsername] = useState<string | null>(null)

  // Map game player userId -> resolved hex color for quick lookup
  const playerColorByUserId = useAppSelector((state) => {
    const map = new Map<string, string>()
    const addColor = (key?: string | null, raw?: PlayerColor | string | null) => {
      if (!key || !raw) return
      const resolved = getPlayerTextColor(raw)
      if (resolved) map.set(key, resolved)
    }

    const players = state.game.currentGame?.players ?? []
    for (const p of players) {
      addColor(p.userId, p.color)
      addColor(p.id, p.color)
    }

    const roomPlayers = state.room.currentRoom?.players ?? []
    for (const player of roomPlayers) {
      const color = player.selectedColor ?? player.preferred_color ?? null
      addColor(player.userId ?? player.id, color)
      addColor(player.id, color)
    }

    return map
  })

  // Scroll helpers: only snap to newest when near bottom; offer jump button otherwise
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    const el = scrollRef.current
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

  useEffect(() => {
    if (!resolvedConversationId) return
    if (isNearBottom) {
      scrollToBottom()
    } else if ((rawMessages?.length ?? 0) > 0) {
      setShowJumpToLatest(true)
    }
  }, [resolvedConversationId, rawMessages.length, isNearBottom, scrollToBottom])

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
        const accessLevel = detail.membership.accessLevel ?? 'member'
        setResolvedConversationId(id)
        dispatch(messagesActions.setActiveConversationId(id))
        // Load the most recent 20 messages by default
        dispatch(loadConversationMessages({ conversationId: id, limit: 20 }))
        dispatch(refreshConversation(id))
        if (accessLevel === 'member') {
          dispatch(messagesActions.markReadOptimistic(id))
          socketService.markConversationReadViaSocket(id)
        }
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

  const isSpectator = conversation?.membership?.accessLevel === 'spectator'

  useEffect(() => {
    if (!resolvedConversationId || rawMessages.length === 0 || isSpectator) {
      return
    }
    dispatch(messagesActions.markReadOptimistic(resolvedConversationId))
    socketService.markConversationReadViaSocket(resolvedConversationId)
  }, [dispatch, resolvedConversationId, rawMessages.length, isSpectator])

  const mutedIds = useAppSelector((s) => new Set(s.uiRoom.mutedUserIds ?? []))
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
    const memberNameMap = new Map(
      (conversation?.memberRoles ?? []).map((member) => [
        member.userId,
        member.username ?? member.userId,
      ]),
    )

    return rawMessages
      .filter((message) => (message.senderId ? !mutedIds.has(message.senderId) : true))
      .map((message) => ({
        id: message.id,
        senderId: message.senderId,
        senderName:
          message.senderId === currentUserId
            ? selfDisplayName
            : typeof message.metadata?.senderName === 'string'
              ? message.metadata.senderName
              : message.senderId
                ? (memberNameMap.get(message.senderId) ?? 'Player')
                : 'System',
        body: message.body,
        createdAt: message.createdAt,
        metadata: message.metadata,
      }))
  }, [conversation?.memberRoles, rawMessages, currentUserId, mutedIds, selfDisplayName])

  const handleLoadOlder = useCallback(() => {
    if (!resolvedConversationId) {
      return
    }
    const existing = rawMessages
    if (existing.length === 0) {
      // Initial fetch for older messages if none are present yet
      dispatch(loadConversationMessages({ conversationId: resolvedConversationId, limit: 20 }))
      return
    }
    const oldest = existing[0]
    dispatch(
      loadConversationMessages({
        conversationId: resolvedConversationId,
        before: oldest.id,
        // Page older messages in batches of 20
        limit: 20,
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
      <div
        className={`flex flex-col h-full min-h-0 overflow-hidden bg-surface-1 rounded-lg ${className}`}
      >
        <div className="flex-1 flex items-center justify-center text-sm text-muted">
          Connecting…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={`flex flex-col h-full min-h-0 overflow-hidden bg-surface-1 rounded-lg ${className}`}
      >
        <div className="flex-1 flex items-center justify-center text-sm text-red-400">{error}</div>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col h-full min-h-0 overflow-hidden bg-surface-1 rounded-lg ${className}`}
    >
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto p-4 space-y-4">
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
          <MessageList
            messages={displayMessages}
            currentUserId={currentUserId}
            getDisplayName={(message, isOwn) => {
              if (isOwn) {
                return selfDisplayName
              }
              return message.senderName ?? undefined
            }}
            getSenderColor={(message) =>
              message.senderId ? playerColorByUserId.get(message.senderId) : undefined
            }
            onUserClick={(name) => setProfileUsername(name)}
          />
        )}

        {typingUsers.length > 0 && (
          <div className="text-sm text-muted italic">
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
          </div>
        )}

        {showJumpToLatest && (
          <div className="absolute bottom-4 right-4">
            <button type="button" className="btn-primary btn-sm" onClick={scrollToBottom}>
              Jump to latest
            </button>
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
      <PlayerProfileModal
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
      />
    </div>
  )
}
