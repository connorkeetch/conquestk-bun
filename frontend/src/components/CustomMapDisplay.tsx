import { useEffect, useState } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { mapService } from '@/services/mapService'
import { setOverlay } from '@/store/uiRoomSlice'
import type { ZoomControlsReadyHandler } from '@/types/zoom'
import { logger } from '@/utils/logger'
import { AttackableOverlay } from './map/AttackableOverlay'
import { HillOverlay } from './map/HillOverlay'
import { SectorsOverlay } from './map/SectorsOverlay'
import { ThreatOverlay } from './map/ThreatOverlay'
import ResponsiveMapContainer, { useMapViewport } from './ResponsiveMapContainer'

interface Territory {
  id: string
  name: string
  x: number
  y: number
  armies?: number
  owner?: string
  continent?: string
}

interface CustomMapDisplayProps {
  mapId: string
  territories: Territory[]
  onTerritoryClick?: (territoryId: string) => void
  onTerritoryHover?: (territoryId: string | null) => void
  selectedTerritoryId?: string | null
  playerColors?: Record<string, string>
  imageUrl?: string
  mapWidth?: number
  mapHeight?: number
  validTargets?: string[]
  pendingAction?: string | null
  focus?: { x: number; y: number } | null
  adjacency?: Record<string, string[]>
  showZoomControls?: boolean
  showOverlayToggles?: boolean
  showMinimap?: boolean
  onZoomControlsReady?: ZoomControlsReadyHandler
}

export default function CustomMapDisplay({
  mapId,
  territories,
  onTerritoryClick,
  onTerritoryHover,
  selectedTerritoryId,
  playerColors = {},
  imageUrl,
  mapWidth,
  mapHeight,
  validTargets = [],
  pendingAction,
  focus = null,
  showZoomControls = true,
  showOverlayToggles = true,
  showMinimap = true,
  adjacency,
  onZoomControlsReady,
}: CustomMapDisplayProps) {
  const overlays = useAppSelector((s) => s.uiRoom.overlays)
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game.currentGame)
  const myId = useAppSelector((s) => s.auth.user?.id)
  const players = game?.players ?? []
  const kingOfTheHillState =
    game?.gameConfig?.gameMode === 'king_of_the_hill' ? game.kingOfTheHillState : null
  const hillState: {
    currentHillTerritoryId: string
    turnsUntilRotation?: number
    rotationInterval?: number
    previewTurns?: number
  } | null = kingOfTheHillState
    ? {
        currentHillTerritoryId: kingOfTheHillState.currentHillTerritoryId,
        turnsUntilRotation:
          typeof kingOfTheHillState.turnsUntilRotation === 'number'
            ? kingOfTheHillState.turnsUntilRotation
            : undefined,
        rotationInterval:
          typeof kingOfTheHillState.rotationInterval === 'number'
            ? kingOfTheHillState.rotationInterval
            : undefined,
        previewTurns:
          typeof kingOfTheHillState.previewTurns === 'number'
            ? kingOfTheHillState.previewTurns
            : undefined,
      }
    : null
  const [mapData, setMapData] = useState<{
    imageUrl: string
    width: number
    height: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [_hoveredId, setHoveredId] = useState<string | null>(null)
  const hillOverlayEnabled = Boolean(kingOfTheHillState && mapData)

  // Keyboard hotkeys: g (sectors), a (attackable), h (threat)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (target && (target as HTMLElement).isContentEditable)
      ) {
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'g') {
        e.preventDefault()
        dispatch(setOverlay({ key: 'continents', value: !overlays.continents }))
      } else if (k === 'a') {
        e.preventDefault()
        dispatch(setOverlay({ key: 'attackable', value: !overlays.attackable }))
      } else if (k === 'h') {
        e.preventDefault()
        dispatch(setOverlay({ key: 'threat', value: !overlays.threat }))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, overlays.attackable, overlays.continents, overlays.threat])

  useEffect(() => {
    const hydrateFromProps = () => {
      if (imageUrl && mapWidth && mapHeight) {
        setMapData({ imageUrl, width: mapWidth, height: mapHeight })
        setLoading(false)
        return true
      }
      return false
    }

    const loadMapData = async () => {
      try {
        setLoading(true)
        setError(null)
        // Load full map payload via mapService for consistent env/auth handling
        const data = await mapService.getMap(mapId)
        const map = (
          data as unknown as {
            map?: { imageUrl?: string; imageWidth?: number; imageHeight?: number }
          }
        ).map
        setMapData({
          imageUrl:
            (map?.imageUrl as string | undefined) ||
            (data as unknown as { imageUrl?: string }).imageUrl ||
            '',
          width: (map?.imageWidth as number | undefined) || 1280,
          height: (map?.imageHeight as number | undefined) || 720,
        })
      } catch (error) {
        logger.error('Failed to load custom map data', error)
        setError('Failed to load map')
      } finally {
        setLoading(false)
      }
    }

    if (mapId) {
      if (!hydrateFromProps()) {
        void loadMapData()
      }
    }
  }, [mapId, imageUrl, mapWidth, mapHeight])

  // Compute attack odds tooltip using shared hook
  // Odds tooltip disabled in this simplified preview component

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-1">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet mx-auto mb-4"></div>
          <p className="text-muted">Loading map...</p>
        </div>
      </div>
    )
  }

  if (error || !mapData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-1">
        <div className="text-center text-red-500">
          <p className="text-lg">⚠️ {error || 'Map not found'}</p>
        </div>
      </div>
    )
  }

  const handleTerritoryActivate = (territoryId: string) => {
    onTerritoryClick?.(territoryId)
  }

  const handleHoverChange = (territoryId: string | null) => {
    setHoveredId(territoryId)
    onTerritoryHover?.(territoryId)
  }

  // Swipe to cycle overlays (none -> continents -> attackable -> threat)
  const cycleOverlay = (dir: 'left' | 'right') => {
    const order = ['none', 'continents', 'attackable', 'threat'] as const
    const current = overlays.continents
      ? 'continents'
      : overlays.attackable
        ? 'attackable'
        : overlays.threat
          ? 'threat'
          : 'none'
    const idx = order.indexOf(current)
    const nextIdx =
      dir === 'left' ? (idx + 1) % order.length : (idx - 1 + order.length) % order.length
    const next = order[nextIdx]
    const setAll = (c: boolean, a: boolean, t: boolean) => {
      dispatch(setOverlay({ key: 'continents', value: c }))
      dispatch(setOverlay({ key: 'attackable', value: a }))
      dispatch(setOverlay({ key: 'threat', value: t }))
    }
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        ;(navigator as unknown as { vibrate?: (pattern: number | number[]) => void }).vibrate?.(10)
      }
    } catch {
      /* ignore */
    }
    if (next === 'none') setAll(false, false, false)
    else if (next === 'continents') setAll(true, false, false)
    else if (next === 'attackable') setAll(false, true, false)
    else setAll(false, false, true)
  }

  return (
    <ResponsiveMapContainer
      mapWidth={mapData.width}
      mapHeight={mapData.height}
      className="custom-map-display"
      showMinimap={showMinimap}
      backgroundImageUrl={mapData.imageUrl}
      focus={focus ?? undefined}
      onSwipeLeft={() => cycleOverlay('left')}
      onSwipeRight={() => cycleOverlay('right')}
      onZoomControlsReady={onZoomControlsReady}
    >
      {/* Overlay toggle buttons */}
      {showOverlayToggles && (
        <div className="absolute top-2 left-2 z-30 flex items-center gap-2 bg-surface-2/80 backdrop-blur px-2 py-1 rounded border border-border">
          {(() => {
            const haptic = () => {
              try {
                ;(
                  navigator as unknown as { vibrate?: (pattern: number | number[]) => void }
                ).vibrate?.(10)
              } catch {
                // ignore haptics errors
              }
            }
            return (
              <>
                <button
                  type="button"
                  className={`btn btn-ghost btn-xs ${overlays.continents ? 'ring-1 ring-white' : ''}`}
                  onClick={() => {
                    dispatch(setOverlay({ key: 'continents', value: !overlays.continents }))
                    haptic()
                  }}
                  title="Toggle sectors overlay (g)"
                >
                  <span aria-hidden>🗺️</span>
                  <span className="hidden sm:inline">Sectors</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-xs ${overlays.attackable ? 'ring-1 ring-white' : ''}`}
                  onClick={() => {
                    dispatch(setOverlay({ key: 'attackable', value: !overlays.attackable }))
                    haptic()
                  }}
                  title="Toggle attackable overlay (a)"
                >
                  <span aria-hidden>🎯</span>
                  <span className="hidden sm:inline">Attackable</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-xs ${overlays.threat ? 'ring-1 ring-white' : ''}`}
                  onClick={() => {
                    dispatch(setOverlay({ key: 'threat', value: !overlays.threat }))
                    haptic()
                  }}
                  title="Toggle threat overlay (h)"
                >
                  <span aria-hidden>🔥</span>
                  <span className="hidden sm:inline">Threat</span>
                </button>
              </>
            )
          })()}
        </div>
      )}

      {/* Zoom controls */}
      {showZoomControls && <ZoomControls />}

      {hillOverlayEnabled && (
        <HillOverlay
          mapWidth={mapData.width}
          mapHeight={mapData.height}
          territories={territories}
          players={players.map((p) => ({ id: p.id, username: p.username, color: p.color }))}
          state={hillState}
        />
      )}

      {/* Sectors overlay: colored dots per territory */}
      {overlays.continents && (
        <SectorsOverlay
          mapWidth={mapData.width}
          mapHeight={mapData.height}
          territories={territories}
        />
      )}

      {/* Attackable overlay: ring highlights for selected + valid targets */}
      {overlays.attackable && selectedTerritoryId && (
        <AttackableOverlay
          mapWidth={mapData.width}
          mapHeight={mapData.height}
          territories={territories}
          selectedTerritoryId={selectedTerritoryId}
          validTargets={validTargets}
        />
      )}

      {/* Threat overlay: heat rings on friendly territories proportional to adjacent enemy armies */}
      {overlays.threat && game && myId && adjacency && (
        <ThreatOverlay
          mapWidth={mapData.width}
          mapHeight={mapData.height}
          territories={territories}
          adjacency={adjacency}
          myUserId={myId}
          game={game}
        />
      )}
      {/* Map background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${mapData.imageUrl})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          imageRendering: 'auto',
        }}
      />

      {/* Territory tokens */}
      {territories.map((territory) => {
        const isSelected = territory.id === selectedTerritoryId
        const ownerColor = territory.owner ? playerColors[territory.owner] : undefined
        const color = ownerColor ? getColorValue(ownerColor as PlayerColor) : '#6b7280'
        const isValidTarget =
          pendingAction === 'attack' &&
          validTargets.includes(territory.id) &&
          Boolean(selectedTerritoryId)

        return (
          <div
            key={territory.id}
            className={`absolute ${isSelected ? 'z-20' : 'z-10'}`}
            style={{
              left: `${(territory.x / mapData.width) * 100}%`,
              top: `${(territory.y / mapData.height) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <TerritoryToken
              territory={territory}
              color={color}
              isSelected={isSelected}
              isValidTarget={Boolean(isValidTarget)}
              onActivate={handleTerritoryActivate}
              onHoverChange={handleHoverChange}
            />
          </div>
        )
      })}

      {overlays.continents && (
        <div className="absolute bottom-2 right-2 z-30 bg-surface-2/80 backdrop-blur border border-border rounded px-2 py-1 text-xs">
          {(() => {
            const uniqueContinents = Array.from(
              new Set(territories.map((t) => t.continent || 'unknown')),
            )
            const palette = [
              '#22c55e',
              '#06b6d4',
              '#f59e0b',
              '#ef4444',
              '#8b5cf6',
              '#eab308',
              '#14b8a6',
              '#f97316',
            ]
            const cMap = new Map<string, string>()
            uniqueContinents.forEach((c, i) => {
              cMap.set(c, palette[i % palette.length])
            })
            return (
              <div className="flex items-center gap-3 flex-wrap max-w-[320px]">
                {uniqueContinents.map((c) => (
                  <span key={`legend-${c}`} className="inline-flex items-center gap-1">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full border border-white/60"
                      style={{ backgroundColor: cMap.get(c) || '#94a3b8' }}
                    />
                    <span className="text-white/90 capitalize">{c}</span>
                  </span>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* Removed focus animation and ping markers */}

      {/* Odds tooltip disabled in preview */}
    </ResponsiveMapContainer>
  )
}

/**
 * Zoom controls component - uses useMapViewport to control zoom
 */
function ZoomControls() {
  const viewport = useMapViewport()

  if (!viewport) return null

  const { scale, setZoom } = viewport

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 100) / 100))
  }

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setZoom((z) => Math.round((z + 0.1) * 100) / 100)
  }

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setZoom(1)
  }

  return (
    <div className="absolute top-2 right-2 z-30 flex gap-1 bg-surface-2/90 backdrop-blur px-1.5 py-1.5 rounded-lg shadow-lg">
      <button
        type="button"
        className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded bg-surface-1 hover:bg-surface-3 active:bg-surface-3 transition-colors text-lg font-bold"
        onClick={handleZoomOut}
        onMouseDown={(e) => e.stopPropagation()}
        title="Zoom out (Ctrl/Cmd + scroll or pinch)"
      >
        −
      </button>
      <div className="text-xs self-center min-w-[44px] text-center text-muted font-mono">
        {Math.round(scale * 100)}%
      </div>
      <button
        type="button"
        className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded bg-surface-1 hover:bg-surface-3 active:bg-surface-3 transition-colors text-lg font-bold"
        onClick={handleZoomIn}
        onMouseDown={(e) => e.stopPropagation()}
        title="Zoom in (Ctrl/Cmd + scroll or pinch)"
      >
        +
      </button>
      <button
        type="button"
        className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded bg-ghost hover:bg-surface-2 active:bg-surface-2 transition-colors text-xs"
        onClick={handleReset}
        onMouseDown={(e) => e.stopPropagation()}
        title="Reset zoom to 100%"
      >
        1:1
      </button>
    </div>
  )
}

const clampViewportScale = (scale: number) => Math.min(3, Math.max(0.25, scale))

interface TerritoryTokenProps {
  territory: Territory
  color: string
  isSelected: boolean
  isValidTarget: boolean
  onActivate: (territoryId: string) => void
  onHoverChange: (territoryId: string | null) => void
}

function TerritoryToken({
  territory,
  color,
  isSelected,
  isValidTarget,
  onActivate,
  onHoverChange,
}: TerritoryTokenProps) {
  const viewport = useMapViewport()
  const effectiveScale = clampViewportScale(viewport?.scale ?? 1)
  const size = Math.max(8, Math.round(32 * effectiveScale))
  const borderWidth = isValidTarget
    ? Math.max(2, Math.round(effectiveScale * 2))
    : Math.max(1, Math.round(effectiveScale))
  const fontSize = Math.max(10, Math.min(26, Math.round(14 * effectiveScale)))
  const glowRadius = Math.round(6 * effectiveScale)

  const boxShadow = isSelected
    ? `0 0 ${10 + glowRadius}px rgba(255,255,255,0.65), 0 2px 6px rgba(0,0,0,0.35)`
    : isValidTarget
      ? `0 0 ${6 + glowRadius}px rgba(56,189,248,0.7), 0 2px 4px rgba(0,0,0,0.3)`
      : '0 2px 4px rgba(0,0,0,0.3)'

  return (
    <button
      type="button"
      onClick={() => onActivate(territory.id)}
      onMouseEnter={() => onHoverChange(territory.id)}
      onMouseLeave={() => onHoverChange(null)}
      onFocus={() => onHoverChange(territory.id)}
      onBlur={() => onHoverChange(null)}
      onTouchStart={() => onHoverChange(territory.id)}
      onTouchEnd={() => onHoverChange(null)}
      onTouchCancel={() => onHoverChange(null)}
      className={`relative block ${isValidTarget ? 'animate-pulse' : ''}`}
      title={territory.name}
      aria-label={`Territory: ${territory.name}`}
      style={{ cursor: isValidTarget ? ('crosshair' as const) : 'pointer' }}
    >
      <span
        className="block"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          opacity: isSelected ? 0.85 : 0.7,
          clipPath: 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)',
          boxShadow,
          border: `${borderWidth}px solid ${isValidTarget ? '#38bdf8' : 'rgba(255,255,255,0.25)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s ease-out',
        }}
      >
        {territory.armies && territory.armies > 0 ? (
          <span
            style={{
              color: 'white',
              fontSize: `${fontSize}px`,
              fontWeight: 700,
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              lineHeight: 1,
            }}
          >
            {territory.armies}
          </span>
        ) : null}
      </span>
    </button>
  )
}
