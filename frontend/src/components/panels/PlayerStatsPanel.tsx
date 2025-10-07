import { PlayerStatsTable } from '@/components/game/PlayerStatsTable'
import type { GamePlayer } from '@/types/game'
import ResizablePanel from './ResizablePanel'

interface PlayerStatsPanelProps {
  players: GamePlayer[]
  currentPlayerId?: string
  territories: Record<string, { owner?: string | null; armies?: number }>
  variant?: 'full' | 'compact' | 'minimal'
}

/**
 * Player Stats panel wrapper with resize/minimize/pin controls
 */
export default function PlayerStatsPanel({
  players,
  currentPlayerId,
  territories,
  variant = 'full',
}: PlayerStatsPanelProps) {
  return (
    <ResizablePanel
      panelId="player-stats"
      title="Player Stats"
      icon="📊"
      canResize={true}
      canMinimize={true}
      canClose={false}
    >
      <div className="h-full overflow-auto">
        <PlayerStatsTable
          players={players}
          currentPlayerId={currentPlayerId}
          territories={territories}
          variant={variant}
        />
      </div>
    </ResizablePanel>
  )
}
