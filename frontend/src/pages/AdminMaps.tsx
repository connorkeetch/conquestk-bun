import { isAxiosError } from 'axios'
import type React from 'react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

const getErrorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

interface Map {
  id: string
  name: string
  description?: string
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived'
  creatorId: string
  creatorName?: string
  imageUrl?: string
  image_url?: string
  imageWidth?: number
  imageHeight?: number
  image_width?: number
  image_height?: number
  isPublic: boolean
  isFeatured: boolean
  isVipOnly?: boolean
  minPlayers: number
  maxPlayers: number
  playCount: number
  ratingAverage: number
  ratingCount: number
  tags: string[]
  createdAt: string
  updatedAt: string
  reviewNotes?: string
  rejectionReason?: string
  territoryCount?: number
  continentCount?: number
}

interface RawTerritoryRecord {
  id: string
  name?: string
  continent?: string | null
  polygon_data?: unknown
  metadata?: unknown
  army_position?: unknown
  center_x?: number | null
  center_y?: number | null
  x?: number | null
  y?: number | null
  is_capital?: boolean
}

interface RawAdjacencyRecord {
  territory_from?: string
  territory_to?: string
  from?: string
  to?: string
}

interface MapPreviewDetails {
  territories: RawTerritoryRecord[]
  adjacencies: RawAdjacencyRecord[]
  imageWidth?: number
  imageHeight?: number
  canvasWidth?: number
  canvasHeight?: number
}

interface TokenPosition {
  x: number
  y: number
}

const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return null
}

const averagePoints = (points: unknown): TokenPosition | null => {
  if (!Array.isArray(points) || points.length === 0) return null

  let sumX = 0
  let sumY = 0
  let count = 0

  for (const point of points) {
    if (Array.isArray(point) && point.length >= 2) {
      const [rawX, rawY] = point
      const x = typeof rawX === 'number' ? rawX : Number(rawX)
      const y = typeof rawY === 'number' ? rawY : Number(rawY)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        sumX += x
        sumY += y
        count += 1
      }
      continue
    }

    if (typeof point === 'object' && point !== null) {
      const candidate = point as Record<string, unknown>
      const x = candidate.x
      const y = candidate.y
      if (typeof x === 'number' && typeof y === 'number') {
        sumX += x
        sumY += y
        count += 1
      }
    }
  }

  if (count === 0) return null

  return {
    x: sumX / count,
    y: sumY / count,
  }
}

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

const extractPositionFromSource = (value: unknown): TokenPosition | null => {
  const data = parseJsonObject(value)
  if (!data) return null

  const x = data.x
  const y = data.y
  if (typeof x === 'number' && typeof y === 'number') {
    return { x, y }
  }

  const armyPosition = data.armyPosition
  if (typeof armyPosition === 'object' && armyPosition !== null) {
    const position = armyPosition as Record<string, unknown>
    const posX = position.x
    const posY = position.y
    if (typeof posX === 'number' && typeof posY === 'number') {
      return { x: posX, y: posY }
    }
  }

  if ('points' in data) {
    return averagePoints((data as Record<string, unknown>).points)
  }

  return null
}

const getPixelTokenPosition = (territory: RawTerritoryRecord): TokenPosition | null => {
  if (typeof territory.center_x === 'number' && typeof territory.center_y === 'number') {
    return { x: territory.center_x, y: territory.center_y }
  }
  if (typeof territory.x === 'number' && typeof territory.y === 'number') {
    return { x: territory.x, y: territory.y }
  }

  return (
    extractPositionFromSource(territory.army_position) ||
    extractPositionFromSource(territory.metadata) ||
    extractPositionFromSource(territory.polygon_data)
  )
}

const getNormalizedTokenPosition = (
  territory: RawTerritoryRecord,
  canvasWidth: number,
  canvasHeight: number,
): TokenPosition | null => {
  if (
    !Number.isFinite(canvasWidth) ||
    !Number.isFinite(canvasHeight) ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return null
  }

  const metadata = parseJsonObject(territory.metadata) || parseJsonObject(territory.polygon_data)

  const normalizedXCandidate =
    toFiniteNumberOrNull(
      metadata && 'normalizedX' in metadata ? (metadata.normalizedX as unknown) : undefined,
    ) ??
    toFiniteNumberOrNull(
      metadata && 'normalized_x' in metadata ? (metadata.normalized_x as unknown) : undefined,
    ) ??
    toFiniteNumberOrNull(
      metadata && 'armyPositionNormalized' in metadata
        ? (metadata.armyPositionNormalized as { x?: unknown } | undefined)?.x
        : undefined,
    )

  const normalizedYCandidate =
    toFiniteNumberOrNull(
      metadata && 'normalizedY' in metadata ? (metadata.normalizedY as unknown) : undefined,
    ) ??
    toFiniteNumberOrNull(
      metadata && 'normalized_y' in metadata ? (metadata.normalized_y as unknown) : undefined,
    ) ??
    toFiniteNumberOrNull(
      metadata && 'armyPositionNormalized' in metadata
        ? (metadata.armyPositionNormalized as { y?: unknown } | undefined)?.y
        : undefined,
    )

  if (normalizedXCandidate !== null && normalizedYCandidate !== null) {
    return {
      x: clamp01(normalizedXCandidate),
      y: clamp01(normalizedYCandidate),
    }
  }

  const pixel = getPixelTokenPosition(territory)
  if (pixel) {
    return {
      x: clamp01(pixel.x / canvasWidth),
      y: clamp01(pixel.y / canvasHeight),
    }
  }

  return null
}

const isCapitalTerritory = (territory: RawTerritoryRecord): boolean => {
  if (territory.is_capital === true) return true

  const metadata = parseJsonObject(territory.metadata) || parseJsonObject(territory.polygon_data)
  if (metadata && typeof metadata.isCapital === 'boolean') {
    return metadata.isCapital
  }

  return false
}

interface MapFilters {
  status?: string
  search?: string
  creatorId?: string
  sortBy: string
}

export const AdminMaps: React.FC = () => {
  const [maps, setMaps] = useState<Map[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<MapFilters>({ sortBy: 'newest' })
  const [selectedMap, setSelectedMap] = useState<Map | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewMap, setPreviewMap] = useState<Map | null>(null)
  const [previewDetails, setPreviewDetails] = useState<MapPreviewDetails | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewImageSize, setPreviewImageSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const previewImageSrc = previewMap ? previewMap.imageUrl || previewMap.image_url : undefined
  const previewImageWidth =
    previewImageSize?.width ??
    previewDetails?.imageWidth ??
    previewMap?.imageWidth ??
    previewMap?.image_width ??
    undefined
  const previewImageHeight =
    previewImageSize?.height ??
    previewDetails?.imageHeight ??
    previewMap?.imageHeight ??
    previewMap?.image_height ??
    undefined
  const [approvalNotes, setApprovalNotes] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    minPlayers: 2,
    maxPlayers: 6,
    tags: [] as string[],
    status: 'draft' as Map['status'],
    isFeatured: false,
    isPublic: true,
    isVipOnly: false,
  })
  const mapNameId = useId()
  const mapStatusId = useId()
  const mapDescriptionId = useId()
  const mapMinPlayersId = useId()
  const mapMaxPlayersId = useId()
  const mapFeaturedId = useId()
  const mapPublicId = useId()
  const mapVipOnlyId = useId()

  const statusLabels: Record<Map['status'], string> = {
    draft: 'Draft',
    pending_review: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
    archived: 'Archived',
  }

  const loadMaps = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/admin/maps', {
        params: {
          ...filters,
          includeAll: true, // Include all statuses
        },
      })
      setMaps(response.data.maps || [])
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to load maps'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void loadMaps()
  }, [loadMaps])

  const loadPreviewDetails = useCallback(async (mapId: string) => {
    try {
      setPreviewLoading(true)
      setPreviewError(null)

      const response = await api.get(`/admin/maps/${mapId}`)
      const data = response.data as {
        territories?: RawTerritoryRecord[]
        adjacencies?: RawAdjacencyRecord[]
        metadata?: unknown
        image_width?: number | null
        image_height?: number | null
        imageWidth?: number | null
        imageHeight?: number | null
      }

      const metadata = parseJsonObject((data as { metadata?: unknown }).metadata)
      const metadataRecord = metadata as {
        width?: unknown
        height?: unknown
        territories?: unknown
      } | null

      const metadataTerritoriesRaw = metadataRecord?.territories
      const metadataTerritories = Array.isArray(metadataTerritoriesRaw)
        ? metadataTerritoriesRaw
        : []

      const metadataWidth =
        metadataRecord && typeof metadataRecord.width === 'number'
          ? (metadataRecord.width as number)
          : undefined

      const metadataHeight =
        metadataRecord && typeof metadataRecord.height === 'number'
          ? (metadataRecord.height as number)
          : undefined

      let territories: RawTerritoryRecord[] = Array.isArray(data.territories)
        ? (data.territories as RawTerritoryRecord[])
        : []

      if (territories.length === 0 && metadataTerritories.length > 0) {
        territories = metadataTerritories
          .map((entry) => {
            const record = parseJsonObject(entry)
            if (!record) return null

            const idValue = record.id
            const nameValue = record.name
            const xValue = record.x
            const yValue = record.y
            const continentValue = record.continentId ?? record.continent

            if (typeof idValue !== 'string') {
              return null
            }

            return {
              id: idValue,
              name: typeof nameValue === 'string' ? nameValue : undefined,
              x: typeof xValue === 'number' ? xValue : undefined,
              y: typeof yValue === 'number' ? yValue : undefined,
              continent: typeof continentValue === 'string' ? continentValue : null,
              polygon_data: record,
            }
          })
          .filter((item): item is RawTerritoryRecord => Boolean(item))
      }

      const resolvedImageWidth =
        typeof data.imageWidth === 'number'
          ? data.imageWidth
          : typeof data.image_width === 'number'
            ? data.image_width
            : metadataWidth

      const resolvedImageHeight =
        typeof data.imageHeight === 'number'
          ? data.imageHeight
          : typeof data.image_height === 'number'
            ? data.image_height
            : metadataHeight

      const adjacencies: RawAdjacencyRecord[] = Array.isArray(data.adjacencies)
        ? (data.adjacencies as RawAdjacencyRecord[])
        : []

      setPreviewDetails({
        territories,
        adjacencies,
        imageWidth: resolvedImageWidth,
        imageHeight: resolvedImageHeight,
        canvasWidth: metadataWidth,
        canvasHeight: metadataHeight,
      })

      setPreviewMap((current) => {
        if (!current || current.id !== mapId) {
          return current
        }

        return {
          ...current,
          imageWidth: resolvedImageWidth ?? current.imageWidth,
          imageHeight: resolvedImageHeight ?? current.imageHeight,
          image_width:
            typeof data.image_width === 'number' ? data.image_width : current.image_width,
          image_height:
            typeof data.image_height === 'number' ? data.image_height : current.image_height,
        }
      })
    } catch (error: unknown) {
      setPreviewError(getErrorMessage(error, 'Failed to load map preview'))
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const handlePreviewMap = useCallback(
    (map: Map) => {
      setSelectedMap(map)
      setPreviewMap(map)
      setPreviewDetails(null)
      setPreviewError(null)
      setPreviewImageSize(null)
      setShowPreviewModal(true)
      void loadPreviewDetails(map.id)
    },
    [loadPreviewDetails],
  )

  const closePreviewModal = useCallback(() => {
    setShowPreviewModal(false)
    setPreviewDetails(null)
    setPreviewError(null)
    setPreviewImageSize(null)
  }, [])

  const handleStatusChange = async (mapId: string, newStatus: string, notes?: string) => {
    try {
      await api.patch(`/admin/maps/${mapId}/status`, {
        status: newStatus,
        notes: notes,
      })
      await loadMaps()
      const updateMapState = (map: Map | null): Map | null => {
        if (!map || map.id !== mapId) return map
        const updatedMap: Map = {
          ...map,
          status: newStatus as Map['status'],
        }
        if (newStatus === 'rejected') {
          updatedMap.rejectionReason = notes
        } else if (newStatus === 'approved') {
          updatedMap.rejectionReason = undefined
        }
        return updatedMap
      }
      setPreviewMap((prev) => updateMapState(prev))
      setSelectedMap((prev) => updateMapState(prev))
      setShowApprovalModal(false)
      setApprovalNotes('')
      toast.success(`Map ${newStatus === 'approved' ? 'approved' : 'rejected'} successfully`)
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to update status')
      toast.error(`Failed to update status: ${message}`)
    }
  }

  const handleEditMap = async () => {
    if (!selectedMap) return
    try {
      await api.patch(`/admin/maps/${selectedMap.id}`, editForm)
      await loadMaps()
      setShowEditModal(false)
      setPreviewMap((prev) => {
        if (!prev || prev.id !== selectedMap.id) return prev
        return {
          ...prev,
          ...editForm,
        }
      })
      setSelectedMap((prev) => {
        if (!prev || prev.id !== selectedMap.id) return prev
        return {
          ...prev,
          ...editForm,
        }
      })
      toast.success('Map updated successfully')
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to update map')
      toast.error(`Failed to update map: ${message}`)
    }
  }

  const handleDeleteMap = async () => {
    if (!selectedMap) return
    try {
      const isPreviewing = previewMap?.id === selectedMap.id
      await api.delete(`/admin/maps/${selectedMap.id}`)
      await loadMaps()
      setShowDeleteModal(false)
      if (isPreviewing) {
        setShowPreviewModal(false)
        setPreviewMap(null)
      }
      setSelectedMap(null)
      toast.success('Map deleted successfully')
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to delete map')
      toast.error(`Failed to delete map: ${message}`)
    }
  }

  const handleCloneMap = async (mapId: string) => {
    try {
      const response = await api.post(`/admin/maps/${mapId}/clone`)
      await loadMaps()
      toast.success(`Map cloned successfully. New map: ${response.data.name}`)
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to clone map')
      toast.error(`Failed to clone map: ${message}`)
    }
  }

  const handleToggleFeatured = async (map: Map, shouldFeature: boolean) => {
    try {
      await api.patch(`/admin/maps/${map.id}`, {
        isFeatured: shouldFeature,
      })
      await loadMaps()
      setPreviewMap((prev) =>
        prev && prev.id === map.id ? { ...prev, isFeatured: shouldFeature } : prev,
      )
      setSelectedMap((prev) =>
        prev && prev.id === map.id ? { ...prev, isFeatured: shouldFeature } : prev,
      )
      toast.success(`Map ${shouldFeature ? 'featured' : 'unfeatured'} successfully`)
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to update featured status')
      toast.error(`Failed to update featured status: ${message}`)
    }
  }

  const openEditModal = (map: Map) => {
    setSelectedMap(map)
    setEditForm({
      name: map.name,
      description: map.description || '',
      minPlayers: map.minPlayers,
      maxPlayers: map.maxPlayers,
      tags: map.tags,
      status: map.status || 'draft',
      isFeatured: map.isFeatured,
      isPublic: map.isPublic,
      isVipOnly: map.isVipOnly || false,
    })
    setShowEditModal(true)
  }

  const openApprovalModal = (map: Map) => {
    setSelectedMap(map)
    setShowApprovalModal(true)
  }

  const effectiveImageWidth =
    previewDetails?.imageWidth ??
    previewMap?.imageWidth ??
    previewMap?.image_width ??
    previewImageSize?.width ??
    0

  const effectiveImageHeight =
    previewDetails?.imageHeight ??
    previewMap?.imageHeight ??
    previewMap?.image_height ??
    previewImageSize?.height ??
    0

  const effectiveCanvasWidth = previewDetails?.canvasWidth ?? effectiveImageWidth
  const effectiveCanvasHeight = previewDetails?.canvasHeight ?? effectiveImageHeight

  const previewTokens = useMemo(() => {
    if (!previewDetails || effectiveCanvasWidth <= 0 || effectiveCanvasHeight <= 0) {
      return [] as Array<{
        id: string
        name: string
        left: number
        top: number
        isCapital: boolean
        continent: string | null | undefined
      }>
    }

    return previewDetails.territories
      .map((territory) => {
        const position = getNormalizedTokenPosition(
          territory,
          effectiveCanvasWidth,
          effectiveCanvasHeight,
        )
        if (!position) return null

        const left = position.x * 100
        const top = position.y * 100

        if (!Number.isFinite(left) || !Number.isFinite(top)) {
          return null
        }

        return {
          id: territory.id,
          name: territory.name ?? 'Unnamed territory',
          left,
          top,
          isCapital: isCapitalTerritory(territory),
          continent: territory.continent ?? null,
        }
      })
      .filter(
        (
          token,
        ): token is {
          id: string
          name: string
          left: number
          top: number
          isCapital: boolean
          continent: string | null | undefined
        } => token !== null,
      )
  }, [previewDetails, effectiveCanvasWidth, effectiveCanvasHeight])

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: 'bg-gray-100 text-gray-800',
      pending_review: 'bg-yellow-100 text-yellow-800 ring-2 ring-yellow-400',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      archived: 'bg-gray-100 text-gray-600',
    }
    return badges[status as keyof typeof badges] || badges.draft
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted">Loading maps...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-1 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <AdminPageHeader
          title="Map Management"
          subtitle="Review drafts, publish updates, and keep the catalog healthy"
          icon="🗺️"
        />

        {/* Status Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-box p-4">
          <p className="text-sm text-muted uppercase tracking-wide">Draft</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {maps.filter((m) => m.status === 'draft').length}
          </p>
        </div>
        <div className="glass-box p-4 border border-orange-500/30">
          <p className="text-sm text-orange-400 uppercase tracking-wide">Pending Review</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {maps.filter((m) => m.status === 'pending_review').length}
          </p>
        </div>
        <div className="glass-box p-4 border border-green-500/30">
          <p className="text-sm text-green-400 uppercase tracking-wide">Approved</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {maps.filter((m) => m.status === 'approved').length}
          </p>
        </div>
        <div className="glass-box p-4 border border-red-500/30">
          <p className="text-sm text-red-400 uppercase tracking-wide">Rejected</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {maps.filter((m) => m.status === 'rejected').length}
          </p>
        </div>
        <div className="glass-box p-4 border border-gray-500/30">
          <p className="text-sm text-gray-400 uppercase tracking-wide">Archived</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {maps.filter((m) => m.status === 'archived').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-box p-4">
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search maps..."
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="px-4 py-2 bg-surface-1 border border-border rounded-lg text-white flex-1 min-w-[200px]"
          />

          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 bg-surface-1 border border-border rounded-lg text-white"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>

          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
            className="px-4 py-2 bg-surface-1 border border-border rounded-lg text-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name A-Z</option>
            <option value="playCount">Most Played</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <h3 className="text-red-400 font-medium">Error Loading Maps</h3>
          <p className="text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Maps Table */}
      <div className="glass-box overflow-hidden p-0">
        {maps.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-lg font-medium text-white mb-2">No Maps Found</h3>
            <p className="text-muted">No maps match your current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-1">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider min-w-[18rem]">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Creator
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Players
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Territories
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Continents
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Games Played
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Rating
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Access
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Manage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {maps.map((map) => {
                  const imageSrc = map.imageUrl || map.image_url

                  return (
                    <tr
                      key={map.id}
                      className={`transition-colors hover:bg-surface-1 ${
                        map.status === 'pending_review' ? 'bg-yellow-900/10' : ''
                      }`}
                    >
                      <td className="px-6 py-4 align-top min-w-[18rem]">
                        <div className="flex items-start gap-3">
                          {imageSrc ? (
                            <div className="relative shrink-0">
                              <img
                                src={imageSrc}
                                alt={map.name}
                                className="h-12 w-12 rounded object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded bg-surface-1 text-[10px] uppercase tracking-wide text-muted">
                              No image
                            </div>
                          )}
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-white">{map.name}</span>
                              {map.isFeatured && (
                                <span className="rounded bg-yellow-600/20 px-2 py-0.5 text-[11px] font-medium uppercase text-yellow-300">
                                  Featured
                                </span>
                              )}
                              {!map.isPublic && (
                                <span className="rounded bg-gray-600/20 px-2 py-0.5 text-[11px] font-medium uppercase text-gray-300">
                                  Private
                                </span>
                              )}
                              {map.isVipOnly && (
                                <span className="rounded bg-purple-600/20 px-2 py-0.5 text-[11px] font-medium uppercase text-purple-300">
                                  VIP
                                </span>
                              )}
                            </div>
                            {map.description && (
                              <p className="max-w-xs text-xs text-muted">{map.description}</p>
                            )}
                            {Array.isArray(map.tags) && map.tags.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {map.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded bg-surface-1 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadge(map.status)}`}
                        >
                          {statusLabels[map.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white">{map.creatorName || 'Unknown'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-muted">
                          {map.minPlayers}-{map.maxPlayers}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-muted">
                          {typeof map.territoryCount === 'number' ? map.territoryCount : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-muted">
                          {typeof map.continentCount === 'number' ? map.continentCount : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-muted">
                          {(map.playCount ?? 0).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-muted">
                          {map.ratingCount > 0
                            ? `${map.ratingAverage.toFixed(1)} (${map.ratingCount})`
                            : 'No ratings'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col text-sm text-muted">
                          <span className="text-white">{map.isPublic ? 'Public' : 'Private'}</span>
                          {map.isVipOnly && <span>VIP Only</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-muted">
                          {new Date(map.updatedAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handlePreviewMap(map)
                            }}
                            className="rounded bg-violet px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110"
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedMap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Edit Map Details</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1" htmlFor={mapNameId}>
                  Name
                </label>
                <input
                  id={mapNameId}
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-muted mb-1" htmlFor={mapStatusId}>
                  Status
                </label>
                <select
                  id={mapStatusId}
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value as Map['status'] })
                  }
                  className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                >
                  <option value="draft">Draft</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-muted mb-1" htmlFor={mapDescriptionId}>
                  Description
                </label>
                <textarea
                  id={mapDescriptionId}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white h-20"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1" htmlFor={mapMinPlayersId}>
                    Min Players
                  </label>
                  <input
                    id={mapMinPlayersId}
                    type="number"
                    min="2"
                    max="12"
                    value={editForm.minPlayers}
                    onChange={(e) =>
                      setEditForm({ ...editForm, minPlayers: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-muted mb-1" htmlFor={mapMaxPlayersId}>
                    Max Players
                  </label>
                  <input
                    id={mapMaxPlayersId}
                    type="number"
                    min="2"
                    max="12"
                    value={editForm.maxPlayers}
                    onChange={(e) =>
                      setEditForm({ ...editForm, maxPlayers: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex gap-4">
                  <label className="flex items-center" htmlFor={mapFeaturedId}>
                    <input
                      id={mapFeaturedId}
                      type="checkbox"
                      checked={editForm.isFeatured}
                      onChange={(e) => setEditForm({ ...editForm, isFeatured: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-white">Featured</span>
                  </label>
                  <label className="flex items-center" htmlFor={mapPublicId}>
                    <input
                      id={mapPublicId}
                      type="checkbox"
                      checked={editForm.isPublic}
                      onChange={(e) => setEditForm({ ...editForm, isPublic: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-white">Public</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center" htmlFor={mapVipOnlyId}>
                    <input
                      id={mapVipOnlyId}
                      type="checkbox"
                      checked={editForm.isVipOnly || false}
                      onChange={(e) => setEditForm({ ...editForm, isVipOnly: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-white">VIP Only</span>
                    <span className="text-xs text-purple-400 ml-2">
                      (Requires VIP status to play)
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditMap}
                className="px-4 py-2 bg-violet text-white rounded hover:brightness-110"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedMap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Delete Map</h2>
            <p className="text-muted mb-4">
              Are you sure you want to delete "{selectedMap.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMap}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showApprovalModal && selectedMap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-2 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Reject Map</h2>
            <p className="text-muted mb-4">Provide a reason for rejecting "{selectedMap.name}":</p>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-white h-32"
              placeholder="Enter rejection reason..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowApprovalModal(false)
                  setApprovalNotes('')
                }}
                className="px-4 py-2 bg-surface-1 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange(selectedMap.id, 'rejected', approvalNotes)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Reject Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Preview Modal */}
      {showPreviewModal && previewMap && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview map ${previewMap.name}`}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          tabIndex={-1}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePreviewModal()
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              closePreviewModal()
            }
          }}
        >
          <div
            role="document"
            className="bg-surface-2 rounded-lg p-6 w-full max-w-[90vw] mx-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
              <div className="space-y-3">
                <h2 className="text-3xl font-bold text-white">{previewMap.name}</h2>
                {previewMap.description && (
                  <p className="text-sm text-muted md:max-w-3xl">{previewMap.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {previewMap.isFeatured && (
                    <span className="rounded bg-yellow-600/20 px-2 py-0.5 text-xs font-medium uppercase text-yellow-300">
                      Featured
                    </span>
                  )}
                  {!previewMap.isPublic && (
                    <span className="rounded bg-gray-600/20 px-2 py-0.5 text-xs font-medium uppercase text-gray-300">
                      Private
                    </span>
                  )}
                  {previewMap.isVipOnly && (
                    <span className="rounded bg-purple-600/20 px-2 py-0.5 text-xs font-medium uppercase text-purple-300">
                      VIP Only
                    </span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${getStatusBadge(previewMap.status)}`}
                  >
                    {statusLabels[previewMap.status]}
                  </span>
                </div>
                {previewMap.tags && previewMap.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {previewMap.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-surface-1 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closePreviewModal}
                className="self-start rounded bg-surface-1 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-600"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Created By</p>
                <p className="mt-1 text-sm text-white">{previewMap.creatorName || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Players</p>
                <p className="mt-1 text-sm text-white">
                  {previewMap.minPlayers}-{previewMap.maxPlayers}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Territories</p>
                <p className="mt-1 text-sm text-white">
                  {typeof previewMap.territoryCount === 'number'
                    ? previewMap.territoryCount
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Continents</p>
                <p className="mt-1 text-sm text-white">
                  {typeof previewMap.continentCount === 'number'
                    ? previewMap.continentCount
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Games Played</p>
                <p className="mt-1 text-sm text-white">
                  {(previewMap.playCount ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Rating</p>
                <p className="mt-1 text-sm text-white">
                  {previewMap.ratingCount > 0
                    ? `${previewMap.ratingAverage.toFixed(1)} (${previewMap.ratingCount})`
                    : 'No ratings'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Visibility</p>
                <p className="mt-1 text-sm text-white">
                  {previewMap.isPublic ? 'Public' : 'Private'}
                </p>
                {previewMap.isVipOnly && <p className="text-xs text-muted">VIP Only</p>}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Created</p>
                <p className="mt-1 text-sm text-white">
                  {new Date(previewMap.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Last Updated</p>
                <p className="mt-1 text-sm text-white">
                  {new Date(previewMap.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>

            {previewMap.rejectionReason && previewMap.status === 'rejected' && (
              <div className="mb-6 rounded border border-red-500/40 bg-red-900/20 p-4">
                <p className="text-sm text-red-200">
                  Rejection notes: {previewMap.rejectionReason}
                </p>
              </div>
            )}

            {/* Map Image Preview */}
            {previewImageSrc ? (
              <div className="bg-surface-1 rounded-lg p-4 mb-6">
                <div className="relative overflow-auto rounded bg-black/20">
                  <div
                    className="relative"
                    style={{
                      width: effectiveCanvasWidth > 0 ? `${effectiveCanvasWidth}px` : '100%',
                      height: effectiveCanvasHeight > 0 ? `${effectiveCanvasHeight}px` : 'auto',
                    }}
                  >
                    <img
                      src={previewImageSrc}
                      alt={previewMap.name}
                      className="w-full h-full object-fill rounded"
                      onLoad={(event) => {
                        const target = event.currentTarget
                        if (target.naturalWidth > 0 && target.naturalHeight > 0) {
                          setPreviewImageSize({
                            width: target.naturalWidth,
                            height: target.naturalHeight,
                          })
                        }
                      }}
                      onError={(event) => {
                        const target = event.currentTarget
                        target.src =
                          'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzk5OSI+TWFwIEltYWdlIE5vdCBBdmFpbGFibGU8L3RleHQ+PC9zdmc+'
                      }}
                    />

                    {previewTokens.length > 0 && (
                      <div className="pointer-events-none absolute inset-0">
                        {previewTokens.map((token) => {
                          const clampedLeft = Math.min(Math.max(token.left, 0), 100)
                          const clampedTop = Math.min(Math.max(token.top, 0), 100)
                          return (
                            <div
                              key={token.id}
                              className="absolute flex flex-col items-center gap-1 text-xs"
                              style={{
                                left: `${clampedLeft}%`,
                                top: `${clampedTop}%`,
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              <div
                                className={`w-4 h-4 rounded-full border-2 border-black/60 shadow-md ${
                                  token.isCapital ? 'bg-rose-400' : 'bg-cyan-400'
                                }`}
                              />
                              <span className="pointer-events-auto px-1.5 py-0.5 rounded bg-black/70 text-white whitespace-nowrap">
                                {token.name}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {previewLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="text-white text-sm">Loading map data…</span>
                      </div>
                    )}

                    {previewError && !previewLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-4 text-center">
                        <span className="text-red-300 text-sm">{previewError}</span>
                      </div>
                    )}
                  </div>
                </div>

                {typeof previewImageWidth === 'number' &&
                  typeof previewImageHeight === 'number' && (
                    <p className="mt-3 text-xs text-muted">
                      Image size: {previewImageWidth} x {previewImageHeight} px
                    </p>
                  )}

                {effectiveCanvasWidth > 0 && effectiveCanvasHeight > 0 && (
                  <p className="text-xs text-muted">
                    Canvas size: {Math.round(effectiveCanvasWidth)} x{' '}
                    {Math.round(effectiveCanvasHeight)} px
                  </p>
                )}

                {!previewError && !previewLoading && previewTokens.length === 0 && (
                  <p className="text-muted text-sm mt-3">No token positions found for this map.</p>
                )}

                {previewError && !previewLoading && (
                  <p className="text-red-300 text-sm mt-3">{previewError}</p>
                )}
              </div>
            ) : (
              <div className="mb-6 rounded-lg border border-border bg-surface-1 p-12 text-center">
                <p className="text-sm text-muted">No preview image available</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.open(`/map-editor-tokens?edit=${previewMap.id}`, '_blank')}
                  className="rounded bg-violet px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
                >
                  Open Map Editor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closePreviewModal()
                    openEditModal(previewMap)
                  }}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Edit Details
                </button>
                <button
                  type="button"
                  onClick={() => handleCloneMap(previewMap.id)}
                  className="rounded border border-border px-4 py-2 text-sm font-medium text-white transition hover:bg-surface-1"
                >
                  Clone Map
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFeatured(previewMap, !previewMap.isFeatured)}
                  className={`rounded px-4 py-2 text-sm font-medium transition ${
                    previewMap.isFeatured
                      ? 'border border-yellow-400 text-yellow-300 hover:bg-yellow-500/10'
                      : 'bg-yellow-500 text-black hover:bg-yellow-400'
                  }`}
                >
                  {previewMap.isFeatured ? 'Remove Feature' : 'Feature Map'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMap(previewMap)
                    setShowDeleteModal(true)
                    closePreviewModal()
                  }}
                  className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  Delete Map
                </button>
                {previewMap.status === 'pending_review' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(previewMap.id, 'approved')}
                      className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
                    >
                      Approve Map
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closePreviewModal()
                        openApprovalModal(previewMap)
                      }}
                      className="rounded border border-red-500 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-900/30"
                    >
                      Reject Map
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closePreviewModal}
                  className="rounded bg-surface-1 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-600"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default AdminMaps
