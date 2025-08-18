import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

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

// Types matching our backend
export interface CustomMap {
  id: string
  name: string
  description?: string
  creatorId: string
  imageUrl?: string
  imageWidth: number
  imageHeight: number
  isPublic: boolean
  isFeatured: boolean
  downloadCount: number
  ratingAverage: number
  ratingCount: number
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface MapTerritory {
  id: string
  mapId: string
  territoryId: string
  name: string
  continentId?: string
  boundaryCoords: Coordinate[]
  armyPosition: Coordinate
  abilityTypeId?: string
  customAbilityConfig?: any
  startingOwnerSlot?: number
  startingArmies: number
  createdAt: string
}

export interface MapContinent {
  id: string
  mapId: string
  name: string
  bonusArmies: number
  color: string
  specialRules?: any
  createdAt: string
}

export interface TerritoryAdjacency {
  id: string
  fromTerritoryId: string
  toTerritoryId: string
  connectionType: 'land' | 'sea' | 'air' | 'tunnel' | 'special'
  isBidirectional: boolean
  specialRequirements?: any
}

export interface TerritoryAbilityType {
  id: string
  name: string
  description?: string
  icon: string
  effectConfig: any
  createdAt: string
}

export interface GameMode {
  id: string
  name: string
  description?: string
  config: any
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
  continentId?: string
  boundaryCoords: Coordinate[]
  armyPosition: Coordinate
  abilityTypeId?: string
  startingOwnerSlot?: number
  startingArmies?: number
}

export interface CreateContinentRequest {
  name: string
  bonusArmies: number
  color?: string
}

export interface CreateAdjacencyRequest {
  fromTerritoryId: string
  toTerritoryId: string
  connectionType?: 'land' | 'sea' | 'air' | 'tunnel' | 'special'
  isBidirectional?: boolean
  specialRequirements?: any
}

export interface FullMapData {
  map: CustomMap
  continents: MapContinent[]
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

  async createContinent(mapId: string, continentData: CreateContinentRequest): Promise<MapContinent> {
    const response = await api.post(`/maps/${mapId}/continents`, continentData)
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

  async rateMap(mapId: string, rating: number, review?: string): Promise<any> {
    const response = await api.post(`/maps/${mapId}/rate`, { rating, review })
    return response.data
  },

  // ============= UTILITY FUNCTIONS =============

  getImageUrl(imageUrl?: string): string {
    if (!imageUrl) return ''
    if (imageUrl.startsWith('http')) return imageUrl
    return `${API_URL.replace('/api', '')}${imageUrl}`
  },

  validateMapData(territories: MapTerritory[], adjacencies: TerritoryAdjacency[]): {
    isValid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    // Check if all territories have at least one connection
    const connectedTerritories = new Set<string>()
    adjacencies.forEach(adj => {
      connectedTerritories.add(adj.fromTerritoryId)
      connectedTerritories.add(adj.toTerritoryId)
    })

    territories.forEach(territory => {
      if (!connectedTerritories.has(territory.id)) {
        errors.push(`Territory "${territory.name}" has no connections`)
      }
    })

    // Check if map is fully connected (all territories reachable)
    if (territories.length > 0) {
      const visited = new Set<string>()
      const queue = [territories[0].id]
      
      while (queue.length > 0) {
        const current = queue.shift()!
        if (visited.has(current)) continue
        
        visited.add(current)
        
        // Find adjacent territories
        adjacencies.forEach(adj => {
          if (adj.fromTerritoryId === current && !visited.has(adj.toTerritoryId)) {
            queue.push(adj.toTerritoryId)
          }
          if (adj.isBidirectional && adj.toTerritoryId === current && !visited.has(adj.fromTerritoryId)) {
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
      errors
    }
  }
}