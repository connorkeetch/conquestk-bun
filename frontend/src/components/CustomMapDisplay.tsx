import { useEffect, useState } from 'react'
import { logger } from '@/utils/logger'
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
  selectedTerritoryId?: string | null
  playerColors?: Record<string, string>
}

export default function CustomMapDisplay({
  mapId,
  territories,
  onTerritoryClick,
  selectedTerritoryId,
  playerColors = {},
}: CustomMapDisplayProps) {
  const [mapData, setMapData] = useState<{
    imageUrl: string
    width: number
    height: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadMapData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Load map metadata
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

        const map = await response.json()

        // Extract dimensions from metadata
        const metadata = typeof map.metadata === 'string' ? JSON.parse(map.metadata) : map.metadata

        setMapData({
          imageUrl: map.imageUrl || map.image_url,
          width: metadata?.width || 1280,
          height: metadata?.height || 720,
        })
      } catch (error) {
        logger.error('Failed to load custom map data', error)
        setError('Failed to load map')
      } finally {
        setLoading(false)
      }
    }

    if (mapId && mapId !== 'classic') {
      loadMapData()
    }
  }, [mapId])

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
    >
      {/* Map background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${mapData.imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Territory tokens */}
      {territories.map((territory) => {
        const isSelected = territory.id === selectedTerritoryId
        const ownerColor = territory.owner ? playerColors[territory.owner] : undefined

        return (
          <button
            key={territory.id}
            className={`absolute cursor-pointer transition-all ${isSelected ? 'z-20' : 'z-10'}`}
            style={{
              left: `${(territory.x / mapData.width) * 100}%`,
              top: `${(territory.y / mapData.height) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
            type="button"
            onClick={() => handleTerritoryActivate(territory.id)}
          >
            {/* Territory token */}
            <span
              className={`relative block w-8 h-8 rounded-full border-2 ${
                isSelected ? 'border-yellow-400 border-4' : 'border-black'
              }`}
              style={{
                backgroundColor: ownerColor || '#666',
                boxShadow: isSelected
                  ? '0 0 10px rgba(250, 204, 21, 0.5)'
                  : '0 2px 4px rgba(0,0,0,0.3)',
              }}
            >
              {/* Army count */}
              {territory.armies && territory.armies > 0 && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{territory.armies}</span>
                </span>
              )}
            </span>

            {/* Territory name tooltip */}
            <span className="absolute -bottom-6 left-1/2 block -translate-x-1/2 whitespace-nowrap bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
              {territory.name}
            </span>
          </button>
        )
      })}
    </ResponsiveMapContainer>
  )
}
