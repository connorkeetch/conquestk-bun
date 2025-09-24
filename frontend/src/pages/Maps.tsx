import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MapDetailModal from '@/components/MapDetailModal'
import { logger } from '@/utils/logger'
import { useAppSelector } from '../hooks/redux'
import api from '../services/api'

interface Map {
  id: string
  name: string
  description?: string
  creatorName?: string
  creatorId?: string
  imageUrl?: string
  playCount: number
  ratingAverage: number
  ratingCount: number
  tags: string[]
  createdAt: string
  status?: string
  isFeatured?: boolean
  isVipOnly?: boolean
  isPublic?: boolean
}

const Maps: React.FC = () => {
  const [maps, setMaps] = useState<Map[]>([])
  const [myMaps, setMyMaps] = useState<Map[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('popularity')
  const [filterTag, setFilterTag] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showMyMaps, setShowMyMaps] = useState(false)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const { user } = useAppSelector((state) => state.auth)

  const fetchMaps = useCallback(async () => {
    try {
      setLoading(true)
      // Fetch approved public maps
      const response = await api.get('/maps', {
        params: {
          status: 'approved',
          isPublic: true,
          sortBy: sortBy,
          tag: filterTag || undefined,
          limit: 50,
        },
      })
      setMaps(response.data.maps || [])
    } catch (error) {
      logger.error('Failed to fetch maps', error)
      setMaps([])
    } finally {
      setLoading(false)
    }
  }, [sortBy, filterTag])
  const fetchMyMaps = useCallback(async () => {
    try {
      // Fetch user's own maps (all statuses)
      const response = await api.get('/maps/my-maps')
      setMyMaps(response.data || [])
    } catch (error) {
      logger.error('Failed to fetch my maps', error)
      setMyMaps([])
    }
  }, [])

  useEffect(() => {
    void fetchMaps()
    if (user) {
      void fetchMyMaps()
    }
  }, [fetchMaps, fetchMyMaps, user])

  const mapsToShow = showMyMaps ? myMaps : maps
  let filteredMaps = mapsToShow.filter(
    (map) =>
      map.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      map.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      map.tags?.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase())),
  )

  // Apply status filter for My Maps
  if (showMyMaps && filterStatus) {
    filteredMaps = filteredMaps.filter((map) => map.status === filterStatus)
  }

  const getStatusBadge = (status?: string) => {
    if (!status) return null
    const badges = {
      draft: { text: 'Draft', className: 'bg-gray-600' },
      pending_review: { text: 'Under Review', className: 'bg-orange-600' },
      approved: { text: 'Approved', className: 'bg-green-600' },
      rejected: { text: 'Rejected', className: 'bg-red-600' },
      archived: { text: 'Archived', className: 'bg-gray-700' },
    }
    const badge = badges[status as keyof typeof badges]
    if (!badge) return null
    return (
      <span className={`${badge.className} text-white text-xs px-2 py-1 rounded`}>
        {badge.text}
      </span>
    )
  }

  // Get unique tags from all maps for filter dropdown
  const allTags = Array.from(new Set(maps.flatMap((map) => map.tags || []))).sort()

  const openMapModal = (mapId: string) => {
    setSelectedMapId(mapId)
  }

  const closeMapModal = () => {
    setSelectedMapId(null)
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-primary-soft">
            {showMyMaps ? 'My Maps' : 'Maps Gallery'}
          </h1>
          <p className="text-muted text-lg">
            {showMyMaps ? 'Manage your created maps' : 'Explore community-created battlefields'}
          </p>
        </div>
        <div className="flex gap-3">
          {user && (
            <div className="segmented-control">
              <button
                type="button"
                onClick={() => setShowMyMaps(false)}
                className={!showMyMaps ? 'segmented-active' : ''}
              >
                🌍 All Maps
              </button>
              <button
                type="button"
                onClick={() => setShowMyMaps(true)}
                className={showMyMaps ? 'segmented-active' : ''}
              >
                📁 My Maps
                {myMaps.length > 0 && (
                  <span className="ml-2 bg-primary/20 text-primary px-2 py-0.5 rounded text-sm">
                    {myMaps.length}
                  </span>
                )}
              </button>
            </div>
          )}
          <Link to="/map-editor" className="btn-primary">
            ✏️ Create Map
          </Link>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="mb-8 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search maps by name, description, or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full glass-box-sm text-white placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="absolute right-3 top-3 text-muted">🔍</div>
        </div>

        {showMyMaps && (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="glass-box-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>
        )}

        {!showMyMaps && allTags.length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="glass-box-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="glass-box-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="popularity">Sort by Popularity</option>
          <option value="rating">Sort by Rating</option>
          <option value="newest">Sort by Newest</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted">Loading maps...</p>
          </div>
        </div>
      )}

      {/* Maps Grid */}
      {!loading && filteredMaps.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredMaps.map((map) => (
            // biome-ignore lint/a11y/useSemanticElements: Card contains nested controls so it cannot be a semantic button element
            <div
              key={map.id}
              role="button"
              tabIndex={0}
              onClick={() => openMapModal(map.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openMapModal(map.id)
                }
              }}
              className="box1 cursor-pointer transition-all duration-200 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary group"
            >
              {/* Map Thumbnail */}
              <div className="relative h-48 bg-surface-2 rounded-t-lg overflow-hidden">
                {map.imageUrl ? (
                  <img
                    src={map.imageUrl}
                    alt={map.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl">🗺️</div>
                )}
                <div className="absolute top-2 right-2 flex gap-2">
                  {map.isFeatured && (
                    <div className="bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">
                      ⭐ Featured
                    </div>
                  )}
                  {map.isVipOnly && (
                    <div className="bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold">
                      👑 VIP
                    </div>
                  )}
                </div>
              </div>

              {/* Map Info */}
              <div className="p-4">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-white group-hover:text-primary transition-colors">
                    {map.name}
                    {!map.isPublic && (
                      <span className="ml-1 text-gray-400 text-xs" title="Private">
                        🔒
                      </span>
                    )}
                  </h3>
                  {showMyMaps && getStatusBadge(map.status)}
                </div>
                {map.description && (
                  <p className="text-muted text-sm mb-2 line-clamp-2">{map.description}</p>
                )}

                {/* Tags */}
                {map.tags && map.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {map.tags.slice(0, 3).map((tag) => (
                      <span
                        key={`${map.id}-${tag}`}
                        className="bg-surface-2 text-xs px-2 py-1 rounded text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex flex-col gap-1 text-muted">
                    <span>Games played: {map.playCount || 0}</span>
                    {map.ratingCount > 0 && (
                      <span title={`${map.ratingAverage.toFixed(1)}/5`}>
                        Rating: {map.ratingAverage.toFixed(1)} / 5 ({map.ratingCount})
                      </span>
                    )}
                  </div>
                  <span className="text-muted text-xs">by {map.creatorName || 'Unknown'}</span>
                </div>

                {/* Action Buttons for My Maps */}
                {showMyMaps && user && map.creatorId === user.id && (
                  <div className="mt-3 pt-3 border-t border-border flex gap-2">
                    <Link
                      to={`/map-editor?edit=${map.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="flex-1 bg-primary hover:brightness-110 text-white text-xs px-2 py-1.5 rounded text-center transition-all"
                    >
                      ✏️ Edit
                    </Link>
                    {map.status === 'draft' && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await api.put(`/maps/${map.id}/submit`)
                            fetchMyMaps()
                          } catch (error) {
                            logger.error('Failed to submit map', error)
                          }
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1.5 rounded text-center transition-all"
                      >
                        📤 Submit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Maps Found */}
      {!loading && filteredMaps.length === 0 && (
        <div className="text-center py-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-8xl mb-8">🗺️</div>
            <h2 className="text-3xl font-bold text-white mb-4">
              {searchTerm || filterTag ? 'No Maps Found' : 'No Maps Available'}
            </h2>
            <p className="text-muted text-lg mb-8 leading-relaxed">
              {searchTerm || filterTag
                ? 'Try adjusting your search or filter criteria.'
                : 'Be the first to create and share a map with the community!'}
            </p>
            <Link to="/map-editor" className="btn-primary inline-block">
              ✏️ Create the First Map
            </Link>
          </div>
        </div>
      )}

      <MapDetailModal
        isOpen={selectedMapId !== null}
        mapId={selectedMapId}
        onClose={closeMapModal}
      />
    </div>
  )
}

export default Maps
