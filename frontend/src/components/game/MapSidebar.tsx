import type { ReactNode } from 'react'
import type { ZoomControls } from '@/types/zoom'
import { MapToolbar } from './MapToolbar'

interface MapSidebarProps {
  showMinimap: boolean
  onToggleMinimap: () => void
  zoom?: ZoomControls
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  children?: ReactNode
  className?: string
}

export function MapSidebar({
  showMinimap,
  onToggleMinimap,
  zoom,
  isCollapsed = false,
  onToggleCollapse,
  children,
  className = '',
}: MapSidebarProps) {
  const widthClass = isCollapsed ? 'w-[64px]' : 'w-[220px]'

  return (
    <aside
      className={`hidden md:flex flex-col bg-[color:var(--surface-1)] border-l border-[color:var(--panel-border)] flex-none ${widthClass} ${className}`.trim()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--panel-border)]">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
          {isCollapsed ? 'Map' : 'Map Controls'}
        </h3>
        {onToggleCollapse && (
          <button
            type="button"
            className="text-xs text-muted hover:text-[color:var(--heading)] transition-colors"
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? '◀' : '▶'}
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          <MapToolbar
            layout="vertical"
            zoom={zoom}
            showMinimapToggle={true}
            showZoomPresets={true}
            showMinimap={showMinimap}
            onToggleMinimap={onToggleMinimap}
          />
          {children}
        </div>
      )}
    </aside>
  )
}
