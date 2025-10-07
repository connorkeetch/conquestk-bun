import { useState } from 'react'
import audioService from '../../services/audioService'

interface GameRoomFooterProps {
  onChatClick: () => void
  onSettingsClick: () => void
  onHelpClick?: () => void
  onStatsClick?: () => void
  onLayoutClick?: () => void
  isMobileDrawerOpen?: boolean
  className?: string
}

export default function GameRoomFooter({
  onChatClick,
  onSettingsClick,
  onHelpClick,
  onStatsClick,
  onLayoutClick,
  isMobileDrawerOpen = false,
  className = '',
}: GameRoomFooterProps) {
  const [isMuted, setIsMuted] = useState(() => audioService.isMutedState())

  const handleToggleMute = () => {
    audioService.toggleMute()
    setIsMuted(audioService.isMutedState())
  }

  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-40 bg-surface-1/80 backdrop-blur-md border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.1)] ${className}`}
      style={{
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div className="mx-auto max-w-[1200px] px-4 py-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {/* Desktop Layout - Left aligned buttons */}
          <div className="hidden md:flex items-center gap-2 mx-auto">
            {/* Player Stats Button (desktop, with label) */}
            {onStatsClick && (
              <button
                type="button"
                onClick={onStatsClick}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-2/80 border border-border transition-all group"
                title="Player Stats"
                aria-label="Player Stats"
              >
                <span className="text-lg" aria-hidden="true">
                  📊
                </span>
                <span className="text-sm font-medium">Player Stats</span>
              </button>
            )}

            {/* Chat/Log Button */}
            <button
              type="button"
              onClick={onChatClick}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-2/80 border border-border transition-all group"
              title="Open Chat & Log"
              aria-label="Open Chat & Log"
            >
              <span className="text-lg" aria-hidden="true">
                💬
              </span>
              <span className="text-sm font-medium">Chat & Log</span>
            </button>

            {/* Mute Button */}
            <button
              type="button"
              onClick={handleToggleMute}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-2/80 border border-border transition-all group"
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-colors ${isMuted ? 'text-[color:var(--color-danger)]' : 'text-[color:var(--color-success)]'}`}
                aria-hidden="true"
              >
                {isMuted ? (
                  <>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </>
                ) : (
                  <>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </>
                )}
              </svg>
              <span className="text-sm font-medium">{isMuted ? 'Muted' : 'Audio'}</span>
            </button>
          </div>

          {/* Desktop Secondary Actions - Right */}
          <div className="hidden md:flex items-center gap-2 mx-auto">
            {/* Edit Layout Button (left of Settings) */}
            {onLayoutClick && (
              <button
                type="button"
                onClick={onLayoutClick}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-2/80 border border-border transition-all group"
                title="Edit Panel Layout"
                aria-label="Edit Panel Layout"
              >
                <span className="text-lg" aria-hidden="true">
                  🧩
                </span>
                <span className="text-sm font-medium">Edit Layout</span>
              </button>
            )}
            {/* Help Button */}
            {onHelpClick && (
              <button
                type="button"
                onClick={onHelpClick}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2 hover:bg-surface-2/80 border border-border transition-all"
                title="Help & Shortcuts"
                aria-label="Help & Shortcuts"
              >
                <span className="text-lg" aria-hidden="true">
                  ❓
                </span>
              </button>
            )}

            {/* Settings Button */}
            <button
              type="button"
              onClick={onSettingsClick}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-2/80 border border-border transition-all group"
              title="Settings"
              aria-label="Settings"
            >
              <span className="text-lg" aria-hidden="true">
                ⚙️
              </span>
              <span className="text-sm font-medium">Settings</span>
            </button>
          </div>

          {/* Mobile Layout - Left: Stats, Chat, Mute; Right: Settings */}
          <div className="md:hidden flex items-center justify-between w-full gap-2">
            {/* Left side - Stats, Chat, Mute */}
            <div className="flex items-center gap-2">
              {/* Stats Button (opens drawer on mobile) */}
              {onStatsClick && (
                <button
                  type="button"
                  onClick={onStatsClick}
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2 border border-border transition-all"
                  title="Player Stats"
                  aria-label="Player Stats"
                >
                  <span className="text-lg" aria-hidden="true">
                    📊
                  </span>
                </button>
              )}

              {/* Chat Button (opens drawer on mobile) */}
              <button
                type="button"
                onClick={onChatClick}
                className={`flex items-center justify-center w-10 h-10 rounded-lg border transition-all ${
                  isMobileDrawerOpen
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface-2 border-border'
                }`}
                title={isMobileDrawerOpen ? 'Close Chat' : 'Open Chat'}
                aria-label={isMobileDrawerOpen ? 'Close Chat' : 'Open Chat'}
              >
                <span className="text-lg" aria-hidden="true">
                  {isMobileDrawerOpen ? '✕' : '💬'}
                </span>
              </button>
              {/* Mute Button */}
              <button
                type="button"
                onClick={handleToggleMute}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2 border border-border transition-all"
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-colors ${isMuted ? 'text-[color:var(--color-danger)]' : 'text-[color:var(--color-success)]'}`}
                  aria-hidden="true"
                >
                  {isMuted ? (
                    <>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </>
                  ) : (
                    <>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </>
                  )}
                </svg>
              </button>
            </div>

            {/* Right side - Settings (and optional Help) */}
            <div className="flex items-center gap-2">
              {onHelpClick && (
                <button
                  type="button"
                  onClick={onHelpClick}
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2 border border-border transition-all"
                  title="Help & Shortcuts"
                  aria-label="Help & Shortcuts"
                >
                  <span className="text-lg" aria-hidden="true">
                    ❓
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={onSettingsClick}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-2 border border-border transition-all"
                title="Settings"
                aria-label="Settings"
              >
                <span className="text-lg" aria-hidden="true">
                  ⚙️
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
