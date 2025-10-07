import { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PlayerStatsTable } from '@/components/game/PlayerStatsTable'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { socketService } from '@/services/socketService'
import { addClientLog } from '@/store/uiRoomSlice'
import type { GamePlayer } from '@/types/game'
import ResizablePanel from './ResizablePanel'

interface PlayerStatsPanelProps {
  players: GamePlayer[]
  currentPlayerId?: string
  territories: Record<string, { owner?: string | null; armies?: number }>
  variant?: 'full' | 'compact' | 'minimal'
  isEditingLayout?: boolean
  onResignRequest?: () => void
}

/**
 * Player Stats panel wrapper with resize/minimize/pin controls
 */
export default function PlayerStatsPanel({
  players,
  currentPlayerId,
  territories,
  variant = 'full',
  isEditingLayout = false,
  onResignRequest,
}: PlayerStatsPanelProps) {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((s) => s.auth)
  const currentRoom = useAppSelector((s) => s.room.currentRoom)
  const currentGame = useAppSelector((s) => s.game.currentGame)
  const [activeTab, setActiveTab] = useState<'stats' | 'settings'>('stats')

  const canResign = useMemo(() => {
    if (!user || !currentRoom) return false
    const roomStatus = currentRoom.status
    const isActive = roomStatus === 'active'
    const gameOver =
      (currentGame?.phase ?? 'reinforcement') === 'finished' ||
      roomStatus === 'completed' ||
      roomStatus === 'abandoned'
    // Check membership from live game or room roster (pre-hydration)
    const isMemberInGame = (currentGame?.players || []).some((p) => (p.userId ?? p.id) === user.id)
    const isMemberInRoom = (currentRoom.players || []).some((p) => (p.userId ?? p.id) === user.id)
    const isMember = isMemberInGame || isMemberInRoom
    // Use game state to determine elimination when available
    const player = (currentGame?.players || []).find((p) => (p.userId ?? p.id) === user.id)
    const isEliminated = Boolean(player?.isEliminated)
    return isActive && isMember && !isEliminated && !gameOver
  }, [user, currentRoom, currentGame])

  const handleResign = () => {
    if (!currentRoom) return
    if (onResignRequest) {
      onResignRequest()
      return
    }
    const confirmed = window.confirm(
      'Are you sure you want to resign? Your territories will become neutral. This cannot be undone.',
    )
    if (!confirmed) return
    try {
      socketService.emit('player:resign', { roomId: currentRoom.id })
      dispatch(addClientLog({ text: 'You requested to resign.', roomId: currentRoom.id }))
      toast.success('Resign requested')
    } catch {
      /* ignore */
    }
  }

  return (
    <ResizablePanel
      panelId="player-stats"
      title="Player Stats"
      icon="📊"
      canResize={true}
      canMinimize={true}
      canClose={false}
      isEditingLayout={isEditingLayout}
    >
      <div className="h-full overflow-hidden flex flex-col">
        <div className="flex overflow-x-auto bg-[color:var(--surface-1)] border-b border-[color:var(--panel-border)]">
          {[
            { id: 'stats', label: 'Stats' },
            { id: 'settings', label: 'Game Options' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as 'stats' | 'settings')}
              className={`
                flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-all
                ${
                  activeTab === tab.id
                    ? 'bg-[color:var(--surface-2)] text-[color:var(--text)] border-b-2 border-[color:var(--color-primary)]'
                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)] hover:bg-[color:var(--surface-2)]/60'
                }
              `}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {activeTab === 'stats' ? (
            <div className="p-0">
              <PlayerStatsTable
                players={players}
                currentPlayerId={currentPlayerId}
                territories={territories}
                variant={variant}
              />
            </div>
          ) : (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[color:var(--heading)]">Resign</div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    Leave the match; your territories become neutral.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={!canResign}
                  onClick={handleResign}
                  title={canResign ? 'Resign from this game' : 'You cannot resign right now'}
                >
                  Resign
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ResizablePanel>
  )
}
