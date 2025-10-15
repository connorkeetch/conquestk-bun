import { isAxiosError } from 'axios'
import type React from 'react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { AdminPageHeader } from '../components/admin/AdminPageHeader'
import TerritoryToken from '../components/TerritoryToken'
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
  sectorCount?: number
  // Backward compat
  continentCount?: number
}

interface RawTerritoryRecord {
  id: string
  name?: string
  sector?: string | null
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

const computeMapSizeFromCounts = (
  territoryCount?: number,
): 'Small' | 'Medium' | 'Large' | 'Very Large' | 'Massive' | 'N/A' => {
  const count = typeof territoryCount === 'number' ? territoryCount : NaN
  if (!Number.isFinite(count) || count <= 0) return 'N/A'
  if (count <= 35) return 'Small'
  if (count <= 45) return 'Medium'
  if (count <= 65) return 'Large'
  if (count <= 90) return 'Very Large'
  return 'Massive'
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
  // Removed unused min/max player input IDs
  const mapFeaturedId = useId()
  const mapPublicId = useId()
  const mapVipOnlyId = useId()

  // Cache of per-map connection stats for list view
  const [connectionStats, setConnectionStats] = useState<
    Record<string, { total: number; average: number }>
  >({})

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
      // After base list loads, fetch connection stats lazily
      const list: Map[] = response.data.maps || []
      void (async () => {
        const updates: Record<string, { total: number; average: number }> = {}
        await Promise.all(
          list.map(async (m: Map) => {
            try {
              const details = await api.get(`/admin/maps/${m.id}`)
              const adj = Array.isArray(details.data.adjacencies)
                ? (details.data.adjacencies as Array<{ from?: string; to?: string }>)
                : []
              const uniq = new Set<string>()
              adj.forEach((a) => {
                const from = a.from
                const to = a.to
                if (!from || !to) return
                const key = from < to ? `${from}__${to}` : `${to}__${from}`
                uniq.add(key)
              })
              const total = uniq.size
              const n =
                typeof m.territoryCount === 'number' && m.territoryCount > 0
                  ? m.territoryCount
                  : details.data.territories?.length || 0
              const average = n > 0 ? (total * 2) / n : 0
              updates[m.id] = { total, average }
            } catch {
              // ignore per-map errors; leave blank
            }
          }),
        )
        setConnectionStats((prev) => ({ ...prev, ...updates }))
      })()
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
        const mapped = metadataTerritories
          .map((entry) => {
            const record = parseJsonObject(entry)
            if (!record) return null

            const idValue = record.id
            const nameValue = record.name
            const xValue = record.x
            const yValue = record.y
            const groups = record as {
              sectorId?: string
              continentId?: string
              sector?: string
              continent?: string
            }
            const sectorValue =
              groups.sectorId ?? groups.continentId ?? groups.sector ?? groups.continent

            if (typeof idValue !== 'string') {
              return null
            }

            return {
              id: idValue,
              name: typeof nameValue === 'string' ? nameValue : undefined,
              x: typeof xValue === 'number' ? xValue : undefined,
              y: typeof yValue === 'number' ? yValue : undefined,
              sector: typeof sectorValue === 'string' ? sectorValue : null,
              polygon_data: record,
            }
          })
          .filter((item): item is NonNullable<typeof item> => item !== null) as RawTerritoryRecord[]

        territories = mapped
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
        ...(typeof resolvedImageWidth === 'number' ? { imageWidth: resolvedImageWidth } : {}),
        ...(typeof resolvedImageHeight === 'number' ? { imageHeight: resolvedImageHeight } : {}),
        ...(typeof metadataWidth === 'number' ? { canvasWidth: metadataWidth } : {}),
        ...(typeof metadataHeight === 'number' ? { canvasHeight: metadataHeight } : {}),
      })

      setPreviewMap((current) => {
        if (!current || current.id !== mapId) {
          return current
        }

        const maybeW =
          typeof resolvedImageWidth === 'number' ? resolvedImageWidth : current.imageWidth
        const maybeH =
          typeof resolvedImageHeight === 'number' ? resolvedImageHeight : current.imageHeight

        return {
          ...current,
          ...(typeof maybeW === 'number' ? { imageWidth: maybeW } : {}),
          ...(typeof maybeH === 'number' ? { imageHeight: maybeH } : {}),
          ...(typeof data.image_width === 'number' ? { image_width: data.image_width } : {}),
          ...(typeof data.image_height === 'number' ? { image_height: data.image_height } : {}),
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
        ...(notes ? { notes } : {}),
      })
      await loadMaps()
      const updateMapState = (map: Map | null): Map | null => {
        if (!map || map.id !== mapId) return map
        const updatedMap: Map = {
          ...map,
          status: newStatus as Map['status'],
        }
        if (newStatus === 'rejected') {
          return { ...updatedMap, ...(notes ? { rejectionReason: notes } : {}) }
        }
        if (newStatus === 'approved') {
          const { rejectionReason: _ignore, ...rest } = updatedMap
          return rest as Map
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
        sector: string | null | undefined
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
          sector:
            (territory as unknown as { sector?: string }).sector ??
            (territory as unknown as { continent?: string }).continent ??
            null,
        }
      })
      .filter((token): token is NonNullable<typeof token> => token !== null)
  }, [previewDetails, effectiveCanvasWidth, effectiveCanvasHeight])

  // Compute adjacency lines and stats for preview
  const previewConnections = useMemo(() => {
    if (!previewDetails || previewDetails.adjacencies.length === 0) {
      return {
        lines: [] as Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>,
        total: 0,
        average: 0,
      }
    }

    const posById = new Map<string, { x: number; y: number }>()
    for (const t of previewTokens) {
      posById.set(t.id, { x: t.left, y: t.top })
    }

    const seen = new Set<string>()
    const degree = new Map<string, number>()
    const lines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = []

    for (const adj of previewDetails.adjacencies) {
      const from = adj.from || adj.territory_from
      const to = adj.to || adj.territory_to
      if (!from || !to) continue

      // Treat as undirected for stats and visuals
      const a = String(from)
      const b = String(to)
      const key = a < b ? `${a}__${b}` : `${b}__${a}`
      if (seen.has(key)) continue
      seen.add(key)

      const p1 = posById.get(a)
      const p2 = posById.get(b)
      if (!p1 || !p2) continue

      lines.push({ id: key, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })

      degree.set(a, (degree.get(a) ?? 0) + 1)
      degree.set(b, (degree.get(b) ?? 0) + 1)
    }

    const n = previewTokens.length
    const total = lines.length
    const avg = n > 0 ? [...degree.values()].reduce((s, v) => s + v, 0) / n : 0

    return { lines, total, average: avg }
  }, [previewDetails, previewTokens])

  const getStatusBadge = (status: string) => {
    const base = 'badge'
    switch (status) {
      case 'pending_review':
        return `${base} border-[color:var(--color-warning)] text-[color:var(--color-warning)] bg-[color:color-mix(in srgb, var(--color-warning) 15%, transparent)]`
      case 'approved':
        return `${base} border-[color:var(--color-success)] text-[color:var(--color-success)] bg-[color:color-mix(in srgb, var(--color-success) 15%, transparent)]`
      case 'rejected':
        return `${base} border-[color:var(--color-danger)] text-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)]`
      case 'archived':
        return `${base} border-[color:var(--panel-border)] text-muted bg-[color:var(--panel-bg-alt)]`
      default:
        return `${base} border-[color:var(--panel-border)] text-muted bg-[color:var(--panel-bg-alt)]`
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="panel space-y-3 text-center">
          <div className="flex justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-[color:var(--panel-border)] border-t-[color:var(--color-primary)]"></div>
          </div>
          <p className="text-sm text-muted">Loading maps...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <AdminPageHeader
          title="Map Management"
          subtitle="Review drafts, publish updates, and keep the catalog healthy"
          icon="🗺️"
        />

        {/* Status Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="panel">
            <p className="text-sm uppercase tracking-wide text-muted">Draft</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--heading)]">
              {maps.filter((m) => m.status === 'draft').length}
            </p>
          </div>
          <div className="panel border-[color:var(--color-warning)] bg-[color:color-mix(in srgb, var(--color-warning) 12%, transparent)]">
            <p className="text-sm uppercase tracking-wide text-[color:var(--color-warning)]">
              Pending Review
            </p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--heading)]">
              {maps.filter((m) => m.status === 'pending_review').length}
            </p>
          </div>
          <div className="panel border-[color:var(--color-success)] bg-[color:color-mix(in srgb, var(--color-success) 12%, transparent)]">
            <p className="text-sm uppercase tracking-wide text-[color:var(--color-success)]">
              Approved
            </p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--heading)]">
              {maps.filter((m) => m.status === 'approved').length}
            </p>
          </div>
          <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)]">
            <p className="text-sm uppercase tracking-wide text-[color:var(--color-danger)]">
              Rejected
            </p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--heading)]">
              {maps.filter((m) => m.status === 'rejected').length}
            </p>
          </div>
          <div className="panel">
            <p className="text-sm uppercase tracking-wide text-muted">Archived</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--heading)]">
              {maps.filter((m) => m.status === 'archived').length}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="panel">
          <div className="flex flex-wrap gap-4">
            <input
              type="text"
              placeholder="Search maps..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="form-input flex-1 min-w-[200px]"
            />

            <select
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="form-select"
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
              className="form-select"
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
          <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)]">
            <h3 className="text-sm font-semibold text-[color:var(--color-danger)]">
              Error Loading Maps
            </h3>
            <p className="mt-1 text-sm text-[color:var(--color-danger)]">{error}</p>
          </div>
        )}

        {/* Maps Table */}
        <div className="panel p-0">
          {maps.length === 0 ? (
            <div className="py-12 text-center">
              <h3 className="mb-2 text-lg font-semibold text-[color:var(--heading)]">
                No Maps Found
              </h3>
              <p className="text-sm text-muted">No maps match your current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted min-w-[18rem]">
                      Name
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Status
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Creator
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Players
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Territories
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Sectors
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Connections
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Games Played
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Rating
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Access
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Updated
                    </th>
                    <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Manage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {maps.map((map) => {
                    const imageSrc = map.imageUrl || map.image_url

                    return (
                      <tr
                        key={map.id}
                        className={`table-row hover:bg-[color:var(--hover-bg)] ${
                          map.status === 'pending_review'
                            ? 'bg-[color:color-mix(in srgb, var(--color-warning) 12%, transparent)]'
                            : ''
                        }`}
                      >
                        <td className="align-top min-w-[18rem]">
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
                              <div className="flex h-12 w-12 items-center justify-center rounded border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-alt)] text-[10px] uppercase tracking-wide text-muted">
                                No image
                              </div>
                            )}
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-[color:var(--heading)]">
                                  {map.name}
                                </span>
                                {map.isFeatured && (
                                  <span className="badge border-[color:var(--color-warning)] text-[color:var(--color-warning)]">
                                    Featured
                                  </span>
                                )}
                                {!map.isPublic && (
                                  <span className="badge border-[color:var(--color-accent)] text-[color:var(--color-accent)]">
                                    Private
                                  </span>
                                )}
                                {map.isVipOnly && (
                                  <span className="badge border-[color:var(--color-primary)] text-[color:var(--color-primary)]">
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
                                    <span key={tag} className="chip text-xs">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={getStatusBadge(map.status)}>
                            {statusLabels[map.status]}
                          </span>
                        </td>
                        <td>
                          <div className="text-sm text-[color:var(--heading)]">
                            {map.creatorName || 'Unknown'}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm text-muted">
                            {computeMapSizeFromCounts(map.territoryCount)}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm text-muted">
                            {typeof map.territoryCount === 'number' ? map.territoryCount : 'N/A'}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm text-muted">
                            {typeof map.sectorCount === 'number'
                              ? map.sectorCount
                              : typeof map.continentCount === 'number'
                                ? map.continentCount
                                : 'N/A'}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm text-muted">
                            {connectionStats[map.id]
                              ? `${connectionStats[map.id].total} / ${connectionStats[
                                  map.id
                                ].average.toFixed(1)}`
                              : '—'}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm text-muted">
                            {(map.playCount ?? 0).toLocaleString()}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm text-muted">
                            {map.ratingCount > 0
                              ? `${map.ratingAverage.toFixed(1)} (${map.ratingCount})`
                              : 'No ratings'}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col text-sm text-muted">
                            <span className="text-[color:var(--heading)]">
                              {map.isPublic ? 'Public' : 'Private'}
                            </span>
                            {map.isVipOnly && <span>VIP Only</span>}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm text-muted">
                            {new Date(map.updatedAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handlePreviewMap(map)
                              }}
                              className="btn btn-primary btn-sm"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="modal w-full max-w-md">
              <div className="modal-header">
                <h2 className="text-lg font-semibold text-[color:var(--heading)]">
                  Edit Map Details
                </h2>
              </div>
              <div className="modal-body space-y-4">
                <div>
                  <label className="form-label" htmlFor={mapNameId}>
                    Name
                  </label>
                  <input
                    id={mapNameId}
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor={mapStatusId}>
                    Status
                  </label>
                  <select
                    id={mapStatusId}
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value as Map['status'] })
                    }
                    className="form-select"
                  >
                    <option value="draft">Draft</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" htmlFor={mapDescriptionId}>
                    Description
                  </label>
                  <textarea
                    id={mapDescriptionId}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="form-input h-24"
                  />
                </div>

                {/* Removed Min/Max players — map size governs gameplay; these were unused */}

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-4">
                    <label
                      className="flex items-center gap-2 text-sm text-[color:var(--text)]"
                      htmlFor={mapFeaturedId}
                    >
                      <input
                        id={mapFeaturedId}
                        type="checkbox"
                        checked={editForm.isFeatured}
                        onChange={(e) => setEditForm({ ...editForm, isFeatured: e.target.checked })}
                      />
                      <span>Featured</span>
                    </label>
                    <label
                      className="flex items-center gap-2 text-sm text-[color:var(--text)]"
                      htmlFor={mapPublicId}
                    >
                      <input
                        id={mapPublicId}
                        type="checkbox"
                        checked={editForm.isPublic}
                        onChange={(e) => setEditForm({ ...editForm, isPublic: e.target.checked })}
                      />
                      <span>Public</span>
                    </label>
                  </div>
                  <div>
                    <label
                      className="flex items-center gap-2 text-sm text-[color:var(--text)]"
                      htmlFor={mapVipOnlyId}
                    >
                      <input
                        id={mapVipOnlyId}
                        type="checkbox"
                        checked={editForm.isVipOnly || false}
                        onChange={(e) => setEditForm({ ...editForm, isVipOnly: e.target.checked })}
                      />
                      <span>VIP Only</span>
                      <span className="text-xs text-[color:var(--color-accent)]">
                        (Requires VIP status to play)
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleEditMap} className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedMap && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="modal w-full max-w-md">
              <div className="modal-header">
                <h2 className="text-lg font-semibold text-[color:var(--heading)]">Delete Map</h2>
              </div>
              <div className="modal-body">
                <p className="text-sm text-muted">
                  Are you sure you want to delete "{selectedMap.name}"? This action cannot be
                  undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleDeleteMap} className="btn btn-danger">
                  Delete Map
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rejection Modal */}
        {showApprovalModal && selectedMap && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="modal w-full max-w-md">
              <div className="modal-header">
                <h2 className="text-lg font-semibold text-[color:var(--heading)]">Reject Map</h2>
              </div>
              <div className="modal-body space-y-3">
                <p className="text-sm text-muted">
                  Provide a reason for rejecting "{selectedMap.name}":
                </p>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="form-input h-32"
                  placeholder="Enter rejection reason..."
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => {
                    setShowApprovalModal(false)
                    setApprovalNotes('')
                  }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedMap.id, 'rejected', approvalNotes)}
                  className="btn btn-danger"
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
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
              className="modal w-full max-w-[90vw] max-h-[90vh] overflow-y-auto p-6"
            >
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <h2 className="text-3xl font-bold text-[color:var(--heading)]">
                    {previewMap.name}
                  </h2>
                  {previewMap.description && (
                    <p className="text-sm text-muted md:max-w-3xl">{previewMap.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {previewMap.isFeatured && (
                      <span className="badge border-[color:var(--color-warning)] text-[color:var(--color-warning)]">
                        Featured
                      </span>
                    )}
                    {!previewMap.isPublic && (
                      <span className="badge border-[color:var(--color-accent)] text-[color:var(--color-accent)]">
                        Private
                      </span>
                    )}
                    {previewMap.isVipOnly && (
                      <span className="badge border-[color:var(--color-primary)] text-[color:var(--color-primary)]">
                        VIP Only
                      </span>
                    )}
                    <span className={getStatusBadge(previewMap.status)}>
                      {statusLabels[previewMap.status]}
                    </span>
                  </div>
                  {previewMap.tags && previewMap.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {previewMap.tags.map((tag) => (
                        <span key={tag} className="chip text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closePreviewModal}
                  className="btn btn-ghost self-start"
                >
                  Close
                </button>
              </div>

              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Created By</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {previewMap.creatorName || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Players</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {previewMap.minPlayers}-{previewMap.maxPlayers}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Territories</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {typeof previewMap.territoryCount === 'number'
                      ? previewMap.territoryCount
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Sectors</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {typeof (previewMap as unknown as { sectorCount?: number }).sectorCount ===
                    'number'
                      ? (previewMap as unknown as { sectorCount?: number }).sectorCount
                      : typeof previewMap.continentCount === 'number'
                        ? previewMap.continentCount
                        : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Games Played</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {(previewMap.playCount ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Rating</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {previewMap.ratingCount > 0
                      ? `${previewMap.ratingAverage.toFixed(1)} (${previewMap.ratingCount})`
                      : 'No ratings'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Visibility</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {previewMap.isPublic ? 'Public' : 'Private'}
                  </p>
                  {previewMap.isVipOnly && <p className="text-xs text-muted">VIP Only</p>}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Created</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {new Date(previewMap.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Last Updated</p>
                  <p className="mt-1 text-sm text-[color:var(--heading)]">
                    {new Date(previewMap.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {previewMap.rejectionReason && previewMap.status === 'rejected' && (
                <div className="panel mb-6 border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)]">
                  <p className="text-sm text-[color:var(--color-danger)]">
                    Rejection notes: {previewMap.rejectionReason}
                  </p>
                </div>
              )}

              {/* Map Image Preview */}
              {previewImageSrc ? (
                <div className="panel mb-6">
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

                      {/* Visualize connections behind tokens */}
                      {previewConnections.lines.length > 0 && (
                        <svg
                          className="absolute inset-0 pointer-events-none"
                          width="100%"
                          height="100%"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          {previewConnections.lines.map((line) => (
                            <line
                              key={line.id}
                              x1={`${line.x1}%`}
                              y1={`${line.y1}%`}
                              x2={`${line.x2}%`}
                              y2={`${line.y2}%`}
                              stroke="rgba(255,255,255,0.5)"
                              strokeWidth="2"
                              strokeDasharray="4 3"
                            />
                          ))}
                        </svg>
                      )}

                      {previewTokens.length > 0 && (
                        <div className="pointer-events-none absolute inset-0">
                          {previewTokens.map((token) => {
                            const clampedLeft = Math.min(Math.max(token.left, 0), 100)
                            const clampedTop = Math.min(Math.max(token.top, 0), 100)
                            const pxX = (clampedLeft / 100) * (effectiveCanvasWidth || 0)
                            const pxY = (clampedTop / 100) * (effectiveCanvasHeight || 0)
                            return (
                              <div key={token.id} className="absolute inset-0">
                                <TerritoryToken
                                  x={pxX}
                                  y={pxY}
                                  armies={0}
                                  showArmies={false}
                                  color="#6b7280"
                                  shape="circle"
                                  isSelected={false}
                                  isDragging={false}
                                  size={16}
                                  opacity={0.7}
                                />
                                {/* Territory name below the token without affecting centering */}
                                <span
                                  className="absolute whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-[color:var(--color-white)]"
                                  style={{
                                    left: `${clampedLeft}%`,
                                    top: `calc(${clampedTop}% + 12px)`,
                                    transform: 'translate(-50%, 0)',
                                  }}
                                >
                                  {token.name}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {previewLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <span className="text-sm text-[color:var(--color-white)]">
                            Loading map data…
                          </span>
                        </div>
                      )}

                      {previewError && !previewLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-4 text-center">
                          <span className="text-sm text-[color:var(--color-danger)]">
                            {previewError}
                          </span>
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

                  {/* Connection stats */}
                  {previewConnections && (
                    <div className="mt-2 text-xs text-muted">
                      <div>Total connections: {previewConnections.total}</div>
                      <div>Average per territory: {previewConnections.average.toFixed(1)}</div>
                    </div>
                  )}

                  {!previewError && !previewLoading && previewTokens.length === 0 && (
                    <p className="text-muted text-sm mt-3">
                      No token positions found for this map.
                    </p>
                  )}

                  {previewError && !previewLoading && (
                    <p className="mt-3 text-sm text-[color:var(--color-danger)]">{previewError}</p>
                  )}
                </div>
              ) : (
                <div className="panel mb-6 text-center py-12">
                  <p className="text-sm text-muted">No preview image available</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--panel-border)] pt-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(`/map-editor?edit=${previewMap.id}`, '_blank')}
                    className="btn btn-primary btn-sm"
                  >
                    Open Map Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closePreviewModal()
                      openEditModal(previewMap)
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Edit Details
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCloneMap(previewMap.id)}
                    className="btn btn-outline btn-sm"
                  >
                    Clone Map
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFeatured(previewMap, !previewMap.isFeatured)}
                    className={`btn btn-sm ${
                      previewMap.isFeatured
                        ? 'btn-outline border-[color:var(--color-warning)] text-[color:var(--color-warning)]'
                        : 'btn-secondary'
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
                    className="btn btn-danger btn-sm"
                  >
                    Delete Map
                  </button>
                  {previewMap.status === 'pending_review' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(previewMap.id, 'approved')}
                        className="btn btn-success btn-sm"
                      >
                        Approve Map
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          closePreviewModal()
                          openApprovalModal(previewMap)
                        }}
                        className="btn btn-outline btn-sm text-[color:var(--color-danger)] border-[color:var(--color-danger)]"
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
                    className="btn btn-ghost btn-sm"
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
