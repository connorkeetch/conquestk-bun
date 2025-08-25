import React, { useState, useRef, useEffect } from 'react'

interface ImageProcessorProps {
  imageUrl: string
  onComplete: (processedImageUrl: string, dimensions: { width: number; height: number }) => void
  onCancel: () => void
  maxWidth?: number
  maxHeight?: number
  maxFileSize?: number // in MB
}

type ProcessMode = 'original' | 'fit' | 'crop' | 'resize'

export default function ImageProcessor({
  imageUrl,
  onComplete,
  onCancel,
  maxWidth = 2000,
  maxHeight = 1500,
  maxFileSize = 10 // 10MB default
}: ImageProcessorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [mode, setMode] = useState<ProcessMode>('original')
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [targetDimensions, setTargetDimensions] = useState({ width: 1200, height: 800 })
  const [imageStats, setImageStats] = useState({ 
    width: 0, 
    height: 0, 
    fileSize: 0,
    isTooBig: false 
  })

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImage(img)
      
      // Check image size
      const pixels = img.width * img.height
      const estimatedSizeMB = (pixels * 4) / (1024 * 1024) // Rough estimate
      const isTooBig = img.width > maxWidth || img.height > maxHeight || estimatedSizeMB > maxFileSize
      
      setImageStats({
        width: img.width,
        height: img.height,
        fileSize: estimatedSizeMB,
        isTooBig
      })

      // Set default mode based on size
      if (isTooBig) {
        setMode('fit') // Default to fit if too big
      }

      // Set initial target dimensions
      if (img.width <= maxWidth && img.height <= maxHeight) {
        setTargetDimensions({ width: img.width, height: img.height })
      } else {
        // Calculate proportional fit
        const scaleX = maxWidth / img.width
        const scaleY = maxHeight / img.height
        const fitScale = Math.min(scaleX, scaleY)
        setTargetDimensions({
          width: Math.round(img.width * fitScale),
          height: Math.round(img.height * fitScale)
        })
      }
      
      // Initialize crop area
      setCropArea({
        x: 0,
        y: 0,
        width: img.width,
        height: img.height
      })
      
      // Calculate preview scale
      const maxPreviewWidth = 600
      const maxPreviewHeight = 450
      const previewScaleX = maxPreviewWidth / img.width
      const previewScaleY = maxPreviewHeight / img.height
      setScale(Math.min(previewScaleX, previewScaleY, 1))
    }
    img.src = imageUrl
  }, [imageUrl, maxWidth, maxHeight, maxFileSize])

  useEffect(() => {
    if (!image || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set canvas size for preview
    canvas.width = image.width * scale
    canvas.height = image.height * scale
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    if (mode === 'original' || mode === 'resize') {
      // Show full image
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    } else if (mode === 'fit') {
      // Show image with letterboxing preview
      const targetAspect = targetDimensions.width / targetDimensions.height
      const imageAspect = image.width / image.height
      
      let drawWidth = canvas.width
      let drawHeight = canvas.height
      let drawX = 0
      let drawY = 0
      
      if (imageAspect > targetAspect) {
        // Image is wider - add bars top/bottom
        drawHeight = canvas.width / targetAspect
        drawY = (canvas.height - drawHeight) / 2
      } else {
        // Image is taller - add bars left/right
        drawWidth = canvas.height * targetAspect
        drawX = (canvas.width - drawWidth) / 2
      }
      
      // Draw black bars (background already black)
      // Draw image centered
      const fitScale = Math.min(drawWidth / image.width, drawHeight / image.height)
      const imgW = image.width * fitScale
      const imgH = image.height * fitScale
      const imgX = drawX + (drawWidth - imgW) / 2
      const imgY = drawY + (drawHeight - imgH) / 2
      
      ctx.drawImage(image, imgX, imgY, imgW, imgH)
      
      // Draw border to show final canvas
      ctx.strokeStyle = '#3B82F6'
      ctx.lineWidth = 2
      ctx.strokeRect(drawX, drawY, drawWidth, drawHeight)
    } else if (mode === 'crop') {
      // Show crop overlay
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      
      // Darken outside crop area
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Show crop area
      const scaledCrop = {
        x: cropArea.x * scale,
        y: cropArea.y * scale,
        width: cropArea.width * scale,
        height: cropArea.height * scale
      }
      
      ctx.save()
      ctx.beginPath()
      ctx.rect(scaledCrop.x, scaledCrop.y, scaledCrop.width, scaledCrop.height)
      ctx.clip()
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      ctx.restore()
      
      // Draw crop border
      ctx.strokeStyle = '#3B82F6'
      ctx.lineWidth = 2
      ctx.strokeRect(scaledCrop.x, scaledCrop.y, scaledCrop.width, scaledCrop.height)
      
      // Draw corner handles
      const handleSize = 8
      ctx.fillStyle = '#3B82F6'
      const handles = [
        { x: scaledCrop.x, y: scaledCrop.y },
        { x: scaledCrop.x + scaledCrop.width, y: scaledCrop.y },
        { x: scaledCrop.x, y: scaledCrop.y + scaledCrop.height },
        { x: scaledCrop.x + scaledCrop.width, y: scaledCrop.y + scaledCrop.height }
      ]
      handles.forEach(handle => {
        ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize)
      })
    }
  }, [image, mode, cropArea, scale, targetDimensions])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'crop' || !canvasRef.current) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    
    if (x >= cropArea.x && x <= cropArea.x + cropArea.width &&
        y >= cropArea.y && y <= cropArea.y + cropArea.height) {
      setIsDragging(true)
      setDragStart({ x: x - cropArea.x, y: y - cropArea.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current || !image) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    
    const newX = Math.max(0, Math.min(image.width - cropArea.width, x - dragStart.x))
    const newY = Math.max(0, Math.min(image.height - cropArea.height, y - dragStart.y))
    
    setCropArea(prev => ({ ...prev, x: newX, y: newY }))
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleProcess = () => {
    if (!image) return
    
    const outputCanvas = document.createElement('canvas')
    const ctx = outputCanvas.getContext('2d')
    if (!ctx) return
    
    if (mode === 'original') {
      // Return original image
      outputCanvas.width = image.width
      outputCanvas.height = image.height
      ctx.drawImage(image, 0, 0)
      onComplete(outputCanvas.toDataURL('image/jpeg', 0.9), { 
        width: image.width, 
        height: image.height 
      })
    } else if (mode === 'resize') {
      // Simple resize to target dimensions
      outputCanvas.width = targetDimensions.width
      outputCanvas.height = targetDimensions.height
      ctx.drawImage(image, 0, 0, outputCanvas.width, outputCanvas.height)
      onComplete(outputCanvas.toDataURL('image/jpeg', 0.9), targetDimensions)
    } else if (mode === 'fit') {
      // Fit with letterboxing
      outputCanvas.width = targetDimensions.width
      outputCanvas.height = targetDimensions.height
      
      // Fill with black
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height)
      
      // Calculate fit dimensions
      const scale = Math.min(
        targetDimensions.width / image.width,
        targetDimensions.height / image.height
      )
      const w = image.width * scale
      const h = image.height * scale
      const x = (targetDimensions.width - w) / 2
      const y = (targetDimensions.height - h) / 2
      
      ctx.drawImage(image, x, y, w, h)
      onComplete(outputCanvas.toDataURL('image/jpeg', 0.9), targetDimensions)
    } else if (mode === 'crop') {
      // Crop and resize
      outputCanvas.width = targetDimensions.width
      outputCanvas.height = targetDimensions.height
      ctx.drawImage(
        image,
        cropArea.x, cropArea.y, cropArea.width, cropArea.height,
        0, 0, outputCanvas.width, outputCanvas.height
      )
      onComplete(outputCanvas.toDataURL('image/jpeg', 0.9), targetDimensions)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <h2 className="text-xl font-bold text-white">Process Image</h2>
          <div className="text-sm text-gray-400 mt-1">
            Original: {imageStats.width}×{imageStats.height}px (~{imageStats.fileSize.toFixed(1)}MB)
            {imageStats.isTooBig && (
              <span className="text-yellow-400 ml-2">⚠️ Image exceeds recommended size</span>
            )}
          </div>
        </div>
        
        <div className="p-4">
          {/* Mode Selection */}
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              onClick={() => setMode('original')}
              disabled={imageStats.isTooBig}
              className={`p-3 rounded-lg border-2 transition ${
                mode === 'original' 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : imageStats.isTooBig
                  ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 border-gray-600 text-white hover:border-gray-500'
              }`}
            >
              <div className="font-medium">Use Original</div>
              <div className="text-xs opacity-75">No changes</div>
            </button>
            
            <button
              onClick={() => setMode('fit')}
              className={`p-3 rounded-lg border-2 transition ${
                mode === 'fit' 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-gray-700 border-gray-600 text-white hover:border-gray-500'
              }`}
            >
              <div className="font-medium">Fit to Canvas</div>
              <div className="text-xs opacity-75">Add black bars</div>
            </button>
            
            <button
              onClick={() => setMode('crop')}
              className={`p-3 rounded-lg border-2 transition ${
                mode === 'crop' 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-gray-700 border-gray-600 text-white hover:border-gray-500'
              }`}
            >
              <div className="font-medium">Crop to Fill</div>
              <div className="text-xs opacity-75">Remove edges</div>
            </button>
            
            <button
              onClick={() => setMode('resize')}
              className={`p-3 rounded-lg border-2 transition ${
                mode === 'resize' 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-gray-700 border-gray-600 text-white hover:border-gray-500'
              }`}
            >
              <div className="font-medium">Stretch to Fit</div>
              <div className="text-xs opacity-75">May distort</div>
            </button>
          </div>

          {/* Target Dimensions Input */}
          {mode !== 'original' && (
            <div className="mb-4 flex items-center gap-4 p-3 bg-gray-700 rounded-lg">
              <span className="text-sm text-gray-300">Target Size:</span>
              <input
                type="number"
                value={targetDimensions.width}
                onChange={(e) => setTargetDimensions(prev => ({ 
                  ...prev, 
                  width: Math.min(maxWidth, parseInt(e.target.value) || 100)
                }))}
                className="w-24 px-2 py-1 bg-gray-600 text-white rounded"
                min="100"
                max={maxWidth}
              />
              <span className="text-gray-400">×</span>
              <input
                type="number"
                value={targetDimensions.height}
                onChange={(e) => setTargetDimensions(prev => ({ 
                  ...prev, 
                  height: Math.min(maxHeight, parseInt(e.target.value) || 100)
                }))}
                className="w-24 px-2 py-1 bg-gray-600 text-white rounded"
                min="100"
                max={maxHeight}
              />
              <span className="text-sm text-gray-400">px</span>
              
              {/* Quick size presets */}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setTargetDimensions({ width: 800, height: 600 })}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
                >
                  800×600
                </button>
                <button
                  onClick={() => setTargetDimensions({ width: 1200, height: 800 })}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
                >
                  1200×800
                </button>
                <button
                  onClick={() => setTargetDimensions({ width: 1600, height: 1200 })}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
                >
                  1600×1200
                </button>
              </div>
            </div>
          )}

          {/* Preview Canvas */}
          <div className="flex justify-center bg-gray-900 rounded p-4 mb-4">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`border border-gray-700 ${mode === 'crop' ? 'cursor-move' : ''}`}
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-400">
              Output: {mode === 'original' ? `${imageStats.width}×${imageStats.height}` : `${targetDimensions.width}×${targetDimensions.height}`}px
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleProcess}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                Apply & Use Image
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}