import type React from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { setOverlay } from '@/store/uiRoomSlice'

interface MapControlsSidebarProps {
  showMinimap: boolean
  onToggleMinimap: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export const MapControlsSidebar: React.FC<MapControlsSidebarProps> = ({
  showMinimap,
  onToggleMinimap,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const dispatch = useAppDispatch()
  const overlays = useAppSelector((s) => s.uiRoom.overlays)

  const haptic = () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        ;(navigator as unknown as { vibrate?: (pattern: number | number[]) => void }).vibrate?.(10)
      }
    } catch {
      // ignore haptics errors
    }
  }

  const toggleButton = (
    label: string,
    emoji: string,
    active: boolean,
    onClick: () => void,
    hotkey?: string,
  ) => (
    <button
      type="button"
      className={`flex items-center gap-2 px-3 py-2 rounded transition-colors text-sm ${
        active
          ? 'bg-[color:var(--surface-3)] ring-1 ring-[color:var(--violet)]'
          : 'bg-[color:var(--surface-2)] hover:bg-[color:var(--surface-3)]'
      }`}
      onClick={() => {
        onClick()
        haptic()
      }}
      title={hotkey ? `${label} (${hotkey})` : label}
    >
      <span aria-hidden className="text-base">
        {emoji}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {hotkey && <span className="text-xs text-muted font-mono">{hotkey}</span>}
    </button>
  )

  return (
    <div className="flex-none w-[200px] md:w-[220px] flex flex-col bg-[color:var(--surface-1)] border-l border-[color:var(--panel-border)]">
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
        <div className="flex flex-col gap-2 p-3 min-w-[180px]">
          {toggleButton(
            'Sectors',
            '🗺️',
            overlays.continents,
            () => dispatch(setOverlay({ key: 'continents', value: !overlays.continents })),
            'G',
          )}

          {toggleButton(
            'Attackable',
            '🎯',
            overlays.attackable,
            () => dispatch(setOverlay({ key: 'attackable', value: !overlays.attackable })),
            'A',
          )}

          {toggleButton(
            'Threat',
            '🔥',
            overlays.threat,
            () => dispatch(setOverlay({ key: 'threat', value: !overlays.threat })),
            'H',
          )}

          <div className="border-t border-[color:var(--panel-border)] my-1" />

          {toggleButton('Minimap', '🗺', showMinimap, onToggleMinimap)}
        </div>
      )}
    </div>
  )
}
