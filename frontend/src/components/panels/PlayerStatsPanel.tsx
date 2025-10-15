import { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PlayerStatsTable } from '@/components/game/PlayerStatsTable'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { resignFromGame } from '@/store/gameActions'
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

  // Merge live room roster metadata (e.g., missedTurns) into the provided players list
  const playersForTable = useMemo(() => {
    if (!players || players.length === 0) return players
    const roomPlayerMap = new Map<string, { missedTurns?: number }>()
    for (const rp of currentRoom?.players || []) {
      const key = (rp.userId ?? rp.id) as string
      roomPlayerMap.set(key, { missedTurns: rp.missedTurns ?? 0 })
    }
    return players.map((p) => {
      const key = (p.userId ?? p.id) as string
      const meta = roomPlayerMap.get(key)
      return meta ? { ...p, missedTurns: meta.missedTurns ?? 0 } : p
    })
  }, [players, currentRoom?.players])

  const canResign = useMemo(() => {
    if (!user || !currentRoom) return false
    const roomStatus = currentRoom.status
    const isActive = roomStatus === 'active'
    const gameOver =
      (currentGame?.phase ?? 'reinforcement') === 'finished' ||
      roomStatus === 'completed' ||
      roomStatus === 'abandoned'
    // Check membership from live game or room roster (pre-hydration)
    const isMemberInGame = (
      (currentGame?.players || []) as Array<{ userId?: string; id: string }>
    ).some((p) => (p.userId ?? p.id) === user.id)
    const isMemberInRoom = (
      (currentRoom.players || []) as Array<{ userId?: string; id: string }>
    ).some((p) => (p.userId ?? p.id) === user.id)
    const isMember = isMemberInGame || isMemberInRoom
    // Use game state to determine elimination when available
    const player = (
      (currentGame?.players || []) as Array<{ userId?: string; id: string; isEliminated?: boolean }>
    ).find((p) => (p.userId ?? p.id) === user.id)
    const isEliminated = Boolean(player?.isEliminated)
    return isActive && isMember && !isEliminated && !gameOver
  }, [user, currentRoom, currentGame])

  const gameFinished = useMemo(() => {
    const roomStatus = currentRoom?.status
    const phase = currentGame?.phase
    return phase === 'finished' || roomStatus === 'completed' || roomStatus === 'abandoned'
  }, [currentGame?.phase, currentRoom?.status])

  const handleResign = () => {
    if (!currentRoom) return
    if (onResignRequest) {
      onResignRequest()
      return
    }
    const confirmed = window.confirm(
      'Are you sure you want to resign? Your territories will immediately become neutral. This cannot be undone.',
    )
    if (!confirmed) return
    dispatch(resignFromGame(currentRoom.id))
    dispatch(
      addClientLog({
        text: 'You resigned. Territories are now neutral.',
        roomId: currentRoom.id,
      }),
    )
    toast.success('Resigned')
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
                players={playersForTable}
                territories={territories}
                variant={variant}
                gameFinished={gameFinished}
                {...(currentPlayerId !== undefined ? { currentPlayerId } : {})}
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
