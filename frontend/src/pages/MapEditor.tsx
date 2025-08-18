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
  const [isPublic, setIsPublic] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

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
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        redrawTerritories(ctx)
      }
      img.src = mapService.getImageUrl(state.imageUrl)
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

    // Store the actual file for upload
    setSelectedFile(file)
    
    // Create preview URL for canvas display
    const imageUrl = URL.createObjectURL(file)
    
    // Get image dimensions
    const img = new Image()
    img.onload = () => {
      setState(prev => ({
        ...prev,
        imageUrl,
        imageWidth: img.width,
        imageHeight: img.height
      }))
    }
    img.src = imageUrl
  }

  const createContinent = () => {
    if (!newContinentName.trim()) return

    const newContinent: MapContinent = {
      id: `temp_${Date.now()}`,
      mapId: state.currentMap?.id || 'temp',
      name: newContinentName,
      bonusArmies: newContinentBonus,
      color: newContinentColor,
      createdAt: new Date().toISOString()
    }

    setState(prev => ({
      ...prev,
      continents: [...prev.continents, newContinent]
    }))

    setNewContinentName('')
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
    } catch (error) {
      console.error('Error saving map:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">🗺️ Map Editor</h1>
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            📷 Upload Image
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
              <p><strong>Instructions:</strong></p>
              <p>• Select "Territory Tool" to draw territories by clicking to add points</p>
              <p>• Double-click to finish drawing a territory</p>
              <p>• Use "Select Tool" to click and select existing territories</p>
              <p>• Upload a background image to trace territories over</p>
            </div>
          </div>
        </div>

        {/* Tools Panel */}
        <div className="space-y-4">
          {/* Map Info */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Map Info</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Map Name</label>
                <input
                  type="text"
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                  placeholder="Enter map name..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={mapDescription}
                  onChange={(e) => setMapDescription(e.target.value)}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                  rows={2}
                  placeholder="Describe your map..."
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="isPublic" className="text-sm">Make Public</label>
              </div>
            </div>
          </div>

          {/* Tools */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Tools</h3>
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
                  className={`w-full px-3 py-2 rounded text-sm text-left ${
                    state.selectedTool === tool.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600'
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
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">New Territory</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Territory Name</label>
                  <input
                    type="text"
                    value={newTerritoryName}
                    onChange={(e) => setNewTerritoryName(e.target.value)}
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                    placeholder="Enter name..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Continent</label>
                  <select 
                    value={state.selectedContinent || ''}
                    onChange={(e) => setState(prev => ({ ...prev, selectedContinent: e.target.value || undefined }))}
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
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
            <h3 className="text-lg font-bold mb-3">Continents</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newContinentName}
                  onChange={(e) => setNewContinentName(e.target.value)}
                  className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                  placeholder="Name..."
                />
                <input
                  type="number"
                  value={newContinentBonus}
                  onChange={(e) => setNewContinentBonus(parseInt(e.target.value) || 2)}
                  className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                  placeholder="Bonus"
                  min="1"
                  max="10"
                />
              </div>
              <div className="flex space-x-2">
                <input
                  type="color"
                  value={newContinentColor}
                  onChange={(e) => setNewContinentColor(e.target.value)}
                  className="flex-1 h-8 bg-gray-700 border border-gray-600 rounded"
                />
                <button
                  onClick={createContinent}
                  className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm"
                >
                  Add
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {state.continents.length === 0 ? (
                  <div className="text-sm text-gray-400">No continents created</div>
                ) : (
                  state.continents.map(continent => (
                    <div key={continent.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-4 h-4 rounded border border-gray-500"
                          style={{ backgroundColor: continent.color }}
                        />
                        <span>{continent.name}</span>
                      </div>
                      <span className="text-gray-400">+{continent.bonusArmies}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Territories List */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Territories ({state.territories.length})</h3>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {state.territories.length === 0 ? (
                <div className="text-sm text-gray-400">No territories created yet</div>
              ) : (
                state.territories.map(territory => {
                  const continent = state.continents.find(c => c.id === territory.continentId)
                  return (
                    <div 
                      key={territory.id}
                      onClick={() => setState(prev => ({ ...prev, selectedTerritory: territory.id }))}
                      className={`text-sm p-2 rounded cursor-pointer ${
                        state.selectedTerritory === territory.id 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <div className="font-medium">{territory.name}</div>
                      {continent && (
                        <div className="text-xs opacity-75">{continent.name}</div>
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
  )
}