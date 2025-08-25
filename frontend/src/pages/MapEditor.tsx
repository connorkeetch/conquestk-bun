import { useState, useRef, useCallback, useEffect } from 'react'
import { mapService, CustomMap, MapTerritory, MapContinent, TerritoryAbilityType, GameMode, Coordinate } from '../services/mapService'

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
  adjacencies: Array<{ from: string; to: string }>
  firstSelectedTerritory?: string
}

export default function MapEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [state, setState] = useState<EditorState>({
    selectedTool: 'select',
    territories: [],
    continents: [],
    isDrawing: false,
    currentPolygon: [],
    imageWidth: 800,
    imageHeight: 600,
    adjacencies: [],
    firstSelectedTerritory: undefined
  })

  const [territoryAbilities, setTerritoryAbilities] = useState<TerritoryAbilityType[]>([])
  const [gameModes, setGameModes] = useState<GameMode[]>([])
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Load metadata on component mount
  useEffect(() => {
    loadMetadata()
  }, [])

  const loadMetadata = async () => {
    try {
      const [abilities, modes] = await Promise.all([
        mapService.getTerritoryAbilityTypes(),
        mapService.getGameModes()
      ])
      setTerritoryAbilities(abilities)
      setGameModes(modes)
    } catch (error) {
      console.error('Error loading metadata:', error)
    }
  }

  // Canvas drawing setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw background image if loaded
    if (state.imageUrl) {
      console.log('🎨 Canvas: Attempting to draw image:', {
        isDataUrl: state.imageUrl.startsWith('data:'),
        imageUrlLength: state.imageUrl.length,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height
      })
      
      const img = new Image()
      // No need for crossOrigin with data URLs
      img.onload = () => {
        console.log('✅ Canvas: Image loaded for drawing:', {
          width: img.width,
          height: img.height,
          complete: img.complete
        })
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        redrawTerritories(ctx)
      }
      
      img.onerror = (event) => {
        console.error('❌ Canvas: Failed to load image for drawing:', {
          event,
          isDataUrl: state.imageUrl?.startsWith('data:'),
          urlLength: state.imageUrl?.length
        })
      }
      
      // Use the image URL directly for data URLs, or process it for relative URLs
      const imageUrl = state.imageUrl.startsWith('data:') 
        ? state.imageUrl 
        : mapService.getImageUrl(state.imageUrl)
      console.log('🔄 Canvas: Setting img.src, isDataUrl:', imageUrl.startsWith('data:'))
      img.src = imageUrl
    } else {
      // Draw grid background
      drawGrid(ctx)
      redrawTerritories(ctx)
      drawAdjacencies(ctx)
    }
  }, [state.imageUrl, state.territories, state.continents, state.selectedTerritory, state.adjacencies, state.firstSelectedTerritory])

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
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
  }

  const redrawTerritories = (ctx: CanvasRenderingContext2D) => {
    // Draw territories
    state.territories.forEach(territory => {
      const continent = state.continents.find(c => c.id === territory.continentId)
      const isSelected = state.selectedTerritory === territory.id

      ctx.fillStyle = continent ? `${continent.color}80` : '#6B728080'
      ctx.strokeStyle = isSelected ? '#FFD700' : '#374151'
      ctx.lineWidth = isSelected ? 3 : 2

      // Draw territory polygon
      if (territory.boundaryCoords.length > 0) {
        ctx.beginPath()
        ctx.moveTo(territory.boundaryCoords[0].x, territory.boundaryCoords[0].y)
        territory.boundaryCoords.slice(1).forEach(coord => {
          ctx.lineTo(coord.x, coord.y)
        })
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Draw territory name
        ctx.fillStyle = '#FFFFFF'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(
          territory.name,
          territory.armyPosition.x,
          territory.armyPosition.y
        )
      }
    })

    // Draw current polygon being drawn
    if (state.isDrawing && state.currentPolygon.length > 0) {
      ctx.strokeStyle = '#60A5FA'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])

      ctx.beginPath()
      ctx.moveTo(state.currentPolygon[0].x, state.currentPolygon[0].y)
      state.currentPolygon.slice(1).forEach(coord => {
        ctx.lineTo(coord.x, coord.y)
      })
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  const drawAdjacencies = (ctx: CanvasRenderingContext2D) => {
    // Draw adjacency lines
    state.adjacencies.forEach(adjacency => {
      const fromTerritory = state.territories.find(t => t.id === adjacency.from)
      const toTerritory = state.territories.find(t => t.id === adjacency.to)
      
      if (fromTerritory && toTerritory) {
        ctx.strokeStyle = '#10B981'
        ctx.lineWidth = 3
        ctx.setLineDash([10, 5])
        
        ctx.beginPath()
        ctx.moveTo(fromTerritory.armyPosition.x, fromTerritory.armyPosition.y)
        ctx.lineTo(toTerritory.armyPosition.x, toTerritory.armyPosition.y)
        ctx.stroke()
        ctx.setLineDash([])
        
        // Draw connection dots
        ctx.fillStyle = '#10B981'
        ctx.beginPath()
        ctx.arc(fromTerritory.armyPosition.x, fromTerritory.armyPosition.y, 4, 0, 2 * Math.PI)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(toTerritory.armyPosition.x, toTerritory.armyPosition.y, 4, 0, 2 * Math.PI)
        ctx.fill()
      }
    })
    
    // Highlight first selected territory in adjacency mode
    if (state.selectedTool === 'adjacency' && state.firstSelectedTerritory) {
      const firstTerritory = state.territories.find(t => t.id === state.firstSelectedTerritory)
      if (firstTerritory) {
        ctx.strokeStyle = '#F59E0B'
        ctx.lineWidth = 4
        ctx.setLineDash([8, 4])
        
        ctx.beginPath()
        ctx.arc(firstTerritory.armyPosition.x, firstTerritory.armyPosition.y, 20, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    if (state.selectedTool === 'territory') {
      if (!state.isDrawing) {
        // Start drawing new territory
        setState(prev => ({
          ...prev,
          isDrawing: true,
          currentPolygon: [{ x, y }]
        }))
      } else {
        // Add point to current polygon
        setState(prev => ({
          ...prev,
          currentPolygon: [...prev.currentPolygon, { x, y }]
        }))
      }
    } else if (state.selectedTool === 'select') {
      // Select territory
      const clickedTerritory = findTerritoryAtPoint(x, y)
      setState(prev => ({
        ...prev,
        selectedTerritory: clickedTerritory?.id
      }))
    } else if (state.selectedTool === 'adjacency') {
      // Handle adjacency creation
      const clickedTerritory = findTerritoryAtPoint(x, y)
      if (!clickedTerritory) return
      
      if (!state.firstSelectedTerritory) {
        // First territory selection
        setState(prev => ({
          ...prev,
          firstSelectedTerritory: clickedTerritory.id,
          selectedTerritory: clickedTerritory.id
        }))
      } else if (state.firstSelectedTerritory !== clickedTerritory.id) {
        // Second territory selection - create adjacency
        const newAdjacency = { 
          from: state.firstSelectedTerritory, 
          to: clickedTerritory.id 
        }
        
        // Check if adjacency already exists
        const exists = state.adjacencies.some(adj => 
          (adj.from === newAdjacency.from && adj.to === newAdjacency.to) ||
          (adj.from === newAdjacency.to && adj.to === newAdjacency.from)
        )
        
        if (!exists) {
          setState(prev => ({
            ...prev,
            adjacencies: [...prev.adjacencies, newAdjacency],
            firstSelectedTerritory: undefined,
            selectedTerritory: undefined
          }))
        } else {
          // Reset selection if adjacency already exists
          setState(prev => ({
            ...prev,
            firstSelectedTerritory: undefined,
            selectedTerritory: undefined
          }))
        }
      } else {
        // Same territory clicked - deselect
        setState(prev => ({
          ...prev,
          firstSelectedTerritory: undefined,
          selectedTerritory: undefined
        }))
      }
    }
  }, [state.selectedTool, state.isDrawing, state.territories])

  const handleCanvasDoubleClick = useCallback(() => {
    if (state.selectedTool === 'territory' && state.isDrawing && state.currentPolygon.length >= 3) {
      finishTerritory()
    }
  }, [state.selectedTool, state.isDrawing, state.currentPolygon])

  const finishTerritory = () => {
    if (!newTerritoryName.trim() || state.currentPolygon.length < 3) return

    // Calculate center point for army position
    const centerX = state.currentPolygon.reduce((sum, p) => sum + p.x, 0) / state.currentPolygon.length
    const centerY = state.currentPolygon.reduce((sum, p) => sum + p.y, 0) / state.currentPolygon.length

    const newTerritory: MapTerritory = {
      id: `temp_${Date.now()}`,
      mapId: state.currentMap?.id || 'temp',
      territoryId: newTerritoryName.toLowerCase().replace(/\s+/g, '_'),
      name: newTerritoryName,
      continentId: state.selectedContinent,
      boundaryCoords: state.currentPolygon,
      armyPosition: { x: centerX, y: centerY },
      startingArmies: 1,
      createdAt: new Date().toISOString()
    }

    setState(prev => ({
      ...prev,
      territories: [...prev.territories, newTerritory],
      isDrawing: false,
      currentPolygon: [],
      selectedTerritory: newTerritory.id
    }))

    setNewTerritoryName('')
  }

  const findTerritoryAtPoint = (x: number, y: number): MapTerritory | undefined => {
    return state.territories.find(territory => {
      return isPointInPolygon({ x, y }, territory.boundaryCoords)
    })
  }

  const isPointInPolygon = (point: Coordinate, polygon: Coordinate[]): boolean => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
          (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
        inside = !inside
      }
    }
    return inside
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    processImageFile(file)
  }

  const processImageFile = (file: File) => {
    // Clear previous errors
    setUploadError(null)
    
    console.log('🖼️ Processing image file:', {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: new Date(file.lastModified).toISOString()
    })
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      const error = `Invalid file type: ${file.type}. Please select an image file (PNG, JPG, GIF, WEBP)`
      console.error('❌ File validation failed:', error)
      setUploadError(error)
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      const error = `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Image file must be smaller than 10MB`
      console.error('❌ File size validation failed:', error)
      setUploadError(error)
      return
    }

    setIsUploading(true)
    setUploadProgress(10)
    
    // Store the actual file for upload
    setSelectedFile(file)
    
    // Use FileReader API for better compatibility (avoids blob URL security issues)
    const reader = new FileReader()
    
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      console.log('✅ File converted to data URL, length:', dataUrl.length)
      setUploadProgress(50)
      
      // Get image dimensions
      const img = new Image()
      
      img.onload = () => {
        console.log('✅ Image loaded successfully:', {
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          dataUrlLength: dataUrl.length
        })
        
        setState(prev => ({
          ...prev,
          imageUrl: dataUrl,
          imageWidth: img.width,
          imageHeight: img.height
        }))
        
        setUploadProgress(100)
        setTimeout(() => {
          setIsUploading(false)
          setUploadProgress(0)
          console.log('✅ Image upload process completed')
        }, 500)
      }
      
      img.onerror = (event) => {
        console.error('❌ Image load error:', {
          event,
          dataUrlLength: dataUrl.length,
          file: {
            name: file.name,
            type: file.type,
            size: file.size
          }
        })
        
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
      
      console.log('🔄 Setting image src to data URL...')
      img.src = dataUrl
    }
    
    reader.onerror = (error) => {
      console.error('❌ FileReader error:', error)
      setUploadError('Failed to read the image file. Please try again.')
      setIsUploading(false)
      setUploadProgress(0)
    }
    
    // Start reading the file as data URL
    console.log('🔄 Reading file as data URL...')
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
    const imageFile = files.find(file => file.type.startsWith('image/'))
    
    if (imageFile) {
      processImageFile(imageFile)
    } else {
      alert('Please drop an image file (PNG, JPG, GIF, WEBP)')
    }
  }

  const createContinent = () => {
    if (!newContinentName.trim()) {
      alert('Please enter a continent name')
      return
    }

    // Check for duplicate names
    if (state.continents.some(c => c.name.toLowerCase() === newContinentName.trim().toLowerCase())) {
      alert('A continent with this name already exists')
      return
    }

    // Validate bonus armies range
    if (newContinentBonus < 1 || newContinentBonus > 20) {
      alert('Bonus armies must be between 1 and 20')
      return
    }

    const newContinent: MapContinent = {
      id: `temp_${Date.now()}`,
      mapId: state.currentMap?.id || 'temp',
      name: newContinentName.trim(),
      bonusArmies: newContinentBonus,
      color: newContinentColor,
      createdAt: new Date().toISOString()
    }

    setState(prev => ({
      ...prev,
      continents: [...prev.continents, newContinent]
    }))

    setNewContinentName('')
    setNewContinentBonus(2)
    setNewContinentColor('#3B82F6')
  }

  const editContinent = (continentId: string) => {
    const continent = state.continents.find(c => c.id === continentId)
    if (!continent) return

    setNewContinentName(continent.name)
    setNewContinentBonus(continent.bonusArmies)
    setNewContinentColor(continent.color)
    setEditingContinent(continentId)
  }

  const updateContinent = () => {
    if (!editingContinent || !newContinentName.trim()) return

    // Check for duplicate names (excluding current continent)
    if (state.continents.some(c => c.id !== editingContinent && c.name.toLowerCase() === newContinentName.trim().toLowerCase())) {
      alert('A continent with this name already exists')
      return
    }

    // Validate bonus armies range
    if (newContinentBonus < 1 || newContinentBonus > 20) {
      alert('Bonus armies must be between 1 and 20')
      return
    }

    setState(prev => ({
      ...prev,
      continents: prev.continents.map(c => 
        c.id === editingContinent 
          ? { ...c, name: newContinentName.trim(), bonusArmies: newContinentBonus, color: newContinentColor }
          : c
      )
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
    const continent = state.continents.find(c => c.id === continentId)
    if (!continent) return

    const territoriesInContinent = state.territories.filter(t => t.continentId === continentId)
    
    if (territoriesInContinent.length > 0) {
      if (!confirm(`Continent "${continent.name}" contains ${territoriesInContinent.length} territories. Are you sure you want to delete it? Territories will be moved to "No Continent".`)) {
        return
      }

      // Remove continent assignment from territories
      setState(prev => ({
        ...prev,
        territories: prev.territories.map(t => 
          t.continentId === continentId ? { ...t, continentId: undefined } : t
        ),
        continents: prev.continents.filter(c => c.id !== continentId)
      }))
    } else {
      setState(prev => ({
        ...prev,
        continents: prev.continents.filter(c => c.id !== continentId)
      }))
    }

    // Cancel editing if this continent was being edited
    if (editingContinent === continentId) {
      cancelEditContinent()
    }
  }

  const getContinentTerritoryCount = (continentId: string) => {
    return state.territories.filter(t => t.continentId === continentId).length
  }

  const reassignTerritoryContinent = (territoryId: string, newContinentId: string | undefined) => {
    setState(prev => ({
      ...prev,
      territories: prev.territories.map(t => 
        t.id === territoryId ? { ...t, continentId: newContinentId } : t
      )
    }))
  }

  const saveMap = async () => {
    if (!mapName.trim()) {
      alert('Please enter a map name')
      return
    }

    setSaveStatus('saving')
    
    try {
      // Create or update map
      const mapData = {
        name: mapName,
        description: mapDescription,
        isPublic,
        tags: ['custom']
      }

      const savedMap = await mapService.createMap(mapData, selectedFile || undefined)
      
      // Save continents
      const savedContinents = []
      for (const continent of state.continents) {
        const saved = await mapService.createContinent(savedMap.id, {
          name: continent.name,
          bonusArmies: continent.bonusArmies,
          color: continent.color
        })
        savedContinents.push(saved)
      }

      // Save territories and collect mapping for adjacencies
      const savedTerritories = []
      for (const territory of state.territories) {
        const continentId = savedContinents.find(c => c.name === state.continents.find(sc => sc.id === territory.continentId)?.name)?.id
        
        const savedTerritory = await mapService.createTerritory({
          mapId: savedMap.id,
          territoryId: territory.territoryId,
          name: territory.name,
          continentId,
          boundaryCoords: territory.boundaryCoords,
          armyPosition: territory.armyPosition,
          startingArmies: territory.startingArmies
        })
        savedTerritories.push({ editorId: territory.id, savedId: savedTerritory.id })
      }

      // Save adjacencies
      for (const adjacency of state.adjacencies) {
        const fromMapping = savedTerritories.find(t => t.editorId === adjacency.from)
        const toMapping = savedTerritories.find(t => t.editorId === adjacency.to)
        
        if (fromMapping && toMapping) {
          await mapService.createAdjacency({
            fromTerritoryId: fromMapping.savedId,
            toTerritoryId: toMapping.savedId,
            connectionType: 'land',
            isBidirectional: true
          })
        }
      }

      setState(prev => ({ ...prev, currentMap: savedMap }))
      setSaveStatus('saved')
      
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error: any) {
      console.error('Error saving map:', error)
      setSaveStatus('error')
      setSaveError(error.message || 'Failed to save map. Please try again.')
      setTimeout(() => {
        setSaveStatus('idle')
        setSaveError(null)
      }, 5000)
    }
  }

  const clearMap = () => {
    if (confirm('Are you sure you want to clear the entire map? This cannot be undone.')) {
      setState(prev => ({
        ...prev,
        territories: [],
        continents: [],
        currentPolygon: [],
        isDrawing: false,
        selectedTerritory: undefined,
        selectedContinent: undefined,
        imageUrl: undefined,
        adjacencies: [],
        firstSelectedTerritory: undefined
      }))
      setMapName('')
      setMapDescription('')
      setSelectedFile(null)
    }
  }

  const validateMap = () => {
    const validation = mapService.validateMapData(state.territories, [])
    
    if (validation.isValid) {
      alert('✅ Map validation passed! Your map is ready to use.')
    } else {
      alert(`❌ Map validation failed:\n\n${validation.errors.join('\n')}`)
    }
  }

  const selectedTerritoryData = state.territories.find(t => t.id === state.selectedTerritory)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
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
            {saveStatus === 'saving' ? '💾 Saving...' : 
             saveStatus === 'saved' ? '✅ Saved' :
             saveStatus === 'error' ? '❌ Error' : '💾 Save Map'}
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
            onClick={validateMap}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-medium"
          >
            🔍 Validate Map
          </button>
          <button 
            onClick={clearMap}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-medium"
          >
            🗑️ Clear All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Canvas */}
        <div className="lg:col-span-3">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Map Canvas</h2>
            <div className="bg-gray-700 rounded overflow-hidden">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                onClick={handleCanvasClick}
                onDoubleClick={handleCanvasDoubleClick}
                className="w-full cursor-crosshair border border-gray-600"
                style={{ maxHeight: '600px' }}
              />
            </div>
            <div className="mt-4 text-sm text-gray-400">
              <p><strong>How to Create Your Map:</strong></p>
              <div className="space-y-1 mt-2">
                <p><span className="text-blue-400">1.</span> Upload a background image (PNG/JPG) of your map</p>
                <p><span className="text-blue-400">2.</span> Create continents with bonus armies</p>
                <p><span className="text-blue-400">3.</span> Use Territory Tool to trace territories on the image</p>
                <p><span className="text-blue-400">4.</span> Assign territories to continents</p>
                <p><span className="text-blue-400">5.</span> Connect territories with adjacency lines</p>
                <p><span className="text-blue-400">6.</span> Save your custom map!</p>
              </div>
              <div className="mt-3 p-2 bg-gray-700 rounded text-xs">
                <p><strong>Controls:</strong> Click to add points • Double-click to finish • Right-click to cancel</p>
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
                  className={`bg-gray-700 rounded-lg p-3 border-2 border-dashed transition-colors ${
                    isDragOver 
                      ? 'border-blue-400 bg-blue-900/20' 
                      : 'border-gray-600'
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
                    
                    {/* Upload Progress Bar */}
                    {isUploading && (
                      <div className="mb-3 space-y-1">
                        <div className="text-slate-300 text-xs">Processing image...</div>
                        <div className="w-full bg-slate-700 rounded-full h-1.5">
                          <div 
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-slate-400">{uploadProgress}%</div>
                      </div>
                    )}
                    
                    {state.imageUrl ? (
                      <div className="space-y-2">
                        <div className="text-sm text-emerald-400 font-medium">✅ Image Loaded</div>
                        <div className="text-xs text-slate-400">
                          {state.imageWidth} × {state.imageHeight} pixels
                        </div>
                        <div className="flex justify-center space-x-2">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs transition-colors"
                            disabled={isUploading}
                          >
                            Change
                          </button>
                          <button 
                            onClick={() => {
                              setState(prev => ({ ...prev, imageUrl: undefined }))
                              setSelectedFile(null)
                              setUploadError(null)
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
                        <div className="text-2xl">
                          {isDragOver ? '📂' : '🖼️'}
                        </div>
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
                              PNG, JPG, GIF, WEBP (max 10MB)
                            </>
                          )}
                        </div>
                        {!isDragOver && !isUploading && (
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium transition-colors"
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

              {/* Map Details */}
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-200">Map Name</label>
                <input
                  type="text"
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                  className="max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="Enter map name..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-200">Description</label>
                <textarea
                  value={mapDescription}
                  onChange={(e) => setMapDescription(e.target.value)}
                  className="max-w-md w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
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
                  className="rounded text-blue-500 bg-slate-700 border-slate-600 focus:ring-blue-500"
                />
                <label htmlFor="isPublic" className="text-sm text-slate-200">Make Public</label>
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
                { id: 'adjacency', name: '🔗 Connection Tool', desc: 'Connect territories' }
              ].map(tool => (
                <button
                  key={tool.id}
                  onClick={() => setState(prev => ({ ...prev, selectedTool: tool.id as EditorTool }))}
                  className={`w-full px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    state.selectedTool === tool.id
                      ? 'bg-blue-600 text-white'
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
                  <label className="block text-sm font-medium mb-1 text-slate-200">Territory Name</label>
                  <input
                    type="text"
                    value={newTerritoryName}
                    onChange={(e) => setNewTerritoryName(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="Enter name..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-200">Continent</label>
                  <select 
                    value={state.selectedContinent || ''}
                    onChange={(e) => setState(prev => ({ ...prev, selectedContinent: e.target.value || undefined }))}
                    className="w-full max-w-xs px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  >
                    <option value="">No continent</option>
                    {state.continents.map(continent => (
                      <option key={continent.id} value={continent.id}>{continent.name}</option>
                    ))}
                  </select>
                </div>
                {state.isDrawing && (
                  <div className="text-sm text-blue-400">
                    Drawing... ({state.currentPolygon.length} points)
                    <br />
                    <button 
                      onClick={finishTerritory}
                      className="mt-2 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs"
                    >
                      Finish Territory
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Continent Management */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Continents ({state.continents.length})</h3>
              <button
                onClick={() => setShowContinentTerritories(!showContinentTerritories)}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
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
                    className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                    placeholder="Continent name..."
                  />
                  <input
                    type="number"
                    value={newContinentBonus}
                    onChange={(e) => setNewContinentBonus(parseInt(e.target.value) || 2)}
                    className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
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
                    className="flex-1 h-8 bg-gray-700 border border-gray-600 rounded"
                  />
                  {editingContinent ? (
                    <>
                      <button
                        onClick={updateContinent}
                        className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
                      >
                        Update
                      </button>
                      <button
                        onClick={cancelEditContinent}
                        className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={createContinent}
                      className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>

              {/* Continents List */}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {state.continents.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-4">
                    No continents created yet
                    <br />
                    <span className="text-xs">Continents group territories and provide bonus armies</span>
                  </div>
                ) : (
                  state.continents.map(continent => {
                    const territoryCount = getContinentTerritoryCount(continent.id)
                    return (
                      <div key={continent.id} className="bg-gray-700 rounded p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-4 h-4 rounded border border-gray-500"
                              style={{ backgroundColor: continent.color }}
                            />
                            <span className="font-medium text-sm">{continent.name}</span>
                            <span className="text-xs text-gray-400">({territoryCount} territories)</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="text-sm text-green-400">+{continent.bonusArmies}</span>
                            <button
                              onClick={() => editContinent(continent.id)}
                              className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
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
                            <div className="text-gray-400 mb-1">Territories:</div>
                            <div className="flex flex-wrap gap-1">
                              {state.territories
                                .filter(t => t.continentId === continent.id)
                                .map(territory => (
                                  <span key={territory.id} className="bg-gray-600 px-2 py-1 rounded">
                                    {territory.name}
                                  </span>
                                ))
                              }
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
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Territories ({state.territories.length})</h3>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {state.territories.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-4">
                  No territories created yet
                  <br />
                  <span className="text-xs">Use the Territory Tool to draw new territories</span>
                </div>
              ) : (
                state.territories.map(territory => {
                  const continent = state.continents.find(c => c.id === territory.continentId)
                  return (
                    <div 
                      key={territory.id}
                      className={`text-sm p-2 rounded border ${
                        state.selectedTerritory === territory.id 
                          ? 'bg-blue-600 text-white border-blue-400' 
                          : 'bg-gray-700 hover:bg-gray-600 border-gray-600'
                      }`}
                    >
                      <div 
                        onClick={() => setState(prev => ({ ...prev, selectedTerritory: territory.id }))}
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
                        <div className="mt-2 pt-2 border-t border-gray-600">
                          <label className="block text-xs mb-1">Reassign to continent:</label>
                          <select 
                            value={territory.continentId || ''}
                            onChange={(e) => reassignTerritoryContinent(territory.id, e.target.value || undefined)}
                            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-xs"
                          >
                            <option value="">No continent</option>
                            {state.continents.map(continent => (
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
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Actions</h3>
            <div className="space-y-2">
              <button 
                onClick={validateMap}
                className="w-full bg-yellow-600 hover:bg-yellow-700 px-3 py-2 rounded text-sm"
              >
                🔍 Validate Map
              </button>
              <button 
                onClick={clearMap}
                className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm"
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