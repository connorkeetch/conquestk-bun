import { useEffect, useMemo, useState } from 'react'
import { useAppSelector } from '../../hooks/redux'
import ChatContainer from './ChatContainer'

interface ChatPlayer {
  userId: string
  username: string
  teamId?: number | null
}

interface TabbedGameChatProps {
  gameId: string
  players: ChatPlayer[]
  currentUserId: string
  userTeamId?: number | null
  className?: string
}

interface ChatTab {
  id: string
  label: string
  type: 'game' | 'team' | 'dm'
  conversationId: string
  badge?: number
  enabled: boolean
}

export default function TabbedGameChat({
  gameId,
  players,
  currentUserId,
  userTeamId,
  className = '',
}: TabbedGameChatProps) {
  const [activeTab, setActiveTab] = useState<string>('game')
  const unreadCounts = useAppSelector((state) => state.chat.conversations)

  // Build tabs
  const tabs = useMemo<ChatTab[]>(() => {
    const builtTabs: ChatTab[] = []

    builtTabs.push({
      id: 'game',
      label: '🎮 Game',
      type: 'game',
      conversationId: gameId,
      badge: unreadCounts[`game:${gameId}`]?.unreadCount || 0,
      enabled: true,
    })

    if (userTeamId !== null && userTeamId !== undefined) {
      builtTabs.push({
        id: 'team',
        label: '👥 Team',
        type: 'team',
        conversationId: `${gameId}:${userTeamId}`,
        badge: unreadCounts[`team:${gameId}:${userTeamId}`]?.unreadCount || 0,
        enabled: true,
      })
    }

    players
      .filter((player) => player.userId && player.userId !== currentUserId)
      .forEach((player) => {
        const userId = player.userId as string
        const isTeammate = userTeamId !== null && player.teamId === userTeamId
        const teamIndicator = isTeammate ? ' 🤝' : ''

        builtTabs.push({
          id: `dm-${userId}`,
          label: `💬 ${player.username}${teamIndicator}`,
          type: 'dm',
          conversationId: userId,
          badge: unreadCounts[`dm:${userId}`]?.unreadCount || 0,
          enabled: true,
        })
      })

    return builtTabs
  }, [currentUserId, gameId, players, unreadCounts, userTeamId])

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
                  ? 'bg-surface-2 text-white border-b-2 border-primary'
                  : 'text-muted hover:text-white hover:bg-surface-2/50'
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

      {/* Chat Content */}
      <div className="flex-1 min-h-0">
        <ChatContainer
          conversationType={activeTabData.type}
          conversationId={activeTabData.conversationId}
          className="h-full"
        />
      </div>
    </div>
  )
}
