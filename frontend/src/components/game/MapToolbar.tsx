import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { resetView, setScale } from '@/store/mapViewSlice'
import { setOverlay } from '@/store/uiRoomSlice'
import type { ZoomControls } from '@/types/zoom'

type OverlayKey = 'continents' | 'attackable' | 'threat'

type MapToolbarLayout = 'horizontal' | 'vertical'

interface MapToolbarProps {
  layout: MapToolbarLayout
  zoom?: ZoomControls
  showOverlayToggles?: boolean
  showMinimapToggle?: boolean
  showZoomPresets?: boolean
  showMinimap?: boolean
  onToggleMinimap?: () => void
}

const overlayOptions: Array<{
  key: OverlayKey
  label: string
  emoji: string
  hotkey?: string
}> = [
  { key: 'continents', label: 'Sectors', emoji: '🗺️', hotkey: 'G' },
  { key: 'attackable', label: 'Attackable', emoji: '🎯', hotkey: 'A' },
  { key: 'threat', label: 'Threat', emoji: '🔥', hotkey: 'H' },
]

const zoomTargets = [
  { label: '80%', scale: 0.8 },
  { label: '100%', scale: 1 },
  { label: '120%', scale: 1.2 },
]

function buttonBaseClasses(layout: MapToolbarLayout) {
  if (layout === 'horizontal') {
    return 'min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-sm font-medium transition-colors'
  }
  return 'min-h-[44px] min-w-[44px] px-3 py-2 rounded text-sm transition-colors'
}

export function MapToolbar({
  layout,
  zoom,
  showOverlayToggles = true,
  showMinimapToggle = true,
  showZoomPresets = true,
  showMinimap = false,
  onToggleMinimap,
}: MapToolbarProps) {
  const dispatch = useAppDispatch()
  const overlays = useAppSelector((s) => s.uiRoom.overlays)
  const mapView = useAppSelector((s) => s.mapView)

  const handleHaptic = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        ;(navigator as unknown as { vibrate?: (pattern: number | number[]) => void }).vibrate?.(10)
      }
    } catch {
      // ignore
    }
  }, [])

  const layoutClasses =
    layout === 'horizontal' ? 'flex flex-wrap items-center gap-2' : 'flex flex-col gap-2'

  const toggleOverlay = useCallback(
    (key: OverlayKey, value: boolean) => {
      dispatch(setOverlay({ key, value }))
      handleHaptic()
    },
    [dispatch, handleHaptic],
  )

  const applyScaleTarget = useCallback(
    (targetScale: number) => {
      if (zoom) {
        // Back-compat: use old controls when provided
        const safeBase = Math.max(0.000001, Math.min(1, zoom.baseScale))
        const targetZoom = targetScale / safeBase
        if (zoom.setZoom) {
          zoom.setZoom(targetZoom)
        } else if (targetScale > zoom.scale) {
          zoom.zoomIn()
        } else if (targetScale < zoom.scale) {
          zoom.zoomOut()
        }
        handleHaptic()
        return
      }

      // Default: use discrete Redux scale
      const s = targetScale === 0.8 ? 0.8 : targetScale === 1.2 ? 1.2 : 1
      dispatch(setScale(s))
      handleHaptic()
    },
    [zoom, handleHaptic, dispatch],
  )

  const currentScale = zoom?.scale ?? mapView.scale

  return (
    <div className={layoutClasses}>
      {showOverlayToggles &&
        overlayOptions.map((overlay) => {
          const active = overlays[overlay.key]
          return (
            <button
              key={overlay.key}
              type="button"
              className={`${buttonBaseClasses(layout)} ${
                active
                  ? 'bg-[color:var(--surface-3)] ring-1 ring-[color:var(--violet)]'
                  : 'bg-[color:var(--surface-2)] hover:bg-[color:var(--surface-3)]'
              } flex items-center gap-2`}
              onClick={() => toggleOverlay(overlay.key, !active)}
              title={overlay.hotkey ? `${overlay.label} (${overlay.hotkey})` : overlay.label}
            >
              <span aria-hidden className="text-base">
                {overlay.emoji}
              </span>
              <span className="whitespace-nowrap">{overlay.label}</span>
              {overlay.hotkey && (
                <span className="text-xs text-muted font-mono">{overlay.hotkey}</span>
              )}
            </button>
          )
        })}

      {showZoomPresets && zoom && (
        <div
          className={`bg-[color:var(--surface-2)] rounded-lg p-2 flex ${
            layout === 'horizontal' ? 'flex-wrap items-center gap-2' : 'flex-col gap-2'
          }`}
        >
          <div className={`flex gap-2 ${layout === 'horizontal' ? 'flex-row' : 'flex-col w-full'}`}>
            {zoomTargets.map((target) => {
              const active = Math.abs(currentScale - target.scale) < 0.05
              return (
                <button
                  key={target.scale}
                  type="button"
                  className={`${buttonBaseClasses('horizontal')} ${
                    layout === 'horizontal' ? 'w-[72px]' : 'w-full'
                  } justify-center ${
                    active
                      ? 'bg-[color:var(--surface-3)] ring-1 ring-[color:var(--violet)]'
                      : 'bg-[color:var(--surface-1)] hover:bg-[color:var(--surface-3)]'
                  }`}
                  onClick={() => applyScaleTarget(target.scale)}
                >
                  {target.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className={`${buttonBaseClasses('horizontal')} ${
              layout === 'horizontal' ? 'w-[72px]' : 'w-full'
            } justify-center bg-[color:var(--surface-1)] hover:bg-[color:var(--surface-3)]`}
            onClick={() => {
              if (zoom) {
                zoom.resetZoom()
              } else {
                dispatch(resetView())
              }
              handleHaptic()
            }}
          >
            Reset
          </button>
        </div>
      )}

      {showMinimapToggle && onToggleMinimap && (
        <button
          type="button"
          className={`${buttonBaseClasses(layout)} ${
            showMinimap
              ? 'bg-[color:var(--surface-3)] ring-1 ring-[color:var(--violet)]'
              : 'bg-[color:var(--surface-2)] hover:bg-[color:var(--surface-3)]'
          } flex items-center gap-2`}
          onClick={() => {
            onToggleMinimap()
            handleHaptic()
          }}
        >
          <span aria-hidden className="text-base">
            🗺
          </span>
          <span className="whitespace-nowrap">Minimap</span>
        </button>
      )}
    </div>
  )
}
