import axios from 'axios'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'
import ImageCropperEnhanced from '../components/ImageCropperEnhanced'
import ImageProcessor from '../components/ImageProcessor'
import TerritoryToken from '../components/TerritoryToken'
import { PLAYER_COLORS } from '../constants/colors'
import api from '../services/api'
import mapWorkflowApi, {
  type DraftImagePayload,
  type MapDraftPayload,
  type MapDraftResponse,
} from '../services/mapWorkflowService'

interface Territory {
  id: string
  name: string
  x: number
  y: number
  continentId: string | null // Allow null for unassigned territories
  armies: number
  isCapital?: boolean
  connections: string[] // IDs of connected territories
}

interface Continent {
  id: string
  name: string
  color: string
  bonus: number
}

interface LabelSettings {
  showLabels: boolean
  preset: 'classic' | 'modern' | 'minimal' | 'highContrast' | 'custom'
  fontSize?: number // 10-24
  fontFamily?: string // 'Arial', 'Georgia', etc.
  textColor?: string // hex color
  showBackground?: boolean
  backgroundColor?: string // hex color
  backgroundOpacity?: number // 0-1
}

interface MapState {
  name: string
  description?: string
  minPlayers: number
  maxPlayers: number
  imageUrl?: string
  territories: Territory[]
  continents: Continent[]
  selectedTerritoryId: string | null
  draggedTerritoryId: string | null
  mapWidth: number
  mapHeight: number
  imageWidth: number // Actual image dimensions
  imageHeight: number
  imageScale: number // Scale factor for resizing image
  labelSettings?: LabelSettings // Label customization settings
}

type EditorMode = 'properties' | 'image' | 'territories' | 'continents' | 'connections' | 'capitals'
type TokenShape = 'hexagon' | 'square' | 'circle'

interface CapitalAssignments {
  [playerCount: string]: string[] // Territory IDs for each player count
}

interface CapitalMetadata {
  generatedAt?: string
  algorithm?: string
  manuallyAdjusted?: {
    [playerCount: string]: boolean
  }
}

interface ApiErrorResponse {
  error?: string
  message?: string
  errors?: Array<{ msg?: string; message?: string }>
}

interface ImportedTerritoryData {
  id: string
  name?: string
  x?: number
  y?: number
  armies?: number
  connections?: string[]
  continentId?: string | null
}

interface ImportedMapFile {
  name?: string
  imageUrl?: string
  width?: number
  height?: number
  territories: ImportedTerritoryData[]
  continents?: Continent[]
}

interface LegacyTerritoryRecord {
  id?: string
  name?: string
  center_x?: number
  center_y?: number
  continent?: string
}

interface LegacyAdjacencyRecord {
  territory_from?: string
  territory_to?: string
  fromTerritoryId?: string
  toTerritoryId?: string
  from_territory_id?: string
  to_territory_id?: string
  from?: string
  to?: string
}

interface MapApiResponse {
  id?: string
  name?: string
  description?: string
  territories?: LegacyTerritoryRecord[]
  metadata?: {
    territories?: Territory[]
    continents?: Continent[]
    adjacencies?: Array<{ from: string; to: string[] }>
    width?: number
    height?: number
  }
  continents?: Continent[]
  adjacencies?: LegacyAdjacencyRecord[]
  territory_connections?: Record<string, string[]>
  imageUrl?: string
  image_url?: string
  imageWidth?: number
  imageHeight?: number
  min_players?: number
  max_players?: number
  minPlayers?: number
  maxPlayers?: number
}

const isString = (value: unknown): value is string => typeof value === 'string'

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const normalizeTerritoryRecord = (record: LegacyTerritoryRecord): Territory => ({
  id: record.id || uuidv4(),
  name: record.name ?? 'Unnamed Territory',
  x: isNumber(record.center_x) ? record.center_x : 0,
  y: isNumber(record.center_y) ? record.center_y : 0,
  continentId: record.continent ?? null,
  armies: 1,
  connections: [] as string[],
})

const normalizeTerritory = (input: unknown): Territory | null => {
  if (typeof input !== 'object' || input === null) {
    return null
  }

  const territory = input as Record<string, unknown>
  const id = isString(territory.id) ? territory.id : uuidv4()
  const name = isString(territory.name) ? territory.name : 'Unnamed Territory'
  const x = isNumber(territory.x) ? territory.x : 0
  const y = isNumber(territory.y) ? territory.y : 0
  const continentId = isString(territory.continentId) ? territory.continentId : null
  const armies = isNumber(territory.armies) ? territory.armies : 1
  const isCapital = typeof territory.isCapital === 'boolean' ? territory.isCapital : false
  const connections = toStringArray(territory.connections)

  return {
    id,
    name,
    x,
    y,
    continentId,
    armies,
    isCapital,
    connections,
  }
}

const normalizeTerritories = (input: unknown): Territory[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => normalizeTerritory(item))
    .filter((item): item is Territory => item !== null)
}

const normalizeContinents = (input: unknown): Continent[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null
      }

      const continent = item as Record<string, unknown>
      const id = isString(continent.id) ? continent.id : uuidv4()
      const name = isString(continent.name) ? continent.name : 'Unnamed Continent'
      const color = isString(continent.color) ? continent.color : '#3B82F6'
      const bonus = isNumber(continent.bonus) ? continent.bonus : 0

      return {
        id,
        name,
        color,
        bonus,
      }
    })
    .filter((item): item is Continent => item !== null)
}

const extractMapId = (map: unknown): string | null => {
  if (typeof map !== 'object' || map === null) {
    return null
  }

  const record = map as Record<string, unknown>
  const id = record.id
  return isString(id) ? id : null
}

// LocalStorage key for auto-save
const AUTOSAVE_KEY = 'map-editor-draft'
const AUTOSAVE_INTERVAL = 10000 // Auto-save every 10 seconds

interface CanvasPreset {
  id: string
  label: string
  width: number
  height: number
  description?: string
  recommended?: boolean
}

const CANVAS_PRESETS: CanvasPreset[] = [
  {
    id: 'hd',
    label: 'HD 16:9',
    width: 1280,
    height: 720,
    description: 'Recommended for online matches',
    recommended: true,
  },
  {
    id: 'full-hd',
    label: 'Full HD 16:9',
    width: 1920,
    height: 1080,
    description: 'Highest detail for large displays',
  },
  {
    id: 'classic',
    label: 'Classic 4:3',
    width: 1024,
    height: 768,
    description: 'Balanced desktop and tablet layout',
  },
  {
    id: 'compact',
    label: 'Compact 3:2',
    width: 960,
    height: 640,
    description: 'Faster loading and lighter detail',
  },
  {
    id: 'square',
    label: 'Square 1:1',
    width: 1200,
    height: 1200,
    description: 'Experimental symmetrical layout',
  },
]

const CANVAS_LIMITS = {
  width: { min: 800, max: 3000 },
  height: { min: 600, max: 2000 },
}

const findCanvasPresetId = (width: number, height: number) =>
  CANVAS_PRESETS.find((preset) => preset.width === width && preset.height === height)?.id ?? null

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  showLabels: true,
  preset: 'classic',
  fontSize: 14,
  fontFamily: 'Arial',
  textColor: '#000000',
  showBackground: true,
  backgroundColor: '#ffffff',
  backgroundOpacity: 0.8,
}

const resolveLabelSettings = (settings?: LabelSettings): LabelSettings => ({
  showLabels: settings?.showLabels ?? DEFAULT_LABEL_SETTINGS.showLabels,
  preset: settings?.preset ?? DEFAULT_LABEL_SETTINGS.preset,
  fontSize: settings?.fontSize ?? DEFAULT_LABEL_SETTINGS.fontSize,
  fontFamily: settings?.fontFamily ?? DEFAULT_LABEL_SETTINGS.fontFamily,
  textColor: settings?.textColor ?? DEFAULT_LABEL_SETTINGS.textColor,
  showBackground: settings?.showBackground ?? DEFAULT_LABEL_SETTINGS.showBackground,
  backgroundColor: settings?.backgroundColor ?? DEFAULT_LABEL_SETTINGS.backgroundColor,
  backgroundOpacity: settings?.backgroundOpacity ?? DEFAULT_LABEL_SETTINGS.backgroundOpacity,
})

const reportError = (message: string, error: unknown) => {
  if (import.meta.env.DEV) {
    logger.error(message, error)
  }
}

const reportInfo = (message: string, details?: unknown) => {
  if (import.meta.env.DEV) {
    logger.info(message, details)
  }
}

export default function MapEditorTokens() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [searchParams] = useSearchParams()
  const [draftId, setDraftId] = useState<string | null>(null)
  const [publishedMapId, setPublishedMapId] = useState<string | null>(null)
  const [showDraftsList, setShowDraftsList] = useState(false)
  const [availableDrafts, setAvailableDrafts] = useState<MapDraftResponse[]>([])
  const [draftStatus, setDraftStatus] = useState<string>('editing')

  // Generate unique map name with timestamp
  const generateMapName = () => {
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return `Map ${timestamp}`
  }

  const [state, setState] = useState<MapState>({
    name: generateMapName(),
    description: '',
    minPlayers: 2,
    maxPlayers: 12,
    imageUrl: undefined,
    territories: [],
    continents: [],
    selectedTerritoryId: null,
    draggedTerritoryId: null,
    mapWidth: 1920, // Default to full HD
    mapHeight: 1080,
    imageWidth: 800, // Default image dimensions
    imageHeight: 600,
    imageScale: 1, // Default scale
    labelSettings: { ...DEFAULT_LABEL_SETTINGS },
  })

  const [showProcessor, setShowProcessor] = useState(false)
  const [showCropper, setShowCropper] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showLabelSettings, setShowLabelSettings] = useState(false)
  const [canvasSelection, setCanvasSelection] = useState<string>(
    () => findCanvasPresetId(state.mapWidth, state.mapHeight) ?? 'custom',
  )
  const [customCanvasSize, setCustomCanvasSize] = useState(() => ({
    width: state.mapWidth,
    height: state.mapHeight,
  }))

  const mapNameId = useId()
  const mapDescriptionId = useId()
  const minPlayersId = useId()
  const maxPlayersId = useId()
  const capitalPlayerCountId = useId()
  const stylePresetId = useId()
  const labelFontSizeId = useId()
  const labelTextColorId = useId()
  const labelBackgroundColorId = useId()
  const labelBackgroundOpacityId = useId()
  const labelFontFamilyId = useId()
  const tokenShapeId = useId()
  const tokenSizeId = useId()
  const customCanvasWidthId = useId()
  const customCanvasHeightId = useId()
  const imageScaleId = useId()
  const jsonImportId = useId()
  useEffect(() => {
    const presetId = findCanvasPresetId(state.mapWidth, state.mapHeight)
    setCanvasSelection(presetId ?? 'custom')
    setCustomCanvasSize((prev) =>
      prev.width === state.mapWidth && prev.height === state.mapHeight
        ? prev
        : { width: state.mapWidth, height: state.mapHeight },
    )
  }, [state.mapWidth, state.mapHeight])

  // Label preset definitions
  const LABEL_PRESETS = {
    classic: {
      fontSize: 14,
      fontFamily: 'Arial',
      textColor: '#000000',
      showBackground: true,
      backgroundColor: '#ffffff',
      backgroundOpacity: 0.8,
    },
    modern: {
      fontSize: 12,
      fontFamily: 'system-ui',
      textColor: '#ffffff',
      showBackground: true,
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
    },
    minimal: {
      fontSize: 12,
      fontFamily: 'Arial',
      textColor: '#333333',
      showBackground: false,
      backgroundColor: '#ffffff',
      backgroundOpacity: 0,
    },
    highContrast: {
      fontSize: 16,
      fontFamily: 'Arial',
      textColor: '#ffffff',
      showBackground: true,
      backgroundColor: '#000000',
      backgroundOpacity: 1,
    },
  }

  const applyCanvasPreset = (presetId: string) => {
    const preset = CANVAS_PRESETS.find((item) => item.id === presetId)
    if (!preset) return

    setCanvasSelection(presetId)
    setCustomCanvasSize({ width: preset.width, height: preset.height })
    setState((prev) => ({
      ...prev,
      mapWidth: preset.width,
      mapHeight: preset.height,
    }))
  }

  const handleSelectCustomCanvas = () => {
    setCanvasSelection('custom')
    setCustomCanvasSize((prev) => ({
      width: prev.width || state.mapWidth,
      height: prev.height || state.mapHeight,
    }))
  }

  const handleCustomCanvasSizeChange = (dimension: 'width' | 'height', rawValue: string) => {
    const parsedValue = parseInt(rawValue, 10)
    if (Number.isNaN(parsedValue)) {
      return
    }

    setCanvasSelection('custom')
    const limits = dimension === 'width' ? CANVAS_LIMITS.width : CANVAS_LIMITS.height
    const clampedValue = clamp(parsedValue, limits.min, limits.max)

    setCustomCanvasSize((prev) => {
      if (prev[dimension] === clampedValue) {
        return prev
      }
      return { ...prev, [dimension]: clampedValue }
    })

    setState((prev) => {
      const nextWidth = dimension === 'width' ? clampedValue : prev.mapWidth
      const nextHeight = dimension === 'height' ? clampedValue : prev.mapHeight
      if (nextWidth === prev.mapWidth && nextHeight === prev.mapHeight) {
        return prev
      }
      return {
        ...prev,
        mapWidth: nextWidth,
        mapHeight: nextHeight,
      }
    })
  }
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [selectedContinentId, setSelectedContinentId] = useState<string | null>(null)
  const [isPlacingTerritory, setIsPlacingTerritory] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('properties')

  const updateLabelSettings = useCallback((updater: (settings: LabelSettings) => LabelSettings) => {
    setState((prev) => ({
      ...prev,
      labelSettings: updater(resolveLabelSettings(prev.labelSettings)),
    }))
  }, [])

  // Apply label preset
  const applyLabelPreset = (
    preset: 'classic' | 'modern' | 'minimal' | 'highContrast' | 'custom',
  ) => {
    if (preset === 'custom') {
      updateLabelSettings((settings) => ({
        ...settings,
        preset: 'custom',
      }))
      return
    }

    const presetSettings = LABEL_PRESETS[preset]
    updateLabelSettings((settings) => ({
      ...settings,
      preset,
      ...presetSettings,
    }))
  }
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)
  const [tokenShape, setTokenShape] = useState<TokenShape>('hexagon')
  const [tokenSize, setTokenSize] = useState<number>(20)
  const [showGrid, setShowGrid] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploadInfo, setUploadInfo] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showLoadDraftDialog, setShowLoadDraftDialog] = useState(false)
  const [showImageOptions, setShowImageOptions] = useState(false)

  // New continent form
  const [newContinentName, setNewContinentName] = useState('')
  const [newContinentColor, setNewContinentColor] = useState('#3B82F6')
  const [newContinentBonus, setNewContinentBonus] = useState(3)
  const [editingContinentId, setEditingContinentId] = useState<string | null>(null)

  // Capital management state
  const [capitalAssignments, setCapitalAssignments] = useState<CapitalAssignments>({})
  const [capitalMetadata, setCapitalMetadata] = useState<CapitalMetadata>({})
  const [selectedPlayerCount, setSelectedPlayerCount] = useState(4)
  const [isGeneratingCapitals, setIsGeneratingCapitals] = useState(false)
  const [isAssigningCapital, setIsAssigningCapital] = useState(false)

  // Auto-save to localStorage
  const saveToLocalStorage = useCallback(() => {
    try {
      const dataToSave = {
        state,
        capitalAssignments,
        capitalMetadata,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(dataToSave))
      setLastSaved(new Date())
    } catch (error: unknown) {
      reportError('Failed to save draft:', error)
    }
  }, [state, capitalAssignments, capitalMetadata])

  // Load from localStorage
  const loadFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        setState(data.state)
        setCapitalAssignments(data.capitalAssignments || {})
        setCapitalMetadata(data.capitalMetadata || {})
        setLastSaved(data.savedAt ? new Date(data.savedAt) : null)
        setShowLoadDraftDialog(false)
      }
    } catch (error: unknown) {
      reportError('Failed to load draft:', error)
    }
  }

  // Load map for editing
  const loadMapForEditing = useCallback(async (mapId: string) => {
    try {
      // Try admin endpoint first for admin users
      let response: { data: unknown }
      try {
        response = await api.get(`/admin/maps/${mapId}`)
      } catch (_adminError) {
        // Fallback to regular maps endpoint
        response = await api.get(`/maps/${mapId}`)
      }

      const map = response.data as MapApiResponse

      // Handle territories from different sources
      let territories: Territory[] = []
      let continents: Continent[] = []

      if (Array.isArray(map.territories)) {
        territories = (map.territories as LegacyTerritoryRecord[]).map((record) =>
          normalizeTerritoryRecord(record),
        )
      } else {
        territories = normalizeTerritories(map.metadata?.territories)
      }

      if (Array.isArray(map.continents)) {
        continents = normalizeContinents(map.continents)
      } else {
        continents = normalizeContinents(map.metadata?.continents)
      }

      // Handle adjacencies
      if (map.adjacencies && Array.isArray(map.adjacencies)) {
        // Build connections from adjacency table
        const connectionsMap = new Map<string, Set<string>>()

        ;(map.adjacencies as LegacyAdjacencyRecord[]).forEach((adj) => {
          const fromId =
            adj.territory_from || adj.fromTerritoryId || adj.from_territory_id || adj.from || null
          const toId =
            adj.territory_to || adj.toTerritoryId || adj.to_territory_id || adj.to || null

          if (!fromId || !toId) {
            return
          }

          if (!connectionsMap.has(fromId)) {
            connectionsMap.set(fromId, new Set())
          }
          if (!connectionsMap.has(toId)) {
            connectionsMap.set(toId, new Set())
          }
          connectionsMap.get(fromId)?.add(toId)
          connectionsMap.get(toId)?.add(fromId)
        })

        territories = territories.map((t) => {
          const connectionKey = t.id ?? t.name
          const connections = connectionKey
            ? Array.from(connectionsMap.get(connectionKey) ?? [])
            : []

          return {
            ...t,
            connections,
          }
        })
      } else if (map.territory_connections && typeof map.territory_connections === 'object') {
        territories = territories.map((territory) => {
          const directConnections =
            map.territory_connections &&
            ((map.territory_connections as Record<string, unknown>)[territory.id] ??
              (map.territory_connections as Record<string, unknown>)[territory.name])

          const connections = toStringArray(directConnections)

          return {
            ...territory,
            connections: connections.length > 0 ? connections : territory.connections,
          }
        })
      }

      // Load map data into editor state
      setState((prev) => {
        const minPlayers = isNumber(map.min_players)
          ? map.min_players
          : isNumber(map.minPlayers)
            ? map.minPlayers
            : prev.minPlayers

        const maxPlayers = isNumber(map.max_players)
          ? map.max_players
          : isNumber(map.maxPlayers)
            ? map.maxPlayers
            : prev.maxPlayers

        const imageUrl = isString(map.image_url)
          ? map.image_url
          : isString(map.imageUrl)
            ? map.imageUrl
            : prev.imageUrl

        const mapWidth = isNumber(map.metadata?.width)
          ? map.metadata?.width
          : isNumber(map.imageWidth)
            ? map.imageWidth
            : prev.mapWidth

        const mapHeight = isNumber(map.metadata?.height)
          ? map.metadata?.height
          : isNumber(map.imageHeight)
            ? map.imageHeight
            : prev.mapHeight

        return {
          ...prev,
          name: isString(map.name) ? map.name : prev.name,
          description: isString(map.description) ? map.description : '',
          minPlayers,
          maxPlayers,
          imageUrl,
          territories,
          continents,
          mapWidth,
          mapHeight,
        }
      })

      // If we have an image URL, set dimensions
      const imageSource = map.image_url ?? map.imageUrl
      if (imageSource) {
        const img = new Image()
        img.onload = () => {
          setState((prev) => ({
            ...prev,
            imageWidth: img.width,
            imageHeight: img.height,
          }))
        }
        img.src = imageSource
      }

      setDraftId(null)
      setPublishedMapId(mapId)
      setDraftStatus('editing')
    } catch (error: unknown) {
      reportError('Failed to load map for editing:', error)
      alert('Failed to load map. Starting with a new map instead.')
    }
  }, [])

  const loadDraftForEditing = useCallback(async (draftIdToLoad: string) => {
    try {
      const response = await mapWorkflowApi.getDraft(draftIdToLoad)
      const draft = response.draft

      if (!draft) {
        alert('Draft not found or access denied.')
        return
      }

      const draftData = (draft.data ?? {}) as Record<string, unknown>
      let territories: Territory[]
      if (Array.isArray(draft.territories)) {
        territories = normalizeTerritories(draft.territories)
      } else {
        territories = normalizeTerritories(draftData.territories)
      }

      if (Array.isArray(draft.adjacencies) && draft.adjacencies.length > 0) {
        const adjacencyMap = new Map<string, Set<string>>()

        ;(draft.adjacencies as LegacyAdjacencyRecord[]).forEach((adj) => {
          const from = adj.from || adj.fromTerritoryId || adj.territory_from
          const to = adj.to || adj.toTerritoryId || adj.territory_to
          if (!from || !to) return
          if (!adjacencyMap.has(from)) adjacencyMap.set(from, new Set())
          adjacencyMap.get(from)?.add(to)
        })

        territories = territories.map((territory) => {
          const connections =
            Array.from(
              adjacencyMap.get(territory.id) ||
                adjacencyMap.get(territory.name) ||
                new Set<string>(),
            ) || []
          return {
            ...territory,
            connections,
          }
        })
      }

      const continents: Continent[] = Array.isArray(draft.continents)
        ? normalizeContinents(draft.continents)
        : normalizeContinents(draftData.continents)

      const imagePayload = (draftData.image ?? {}) as DraftImagePayload | undefined

      let imageUrl = draft.imageUrl
      if (!imageUrl && imagePayload?.data) {
        imageUrl = `data:${imagePayload.mimeType || 'image/png'};base64,${imagePayload.data}`
      }

      setState((prev) => ({
        ...prev,
        name: draft.name ?? prev.name,
        description: draft.description || '',
        minPlayers:
          typeof draftData.minPlayers === 'number' ? draftData.minPlayers : prev.minPlayers,
        maxPlayers:
          typeof draftData.maxPlayers === 'number' ? draftData.maxPlayers : prev.maxPlayers,
        mapWidth:
          typeof draftData.width === 'number' ? draftData.width : draft.imageWidth || prev.mapWidth,
        mapHeight:
          typeof draftData.height === 'number'
            ? draftData.height
            : draft.imageHeight || prev.mapHeight,
        imageWidth: draft.imageWidth || prev.imageWidth,
        imageHeight: draft.imageHeight || prev.imageHeight,
        imageUrl: imageUrl || prev.imageUrl,
        territories,
        continents,
      }))

      setCapitalAssignments(draft.capitalAssignments || {})
      setDraftId(draft.id)
      setDraftStatus(draft.draftStatus || 'editing')
      const parentMapId =
        typeof draft.parentMapId === 'string'
          ? draft.parentMapId
          : typeof draftData.parentMapId === 'string'
            ? (draftData.parentMapId as string)
            : null
      setPublishedMapId(parentMapId)
      setLastSaved(draft.updatedAt ? new Date(draft.updatedAt) : new Date())
      setShowDraftsList(false)
    } catch (error: unknown) {
      reportError('Failed to load draft:', error)
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined
        const message = responseData?.error || responseData?.message || error.message
        alert(`Failed to load draft: ${message}`)
      } else if (error instanceof Error) {
        alert(`Failed to load draft: ${error.message}`)
      } else {
        alert('Failed to load draft due to an unexpected error.')
      }
    }
  }, [])

  // Check for saved draft on mount
  // Check URL params for edit mode and load drafts
  useEffect(() => {
    const mapId = searchParams.get('edit')
    if (mapId) {
      setDraftId(null)
      setPublishedMapId(mapId)
      loadMapForEditing(mapId)
    } else {
      // Check for local auto-saved draft if not editing
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) {
        try {
          const data = JSON.parse(saved)
          if (data.savedAt) {
            setShowLoadDraftDialog(true)
          }
        } catch (error: unknown) {
          reportError('Error checking for saved draft:', error)
        }
      }
    }
  }, [searchParams, loadMapForEditing])

  // Load user's draft maps from database
  const loadDraftMaps = async () => {
    try {
      // Check if user is logged in
      const token = localStorage.getItem('token')

      if (!token || token === 'null' || token === 'undefined') {
        alert('Please log in to load your draft maps')
        return
      }

      const response = await mapWorkflowApi.listDrafts()
      const drafts = response.drafts

      if (drafts.length === 0) {
        alert('No draft maps found. Create and save a map first.')
        return
      }

      setAvailableDrafts(drafts)
      setShowDraftsList(true)
    } catch (error: unknown) {
      reportError('Failed to load draft maps:', error)

      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        const responseData = error.response?.data as ApiErrorResponse | undefined
        const fallbackMessage = responseData?.message || responseData?.error || error.message

        if (status === 400) {
          alert('Authentication required. Please log in to load your maps.')
        } else if (status === 401) {
          alert('Session expired. Please log in again.')
          localStorage.removeItem('token')
        } else {
          alert(`Failed to load draft maps: ${fallbackMessage || 'Unknown error'}`)
        }
      } else if (error instanceof Error) {
        alert(`Failed to load draft maps: ${error.message}`)
      } else {
        alert('Failed to load draft maps due to an unexpected error.')
      }
    }
  }

  // Auto-save timer
  useEffect(() => {
    const timer = setInterval(() => {
      saveToLocalStorage()
    }, AUTOSAVE_INTERVAL)

    return () => clearInterval(timer)
  }, [saveToLocalStorage])

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    processImageFile(file)
  }

  const processImageFile = (file: File) => {
    // Clear previous errors and info
    setUploadError(null)
    setUploadInfo(null)

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file (PNG, JPG, GIF, WEBP, SVG)')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max size is 10MB`)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string

      // Check image dimensions
      const img = new Image()
      img.onload = () => {
        const MIN_WIDTH = 400
        const MIN_HEIGHT = 300
        const MAX_WIDTH = 2560 // Allow up to 2560x1440 for modern displays
        const MAX_HEIGHT = 1440

        let finalWidth = img.width
        let finalHeight = img.height

        // Auto-expand small images to meet minimum size
        if (img.width < MIN_WIDTH || img.height < MIN_HEIGHT) {
          const scaleX = MIN_WIDTH / img.width
          const scaleY = MIN_HEIGHT / img.height
          const scale = Math.max(scaleX, scaleY)

          finalWidth = Math.round(img.width * scale)
          finalHeight = Math.round(img.height * scale)

          // Create expanded canvas
          const expandCanvas = document.createElement('canvas')
          expandCanvas.width = finalWidth
          expandCanvas.height = finalHeight
          const ctx = expandCanvas.getContext('2d')

          if (ctx) {
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0, finalWidth, finalHeight)
            const expandedDataUrl = expandCanvas.toDataURL('image/png')
            setTempImageUrl(expandedDataUrl)
            setUploadInfo(
              `Image auto-expanded from ${img.width}×${img.height} to ${finalWidth}×${finalHeight}px`,
            )
          }
        } else {
          setTempImageUrl(dataUrl)
          setUploadInfo(null)
        }

        // Update map dimensions
        setState((prev) => ({
          ...prev,
          imageUrl: dataUrl,
          imageWidth: img.width,
          imageHeight: img.height,
          mapWidth: Math.min(finalWidth, MAX_WIDTH),
          mapHeight: Math.min(finalHeight, MAX_HEIGHT),
        }))

        // Show options dialog
        setShowImageOptions(true)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // Handle map interactions based on mode
  const handleMapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (state.draggedTerritoryId) return

    const rect = event.currentTarget.getBoundingClientRect()
    const scrollLeft = mapContainerRef.current?.scrollLeft || 0
    const scrollTop = mapContainerRef.current?.scrollTop || 0
    const x = event.clientX - rect.left + scrollLeft
    const y = event.clientY - rect.top + scrollTop

    if (editorMode === 'territories' && isPlacingTerritory) {
      // Check if click is too close to existing territories
      const clickPadding = tokenSize * 0.25
      const minDistance = tokenSize + clickPadding * 2

      const tooClose = state.territories.some((t) => {
        const distance = Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2)
        return distance < minDistance
      })

      if (tooClose) {
        // Just ignore clicks that are too close to existing tokens
        return
      }
      // Allow placing without continent
      const newTerritory: Territory = {
        id: uuidv4(),
        name: `Territory ${state.territories.length + 1}`,
        x,
        y,
        continentId: selectedContinentId,
        armies: 1,
        connections: [],
      }

      setState((prev) => ({
        ...prev,
        territories: [...prev.territories, newTerritory],
        selectedTerritoryId: newTerritory.id,
      }))
    }
  }

  // Handle token click based on mode
  const handleTokenClick = (territoryId: string, event: ReactMouseEvent) => {
    event.stopPropagation()

    if (editorMode === 'capitals') {
      handleCapitalTokenClick(territoryId)
      return
    }

    if (editorMode === 'connections') {
      if (!isConnecting || !connectingFromId) {
        setIsConnecting(true)
        setConnectingFromId(territoryId)
        setState((prev) => ({ ...prev, selectedTerritoryId: territoryId }))
      } else if (connectingFromId !== territoryId) {
        // Create bidirectional connection
        setState((prev) => ({
          ...prev,
          territories: prev.territories.map((t) => {
            if (t.id === connectingFromId) {
              return {
                ...t,
                connections: t.connections.includes(territoryId)
                  ? t.connections.filter((id) => id !== territoryId)
                  : [...t.connections, territoryId],
              }
            }
            if (t.id === territoryId) {
              return {
                ...t,
                connections: t.connections.includes(connectingFromId)
                  ? t.connections.filter((id) => id !== connectingFromId)
                  : [...t.connections, connectingFromId],
              }
            }
            return t
          }),
          selectedTerritoryId: null,
        }))
        setIsConnecting(false)
        setConnectingFromId(null)
      }
    } else {
      setState((prev) => ({ ...prev, selectedTerritoryId: territoryId }))
    }
  }

  // Handle token drag
  const handleTokenMouseDown = (territoryId: string, event: ReactMouseEvent) => {
    if (editorMode === 'connections') return

    event.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const scrollLeft = mapContainerRef.current?.scrollLeft || 0
    const scrollTop = mapContainerRef.current?.scrollTop || 0
    const territory = state.territories.find((t) => t.id === territoryId)
    if (!territory) return

    setDragOffset({
      x: event.clientX - rect.left + scrollLeft - territory.x,
      y: event.clientY - rect.top + scrollTop - territory.y,
    })

    setState((prev) => ({
      ...prev,
      draggedTerritoryId: territoryId,
      selectedTerritoryId: territoryId,
    }))
  }

  // Handle mouse move for dragging
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!state.draggedTerritoryId || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const scrollLeft = mapContainerRef.current?.scrollLeft || 0
      const scrollTop = mapContainerRef.current?.scrollTop || 0
      const x = Math.max(
        0,
        Math.min(state.mapWidth - 30, event.clientX - rect.left + scrollLeft - dragOffset.x),
      )
      const y = Math.max(
        0,
        Math.min(state.mapHeight - 30, event.clientY - rect.top + scrollTop - dragOffset.y),
      )

      setState((prev) => ({
        ...prev,
        territories: prev.territories.map((t) =>
          t.id === prev.draggedTerritoryId ? { ...t, x, y } : t,
        ),
      }))
    },
    [state.draggedTerritoryId, state.mapWidth, state.mapHeight, dragOffset],
  )

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    setState((prev) => ({ ...prev, draggedTerritoryId: null }))
  }, [])

  // Add mouse event listeners
  useEffect(() => {
    if (state.draggedTerritoryId) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [state.draggedTerritoryId, handleMouseMove, handleMouseUp])

  // Handle continent creation
  const handleCreateContinent = () => {
    if (!newContinentName.trim()) return

    const newContinent: Continent = {
      id: uuidv4(),
      name: newContinentName,
      color: newContinentColor,
      bonus: newContinentBonus,
    }

    setState((prev) => ({
      ...prev,
      continents: [...prev.continents, newContinent],
    }))

    setNewContinentName('')
    setNewContinentColor(`#${Math.floor(Math.random() * 16777215).toString(16)}`)
    setNewContinentBonus(3)
    setSelectedContinentId(newContinent.id)
  }

  // Handle continent update
  const handleUpdateContinent = (continentId: string) => {
    setState((prev) => ({
      ...prev,
      continents: prev.continents.map((c) =>
        c.id === continentId
          ? { ...c, name: newContinentName, color: newContinentColor, bonus: newContinentBonus }
          : c,
      ),
    }))
    setEditingContinentId(null)
    setNewContinentName('')
  }

  // Handle continent deletion
  const handleDeleteContinent = (continentId: string) => {
    setState((prev) => ({
      ...prev,
      continents: prev.continents.filter((c) => c.id !== continentId),
      territories: prev.territories.map((t) =>
        t.continentId === continentId
          ? { ...t, continentId: null } // Unassign territories instead of deleting
          : t,
      ),
    }))
    if (selectedContinentId === continentId) {
      setSelectedContinentId(null)
    }
  }

  // Get continent for territory
  const getContinentForTerritory = (territoryId: string) => {
    const territory = state.territories.find((t) => t.id === territoryId)
    if (!territory || !territory.continentId) return null
    return state.continents.find((c) => c.id === territory.continentId)
  }

  // Submit map for approval
  const handleSubmitForApproval = async () => {
    try {
      if (!draftId) {
        alert('Please save your map as a draft first')
        return
      }

      if (state.territories.length < 10) {
        alert('Maps must have at least 10 territories to be submitted for approval')
        return
      }

      const confirmed = confirm(
        'Submit this map for approval?\n\n' +
          'Once submitted, the map will be reviewed by admins.\n' +
          'You will not be able to edit it until it is approved or rejected.',
      )

      if (!confirmed) return

      const response = await mapWorkflowApi.publishDraft(draftId)
      const publishedMapId = extractMapId(response?.map)

      if (publishedMapId) {
        setPublishedMapId(publishedMapId)
      }

      setDraftStatus('submitted')
      alert('Map submitted for approval! You will be notified when it is reviewed.')

      window.location.href = '/maps'
    } catch (error: unknown) {
      reportError('Failed to submit map:', error)
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined
        const message = responseData?.error || responseData?.message || error.message
        alert(`Failed to submit map for approval: ${message}`)
      } else if (error instanceof Error) {
        alert(`Failed to submit map for approval: ${error.message}`)
      } else {
        alert('Failed to submit map for approval due to an unexpected error.')
      }
    }
  }

  // Save map as draft to database
  const handleSaveMap = async () => {
    try {
      const token = localStorage.getItem('token')

      if (!token || token === 'null' || token === 'undefined') {
        alert('Please log in to save maps to the server. Your map is auto-saved locally.')
        return
      }

      if (state.territories.length < 2) {
        alert('Please add at least 2 territories before saving')
        return
      }

      setSaveStatus('saving')
      setSaveError(null)

      let imageBase64: string | null = null
      let imageMimeType: string | null = null

      if (state.imageUrl) {
        try {
          if (state.imageUrl.startsWith('data:')) {
            const parts = state.imageUrl.split(',')
            imageBase64 = parts[1]
            imageMimeType = parts[0].match(/data:([^;]+)/)?.[1] || 'image/png'
          } else if (!state.imageUrl.startsWith('/uploads/')) {
            const response = await fetch(state.imageUrl)
            const blob = await response.blob()
            const reader = new FileReader()
            const base64Promise = new Promise<string>((resolve, reject) => {
              reader.onloadend = () => {
                const dataUrl = reader.result as string
                const base64 = dataUrl.split(',')[1]
                resolve(base64)
              }
              reader.onerror = reject
            })
            reader.readAsDataURL(blob)
            imageBase64 = await base64Promise
            imageMimeType = blob.type || 'image/png'
          }
        } catch (error: unknown) {
          reportError('Failed to process image:', error)
          throw new Error('Failed to process map background image')
        }
      }

      const adjacencyList = state.territories.flatMap((territory) =>
        (territory.connections || []).map((targetId) => ({
          from: territory.id,
          to: targetId,
        })),
      )

      const draftPayload: MapDraftPayload = {
        id: draftId ?? undefined,
        name: state.name,
        description: state.description,
        data: {
          name: state.name,
          description: state.description,
          minPlayers: state.minPlayers,
          maxPlayers: state.maxPlayers,
          width: state.mapWidth,
          height: state.mapHeight,
          image: imageBase64
            ? {
                data: imageBase64,
                mimeType: imageMimeType || 'image/png',
                filename: 'map-background.png',
              }
            : undefined,
          capitalAssignments,
        },
        territories: state.territories,
        continents: state.continents,
        adjacencies: adjacencyList,
        capitalAssignments,
        imageUrl: imageBase64 ? undefined : state.imageUrl,
        imageWidth: state.imageWidth,
        imageHeight: state.imageHeight,
        tags: ['custom', 'user-created'],
        isPublic: false,
        parentMapId: publishedMapId ?? undefined,
      }

      const response = await mapWorkflowApi.saveDraft(draftPayload)
      setDraftId(response.draft.id)
      setDraftStatus(response.draft.draftStatus || 'editing')
      setLastSaved(new Date())
      setSaveStatus('saved')
      reportInfo('Draft saved successfully', response.draft)

      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error: unknown) {
      reportError('Map upload failed:', error)
      setSaveStatus('error')

      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined
        const message = responseData?.error || responseData?.message || error.message
        setSaveError(message || 'Failed to save map.')
        alert(`Failed to save map. ${message ? `\n\n${message}` : ''}`)
      } else if (error instanceof Error) {
        setSaveError(error.message)
        alert(`Failed to save map.\n\nError: ${error.message}`)
      } else {
        setSaveError('An unexpected error occurred.')
        alert('Failed to save map due to an unexpected error.')
      }
    }
  }

  // Export map data as JSON file for backup/sharing
  const handleExport = () => {
    const mapData = {
      name: state.name,
      imageUrl: state.imageUrl,
      width: state.mapWidth,
      height: state.mapHeight,
      territories: state.territories,
      continents: state.continents,
    }

    const dataStr = JSON.stringify(mapData, null, 2)
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`

    const link = document.createElement('a')
    link.setAttribute('href', dataUri)
    link.setAttribute('download', `${state.name.replace(/\s+/g, '_')}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Import map data from JSON file
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const mapData = JSON.parse(content) as ImportedMapFile

        // Validate the imported data structure
        if (!Array.isArray(mapData.territories)) {
          throw new Error('Invalid map data: missing territories')
        }

        const normalizedTerritories: Territory[] = mapData.territories.map((territory) => ({
          id: territory.id,
          name: territory.name || `Territory ${territory.id}`,
          x: territory.x ?? 0,
          y: territory.y ?? 0,
          armies: territory.armies ?? 1,
          connections: territory.connections ?? [],
          continentId: territory.continentId ?? null,
        }))

        // Load the imported map data
        setState((prev) => ({
          ...prev,
          name: mapData.name || 'Imported Map',
          imageUrl: mapData.imageUrl || prev.imageUrl,
          mapWidth: mapData.width ?? prev.mapWidth,
          mapHeight: mapData.height ?? prev.mapHeight,
          imageWidth: mapData.width ?? prev.imageWidth,
          imageHeight: mapData.height ?? prev.imageHeight,
          territories: normalizedTerritories,
          continents: mapData.continents || [],
          selectedTerritoryId: null,
          draggedTerritoryId: null,
        }))

        alert('Map imported successfully!')
      } catch (error: unknown) {
        reportError('Failed to import map:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        alert(`Failed to import map. ${message}`)
      }
    }

    reader.readAsText(file)

    // Reset the input so the same file can be imported again
    event.target.value = ''
  }

  // Handle image options dialog
  const handleUseFullImage = () => {
    if (!tempImageUrl) return

    setState((prev) => ({
      ...prev,
      imageUrl: tempImageUrl,
      imageScale: 1,
    }))
    setShowImageOptions(false)
    setShowProcessor(false)
    setTempImageUrl(null)
  }

  const handleCropImage = () => {
    setShowImageOptions(false)
    setShowCropper(true)
  }

  // Capital management functions
  const handleGenerateCapitals = async () => {
    if (!state.territories.length) {
      alert('Please add territories before generating capitals')
      return
    }

    setIsGeneratingCapitals(true)
    try {
      // For now, just alert that we need to save the map first
      // In a complete implementation, we'd call the API after the map is saved
      alert('Please save the map to database first, then capitals can be generated')
    } finally {
      setIsGeneratingCapitals(false)
    }
  }

  const handleCapitalTokenClick = (territoryId: string) => {
    if (!isAssigningCapital) return

    const playerCountStr = selectedPlayerCount.toString()
    const currentCapitals = capitalAssignments[playerCountStr] || []

    // Toggle capital selection
    if (currentCapitals.includes(territoryId)) {
      // Remove from capitals
      setCapitalAssignments((prev) => ({
        ...prev,
        [playerCountStr]: currentCapitals.filter((id) => id !== territoryId),
      }))
    } else if (currentCapitals.length < selectedPlayerCount) {
      // Add to capitals
      setCapitalAssignments((prev) => ({
        ...prev,
        [playerCountStr]: [...currentCapitals, territoryId],
      }))

      // Mark as manually adjusted
      setCapitalMetadata((prev) => ({
        ...prev,
        manuallyAdjusted: {
          ...prev.manuallyAdjusted,
          [playerCountStr]: true,
        },
      }))
    } else {
      alert(`Already selected ${selectedPlayerCount} capitals for ${selectedPlayerCount} players`)
    }
  }

  const getCapitalForTerritory = (territoryId: string): number | null => {
    const playerCountStr = selectedPlayerCount.toString()
    const capitals = capitalAssignments[playerCountStr] || []
    const index = capitals.indexOf(territoryId)
    return index >= 0 ? index + 1 : null
  }

  // Render sidebar content based on current tab
  const renderSidebarContent = () => {
    switch (editorMode) {
      case 'properties':
        return (
          <>
            <h2 className="text-xl font-bold mb-4">📋 Map Properties</h2>
            <div className="mb-4">
              <label htmlFor={mapNameId} className="block text-sm mb-1">
                Map Name
              </label>
              <input
                id={mapNameId}
                type="text"
                value={state.name}
                onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-1 bg-surface-2 rounded text-white"
              />
            </div>
            <div className="mb-4">
              <label htmlFor={mapDescriptionId} className="block text-sm mb-1">
                Description
              </label>
              <textarea
                id={mapDescriptionId}
                value={state.description}
                onChange={(e) => setState((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-1 bg-surface-2 rounded text-white"
                rows={3}
              />
            </div>
            <div className="mb-4">
              <label htmlFor={minPlayersId} className="block text-sm mb-1">
                Min Players: {state.minPlayers}
              </label>
              <input
                id={minPlayersId}
                type="range"
                min="2"
                max="8"
                value={state.minPlayers}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, minPlayers: Number(e.target.value) }))
                }
                className="w-full"
              />
            </div>
            <div className="mb-4">
              <label htmlFor={maxPlayersId} className="block text-sm mb-1">
                Max Players: {state.maxPlayers}
              </label>
              <input
                id={maxPlayersId}
                type="range"
                min="2"
                max="12"
                value={state.maxPlayers}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, maxPlayers: Number(e.target.value) }))
                }
                className="w-full"
              />
            </div>
            {/* Import/Export Section */}
            <div className="mt-6 p-3 bg-surface-1 rounded border border-border">
              <h3 className="text-sm font-bold mb-3">📦 Import/Export</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                >
                  💾 Export to JSON
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById(jsonImportId)?.click()}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
                >
                  📂 Import from JSON
                </button>
              </div>
            </div>

            {/* Validation Checklist */}
            <div className="mt-4 p-3 bg-surface-1 rounded border border-border">
              <h3 className="text-sm font-bold mb-2">✅ Validation Checklist</h3>
              <div className="space-y-1 text-xs">
                <div className={state.imageUrl ? 'text-green-400' : 'text-muted'}>
                  {state.imageUrl ? '✓' : '○'} Background image uploaded
                </div>
                <div className={state.territories.length > 0 ? 'text-green-400' : 'text-muted'}>
                  {state.territories.length > 0 ? '✓' : '○'} {state.territories.length} territories
                  placed
                </div>
                <div className={state.continents.length > 0 ? 'text-green-400' : 'text-muted'}>
                  {state.continents.length > 0 ? '✓' : '○'} {state.continents.length} continents
                  created
                </div>
                <div
                  className={
                    Object.keys(capitalAssignments).length > 0 ? 'text-green-400' : 'text-muted'
                  }
                >
                  {Object.keys(capitalAssignments).length > 0 ? '✓' : '○'} Capitals assigned
                </div>
              </div>
            </div>
          </>
        )

      case 'image':
        return (
          <>
            <h2 className="text-xl font-bold mb-4">🖼️ Image Settings</h2>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full btn-primary inline-flex items-center justify-center gap-2 text-base mb-4"
            >
              <span className="text-lg">📤</span>
              <span>Upload Map Image</span>
            </button>

            {/* Canvas Size Settings */}
            <div className="mb-6 p-3 bg-surface-1 rounded border border-border">
              <h3 className="text-sm font-bold mb-3">📐 Canvas Size</h3>
              <p className="text-xs text-muted leading-relaxed mb-3">
                The canvas is the playable surface that tokens and interactions use. Background
                images scale to fit whatever canvas you choose during matches, so pick a preset that
                matches how detailed you want the battlefield to feel.
              </p>
              <div className="flex items-center justify-between text-xs text-muted mb-3">
                <span>Current canvas</span>
                <span className="text-white font-semibold">
                  {state.mapWidth}×{state.mapHeight}px
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CANVAS_PRESETS.map((preset) => {
                  const isActive = canvasSelection === preset.id
                  return (
                    <button
                      type="button"
                      key={preset.id}
                      onClick={() => applyCanvasPreset(preset.id)}
                      className={`rounded border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 ${
                        isActive
                          ? 'border-primary bg-primary/10 text-white shadow-inner'
                          : 'border-border bg-surface-2 text-muted hover:text-white hover:border-primary hover:bg-surface-1'
                      }`}
                    >
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>{preset.label}</span>
                        {preset.recommended && (
                          <span className="text-xs text-primary font-medium">Recommended</span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        {preset.width}×{preset.height}px
                      </div>
                      {preset.description && (
                        <div className="text-[11px] text-muted mt-1">{preset.description}</div>
                      )}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={handleSelectCustomCanvas}
                className={`mt-3 w-full rounded border px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 ${
                  canvasSelection === 'custom'
                    ? 'border-primary bg-primary/10 text-white shadow-inner'
                    : 'border-border bg-surface-2 text-muted hover:text-white hover:border-primary hover:bg-surface-1'
                }`}
              >
                ✏️ Custom Size
              </button>
              {canvasSelection === 'custom' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label htmlFor={customCanvasWidthId} className="block text-xs text-muted mb-1">
                      Width ({CANVAS_LIMITS.width.min}-{CANVAS_LIMITS.width.max}px)
                    </label>
                    <input
                      id={customCanvasWidthId}
                      type="number"
                      min={CANVAS_LIMITS.width.min}
                      max={CANVAS_LIMITS.width.max}
                      step={50}
                      value={customCanvasSize.width}
                      onChange={(e) => handleCustomCanvasSizeChange('width', e.target.value)}
                      className="w-full px-3 py-2 bg-surface-2 border border-border rounded"
                    />
                  </div>
                  <div>
                    <label htmlFor={customCanvasHeightId} className="block text-xs text-muted mb-1">
                      Height ({CANVAS_LIMITS.height.min}-{CANVAS_LIMITS.height.max}px)
                    </label>
                    <input
                      id={customCanvasHeightId}
                      type="number"
                      min={CANVAS_LIMITS.height.min}
                      max={CANVAS_LIMITS.height.max}
                      step={50}
                      value={customCanvasSize.height}
                      onChange={(e) => handleCustomCanvasSizeChange('height', e.target.value)}
                      className="w-full px-3 py-2 bg-surface-2 border border-border rounded"
                    />
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Tip: 16:9 layouts such as 1280×720 align best with ConquestK's interface, while
                    smaller sizes load faster on lower-powered devices.
                  </p>
                </div>
              )}
            </div>

            {state.imageUrl && (
              <>
                <div className="mb-4 p-3 bg-surface-1 rounded border border-border">
                  <h3 className="text-sm font-bold mb-2">Current Image</h3>
                  <div className="text-xs text-muted space-y-1">
                    <div>Width: {state.imageWidth}px</div>
                    <div>Height: {state.imageHeight}px</div>
                    <div>Scale: {(state.imageScale * 100).toFixed(0)}%</div>
                  </div>

                  {/* Image Scale Control */}
                  <div className="mt-3">
                    <label htmlFor={imageScaleId} className="block text-sm text-muted mb-1">
                      Image Scale: {(state.imageScale * 100).toFixed(0)}%
                    </label>
                    <input
                      id={imageScaleId}
                      type="range"
                      min="50"
                      max="200"
                      step="10"
                      value={state.imageScale * 100}
                      onChange={(e) =>
                        setState((prev) => ({ ...prev, imageScale: Number(e.target.value) / 100 }))
                      }
                      className="w-full"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCropper(true)}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded mb-2"
                  title="Crop the image to specific dimensions"
                >
                  ✂️ Crop Image
                </button>
                <button
                  type="button"
                  onClick={() => setShowProcessor(true)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded mb-2"
                  title="Compress and optimize image for web use (reduces file size)"
                >
                  🎨 Process Image (Compress)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Remove the background image?')) {
                      setState((prev) => ({ ...prev, imageUrl: undefined }))
                    }
                  }}
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
                >
                  🗑️ Clear Image
                </button>
              </>
            )}
          </>
        )

      case 'territories':
        return (
          <>
            <h2 className="text-xl font-bold mb-4">🗺️ Territory Settings</h2>

            {/* Token Display Settings */}
            <div className="mb-6">
              <h3 className="text-sm font-bold mb-3">Token Display</h3>

              <div className="mb-3">
                <label htmlFor={tokenShapeId} className="block text-sm text-muted mb-1">
                  Shape
                </label>
                <select
                  id={tokenShapeId}
                  value={tokenShape}
                  onChange={(e) => setTokenShape(e.target.value as TokenShape)}
                  className="w-full px-3 py-2 bg-surface-2 rounded"
                >
                  <option value="hexagon">⬡ Hexagon</option>
                  <option value="square">◼ Square</option>
                  <option value="circle">● Circle</option>
                </select>
              </div>

              <div className="mb-3">
                <label htmlFor={tokenSizeId} className="block text-sm text-muted mb-1">
                  Size: {tokenSize}px
                </label>
                <input
                  id={tokenSizeId}
                  type="range"
                  min="10"
                  max="40"
                  value={tokenSize}
                  onChange={(e) => setTokenSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`w-full px-3 py-2 rounded text-sm ${
                  showGrid ? 'bg-primary' : 'bg-surface-2 hover:bg-gray-600'
                }`}
              >
                ⊞ {showGrid ? 'Hide Grid' : 'Show Grid'}
              </button>
            </div>

            {/* Label Settings */}
            <div className="mb-6">
              <h3 className="text-sm font-bold mb-3">Labels</h3>

              <button
                type="button"
                onClick={() =>
                  updateLabelSettings((settings) => ({
                    ...settings,
                    showLabels: !settings.showLabels,
                  }))
                }
                className={`w-full px-3 py-2 rounded text-sm mb-2 ${
                  state.labelSettings?.showLabels ? 'bg-primary' : 'bg-surface-2 hover:bg-gray-600'
                }`}
              >
                🏷️ {state.labelSettings?.showLabels ? 'Hide Labels' : 'Show Labels'}
              </button>

              {state.labelSettings?.showLabels && (
                <button
                  type="button"
                  onClick={() => setShowLabelSettings(true)}
                  className="w-full px-3 py-2 bg-surface-2 hover:bg-gray-600 rounded text-sm"
                >
                  🎨 Customize Label Style
                </button>
              )}
            </div>

            {/* Placement Mode */}
            <button
              type="button"
              onClick={() => setIsPlacingTerritory(!isPlacingTerritory)}
              className={`w-full px-4 py-3 rounded font-medium mb-4 ${
                isPlacingTerritory
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-violet hover:brightness-110'
              }`}
            >
              {isPlacingTerritory ? '📍 Click Map to Place' : '➕ Add Territory'}
            </button>

            {/* Territory List */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-bold mb-2">Territories ({state.territories.length})</h3>
              {state.selectedTerritoryId &&
                (() => {
                  const territory = state.territories.find(
                    (t) => t.id === state.selectedTerritoryId,
                  )
                  if (!territory) return null
                  return (
                    <div className="p-3 bg-surface-2 rounded mb-3">
                      <input
                        type="text"
                        value={territory.name}
                        onChange={(e) => {
                          setState((prev) => ({
                            ...prev,
                            territories: prev.territories.map((t) =>
                              t.id === state.selectedTerritoryId
                                ? { ...t, name: e.target.value }
                                : t,
                            ),
                          }))
                        }}
                        className="w-full px-2 py-1 mb-2 bg-gray-600 rounded text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setState((prev) => ({
                            ...prev,
                            territories: prev.territories.filter(
                              (t) => t.id !== state.selectedTerritoryId,
                            ),
                            selectedTerritoryId: null,
                          }))
                        }}
                        className="w-full px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                      >
                        🗑️ Delete Territory
                      </button>
                    </div>
                  )
                })()}
            </div>
          </>
        )

      case 'continents':
        return (
          <>
            <h2 className="text-xl font-bold mb-4">🌍 Continent Management</h2>

            {/* Create Continent Form */}
            <div className="mb-6 p-3 bg-surface-2 rounded">
              <h3 className="text-sm font-bold mb-3">Create Continent</h3>
              <input
                type="text"
                placeholder="Continent name"
                value={newContinentName}
                onChange={(e) => setNewContinentName(e.target.value)}
                className="w-full px-3 py-2 mb-2 bg-gray-600 rounded text-white"
              />
              <div className="flex gap-2 mb-2">
                <input
                  type="color"
                  value={newContinentColor}
                  onChange={(e) => setNewContinentColor(e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer"
                />
                <input
                  type="number"
                  placeholder="Bonus"
                  value={newContinentBonus}
                  onChange={(e) => setNewContinentBonus(Number(e.target.value))}
                  className="flex-1 px-3 py-1 bg-gray-600 rounded text-white"
                />
              </div>
              <button
                type="button"
                onClick={handleCreateContinent}
                className="w-full px-3 py-2 bg-primary hover:brightness-110 rounded text-sm"
              >
                ➕ Create Continent
              </button>
            </div>

            {/* Continent List */}
            <div className="space-y-2">
              {state.continents.map((continent) => {
                const territoryCount = state.territories.filter(
                  (t) => t.continentId === continent.id,
                ).length
                return (
                  <div key={continent.id} className="p-3 bg-surface-2 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: continent.color }}
                        />
                        <span className="font-medium">{continent.name}</span>
                      </div>
                      <span className="text-xs text-muted">+{continent.bonus}</span>
                    </div>
                    <div className="text-xs text-muted mb-2">{territoryCount} territories</div>
                    <button
                      type="button"
                      onClick={() => handleDeleteContinent(continent.id)}
                      className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                    >
                      Delete
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )

      case 'connections':
        return (
          <>
            <h2 className="text-xl font-bold mb-4">🔗 Territory Connections</h2>

            <button
              type="button"
              onClick={() => setIsConnecting(!isConnecting)}
              className={`w-full px-4 py-3 rounded font-medium mb-4 ${
                isConnecting
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-violet hover:brightness-110'
              }`}
            >
              {isConnecting ? '🔗 Click Two Territories' : '🔗 Connect Territories'}
            </button>

            {isConnecting && (
              <div className="p-3 bg-orange-900/50 border border-orange-600 rounded mb-4">
                <p className="text-sm">
                  Click on two territories to connect them. Click again to disconnect.
                </p>
              </div>
            )}

            <div className="text-sm text-muted">
              <h3 className="font-bold mb-2">Connection Statistics</h3>
              <div className="space-y-1">
                <div>
                  Total Connections:{' '}
                  {state.territories.reduce((sum, t) => sum + t.connections.length, 0) / 2}
                </div>
                <div>
                  Average per Territory:{' '}
                  {state.territories.length > 0
                    ? (
                        state.territories.reduce((sum, t) => sum + t.connections.length, 0) /
                        state.territories.length
                      ).toFixed(1)
                    : 0}
                </div>
              </div>
            </div>
          </>
        )

      case 'capitals':
        return (
          <>
            <h2 className="text-xl font-bold mb-4">👑 Capital Assignment</h2>

            <div className="mb-4">
              <label htmlFor={capitalPlayerCountId} className="block text-sm mb-2">
                Player Count
              </label>
              <select
                id={capitalPlayerCountId}
                value={selectedPlayerCount}
                onChange={(e) => setSelectedPlayerCount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-2 rounded"
              >
                {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                  <option key={num} value={num}>
                    {num} Players
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleGenerateCapitals}
              disabled={isGeneratingCapitals || state.territories.length < selectedPlayerCount}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded mb-2"
            >
              {isGeneratingCapitals ? '⏳ Generating...' : '🎲 Auto-Generate'}
            </button>

            <button
              type="button"
              onClick={() => setIsAssigningCapital(!isAssigningCapital)}
              className={`w-full px-4 py-2 rounded mb-4 ${
                isAssigningCapital
                  ? 'bg-yellow-600 hover:bg-yellow-700'
                  : 'bg-violet hover:brightness-110'
              }`}
            >
              {isAssigningCapital ? '👑 Click to Assign' : '✏️ Manual Assign'}
            </button>

            {/* Current Assignments */}
            {capitalAssignments[selectedPlayerCount.toString()] && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold">Current Assignments</h3>
                {capitalAssignments[selectedPlayerCount.toString()].map((territoryId, index) => {
                  const territory = state.territories.find((t) => t.id === territoryId)
                  if (!territory) return null
                  const playerColors = Object.values(PLAYER_COLORS)
                  return (
                    <div
                      key={territoryId}
                      className="px-3 py-2 rounded text-sm"
                      style={{
                        backgroundColor: `${playerColors[index % playerColors.length]}20`,
                        border: `2px solid ${playerColors[index % playerColors.length]}`,
                      }}
                    >
                      Player {index + 1}: {territory.name}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )

      default:
        return null
    }
  }

  const modeHelpMessage = (() => {
    switch (editorMode) {
      case 'properties':
        return (
          <span>
            <strong>Properties Mode:</strong> Name your map, describe the gameplay style, and set
            the supported player counts. Drafts auto-save every few seconds, so you can explore
            without losing progress.
          </span>
        )
      case 'image':
        return (
          <span>
            <strong>Image Mode:</strong> Upload a background image, then pick a canvas preset that
            matches your target device. The canvas defines the playable area; the background image
            scales to fill it.
          </span>
        )
      case 'territories':
        return (
          <span>
            <strong>Territories Mode:</strong> Click on the map to place territory markers. Drag
            territories to reposition them. Select a continent first to assign territories to it.
            Right-click or use Delete to remove territories.
          </span>
        )
      case 'continents':
        return (
          <span>
            <strong>Continents Mode:</strong> Create continent groups to organize territories. Each
            continent provides bonus armies. Click territories to assign them and use the form to
            add custom colors and bonuses.
          </span>
        )
      case 'connections':
        return (
          <span>
            <strong>Connections Mode:</strong> Click a territory, then another to connect them.
            Connected territories can attack each other. Click the same pair again to remove the
            connection.
          </span>
        )
      case 'capitals':
        return (
          <span>
            <strong>Capitals Mode:</strong> Assign starting positions for each player count (2-8).
            Use auto-generate for balanced spacing or click tokens manually to fine-tune.
          </span>
        )
      default:
        return null
    }
  })()

  return (
    <div className="min-h-screen bg-surface-1 text-white p-4">
      {/* Load Draft Dialog - Local Storage */}
      {showLoadDraftDialog && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-1 rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">📝 Auto-Saved Draft Found</h2>
            <p className="text-muted mb-6">
              Would you like to load your previous work? You have an auto-saved draft from your last
              session.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={loadFromLocalStorage}
                className="w-full px-4 py-3 bg-primary hover:brightness-110 rounded-lg text-white font-medium"
              >
                ✅ Load Local Draft
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLoadDraftDialog(false)
                  localStorage.removeItem(AUTOSAVE_KEY)
                }}
                className="w-full px-4 py-3 bg-surface-2 hover:bg-gray-600 rounded-lg text-white font-medium"
              >
                🆕 Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft Maps List Dialog */}
      {showDraftsList && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-1 rounded-lg max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">📂 Load Draft Map</h2>
            {availableDrafts.length === 0 ? (
              <p className="text-muted">No draft maps found. Start creating a new map!</p>
            ) : (
              <div className="space-y-3">
                {availableDrafts.map((map) => (
                  <button
                    key={map.id}
                    type="button"
                    className="w-full bg-surface-2 p-4 rounded-lg hover:bg-gray-700 text-left transition"
                    onClick={() => {
                      loadDraftForEditing(map.id)
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-white">{map.name}</h3>
                        <p className="text-sm text-muted mt-1">
                          {map.description || 'No description'}
                        </p>
                        <p className="text-xs text-muted mt-1 uppercase">
                          Status: {map.draftStatus || 'editing'}
                        </p>
                        <p className="text-xs text-muted mt-2">
                          Updated: {new Date(map.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-primary hover:text-primary-dark">Load →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowDraftsList(false)}
              className="mt-4 w-full px-4 py-2 bg-surface-2 hover:bg-gray-600 rounded-lg text-white font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Label Settings Modal */}
      {showLabelSettings && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-1 rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">🏷️ Territory Label Settings</h2>

            <div className="space-y-4">
              {/* Preset Themes */}
              <div>
                <label
                  htmlFor={stylePresetId}
                  className="block text-sm font-medium text-white mb-2"
                >
                  Style Preset
                </label>
                <select
                  id={stylePresetId}
                  value={state.labelSettings?.preset || 'classic'}
                  onChange={(e) => applyLabelPreset(e.target.value as LabelSettings['preset'])}
                  className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary"
                >
                  <option value="classic">Classic (Black on White)</option>
                  <option value="modern">Modern (White on Black)</option>
                  <option value="minimal">Minimal (No Background)</option>
                  <option value="highContrast">High Contrast</option>
                  <option value="custom">Custom...</option>
                </select>
              </div>

              {/* Custom Settings (only show when Custom is selected) */}
              {state.labelSettings?.preset === 'custom' && (
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-medium text-white mb-3">Custom Settings</h3>

                  {/* Font Size */}
                  <div className="mb-3">
                    <label htmlFor={labelFontSizeId} className="block text-sm text-muted mb-1">
                      Font Size: {state.labelSettings?.fontSize || 14}px
                    </label>
                    <input
                      id={labelFontSizeId}
                      type="range"
                      min="10"
                      max="24"
                      value={state.labelSettings?.fontSize || 14}
                      onChange={(e) =>
                        updateLabelSettings((settings) => ({
                          ...settings,
                          fontSize: Number(e.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>

                  {/* Text Color */}
                  <div className="mb-3">
                    <label htmlFor={labelTextColorId} className="block text-sm text-muted mb-1">
                      Text Color
                    </label>
                    <input
                      id={labelTextColorId}
                      type="color"
                      value={state.labelSettings?.textColor || '#000000'}
                      onChange={(e) =>
                        updateLabelSettings((settings) => ({
                          ...settings,
                          textColor: e.target.value,
                        }))
                      }
                      className="w-full h-8 rounded cursor-pointer"
                    />
                  </div>

                  {/* Background Toggle */}
                  <div className="mb-3">
                    <label className="flex items-center text-sm text-white">
                      <input
                        type="checkbox"
                        checked={state.labelSettings?.showBackground || false}
                        onChange={(e) =>
                          updateLabelSettings((settings) => ({
                            ...settings,
                            showBackground: e.target.checked,
                          }))
                        }
                        className="mr-2"
                      />
                      Show Background
                    </label>
                  </div>

                  {/* Background Settings */}
                  {state.labelSettings?.showBackground && (
                    <>
                      <div className="mb-3">
                        <label
                          htmlFor={labelBackgroundColorId}
                          className="block text-sm text-muted mb-1"
                        >
                          Background Color
                        </label>
                        <input
                          id={labelBackgroundColorId}
                          type="color"
                          value={state.labelSettings?.backgroundColor || '#ffffff'}
                          onChange={(e) =>
                            updateLabelSettings((settings) => ({
                              ...settings,
                              backgroundColor: e.target.value,
                            }))
                          }
                          className="w-full h-8 rounded cursor-pointer"
                        />
                      </div>

                      <div className="mb-3">
                        <label
                          htmlFor={labelBackgroundOpacityId}
                          className="block text-sm text-muted mb-1"
                        >
                          Background Opacity:{' '}
                          {Math.round((state.labelSettings?.backgroundOpacity || 0.8) * 100)}%
                        </label>
                        <input
                          id={labelBackgroundOpacityId}
                          type="range"
                          min="0"
                          max="100"
                          value={(state.labelSettings?.backgroundOpacity || 0.8) * 100}
                          onChange={(e) =>
                            updateLabelSettings((settings) => ({
                              ...settings,
                              backgroundOpacity: Number(e.target.value) / 100,
                            }))
                          }
                          className="w-full"
                        />
                      </div>
                    </>
                  )}

                  {/* Font Family */}
                  <div className="mb-3">
                    <label htmlFor={labelFontFamilyId} className="block text-sm text-muted mb-1">
                      Font Family
                    </label>
                    <select
                      id={labelFontFamilyId}
                      value={state.labelSettings?.fontFamily || 'Arial'}
                      onChange={(e) =>
                        updateLabelSettings((settings) => ({
                          ...settings,
                          fontFamily: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary"
                    >
                      <option value="Arial">Arial</option>
                      <option value="system-ui">System UI</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Monaco">Monaco</option>
                      <option value="Courier New">Courier New</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowLabelSettings(false)}
                className="flex-1 px-4 py-2 bg-primary text-white rounded hover:brightness-110"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Options Dialog */}
      {showImageOptions && tempImageUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-1 rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">Image Import Options</h2>
            <p className="text-muted mb-6">How would you like to use this image?</p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleUseFullImage}
                className="w-full px-4 py-3 bg-primary hover:bg-primary rounded-lg text-white font-medium flex items-center justify-between"
              >
                <span>Use Full Image</span>
                <span className="text-sm text-blue-200">No cropping</span>
              </button>
              <button
                type="button"
                onClick={handleCropImage}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium flex items-center justify-between"
              >
                <span>Crop Image</span>
                <span className="text-sm text-green-200">Select area</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImageOptions(false)
                  setTempImageUrl(null)
                }}
                className="w-full px-4 py-3 bg-surface-2 hover:bg-gray-600 rounded-lg text-white font-medium"
              >
                Cancel
              </button>
            </div>
            {uploadInfo && (
              <div className="mt-4 p-2 bg-blue-900/50 border border-primary rounded text-primary-soft text-sm">
                ℹ️ {uploadInfo}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full">
        {/* Reduced padding, more screen real estate */}
        <div className="flex items-center justify-between mb-4 px-3">
          <div>
            <h1 className="text-3xl font-bold">Map Editor (Token-Based)</h1>
            <p className="text-sm text-muted mt-1">
              Create custom Risk-style maps in 5 easy steps: Upload image → Place territories →
              Create continents → Connect territories → Set capitals
            </p>
          </div>
          <div className="flex gap-4 items-center">
            <a
              href="/map-editor-polygon"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm"
              title="Try the polygon-based editor for drawing custom territory shapes"
            >
              🏪 Try Polygon Editor (Beta)
            </a>
            <div className="text-sm text-muted">
              <p className="text-xs">Token-based: Place circular tokens as territories</p>
              <p className="text-xs">Polygon-based: Draw custom territory shapes</p>
            </div>
          </div>
        </div>
        {/* Tabbed Interface */}
        <div className="bg-surface-1 rounded-lg mx-3 mb-3">
          {/* Tab Headers */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setEditorMode('properties')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                editorMode === 'properties'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted hover:text-white'
              }`}
            >
              📋 Properties
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('image')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                editorMode === 'image'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted hover:text-white'
              }`}
            >
              🖼️ Image
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('territories')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                editorMode === 'territories'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted hover:text-white'
              }`}
            >
              🗺️ Territories
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('continents')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                editorMode === 'continents'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted hover:text-white'
              }`}
            >
              🌍 Continents
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('connections')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                editorMode === 'connections'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted hover:text-white'
              }`}
            >
              🔗 Connections
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('capitals')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                editorMode === 'capitals'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted hover:text-white'
              }`}
            >
              👑 Capitals
            </button>

            {/* Save/Load Actions on the right */}
            <div className="flex gap-2 ml-auto p-2">
              {lastSaved && (
                <div className="text-xs text-muted self-center mr-2">
                  Auto-saved {lastSaved.toLocaleTimeString()}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveMap}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
                title="Save your map as a draft"
              >
                💾 {draftId ? 'Update Draft' : 'Save Draft'}
              </button>

              {draftId && (
                <span className="self-center text-xs text-muted uppercase tracking-wide">
                  Status: {draftStatus}
                </span>
              )}

              {saveStatus === 'saving' && (
                <span className="self-center text-xs text-muted">Saving…</span>
              )}
              {saveStatus === 'saved' && (
                <span className="self-center text-xs text-green-400">Draft saved</span>
              )}
              {saveStatus === 'error' && saveError && (
                <span className="self-center text-xs text-red-400">{saveError}</span>
              )}

              {draftId && draftStatus !== 'submitted' && (
                <button
                  type="button"
                  onClick={handleSubmitForApproval}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                  title="Submit your map for approval"
                >
                  ✅ Submit
                </button>
              )}

              <button
                type="button"
                onClick={loadDraftMaps}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium"
                title="Load a draft map"
              >
                📂 Load
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm('Clear all territories and start over? Your work is auto-saved.')) {
                    setState({
                      name: generateMapName(),
                      description: '',
                      minPlayers: 2,
                      maxPlayers: 12,
                      imageUrl: undefined,
                      territories: [],
                      continents: [],
                      selectedTerritoryId: null,
                      draggedTerritoryId: null,
                      mapWidth: 1920,
                      mapHeight: 1080,
                      imageWidth: 800,
                      imageHeight: 600,
                      imageScale: 1,
                    })
                    setCapitalAssignments({})
                    setCapitalMetadata({})
                    setDraftId(null)
                    setDraftStatus('editing')
                    setPublishedMapId(null)
                    setLastSaved(null)
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
                title="Clear everything and start over"
              >
                🗑️ Clear All
              </button>
            </div>
          </div>
        </div>

        {modeHelpMessage && (
          <div className="mt-3 flex items-start gap-2 rounded bg-surface-2/40 px-3 py-3 text-sm text-muted">
            <span className="text-primary text-base leading-none">💡</span>
            <div>{modeHelpMessage}</div>
          </div>
        )}

        {/* Mode-specific controls */}
        {editorMode === 'territories' && (
          <div className="mt-4 flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm">Continent:</span>
              <select
                value={selectedContinentId || ''}
                onChange={(e) => setSelectedContinentId(e.target.value)}
                className="px-3 py-1 bg-surface-2 rounded text-white"
              >
                <option value="">No Continent (Unassigned)</option>
                {state.continents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setIsPlacingTerritory(!isPlacingTerritory)}
              className={`px-4 py-2 rounded ${isPlacingTerritory ? 'bg-green-600' : 'bg-surface-2'}`}
              title={
                isPlacingTerritory
                  ? 'Click to stop placing territories'
                  : 'Click to start placing territories on the map'
              }
            >
              {isPlacingTerritory ? '🎯 Placing Territories' : '➕ Place Territory'}
            </button>
            {state.selectedTerritoryId && (
              <button
                type="button"
                onClick={() => {
                  setState((prev) => ({
                    ...prev,
                    territories: prev.territories.filter((t) => t.id !== state.selectedTerritoryId),
                  }))
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
                title="Remove the selected territory from the map"
              >
                🗑️ Delete Selected
              </button>
            )}
          </div>
        )}

        {editorMode === 'continents' && (
          <div className="mt-4 space-y-2">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Continent Name"
                value={newContinentName}
                onChange={(e) => setNewContinentName(e.target.value)}
                className="px-3 py-1 bg-surface-2 rounded text-white"
              />
              <input
                type="color"
                value={newContinentColor}
                onChange={(e) => setNewContinentColor(e.target.value)}
                className="w-12 h-8 bg-surface-2 rounded cursor-pointer"
              />
              <input
                type="number"
                placeholder="Bonus"
                value={newContinentBonus}
                onChange={(e) => setNewContinentBonus(parseInt(e.target.value, 10) || 0)}
                className="w-20 px-3 py-1 bg-surface-2 rounded text-white"
                min="0"
                max="10"
              />
              <button
                type="button"
                onClick={() => {
                  if (editingContinentId) {
                    handleUpdateContinent(editingContinentId)
                  } else {
                    handleCreateContinent()
                  }
                }}
                className="px-4 py-1 bg-slate-700 hover:bg-slate-600 rounded"
                disabled={!newContinentName.trim()}
              >
                {editingContinentId ? '💾 Update' : '➕ Add Continent'}
              </button>
              {editingContinentId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingContinentId(null)
                    setNewContinentName('')
                    setNewContinentColor('#3B82F6')
                    setNewContinentBonus(3)
                  }}
                  className="px-3 py-1 bg-gray-600 hover:bg-surface-2 rounded"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Continent List */}
            <div className="flex flex-wrap gap-2">
              {state.continents.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-1 rounded"
                  style={{ backgroundColor: `${c.color}40`, border: `2px solid ${c.color}` }}
                >
                  <span>
                    {c.name} (+{c.bonus})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingContinentId(c.id)
                      setNewContinentName(c.name)
                      setNewContinentColor(c.color)
                      setNewContinentBonus(c.bonus)
                    }}
                    className="text-primary-soft hover:text-primary-soft text-sm px-1"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(`Delete continent "${c.name}"? Territories will become unassigned.`)
                      ) {
                        handleDeleteContinent(c.id)
                      }
                    }}
                    className="text-red-400 hover:text-red-300"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {editorMode === 'connections' && (
          <div className="mt-4">
            <p className="text-sm text-muted">
              {isConnecting && connectingFromId
                ? `Click another territory to connect/disconnect from ${state.territories.find((t) => t.id === connectingFromId)?.name}`
                : 'Click a territory to start connecting'}
            </p>
            {isConnecting && (
              <button
                type="button"
                onClick={() => {
                  setIsConnecting(false)
                  setConnectingFromId(null)
                }}
                className="mt-2 px-4 py-1 bg-surface-2 hover:bg-gray-600 rounded"
              >
                Cancel Connection
              </button>
            )}
          </div>
        )}

        {editorMode === 'capitals' && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-4 items-center">
              <button
                type="button"
                onClick={handleGenerateCapitals}
                disabled={isGeneratingCapitals || state.territories.length < 2}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded"
              >
                {isGeneratingCapitals ? '⏳ Generating...' : '✨ Generate Capitals'}
              </button>
              <span className="text-sm text-muted">
                Auto-generate optimal starting positions for all player counts
              </span>
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm">Player Count:</span>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((count) => (
                <button
                  type="button"
                  key={count}
                  onClick={() => setSelectedPlayerCount(count)}
                  disabled={state.territories.length < count}
                  className={`px-3 py-1 rounded text-sm ${
                    selectedPlayerCount === count
                      ? 'bg-primary'
                      : state.territories.length < count
                        ? 'bg-surface-1 text-gray-600 cursor-not-allowed'
                        : 'bg-surface-2 hover:bg-gray-600'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>

            <div className="flex gap-4 items-center">
              <button
                type="button"
                onClick={() => setIsAssigningCapital(!isAssigningCapital)}
                className={`px-4 py-2 rounded ${
                  isAssigningCapital ? 'bg-yellow-600' : 'bg-surface-2'
                }`}
              >
                {isAssigningCapital ? '🎯 Click Territories' : '📍 Assign Capitals'}
              </button>
              <div className="text-sm">
                <span className="text-muted">Capitals for {selectedPlayerCount} players: </span>
                <span className="text-white">
                  {(capitalAssignments[selectedPlayerCount.toString()] || []).length}/
                  {selectedPlayerCount}
                </span>
              </div>
            </div>

            {capitalAssignments[selectedPlayerCount.toString()]?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {capitalAssignments[selectedPlayerCount.toString()].map((territoryId, index) => {
                  const territory = state.territories.find((t) => t.id === territoryId)
                  if (!territory) return null
                  const playerColors = PLAYER_COLORS
                  return (
                    <div
                      key={territoryId}
                      className="px-3 py-1 rounded text-sm"
                      style={{
                        backgroundColor: `${playerColors[index % playerColors.length]}20`,
                        border: `2px solid ${playerColors[index % playerColors.length]}`,
                      }}
                    >
                      Player {index + 1}: {territory.name}
                    </div>
                  )
                })}
              </div>
            )}

            {capitalMetadata.manuallyAdjusted?.[selectedPlayerCount.toString()] && (
              <p className="text-xs text-yellow-400">
                ⚠️ Manually adjusted from algorithm suggestion
              </p>
            )}
          </div>
        )}
      </div>
      {/* Main Editor Area - Full width with right sidebar */}
      <div className="flex gap-4 px-3">
        {/* Map Canvas - Main area taking most space, centered content */}
        <div
          ref={mapContainerRef}
          className="flex-1 bg-surface-1 rounded-lg overflow-auto flex items-center justify-center p-4"
          style={{ height: 'calc(100vh - 240px)' }}
        >
          <div
            ref={containerRef}
            className="relative flex-shrink-0"
            style={{
              width: `${state.mapWidth}px`,
              height: `${state.mapHeight}px`,
              backgroundColor: '#2a2a2a', // Charcoal color for canvas
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
              backgroundImage: state.imageUrl ? `url(${state.imageUrl})` : undefined,
              backgroundSize: `${state.imageWidth * state.imageScale}px ${state.imageHeight * state.imageScale}px`,
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
            onPointerDown={handleMapPointerDown}
            role="application"
            aria-label="Map editing canvas"
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) processImageFile(file)
            }}
          >
            {/* Grid Overlay */}
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(0deg, rgba(255,255,255,0.1) 0px, transparent 1px, transparent 49px, rgba(255,255,255,0.1) 50px), repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0px, transparent 1px, transparent 49px, rgba(255,255,255,0.1) 50px)',
                  backgroundSize: '50px 50px',
                }}
              />
            )}

            {/* Connection Lines */}
            {editorMode === 'connections' && (
              <svg
                className="absolute inset-0 pointer-events-none"
                style={{ width: state.mapWidth, height: state.mapHeight }}
                role="img"
                aria-label="Territory connection lines"
              >
                <title>Territory connection lines</title>
                {state.territories.map((territory) =>
                  territory.connections.map((targetId) => {
                    const target = state.territories.find((t) => t.id === targetId)
                    if (!target) return null
                    return (
                      <line
                        key={`${territory.id}-${targetId}`}
                        x1={territory.x}
                        y1={territory.y}
                        x2={target.x}
                        y2={target.y}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                      />
                    )
                  }),
                )}
              </svg>
            )}

            {/* Territory Tokens */}
            {state.territories.map((territory) => {
              const continent = getContinentForTerritory(territory.id)
              const clickPadding = tokenSize * 0.25 // 25% padding
              const totalSize = tokenSize + clickPadding * 2

              return (
                <button
                  key={territory.id}
                  type="button"
                  aria-label={`Territory ${territory.name}`}
                  className="absolute group focus:outline-none"
                  style={{
                    left: territory.x - totalSize / 2,
                    top: territory.y - totalSize / 2,
                    width: totalSize,
                    height: totalSize,
                    cursor: 'pointer',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                  }}
                  onMouseDown={(e) => handleTokenMouseDown(territory.id, e)}
                  onClick={(e) => handleTokenClick(territory.id, e)}
                >
                  {/* Ultra-transparent click area indicator (visible on hover) */}
                  <div
                    className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(124, 58, 237, 0.04) 0%, transparent 100%)',
                      border: '1px solid rgba(124, 58, 237, 0.08)',
                    }}
                  />

                  {/* Territory token centered in the click area */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <TerritoryToken
                      x={0}
                      y={0}
                      armies={territory.armies}
                      color={continent?.color || '#808080'} // Gray for unassigned
                      outlineColor={continent?.color} // Continent color for outline
                      shape={tokenShape}
                      isSelected={state.selectedTerritoryId === territory.id}
                      isDragging={state.draggedTerritoryId === territory.id}
                      size={tokenSize}
                      opacity={0.7}
                    />
                  </div>
                  {editorMode === 'capitals' && getCapitalForTerritory(territory.id) && (
                    <div className="absolute -top-3 -right-3 text-lg">
                      <span className="bg-yellow-500 text-black rounded-full px-1.5 py-0.5 text-xs font-bold">
                        {getCapitalForTerritory(territory.id)}
                      </span>
                    </div>
                  )}
                  {/* Territory name label */}
                  {territory.name && state.labelSettings?.showLabels && (
                    <div
                      className="absolute left-1/2 transform -translate-x-1/2 whitespace-nowrap z-10 pointer-events-none"
                      style={{
                        top: '100%',
                        marginTop: '4px',
                        fontSize: `${state.labelSettings?.fontSize || 14}px`,
                        fontFamily: state.labelSettings?.fontFamily || 'Arial',
                        color: state.labelSettings?.textColor || '#000000',
                        ...(state.labelSettings?.showBackground && {
                          backgroundColor: state.labelSettings?.backgroundColor || '#ffffff',
                          opacity: state.labelSettings?.backgroundOpacity || 0.8,
                          padding: '2px 6px',
                          borderRadius: '3px',
                        }),
                        ...(state.selectedTerritoryId === territory.id && {
                          fontWeight: 'bold',
                          textDecoration: 'underline',
                        }),
                      }}
                    >
                      {territory.name}
                    </div>
                  )}
                </button>
              )
            })}

            {!state.imageUrl && !isDragOver && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  background:
                    'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 20px)',
                }}
              >
                <div className="text-center">
                  {/* Upload Error Display */}
                  {uploadError && (
                    <div className="mb-4 p-2 bg-red-900/50 border border-red-600 rounded text-red-300 text-sm max-w-md">
                      ❌ {uploadError}
                    </div>
                  )}
                  <div className="bg-black/40 backdrop-blur-sm p-6 rounded-lg">
                    <p className="text-muted mb-3">Drop an image here or</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-base rounded-lg"
                    >
                      <span className="text-lg">📤</span>
                      <span>Upload Map Image</span>
                    </button>
                    <div className="mt-4 text-xs text-muted space-y-1">
                      <p>
                        💡 Canvas: {state.mapWidth}×{state.mapHeight}px
                      </p>
                      <p>📏 Min: 400×300px | Max: 1600×1200px</p>
                      <p>✨ Supports PNG, JPG, GIF, WEBP, SVG</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isDragOver && (
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                <p className="text-2xl text-white">Drop image here</p>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Sidebar Panel - Now on the right */}
        <div
          className="w-80 bg-surface-2 border border-border rounded-lg p-4 flex-shrink-0 overflow-y-auto shadow-lg"
          style={{ height: 'calc(100vh - 240px)' }}
        >
          {renderSidebarContent()}
        </div>
      </div>

      {/* Hidden file input for images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      {/* Hidden file input for JSON import */}
      <input
        id={jsonImportId}
        type="file"
        accept="application/json,.json"
        onChange={handleImport}
        className="hidden"
      />
      {/* Image Processor Modal */}
      {showProcessor && tempImageUrl && (
        <ImageProcessor
          imageUrl={tempImageUrl}
          onComplete={(processedUrl, dimensions) => {
            setState((prev) => ({
              ...prev,
              imageUrl: processedUrl,
              imageWidth: dimensions.width,
              imageHeight: dimensions.height,
              mapWidth: dimensions.width,
              mapHeight: dimensions.height,
            }))
            setShowProcessor(false)
            setTempImageUrl(null)
          }}
          onCancel={() => {
            setShowProcessor(false)
            setTempImageUrl(null)
          }}
          maxWidth={2000}
          maxHeight={1500}
        />
      )}

      {/* Enhanced Cropper Modal */}
      {showCropper && state.imageUrl && (
        <ImageCropperEnhanced
          imageUrl={state.imageUrl}
          targetWidth={state.mapWidth}
          targetHeight={state.mapHeight}
          onCrop={(croppedUrl) => {
            setState((prev) => ({
              ...prev,
              imageUrl: croppedUrl,
              imageWidth: state.mapWidth,
              imageHeight: state.mapHeight,
              imageScale: 1,
            }))
            setShowCropper(false)
          }}
          onCancel={() => setShowCropper(false)}
        />
      )}
    </div>
  )
}
