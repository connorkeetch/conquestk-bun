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
  isEditingLayout?: boolean
}

export default function PanelHeader({
  panelId,
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
  isEditingLayout = false,
}: PanelHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 bg-[color:var(--surface-2)] border-b border-[color:var(--panel-border)] ${className}`}
      role="toolbar"
      aria-label="Panel header"
    >
      {/* Title with Icon */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Drag handle - only show when editing layout */}
        {isEditingLayout && (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing select-none p-1 rounded hover:bg-[color:var(--surface-3)] focus:outline-none bg-transparent"
            title="Drag to move"
            aria-label="Drag panel"
            draggable
            onDragStart={(e) => {
              try {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.dropEffect = 'move'
                e.dataTransfer.setData('application/x-conquestk-panel', panelId)
                // Ensure consistent drag start across Chromium by setting a tiny drag image
                const img = new Image()
                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
                try {
                  e.dataTransfer.setDragImage(img, 0, 0)
                } catch {
                  // ignore drag image errors
                }
              } catch {
                // ignore
              }
              try {
                e.dataTransfer.setData('text/plain', `panel:${panelId}`)
              } catch {
                // ignore
              }
              window.dispatchEvent(new CustomEvent('panel-drag-start', { detail: { panelId } }))
            }}
            onDragEnd={() => {
              window.dispatchEvent(new CustomEvent('panel-drag-end'))
            }}
            aria-grabbed={false}
          >
            <span aria-hidden className="text-sm">
              ≡
            </span>
          </button>
        )}
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
