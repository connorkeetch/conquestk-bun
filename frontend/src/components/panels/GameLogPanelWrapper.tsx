import GameLogPanel from '@/components/chat/GameLogPanel'
import ResizablePanel from './ResizablePanel'

interface Props {
  gameId: string
  onLogFocus?: (territoryIds: string[]) => void
  isEditingLayout?: boolean
}

export default function GameLogPanelWrapper({
  gameId,
  onLogFocus,
  isEditingLayout = false,
}: Props) {
  return (
    <ResizablePanel
      panelId="game-log"
      title="Game Log"
      icon="📝"
      canResize={true}
      canMinimize={true}
      canClose={false}
      className="max-h-[70vh]"
      isEditingLayout={isEditingLayout}
    >
      <div className="h-full max-h-[70vh] min-h-0 overflow-hidden flex flex-col">
        <GameLogPanel gameId={gameId} className="h-full" onFocus={onLogFocus} />
      </div>
    </ResizablePanel>
  )
}
