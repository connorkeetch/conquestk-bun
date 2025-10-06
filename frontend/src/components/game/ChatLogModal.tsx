import { useEffect, useRef } from 'react'
import TabbedGameChat from '../chat/TabbedGameChat'

interface ChatLogModalProps {
  isOpen: boolean
  onClose: () => void
  gameId: string
  currentUserId: string
  userTeamId?: number | null
  onLogFocus?: (territoryIds: string[]) => void
}

export default function ChatLogModal({
  isOpen,
  onClose,
  gameId,
  currentUserId,
  userTeamId,
  onLogFocus,
}: ChatLogModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Handle clicking outside modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-surface-1 rounded-xl border border-border w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💬</span>
            <div>
              <h2 className="text-xl font-bold">Chat & Log</h2>
              <p className="text-muted text-sm">Game communication and events</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted hidden md:block">
              Press <kbd className="px-2 py-1 bg-surface-2 rounded text-xs">Esc</kbd> to close
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-surface-2 rounded-lg transition-colors text-muted hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 p-4">
          <TabbedGameChat
            gameId={gameId}
            currentUserId={currentUserId}
            userTeamId={userTeamId}
            onLogFocus={onLogFocus}
            className="h-full"
          />
        </div>
      </div>
    </div>
  )
}
