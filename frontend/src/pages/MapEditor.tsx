import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import ImageCropper from '../components/ImageCropper'
import TermsModal from '../components/TermsModal'
import {
  type Coordinate,
  type CustomMap,
  type GameMode,
  type MapContinent,
  type MapTerritory,
  mapService,
  type TerritoryAbilityType,
  type TerritoryAdjacency,
} from '../services/mapService'
import { termsService } from '../services/termsService'

type EditorTool = 'select' | 'territory' | 'continent' | 'adjacency'

interface EditorState {
  selectedTool: EditorTool
  currentMap?: CustomMap
  territories: MapTerritory[]
  continents: MapContinent[]
  selectedTerritory?: string
  selectedContinent?: string
  isDrawing: boolean
  currentPolygon: Coordinate[]
  imageUrl?: string
  imageWidth: number
  imageHeight: number
  imageScale: number // Scale factor for resizing image
  adjacencies: Array<{ from: string; to: string }>
  firstSelectedTerritory?: string
}

type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface EditorNotification {
  id: string
  message: string
  type: NotificationType
}

const NOTIFICATION_STYLES: Record<NotificationType, { container: string; icon: string }> = {
  success: {
    container: 'bg-emerald-900/60 border border-emerald-500 text-emerald-100',
    icon: '✅',
  },
  error: {
    container: 'bg-red-900/60 border border-red-500 text-red-100',
    icon: '❌',
  },
  warning: {
    container: 'bg-amber-900/60 border border-amber-500 text-amber-100',
    icon: '⚠️',
  },
  info: {
    container: 'bg-slate-800 border border-slate-600 text-slate-100',
    icon: 'ℹ️',
  },
}

export default function MapEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const [state, setState] = useState<EditorState>({
    selectedTool: 'select',
    territories: [],
    continents: [],
    isDrawing: false,
    currentPolygon: [],
    imageWidth: 800,
    imageHeight: 600,
    imageScale: 1, // Default scale
    adjacencies: [],
    firstSelectedTerritory: undefined,
  })

  // Terms acceptance state
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [termsContent, setTermsContent] = useState<any>(null)
  const [isCheckingTerms, setIsCheckingTerms] = useState(true)
  const polygonEditorEnabled = useFeatureFlag(FEATURE_FLAGS.MAP_POLYGON_EDITOR)

  const [_territoryAbilities, setTerritoryAbilities] = useState<TerritoryAbilityType[]>([])
  const [_gameModes, setGameModes] = useState<GameMode[]>([])
  const [mapName, setMapName] = useState('')
  const [mapDescription, setMapDescription] = useState('')
  const [newTerritoryName, setNewTerritoryName] = useState('')
  const [newContinentName, setNewContinentName] = useState('')
  const [newContinentBonus, setNewContinentBonus] = useState(2)
  const [newContinentColor, setNewContinentColor] = useState('#3B82F6')
  const [editingContinent, setEditingContinent] = useState<string | null>(null)
  const [showContinentTerritories, setShowContinentTerritories] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadInfo, setUploadInfo] = useState<string | null>(null)
  const [showCropper, setShowCropper] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [showImageOptions, setShowImageOptions] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [notifications, setNotifications] = useState<EditorNotification[]>([])
  const notificationTimeoutsRef = useRef<Map<string, number>>(new Map())

  const createNotificationId = useCallback(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `notice_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }, [])

  const dismissNotification = useCallback((id: string) => {
    const timeoutId = notificationTimeoutsRef.current.get(id)
    if (timeoutId && typeof window !== 'undefined') {
      window.clearTimeout(timeoutId)
      notificationTimeoutsRef.current.delete(id)
    }
    setNotifications((prev) => prev.filter((notice) => notice.id !== id))
  }, [])

  const scheduleNotificationRemoval = useCallback(
    (id: string, duration = 6000) => {
      if (typeof window === 'undefined') return

      const existingTimeout = notificationTimeoutsRef.current.get(id)
      if (existingTimeout) {
        window.clearTimeout(existingTimeout)
      }
      const timeoutId = window.setTimeout(() => {
        dismissNotification(id)
      }, duration)
      notificationTimeoutsRef.current.set(id, timeoutId)
    },
    [dismissNotification],
  )

  const addNotification = useCallback(
    (message: string, type: NotificationType) => {
      setNotifications((prev) => {
        const existing = prev.find((notice) => notice.message === message && notice.type === type)
        if (existing) {
          scheduleNotificationRemoval(existing.id)
          return prev
        }

        const id = createNotificationId()
        scheduleNotificationRemoval(id)
        return [...prev, { id, message, type }]
      })
    },
    [createNotificationId, scheduleNotificationRemoval],
  )

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        notificationTimeoutsRef.current.forEach((timeoutId) => {
          window.clearTimeout(timeoutId)
        })
      }
      notificationTimeoutsRef.current.clear()
    }
  }, [])

  // Check terms acceptance on mount
  useEffect(() => {
    checkTermsAcceptance()
  }, [])

  // Load metadata after terms are accepted
  useEffect(() => {
    if (!showTermsModal && !isCheckingTerms) {
      loadMetadata()
    }
  }, [showTermsModal, isCheckingTerms])

  const checkTermsAcceptance = async () => {
    try {
      const response = await termsService.checkTermsAcceptance('map_editor')

      if (!response.hasAccepted) {
        setTermsContent(response.termsContent)
        setShowTermsModal(true)
      }
    } catch (error) {
      console.error('Error checking terms:', error)
      // If terms check fails, allow access but log the error
    } finally {
      setIsCheckingTerms(false)
    }
  }

  const handleAcceptTerms = async () => {
    try {
      await termsService.acceptTerms('map_editor')
      setShowTermsModal(false)
    } catch (error) {
      console.error('Error accepting terms:', error)
      addNotification('Failed to accept terms. Please try again.', 'error')
    }
  }

  const handleDeclineTerms = () => {
    setShowTermsModal(false)
    navigate('/') // Navigate back to home if terms are declined
  }

  const loadMetadata = async () => {
    try {
      const [abilities, modes] = await Promise.all([
        mapService.getTerritoryAbilityTypes(),
        mapService.getGameModes(),
      ])
      setTerritoryAbilities(abilities)
      setGameModes(modes)
    } catch (_error) {}
  }

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    const canvas = ctx.canvas
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 1

    // Draw grid lines
    for (let x = 0; x <= canvas.width; x += 50) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }

    for (let y = 0; y <= canvas.height; y += 50) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }
  }, [])

  const redrawTerritories = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      // Draw territories
      state.territories.forEach((territory) => {
        const continent = state.continents.find((c) => c.id === territory.continentId)
        const isSelected = state.selectedTerritory === territory.id

        // Use higher opacity for better visibility
        ctx.fillStyle = continent ? `${continent.color}B3` : '#6B7280B3' // 70% opacity
        ctx.strokeStyle = isSelected ? '#FFD700' : '#FFFFFF' // White borders for better contrast
        ctx.lineWidth = isSelected ? 4 : 2

        // Draw territory polygon (apply scale)
        if (territory.boundaryCoords.length > 0) {
          ctx.beginPath()
          ctx.moveTo(
            territory.boundaryCoords[0].x * state.imageScale,
            territory.boundaryCoords[0].y * state.imageScale,
          )
          territory.boundaryCoords.slice(1).forEach((coord) => {
            ctx.lineTo(coord.x * state.imageScale, coord.y * state.imageScale)
          })
          ctx.closePath()
          ctx.fill()
          ctx.stroke()

          // Draw territory name with shadow for better readability
          ctx.fillStyle = '#000000'
          ctx.font = 'bold 14px sans-serif'
          ctx.textAlign = 'center'
          // Draw shadow (apply scale)
          ctx.fillText(
            territory.name,
            territory.armyPosition.x * state.imageScale + 1,
            territory.armyPosition.y * state.imageScale + 1,
          )
          // Draw text
          ctx.fillStyle = '#FFFFFF'
          ctx.fillText(
            territory.name,
            territory.armyPosition.x * state.imageScale,
            territory.armyPosition.y * state.imageScale,
          )
        }
      })

      // Draw current polygon being drawn
      if (state.isDrawing && state.currentPolygon.length > 0) {
        // Draw filled preview with low opacity
        ctx.fillStyle = '#60A5FA40' // Light blue with 25% opacity
        ctx.beginPath()
        ctx.moveTo(
          state.currentPolygon[0].x * state.imageScale,
          state.currentPolygon[0].y * state.imageScale,
        )
        state.currentPolygon.slice(1).forEach((coord) => {
          ctx.lineTo(coord.x * state.imageScale, coord.y * state.imageScale)
        })
        ctx.closePath()
        ctx.fill()

        // Draw outline
        ctx.strokeStyle = '#3B82F6' // Bright blue
        ctx.lineWidth = 3
        ctx.setLineDash([8, 4])
        ctx.beginPath()
        ctx.moveTo(
          state.currentPolygon[0].x * state.imageScale,
          state.currentPolygon[0].y * state.imageScale,
        )
        state.currentPolygon.slice(1).forEach((coord) => {
          ctx.lineTo(coord.x * state.imageScale, coord.y * state.imageScale)
        })
        ctx.stroke()
        ctx.setLineDash([])

        // Draw points
        state.currentPolygon.forEach((point) => {
          ctx.fillStyle = '#FFFFFF'
          ctx.strokeStyle = '#3B82F6'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(point.x * state.imageScale, point.y * state.imageScale, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        })
      }
    },
    [
      state.territories,
      state.continents,
      state.selectedTerritory,
      state.isDrawing,
      state.currentPolygon,
      state.imageScale,
    ],
  )

  const drawAdjacencies = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      // Draw adjacency lines
      state.adjacencies.forEach((adjacency) => {
        const fromTerritory = state.territories.find((t) => t.id === adjacency.from)
        const toTerritory = state.territories.find((t) => t.id === adjacency.to)

        if (fromTerritory && toTerritory) {
          ctx.strokeStyle = '#10B981'
          ctx.lineWidth = 3
          ctx.setLineDash([10, 5])

          ctx.beginPath()
          ctx.moveTo(
            fromTerritory.armyPosition.x * state.imageScale,
            fromTerritory.armyPosition.y * state.imageScale,
          )
          ctx.lineTo(
            toTerritory.armyPosition.x * state.imageScale,
            toTerritory.armyPosition.y * state.imageScale,
          )
          ctx.stroke()
          ctx.setLineDash([])

          // Draw connection dots
          ctx.fillStyle = '#10B981'
          ctx.beginPath()
          ctx.arc(
            fromTerritory.armyPosition.x * state.imageScale,
            fromTerritory.armyPosition.y * state.imageScale,
            4,
            0,
            2 * Math.PI,
          )
          ctx.fill()
          ctx.beginPath()
          ctx.arc(
            toTerritory.armyPosition.x * state.imageScale,
            toTerritory.armyPosition.y * state.imageScale,
            4,
            0,
            2 * Math.PI,
          )
          ctx.fill()
        }
      })

      // Highlight first selected territory in adjacency mode
      if (state.selectedTool === 'adjacency' && state.firstSelectedTerritory) {
        const firstTerritory = state.territories.find((t) => t.id === state.firstSelectedTerritory)
        if (firstTerritory) {
          ctx.strokeStyle = '#F59E0B'
          ctx.lineWidth = 4
          ctx.setLineDash([8, 4])

          ctx.beginPath()
          const centerX = firstTerritory.armyPosition.x * state.imageScale
          const centerY = firstTerritory.armyPosition.y * state.imageScale
          const radius = 20 * state.imageScale
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    },
    [
      state.adjacencies,
      state.territories,
      state.selectedTool,
      state.firstSelectedTerritory,
      state.imageScale,
    ],
  )

  // Canvas drawing setup - moved after function definitions to avoid hoisting issues
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw background image if loaded
    if (state.imageUrl) {
      const img = new Image()
      // No need for crossOrigin with data URLs
      img.onload = () => {
        // Clear and draw image
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        // Draw territories and adjacencies on top of image
        redrawTerritories(ctx)
        drawAdjacencies(ctx)
      }

      img.onerror = (_event) => {
        // Fall back to grid if image fails
        drawGrid(ctx)
        redrawTerritories(ctx)
        drawAdjacencies(ctx)
      }

      // Use the image URL directly for data URLs, or process it for relative URLs
      const imageUrl = state.imageUrl.startsWith('data:')
        ? state.imageUrl
        : mapService.getImageUrl(state.imageUrl)
      img.src = imageUrl
    } else {
      // Draw grid background
      drawGrid(ctx)
      redrawTerritories(ctx)
      drawAdjacencies(ctx)
    }
  }, [
    state.imageUrl,
    state.territories,
    state.continents,
    state.selectedTerritory,
    state.isDrawing,
    state.currentPolygon,
    state.adjacencies,
    state.selectedTool,
    state.firstSelectedTerritory,
    state.imageScale,
    state.imageWidth,
    state.imageHeight,
    drawGrid,
    redrawTerritories,
    drawAdjacencies,
  ])

  // Canvas handlers will be defined after all helper functions

  const finishTerritory = useCallback(() => {
    if (!newTerritoryName.trim() || state.currentPolygon.length < 3) return

    // Calculate center point for army position
    const centerX =
      state.currentPolygon.reduce((sum, p) => sum + p.x, 0) / state.currentPolygon.length
    const centerY =
      state.currentPolygon.reduce((sum, p) => sum + p.y, 0) / state.currentPolygon.length

    const newTerritory: MapTerritory = {
      id: `temp_${Date.now()}`,
      mapId: state.currentMap?.id || 'temp',
      territoryId: newTerritoryName.toLowerCase().replace(/\s+/g, '_'),
      name: newTerritoryName,
      continentId: state.selectedContinent,
      boundaryCoords: state.currentPolygon,
      armyPosition: { x: centerX, y: centerY },
      startingArmies: 1,
      createdAt: new Date().toISOString(),
    }

    setState((prev) => ({
      ...prev,
      territories: [...prev.territories, newTerritory],
      isDrawing: false,
      currentPolygon: [],
      selectedTerritory: newTerritory.id,
    }))

    setNewTerritoryName('')
  }, [newTerritoryName, state.currentPolygon, state.selectedContinent, state.currentMap?.id])

  const isPointInPolygon = useCallback((point: Coordinate, polygon: Coordinate[]): boolean => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (
        polygon[i].y > point.y !== polygon[j].y > point.y &&
        point.x <
          ((polygon[j].x - polygon[i].x) * (point.y - polygon[i].y)) /
            (polygon[j].y - polygon[i].y) +
            polygon[i].x
      ) {
        inside = !inside
      }
    }
    return inside
  }, [])

  const findTerritoryAtPoint = useCallback(
    (x: number, y: number): MapTerritory | undefined => {
      return state.territories.find((territory) => {
        return isPointInPolygon({ x, y }, territory.boundaryCoords)
      })
    },
    [state.territories, isPointInPolygon],
  )

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    processImageFile(file)
  }

  const processImageFile = (file: File) => {
    // Clear previous errors and info
    setUploadError(null)
    setUploadInfo(null)

    // Validate file type (including SVG)
    if (!file.type.startsWith('image/')) {
      const error = `Invalid file type: ${file.type}. Please select an image file (PNG, JPG, GIF, WEBP, SVG)`
      setUploadError(error)
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      const error = `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Image file must be smaller than 10MB`
      setUploadError(error)
      return
    }

    setIsUploading(true)
    setUploadProgress(10)

    // Store the actual file for upload
    setImageFile(file) // Store for later upload

    // Use FileReader API for better compatibility (avoids blob URL security issues)
    const reader = new FileReader()

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      setUploadProgress(50)

      // Get image dimensions
      const img = new Image()

      img.onload = () => {
        const isSvg = file.type === 'image/svg+xml'

        // Minimum size requirements
        const MIN_WIDTH = 400
        const MIN_HEIGHT = 300
        const MAX_WIDTH = 1600
        const MAX_HEIGHT = 1200

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

        // Show options dialog for all images
        setShowImageOptions(true)
        setIsUploading(false)
        setUploadProgress(0)

        // Store dimensions (with limits)
        setState((prev) => ({
          ...prev,
          imageWidth: Math.min(finalWidth, MAX_WIDTH),
          imageHeight: Math.min(finalHeight, MAX_HEIGHT),
        }))
      }

      img.onerror = (_event) => {
        // Try to get more specific error information
        let errorMessage = 'Failed to load image. '

        // Check if browser supports the file type
        if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/i)) {
          errorMessage += `Unsupported format: ${file.type}. `
        }

        errorMessage += 'Please check the file format and try a different file.'

        setUploadError(errorMessage)
        setIsUploading(false)
        setUploadProgress(0)
      }
      img.src = dataUrl
    }

    reader.onerror = (_error) => {
      setUploadError('Failed to read the image file. Please try again.')
      setIsUploading(false)
      setUploadProgress(0)
    }
    reader.readAsDataURL(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const imageFile = files.find((file) => file.type.startsWith('image/'))

    if (imageFile) {
      processImageFile(imageFile)
    } else {
      addNotification('Please drop an image file (PNG, JPG, GIF, WEBP)', 'error')
    }
  }

  const createContinent = () => {
    if (!newContinentName.trim()) {
      addNotification('Please enter a continent name', 'error')
      return
    }

    // Check for duplicate names
    if (
      state.continents.some((c) => c.name.toLowerCase() === newContinentName.trim().toLowerCase())
    ) {
      addNotification('A continent with this name already exists', 'error')
      return
    }

    // Validate bonus armies range
    if (newContinentBonus < 1 || newContinentBonus > 20) {
      addNotification('Bonus armies must be between 1 and 20', 'error')
      return
    }

    const newContinent: MapContinent = {
      id: `temp_${Date.now()}`,
      mapId: state.currentMap?.id || 'temp',
      name: newContinentName.trim(),
      bonusArmies: newContinentBonus,
      color: newContinentColor,
      createdAt: new Date().toISOString(),
    }

    setState((prev) => ({
      ...prev,
      continents: [...prev.continents, newContinent],
    }))

    setNewContinentName('')
    setNewContinentBonus(2)
    setNewContinentColor('#3B82F6')
  }

  const editContinent = (continentId: string) => {
    const continent = state.continents.find((c) => c.id === continentId)
    if (!continent) return

    setNewContinentName(continent.name)
    setNewContinentBonus(continent.bonusArmies)
    setNewContinentColor(continent.color)
    setEditingContinent(continentId)
  }

  const updateContinent = () => {
    if (!editingContinent || !newContinentName.trim()) return

    // Check for duplicate names (excluding current continent)
    if (
      state.continents.some(
        (c) =>
          c.id !== editingContinent &&
          c.name.toLowerCase() === newContinentName.trim().toLowerCase(),
      )
    ) {
      addNotification('A continent with this name already exists', 'error')
      return
    }

    // Validate bonus armies range
    if (newContinentBonus < 1 || newContinentBonus > 20) {
      addNotification('Bonus armies must be between 1 and 20', 'error')
      return
    }

    setState((prev) => ({
      ...prev,
      continents: prev.continents.map((c) =>
        c.id === editingContinent
          ? {
              ...c,
              name: newContinentName.trim(),
              bonusArmies: newContinentBonus,
              color: newContinentColor,
            }
          : c,
      ),
    }))

    cancelEditContinent()
  }

  const cancelEditContinent = () => {
    setEditingContinent(null)
    setNewContinentName('')
    setNewContinentBonus(2)
    setNewContinentColor('#3B82F6')
  }

  const deleteContinent = (continentId: string) => {
    const continent = state.continents.find((c) => c.id === continentId)
    if (!continent) return

    const territoriesInContinent = state.territories.filter((t) => t.continentId === continentId)

    if (territoriesInContinent.length > 0) {
      if (
        !confirm(
          `Continent "${continent.name}" contains ${territoriesInContinent.length} territories. Are you sure you want to delete it? Territories will be moved to "No Continent".`,
        )
      ) {
        return
      }

      // Remove continent assignment from territories
      setState((prev) => ({
        ...prev,
        territories: prev.territories.map((t) =>
          t.continentId === continentId ? { ...t, continentId: undefined } : t,
        ),
        continents: prev.continents.filter((c) => c.id !== continentId),
      }))
    } else {
      setState((prev) => ({
        ...prev,
        continents: prev.continents.filter((c) => c.id !== continentId),
      }))
    }

    // Cancel editing if this continent was being edited
    if (editingContinent === continentId) {
      cancelEditContinent()
    }
  }

  const getContinentTerritoryCount = (continentId: string) => {
    return state.territories.filter((t) => t.continentId === continentId).length
  }

  const reassignTerritoryContinent = (territoryId: string, newContinentId: string | undefined) => {
    setState((prev) => ({
      ...prev,
      territories: prev.territories.map((t) =>
        t.id === territoryId ? { ...t, continentId: newContinentId } : t,
      ),
    }))
  }

  const saveMap = async () => {
    if (!mapName.trim()) {
      addNotification('Please enter a map name', 'error')
      return
    }

    setSaveStatus('saving')

    try {
      // Create or update map
      const mapData = {
        name: mapName,
        description: mapDescription,
        isPublic,
        tags: ['custom'],
      }

      const savedMap = await mapService.createMap(mapData, imageFile || undefined)

      // Save continents
      const savedContinents = []
      for (const continent of state.continents) {
        const saved = await mapService.createContinent(savedMap.id, {
          name: continent.name,
          bonusArmies: continent.bonusArmies,
          color: continent.color,
        })
        savedContinents.push(saved)
      }

      // Save territories and collect mapping for adjacencies
      const savedTerritories = []
      for (const territory of state.territories) {
        const continentId = savedContinents.find(
          (c) => c.name === state.continents.find((sc) => sc.id === territory.continentId)?.name,
        )?.id

        const savedTerritory = await mapService.createTerritory({
          mapId: savedMap.id,
          territoryId: territory.territoryId,
          name: territory.name,
          continentId,
          boundaryCoords: territory.boundaryCoords,
          armyPosition: territory.armyPosition,
          startingArmies: territory.startingArmies,
        })
        savedTerritories.push({ editorId: territory.id, savedId: savedTerritory.id })
      }

      // Save adjacencies
      for (const adjacency of state.adjacencies) {
        const fromMapping = savedTerritories.find((t) => t.editorId === adjacency.from)
        const toMapping = savedTerritories.find((t) => t.editorId === adjacency.to)

        if (fromMapping && toMapping) {
          await mapService.createAdjacency({
            fromTerritoryId: fromMapping.savedId,
            toTerritoryId: toMapping.savedId,
            connectionType: 'land',
            isBidirectional: true,
          })
        }
      }

      setState((prev) => ({ ...prev, currentMap: savedMap }))
      setSaveStatus('saved')
      addNotification('Map saved successfully! You can manage it from your profile.', 'success')

      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error: any) {
      console.error('Map save error:', error)
      console.error('Error response:', error.response?.data)
      setSaveStatus('error')

      let errorMessage = 'Failed to save map. Please try again.'
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error
        if (error.response.data.details) {
          errorMessage += ': ' + error.response.data.details.map((d: any) => d.msg).join(', ')
        }
      }

      setSaveError(errorMessage)
      addNotification(errorMessage, 'error')
      setTimeout(() => {
        setSaveStatus('idle')
        setSaveError(null)
      }, 10000) // Longer timeout to read the error
    }
  }

  const clearMap = () => {
    if (confirm('Are you sure you want to clear the entire map? This cannot be undone.')) {
      setState((prev) => ({
        ...prev,
        territories: [],
        continents: [],
        currentPolygon: [],
        isDrawing: false,
        selectedTerritory: undefined,
        selectedContinent: undefined,
        imageUrl: undefined,
        imageScale: 1,
        adjacencies: [],
        firstSelectedTerritory: undefined,
      }))
      setMapName('')
      setMapDescription('')
      setImageFile(null)
    }
  }

  const handleCropComplete = (croppedImageUrl: string) => {
    // Convert base64 to File for upload without using fetch (CSP compliance)
    try {
      // Extract the base64 data from the data URL
      const base64Data = croppedImageUrl.split(',')[1]
      // Convert base64 to binary
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      // Create blob and file
      const blob = new Blob([bytes], { type: 'image/png' })
      const file = new File([blob], imageFile?.name || 'cropped-image.png', { type: 'image/png' })
      setImageFile(file)
    } catch (error) {
      console.error('Failed to convert cropped image:', error)
      setUploadError('Failed to process cropped image')
    }

    setState((prev) => ({
      ...prev,
      imageUrl: croppedImageUrl,
      imageWidth: 800,
      imageHeight: 600,
      imageScale: 1,
    }))
    setShowCropper(false)
    setTempImageUrl(null)
    setShowImageOptions(false)
  }

  const handleCropCancel = () => {
    setShowCropper(false)
    setTempImageUrl(null)
    setUploadError(null)
  }

  const validateMap = () => {
    const issues: string[] = []

    if (state.territories.length < 2) {
      issues.push('Map must have at least 2 territories')
    }

    const normalizedAdjacencies: TerritoryAdjacency[] = state.adjacencies.map((adjacency) => ({
      id: `${adjacency.from}-${adjacency.to}`,
      fromTerritoryId: adjacency.from,
      toTerritoryId: adjacency.to,
      connectionType: 'land',
      isBidirectional: true,
    }))

    const validationResult = mapService.validateMapData(state.territories, normalizedAdjacencies)
    issues.push(...validationResult.errors)

    if (issues.length === 0) {
      addNotification('✅ Map validation passed! Your map is ready to use.', 'success')
    } else {
      issues.forEach((message) => addNotification(message, 'warning'))
      addNotification('Map validation found issues that need attention.', 'error')
    }
  }

  const exportMapJSON = () => {
    const mapData = {
      name: mapName,
      description: mapDescription,
      imageWidth: state.imageWidth,
      imageHeight: state.imageHeight,
      territories: state.territories.map((t) => ({
        ...t,
        // Ensure coordinates are stored relative to base image dimensions
        boundaryCoords: t.boundaryCoords,
        armyPosition: t.armyPosition,
      })),
      continents: state.continents,
      adjacencies: state.adjacencies,
      version: '1.0',
    }

    const jsonString = JSON.stringify(mapData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${mapName || 'map'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importMapJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const mapData = JSON.parse(e.target?.result as string)

        // Load map data
        setMapName(mapData.name || '')
        setMapDescription(mapData.description || '')
        setState((prev) => ({
          ...prev,
          territories: mapData.territories || [],
          continents: mapData.continents || [],
          adjacencies: mapData.adjacencies || [],
          imageWidth: mapData.imageWidth || 800,
          imageHeight: mapData.imageHeight || 600,
        }))

        addNotification('Map data imported successfully!', 'success')
      } catch (error) {
        addNotification('Failed to import map data. Please check the file format.', 'error')
      }
    }
    reader.readAsText(file)
  }

  const _selectedTerritoryData = state.territories.find((t) => t.id === state.selectedTerritory)

  const handleUseFullImage = () => {
    if (!tempImageUrl) return

    setState((prev) => ({
      ...prev,
      imageUrl: tempImageUrl,
      imageScale: 1,
    }))
    setShowImageOptions(false)
    setTempImageUrl(null)
  }

  const handleCropImage = () => {
    setShowImageOptions(false)
    setShowCropper(true)
  }

  const handleScaleChange = (newScale: number) => {
    setState((prev) => ({
      ...prev,
      imageScale: newScale,
    }))
  }

  // Canvas event handlers - defined after all helper functions to avoid hoisting issues
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      // Scale the coordinates based on the actual canvas size vs displayed size
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = (event.clientX - rect.left) * scaleX
      const y = (event.clientY - rect.top) * scaleY

      // Store coordinates relative to original image dimensions for consistency
      const normalizedX = x / state.imageScale
      const normalizedY = y / state.imageScale

      if (state.selectedTool === 'territory') {
        if (!state.isDrawing) {
          setState((prev) => ({
            ...prev,
            isDrawing: true,
            currentPolygon: [{ x: normalizedX, y: normalizedY }],
          }))
        } else {
          setState((prev) => ({
            ...prev,
            currentPolygon: [...prev.currentPolygon, { x: normalizedX, y: normalizedY }],
          }))
        }
      } else if (state.selectedTool === 'select') {
        // Select territory
        const clickedTerritory = findTerritoryAtPoint(normalizedX, normalizedY)
        setState((prev) => ({
          ...prev,
          selectedTerritory: clickedTerritory?.id,
        }))
      } else if (state.selectedTool === 'adjacency') {
        // Handle adjacency creation
        const clickedTerritory = findTerritoryAtPoint(normalizedX, normalizedY)
        if (!clickedTerritory) return

        if (!state.firstSelectedTerritory) {
          // First territory selection
          setState((prev) => ({
            ...prev,
            firstSelectedTerritory: clickedTerritory.id,
            selectedTerritory: clickedTerritory.id,
          }))
        } else if (state.firstSelectedTerritory !== clickedTerritory.id) {
          // Second territory selection - create adjacency
          const newAdjacency = {
            from: state.firstSelectedTerritory,
            to: clickedTerritory.id,
          }

          // Check if adjacency already exists
          const exists = state.adjacencies.some(
            (adj) =>
              (adj.from === newAdjacency.from && adj.to === newAdjacency.to) ||
              (adj.from === newAdjacency.to && adj.to === newAdjacency.from),
          )

          if (!exists) {
            setState((prev) => ({
              ...prev,
              adjacencies: [...prev.adjacencies, newAdjacency],
              firstSelectedTerritory: undefined,
              selectedTerritory: undefined,
            }))
          } else {
            // Reset selection if adjacency already exists
            setState((prev) => ({
              ...prev,
              firstSelectedTerritory: undefined,
              selectedTerritory: undefined,
            }))
          }
        } else {
          // Same territory clicked - deselect
          setState((prev) => ({
            ...prev,
            firstSelectedTerritory: undefined,
            selectedTerritory: undefined,
          }))
        }
      }
    },
    [
      state.selectedTool,
      state.isDrawing,
      findTerritoryAtPoint,
      state.adjacencies,
      state.firstSelectedTerritory,
      state.imageScale,
    ],
  )

  const handleCanvasDoubleClick = useCallback(() => {
    if (state.selectedTool === 'territory' && state.isDrawing && state.currentPolygon.length >= 3) {
      finishTerritory()
    }
  }, [state.selectedTool, state.isDrawing, state.currentPolygon, finishTerritory])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 relative">
      {/* Terms Modal */}
      {showTermsModal && termsContent && (
        <TermsModal
          isOpen={showTermsModal}
          onAccept={handleAcceptTerms}
          onDecline={handleDeclineTerms}
          termsContent={termsContent}
          featureType="map_editor"
        />
      )}

      {!polygonEditorEnabled && (
        <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-4">🚧 Coming Soon</h1>
            <p className="text-xl text-muted mb-6">
              The polygon-based map editor is currently under development
            </p>
            <button
              onClick={() => (window.location.href = '/map-editor')}
              className="bg-primary hover:bg-primary px-6 py-3 rounded-lg font-medium text-white"
            >
              Return to Current Map Editor
            </button>
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
                onClick={handleUseFullImage}
                className="w-full px-4 py-3 bg-primary hover:bg-primary rounded-lg text-white font-medium flex items-center justify-between"
              >
                <span>Use Full Image</span>
                <span className="text-sm text-blue-200">No cropping</span>
              </button>
              <button
                onClick={handleCropImage}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium flex items-center justify-between"
              >
                <span>Crop Image</span>
                <span className="text-sm text-green-200">Select area</span>
              </button>
              <button
                onClick={() => {
                  setShowImageOptions(false)
                  setTempImageUrl(null)
                }}
                className="w-full px-4 py-3 bg-surface-2 hover:bg-gray-600 rounded-lg text-white font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {showCropper && tempImageUrl && (
        <ImageCropper
          imageUrl={tempImageUrl}
          onCrop={handleCropComplete}
          onCancel={handleCropCancel}
          targetWidth={800}
          targetHeight={600}
        />
      )}

      <div className="max-w-7xl mx-auto">
        {notifications.length > 0 && (
          <div className="mb-6 space-y-2" role="status" aria-live="polite">
            {notifications.map((notice) => (
              <div
                key={notice.id}
                className={`flex items-start justify-between gap-3 px-4 py-3 rounded-lg shadow-sm ${NOTIFICATION_STYLES[notice.type].container}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg" aria-hidden="true">
                    {NOTIFICATION_STYLES[notice.type].icon}
                  </span>
                  <p className="text-sm leading-relaxed">{notice.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissNotification(notice.id)}
                  className="text-xs text-slate-200 hover:text-white"
                  aria-label="Dismiss notification"
                >
                  ✖
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-100">🗺️ Map Editor</h1>
          <div className="space-x-2">
            <button
              onClick={saveMap}
              disabled={saveStatus === 'saving'}
              className={`px-4 py-2 rounded font-medium ${
                saveStatus === 'saving'
                  ? 'bg-gray-600 cursor-not-allowed'
                  : saveStatus === 'saved'
                    ? 'bg-green-600 hover:bg-green-700'
                    : saveStatus === 'error'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {saveStatus === 'saving'
                ? '💾 Saving...'
                : saveStatus === 'saved'
                  ? '✅ Saved'
                  : saveStatus === 'error'
                    ? '❌ Error'
                    : '💾 Save Map'}
            </button>

            {/* Save Error Display */}
            {saveError && (
              <div className="mt-2 p-2 bg-red-900/50 border border-red-600 rounded text-red-300 text-sm">
                ❌ {saveError}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={exportMapJSON}
              className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-medium"
            >
              📥 Export JSON
            </button>
            <input
              type="file"
              accept=".json"
              onChange={importMapJSON}
              id="json-import"
              className="hidden"
            />
            <label
              htmlFor="json-import"
              className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-medium cursor-pointer inline-block"
            >
              📤 Import JSON
            </label>
            <button
              onClick={validateMap}
              className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-medium"
            >
              🔍 Validate Map
            </button>
            <button
              onClick={clearMap}
              className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-medium"
            >
              🗑️ Clear All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Canvas */}
          <div className="lg:col-span-3">
            <div className="bg-surface-1 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Map Canvas</h2>
              <div className="bg-surface-2 rounded overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={Math.round(state.imageWidth * state.imageScale)}
                  height={Math.round(state.imageHeight * state.imageScale)}
                  onClick={handleCanvasClick}
                  onDoubleClick={handleCanvasDoubleClick}
                  className="w-full cursor-crosshair border border-border"
                  style={{ maxHeight: `${Math.round(state.imageHeight * state.imageScale)}px` }}
                />
              </div>
              <div className="mt-4 text-sm text-muted">
                <p>
                  <strong>How to Create Your Map:</strong>
                </p>
                <div className="space-y-1 mt-2">
                  <p>
                    <span className="text-primary-soft">1.</span> Upload a background image
                    (PNG/JPG) of your map
                  </p>
                  <p>
                    <span className="text-primary-soft">2.</span> Create continents with bonus
                    armies
                  </p>
                  <p>
                    <span className="text-primary-soft">3.</span> Use Territory Tool to trace
                    territories on the image
                  </p>
                  <p>
                    <span className="text-primary-soft">4.</span> Assign territories to continents
                  </p>
                  <p>
                    <span className="text-primary-soft">5.</span> Connect territories with adjacency
                    lines
                  </p>
                  <p>
                    <span className="text-primary-soft">6.</span> Save your custom map!
                  </p>
                </div>
                <div className="mt-3 p-2 bg-surface-2 rounded text-xs">
                  <p>
                    <strong>Controls:</strong> Click to add points • Double-click to finish •
                    Right-click to cancel
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tools Panel */}
          <div className="space-y-4">
            {/* Map Setup */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-slate-100">🗺️ Map Setup</h3>
              <div className="space-y-4">
                {/* Background Image Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2">Background Image</label>
                  <div
                    className={`bg-surface-2 rounded-lg p-3 border-2 border-dashed transition-colors ${
                      isDragOver ? 'border-primary bg-blue-900/20' : 'border-border'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="text-center">
                      {/* Upload Error Display */}
                      {uploadError && (
                        <div className="mb-3 p-2 bg-red-900/50 border border-red-600 rounded text-red-300 text-xs">
                          ❌ {uploadError}
                        </div>
                      )}

                      {/* Upload Info Display */}
                      {uploadInfo && (
                        <div className="mb-3 p-2 bg-blue-900/50 border border-primary rounded text-primary-soft text-xs">
                          ℹ️ {uploadInfo}
                        </div>
                      )}

                      {/* Upload Progress Bar */}
                      {isUploading && (
                        <div className="mb-3 space-y-1">
                          <div className="text-slate-300 text-xs">Processing image...</div>
                          <div className="w-full bg-slate-700 rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-slate-400">{uploadProgress}%</div>
                        </div>
                      )}

                      {state.imageUrl ? (
                        <div className="space-y-2">
                          <div className="text-sm text-emerald-400 font-medium">
                            ✅ Image Loaded
                          </div>
                          <div className="text-xs text-slate-400">
                            {state.imageWidth} × {state.imageHeight} pixels
                          </div>
                          <div className="flex justify-center space-x-2">
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="bg-primary hover:bg-primary px-3 py-1 rounded text-xs transition-colors"
                              disabled={isUploading}
                            >
                              Change
                            </button>
                            <button
                              onClick={() => {
                                setState((prev) => ({ ...prev, imageUrl: undefined }))
                                setUploadError(null)
                                setUploadInfo(null)
                              }}
                              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs transition-colors"
                              disabled={isUploading}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-2xl">{isDragOver ? '📂' : '🖼️'}</div>
                          <div className="text-sm text-slate-300 font-medium">
                            {isDragOver ? 'Drop image here' : 'Upload Background'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {isDragOver ? (
                              'Release to upload'
                            ) : (
                              <>
                                Drag & drop or click to browse
                                <br />
                                PNG, JPG, GIF, WEBP, SVG (max 10MB)
                                <br />
                                <span className="text-primary-soft">
                                  💡 Min: 400×300px | Max: 1600×1200px
                                </span>
                                <br />
                                <span className="text-yellow-300">
                                  ⚡ Small images auto-expand to minimum size
                                </span>
                                <br />
                                <span className="text-green-300">✨ SVG maps supported!</span>
                              </>
                            )}
                          </div>
                          {!isDragOver && !isUploading && (
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="bg-primary hover:bg-primary px-4 py-2 rounded text-sm font-medium transition-colors"
                            >
                              Choose File
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    💡 Start by uploading a map image, then draw territories on top
                  </div>
                </div>

                {/* Image Scale Control */}
                {state.imageUrl && (
                  <div className="mt-4 p-3 bg-surface-2 rounded">
                    <label className="block text-sm font-medium mb-2 text-slate-200">
                      Image Scale: {Math.round(state.imageScale * 100)}%
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={state.imageScale * 100}
                      onChange={(e) => handleScaleChange(parseInt(e.target.value) / 100)}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>50%</span>
                      <span>100%</span>
                      <span>150%</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      Canvas: {Math.round(state.imageWidth * state.imageScale)}×
                      {Math.round(state.imageHeight * state.imageScale)}px
                    </div>
                  </div>
                )}

                {/* Map Details */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-200">Map Name</label>
                  <input
                    type="text"
                    value={mapName}
                    onChange={(e) => setMapName(e.target.value)}
                    className="max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    placeholder="Enter map name..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-200">
                    Description
                  </label>
                  <textarea
                    value={mapDescription}
                    onChange={(e) => setMapDescription(e.target.value)}
                    className="max-w-md w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    rows={3}
                    placeholder="Describe your map..."
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="rounded text-primary bg-slate-700 border-slate-600 focus:ring-primary"
                  />
                  <label htmlFor="isPublic" className="text-sm text-slate-200">
                    Make Public
                  </label>
                </div>
              </div>
            </div>

            {/* Tools */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-slate-100">Tools</h3>
              <div className="space-y-2">
                {[
                  { id: 'select', name: '👆 Select Tool', desc: 'Select territories' },
                  { id: 'territory', name: '🗺️ Territory Tool', desc: 'Draw territories' },
                  { id: 'continent', name: '🌍 Continent Tool', desc: 'Group territories' },
                  { id: 'adjacency', name: '🔗 Connection Tool', desc: 'Connect territories' },
                ].map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() =>
                      setState((prev) => ({ ...prev, selectedTool: tool.id as EditorTool }))
                    }
                    className={`w-full px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                      state.selectedTool === tool.id
                        ? 'bg-primary text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    <div className="font-medium">{tool.name}</div>
                    <div className="text-xs opacity-75">{tool.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Territory Properties */}
            {state.selectedTool === 'territory' && (
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-3 text-slate-100">New Territory</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-200">
                      Territory Name
                    </label>
                    <input
                      type="text"
                      value={newTerritoryName}
                      onChange={(e) => setNewTerritoryName(e.target.value)}
                      className="w-full max-w-xs px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                      placeholder="Enter name..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-200">
                      Continent
                    </label>
                    <select
                      value={state.selectedContinent || ''}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          selectedContinent: e.target.value || undefined,
                        }))
                      }
                      className="w-full max-w-xs px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    >
                      <option value="">No continent</option>
                      {state.continents.map((continent) => (
                        <option key={continent.id} value={continent.id}>
                          {continent.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {state.isDrawing && (
                    <div className="text-sm text-primary-soft">
                      Drawing... ({state.currentPolygon.length} points)
                      <br />
                      <button
                        onClick={finishTerritory}
                        className="mt-2 bg-primary hover:bg-primary px-3 py-1 rounded text-xs"
                      >
                        Finish Territory
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Continent Management */}
            <div className="bg-surface-1 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">Continents ({state.continents.length})</h3>
                <button
                  onClick={() => setShowContinentTerritories(!showContinentTerritories)}
                  className="text-xs bg-surface-2 hover:bg-gray-600 px-2 py-1 rounded"
                >
                  {showContinentTerritories ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
              <div className="space-y-3">
                {/* Add/Edit Form */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newContinentName}
                      onChange={(e) => setNewContinentName(e.target.value)}
                      className="px-2 py-1 bg-surface-2 border border-border rounded text-sm"
                      placeholder="Continent name..."
                    />
                    <input
                      type="number"
                      value={newContinentBonus}
                      onChange={(e) => setNewContinentBonus(parseInt(e.target.value, 10) || 2)}
                      className="px-2 py-1 bg-surface-2 border border-border rounded text-sm"
                      placeholder="Bonus armies"
                      min="1"
                      max="20"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="color"
                      value={newContinentColor}
                      onChange={(e) => setNewContinentColor(e.target.value)}
                      className="flex-1 h-8 bg-surface-2 border border-border rounded"
                    />
                    {editingContinent ? (
                      <>
                        <button
                          onClick={updateContinent}
                          className="bg-primary hover:bg-primary px-3 py-1 rounded text-sm"
                        >
                          Update
                        </button>
                        <button
                          onClick={cancelEditContinent}
                          className="bg-gray-600 hover:bg-surface-2 px-3 py-1 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={createContinent}
                        className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-sm"
                      >
                        Add
                      </button>
                    )}
                  </div>
                </div>

                {/* Continents List */}
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {state.continents.length === 0 ? (
                    <div className="text-sm text-muted text-center py-4">
                      No continents created yet
                      <br />
                      <span className="text-xs">
                        Continents group territories and provide bonus armies
                      </span>
                    </div>
                  ) : (
                    state.continents.map((continent) => {
                      const territoryCount = getContinentTerritoryCount(continent.id)
                      return (
                        <div key={continent.id} className="bg-surface-2 rounded p-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-4 h-4 rounded border border-gray-500"
                                style={{ backgroundColor: continent.color }}
                              />
                              <span className="font-medium text-sm">{continent.name}</span>
                              <span className="text-xs text-muted">
                                ({territoryCount} territories)
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span className="text-sm text-green-400">
                                +{continent.bonusArmies}
                              </span>
                              <button
                                onClick={() => editContinent(continent.id)}
                                className="text-xs bg-primary hover:bg-primary px-2 py-1 rounded"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteContinent(continent.id)}
                                className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {/* Show territories in this continent */}
                          {showContinentTerritories && territoryCount > 0 && (
                            <div className="mt-2 text-xs">
                              <div className="text-muted mb-1">Territories:</div>
                              <div className="flex flex-wrap gap-1">
                                {state.territories
                                  .filter((t) => t.continentId === continent.id)
                                  .map((territory) => (
                                    <span
                                      key={territory.id}
                                      className="bg-gray-600 px-2 py-1 rounded"
                                    >
                                      {territory.name}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Territories List */}
            <div className="bg-surface-1 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Territories ({state.territories.length})</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {state.territories.length === 0 ? (
                  <div className="text-sm text-muted text-center py-4">
                    No territories created yet
                    <br />
                    <span className="text-xs">Use the Territory Tool to draw new territories</span>
                  </div>
                ) : (
                  state.territories.map((territory) => {
                    const continent = state.continents.find((c) => c.id === territory.continentId)
                    return (
                      <div
                        key={territory.id}
                        className={`text-sm p-2 rounded border ${
                          state.selectedTerritory === territory.id
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface-2 hover:bg-gray-600 border-border'
                        }`}
                      >
                        <div
                          onClick={() =>
                            setState((prev) => ({ ...prev, selectedTerritory: territory.id }))
                          }
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{territory.name}</div>
                            {continent && (
                              <div
                                className="w-3 h-3 rounded border"
                                style={{ backgroundColor: continent.color }}
                                title={continent.name}
                              />
                            )}
                          </div>
                          <div className="text-xs opacity-75">
                            {continent ? continent.name : 'No continent'}
                          </div>
                        </div>

                        {/* Continent reassignment dropdown */}
                        {state.selectedTerritory === territory.id && (
                          <div className="mt-2 pt-2 border-t border-border">
                            <label className="block text-xs mb-1">Reassign to continent:</label>
                            <select
                              value={territory.continentId || ''}
                              onChange={(e) =>
                                reassignTerritoryContinent(
                                  territory.id,
                                  e.target.value || undefined,
                                )
                              }
                              className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-xs"
                            >
                              <option value="">No continent</option>
                              {state.continents.map((continent) => (
                                <option key={continent.id} value={continent.id}>
                                  {continent.name} (+{continent.bonusArmies})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-surface-1 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={validateMap}
                  className="w-full bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-sm"
                >
                  🔍 Validate Map
                </button>
                <button
                  onClick={clearMap}
                  className="w-full bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-sm"
                >
                  🗑️ Clear Map
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
