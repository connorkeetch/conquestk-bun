import { useState, useEffect } from 'react'
import { useAppSelector } from '../../hooks/redux'
import ChatContainer from './ChatContainer'
import type { Player } from '../../types/game'

interface TabbedGameChatProps {
  gameId: string
  players: Player[]
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
  className = ''
}: TabbedGameChatProps) {
  const [activeTab, setActiveTab] = useState<string>('game')
  const unreadCounts = useAppSelector(state => state.chat.conversations)
  
  // Build tabs
  const tabs: ChatTab[] = []
  
  // Game chat tab (always available)
  tabs.push({
    id: 'game',
    label: '🎮 Game',
    type: 'game',
    conversationId: gameId,
    badge: unreadCounts[`game:${gameId}`]?.unreadCount || 0,
    enabled: true
  })
  
  // Team chat tab (only if user is on a team)
  if (userTeamId !== null && userTeamId !== undefined) {
    tabs.push({
      id: 'team',
      label: '👥 Team',
      type: 'team',
      conversationId: `${gameId}:${userTeamId}`,
      badge: unreadCounts[`team:${gameId}:${userTeamId}`]?.unreadCount || 0,
      enabled: true
    })
  }
  
  // Player DM tabs (for other players in the game)
  const otherPlayers = players.filter(p => p.userId !== currentUserId)
  otherPlayers.forEach(player => {
    // Show team indicator if they're on the same team
    const isTeammate = userTeamId !== null && player.teamId === userTeamId
    const teamIndicator = isTeammate ? ' 🤝' : ''
    
    tabs.push({
      id: `dm-${player.userId}`,
      label: `💬 ${player.username}${teamIndicator}`,
      type: 'dm',
      conversationId: player.userId,
      badge: unreadCounts[`dm:${player.userId}`]?.unreadCount || 0,
      enabled: true
    })
  })
  
  // Make sure active tab is valid
  useEffect(() => {
    const activeTabExists = tabs.some(tab => tab.id === activeTab)
    if (!activeTabExists && tabs.length > 0) {
      setActiveTab(tabs[0].id)
    }
  }, [tabs, activeTab])
  
  const activeTabData = tabs.find(tab => tab.id === activeTab)
  
  if (!activeTabData) {
    return null
  }
  
  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      {/* Tab Headers */}
      <div className="flex overflow-x-auto bg-surface-1 rounded-t-lg border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            disabled={!tab.enabled}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
              transition-all relative
              ${activeTab === tab.id
                ? 'bg-surface-2 text-white border-b-2 border-primary'
                : 'text-muted hover:text-white hover:bg-surface-2/50'
              }
              ${!tab.enabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <span>{tab.label}</span>
            
            {/* Unread badge */}
            {tab.badge > 0 && (
              <span className="px-2 py-0.5 text-xs bg-red-600 text-white rounded-full">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
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