import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FullMapData } from '../services/mapService'
import { mapService } from '../services/mapService'
import CustomMapDisplay from './CustomMapDisplay'

interface MapDetailModalProps {
  isOpen: boolean
  mapId: string | null
  onClose: () => void
}

const defaultTokenColor = '#6b7280'

export default function MapDetailModal({ isOpen, mapId, onClose }: MapDetailModalProps) {
  const [mapData, setMapData] = useState<FullMapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || !mapId) {
      setMapData(null)
      setError(null)
      return
    }

    const fetchDetails = async () => {
      try {
        setLoading(true)
        setError(null)
        const details = await mapService.getMap(mapId)
        setMapData(details)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load map details'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchDetails().catch((err) => {
      const message = err instanceof Error ? err.message : 'Failed to load map details'
      setError(message)
      setLoading(false)
    })
  }, [isOpen, mapId])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onClose])

  const handleBackdropClick = useCallback(() => {
    onClose()
  }, [onClose])

  const territoriesForDisplay = useMemo(() => {
    if (!mapData) {
      return []
    }

    return mapData.territories.map((territory) => ({
      id: territory.territoryId || territory.id,
      name: territory.name,
      x: territory.armyPosition?.x ?? 0,
      y: territory.armyPosition?.y ?? 0,
      sector: territory.continentId,
    }))
  }, [mapData])

  const sectors = useMemo(() => {
    if (!mapData) {
      return []
    }

    return mapData.continents.map((continent) => ({
      id: continent.id,
      name: continent.name,
      bonusArmies: continent.bonusArmies,
      color: continent.color || defaultTokenColor,
    }))
  }, [mapData])

  if (!isOpen || !mapId) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-label="Close map details"
      />

      <div
        ref={modalRef}
        className="relative z-10 flex w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-surface-1 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{mapData?.map.name || 'Map Details'}</h2>
            {mapData?.map.description && (
              <p className="mt-1 max-w-3xl text-sm text-muted">{mapData.map.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-surface-2 px-3 py-1 text-sm text-muted transition hover:text-white"
          >
            ✕ Close
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row">
          <div className="flex-1 overflow-hidden rounded-lg border border-border bg-surface-2">
            {loading && (
              <div className="flex h-[520px] items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
                  <p className="text-muted">Loading map preview...</p>
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="flex h-[520px] items-center justify-center px-6 text-center text-red-400">
                <div>
                  <p className="text-lg font-semibold">Unable to load map</p>
                  <p className="mt-2 text-sm">{error}</p>
                </div>
              </div>
            )}

            {!loading && !error && mapData && territoriesForDisplay.length > 0 && (
              <div className="h-[520px]">
                <CustomMapDisplay
                  mapId={mapId}
                  territories={territoriesForDisplay}
                  imageUrl={mapData.map.imageUrl}
                  mapWidth={mapData.map.imageWidth}
                  mapHeight={mapData.map.imageHeight}
                />
              </div>
            )}

            {!loading && !error && mapData && territoriesForDisplay.length === 0 && (
              <div className="flex h-[520px] items-center justify-center px-6 text-center text-muted">
                <div>
                  <p className="text-lg font-semibold text-white">No territories defined</p>
                  <p className="mt-2 text-sm">
                    This map doesn’t have any territory coordinates yet, so we can’t render the
                    tokens.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="w-full lg:w-[320px]">
            <div className="space-y-4">
              {mapData && (
                <div className="rounded-lg border border-border bg-surface-2 p-4">
                  <h3 className="text-lg font-semibold text-white">Map Overview</h3>
                  <dl className="mt-3 space-y-2 text-sm text-muted">
                    <div className="flex justify-between">
                      <dt>Creator</dt>
                      <dd>{mapData.map.creatorName || 'Unknown'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Games Played</dt>
                      <dd>{mapData.map.playCount ?? 0}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Ratings</dt>
                      <dd>
                        {mapData.map.ratingCount > 0
                          ? `${mapData.map.ratingAverage.toFixed(1)} / 5 (${mapData.map.ratingCount})`
                          : 'Not rated yet'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Territories</dt>
                      <dd>{mapData.territories.length}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Sectors</dt>
                      <dd>{mapData.continents.length}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Created</dt>
                      <dd>
                        {mapData.map.createdAt
                          ? new Date(mapData.map.createdAt).toLocaleDateString()
                          : '—'}
                      </dd>
                    </div>
                  </dl>

                  {mapData.map.tags && mapData.map.tags.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs uppercase tracking-wide text-muted">Tags</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {mapData.map.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-surface-3 px-2 py-1 text-xs text-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-border bg-surface-2 p-4">
                <h3 className="text-lg font-semibold text-white">Sectors & Bonuses</h3>
                {sectors.length === 0 && (
                  <p className="mt-3 text-sm text-muted">
                    No sector bonuses have been defined for this map yet.
                  </p>
                )}
                {sectors.length > 0 && (
                  <ul className="mt-3 space-y-3 text-sm">
                    {sectors.map((continent) => (
                      <li
                        key={continent.id}
                        className="flex items-center justify-between rounded bg-surface-3 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-white">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: continent.color }}
                          />
                          {continent.name}
                        </span>
                        <span className="text-muted">+{continent.bonusArmies} armies</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
