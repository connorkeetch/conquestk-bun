import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { ZoomControls } from '@/types/zoom'
import { MapToolbar } from './MapToolbar'

interface MapHeaderBarProps {
  zoom?: ZoomControls
  showMinimap: boolean
  onToggleMinimap: () => void
  settingsContent?: ReactNode
}

const STORAGE_KEY = 'ui.mapMobileSettingsOpen'

export function MapHeaderBar({
  zoom,
  showMinimap,
  onToggleMinimap,
  settingsContent,
}: MapHeaderBarProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return sessionStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, String(isOpen))
    } catch {
      // ignore storage errors
    }
  }, [isOpen])

  const panelContent = useMemo(() => settingsContent, [settingsContent])

  return (
    <div className="md:hidden sticky top-0 z-30 bg-[color:var(--surface-1)] border-b border-[color:var(--panel-border)]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <MapToolbar
          layout="horizontal"
          zoom={zoom}
          showZoomPresets={true}
          showMinimapToggle={false}
          showMinimap={showMinimap}
          onToggleMinimap={onToggleMinimap}
        />
        {panelContent && (
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg bg-[color:var(--surface-2)] hover:bg-[color:var(--surface-3)] transition-colors text-sm font-medium"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
          >
            Settings {isOpen ? '▲' : '▼'}
          </button>
        )}
      </div>
      {panelContent && (
        <div
          className={`overflow-hidden transition-[max-height] duration-200 ease-out ${
            isOpen ? 'max-h-[480px]' : 'max-h-0'
          }`}
        >
          <div className="px-3 pb-3 pt-1 shadow-inner bg-[color:var(--surface-1)]">
            {panelContent}
          </div>
        </div>
      )}
    </div>
  )
}
