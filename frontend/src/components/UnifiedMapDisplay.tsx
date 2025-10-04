import { computeRollOdds } from '@shared/utils/combatOdds'
import { useEffect, useId, useMemo, useState } from 'react'
import type { PlayerColor } from '@/constants/colors'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { mapService } from '@/services/mapService'
import {
  clearInvalidShake,
  setHoveredTarget,
  triggerInvalidShake,
} from '@/store/gameInteractionSlice'
import { setOverlay } from '@/store/uiRoomSlice'
import { logger } from '@/utils/logger'
import AttackOddsPopup from './game/AttackOddsPopup'
import MapCanvas from './game/MapCanvas'
import TerritoryLayer from './game/TerritoryLayer'
import TokenLayer from './game/TokenLayer'
import { AttackableOverlay } from './map/AttackableOverlay'
import { HillOverlay } from './map/HillOverlay'
import { SectorsOverlay } from './map/SectorsOverlay'
import { ThreatOverlay } from './map/ThreatOverlay'

interface Territory {
  id: string
  name: string
  x: number
  y: number
  armies?: number
  owner?: string
  continent?: string
}

interface UnifiedMapDisplayProps {
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
  showOverlayToggles?: boolean
}

export default function UnifiedMapDisplay({
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
  // focus (centering) is handled outside by gameplay logs selections; we keep it TODO
  // focus = null,
  adjacency,
  showOverlayToggles = true,
}: UnifiedMapDisplayProps) {
  const overlays = useAppSelector((s) => s.uiRoom.overlays)
  const dispatch = useAppDispatch()
  const markerId = useId()
  const hoveredTargetId = useAppSelector((s) => s.gameInteraction.hoveredTargetId)
  const invalidShakeId = useAppSelector((s) => s.gameInteraction.invalidShakeId)
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
  const [hoveredId, setHoveredId] = useState<string | null>(null)
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
        logger.error('Failed to load map data', error)
        setError('Failed to load map')
      } finally {
        setLoading(false)
      }
    }

    if (mapId) {
      if (!hydrateFromProps()) void loadMapData()
    }
  }, [mapId, imageUrl, mapWidth, mapHeight])

  const attackDice = useAppSelector((s) => s.uiRoom.dice)
  const oddsTooltip = (() => {
    if (!mapData) return null
    if (pendingAction !== 'attack') return null
    if (!selectedTerritoryId || !hoveredId) return null
    if (!validTargets.includes(hoveredId)) return null
    const src = territories.find((t) => t.id === selectedTerritoryId)
    const dst = territories.find((t) => t.id === hoveredId)
    if (!src || !dst) return null
    const srcArmies = src.armies ?? 0
    const dstArmies = dst.armies ?? 0
    if (srcArmies <= 1) return null
    const att = Math.max(1, Math.min(3, Math.min(attackDice, srcArmies - 1))) as 1 | 2 | 3
    const def = Math.min(2, Math.max(1, dstArmies)) as 1 | 2
    const odds = computeRollOdds(att, def)
    const winChance = (odds.probabilities.defenderLoses1 + odds.probabilities.defenderLoses2) * 100
    const left = (dst.x / mapData.width) * 100
    const top = (dst.y / mapData.height) * 100
    return { att, def, odds, winChance, left, top }
  })()

  // Arrow-key cycling through owned territories; Esc clears selection
  const viewerId = useAppSelector((s) => s.auth.user?.id)
  const ownedIds = useMemo(
    () => territories.filter((t) => t.owner === viewerId).map((t) => t.id),
    [territories, viewerId],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        const { selectTerritory, selectTargetTerritory, setPendingAction } =
          require('@/store/gameSlice') as typeof import('@/store/gameSlice')
        dispatch(selectTerritory(null))
        dispatch(selectTargetTerritory(null))
        dispatch(setPendingAction(null))
        return
      }
      if (!ownedIds.length) return
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
      const backward = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      if (!forward && !backward) return
      e.preventDefault()
      const { selectTerritory } = require('@/store/gameSlice') as typeof import('@/store/gameSlice')
      const current = selectedTerritoryId
      const idx = Math.max(0, ownedIds.indexOf(current || ''))
      const nextIdx = forward
        ? (idx + 1) % ownedIds.length
        : (idx - 1 + ownedIds.length) % ownedIds.length
      const nextId = ownedIds[nextIdx]
      dispatch(selectTerritory(nextId))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, ownedIds, selectedTerritoryId])

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
    // If a source is selected and we're in attack mode but this is not a valid target, trigger shake
    const selectedId = selectedTerritoryId
    const isValid = validTargets.includes(territoryId)
    if (selectedId && pendingAction === 'attack' && !isValid) {
      dispatch(triggerInvalidShake(territoryId))
      window.setTimeout(() => dispatch(clearInvalidShake()), 250)
      return
    }
    onTerritoryClick?.(territoryId)
  }

  const handleHoverChange = (territoryId: string | null) => {
    setHoveredId(territoryId)
    dispatch(setHoveredTarget(territoryId))
    onTerritoryHover?.(territoryId)
  }

  return (
    <div className="relative w-full h-full">
      {showOverlayToggles && (
        <div className="absolute top-2 left-2 z-30 flex items-center gap-2 bg-surface-2/80 backdrop-blur px-2 py-1 rounded border border-border">
          {(() => {
            const haptic = () => {
              try {
                ;(
                  navigator as unknown as { vibrate?: (pattern: number | number[]) => void }
                ).vibrate?.(10)
              } catch {
                // ignore
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

      <MapCanvas
        imageUrl={mapData.imageUrl}
        imageWidth={mapData.width}
        imageHeight={mapData.height}
      >
        {pendingAction === 'fortify' &&
          selectedTerritoryId &&
          hoveredTargetId &&
          (() => {
            const src = territories.find((t) => t.id === selectedTerritoryId)
            const dst = territories.find((t) => t.id === hoveredTargetId)
            if (!src || !dst) return null
            return (
              <svg
                className="absolute left-0 top-0 pointer-events-none"
                width={mapData.width}
                height={mapData.height}
                viewBox={`0 0 ${mapData.width} ${mapData.height}`}
                role="img"
                aria-label="Fortify preview"
              >
                <title>Fortify preview</title>
                <defs>
                  <marker
                    id={`arrowhead-${markerId}`}
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill="rgba(56,189,248,0.85)" />
                  </marker>
                </defs>
                <line
                  x1={src.x}
                  y1={src.y}
                  x2={dst.x}
                  y2={dst.y}
                  stroke="rgba(56,189,248,0.85)"
                  strokeWidth="3"
                  markerEnd={`url(#arrowhead-${markerId})`}
                  opacity={0.9}
                />
              </svg>
            )
          })()}
        <TerritoryLayer
          mapWidth={mapData.width}
          mapHeight={mapData.height}
          territories={territories.map((t) => ({
            id: t.id,
            name: t.name,
            x: t.x,
            y: t.y,
            owner: t.owner,
            ownerColor: playerColors[t.owner ?? ''] as PlayerColor,
          }))}
          selectedId={selectedTerritoryId ?? undefined}
          validTargets={validTargets}
          hoveredId={hoveredTargetId ?? undefined}
          invalidShakeId={invalidShakeId ?? undefined}
        />
        {hillOverlayEnabled && (
          <HillOverlay
            mapWidth={mapData.width}
            mapHeight={mapData.height}
            territories={territories}
            players={players.map((p) => ({ id: p.id, username: p.username, color: p.color }))}
            state={hillState}
          />
        )}

        {overlays.continents && (
          <SectorsOverlay
            mapWidth={mapData.width}
            mapHeight={mapData.height}
            territories={territories}
          />
        )}

        {overlays.attackable && selectedTerritoryId && (
          <AttackableOverlay
            mapWidth={mapData.width}
            mapHeight={mapData.height}
            territories={territories}
            selectedTerritoryId={selectedTerritoryId}
            validTargets={validTargets}
          />
        )}

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

        <TokenLayer
          width={mapData.width}
          height={mapData.height}
          tokens={territories.map((t) => ({
            id: t.id,
            name: t.name,
            xPx: t.x,
            yPx: t.y,
            owner: t.owner,
            ownerColor: playerColors[t.owner ?? ''] as PlayerColor,
            armies: t.armies,
          }))}
          selectedId={selectedTerritoryId ?? undefined}
          validTargets={validTargets}
          dimNonTargets={pendingAction === 'attack'}
          onClick={handleTerritoryActivate}
          onHover={handleHoverChange}
        />
        {oddsTooltip && (
          <AttackOddsPopup
            leftPercent={oddsTooltip.left}
            topPercent={oddsTooltip.top}
            attackerDice={oddsTooltip.att}
            defenderDice={oddsTooltip.def}
            winChancePercent={oddsTooltip.winChance}
            onAttack={() => {
              if (hoveredTargetId) {
                onTerritoryClick?.(hoveredTargetId)
              }
            }}
            onCancel={() => dispatch(setHoveredTarget(null))}
          />
        )}

        {/* Plain odds tooltip removed in favor of AttackOddsPopup */}
      </MapCanvas>
    </div>
  )
}
