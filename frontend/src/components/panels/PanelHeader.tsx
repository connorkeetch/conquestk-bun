import type React from 'react'
import type { PanelId } from '@/store/panelsSlice'

interface PanelHeaderProps {
  panelId: PanelId
  title: string
  icon?: React.ReactNode
  isPinned: boolean
  isMinimized: boolean
  canMinimize?: boolean
  canClose?: boolean
  onTogglePin: () => void
  onToggleMinimize?: () => void
  onClose?: () => void
  className?: string
}

export default function PanelHeader({
  title,
  icon,
  isPinned,
  isMinimized,
  canMinimize = true,
  canClose = false,
  onTogglePin,
  onToggleMinimize,
  onClose,
  className = '',
}: PanelHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 bg-[color:var(--surface-2)] border-b border-[color:var(--panel-border)] ${className}`}
    >
      {/* Title with Icon */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {icon && <span className="shrink-0 text-base">{icon}</span>}
        <h3 className="text-sm font-semibold text-[color:var(--heading)] truncate">{title}</h3>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Minimize Button */}
        {canMinimize && isPinned && (
          <button
            type="button"
            onClick={onToggleMinimize}
            className="p-1 hover:bg-[color:var(--surface-3)] rounded transition-colors"
            title={isMinimized ? 'Maximize panel' : 'Minimize panel'}
            aria-label={isMinimized ? 'Maximize panel' : 'Minimize panel'}
          >
            <span className="text-sm text-muted">{isMinimized ? '□' : '−'}</span>
          </button>
        )}

        {/* Pin/Unpin Button */}
        <button
          type="button"
          onClick={onTogglePin}
          className={`p-1 hover:bg-[color:var(--surface-3)] rounded transition-colors ${
            isPinned ? 'text-[color:var(--color-accent)]' : 'text-muted'
          }`}
          title={isPinned ? 'Unpin to drawer' : 'Pin to room'}
          aria-label={isPinned ? 'Unpin to drawer' : 'Pin to room'}
          aria-pressed={isPinned}
        >
          <span className="text-sm">{isPinned ? '📌' : '📍'}</span>
        </button>

        {/* Close Button (optional) */}
        {canClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[color:var(--color-danger)]/20 hover:text-[color:var(--color-danger)] rounded transition-colors text-muted"
            title="Close panel"
            aria-label="Close panel"
          >
            <span className="text-sm">✕</span>
          </button>
        )}
      </div>
    </div>
  )
}
