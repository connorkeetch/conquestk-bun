import React, { useState, useRef, useEffect } from 'react'

interface ImageCropperProps {
  imageUrl: string
  onCrop: (croppedImageUrl: string) => void
  onCancel: () => void
  targetWidth?: number
  targetHeight?: number
}

export default function ImageCropper({
  imageUrl,
  onCrop,
  onCancel,
  targetWidth = 800,
  targetHeight = 600
}: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [cropArea, setCropArea] = useState({
    x: 0,
    y: 0,
    width: targetWidth,
    height: targetHeight
  })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImage(img)
      
      // Calculate initial crop area to center the target dimensions
      const aspectRatio = targetWidth / targetHeight
      let cropW = img.width
      let cropH = img.height
      
      if (img.width / img.height > aspectRatio) {
        // Image is wider - crop width
        cropW = img.height * aspectRatio
      } else {
        // Image is taller - crop height
        cropH = img.width / aspectRatio
      }
      
      setCropArea({
        x: (img.width - cropW) / 2,
        y: (img.height - cropH) / 2,
        width: cropW,
        height: cropH
      })
      
      // Calculate scale for preview
      const maxPreviewWidth = 600
      const maxPreviewHeight = 450
      const scaleX = maxPreviewWidth / img.width
      const scaleY = maxPreviewHeight / img.height
      setScale(Math.min(scaleX, scaleY, 1))
    }
    img.src = imageUrl
  }, [imageUrl, targetWidth, targetHeight])

  useEffect(() => {
    if (!image || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set canvas size to scaled image size
    canvas.width = image.width * scale
    canvas.height = image.height * scale
    
    // Clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    
    // Draw crop overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Clear crop area to show image
    const scaledCrop = {
      x: cropArea.x * scale,
      y: cropArea.y * scale,
      width: cropArea.width * scale,
      height: cropArea.height * scale
    }
    
    ctx.clearRect(scaledCrop.x, scaledCrop.y, scaledCrop.width, scaledCrop.height)
    ctx.drawImage(
      image,
      cropArea.x, cropArea.y, cropArea.width, cropArea.height,
      scaledCrop.x, scaledCrop.y, scaledCrop.width, scaledCrop.height
    )
    
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
    
  }, [image, cropArea, scale])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    
    // Check if click is inside crop area
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

  const handleCrop = () => {
    if (!image) return
    
    // Create a canvas for the cropped image
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = targetWidth
    cropCanvas.height = targetHeight
    const ctx = cropCanvas.getContext('2d')
    
    if (!ctx) return
    
    // Draw the cropped portion
    ctx.drawImage(
      image,
      cropArea.x, cropArea.y, cropArea.width, cropArea.height,
      0, 0, targetWidth, targetHeight
    )
    
    // Convert to data URL
    const croppedDataUrl = cropCanvas.toDataURL('image/png')
    onCrop(croppedDataUrl)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Crop Image</h2>
          <p className="text-sm text-gray-400 mt-1">
            Drag to position the crop area. Image will be resized to {targetWidth}×{targetHeight}px
          </p>
        </div>
        
        <div className="p-4">
          <div className="flex justify-center bg-gray-900 rounded p-4">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="cursor-move border border-gray-700"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-gray-400">
              {image && (
                <>
                  Original: {image.width}×{image.height}px | 
                  Crop: {Math.round(cropArea.width)}×{Math.round(cropArea.height)}px
                </>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCrop}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}