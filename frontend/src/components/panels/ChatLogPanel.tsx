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
}: ChatLogPanelProps) {
  return (
    <ResizablePanel
      panelId="chat"
      title="Chat & Log"
      icon="💬"
      canResize={true}
      canMinimize={true}
      canClose={false}
    >
      <div className="h-full overflow-hidden flex flex-col">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center p-4">
              <Skeleton variant="rectangular" width="100%" height="100%" />
            </div>
          }
        >
          <LazyTabbedGameChat
            gameId={gameId}
            currentUserId={currentUserId}
            userTeamId={userTeamId}
            className="h-full"
            onLogFocus={onLogFocus}
          />
        </Suspense>
      </div>
    </ResizablePanel>
  )
}
