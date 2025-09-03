import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import ImageProcessor from '../components/ImageProcessor'
import TerritoryToken from '../components/TerritoryToken'

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

interface MapState {
  name: string
  imageUrl?: string
  territories: Territory[]
  continents: Continent[]
  selectedTerritoryId: string | null
  draggedTerritoryId: string | null
  mapWidth: number
  mapHeight: number
  imageScale: number  // Scale factor for resizing image
}

type EditorMode = 'territories' | 'continents' | 'connections' | 'capitals'
type TokenShape = 'hexagon' | 'square' | 'circle'

interface CapitalAssignments {
  [playerCount: string]: string[]  // Territory IDs for each player count
}

interface CapitalMetadata {
  generatedAt?: string
  algorithm?: string
  manuallyAdjusted?: {
    [playerCount: string]: boolean
  }
}

export default function MapEditorTokens() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<MapState>({
    name: 'New Map',
    imageUrl: undefined,
    territories: [],
    continents: [],
    selectedTerritoryId: null,
    draggedTerritoryId: null,
    mapWidth: 1200,
    mapHeight: 800,
    imageScale: 1,  // Default scale
  })

  const [showProcessor, setShowProcessor] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [selectedContinentId, setSelectedContinentId] = useState<string | null>(null)
  const [isPlacingTerritory, setIsPlacingTerritory] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('territories')
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)
  const [tokenShape, setTokenShape] = useState<TokenShape>('hexagon')
  const [showGrid, setShowGrid] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadInfo, setUploadInfo] = useState<string | null>(null)
  const [showImageOptions, setShowImageOptions] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)

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

    setImageFile(file)  // Store for later use
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      
      // Check image dimensions
      const img = new Image()
      img.onload = () => {
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
            setUploadInfo(`Image auto-expanded from ${img.width}×${img.height} to ${finalWidth}×${finalHeight}px`)
          }
        } else {
          setTempImageUrl(dataUrl)
          setUploadInfo(null)
        }
        
        // Update map dimensions
        setState((prev) => ({
          ...prev,
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

  // Handle map click based on mode
  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (state.draggedTerritoryId) return

    const rect = event.currentTarget.getBoundingClientRect()
    const scrollLeft = mapContainerRef.current?.scrollLeft || 0
    const scrollTop = mapContainerRef.current?.scrollTop || 0
    const x = event.clientX - rect.left + scrollLeft
    const y = event.clientY - rect.top + scrollTop

    if (editorMode === 'territories' && isPlacingTerritory) {
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
  const handleTokenClick = (territoryId: string, event: React.MouseEvent) => {
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
  const handleTokenMouseDown = (territoryId: string, event: React.MouseEvent) => {
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

  // Save map to database
  const handleSaveMap = async () => {
    try {
      if (state.territories.length < 2) {
        alert('Please add at least 2 territories before saving')
        return
      }
      // Continents are optional - removed requirement

      // Prepare map data for API
      const formData = new FormData()
      formData.append('name', state.name)
      formData.append(
        'description',
        `Map with ${state.territories.length} territories and ${state.continents.length} continents`,
      )
      formData.append('isPublic', 'true')
      formData.append('tags', JSON.stringify(['custom', 'user-created']))

      // Store territories and continents as metadata
      const metadata = {
        territories: state.territories,
        continents: state.continents,
        width: state.mapWidth,
        height: state.mapHeight,
      }
      formData.append('metadata', JSON.stringify(metadata))

      // If there's an image, convert data URL to blob and append
      if (state.imageUrl) {
        const response = await fetch(state.imageUrl)
        const blob = await response.blob()
        formData.append('image', blob, 'map-background.png')
      }

      // Save to backend
      console.log('Uploading map with data:', {
        name: state.name,
        territoriesCount: state.territories.length,
        continentsCount: state.continents.length,
        hasImage: !!state.imageUrl,
      })

      const result = await axios.post('/api/maps', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      console.log('Map upload successful:', result.data)
      alert('Map saved successfully! It will appear in the Create Game map selection.')
    } catch (error: any) {
      console.error('Map upload failed:', error)

      // Provide detailed error message
      let errorMessage = 'Failed to save map.'

      if (error.response) {
        // Server responded with error
        console.error('Server error response:', error.response.data)
        errorMessage += `\n\nServer error: ${error.response.data.error || error.response.data.message || 'Unknown server error'}`
        errorMessage += `\nStatus: ${error.response.status}`

        // Check for specific validation errors
        if (error.response.data.errors) {
          errorMessage += '\n\nValidation errors:'
          error.response.data.errors.forEach((err: any) => {
            errorMessage += `\n- ${err.msg || err.message}`
          })
        }
      } else if (error.request) {
        // Request was made but no response
        console.error('No response from server:', error.request)
        errorMessage += '\n\nNo response from server. Check your connection.'
      } else {
        // Error in request setup
        console.error('Request setup error:', error.message)
        errorMessage += `\n\nError: ${error.message}`
      }

      alert(errorMessage)
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
        const mapData = JSON.parse(content)

        // Validate the imported data structure
        if (!mapData.territories || !Array.isArray(mapData.territories)) {
          throw new Error('Invalid map data: missing territories')
        }

        // Load the imported map data
        setState({
          name: mapData.name || 'Imported Map',
          imageUrl: mapData.imageUrl || '',
          mapWidth: mapData.width || 1200,
          mapHeight: mapData.height || 800,
          territories: mapData.territories.map((t: any) => ({
            id: t.id,
            name: t.name || `Territory ${t.id}`,
            x: t.x || 0,
            y: t.y || 0,
            armies: t.armies || 1,
            connections: t.connections || [],
            continentId: t.continentId || null,
          })),
          continents: mapData.continents || [],
          selectedTerritoryId: null,
          draggedTerritoryId: null,
        })

        alert('Map imported successfully!')
      } catch (error) {
        console.error('Failed to import map:', error)
        alert('Failed to import map. Please check the file format.')
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
    setShowProcessor(true)
  }

  const handleScaleChange = (newScale: number) => {
    setState((prev) => ({
      ...prev,
      imageScale: newScale,
      mapWidth: Math.round(prev.mapWidth * (newScale / prev.imageScale)),
      mapHeight: Math.round(prev.mapHeight * (newScale / prev.imageScale)),
    }))
  }
  
  // Capital management functions
  const handleGenerateCapitals = async () => {
    if (!state.territories.length) {
      alert('Please add territories before generating capitals')
      return
    }
    
    // For now, just alert that we need to save the map first
    // In a complete implementation, we'd call the API after the map is saved
    alert('Please save the map to database first, then capitals can be generated')
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
        [playerCountStr]: currentCapitals.filter(id => id !== territoryId)
      }))
    } else if (currentCapitals.length < selectedPlayerCount) {
      // Add to capitals
      setCapitalAssignments((prev) => ({
        ...prev,
        [playerCountStr]: [...currentCapitals, territoryId]
      }))
      
      // Mark as manually adjusted
      setCapitalMetadata((prev) => ({
        ...prev,
        manuallyAdjusted: {
          ...prev.manuallyAdjusted,
          [playerCountStr]: true
        }
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Image Options Dialog */}
      {showImageOptions && tempImageUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">Image Import Options</h2>
            <p className="text-gray-400 mb-6">
              How would you like to use this image?
            </p>
            <div className="space-y-3">
              <button
                onClick={handleUseFullImage}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium flex items-center justify-between"
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
                className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium"
              >
                Cancel
              </button>
            </div>
            {uploadInfo && (
              <div className="mt-4 p-2 bg-blue-900/50 border border-blue-600 rounded text-blue-300 text-sm">
                ℹ️ {uploadInfo}
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="w-full max-w-[1920px] mx-auto">
        {' '}
        {/* Full width with max limit */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Map Editor (Token-Based)</h1>
          <div className="flex gap-4 items-center">
            <a 
              href="/map-editor-polygon" 
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm"
            >
              🏪 Try Polygon Editor (Beta)
            </a>
            <div className="text-sm text-gray-400">
              <p className="text-xs">Token-based: Place circular tokens as territories</p>
              <p className="text-xs">Polygon-based: Draw custom territory shapes</p>
            </div>
          </div>
        </div>
        {/* Toolbar */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Mode Selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setEditorMode('territories')}
                className={`px-4 py-2 rounded ${editorMode === 'territories' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                🗺️ Territories
              </button>
              <button
                onClick={() => setEditorMode('continents')}
                className={`px-4 py-2 rounded ${editorMode === 'continents' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                🌍 Continents
              </button>
              <button
                onClick={() => setEditorMode('connections')}
                className={`px-4 py-2 rounded ${editorMode === 'connections' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                🔗 Connections
              </button>
              <button
                onClick={() => setEditorMode('capitals')}
                className={`px-4 py-2 rounded ${editorMode === 'capitals' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                👑 Capitals
              </button>
            </div>

            {/* Token Shape */}
            <div className="flex gap-2 items-center">
              <span className="text-sm">Shape:</span>
              <button
                onClick={() => setTokenShape('hexagon')}
                className={`px-3 py-1 rounded text-sm ${tokenShape === 'hexagon' ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                Hexagon
              </button>
              <button
                onClick={() => setTokenShape('square')}
                className={`px-3 py-1 rounded text-sm ${tokenShape === 'square' ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                Square
              </button>
              <button
                onClick={() => setTokenShape('circle')}
                className={`px-3 py-1 rounded text-sm ${tokenShape === 'circle' ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                Circle
              </button>
            </div>

            {/* Map Size */}
            <div className="flex gap-2 items-center">
              <span className="text-sm">Map Size:</span>
              <input
                type="number"
                value={state.mapWidth}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, mapWidth: parseInt(e.target.value, 10) || 1200 }))
                }
                className="w-20 px-2 py-1 bg-gray-700 rounded text-sm"
                min="400"
                max="1600"
              />
              <span className="text-sm">×</span>
              <input
                type="number"
                value={state.mapHeight}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, mapHeight: parseInt(e.target.value, 10) || 800 }))
                }
                className="w-20 px-2 py-1 bg-gray-700 rounded text-sm"
                min="300"
                max="1200"
              />
            </div>

            {/* Image Scale Control */}
            {state.imageUrl && (
              <div className="flex gap-2 items-center">
                <span className="text-sm">Scale:</span>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={state.imageScale * 100}
                  onChange={(e) => handleScaleChange(parseInt(e.target.value) / 100)}
                  className="w-32"
                />
                <span className="text-xs text-gray-400">{Math.round(state.imageScale * 100)}%</span>
              </div>
            )}

            {/* Grid Toggle */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`px-3 py-1 rounded text-sm ${showGrid ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              📏 Grid
            </button>

            {/* Actions */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded"
            >
              📤 Upload Image
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded"
            >
              📥 Export JSON
            </button>
            <button
              onClick={() => document.getElementById('json-import')?.click()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded"
            >
              📤 Import JSON
            </button>
            <button
              onClick={handleSaveMap}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
            >
              💾 Save to Database
            </button>
          </div>

          {/* Mode-specific controls */}
          {editorMode === 'territories' && (
            <div className="mt-4 flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm">Continent:</span>
                <select
                  value={selectedContinentId || ''}
                  onChange={(e) => setSelectedContinentId(e.target.value)}
                  className="px-3 py-1 bg-gray-700 rounded text-white"
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
                onClick={() => setIsPlacingTerritory(!isPlacingTerritory)}
                className={`px-4 py-2 rounded ${isPlacingTerritory ? 'bg-green-600' : 'bg-gray-700'}`}
              >
                {isPlacingTerritory ? '🎯 Placing Territories' : '➕ Place Territory'}
              </button>
              {state.selectedTerritoryId && (
                <button
                  onClick={() => {
                    setState((prev) => ({
                      ...prev,
                      territories: prev.territories.filter(
                        (t) => t.id !== state.selectedTerritoryId,
                      ),
                    }))
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
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
                  className="px-3 py-1 bg-gray-700 rounded text-white"
                />
                <input
                  type="color"
                  value={newContinentColor}
                  onChange={(e) => setNewContinentColor(e.target.value)}
                  className="w-12 h-8 bg-gray-700 rounded cursor-pointer"
                />
                <input
                  type="number"
                  placeholder="Bonus"
                  value={newContinentBonus}
                  onChange={(e) => setNewContinentBonus(parseInt(e.target.value, 10) || 0)}
                  className="w-20 px-3 py-1 bg-gray-700 rounded text-white"
                  min="0"
                  max="10"
                />
                <button
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
                    onClick={() => {
                      setEditingContinentId(null)
                      setNewContinentName('')
                      setNewContinentColor('#3B82F6')
                      setNewContinentBonus(3)
                    }}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded"
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
                      onClick={() => {
                        setEditingContinentId(c.id)
                        setNewContinentName(c.name)
                        setNewContinentColor(c.color)
                        setNewContinentBonus(c.bonus)
                      }}
                      className="text-blue-400 hover:text-blue-300 text-sm px-1"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Delete continent "${c.name}"? Territories will become unassigned.`,
                          )
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
              <p className="text-sm text-gray-400">
                {isConnecting && connectingFromId
                  ? `Click another territory to connect/disconnect from ${state.territories.find((t) => t.id === connectingFromId)?.name}`
                  : 'Click a territory to start connecting'}
              </p>
              {isConnecting && (
                <button
                  onClick={() => {
                    setIsConnecting(false)
                    setConnectingFromId(null)
                  }}
                  className="mt-2 px-4 py-1 bg-gray-700 hover:bg-gray-600 rounded"
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
                  onClick={handleGenerateCapitals}
                  disabled={isGeneratingCapitals || state.territories.length < 2}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded"
                >
                  {isGeneratingCapitals ? '⏳ Generating...' : '✨ Generate Capitals'}
                </button>
                <span className="text-sm text-gray-400">
                  Auto-generate optimal starting positions for all player counts
                </span>
              </div>
              
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-sm">Player Count:</span>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((count) => (
                  <button
                    key={count}
                    onClick={() => setSelectedPlayerCount(count)}
                    disabled={state.territories.length < count}
                    className={`px-3 py-1 rounded text-sm ${
                      selectedPlayerCount === count
                        ? 'bg-blue-600'
                        : state.territories.length < count
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              
              <div className="flex gap-4 items-center">
                <button
                  onClick={() => setIsAssigningCapital(!isAssigningCapital)}
                  className={`px-4 py-2 rounded ${
                    isAssigningCapital ? 'bg-yellow-600' : 'bg-gray-700'
                  }`}
                >
                  {isAssigningCapital ? '🎯 Click Territories' : '📍 Assign Capitals'}
                </button>
                <div className="text-sm">
                  <span className="text-gray-400">Capitals for {selectedPlayerCount} players: </span>
                  <span className="text-white">
                    {(capitalAssignments[selectedPlayerCount.toString()] || []).length}/{selectedPlayerCount}
                  </span>
                </div>
              </div>
              
              {capitalAssignments[selectedPlayerCount.toString()]?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {capitalAssignments[selectedPlayerCount.toString()].map((territoryId, index) => {
                    const territory = state.territories.find(t => t.id === territoryId)
                    if (!territory) return null
                    const playerColors = ['#FF4444', '#4444FF', '#44FF44', '#FFFF44', '#FF44FF', '#44FFFF', '#FFA500', '#800080', '#00CED1', '#DC143C', '#32CD32', '#FFD700']
                    return (
                      <div
                        key={territoryId}
                        className="px-3 py-1 rounded text-sm"
                        style={{
                          backgroundColor: `${playerColors[index % playerColors.length]}20`,
                          border: `2px solid ${playerColors[index % playerColors.length]}`
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
        <div className="flex gap-4">
          {/* Map Canvas - Main area taking most space */}
          <div
            ref={mapContainerRef}
            className="flex-1 bg-gray-800 rounded-lg overflow-auto"
            style={{ height: 'calc(100vh - 280px)' }}
          >
            <div
              ref={containerRef}
              className="relative bg-gray-700"
              style={{
                width: `${state.mapWidth}px`,
                height: `${state.mapHeight}px`,
                backgroundImage: state.imageUrl ? `url(${state.imageUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
              onClick={handleMapClick}
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
                >
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

                return (
                  <div
                    key={territory.id}
                    className="absolute cursor-pointer"
                    style={{
                      left: territory.x - 10, // Adjust for smaller tokens
                      top: territory.y - 10,
                      transform: 'translate(-50%, -50%)',
                    }}
                    onMouseDown={(e) => handleTokenMouseDown(territory.id, e)}
                    onClick={(e) => handleTokenClick(territory.id, e)}
                  >
                    <TerritoryToken
                      x={0}
                      y={0}
                      armies={territory.armies}
                      color={continent?.color || '#808080'} // Gray for unassigned
                      outlineColor={continent?.color} // Continent color for outline
                      shape={tokenShape}
                      isSelected={state.selectedTerritoryId === territory.id}
                      isDragging={state.draggedTerritoryId === territory.id}
                      size={20} // Smaller tokens
                      opacity={0.7}
                    />
                    {editorMode === 'capitals' && getCapitalForTerritory(territory.id) && (
                      <div className="absolute -top-3 -right-3 text-lg">
                        <span className="bg-yellow-500 text-black rounded-full px-1.5 py-0.5 text-xs font-bold">
                          {getCapitalForTerritory(territory.id)}
                        </span>
                      </div>
                    )}
                    {state.selectedTerritoryId === territory.id && (
                      <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs bg-black/80 px-2 py-1 rounded whitespace-nowrap">
                        {territory.name}
                      </div>
                    )}
                  </div>
                )
              })}

              {!state.imageUrl && !isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    {/* Upload Error Display */}
                    {uploadError && (
                      <div className="mb-4 p-2 bg-red-900/50 border border-red-600 rounded text-red-300 text-sm max-w-md">
                        ❌ {uploadError}
                      </div>
                    )}
                    <p className="text-gray-400 mb-2">Drop an image here or</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                    >
                      Upload Map Image
                    </button>
                    <div className="mt-4 text-xs text-gray-500">
                      <p>💡 Min: 400×300px | Max: 1600×1200px</p>
                      <p>⚡ Small images auto-expand to minimum size</p>
                      <p>✨ Supports PNG, JPG, GIF, WEBP, SVG</p>
                    </div>
                  </div>
                </div>
              )}

              {isDragOver && (
                <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                  <p className="text-2xl text-white">Drop image here</p>
                </div>
              )}
            </div>
          </div>

          {/* Properties Panel - Fixed right sidebar */}
          <div
            className="w-80 bg-gray-800 rounded-lg p-4 flex-shrink-0 overflow-y-auto"
            style={{ height: 'calc(100vh - 280px)' }}
          >
            <h2 className="text-xl font-bold mb-4">Properties</h2>

            {/* Map Name */}
            <div className="mb-4">
              <label className="block text-sm mb-1">Map Name</label>
              <input
                type="text"
                value={state.name}
                onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-1 bg-gray-700 rounded text-white"
              />
            </div>

            {/* Statistics */}
            <div className="mb-4 text-sm space-y-1">
              <p>Territories: {state.territories.length}</p>
              <p>Continents: {state.continents.length}</p>
              <p>
                Connections:{' '}
                {state.territories.reduce((acc, t) => acc + t.connections.length, 0) / 2}
              </p>
            </div>

            {/* Selected Territory */}
            {state.selectedTerritoryId && (
              <div className="mb-4 p-3 bg-gray-700 rounded">
                <h3 className="font-bold mb-2">Selected Territory</h3>
                {(() => {
                  const territory = state.territories.find(
                    (t) => t.id === state.selectedTerritoryId,
                  )
                  const _continent = territory ? getContinentForTerritory(territory.id) : null
                  if (!territory) return null

                  return (
                    <>
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
                      <div className="mb-2">
                        <label className="text-xs text-gray-400">Continent:</label>
                        <select
                          value={territory.continentId || ''}
                          onChange={(e) => {
                            setState((prev) => ({
                              ...prev,
                              territories: prev.territories.map((t) =>
                                t.id === state.selectedTerritoryId
                                  ? { ...t, continentId: e.target.value || null }
                                  : t,
                              ),
                            }))
                          }}
                          className="w-full px-2 py-1 bg-gray-600 rounded text-white text-sm"
                        >
                          <option value="">Unassigned</option>
                          {state.continents.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-sm text-gray-400">
                        Position: ({Math.round(territory.x)}, {Math.round(territory.y)})
                      </p>
                      <p className="text-sm text-gray-400">
                        Connections: {territory.connections.length}
                      </p>
                      {territory.connections.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-400 mb-1">Connected to:</p>
                          <div className="space-y-1">
                            {territory.connections.map((connId) => {
                              const connTerritory = state.territories.find((t) => t.id === connId)
                              return connTerritory ? (
                                <div
                                  key={connId}
                                  className="flex items-center justify-between text-xs bg-gray-600 px-2 py-1 rounded"
                                >
                                  <span>{connTerritory.name}</span>
                                  <button
                                    onClick={() => {
                                      setState((prev) => ({
                                        ...prev,
                                        territories: prev.territories.map((t) => {
                                          if (t.id === territory.id) {
                                            return {
                                              ...t,
                                              connections: t.connections.filter(
                                                (id) => id !== connId,
                                              ),
                                            }
                                          }
                                          if (t.id === connId) {
                                            return {
                                              ...t,
                                              connections: t.connections.filter(
                                                (id) => id !== territory.id,
                                              ),
                                            }
                                          }
                                          return t
                                        }),
                                      }))
                                    }}
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : null
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
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
          id="json-import"
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
            maxFileSize={10}
          />
        )}
      </div>
    </div>
  )
}
