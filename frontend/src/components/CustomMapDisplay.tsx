import { useEffect, useMemo, useState } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { useAttackOddsTooltip } from '@/hooks/useAttackOddsTooltip'
import { socketService } from '@/services/socketService'
import { selectTerritory } from '@/store/gameSlice'
import { setLastPingAt, setOverlay } from '@/store/uiRoomSlice'
import { logger } from '@/utils/logger'
import { arePlayersTeammates } from '@/utils/teamHelpers'
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
  adjacency,
}: CustomMapDisplayProps) {
  const overlays = useAppSelector((s) => s.uiRoom.overlays)
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game.currentGame)
  const myId = useAppSelector((s) => s.auth.user?.id)
  const userId = useAppSelector((s) => s.auth.user?.id)
  const isMyTurn = Boolean(userId && game?.currentPlayer === userId)
  const pings = useAppSelector((s) => s.uiRoom.pings ?? [])
  const lastPingAt = useAppSelector((s) => s.uiRoom.lastPingAt ?? 0)
  const players = game?.players ?? []
  const kingOfTheHillState =
    game?.gameConfig?.gameMode === 'king_of_the_hill' ? game.kingOfTheHillState : null
  const [mapData, setMapData] = useState<{
    imageUrl: string
    width: number
    height: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hillOverlay = useMemo(() => {
    if (!kingOfTheHillState || !mapData) return null

    const hill = territories.find(
      (territory) => territory.id === kingOfTheHillState.currentHillTerritoryId,
    )
    if (!hill) return null

    const ownerId = hill.owner ?? null
    const owner = ownerId ? players.find((player) => player.id === ownerId) : null
    const ownerColor = owner ? getColorValue(owner.color as PlayerColor) : 'rgba(250,204,21,0.9)'
    const turnsUntilRotation = kingOfTheHillState.turnsUntilRotation
    const rotationInterval = kingOfTheHillState.rotationInterval
    const previewTurns = kingOfTheHillState.previewTurns ?? 0
    const rotationActive = Boolean(rotationInterval && rotationInterval > 0)
    const showCountdown =
      rotationActive && typeof turnsUntilRotation === 'number' && turnsUntilRotation >= 0

    const labelParts = [
      owner
        ? `Controlled by ${owner.username}`
        : ownerId === 'neutral'
          ? 'Held by neutral forces'
          : 'Currently unclaimed',
    ]
    if (showCountdown) {
      const turns = Math.max(0, turnsUntilRotation ?? 0)
      const unit = turns === 1 ? 'turn' : 'turns'
      if (previewTurns > 0 && turns > previewTurns) {
        labelParts.push(`Rotation reveals in ${turns - previewTurns} ${unit}`)
      } else {
        labelParts.push(`Rotates in ${turns} ${unit}`)
      }
    }

    const left = (hill.x / mapData.width) * 100
    const top = (hill.y / mapData.height) * 100

    return (
      <div
        className="absolute z-30 pointer-events-none"
        style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' }}
      >
        <span className="pointer-events-none relative block">
          <span className="absolute -left-12 -top-12 h-24 w-24 rounded-full border-4 border-yellow-300/80 opacity-70 blur-sm" />
          <span className="absolute -left-10 -top-10 h-20 w-20 animate-ping rounded-full border-4 border-yellow-300/60" />
          <span
            className="absolute -left-8 -top-8 h-16 w-16 rounded-full border-4"
            style={{ borderColor: ownerColor, boxShadow: '0 0 24px rgba(250,204,21,0.75)' }}
          />
        </span>
        <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs text-white shadow-lg">
          <p className="font-semibold text-amber-200">{hill.name ?? hill.id ?? 'Hill'}</p>
          <p>{labelParts.join(' · ')}</p>
        </div>
      </div>
    )
  }, [kingOfTheHillState, mapData, players, territories])

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

        // Load full map payload and read nested map fields
        const apiUrl =
          import.meta.env.MODE === 'production'
            ? `/api/maps/${mapId}`
            : `http://localhost:5001/api/maps/${mapId}`

        const response = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load map')
        }

        const payload = await response.json()
        const map = payload?.map ?? payload

        setMapData({
          imageUrl: map.imageUrl || map.image_url,
          width: map.imageWidth || 1280,
          height: map.imageHeight || 720,
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
  const oddsTooltip = useAttackOddsTooltip({
    pendingAction: pendingAction ?? null,
    selectedId: selectedTerritoryId ?? null,
    hoveredId,
    validTargets,
    territories,
    mapWidth: mapData?.width ?? 0,
    mapHeight: mapData?.height ?? 0,
  })

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
      showMinimap={true}
      backgroundImageUrl={mapData.imageUrl}
      focus={focus ?? undefined}
      onSwipeLeft={() => cycleOverlay('left')}
      onSwipeRight={() => cycleOverlay('right')}
    >
      {/* Overlay toggle buttons */}
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
                title="Toggle attackable overlay"
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
        {/* Ping button */}
        {(() => {
          const now = Date.now()
          const cooldownMs = 2000
          const coolingDown = (lastPingAt ?? 0) > 0 && now - lastPingAt < cooldownMs
          const targetId = selectedTerritoryId || hoveredId
          const disabled = !isMyTurn || !game?.roomId || !targetId || coolingDown
          const label = coolingDown ? 'Ping (cooldown)' : 'Ping'
          return (
            <button
              type="button"
              className={`btn btn-ghost btn-xs ${coolingDown ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (!game?.roomId || !targetId || coolingDown) return
                try {
                  socketService.emit('ping:territory', {
                    roomId: game.roomId,
                    territoryId: targetId,
                  })
                } catch {
                  // ignore ping emit errors
                }
                dispatch(setLastPingAt(now))
                try {
                  ;(
                    navigator as unknown as { vibrate?: (pattern: number | number[]) => void }
                  ).vibrate?.(15)
                } catch {
                  // ignore haptics errors
                }
              }}
              disabled={disabled}
              title={(() => {
                if (!targetId) return 'Select or hover a territory to ping'
                const name = territories.find((t) => t.id === targetId)?.name ?? targetId
                return `Ping ${name}`
              })()}
            >
              <span aria-hidden>📍</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          )
        })()}
      </div>

      {hillOverlay}
      {/* Sectors overlay: colored dots per territory */}
      {overlays.continents &&
        (() => {
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
          return territories.map((t) => {
            const color = cMap.get(t.continent || 'unknown') || '#94a3b8'
            return (
              <div
                key={`cont-${t.id}`}
                className="absolute z-10 pointer-events-none"
                style={{
                  left: `${(t.x / mapData.width) * 100}%`,
                  top: `${(t.y / mapData.height) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                title={`Sector: ${t.continent ?? 'unknown'}`}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full border border-white/60 shadow"
                  style={{ backgroundColor: color }}
                />
              </div>
            )
          })
        })()}

      {/* Attackable overlay: ring highlights for selected + valid targets */}
      {overlays.attackable &&
        selectedTerritoryId &&
        (() => {
          const entries: Array<{ id: string; x: number; y: number; kind: 'src' | 'tgt' }> = []
          const src = territories.find((t) => t.id === selectedTerritoryId)
          if (src) entries.push({ id: src.id, x: src.x, y: src.y, kind: 'src' })
          for (const tgt of validTargets) {
            const t = territories.find((tt) => tt.id === tgt)
            if (t) entries.push({ id: t.id, x: t.x, y: t.y, kind: 'tgt' })
          }
          return entries.map((e) => (
            <div
              key={`atk-${e.id}`}
              className="absolute z-10 pointer-events-none"
              style={{
                left: `${(e.x / mapData.width) * 100}%`,
                top: `${(e.y / mapData.height) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <AttackOverlayRing kind={e.kind} />
            </div>
          ))
        })()}

      {/* Threat overlay: heat rings on friendly territories proportional to adjacent enemy armies */}
      {overlays.threat &&
        game &&
        myId &&
        adjacency &&
        (() => {
          const byId = new Map<string, Territory>()
          for (const t of territories) {
            byId.set(t.id, t)
          }
          const isFriendly = (owner?: string | null) =>
            owner ? owner === myId || arePlayersTeammates(game, owner, myId) : false
          const items: Array<{ id: string; x: number; y: number; score: number }> = []
          for (const t of territories) {
            if (!isFriendly(t.owner)) continue
            let s = 0
            for (const adjId of adjacency[t.id] || []) {
              const adj = byId.get(adjId)
              if (!adj) continue
              if (!isFriendly(adj.owner)) s += Math.max(0, adj.armies ?? 0)
            }
            if (s > 0) items.push({ id: t.id, x: t.x, y: t.y, score: s })
          }
          const max = Math.max(1, ...items.map((i) => i.score))
          const colorFor = (r: number) => {
            if (r > 0.66) return 'rgba(239,68,68,0.85)'
            if (r > 0.33) return 'rgba(245,158,11,0.85)'
            if (r > 0.1) return 'rgba(34,197,94,0.85)'
            return 'rgba(148,163,184,0.6)'
          }
          return items.map((i) => {
            const ratio = Math.min(1, i.score / max)
            const color = colorFor(ratio)
            return (
              <div
                key={`thr-${i.id}`}
                className="absolute z-10 pointer-events-none"
                style={{
                  left: `${(i.x / (mapData.width || 1)) * 100}%`,
                  top: `${(i.y / (mapData.height || 1)) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                title={`Threat score: ${i.score}`}
              >
                <ThreatOverlayRing color={color} ratio={ratio} />
              </div>
            )
          })
        })()}
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

      {/* Focus animation on selected territory */}
      {focus && (
        <output
          className="absolute pointer-events-none z-10"
          style={{
            left: `${(focus.x / mapData.width) * 100}%`,
            top: `${(focus.y / mapData.height) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
          aria-live="polite"
          aria-label={(() => {
            const focusId = selectedTerritoryId
            if (!focusId) return 'Focused territory'
            const name = territories.find((t) => t.id === focusId)?.name ?? focusId
            return `Focused on ${name}`
          })()}
        >
          <div className="w-10 h-10 rounded-full border-2 border-cyan-300/80 animate-ping" />
        </output>
      )}

      {/* Ping markers */}
      {pings
        .filter((p) => p.expiresAt > Date.now())
        .map((ping) => {
          const t = territories.find((territory) => territory.id === ping.territoryId)
          if (!t) return null
          const left = (t.x / mapData.width) * 100
          const top = (t.y / mapData.height) * 100
          return (
            <button
              key={`ping-${ping.id}`}
              type="button"
              className="absolute z-30"
              style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' }}
              onClick={() => dispatch(selectTerritory(ping.territoryId))}
              title={ping.username ? `${ping.username} pinged` : 'Ping'}
            >
              <span className="relative block w-10 h-10">
                <span className="absolute inset-0 rounded-full border-2 border-cyan-300/80 animate-ping" />
                <span className="absolute inset-2 rounded-full bg-cyan-400/70" />
              </span>
            </button>
          )
        })}

      {oddsTooltip && (
        <div
          role="tooltip"
          className="absolute z-30 pointer-events-none animate-pulse"
          style={{
            left: `${oddsTooltip.left}%`,
            top: `${oddsTooltip.top}%`,
            transform: oddsTooltip.top > 20 ? 'translate(-50%, -140%)' : 'translate(-50%, 40%)',
          }}
        >
          <div className="rounded bg-surface-2/95 border border-border shadow px-2 py-1 text-xs text-white whitespace-nowrap">
            {`Odds (${oddsTooltip.att}v${oddsTooltip.def}) · Win ${oddsTooltip.winChance.toFixed(0)}% · E[Δ] ${oddsTooltip.odds.expected.advantage >= 0 ? '+' : ''}${oddsTooltip.odds.expected.advantage.toFixed(2)}`}
          </div>
        </div>
      )}
    </ResponsiveMapContainer>
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

function AttackOverlayRing({ kind }: { kind: 'src' | 'tgt' }) {
  const viewport = useMapViewport()
  const scale = clampViewportScale(viewport?.scale ?? 1)
  const baseSize = kind === 'src' ? 48 : 40
  const size = Math.max(14, Math.round(baseSize * scale))
  const ringWidth = Math.max(3, Math.round(scale * 3))
  const glowRadius = Math.max(16, Math.round(24 * scale))
  const baseColor = kind === 'src' ? 'rgba(56,189,248,0.9)' : 'rgba(239,68,68,0.9)'
  const glowColor = kind === 'src' ? 'rgba(56,189,248,0.45)' : 'rgba(239,68,68,0.45)'

  return (
    <span
      className="block rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        boxShadow: `0 0 0 ${ringWidth}px ${baseColor}, 0 0 ${glowRadius}px ${glowColor}`,
      }}
    />
  )
}

interface ThreatOverlayRingProps {
  color: string
  ratio: number
}

function ThreatOverlayRing({ color, ratio }: ThreatOverlayRingProps) {
  const viewport = useMapViewport()
  const scale = clampViewportScale(viewport?.scale ?? 1)
  const baseSize = 14 + Math.round(10 * ratio)
  const size = Math.max(10, Math.round(baseSize * scale))
  const ringWidth = Math.max(2, Math.round(scale * 3))
  const glowRadius = Math.max(12, Math.round(22 * scale))

  return (
    <span
      className="block rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        boxShadow: `0 0 0 ${ringWidth}px ${color}, 0 0 ${glowRadius}px ${color}`,
      }}
    />
  )
}
