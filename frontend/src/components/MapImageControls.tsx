import { useState } from 'react'

interface MapImageControlsProps {
  imageWidth: number
  imageHeight: number
  mapWidth: number
  mapHeight: number
  onScaleImage: (scale: number) => void
  onResizeCanvas: (width: number, height: number) => void
  onCropImage: () => void
}

export default function MapImageControls({
  imageWidth,
  imageHeight,
  mapWidth,
  mapHeight,
  onScaleImage,
  onResizeCanvas,
  onCropImage,
}: MapImageControlsProps) {
  const [activeTab, setActiveTab] = useState<'scale' | 'canvas' | 'crop'>('scale')
  const [scalePercent, setScalePercent] = useState(100)
  const [customWidth, setCustomWidth] = useState(mapWidth)
  const [customHeight, setCustomHeight] = useState(mapHeight)

  const handleScaleChange = (percent: number) => {
    setScalePercent(percent)
    onScaleImage(percent / 100)
  }

  const handlePresetScale = (percent: number) => {
    setScalePercent(percent)
    onScaleImage(percent / 100)
  }

  const handleFitToCanvas = () => {
    const scaleX = mapWidth / imageWidth
    const scaleY = mapHeight / imageHeight
    const scale = Math.min(scaleX, scaleY)
    const percent = Math.round(scale * 100)
    setScalePercent(percent)
    onScaleImage(scale)
  }

  const handleFillCanvas = () => {
    const scaleX = mapWidth / imageWidth
    const scaleY = mapHeight / imageHeight
    const scale = Math.max(scaleX, scaleY)
    const percent = Math.round(scale * 100)
    setScalePercent(percent)
    onScaleImage(scale)
  }

  const canvasPresets = [
    { label: 'Full HD', width: 1920, height: 1080 },
    { label: 'HD+', width: 1600, height: 900 },
    { label: 'HD', width: 1280, height: 720 },
    { label: '2K', width: 2560, height: 1440 },
    { label: 'Square', width: 1000, height: 1000 },
    { label: 'Portrait', width: 900, height: 1600 },
  ]

  return (
    <div className="bg-surface-2 rounded-lg p-4">
      <h3 className="text-lg font-bold mb-3">🖼️ Image Controls</h3>
      
      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 bg-surface-1 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('scale')}
          className={`flex-1 px-3 py-2 rounded ${
            activeTab === 'scale' 
              ? 'bg-violet text-white' 
              : 'bg-transparent text-muted hover:text-white'
          }`}
        >
          🔍 Scale Image
        </button>
        <button
          onClick={() => setActiveTab('canvas')}
          className={`flex-1 px-3 py-2 rounded ${
            activeTab === 'canvas' 
              ? 'bg-violet text-white' 
              : 'bg-transparent text-muted hover:text-white'
          }`}
        >
          📐 Canvas Size
        </button>
        <button
          onClick={() => setActiveTab('crop')}
          className={`flex-1 px-3 py-2 rounded ${
            activeTab === 'crop' 
              ? 'bg-violet text-white' 
              : 'bg-transparent text-muted hover:text-white'
          }`}
        >
          ✂️ Crop
        </button>
      </div>

      {/* Scale Image Tab */}
      {activeTab === 'scale' && (
        <div className="space-y-3">
          <div className="text-sm text-muted mb-2">
            Scale the image while maintaining aspect ratio
          </div>
          
          {/* Current size display */}
          <div className="flex justify-between text-sm">
            <span className="text-muted">Current:</span>
            <span>{Math.round(imageWidth * scalePercent / 100)}×{Math.round(imageHeight * scalePercent / 100)}px</span>
          </div>
          
          {/* Scale slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Scale:</span>
              <span className="text-sm font-bold">{scalePercent}%</span>
            </div>
            <input
              type="range"
              min="25"
              max="200"
              value={scalePercent}
              onChange={(e) => handleScaleChange(parseInt(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Quick scale buttons */}
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handlePresetScale(50)}
              className="px-2 py-1 bg-surface-1 hover:bg-violet rounded text-sm"
            >
              50%
            </button>
            <button
              onClick={() => handlePresetScale(75)}
              className="px-2 py-1 bg-surface-1 hover:bg-violet rounded text-sm"
            >
              75%
            </button>
            <button
              onClick={() => handlePresetScale(100)}
              className="px-2 py-1 bg-surface-1 hover:bg-violet rounded text-sm"
            >
              100%
            </button>
            <button
              onClick={() => handlePresetScale(150)}
              className="px-2 py-1 bg-surface-1 hover:bg-violet rounded text-sm"
            >
              150%
            </button>
          </div>
          
          {/* Percentage adjustment buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleScaleChange(Math.max(25, scalePercent - 10))}
              className="flex-1 px-3 py-2 bg-surface-1 hover:bg-red-600 rounded text-sm"
            >
              ➖ -10%
            </button>
            <button
              onClick={() => handleScaleChange(Math.min(200, scalePercent + 10))}
              className="flex-1 px-3 py-2 bg-surface-1 hover:bg-green-600 rounded text-sm"
            >
              ➕ +10%
            </button>
          </div>
          
          {/* Fit options */}
          <div className="flex gap-2">
            <button
              onClick={handleFitToCanvas}
              className="flex-1 px-3 py-2 bg-violet hover:brightness-110 rounded text-sm"
            >
              📦 Fit to Canvas
            </button>
            <button
              onClick={handleFillCanvas}
              className="flex-1 px-3 py-2 bg-violet hover:brightness-110 rounded text-sm"
            >
              🖼️ Fill Canvas
            </button>
          </div>
        </div>
      )}

      {/* Canvas Size Tab */}
      {activeTab === 'canvas' && (
        <div className="space-y-3">
          <div className="text-sm text-muted mb-2">
            Adjust the working canvas size (doesn't affect image)
          </div>
          
          {/* Current canvas size */}
          <div className="flex justify-between text-sm">
            <span className="text-muted">Current Canvas:</span>
            <span>{mapWidth}×{mapHeight}px</span>
          </div>
          
          {/* Preset sizes */}
          <div className="grid grid-cols-2 gap-2">
            {canvasPresets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setCustomWidth(preset.width)
                  setCustomHeight(preset.height)
                  onResizeCanvas(preset.width, preset.height)
                }}
                className="px-3 py-2 bg-surface-1 hover:bg-violet rounded text-sm"
              >
                {preset.label}
                <span className="block text-xs text-muted">
                  {preset.width}×{preset.height}
                </span>
              </button>
            ))}
          </div>
          
          {/* Custom size inputs */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Custom Size:</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={customWidth}
                onChange={(e) => setCustomWidth(parseInt(e.target.value) || 800)}
                className="flex-1 px-2 py-1 bg-surface-1 rounded text-sm"
                min="400"
                max="4000"
                step="10"
              />
              <span className="text-muted">×</span>
              <input
                type="number"
                value={customHeight}
                onChange={(e) => setCustomHeight(parseInt(e.target.value) || 600)}
                className="flex-1 px-2 py-1 bg-surface-1 rounded text-sm"
                min="300"
                max="3000"
                step="10"
              />
            </div>
            <button
              onClick={() => onResizeCanvas(customWidth, customHeight)}
              className="w-full px-3 py-2 bg-violet hover:brightness-110 rounded text-sm"
            >
              Apply Custom Size
            </button>
          </div>
          
          {/* Aspect ratio helpers */}
          <div className="text-xs text-muted">
            💡 Tip: Canvas size sets the working area. Use Scale to resize the image itself.
          </div>
        </div>
      )}

      {/* Crop Tab */}
      {activeTab === 'crop' && (
        <div className="space-y-3">
          <div className="text-sm text-muted mb-2">
            Crop the image to remove unwanted areas
          </div>
          
          {/* Current image info */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Image Size:</span>
              <span>{imageWidth}×{imageHeight}px</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Canvas Size:</span>
              <span>{mapWidth}×{mapHeight}px</span>
            </div>
          </div>
          
          <button
            onClick={onCropImage}
            className="w-full px-4 py-3 bg-violet hover:brightness-110 rounded flex items-center justify-center gap-2"
          >
            <span className="text-lg">✂️</span>
            <span>Open Crop Tool</span>
          </button>
          
          <div className="text-xs text-muted space-y-1">
            <p>🎯 Drag corner and side handles to adjust</p>
            <p>📐 Grid lines help with alignment</p>
            <p>🖱️ Drag beyond edges to maximize crop</p>
          </div>
        </div>
      )}
    </div>
  )
}