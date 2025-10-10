import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { lazyWithRetry } from '@/utils/lazyWithRetry'
import ResizablePanel from './ResizablePanel'

const LazyTabbedGameChat = lazyWithRetry(() => import('../chat/TabbedGameChat'))

interface ChatLogPanelProps {
  gameId: string
  currentUserId: string
  userTeamId?: number | null
  onLogFocus?: (territoryIds: string[]) => void
  isEditingLayout?: boolean
}

/**
 * Chat + Log panel wrapper with resize/minimize/pin controls
 * Wraps TabbedGameChat (which includes both chat and log tabs)
 */
export default function ChatLogPanel({
  gameId,
  currentUserId,
  userTeamId,
  onLogFocus,
  isEditingLayout = false,
}: ChatLogPanelProps) {
  return (
    <ResizablePanel
      panelId="chat"
      title="Chat & Log"
      icon="💬"
      canResize={true}
      canMinimize={true}
      canClose={false}
      className="max-h-[56vh] md:max-h-[48vh] lg:max-h-[38vh] xl:max-h-[32vh] 2xl:max-h-[28vh]"
      isEditingLayout={isEditingLayout}
    >
      <div className="h-full max-h-[56vh] md:max-h-[48vh] lg:max-h-[38vh] xl:max-h-[32vh] 2xl:max-h-[28vh] min-h-0 overflow-hidden flex flex-col">
        <Suspense
          fallback={
            <div className="flex-1 min-h-0 flex items-center justify-center p-4">
              <Skeleton variant="rectangular" width="100%" height="100%" />
            </div>
          }
        >
          <LazyTabbedGameChat
            gameId={gameId}
            currentUserId={currentUserId}
            className="flex-1 h-full max-h-[70vh]"
            {...(userTeamId !== undefined ? { userTeamId } : {})}
            {...(onLogFocus ? { onLogFocus } : {})}
          />
        </Suspense>
      </div>
    </ResizablePanel>
  )
}
