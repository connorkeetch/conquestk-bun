import { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
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

export default function MapEditorFixed() {
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

  const [mapName, setMapName] = useState('')
  const [newTerritoryName, setNewTerritoryName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // FIXED: Process image using FileReader for better compatibility
  const processImageFile = (file: File) => {
    setUploadError(null)
    
    console.log('🖼️ Processing image file with FileReader:', {
      name: file.name,
      type: file.type,
      size: file.size
    })
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadError(`Invalid file type: ${file.type}`)
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return
    }

    setIsUploading(true)
    setSelectedFile(file)
    
    // Use FileReader instead of blob URLs
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      console.log('✅ FileReader: Successfully read file as data URL')
      
      // Test if the image can be loaded
      const img = new Image()
      
      img.onload = () => {
        console.log('✅ Image validated successfully:', {
          width: img.width,
          height: img.height
        })
        
        setState(prev => ({
          ...prev,
          imageUrl: dataUrl,
          imageWidth: img.width,
          imageHeight: img.height
        }))
        
        setIsUploading(false)
      }
      
      img.onerror = () => {
        console.error('❌ Failed to load image from data URL')
        setUploadError('Failed to load image. The file may be corrupted.')
        setIsUploading(false)
      }
      
      img.src = dataUrl
    }
    
    reader.onerror = () => {
      console.error('❌ FileReader failed to read file')
      setUploadError('Failed to read file. Please try a different file.')
      setIsUploading(false)
    }
    
    // Read the file as data URL (base64)
    reader.readAsDataURL(file)
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    processImageFile(file)
  }

  // Canvas drawing - simplified for testing
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
        console.log('✅ Drawing image on canvas')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }
      
      img.onerror = () => {
        console.error('❌ Canvas failed to draw image')
      }
      
      // For data URLs, we don't need mapService.getImageUrl
      img.src = state.imageUrl
    } else {
      // Draw grid background
      ctx.strokeStyle = '#374151'
      ctx.lineWidth = 1
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
  }, [state.imageUrl])

  const handleToolSelect = (tool: EditorTool) => {
    setState(prev => ({ ...prev, selectedTool: tool }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link 
            to="/maps" 
            className="text-blue-400 hover:text-blue-300 mb-4 inline-flex items-center"
          >
            ← Back to Maps
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">Map Editor (Fixed)</h1>
          <p className="text-gray-400">Using FileReader for better compatibility</p>
        </div>

        {/* Main Editor Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Sidebar - Tools and Settings */}
          <div className="lg:col-span-1 space-y-6">
            {/* Map Settings */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Map Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Map Name
                  </label>
                  <input
                    type="text"
                    value={mapName}
                    onChange={(e) => setMapName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="Enter map name"
                  />
                </div>
              </div>
            </div>

            {/* Tool Selection */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Tools</h3>
              <div className="space-y-2">
                {[
                  { tool: 'select', label: '👆 Select', description: 'Select territories' },
                  { tool: 'territory', label: '✏️ Territory', description: 'Draw territories' },
                  { tool: 'continent', label: '🌍 Continent', description: 'Manage continents' },
                  { tool: 'adjacency', label: '🔗 Adjacency', description: 'Set connections' }
                ].map((item) => (
                  <button
                    key={item.tool}
                    onClick={() => handleToolSelect(item.tool as EditorTool)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      state.selectedTool === item.tool
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs opacity-75">{item.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Drawing Options */}
            {state.selectedTool === 'territory' && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Territory Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Territory Name
                    </label>
                    <input
                      type="text"
                      value={newTerritoryName}
                      onChange={(e) => setNewTerritoryName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      placeholder="Enter territory name"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Center - Canvas */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg p-4">
              {/* Image Upload */}
              <div className="mb-4">
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  
                  {!state.imageUrl ? (
                    <>
                      <div className="text-6xl mb-4">🖼️</div>
                      <p className="text-white mb-2">Upload a background image for your map</p>
                      <p className="text-gray-400 text-sm mb-4">
                        Supports PNG, JPG, GIF (max 10MB)
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                      >
                        {isUploading ? 'Processing...' : 'Choose File'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {isUploading ? 'Processing...' : 'Change Image'}
                    </button>
                  )}
                  
                  {uploadError && (
                    <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
                      <p className="text-red-400 text-sm">❌ {uploadError}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Canvas */}
              <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={600}
                  className="w-full h-auto cursor-crosshair"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>
          </div>

          {/* Right Sidebar - Properties */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Properties</h3>
              <p className="text-gray-400 text-sm">
                Select a territory to view its properties
              </p>
            </div>

            {/* Debug Info */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Debug Info</h3>
              <div className="text-xs text-gray-400 space-y-1">
                <p>Tool: {state.selectedTool}</p>
                <p>Image: {state.imageUrl ? 'Loaded' : 'None'}</p>
                <p>Size: {state.imageWidth}x{state.imageHeight}</p>
                <p>Territories: {state.territories.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
          <p className="text-blue-300 text-sm">
            <strong>Testing FileReader approach:</strong> This version uses FileReader API 
            instead of blob URLs to avoid potential CORS and security issues. Upload an image 
            and check the browser console for detailed logs.
          </p>
        </div>
      </div>
    </div>
  )
}