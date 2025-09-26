import axios from 'axios'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'
import ImageCropperEnhanced from '../components/ImageCropperEnhanced'
import ImageProcessor from '../components/ImageProcessor'
import TerritoryToken from '../components/TerritoryToken'
import { PLAYER_COLORS } from '../constants/colors'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import api from '../services/api'
import mapWorkflowApi, {
  type DraftImagePayload,
  type MapDraftPayload,
  type MapDraftResponse,
} from '../services/mapWorkflowService'
import { generateCapitalAssignments } from '../utils/capitalGenerator'

function computeMapSizeCategory(
  count: number,
): 'Small' | 'Medium' | 'Large' | 'Very Large' | 'Massive' {
  if (!Number.isFinite(count) || count <= 0) return 'Small'
  if (count <= 35) return 'Small'
  if (count <= 45) return 'Medium'
  if (count <= 65) return 'Large'
  if (count <= 90) return 'Very Large'
  return 'Massive'
}

interface Territory {
  id: string
  name: string
  x: number
  y: number
  normalizedX?: number
  normalizedY?: number
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

interface TerritoryModifierConfig {
  templateId?: string
  name: string
  icon: string
  color: string
  defenseBonus: number
  attackBonus: number
  troopBonus: number
  movementRestriction: boolean
  supplyLineBonus: boolean
  notes?: string
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
  territoryModifiers: Record<string, TerritoryModifierConfig>
  selectedTerritoryId: string | null
  draggedTerritoryId: string | null
  mapWidth: number
  mapHeight: number
  imageWidth: number // Actual image dimensions
  imageHeight: number
  imageScale: number // Scale factor for resizing image
  labelSettings?: LabelSettings // Label customization settings
}

type EditorMode =
  | 'properties'
  | 'image'
  | 'territories'
  | 'continents'
  | 'connections'
  | 'capitals'
  | 'modifiers'
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
  territoryModifiers?: Record<string, unknown>
}

interface LegacyTerritoryRecord {
  id?: string
  name?: string
  center_x?: number
  center_y?: number
  continent?: string
  metadata?: unknown
  polygon_data?: unknown
  army_position?: unknown
  normalized_x?: number
  normalized_y?: number
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

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  return fallback
}

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

interface TerritorySpatialIndex {
  cellSize: number
  minDistance: number
  cells: Map<string, Territory[]>
}

const getTerritoryCellKey = (x: number, y: number, cellSize: number): string => {
  if (cellSize <= 0) return '0:0'
  const cellX = Math.floor(x / cellSize)
  const cellY = Math.floor(y / cellSize)
  return `${cellX}:${cellY}`
}

const buildTerritorySpatialIndex = (
  territories: Territory[],
  tokenSize: number,
): TerritorySpatialIndex => {
  const clickPadding = tokenSize * 0.25
  const minDistance = tokenSize + clickPadding * 2
  const cellSize = Math.max(minDistance, 1)

  const cells = new Map<string, Territory[]>()

  for (const territory of territories) {
    const key = getTerritoryCellKey(territory.x, territory.y, cellSize)
    const bucket = cells.get(key)
    if (bucket) {
      bucket.push(territory)
    } else {
      cells.set(key, [territory])
    }
  }

  return { cellSize, minDistance, cells }
}

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const withNormalizedPosition = (
  territory: Territory,
  mapWidth: number,
  mapHeight: number,
): Territory => {
  const width = mapWidth > 0 ? mapWidth : 1
  const height = mapHeight > 0 ? mapHeight : 1

  const normalizedX =
    territory.normalizedX !== undefined
      ? clamp01(territory.normalizedX)
      : clamp01(territory.x / width)

  const normalizedY =
    territory.normalizedY !== undefined
      ? clamp01(territory.normalizedY)
      : clamp01(territory.y / height)

  return {
    ...territory,
    normalizedX,
    normalizedY,
    x: clamp01(normalizedX) * width,
    y: clamp01(normalizedY) * height,
  }
}

const normalizeTerritoryModifierEntry = (
  value: Record<string, unknown>,
): TerritoryModifierConfig => ({
  templateId: isString(value.templateId)
    ? value.templateId
    : isString(value.template_id)
      ? value.template_id
      : undefined,
  name: isString(value.name) && value.name.trim() ? value.name.trim() : 'Strategic Territory',
  icon: isString(value.icon) && value.icon.trim() ? value.icon.trim() : '✨',
  color: isString(value.color) && value.color.trim() ? value.color.trim() : '#a855f7',
  defenseBonus: toNumber(value.defenseBonus ?? value.defense_bonus, 0),
  attackBonus: toNumber(value.attackBonus ?? value.attack_bonus, 0),
  troopBonus: toNumber(
    value.troopBonus ?? value.troop_generation_bonus ?? value.troopGenerationBonus,
    0,
  ),
  movementRestriction: toBoolean(
    value.movementRestriction ?? value.movement_restriction ?? value.movementrestriction,
    false,
  ),
  supplyLineBonus: toBoolean(
    value.supplyLineBonus ?? value.supply_line_bonus ?? value.supplylinebonus,
    false,
  ),
  notes: isString(value.notes) ? value.notes : undefined,
})

const normalizeTerritoryModifiers = (input: unknown): Record<string, TerritoryModifierConfig> => {
  if (typeof input !== 'object' || input === null) return {}

  const entries = Object.entries(input as Record<string, unknown>)
  const result: Record<string, TerritoryModifierConfig> = {}

  for (const [territoryId, rawValue] of entries) {
    if (typeof rawValue !== 'object' || rawValue === null) continue
    const normalizedId = territoryId.trim()
    if (!normalizedId) continue
    result[normalizedId] = normalizeTerritoryModifierEntry(rawValue as Record<string, unknown>)
  }

  return result
}

const createDefaultModifier = (): TerritoryModifierConfig => ({
  templateId: undefined,
  name: 'Strategic Territory',
  icon: '✨',
  color: '#a855f7',
  defenseBonus: 0,
  attackBonus: 0,
  troopBonus: 0,
  movementRestriction: false,
  supplyLineBonus: false,
  notes: undefined,
})

const parseOptionalRecord = (value: unknown): Record<string, unknown> | null => {
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

const normalizeTerritoryRecord = (record: LegacyTerritoryRecord): Territory => {
  const metadata = parseOptionalRecord(record.metadata)
  const polygonData = parseOptionalRecord(record.polygon_data)
  const armyPosition = parseOptionalRecord(record.army_position)

  const normalizedXCandidate =
    toFiniteNumberOrNull(record.normalized_x) ??
    toFiniteNumberOrNull((metadata?.armyPositionNormalized as { x?: unknown } | undefined)?.x) ??
    toFiniteNumberOrNull((polygonData?.armyPositionNormalized as { x?: unknown } | undefined)?.x) ??
    toFiniteNumberOrNull((armyPosition?.armyPositionNormalized as { x?: unknown } | undefined)?.x)

  const normalizedYCandidate =
    toFiniteNumberOrNull(record.normalized_y) ??
    toFiniteNumberOrNull((metadata?.armyPositionNormalized as { y?: unknown } | undefined)?.y) ??
    toFiniteNumberOrNull((polygonData?.armyPositionNormalized as { y?: unknown } | undefined)?.y) ??
    toFiniteNumberOrNull((armyPosition?.armyPositionNormalized as { y?: unknown } | undefined)?.y)

  const pixelX =
    toFiniteNumberOrNull(record.center_x) ??
    toFiniteNumberOrNull((metadata?.armyPosition as { x?: unknown } | undefined)?.x) ??
    toFiniteNumberOrNull((polygonData?.armyPosition as { x?: unknown } | undefined)?.x) ??
    toFiniteNumberOrNull((armyPosition?.armyPosition as { x?: unknown } | undefined)?.x) ??
    toFiniteNumberOrNull(metadata?.x) ??
    0

  const pixelY =
    toFiniteNumberOrNull(record.center_y) ??
    toFiniteNumberOrNull((metadata?.armyPosition as { y?: unknown } | undefined)?.y) ??
    toFiniteNumberOrNull((polygonData?.armyPosition as { y?: unknown } | undefined)?.y) ??
    toFiniteNumberOrNull((armyPosition?.armyPosition as { y?: unknown } | undefined)?.y) ??
    toFiniteNumberOrNull(metadata?.y) ??
    0

  return {
    id: record.id || uuidv4(),
    name: record.name ?? 'Unnamed Territory',
    x: Number.isFinite(pixelX) ? pixelX : 0,
    y: Number.isFinite(pixelY) ? pixelY : 0,
    normalizedX: normalizedXCandidate !== null ? clamp01(normalizedXCandidate) : undefined,
    normalizedY: normalizedYCandidate !== null ? clamp01(normalizedYCandidate) : undefined,
    continentId: record.continent ?? null,
    armies: 1,
    connections: [] as string[],
  }
}

const normalizeTerritory = (input: unknown): Territory | null => {
  if (typeof input !== 'object' || input === null) {
    return null
  }

  const territory = input as Record<string, unknown>
  const id = isString(territory.id) ? territory.id : uuidv4()
  const name = isString(territory.name) ? territory.name : 'Unnamed Territory'
  const armyPosition = parseOptionalRecord(territory.armyPosition)
  const armyPositionNormalized = parseOptionalRecord(territory.armyPositionNormalized)
  const normalizedXCandidate =
    toFiniteNumberOrNull(territory.normalizedX) ??
    toFiniteNumberOrNull((armyPositionNormalized as { x?: unknown } | undefined)?.x) ??
    toFiniteNumberOrNull(
      (armyPositionNormalized as { normalizedX?: unknown } | undefined)?.normalizedX,
    )
  const normalizedYCandidate =
    toFiniteNumberOrNull(territory.normalizedY) ??
    toFiniteNumberOrNull((armyPositionNormalized as { y?: unknown } | undefined)?.y) ??
    toFiniteNumberOrNull(
      (armyPositionNormalized as { normalizedY?: unknown } | undefined)?.normalizedY,
    )

  const x = isNumber(territory.x)
    ? territory.x
    : (toFiniteNumberOrNull((armyPosition as { x?: unknown } | undefined)?.x) ?? 0)
  const y = isNumber(territory.y)
    ? territory.y
    : (toFiniteNumberOrNull((armyPosition as { y?: unknown } | undefined)?.y) ?? 0)
  const continentId = isString(territory.continentId) ? territory.continentId : null
  const armies = isNumber(territory.armies) ? territory.armies : 1
  const isCapital = typeof territory.isCapital === 'boolean' ? territory.isCapital : false
  const connections = toStringArray(territory.connections)

  return {
    id,
    name,
    x,
    y,
    normalizedX: normalizedXCandidate !== null ? clamp01(normalizedXCandidate) : undefined,
    normalizedY: normalizedYCandidate !== null ? clamp01(normalizedYCandidate) : undefined,
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

const UNASSIGNED_CONTINENT_KEY = '__unassigned__'

export default function MapEditorTokens() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragUpdateFrameRef = useRef<number | null>(null)
  const pendingDragPositionRef = useRef<{ x: number; y: number } | null>(null)
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
    territoryModifiers: {},
    selectedTerritoryId: null,
    draggedTerritoryId: null,
    mapWidth: 1920, // Default to full HD
    mapHeight: 1080,
    imageWidth: 800, // Default image dimensions
    imageHeight: 600,
    imageScale: 1, // Default scale
    labelSettings: { ...DEFAULT_LABEL_SETTINGS },
  })

  const polygonEditorEnabled = useFeatureFlag(FEATURE_FLAGS.MAP_POLYGON_EDITOR)
  const territoryModifiersEnabled = useFeatureFlag(FEATURE_FLAGS.TERRITORY_MODIFIERS)
  const [selectedModifierTerritoryId, setSelectedModifierTerritoryId] = useState<string | null>(
    null,
  )
  const [modifierDraft, setModifierDraft] = useState<TerritoryModifierConfig>(
    createDefaultModifier(),
  )
  const [modifierAlert, setModifierAlert] = useState<{
    type: 'success' | 'info' | 'warning'
    message: string
  } | null>(null)

  const updateModifierDraft = useCallback((updates: Partial<TerritoryModifierConfig>) => {
    setModifierDraft((prev) => ({
      ...prev,
      ...updates,
    }))
  }, [])

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
  // Deprecated: replace recommended players with auto map size category
  const capitalPlayerCountId = useId()
  const placementContinentSelectId = useId()
  const continentColorInputId = useId()
  const continentBonusInputId = useId()
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
  const modifierTerritorySelectId = useId()
  const modifierNameId = useId()
  const modifierIconId = useId()
  const modifierColorId = useId()
  const modifierDefenseId = useId()
  const modifierAttackId = useId()
  const modifierTroopsId = useId()
  const modifierNotesId = useId()
  useEffect(() => {
    if (!modifierAlert) return
    if (typeof window === 'undefined') return

    const timeoutId = window.setTimeout(() => {
      setModifierAlert(null)
    }, 4000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [modifierAlert])
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
      territories: prev.territories.map((territory) =>
        withNormalizedPosition(territory, preset.width, preset.height),
      ),
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
        territories: prev.territories.map((territory) =>
          withNormalizedPosition(territory, nextWidth, nextHeight),
        ),
      }
    })
  }
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [selectedContinentId, setSelectedContinentId] = useState<string | null>(null)
  const [isPlacingTerritory, setIsPlacingTerritory] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('properties')
  const [expandedContinentGroups, setExpandedContinentGroups] = useState<Record<string, boolean>>(
    {},
  )

  const continentOptions = useMemo(
    () =>
      state.continents.map((continent) => ({
        value: continent.id,
        label: continent.name,
        color: continent.color,
      })),
    [state.continents],
  )

  const territoriesByContinent = useMemo(() => {
    const groups = new Map<
      string,
      {
        continent: Continent | null
        territories: Territory[]
      }
    >()

    state.continents.forEach((continent) => {
      groups.set(continent.id, {
        continent,
        territories: [],
      })
    })

    groups.set(UNASSIGNED_CONTINENT_KEY, {
      continent: null,
      territories: [],
    })

    state.territories.forEach((territory) => {
      const groupKey =
        territory.continentId && groups.has(territory.continentId)
          ? territory.continentId
          : UNASSIGNED_CONTINENT_KEY
      groups.get(groupKey)?.territories.push(territory)
    })

    const orderedKeys = [
      ...state.continents.map((continent) => continent.id),
      UNASSIGNED_CONTINENT_KEY,
    ]

    return orderedKeys
      .filter((key) => groups.has(key))
      .map((key) => ({
        key,
        continent: groups.get(key)?.continent ?? null,
        territories: groups.get(key)?.territories ?? [],
      }))
  }, [state.continents, state.territories])

  const toggleContinentExpanded = useCallback((groupKey: string) => {
    setExpandedContinentGroups((prev) => ({
      ...prev,
      [groupKey]: !(prev[groupKey] ?? true),
    }))
  }, [])

  const handleTerritoryContinentChange = useCallback(
    (territoryId: string, continentId: string | null) => {
      setState((prev) => ({
        ...prev,
        territories: prev.territories.map((territory) =>
          territory.id === territoryId ? { ...territory, continentId } : territory,
        ),
      }))

      setSelectedContinentId(continentId)
    },
    [],
  )

  const updateContinentBonus = useCallback((continentId: string, bonus: number) => {
    const normalizedBonus = Number.isFinite(bonus) ? Math.max(0, Math.round(bonus)) : 0
    setState((prev) => ({
      ...prev,
      continents: prev.continents.map((continent) =>
        continent.id === continentId ? { ...continent, bonus: normalizedBonus } : continent,
      ),
    }))
  }, [])

  useEffect(() => {
    if (!territoryModifiersEnabled && editorMode === 'modifiers') {
      setEditorMode('capitals')
    }
  }, [territoryModifiersEnabled, editorMode])

  useEffect(() => {
    if (!territoryModifiersEnabled) {
      if (selectedModifierTerritoryId !== null) {
        setSelectedModifierTerritoryId(null)
        setModifierDraft(createDefaultModifier())
      }
      if (modifierAlert) {
        setModifierAlert(null)
      }
      return
    }

    if (
      selectedModifierTerritoryId &&
      state.territories.some((territory) => territory.id === selectedModifierTerritoryId)
    ) {
      return
    }

    const firstTerritory = state.territories[0]
    setSelectedModifierTerritoryId(firstTerritory ? firstTerritory.id : null)
  }, [territoryModifiersEnabled, state.territories, selectedModifierTerritoryId, modifierAlert])

  useEffect(() => {
    if (!territoryModifiersEnabled) {
      return
    }

    if (!selectedModifierTerritoryId) {
      setModifierDraft(createDefaultModifier())
      return
    }

    const existing = state.territoryModifiers[selectedModifierTerritoryId]
    setModifierDraft(existing ? { ...existing } : createDefaultModifier())
  }, [territoryModifiersEnabled, selectedModifierTerritoryId, state.territoryModifiers])

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
  const territorySpatialIndex = useMemo(
    () => buildTerritorySpatialIndex(state.territories, tokenSize),
    [state.territories, tokenSize],
  )
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

  const handleDeleteTerritory = useCallback((territoryId: string) => {
    setState((prev) => {
      if (!prev.territories.some((territory) => territory.id === territoryId)) {
        return prev
      }

      const { [territoryId]: _removedModifier, ...remainingModifiers } = prev.territoryModifiers

      return {
        ...prev,
        territories: prev.territories.filter((territory) => territory.id !== territoryId),
        territoryModifiers: remainingModifiers,
        selectedTerritoryId:
          prev.selectedTerritoryId === territoryId ? null : prev.selectedTerritoryId,
      }
    })

    setCapitalAssignments((prev) => {
      const updated: CapitalAssignments = {}
      Object.entries(prev).forEach(([playerCount, assignments]) => {
        updated[playerCount] = assignments.filter((id) => id !== territoryId)
      })
      return updated
    })
  }, [])

  const selectedModifierTerritory = useMemo(() => {
    if (!selectedModifierTerritoryId) return null
    return (
      state.territories.find((territory) => territory.id === selectedModifierTerritoryId) ?? null
    )
  }, [selectedModifierTerritoryId, state.territories])

  const savedModifierForSelectedTerritory = useMemo(() => {
    if (!selectedModifierTerritoryId) return undefined
    return state.territoryModifiers[selectedModifierTerritoryId]
  }, [selectedModifierTerritoryId, state.territoryModifiers])

  const modifierFormDisabled = !selectedModifierTerritory

  // Auto-save to localStorage
  const saveToLocalStorage = useCallback(() => {
    try {
      const territoriesForSave = state.territories.map((territory) =>
        withNormalizedPosition(territory, state.mapWidth, state.mapHeight),
      )

      const dataToSave = {
        state: {
          ...state,
          territories: territoriesForSave,
        },
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
        const savedState = (typeof data.state === 'object' && data.state !== null
          ? (data.state as Partial<MapState>)
          : null) ?? { territories: [] }

        setState((prev) => {
          const nextMapWidth =
            typeof savedState.mapWidth === 'number' && savedState.mapWidth > 0
              ? savedState.mapWidth
              : prev.mapWidth
          const nextMapHeight =
            typeof savedState.mapHeight === 'number' && savedState.mapHeight > 0
              ? savedState.mapHeight
              : prev.mapHeight

          const nextTerritories = Array.isArray(savedState.territories)
            ? savedState.territories.map((territory) =>
                withNormalizedPosition(territory as Territory, nextMapWidth, nextMapHeight),
              )
            : prev.territories

          return {
            ...prev,
            ...savedState,
            mapWidth: nextMapWidth,
            mapHeight: nextMapHeight,
            territories: nextTerritories,
            territoryModifiers:
              (savedState.territoryModifiers as MapState['territoryModifiers']) ??
              prev.territoryModifiers ??
              {},
          }
        })
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

      const territoryModifiers = normalizeTerritoryModifiers(
        (map.metadata as { territoryModifiers?: unknown })?.territoryModifiers ??
          (map.metadata as { territory_modifiers?: unknown })?.territory_modifiers,
      )

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

        const normalizedTerritories = territories.map((territory) =>
          withNormalizedPosition(territory, mapWidth, mapHeight),
        )

        return {
          ...prev,
          name: isString(map.name) ? map.name : prev.name,
          description: isString(map.description) ? map.description : '',
          minPlayers,
          maxPlayers,
          imageUrl,
          territories: normalizedTerritories,
          continents,
          mapWidth,
          mapHeight,
          territoryModifiers,
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
      const rawDraftModifiers =
        draftData.territoryModifiers ??
        draftData.territory_modifiers ??
        (draft as unknown as { territoryModifiers?: unknown }).territoryModifiers
      const territoryModifiers = normalizeTerritoryModifiers(rawDraftModifiers)
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

      setState((prev) => {
        const mapWidth =
          typeof draftData.width === 'number' ? draftData.width : draft.imageWidth || prev.mapWidth

        const mapHeight =
          typeof draftData.height === 'number'
            ? draftData.height
            : draft.imageHeight || prev.mapHeight

        const normalizedTerritories = territories.map((territory) =>
          withNormalizedPosition(territory, mapWidth, mapHeight),
        )

        return {
          ...prev,
          name: draft.name ?? prev.name,
          description: draft.description || '',
          minPlayers:
            typeof draftData.minPlayers === 'number' ? draftData.minPlayers : prev.minPlayers,
          maxPlayers:
            typeof draftData.maxPlayers === 'number' ? draftData.maxPlayers : prev.maxPlayers,
          mapWidth,
          mapHeight,
          imageWidth: draft.imageWidth || prev.imageWidth,
          imageHeight: draft.imageHeight || prev.imageHeight,
          imageUrl: imageUrl || prev.imageUrl,
          territories: normalizedTerritories,
          continents,
          territoryModifiers,
        }
      })

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
        setState((prev) => {
          const mapWidth = Math.min(finalWidth, MAX_WIDTH)
          const mapHeight = Math.min(finalHeight, MAX_HEIGHT)
          return {
            ...prev,
            imageUrl: dataUrl,
            imageWidth: img.width,
            imageHeight: img.height,
            mapWidth,
            mapHeight,
            territories: prev.territories.map((territory) =>
              withNormalizedPosition(territory, mapWidth, mapHeight),
            ),
          }
        })

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
      const { cells, cellSize, minDistance } = territorySpatialIndex
      const minDistanceSq = minDistance * minDistance
      const baseCellX = cellSize > 0 ? Math.floor(x / cellSize) : 0
      const baseCellY = cellSize > 0 ? Math.floor(y / cellSize) : 0

      let tooClose = false

      for (let dx = -1; dx <= 1 && !tooClose; dx += 1) {
        for (let dy = -1; dy <= 1 && !tooClose; dy += 1) {
          const bucket = cells.get(`${baseCellX + dx}:${baseCellY + dy}`)
          if (!bucket) continue

          for (const territory of bucket) {
            const deltaX = territory.x - x
            const deltaY = territory.y - y
            if (deltaX * deltaX + deltaY * deltaY < minDistanceSq) {
              tooClose = true
              break
            }
          }
        }
      }

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
        normalizedX: clamp01(x / (state.mapWidth > 0 ? state.mapWidth : 1)),
        normalizedY: clamp01(y / (state.mapHeight > 0 ? state.mapHeight : 1)),
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

  const applyDragUpdate = useCallback(() => {
    dragUpdateFrameRef.current = null
    const pending = pendingDragPositionRef.current

    if (!pending) return

    pendingDragPositionRef.current = null

    setState((prev) => {
      const draggedId = prev.draggedTerritoryId
      if (!draggedId) return prev

      const territoryIndex = prev.territories.findIndex((t) => t.id === draggedId)
      if (territoryIndex === -1) return prev

      const current = prev.territories[territoryIndex]
      if (current.x === pending.x && current.y === pending.y) {
        return prev
      }

      const territories = [...prev.territories]
      territories[territoryIndex] = {
        ...current,
        x: pending.x,
        y: pending.y,
        normalizedX: clamp01(pending.x / (prev.mapWidth > 0 ? prev.mapWidth : 1)),
        normalizedY: clamp01(pending.y / (prev.mapHeight > 0 ? prev.mapHeight : 1)),
      }

      return { ...prev, territories }
    })
  }, [])

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

      pendingDragPositionRef.current = { x, y }

      if (dragUpdateFrameRef.current === null) {
        dragUpdateFrameRef.current = requestAnimationFrame(applyDragUpdate)
      }
    },
    [state.draggedTerritoryId, state.mapWidth, state.mapHeight, dragOffset, applyDragUpdate],
  )

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    if (dragUpdateFrameRef.current !== null) {
      cancelAnimationFrame(dragUpdateFrameRef.current)
      dragUpdateFrameRef.current = null
    }
    pendingDragPositionRef.current = null
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

  useEffect(() => {
    return () => {
      if (dragUpdateFrameRef.current !== null) {
        cancelAnimationFrame(dragUpdateFrameRef.current)
        dragUpdateFrameRef.current = null
      }
      pendingDragPositionRef.current = null
    }
  }, [])

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
    setNewContinentColor('#3B82F6')
    setNewContinentBonus(3)
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

      const territoriesForSave = state.territories.map((territory) =>
        withNormalizedPosition(territory, state.mapWidth, state.mapHeight),
      )

      const adjacencyList = territoriesForSave.flatMap((territory) =>
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
          territoryModifiers: state.territoryModifiers,
        },
        territories: territoriesForSave,
        continents: state.continents,
        adjacencies: adjacencyList,
        capitalAssignments,
        imageUrl: imageBase64 ? undefined : state.imageUrl,
        imageWidth: state.imageWidth,
        imageHeight: state.imageHeight,
        tags: [],
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
    const territoriesForExport = state.territories.map((territory) =>
      withNormalizedPosition(territory, state.mapWidth, state.mapHeight),
    )
    const mapData = {
      name: state.name,
      imageUrl: state.imageUrl,
      width: state.mapWidth,
      height: state.mapHeight,
      territories: territoriesForExport,
      continents: state.continents,
      territoryModifiers: state.territoryModifiers,
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

        const importWidth = isNumber(mapData.width) ? mapData.width : state.mapWidth
        const importHeight = isNumber(mapData.height) ? mapData.height : state.mapHeight
        const normalizedTerritories: Territory[] = mapData.territories.map((territory) => {
          const pixelX = territory.x ?? 0
          const pixelY = territory.y ?? 0
          return {
            id: territory.id,
            name: territory.name || `Territory ${territory.id}`,
            x: pixelX,
            y: pixelY,
            normalizedX: clamp01(pixelX / (importWidth > 0 ? importWidth : 1)),
            normalizedY: clamp01(pixelY / (importHeight > 0 ? importHeight : 1)),
            armies: territory.armies ?? 1,
            connections: territory.connections ?? [],
            continentId: territory.continentId ?? null,
          }
        })

        const importedModifiers = normalizeTerritoryModifiers(mapData.territoryModifiers)

        // Load the imported map data
        setState((prev) => {
          const mapWidth = mapData.width ?? prev.mapWidth
          const mapHeight = mapData.height ?? prev.mapHeight
          return {
            ...prev,
            name: mapData.name || 'Imported Map',
            imageUrl: mapData.imageUrl || prev.imageUrl,
            mapWidth,
            mapHeight,
            imageWidth: mapData.width ?? prev.imageWidth,
            imageHeight: mapData.height ?? prev.imageHeight,
            territories: normalizedTerritories.map((territory) =>
              withNormalizedPosition(territory, mapWidth, mapHeight),
            ),
            continents: mapData.continents || [],
            territoryModifiers: importedModifiers,
            selectedTerritoryId: null,
            draggedTerritoryId: null,
          }
        })

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
      const territories = state.territories.map((t) => ({
        id: t.id,
        name: t.name,
        connections: Array.isArray(t.connections) ? t.connections : [],
      }))

      const { assignments, generatedCounts, skippedCounts, warnings } = generateCapitalAssignments(
        territories,
        state.minPlayers,
        state.maxPlayers,
      )

      if (Object.keys(assignments).length === 0) {
        alert(
          warnings[0] ||
            'Unable to auto-generate capitals. Please check territory connections and counts.',
        )
        return
      }

      setCapitalAssignments(assignments)
      setCapitalMetadata({
        generatedAt: new Date().toISOString(),
        algorithm: 'client-maximin-distance-v1',
        manuallyAdjusted: {},
      })

      const summary = [
        generatedCounts.length
          ? `Generated for players: ${generatedCounts.join(', ')}`
          : 'Generated assignments created.',
        skippedCounts.length ? `Skipped: ${skippedCounts.join(', ')}` : '',
        warnings.length ? `Warnings: ${warnings.join(' | ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      // Provide a concise summary without blocking further edits
      if (summary) {
        alert(summary)
      }
    } catch (error) {
      reportError('Failed to generate capitals:', error)
      alert('Failed to generate capitals. Please try again.')
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

  const handleSaveModifier = useCallback(() => {
    if (!territoryModifiersEnabled || !selectedModifierTerritoryId) {
      alert('Select a territory to configure its modifier.')
      return
    }

    const territory = state.territories.find((t) => t.id === selectedModifierTerritoryId)
    if (!territory) {
      alert('Please choose a valid territory before saving.')
      return
    }

    const sanitizedNotes = modifierDraft.notes?.trim() ? modifierDraft.notes.trim() : undefined

    setState((prev) => ({
      ...prev,
      territoryModifiers: {
        ...prev.territoryModifiers,
        [selectedModifierTerritoryId]: {
          ...modifierDraft,
          notes: sanitizedNotes,
        },
      },
    }))

    setModifierAlert({
      type: 'success',
      message: `Saved modifier for ${territory.name}`,
    })
  }, [territoryModifiersEnabled, selectedModifierTerritoryId, state.territories, modifierDraft])

  const handleClearModifier = useCallback(() => {
    if (!territoryModifiersEnabled || !selectedModifierTerritoryId) {
      return
    }

    const territory = state.territories.find((t) => t.id === selectedModifierTerritoryId)

    setState((prev) => {
      if (!prev.territoryModifiers[selectedModifierTerritoryId]) {
        return prev
      }
      const { [selectedModifierTerritoryId]: _removed, ...rest } = prev.territoryModifiers
      return {
        ...prev,
        territoryModifiers: rest,
      }
    })

    setModifierDraft(createDefaultModifier())

    if (territory) {
      setModifierAlert({
        type: 'info',
        message: `Removed modifier from ${territory.name}`,
      })
    }
  }, [territoryModifiersEnabled, selectedModifierTerritoryId, state.territories])

  // Render sidebar content based on current tab
  const renderSidebarContent = () => {
    switch (editorMode) {
      case 'properties':
        return (
          <>
            <h2 className="text-xl font-bold mb-4">📋 Map Properties</h2>
            {/* Validation Checklist (moved to top) */}
            <div className="mb-4 p-3 bg-surface-1 rounded border border-border">
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
              <div className="text-sm mb-1">Map Size</div>
              <div className="rounded border border-border bg-surface-1 px-3 py-2 text-white flex items-center justify-between">
                <span>{computeMapSizeCategory(state.territories.length)} </span>
                <span className="text-muted text-xs">{state.territories.length} territories</span>
              </div>
            </div>
            {/* Image options consolidated under Properties */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full btn-primary inline-flex items-center justify-center gap-2 text-base mb-4"
              >
                <span className="text-lg">📤</span>
                <span>Upload Map Image</span>
              </button>

              {/* Canvas Size Settings */}
              <div className="p-3 bg-surface-1 rounded border border-border">
                <h3 className="text-sm font-bold mb-3">📐 Canvas Size</h3>
                <p className="text-xs text-muted leading-relaxed mb-3">
                  The canvas is the playable surface that tokens and interactions use. Background
                  images scale to fit whatever canvas you choose during matches, so pick a preset
                  that matches how detailed you want the battlefield to feel.
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
                      <label
                        htmlFor={customCanvasWidthId}
                        className="block text-xs text-muted mb-1"
                      >
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
                      <label
                        htmlFor={customCanvasHeightId}
                        className="block text-xs text-muted mb-1"
                      >
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
                    <div className="flex flex-wrap items-center justify-between rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
                      <span>Preset: {canvasSelection}</span>
                      <span>
                        Ratio:{' '}
                        {state.mapWidth && state.mapHeight
                          ? (state.mapWidth / state.mapHeight).toFixed(2)
                          : 0}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {state.imageUrl && (
                <div className="mt-4 p-3 bg-surface-1 rounded border border-border">
                  <h3 className="text-sm font-bold mb-2">Current Image</h3>
                  <div className="text-xs text-muted space-y-1">
                    <div>Width: {state.imageWidth}px</div>
                    <div>Height: {state.imageHeight}px</div>
                    <div>Scale: {(state.imageScale * 100).toFixed(0)}%</div>
                  </div>
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
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCropper(true)}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded"
                      title="Crop the image to specific dimensions"
                    >
                      ✂️ Crop
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowProcessor(true)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                      title="Compress and optimize image for web use (reduces file size)"
                    >
                      🎨 Process
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Remove the background image?')) {
                          setState((prev) => ({ ...prev, imageUrl: undefined }))
                        }
                      }}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded"
                    >
                      🗑️ Clear
                    </button>
                  </div>
                </div>
              )}
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

            {/* End Properties */}
          </>
        )

      case 'territories':
        return (
          <>
            <h2 className="text-xl font-bold mb-4">🗺️ Territory Controls</h2>

            <div className="mb-6 space-y-3">
              <div className="rounded border border-border bg-surface-1 p-3">
                <h3 className="text-sm font-bold mb-3">Placement</h3>
                <label
                  htmlFor={placementContinentSelectId}
                  className="text-xs text-muted mb-2 block uppercase tracking-wide"
                >
                  Assign new territories to
                </label>
                <select
                  id={placementContinentSelectId}
                  value={selectedContinentId || ''}
                  onChange={(e) => setSelectedContinentId(e.target.value || null)}
                  className="w-full rounded border border-border bg-surface-1 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <option value="">No Continent (Unassigned)</option>
                  {state.continents.map((continent) => (
                    <option key={continent.id} value={continent.id}>
                      {continent.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsPlacingTerritory((prev) => !prev)}
                  className={`mt-3 w-full rounded px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    isPlacingTerritory
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-primary text-white hover:brightness-110'
                  }`}
                >
                  {isPlacingTerritory
                    ? '✅ Click the canvas to place territories'
                    : '➕ Enable territory placement'}
                </button>
                <p className="mt-2 text-xs text-muted">
                  Choose a continent and enable placement, then click the canvas to drop tokens
                  where you need them.
                </p>
              </div>
            </div>

            {/* Continent Management (consolidated here) */}
            <div className="mb-6 rounded border border-border bg-surface-1 p-3">
              <h3 className="text-sm font-bold mb-3">
                {editingContinentId ? 'Update Continent' : 'Create Continent'}
              </h3>
              <input
                type="text"
                placeholder="Continent name"
                value={newContinentName}
                onChange={(e) => setNewContinentName(e.target.value)}
                className="w-full rounded border border-border bg-surface-1 px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted" htmlFor={continentColorInputId}>
                    Color
                  </label>
                  <input
                    id={continentColorInputId}
                    type="color"
                    value={newContinentColor}
                    onChange={(e) => setNewContinentColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-border bg-surface-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted" htmlFor={continentBonusInputId}>
                    Bonus
                  </label>
                  <input
                    id={continentBonusInputId}
                    type="number"
                    min={0}
                    max={12}
                    step={1}
                    value={newContinentBonus}
                    onChange={(e) => setNewContinentBonus(Number(e.target.value) || 0)}
                    className="w-20 rounded border border-border bg-surface-1 px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (editingContinentId) {
                      handleUpdateContinent(editingContinentId)
                    } else {
                      handleCreateContinent()
                    }
                  }}
                  disabled={!newContinentName.trim()}
                  className={`rounded px-4 py-2 text-sm font-medium transition ${
                    newContinentName.trim()
                      ? 'bg-primary text-white hover:brightness-110'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  {editingContinentId ? '💾 Save Changes' : '➕ Create Continent'}
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
                    className="rounded border border-border px-4 py-2 text-sm hover:border-primary"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {editingContinentId && (
                <p className="mt-2 text-xs text-muted">
                  Saving will update the selected continent in place. Cancel to keep the existing
                  values.
                </p>
              )}
            </div>

            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold">Territories by Continent</h3>
                <span className="text-xs text-muted">{state.territories.length} total</span>
              </div>
              <div className="space-y-3">
                {territoriesByContinent.map((group) => {
                  const continent = group.continent
                  const territoryCount = group.territories.length
                  if (!continent && territoryCount === 0) {
                    return null
                  }
                  const isExpanded = expandedContinentGroups[group.key] ?? true
                  const bonusInputId = `continent-inline-bonus-${group.key}`
                  const label = continent ? continent.name : 'Unassigned'

                  return (
                    <div key={group.key} className="rounded border border-border bg-surface-1 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleContinentExpanded(group.key)}
                            className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                            aria-label={isExpanded ? 'Collapse continent' : 'Expand continent'}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                          <span
                            className={`h-4 w-4 rounded ${continent ? '' : 'border border-dashed border-border'}`}
                            style={continent ? { backgroundColor: continent.color } : undefined}
                          />
                          <div>
                            <div className="font-medium">{label}</div>
                            <div className="text-xs text-muted">
                              {territoryCount === 1
                                ? '1 territory'
                                : `${territoryCount} territories`}
                            </div>
                          </div>
                        </div>
                        {continent ? (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <label htmlFor={bonusInputId} className="text-muted">
                              Bonus
                            </label>
                            <input
                              id={bonusInputId}
                              type="number"
                              min={0}
                              max={12}
                              step={1}
                              value={continent.bonus}
                              onChange={(e) =>
                                updateContinentBonus(continent.id, Number(e.target.value) || 0)
                              }
                              className="w-16 rounded border border-border bg-surface-1 px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setEditingContinentId(continent.id)
                                setNewContinentName(continent.name)
                                setNewContinentColor(continent.color)
                                setNewContinentBonus(continent.bonus)
                              }}
                              className="rounded border border-border px-2 py-1 text-xs hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete continent "${continent.name}"? Territories will become unassigned.`,
                                  )
                                ) {
                                  handleDeleteContinent(continent.id)
                                }
                              }}
                              className="rounded border border-red-600/60 px-2 py-1 text-xs text-red-300 hover:border-red-500 hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">
                            Assign ungrouped territories to keep bonuses accurate
                          </span>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="mt-3 space-y-2 border-t border-border pt-3">
                          {territoryCount === 0 ? (
                            <p className="rounded bg-surface-2/70 px-3 py-2 text-xs text-muted">
                              {continent
                                ? 'No territories assigned to this continent yet. Use the selects below to add some.'
                                : 'Any territories without a continent assignment will show here.'}
                            </p>
                          ) : (
                            group.territories.map((territory) => {
                              const isSelected = state.selectedTerritoryId === territory.id
                              return (
                                <div
                                  key={territory.id}
                                  className={`rounded border border-border bg-surface-2/60 p-3 transition-colors ${
                                    isSelected
                                      ? 'border-primary bg-primary/10'
                                      : 'hover:border-primary/70'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setState((prev) => ({
                                          ...prev,
                                          selectedTerritoryId: territory.id,
                                        }))
                                      }
                                      className="flex-1 text-left text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                                    >
                                      {territory.name}
                                    </button>
                                    <select
                                      value={territory.continentId ?? ''}
                                      onChange={(e) =>
                                        handleTerritoryContinentChange(
                                          territory.id,
                                          e.target.value ? e.target.value : null,
                                        )
                                      }
                                      className="w-36 rounded border border-border bg-surface-1 px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                                    >
                                      <option value="">Unassigned</option>
                                      {continentOptions.map((continentOption) => (
                                        <option
                                          key={continentOption.value}
                                          value={continentOption.value}
                                        >
                                          {continentOption.label}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTerritory(territory.id)}
                                      className="rounded border border-red-600/60 px-2 py-1 text-xs text-red-300 hover:border-red-500 hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                                      aria-label={`Delete ${territory.name}`}
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                  {isSelected && (
                                    <div className="mt-2 space-y-2">
                                      <label
                                        className="text-xs text-muted uppercase tracking-wide"
                                        htmlFor={`territory-name-${territory.id}`}
                                      >
                                        Display name
                                      </label>
                                      <input
                                        id={`territory-name-${territory.id}`}
                                        type="text"
                                        value={territory.name}
                                        onChange={(e) => {
                                          const nextName = e.target.value
                                          setState((prev) => ({
                                            ...prev,
                                            territories: prev.territories.map((t) =>
                                              t.id === territory.id ? { ...t, name: nextName } : t,
                                            ),
                                          }))
                                        }}
                                        className="w-full rounded border border-border bg-surface-1 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                                      />
                                      <p className="text-xs text-muted">
                                        Highlighted territories update live on the canvas.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mb-6 rounded border border-border bg-surface-1 p-3 space-y-3">
              <h3 className="text-sm font-bold">Token Display</h3>
              <div>
                <label htmlFor={tokenShapeId} className="mb-1 block text-sm text-muted">
                  Shape
                </label>
                <select
                  id={tokenShapeId}
                  value={tokenShape}
                  onChange={(e) => setTokenShape(e.target.value as TokenShape)}
                  className="w-full rounded border border-border bg-surface-1 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <option value="hexagon">⬡ Hexagon</option>
                  <option value="square">◼ Square</option>
                  <option value="circle">● Circle</option>
                </select>
              </div>

              <div>
                <label htmlFor={tokenSizeId} className="mb-1 block text-sm text-muted">
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
                onClick={() => setShowGrid((prev) => !prev)}
                className={`w-full rounded px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  showGrid
                    ? 'bg-primary text-white'
                    : 'border border-border bg-surface-1 hover:border-primary hover:bg-surface-2'
                }`}
              >
                ⊞ {showGrid ? 'Hide grid overlay' : 'Show grid overlay'}
              </button>
            </div>

            <div className="rounded border border-border bg-surface-1 p-3">
              <h3 className="text-sm font-bold mb-3">Labels</h3>

              <button
                type="button"
                onClick={() =>
                  updateLabelSettings((settings) => ({
                    ...settings,
                    showLabels: !settings.showLabels,
                  }))
                }
                className={`mb-2 flex w-full items-center justify-between rounded px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  state.labelSettings?.showLabels
                    ? 'bg-primary text-white'
                    : 'border border-border bg-surface-1 hover:border-primary hover:bg-surface-2'
                }`}
              >
                <span>🏷️ {state.labelSettings?.showLabels ? 'Hide labels' : 'Show labels'}</span>
                <span className="text-xs text-muted">
                  {state.labelSettings?.showLabels ? 'Visible' : 'Hidden'}
                </span>
              </button>

              {state.labelSettings?.showLabels && (
                <button
                  type="button"
                  onClick={() => setShowLabelSettings(true)}
                  className="flex w-full items-center justify-between rounded border border-border bg-surface-1 px-3 py-2 text-sm font-medium transition hover:border-primary hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <span>🎨 Customize label style</span>
                  <span className="text-xs text-muted">Fonts, colors, backgrounds</span>
                </button>
              )}
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
            <strong>Properties:</strong> Name your map, describe the gameplay style, see the auto
            map size (based on territory count), and manage your background image and canvas size.
            Drafts auto-save frequently so you can explore without losing progress.
          </span>
        )
      case 'territories':
        return (
          <span>
            <strong>Regions:</strong> Enable placement to add tokens, drag to reposition, and use
            the grouping panel to assign or edit continents and bonuses. Right-click or Delete
            removes tokens.
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
      case 'modifiers':
        return (
          <span>
            <strong>Modifiers Mode:</strong> Select a territory to define defensive, offensive, or
            reinforcement bonuses. These rules activate in matches when the territory modifiers
            feature flag is enabled.
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
          {polygonEditorEnabled && (
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
          )}
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
              onClick={() => setEditorMode('territories')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                editorMode === 'territories'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted hover:text-white'
              }`}
            >
              🗺️ Regions
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
            {territoryModifiersEnabled && (
              <button
                type="button"
                onClick={() => setEditorMode('modifiers')}
                className={`px-6 py-3 font-medium transition-colors relative ${
                  editorMode === 'modifiers'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted hover:text-white'
                }`}
              >
                ⚡ Modifiers
              </button>
            )}

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
                      territoryModifiers: {},
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

        {/* Capitals actions moved into sidebar; main-area duplication removed */}

        {editorMode === 'modifiers' && territoryModifiersEnabled && (
          <div className="mt-4 space-y-5">
            {!state.territories.length ? (
              <div className="p-4 bg-surface-2/60 border border-border rounded text-sm text-muted">
                Add territories before assigning modifiers. Once you have at least one territory,
                you can configure bespoke bonuses here.
              </div>
            ) : (
              <>
                {modifierAlert && (
                  <div
                    className={`p-2 rounded border text-xs transition-opacity ${
                      modifierAlert.type === 'success'
                        ? 'bg-green-600/20 border-green-500 text-green-200'
                        : modifierAlert.type === 'info'
                          ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                          : 'bg-yellow-600/20 border-yellow-500 text-yellow-100'
                    }`}
                  >
                    {modifierAlert.message}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm mb-1" htmlFor={modifierTerritorySelectId}>
                        Territory
                      </label>
                      <select
                        id={modifierTerritorySelectId}
                        value={selectedModifierTerritoryId ?? ''}
                        onChange={(e) => setSelectedModifierTerritoryId(e.target.value || null)}
                        className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary"
                      >
                        <option value="">Select a territory…</option>
                        {state.territories.map((territory) => (
                          <option key={territory.id} value={territory.id}>
                            {territory.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="p-3 bg-surface-2/60 border border-border rounded text-xs text-muted space-y-2">
                      <div className="flex items-center justify-between text-sm font-medium text-white">
                        <span>
                          <span className="mr-2">{modifierDraft.icon}</span>
                          {modifierDraft.name || 'Strategic Territory'}
                        </span>
                        <span
                          aria-hidden="true"
                          className="inline-block h-3 w-10 rounded"
                          style={{ backgroundColor: modifierDraft.color }}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span>
                          🛡️ Defense:{' '}
                          {modifierDraft.defenseBonus > 0
                            ? `+${modifierDraft.defenseBonus}`
                            : modifierDraft.defenseBonus}
                        </span>
                        <span>
                          ⚔️ Attack:{' '}
                          {modifierDraft.attackBonus > 0
                            ? `+${modifierDraft.attackBonus}`
                            : modifierDraft.attackBonus}
                        </span>
                        <span>
                          👥 Troops/Turn:{' '}
                          {modifierDraft.troopBonus > 0
                            ? `+${modifierDraft.troopBonus}`
                            : modifierDraft.troopBonus}
                        </span>
                      </div>
                      {(modifierDraft.movementRestriction || modifierDraft.supplyLineBonus) && (
                        <div className="pt-2 border-t border-border text-[11px]">
                          {modifierDraft.movementRestriction && '🚷 Movement restricted'}
                          {modifierDraft.movementRestriction &&
                            modifierDraft.supplyLineBonus &&
                            ' · '}
                          {modifierDraft.supplyLineBonus && '🔗 Counts as supply line'}
                        </div>
                      )}
                    </div>

                    {savedModifierForSelectedTerritory && (
                      <div className="text-xs text-muted">
                        Last saved: {savedModifierForSelectedTerritory.name || 'Custom modifier'}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm mb-1" htmlFor={modifierNameId}>
                          Modifier Name
                        </label>
                        <input
                          id={modifierNameId}
                          type="text"
                          value={modifierDraft.name}
                          disabled={modifierFormDisabled}
                          onChange={(e) => updateModifierDraft({ name: e.target.value })}
                          className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1" htmlFor={modifierIconId}>
                          Icon
                        </label>
                        <input
                          id={modifierIconId}
                          type="text"
                          maxLength={4}
                          value={modifierDraft.icon}
                          disabled={modifierFormDisabled}
                          onChange={(e) => updateModifierDraft({ icon: e.target.value })}
                          className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1" htmlFor={modifierColorId}>
                          Display Color
                        </label>
                        <input
                          id={modifierColorId}
                          type="color"
                          value={modifierDraft.color}
                          disabled={modifierFormDisabled}
                          onChange={(e) => updateModifierDraft({ color: e.target.value })}
                          className="h-10 w-full rounded border border-border bg-surface-2 disabled:opacity-50"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm mb-1" htmlFor={modifierDefenseId}>
                          Defense Bonus
                        </label>
                        <input
                          id={modifierDefenseId}
                          type="number"
                          min={-5}
                          max={10}
                          value={modifierDraft.defenseBonus}
                          disabled={modifierFormDisabled}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10)
                            updateModifierDraft({
                              defenseBonus: clamp(Number.isNaN(parsed) ? 0 : parsed, -5, 10),
                            })
                          }}
                          className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1" htmlFor={modifierAttackId}>
                          Attack Bonus
                        </label>
                        <input
                          id={modifierAttackId}
                          type="number"
                          min={-5}
                          max={10}
                          value={modifierDraft.attackBonus}
                          disabled={modifierFormDisabled}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10)
                            updateModifierDraft({
                              attackBonus: clamp(Number.isNaN(parsed) ? 0 : parsed, -5, 10),
                            })
                          }}
                          className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1" htmlFor={modifierTroopsId}>
                          Troops / Turn
                        </label>
                        <input
                          id={modifierTroopsId}
                          type="number"
                          min={-5}
                          max={10}
                          value={modifierDraft.troopBonus}
                          disabled={modifierFormDisabled}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10)
                            updateModifierDraft({
                              troopBonus: clamp(Number.isNaN(parsed) ? 0 : parsed, -5, 10),
                            })
                          }}
                          className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={modifierDraft.movementRestriction}
                          disabled={modifierFormDisabled}
                          onChange={(e) =>
                            updateModifierDraft({ movementRestriction: e.target.checked })
                          }
                          className="h-4 w-4"
                        />
                        Restrict movement through this territory
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={modifierDraft.supplyLineBonus}
                          disabled={modifierFormDisabled}
                          onChange={(e) =>
                            updateModifierDraft({ supplyLineBonus: e.target.checked })
                          }
                          className="h-4 w-4"
                        />
                        Counts as a supply line connection
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm mb-1" htmlFor={modifierNotesId}>
                        Notes (optional)
                      </label>
                      <textarea
                        id={modifierNotesId}
                        value={modifierDraft.notes ?? ''}
                        disabled={modifierFormDisabled}
                        onChange={(e) => updateModifierDraft({ notes: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 bg-surface-2 text-white rounded border border-border focus:outline-none focus:border-primary disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted">Quick presets:</span>
                  <button
                    type="button"
                    disabled={modifierFormDisabled}
                    onClick={() =>
                      updateModifierDraft({
                        name: 'Fortified Stronghold',
                        icon: '🛡️',
                        color: '#2563eb',
                        defenseBonus: 2,
                        attackBonus: 0,
                        troopBonus: 0,
                      })
                    }
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      modifierFormDisabled
                        ? 'bg-surface-2 text-muted cursor-not-allowed'
                        : 'bg-blue-600/80 hover:bg-blue-600 text-white'
                    }`}
                  >
                    Fortify (+2 🛡️)
                  </button>
                  <button
                    type="button"
                    disabled={modifierFormDisabled}
                    onClick={() =>
                      updateModifierDraft({
                        name: 'War Camp',
                        icon: '⚔️',
                        color: '#f97316',
                        defenseBonus: 0,
                        attackBonus: 2,
                        troopBonus: 0,
                      })
                    }
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      modifierFormDisabled
                        ? 'bg-surface-2 text-muted cursor-not-allowed'
                        : 'bg-orange-600/80 hover:bg-orange-600 text-white'
                    }`}
                  >
                    War Camp (+2 ⚔️)
                  </button>
                  <button
                    type="button"
                    disabled={modifierFormDisabled}
                    onClick={() =>
                      updateModifierDraft({
                        name: 'Supply Depot',
                        icon: '📦',
                        color: '#22c55e',
                        defenseBonus: 0,
                        attackBonus: 0,
                        troopBonus: 2,
                      })
                    }
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      modifierFormDisabled
                        ? 'bg-surface-2 text-muted cursor-not-allowed'
                        : 'bg-green-600/80 hover:bg-green-600 text-white'
                    }`}
                  >
                    Supply Depot (+2 👥)
                  </button>
                  <button
                    type="button"
                    disabled={modifierFormDisabled}
                    onClick={() =>
                      updateModifierDraft({
                        movementRestriction: !modifierDraft.movementRestriction,
                      })
                    }
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      modifierFormDisabled
                        ? 'bg-surface-2 text-muted cursor-not-allowed'
                        : 'bg-purple-600/80 hover:bg-purple-600 text-white'
                    }`}
                  >
                    {modifierDraft.movementRestriction ? 'Allow movement' : 'Block movement'}
                  </button>
                  <button
                    type="button"
                    disabled={modifierFormDisabled}
                    onClick={() =>
                      updateModifierDraft({
                        supplyLineBonus: !modifierDraft.supplyLineBonus,
                      })
                    }
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      modifierFormDisabled
                        ? 'bg-surface-2 text-muted cursor-not-allowed'
                        : 'bg-teal-600/80 hover:bg-teal-600 text-white'
                    }`}
                  >
                    {modifierDraft.supplyLineBonus ? 'Remove supply bonus' : 'Mark as supply link'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSaveModifier}
                    disabled={modifierFormDisabled}
                    className={`px-4 py-2 rounded text-sm font-medium ${
                      modifierFormDisabled
                        ? 'bg-surface-2 text-muted cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    💾 Save Modifier
                  </button>
                  <button
                    type="button"
                    onClick={handleClearModifier}
                    disabled={!savedModifierForSelectedTerritory}
                    className={`px-4 py-2 rounded text-sm font-medium ${
                      savedModifierForSelectedTerritory
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-surface-2 text-muted cursor-not-allowed'
                    }`}
                  >
                    🗑️ Remove Modifier
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {/* Main Editor Area - Full width with right sidebar */}
      <div className="flex gap-4 px-3">
        {/* Map Canvas - Main area taking most space, centered content */}
        <div
          ref={mapContainerRef}
          className="relative flex-1 bg-surface-1 rounded-lg overflow-auto flex items-center justify-center p-4"
          style={{ height: 'calc(100vh - 240px)' }}
        >
          {/* Help tooltip moved to sidebar footer to avoid covering canvas */}
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
          {modeHelpMessage && (
            <div className="mt-6 rounded border border-border bg-surface-1 p-3 text-xs text-muted">
              {modeHelpMessage}
            </div>
          )}
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
