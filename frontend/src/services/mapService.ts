import axios from 'axios'

// Use relative URL in production, absolute URL in development
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:5001/api')

const api = axios.create({
  baseURL: API_URL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Add response interceptor to handle errors better
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.error) {
      // Use the server's error message if available
      error.message = error.response.data.error
    }
    return Promise.reject(error)
  },
)

// Types matching our backend
export interface CustomMap {
  id: string
  name: string
  description?: string
  creatorId: string
  creatorName?: string
  imageUrl?: string
  imageWidth: number
  imageHeight: number
  imageVariants?: {
    avif?: Array<{ url: string; width: number; height?: number }>
    webp?: Array<{ url: string; width: number; height?: number }>
  }
  isPublic: boolean
  isFeatured: boolean
  status: string
  version: number
  parentMapId?: string
  downloadCount: number
  playCount: number
  ratingAverage: number
  ratingCount: number
  tags: string[]
  capitalTerritories?: Record<string, number[]>
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNotes?: string
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

export interface MapTerritory {
  id: string
  mapId: string
  territoryId: string
  name: string
  sectorId?: string
  boundaryCoords: Coordinate[]
  armyPosition: Coordinate
  abilityTypeId?: string
  customAbilityConfig?: unknown
  startingOwnerSlot?: number
  startingArmies: number
  createdAt: string
}

export interface MapSector {
  id: string
  mapId: string
  name: string
  bonusArmies: number
  color: string
  specialRules?: unknown
  createdAt: string
}

export interface TerritoryAdjacency {
  id: string
  fromTerritoryId: string
  toTerritoryId: string
  connectionType: 'land' | 'sea' | 'air' | 'tunnel' | 'special'
  isBidirectional: boolean
  specialRequirements?: unknown
}

export interface TerritoryAbilityType {
  id: string
  name: string
  description?: string
  icon: string
  effectConfig: unknown
  createdAt: string
}

export interface GameMode {
  id: string
  name: string
  description?: string
  config: unknown
  isDefault: boolean
  createdAt: string
}

export interface Coordinate {
  x: number
  y: number
}

export interface MapSearchFilters {
  search?: string
  tags?: string[]
  creator?: string
  isPublic?: boolean
  isFeatured?: boolean
  minRating?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface MapSearchResult {
  maps: CustomMap[]
  total: number
  hasMore: boolean
}

export interface CreateMapRequest {
  name: string
  description?: string
  isPublic?: boolean
  tags?: string[]
}

export interface UpdateMapRequest {
  name?: string
  description?: string
  isPublic?: boolean
  tags?: string[]
}

export interface CreateTerritoryRequest {
  mapId: string
  territoryId: string
  name: string
  sectorId?: string
  boundaryCoords: Coordinate[]
  armyPosition: Coordinate
  abilityTypeId?: string
  startingOwnerSlot?: number
  startingArmies?: number
}

export interface CreateSectorRequest {
  name: string
  bonusArmies: number
  color?: string
}

export interface CreateAdjacencyRequest {
  fromTerritoryId: string
  toTerritoryId: string
  connectionType?: 'land' | 'sea' | 'air' | 'tunnel' | 'special'
  isBidirectional?: boolean
  specialRequirements?: unknown
}

export interface FullMapData {
  map: CustomMap
  sectors: MapSector[]
  territories: MapTerritory[]
  adjacencies: TerritoryAdjacency[]
  gameMode?: GameMode
}

export const mapService = {
  // ============= MAP OPERATIONS =============

  async searchMaps(filters: MapSearchFilters = {}): Promise<MapSearchResult> {
    const params = new URLSearchParams()
    if (filters.search) params.append('search', filters.search)
    if (filters.tags) params.append('tags', filters.tags.join(','))
    if (filters.creator) params.append('creator', filters.creator)
    if (filters.isFeatured !== undefined) params.append('featured', filters.isFeatured.toString())
    if (filters.minRating) params.append('minRating', filters.minRating.toString())
    if (filters.sortBy) params.append('sortBy', filters.sortBy)
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.offset) params.append('offset', filters.offset.toString())

    const response = await api.get(`/maps?${params.toString()}`)
    return response.data
  },

  async getMap(mapId: string): Promise<FullMapData> {
    const response = await api.get(`/maps/${mapId}`)
    const obj = response.data as Record<string, unknown>
    const rawSectors = obj.sectors
    if (Array.isArray(rawSectors)) {
      ;(obj as { sectors: unknown[] }).sectors = rawSectors as unknown[]
    } else if (rawSectors && typeof rawSectors === 'object') {
      ;(obj as { sectors: unknown[] }).sectors = Object.values(
        rawSectors as Record<string, unknown>,
      )
    } else {
      ;(obj as { sectors: unknown[] }).sectors = []
    }
    return obj as unknown as FullMapData
  },

  async validateMapServer(mapId: string): Promise<{ isValid: boolean; errors: string[] }> {
    const response = await api.get(`/maps/${mapId}/validate`)
    return response.data
  },

  async createMap(mapData: CreateMapRequest, imageFile?: File): Promise<CustomMap> {
    const formData = new FormData()
    formData.append('name', mapData.name)
    if (mapData.description) formData.append('description', mapData.description)
    if (mapData.isPublic !== undefined) formData.append('isPublic', mapData.isPublic.toString())
    if (mapData.tags) formData.append('tags', JSON.stringify(mapData.tags))
    if (imageFile) formData.append('image', imageFile)

    const response = await api.post('/maps', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  async updateMap(mapId: string, mapData: UpdateMapRequest, imageFile?: File): Promise<CustomMap> {
    const formData = new FormData()
    if (mapData.name) formData.append('name', mapData.name)
    if (mapData.description !== undefined) formData.append('description', mapData.description)
    if (mapData.isPublic !== undefined) formData.append('isPublic', mapData.isPublic.toString())
    if (mapData.tags) formData.append('tags', JSON.stringify(mapData.tags))
    if (imageFile) formData.append('image', imageFile)

    const response = await api.put(`/maps/${mapId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  async deleteMap(mapId: string): Promise<void> {
    await api.delete(`/maps/${mapId}`)
  },

  async getMyMaps(filters: MapSearchFilters = {}): Promise<MapSearchResult> {
    const params = new URLSearchParams()
    if (filters.sortBy) params.append('sortBy', filters.sortBy)
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.offset) params.append('offset', filters.offset.toString())

    const response = await api.get(`/maps/my/maps?${params.toString()}`)
    return response.data
  },

  // ============= TERRITORY OPERATIONS =============

  async createTerritory(territoryData: CreateTerritoryRequest): Promise<MapTerritory> {
    const response = await api.post(`/maps/${territoryData.mapId}/territories`, territoryData)
    return response.data
  },

  async createSector(mapId: string, sectorData: CreateSectorRequest): Promise<MapSector> {
    const response = await api.post(`/maps/${mapId}/sectors`, sectorData)
    return response.data
  },

  async createAdjacency(adjacencyData: CreateAdjacencyRequest): Promise<TerritoryAdjacency> {
    const response = await api.post('/maps/adjacencies', adjacencyData)
    return response.data
  },

  // ============= METADATA OPERATIONS =============

  async getGameModes(): Promise<GameMode[]> {
    const response = await api.get('/maps/game-modes/list')
    return response.data
  },

  async getTerritoryAbilityTypes(): Promise<TerritoryAbilityType[]> {
    const response = await api.get('/maps/abilities/list')
    return response.data
  },

  // ============= RATING OPERATIONS =============

  async rateMap(mapId: string, rating: number, review?: string): Promise<unknown> {
    const response = await api.post(`/maps/${mapId}/rate`, { rating, review })
    return response.data
  },

  // ============= UTILITY FUNCTIONS =============

  getImageUrl(imageUrl?: string): string {
    if (!imageUrl) return ''
    // Return data URLs, http URLs, and blob URLs as-is
    if (
      imageUrl.startsWith('http') ||
      imageUrl.startsWith('blob:') ||
      imageUrl.startsWith('data:')
    ) {
      return imageUrl
    }
    // Convert relative URLs to absolute
    return `${API_URL.replace('/api', '')}${imageUrl}`
  },

  validateMapData(
    territories: MapTerritory[],
    adjacencies: TerritoryAdjacency[],
  ): {
    isValid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    // Check if all territories have at least one connection
    const connectedTerritories = new Set<string>()
    adjacencies.forEach((adj) => {
      connectedTerritories.add(adj.fromTerritoryId)
      connectedTerritories.add(adj.toTerritoryId)
    })

    territories.forEach((territory) => {
      if (!connectedTerritories.has(territory.id)) {
        errors.push(`Territory "${territory.name}" has no connections`)
      }
    })

    // Check if map is fully connected (all territories reachable)
    if (territories.length > 0) {
      const visited = new Set<string>()
      const queue = [territories[0].id]

      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) break
        if (visited.has(current)) continue

        visited.add(current)

        // Find adjacent territories
        adjacencies.forEach((adj) => {
          if (adj.fromTerritoryId === current && !visited.has(adj.toTerritoryId)) {
            queue.push(adj.toTerritoryId)
          }
          if (
            adj.isBidirectional &&
            adj.toTerritoryId === current &&
            !visited.has(adj.fromTerritoryId)
          ) {
            queue.push(adj.fromTerritoryId)
          }
        })
      }

      if (visited.size !== territories.length) {
        errors.push('Map is not fully connected - some territories are unreachable')
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  },
}
