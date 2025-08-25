import { useState, useRef, useCallback, useEffect } from 'react'
import TerritoryToken from '../components/TerritoryToken'
import ImageProcessor from '../components/ImageProcessor'
import { v4 as uuidv4 } from 'uuid'

interface Territory {
  id: string
  name: string
  x: number
  y: number
  continentId: string
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
}

type EditorMode = 'territories' | 'continents' | 'connections'
type TokenShape = 'hexagon' | 'square'

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
    mapHeight: 800
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
  
  // New continent form
  const [newContinentName, setNewContinentName] = useState('')
  const [newContinentColor, setNewContinentColor] = useState('#3B82F6')
  const [newContinentBonus, setNewContinentBonus] = useState(3)
  const [editingContinentId, setEditingContinentId] = useState<string | null>(null)

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    processImageFile(file)
  }

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setTempImageUrl(dataUrl)
      setShowProcessor(true)
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

    if (editorMode === 'territories' && isPlacingTerritory && selectedContinentId) {
      const newTerritory: Territory = {
        id: uuidv4(),
        name: `Territory ${state.territories.length + 1}`,
        x,
        y,
        continentId: selectedContinentId,
        armies: 1,
        connections: []
      }

      setState(prev => ({
        ...prev,
        territories: [...prev.territories, newTerritory],
        selectedTerritoryId: newTerritory.id
      }))
    }
  }

  // Handle token click based on mode
  const handleTokenClick = (territoryId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    
    if (editorMode === 'connections') {
      if (!isConnecting || !connectingFromId) {
        setIsConnecting(true)
        setConnectingFromId(territoryId)
        setState(prev => ({ ...prev, selectedTerritoryId: territoryId }))
      } else if (connectingFromId !== territoryId) {
        // Create bidirectional connection
        setState(prev => ({
          ...prev,
          territories: prev.territories.map(t => {
            if (t.id === connectingFromId) {
              return {
                ...t,
                connections: t.connections.includes(territoryId) 
                  ? t.connections.filter(id => id !== territoryId)
                  : [...t.connections, territoryId]
              }
            }
            if (t.id === territoryId) {
              return {
                ...t,
                connections: t.connections.includes(connectingFromId)
                  ? t.connections.filter(id => id !== connectingFromId)
                  : [...t.connections, connectingFromId]
              }
            }
            return t
          }),
          selectedTerritoryId: null
        }))
        setIsConnecting(false)
        setConnectingFromId(null)
      }
    } else {
      setState(prev => ({ ...prev, selectedTerritoryId: territoryId }))
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
    const territory = state.territories.find(t => t.id === territoryId)
    if (!territory) return

    setDragOffset({
      x: event.clientX - rect.left + scrollLeft - territory.x,
      y: event.clientY - rect.top + scrollTop - territory.y
    })

    setState(prev => ({
      ...prev,
      draggedTerritoryId: territoryId,
      selectedTerritoryId: territoryId
    }))
  }

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!state.draggedTerritoryId || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const scrollLeft = mapContainerRef.current?.scrollLeft || 0
    const scrollTop = mapContainerRef.current?.scrollTop || 0
    const x = Math.max(0, Math.min(state.mapWidth - 30, event.clientX - rect.left + scrollLeft - dragOffset.x))
    const y = Math.max(0, Math.min(state.mapHeight - 30, event.clientY - rect.top + scrollTop - dragOffset.y))

    setState(prev => ({
      ...prev,
      territories: prev.territories.map(t =>
        t.id === prev.draggedTerritoryId ? { ...t, x, y } : t
      )
    }))
  }, [state.draggedTerritoryId, state.mapWidth, state.mapHeight, dragOffset])

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    setState(prev => ({ ...prev, draggedTerritoryId: null }))
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
      bonus: newContinentBonus
    }

    setState(prev => ({
      ...prev,
      continents: [...prev.continents, newContinent]
    }))

    setNewContinentName('')
    setNewContinentColor('#' + Math.floor(Math.random()*16777215).toString(16))
    setNewContinentBonus(3)
    setSelectedContinentId(newContinent.id)
  }

  // Handle continent update
  const handleUpdateContinent = (continentId: string) => {
    setState(prev => ({
      ...prev,
      continents: prev.continents.map(c =>
        c.id === continentId
          ? { ...c, name: newContinentName, color: newContinentColor, bonus: newContinentBonus }
          : c
      )
    }))
    setEditingContinentId(null)
    setNewContinentName('')
  }

  // Handle continent deletion
  const handleDeleteContinent = (continentId: string) => {
    setState(prev => ({
      ...prev,
      continents: prev.continents.filter(c => c.id !== continentId),
      territories: prev.territories.filter(t => t.continentId !== continentId)
    }))
    if (selectedContinentId === continentId) {
      setSelectedContinentId(null)
    }
  }

  // Get continent for territory
  const getContinentForTerritory = (territoryId: string) => {
    const territory = state.territories.find(t => t.id === territoryId)
    if (!territory) return null
    return state.continents.find(c => c.id === territory.continentId)
  }

  // Export map data
  const handleExport = () => {
    const mapData = {
      name: state.name,
      imageUrl: state.imageUrl,
      width: state.mapWidth,
      height: state.mapHeight,
      territories: state.territories,
      continents: state.continents
    }
    
    const dataStr = JSON.stringify(mapData, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    
    const link = document.createElement('a')
    link.setAttribute('href', dataUri)
    link.setAttribute('download', `${state.name.replace(/\s+/g, '_')}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-full mx-auto">
        <h1 className="text-3xl font-bold mb-6">Map Editor - Token System</h1>
        
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
            </div>

            {/* Map Size */}
            <div className="flex gap-2 items-center">
              <span className="text-sm">Map Size:</span>
              <input
                type="number"
                value={state.mapWidth}
                onChange={(e) => setState(prev => ({ ...prev, mapWidth: parseInt(e.target.value) || 1200 }))}
                className="w-20 px-2 py-1 bg-gray-700 rounded text-sm"
                min="800"
                max="2000"
              />
              <span className="text-sm">×</span>
              <input
                type="number"
                value={state.mapHeight}
                onChange={(e) => setState(prev => ({ ...prev, mapHeight: parseInt(e.target.value) || 800 }))}
                className="w-20 px-2 py-1 bg-gray-700 rounded text-sm"
                min="600"
                max="1500"
              />
            </div>

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
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
            >
              📤 Upload Image
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
            >
              💾 Export Map
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
                  disabled={state.continents.length === 0}
                >
                  <option value="">Select Continent</option>
                  {state.continents.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setIsPlacingTerritory(!isPlacingTerritory)}
                className={`px-4 py-2 rounded ${isPlacingTerritory ? 'bg-green-600' : 'bg-gray-700'}`}
                disabled={!selectedContinentId}
              >
                {isPlacingTerritory ? '🎯 Placing Territories' : '➕ Place Territory'}
              </button>
              {state.selectedTerritoryId && (
                <button
                  onClick={() => {
                    setState(prev => ({
                      ...prev,
                      territories: prev.territories.filter(t => t.id !== state.selectedTerritoryId)
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
                  onChange={(e) => setNewContinentBonus(parseInt(e.target.value) || 0)}
                  className="w-20 px-3 py-1 bg-gray-700 rounded text-white"
                  min="0"
                  max="10"
                />
                <button
                  onClick={handleCreateContinent}
                  className="px-4 py-1 bg-green-600 hover:bg-green-700 rounded"
                >
                  ➕ Add Continent
                </button>
              </div>
              
              {/* Continent List */}
              <div className="flex flex-wrap gap-2">
                {state.continents.map(c => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-1 rounded"
                    style={{ backgroundColor: c.color + '40', border: `2px solid ${c.color}` }}
                  >
                    <span>{c.name} (+{c.bonus})</span>
                    <button
                      onClick={() => handleDeleteContinent(c.id)}
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
                  ? `Click another territory to connect/disconnect from ${state.territories.find(t => t.id === connectingFromId)?.name}`
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
        </div>

        {/* Main Editor Area */}
        <div className="flex gap-4">
          {/* Map Canvas */}
          <div 
            ref={mapContainerRef}
            className="flex-1 bg-gray-800 rounded-lg overflow-auto"
            style={{ maxHeight: '80vh' }}
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
                backgroundRepeat: 'no-repeat'
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
                    backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.1) 0px, transparent 1px, transparent 49px, rgba(255,255,255,0.1) 50px), repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0px, transparent 1px, transparent 49px, rgba(255,255,255,0.1) 50px)',
                    backgroundSize: '50px 50px'
                  }}
                />
              )}

              {/* Connection Lines */}
              {editorMode === 'connections' && (
                <svg className="absolute inset-0 pointer-events-none" style={{ width: state.mapWidth, height: state.mapHeight }}>
                  {state.territories.map(territory => (
                    territory.connections.map(targetId => {
                      const target = state.territories.find(t => t.id === targetId)
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
                    })
                  ))}
                </svg>
              )}

              {/* Territory Tokens */}
              {state.territories.map(territory => {
                const continent = getContinentForTerritory(territory.id)
                if (!continent) return null
                
                return (
                  <div
                    key={territory.id}
                    className="absolute cursor-pointer"
                    style={{
                      left: territory.x - 15,
                      top: territory.y - 15,
                      transform: 'translate(-50%, -50%)'
                    }}
                    onMouseDown={(e) => handleTokenMouseDown(territory.id, e)}
                    onClick={(e) => handleTokenClick(territory.id, e)}
                  >
                    <TerritoryToken
                      x={0}
                      y={0}
                      armies={territory.armies}
                      color={continent.color}
                      shape={tokenShape}
                      isSelected={state.selectedTerritoryId === territory.id}
                      isDragging={state.draggedTerritoryId === territory.id}
                      size={30}
                      opacity={0.7}
                    />
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
                    <p className="text-gray-400 mb-2">Drop an image here or</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                    >
                      Upload Map Image
                    </button>
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

          {/* Properties Panel */}
          <div className="w-80 bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4">Properties</h2>
            
            {/* Map Name */}
            <div className="mb-4">
              <label className="block text-sm mb-1">Map Name</label>
              <input
                type="text"
                value={state.name}
                onChange={(e) => setState(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-1 bg-gray-700 rounded text-white"
              />
            </div>

            {/* Statistics */}
            <div className="mb-4 text-sm space-y-1">
              <p>Territories: {state.territories.length}</p>
              <p>Continents: {state.continents.length}</p>
              <p>Connections: {state.territories.reduce((acc, t) => acc + t.connections.length, 0) / 2}</p>
            </div>

            {/* Selected Territory */}
            {state.selectedTerritoryId && (
              <div className="mb-4 p-3 bg-gray-700 rounded">
                <h3 className="font-bold mb-2">Selected Territory</h3>
                {(() => {
                  const territory = state.territories.find(t => t.id === state.selectedTerritoryId)
                  const continent = territory ? getContinentForTerritory(territory.id) : null
                  if (!territory) return null
                  
                  return (
                    <>
                      <input
                        type="text"
                        value={territory.name}
                        onChange={(e) => {
                          setState(prev => ({
                            ...prev,
                            territories: prev.territories.map(t =>
                              t.id === state.selectedTerritoryId
                                ? { ...t, name: e.target.value }
                                : t
                            )
                          }))
                        }}
                        className="w-full px-2 py-1 mb-2 bg-gray-600 rounded text-white"
                      />
                      <p className="text-sm text-gray-400">Continent: {continent?.name}</p>
                      <p className="text-sm text-gray-400">Position: ({Math.round(territory.x)}, {Math.round(territory.y)})</p>
                      <p className="text-sm text-gray-400">Connections: {territory.connections.length}</p>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />

        {/* Image Processor Modal */}
        {showProcessor && tempImageUrl && (
          <ImageProcessor
            imageUrl={tempImageUrl}
            onComplete={(processedUrl, dimensions) => {
              setState(prev => ({ 
                ...prev, 
                imageUrl: processedUrl,
                mapWidth: dimensions.width,
                mapHeight: dimensions.height
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