import { useEffect, useMemo, useState } from 'react'
import { useAppSelector } from '@/hooks/redux'
import { logger } from '@/utils/logger'
import { computeRollOdds } from '@/utils/odds'
import ResponsiveMapContainer from './ResponsiveMapContainer'

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
}: CustomMapDisplayProps) {
  const [mapData, setMapData] = useState<{
    imageUrl: string
    width: number
    height: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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

    if (mapId && mapId !== 'classic') {
      if (!hydrateFromProps()) {
        void loadMapData()
      }
    }
  }, [mapId, imageUrl, mapWidth, mapHeight])

  // Hooks must be top-level
  const attackDice = useAppSelector((s) => s.uiRoom.dice)
  const oddsTooltip = useMemo(() => {
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
    const def = Math.max(1, Math.min(2, dstArmies > 1 ? 2 : 1)) as 1 | 2
    const odds = computeRollOdds(att, def)
    const winChance = (odds.probabilities.defenderLoses1 + odds.probabilities.defenderLoses2) * 100
    const left = (dst.x / mapData.width) * 100
    const top = (dst.y / mapData.height) * 100
    return { att, def, odds, winChance, left, top }
  }, [
    attackDice,
    hoveredId,
    mapData,
    pendingAction,
    selectedTerritoryId,
    territories,
    validTargets,
  ])

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

  return (
    <ResponsiveMapContainer
      mapWidth={mapData.width}
      mapHeight={mapData.height}
      className="custom-map-display"
      showMinimap={true}
      backgroundImageUrl={mapData.imageUrl}
      focus={focus ?? undefined}
    >
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
        const color = ownerColor || '#6b7280' // gray-500 as fallback
        const isValidTarget =
          pendingAction === 'attack' && validTargets.includes(territory.id) && selectedTerritoryId

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
            <button
              type="button"
              onClick={() => handleTerritoryActivate(territory.id)}
              onMouseEnter={() => {
                setHoveredId(territory.id)
                onTerritoryHover?.(territory.id)
              }}
              onMouseLeave={() => {
                setHoveredId(null)
                onTerritoryHover?.(null)
              }}
              className={`relative block ${isValidTarget ? 'animate-pulse' : ''}`}
              title={territory.name}
              aria-label={`Territory: ${territory.name}`}
              style={{ cursor: isValidTarget ? ('crosshair' as const) : 'pointer' }}
            >
              <span
                className="block"
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: color,
                  opacity: isSelected ? 0.9 : 0.8,
                  clipPath: 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)',
                  boxShadow: isSelected
                    ? '0 0 15px rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.3)'
                    : isValidTarget
                      ? '0 0 8px rgba(56,189,248,0.7), 0 2px 4px rgba(0,0,0,0.3)'
                      : '0 2px 4px rgba(0,0,0,0.3)',
                  border: isValidTarget ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {territory.armies && territory.armies > 0 ? (
                  <span
                    style={{
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 700,
                      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    }}
                  >
                    {territory.armies}
                  </span>
                ) : null}
              </span>
            </button>
          </div>
        )
      })}

      {oddsTooltip && (
        <div
          role="tooltip"
          className="absolute z-30 pointer-events-none animate-pulse"
          style={{
            left: `${oddsTooltip.left}%`,
            top: `${oddsTooltip.top}%`,
            transform: 'translate(-50%, -140%)',
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
