import type React from 'react'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { useAppSelector } from '../hooks/redux'

interface Map {
  id: string
  name: string
  description?: string
  creatorName?: string
  imageUrl?: string
  playCount: number
  ratingAverage: number
  ratingCount: number
  tags: string[]
  createdAt: string
  isFeatured?: boolean
}

const Maps: React.FC = () => {
  const [maps, setMaps] = useState<Map[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('popularity')
  const [filterTag, setFilterTag] = useState('')
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    fetchMaps()
  }, [sortBy, filterTag])

  const fetchMaps = async () => {
    try {
      setLoading(true)
      // Fetch approved public maps
      const response = await api.get('/maps', {
        params: {
          status: 'approved',
          isPublic: true,
          sortBy: sortBy,
          tag: filterTag || undefined,
          limit: 50
        }
      })
      setMaps(response.data.maps || [])
    } catch (error) {
      console.error('Failed to fetch maps:', error)
      setMaps([])
    } finally {
      setLoading(false)
    }
  }

  const filteredMaps = maps.filter(map => 
    map.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    map.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    map.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const getRatingStars = (rating: number) => {
    const stars = []
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 >= 0.5
    
    for (let i = 0; i < fullStars; i++) {
      stars.push('⭐')
    }
    if (hasHalfStar && fullStars < 5) {
      stars.push('✨')
    }
    while (stars.length < 5) {
      stars.push('☆')
    }
    return stars.join('')
  }

  // Get unique tags from all maps for filter dropdown
  const allTags = Array.from(new Set(maps.flatMap(map => map.tags || []))).sort()

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-primary-soft">Maps Gallery</h1>
          <p className="text-muted text-lg">Explore community-created battlefields</p>
        </div>
        <Link
          to="/map-editor"
          className="btn-primary hover-lift hover-glow"
        >
          ✏️ Create Map
        </Link>
      </div>

      {/* Search and Filter */}
      <div className="mb-8 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search maps by name, description, or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-white placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="absolute right-3 top-3 text-muted">🔍</div>
        </div>
        
        {allTags.length > 0 && (
          <select 
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="bg-surface-2 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Tags</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        )}
        
        <select 
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary"
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
            <div
              key={map.id}
              className="box1 hover:border-primary transition-all duration-200 cursor-pointer group"
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
                  <div className="w-full h-full flex items-center justify-center text-6xl">
                    🗺️
                  </div>
                )}
                {map.isFeatured && (
                  <div className="absolute top-2 right-2 bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">
                    ⭐ Featured
                  </div>
                )}
              </div>

              {/* Map Info */}
              <div className="p-4">
                <h3 className="font-bold text-white mb-1 group-hover:text-primary transition-colors">
                  {map.name}
                </h3>
                {map.description && (
                  <p className="text-muted text-sm mb-2 line-clamp-2">
                    {map.description}
                  </p>
                )}
                
                {/* Tags */}
                {map.tags && map.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {map.tags.slice(0, 3).map((tag, index) => (
                      <span key={index} className="bg-surface-2 text-xs px-2 py-1 rounded text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-muted">
                      🎮 {map.playCount || 0}
                    </span>
                    {map.ratingCount > 0 && (
                      <span className="text-muted" title={`${map.ratingAverage.toFixed(1)}/5`}>
                        {getRatingStars(map.ratingAverage)}
                      </span>
                    )}
                  </div>
                  <span className="text-muted text-xs">
                    by {map.creatorName || 'Unknown'}
                  </span>
                </div>
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
                ? "Try adjusting your search or filter criteria."
                : "Be the first to create and share a map with the community!"}
            </p>
            <Link
              to="/map-editor"
              className="btn-primary inline-block"
            >
              ✏️ Create the First Map
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default Maps
