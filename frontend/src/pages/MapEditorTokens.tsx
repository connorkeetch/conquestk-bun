import { useState, useRef, useCallback, useEffect } from 'react'
import TerritoryToken from '../components/TerritoryToken'
import ImageCropper from '../components/ImageCropper'
import { v4 as uuidv4 } from 'uuid'

interface Territory {
  id: string
  name: string
  x: number
  y: number
  continentId: string
  armies: number
  isCapital?: boolean
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
}

export default function MapEditorTokens() {
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [state, setState] = useState<MapState>({
    name: 'New Map',
    imageUrl: undefined,
    territories: [],
    continents: [
      { id: 'c1', name: 'North', color: '#3B82F6', bonus: 3 },
      { id: 'c2', name: 'South', color: '#10B981', bonus: 2 },
      { id: 'c3', name: 'East', color: '#F59E0B', bonus: 4 },
      { id: 'c4', name: 'West', color: '#EF4444', bonus: 3 },
      { id: 'c5', name: 'Center', color: '#8B5CF6', bonus: 5 }
    ],
    selectedTerritoryId: null,
    draggedTerritoryId: null
  })

  const [showCropper, setShowCropper] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [selectedContinentId, setSelectedContinentId] = useState('c1')
  const [isPlacingTerritory, setIsPlacingTerritory] = useState(false)

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
      
      const img = new Image()
      img.onload = () => {
        if (img.width > 800 || img.height > 600) {
          setTempImageUrl(dataUrl)
          setShowCropper(true)
        } else {
          setState(prev => ({ ...prev, imageUrl: dataUrl }))
        }
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // Handle map click to place territory
  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlacingTerritory || state.draggedTerritoryId) return
    
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const newTerritory: Territory = {
      id: uuidv4(),
      name: `Territory ${state.territories.length + 1}`,
      x,
      y,
      continentId: selectedContinentId,
      armies: 1
    }

    setState(prev => ({
      ...prev,
      territories: [...prev.territories, newTerritory],
      selectedTerritoryId: newTerritory.id
    }))
  }

  // Handle token drag start
  const handleTokenMouseDown = (territoryId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const territory = state.territories.find(t => t.id === territoryId)
    if (!territory) return

    setDragOffset({
      x: event.clientX - rect.left - territory.x,
      y: event.clientY - rect.top - territory.y
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
    const x = Math.max(0, Math.min(800, event.clientX - rect.left - dragOffset.x))
    const y = Math.max(0, Math.min(600, event.clientY - rect.top - dragOffset.y))

    setState(prev => ({
      ...prev,
      territories: prev.territories.map(t =>
        t.id === prev.draggedTerritoryId ? { ...t, x, y } : t
      )
    }))
  }, [state.draggedTerritoryId, dragOffset])

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    setState(prev => ({ ...prev, draggedTerritoryId: null }))
  }, [])

  // Set up global mouse listeners for dragging
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

  // Handle territory selection
  const handleTokenClick = (territoryId: string) => {
    setState(prev => ({
      ...prev,
      selectedTerritoryId: prev.selectedTerritoryId === territoryId ? null : territoryId
    }))
  }

  // Update territory properties
  const updateTerritory = (id: string, updates: Partial<Territory>) => {
    setState(prev => ({
      ...prev,
      territories: prev.territories.map(t =>
        t.id === id ? { ...t, ...updates } : t
      )
    }))
  }

  // Delete territory
  const deleteTerritory = (id: string) => {
    setState(prev => ({
      ...prev,
      territories: prev.territories.filter(t => t.id !== id),
      selectedTerritoryId: prev.selectedTerritoryId === id ? null : prev.selectedTerritoryId
    }))
  }

  // Handle drag and drop for images
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      processImageFile(file)
    }
  }

  const selectedTerritory = state.territories.find(t => t.id === state.selectedTerritoryId)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      {/* Image Cropper Modal */}
      {showCropper && tempImageUrl && (
        <ImageCropper
          imageUrl={tempImageUrl}
          onCrop={(croppedUrl) => {
            setState(prev => ({ ...prev, imageUrl: croppedUrl }))
            setShowCropper(false)
            setTempImageUrl(null)
          }}
          onCancel={() => {
            setShowCropper(false)
            setTempImageUrl(null)
          }}
        />
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">🗺️ Token Map Editor</h1>
          <div className="space-x-2">
            <button className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium">
              💾 Save Map
            </button>
            <button className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-medium">
              ✅ Validate
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Map Area */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800 rounded-lg p-4">
              <h2 className="text-xl font-bold mb-4">Map Canvas</h2>
              <div 
                ref={containerRef}
                className="relative bg-gray-700 rounded overflow-hidden cursor-crosshair"
                style={{ width: '800px', height: '600px', maxWidth: '100%' }}
                onClick={handleMapClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Background Image or Upload Prompt */}
                {state.imageUrl ? (
                  <img 
                    src={state.imageUrl} 
                    alt="Map background"
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl mb-4">{isDragOver ? '📂' : '🖼️'}</div>
                      <p className="text-lg font-medium mb-2">
                        {isDragOver ? 'Drop image here' : 'Upload Map Background'}
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
                      >
                        Choose Image
                      </button>
                    </div>
                  </div>
                )}

                {/* Territory Tokens */}
                {state.territories.map(territory => {
                  const continent = state.continents.find(c => c.id === territory.continentId)
                  return (
                    <TerritoryToken
                      key={territory.id}
                      x={territory.x}
                      y={territory.y}
                      armies={territory.armies}
                      color={continent?.color || '#6B7280'}
                      name={territory.name}
                      showName={territory.id === state.selectedTerritoryId}
                      isSelected={territory.id === state.selectedTerritoryId}
                      isDragging={territory.id === state.draggedTerritoryId}
                      isCapital={territory.isCapital}
                      onClick={() => handleTokenClick(territory.id)}
                      onMouseDown={(e) => handleTokenMouseDown(territory.id, e)}
                    />
                  )
                })}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Controls Panel */}
          <div className="space-y-4">
            {/* Territory Placement */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Territory Placement</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setIsPlacingTerritory(!isPlacingTerritory)}
                  className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                    isPlacingTerritory 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isPlacingTerritory ? '🎯 Click Map to Place' : '➕ Add Territory'}
                </button>

                <div>
                  <label className="block text-sm font-medium mb-1">Continent</label>
                  <select
                    value={selectedContinentId}
                    onChange={(e) => setSelectedContinentId(e.target.value)}
                    className="w-full bg-gray-700 rounded px-3 py-2"
                  >
                    {state.continents.map(continent => (
                      <option key={continent.id} value={continent.id}>
                        {continent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Selected Territory */}
            {selectedTerritory && (
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-3">Territory Properties</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={selectedTerritory.name}
                      onChange={(e) => updateTerritory(selectedTerritory.id, { name: e.target.value })}
                      className="w-full bg-gray-700 rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Continent</label>
                    <select
                      value={selectedTerritory.continentId}
                      onChange={(e) => updateTerritory(selectedTerritory.id, { continentId: e.target.value })}
                      className="w-full bg-gray-700 rounded px-3 py-2"
                    >
                      {state.continents.map(continent => (
                        <option key={continent.id} value={continent.id}>
                          {continent.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedTerritory.isCapital || false}
                        onChange={(e) => updateTerritory(selectedTerritory.id, { isCapital: e.target.checked })}
                      />
                      <span className="text-sm">Capital Territory</span>
                    </label>
                  </div>

                  <div className="text-xs text-gray-400">
                    Position: ({Math.round(selectedTerritory.x)}, {Math.round(selectedTerritory.y)})
                  </div>

                  <button
                    onClick={() => deleteTerritory(selectedTerritory.id)}
                    className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm"
                  >
                    🗑️ Delete Territory
                  </button>
                </div>
              </div>
            )}

            {/* Map Stats */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Map Statistics</h3>
              <div className="space-y-1 text-sm">
                <div>Territories: {state.territories.length}</div>
                <div>Continents: {state.continents.length}</div>
                <div>Capitals: {state.territories.filter(t => t.isCapital).length}</div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Instructions</h3>
              <ul className="text-sm space-y-1 text-gray-300">
                <li>• Click "Add Territory" then click on map</li>
                <li>• Drag tokens to reposition them</li>
                <li>• Click token to select and edit</li>
                <li>• Tokens auto-color by continent</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}