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
      className="max-h-[56vh] md:max-h-[48vh] lg:max-h-[38vh] xl:max-h-[32vh] 2xl:max-h-[28vh]"
      isEditingLayout={isEditingLayout}
    >
      <div className="h-full max-h-[56vh] md:max-h-[48vh] lg:max-h-[38vh] xl:max-h-[32vh] 2xl:max-h-[28vh] min-h-0 overflow-hidden flex flex-col">
        <GameLogPanel
          gameId={gameId}
          className="h-full"
          {...(onLogFocus ? { onFocus: onLogFocus } : {})}
        />
      </div>
    </ResizablePanel>
  )
}
