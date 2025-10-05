import { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import {
  ensureGameConversation,
  ensureTeamConversation,
  selectAllConversations,
} from '../../store/messagesSlice'
import ChatContainer from './ChatContainer'
import GameLogPanel from './GameLogPanel'
import GameOptionsPanel from './GameOptionsPanel'

interface TabbedGameChatProps {
  gameId: string
  currentUserId: string
  userTeamId?: number | null
  className?: string
  onLogFocus?: (territoryIds: string[]) => void
}

interface ChatTab {
  id: string
  label: string
  type: 'game' | 'team' | 'dm' | 'options' | 'log'
  conversationId: string
  badge?: number
  enabled: boolean
}

export default function TabbedGameChat({
  gameId,
  currentUserId,
  userTeamId,
  className = '',
  onLogFocus,
}: TabbedGameChatProps) {
  const dispatch = useAppDispatch()
  const [activeTab, setActiveTab] = useState<string>('game')
  const conversations = useAppSelector(selectAllConversations)

  // Note: we no longer gate chat by membership; spectators can view game chat

  // Always ensure game conversation for the current user so chat is available even when solo or spectating
  useEffect(() => {
    if (!currentUserId) return
    void dispatch(ensureGameConversation(gameId))
  }, [dispatch, gameId, currentUserId])

  useEffect(() => {
    if (userTeamId !== null && userTeamId !== undefined) {
      void dispatch(ensureTeamConversation({ gameId, teamId: userTeamId }))
    }
  }, [dispatch, gameId, userTeamId])

  const gameConversation = useMemo(
    () =>
      conversations.find(
        (conversationEntity) =>
          conversationEntity.kind === 'game' && conversationEntity.gameId === gameId,
      ),
    [conversations, gameId],
  )

  const teamConversation = useMemo(() => {
    if (userTeamId === null || userTeamId === undefined) {
      return undefined
    }
    return conversations.find(
      (conversationEntity) =>
        conversationEntity.kind === 'team' &&
        conversationEntity.gameId === gameId &&
        Number(conversationEntity.metadata?.teamId) === userTeamId,
    )
  }, [conversations, gameId, userTeamId])

  // DM tabs are intentionally excluded from in-game chat

  // Build tabs
  const tabs = useMemo<ChatTab[]>(() => {
    const builtTabs: ChatTab[] = []

    // Include game tab only if the game conversation is not archived
    if (!gameConversation || !gameConversation.isArchived) {
      builtTabs.push({
        id: 'game',
        label: 'Game Chat',
        type: 'game',
        conversationId: gameId,
        badge: gameConversation?.unreadCount ?? 0,
        enabled: true,
      })
    }

    if (userTeamId !== null && userTeamId !== undefined) {
      // Include team tab only if the team conversation is not archived
      if (!teamConversation || !teamConversation.isArchived) {
        builtTabs.push({
          id: 'team',
          label: 'Team Chat',
          type: 'team',
          conversationId: `${gameId}:${userTeamId}`,
          badge: teamConversation?.unreadCount ?? 0,
          enabled: true,
        })
      }
    }

    // No DM tabs in game room chat; DMs live in Inbox only

    // Game Options tab (always available)
    builtTabs.push({
      id: 'options',
      label: 'Game Options',
      type: 'options',
      conversationId: '',
      enabled: true,
    })

    // Log tab (always available)
    builtTabs.push({
      id: 'log',
      label: 'Log',
      type: 'log',
      conversationId: '',
      enabled: true,
    })

    return builtTabs
  }, [gameId, userTeamId, gameConversation, teamConversation])

  // Make sure active tab is valid
  useEffect(() => {
    const activeTabExists = tabs.some((tab) => tab.id === activeTab)
    if (!activeTabExists && tabs.length > 0) {
      setActiveTab(tabs[0].id)
    }
  }, [tabs, activeTab])

  const activeTabData = tabs.find((tab) => tab.id === activeTab)

  if (!activeTabData) {
    return null
  }

  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      {/* Tab Headers */}
      <div className="flex overflow-x-auto bg-surface-1 rounded-t-lg border-b border-border">
        {tabs.map((tab) => {
          const badgeCount = tab.badge ?? 0
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={!tab.enabled}
              className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
              transition-all relative
              ${
                activeTab === tab.id
                  ? 'bg-surface-2 text-[color:var(--color-text)] border-b-2 border-primary'
                  : 'text-muted hover:text-[color:var(--color-text)] hover:bg-surface-2/50'
              }
              ${!tab.enabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
              type="button"
            >
              <span>{tab.label}</span>

              {/* Unread badge */}
              {badgeCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-red-600 text-white rounded-full">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTabData.type === 'game' || activeTabData.type === 'team' ? (
          <ChatContainer
            conversationType={activeTabData.type as 'game' | 'team'}
            conversationId={activeTabData.conversationId}
            className="h-full"
          />
        ) : activeTabData.type === 'options' ? (
          <GameOptionsPanel className="h-full" />
        ) : (
          <GameLogPanel gameId={gameId} className="h-full" onFocus={onLogFocus} />
        )}
      </div>
    </div>
  )
}
