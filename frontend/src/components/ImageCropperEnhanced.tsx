import type React from 'react'
import { useEffect, useRef, useState } from 'react'

interface ImageCropperEnhancedProps {
  imageUrl: string
  onCrop: (croppedImageUrl: string) => void
  onCancel: () => void
  targetWidth?: number
  targetHeight?: number
}

type DragHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'move' | null

export default function ImageCropperEnhanced({
  imageUrl,
  onCrop,
  onCancel,
  targetWidth = 800,
  targetHeight = 600,
}: ImageCropperEnhancedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [cropArea, setCropArea] = useState({
    x: 0,
    y: 0,
    width: targetWidth,
    height: targetHeight,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [dragHandle, setDragHandle] = useState<DragHandle>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 })
  const [scale, setScale] = useState(1)
  const [mouseIntent, setMouseIntent] = useState({ x: 0, y: 0 })

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
        height: cropH,
      })

      // Calculate scale for preview
      const maxPreviewWidth = 800
      const maxPreviewHeight = 600
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
      height: cropArea.height * scale,
    }

    ctx.clearRect(scaledCrop.x, scaledCrop.y, scaledCrop.width, scaledCrop.height)
    ctx.drawImage(
      image,
      cropArea.x,
      cropArea.y,
      cropArea.width,
      cropArea.height,
      scaledCrop.x,
      scaledCrop.y,
      scaledCrop.width,
      scaledCrop.height,
    )

    // Draw crop border
    ctx.strokeStyle = '#8B5CF6'
    ctx.lineWidth = 2
    ctx.strokeRect(scaledCrop.x, scaledCrop.y, scaledCrop.width, scaledCrop.height)

    // Draw handles
    const handleSize = 10
    ctx.fillStyle = '#8B5CF6'
    
    // Corner handles
    const cornerHandles = [
      { x: scaledCrop.x, y: scaledCrop.y, cursor: 'nw-resize' },
      { x: scaledCrop.x + scaledCrop.width, y: scaledCrop.y, cursor: 'ne-resize' },
      { x: scaledCrop.x, y: scaledCrop.y + scaledCrop.height, cursor: 'sw-resize' },
      { x: scaledCrop.x + scaledCrop.width, y: scaledCrop.y + scaledCrop.height, cursor: 'se-resize' },
    ]
    
    cornerHandles.forEach((handle) => {
      ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
    })

    // Side handles
    const sideHandles = [
      { x: scaledCrop.x + scaledCrop.width / 2, y: scaledCrop.y, cursor: 'n-resize' },
      { x: scaledCrop.x + scaledCrop.width / 2, y: scaledCrop.y + scaledCrop.height, cursor: 's-resize' },
      { x: scaledCrop.x, y: scaledCrop.y + scaledCrop.height / 2, cursor: 'w-resize' },
      { x: scaledCrop.x + scaledCrop.width, y: scaledCrop.y + scaledCrop.height / 2, cursor: 'e-resize' },
    ]
    
    sideHandles.forEach((handle) => {
      ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
    })

    // Draw grid lines for better alignment
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    
    // Vertical thirds
    const thirdW = scaledCrop.width / 3
    ctx.beginPath()
    ctx.moveTo(scaledCrop.x + thirdW, scaledCrop.y)
    ctx.lineTo(scaledCrop.x + thirdW, scaledCrop.y + scaledCrop.height)
    ctx.moveTo(scaledCrop.x + thirdW * 2, scaledCrop.y)
    ctx.lineTo(scaledCrop.x + thirdW * 2, scaledCrop.y + scaledCrop.height)
    
    // Horizontal thirds
    const thirdH = scaledCrop.height / 3
    ctx.moveTo(scaledCrop.x, scaledCrop.y + thirdH)
    ctx.lineTo(scaledCrop.x + scaledCrop.width, scaledCrop.y + thirdH)
    ctx.moveTo(scaledCrop.x, scaledCrop.y + thirdH * 2)
    ctx.lineTo(scaledCrop.x + scaledCrop.width, scaledCrop.y + thirdH * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }, [image, cropArea, scale])

  const getHandleAtPosition = (x: number, y: number): DragHandle => {
    const scaledCrop = {
      x: cropArea.x * scale,
      y: cropArea.y * scale,
      width: cropArea.width * scale,
      height: cropArea.height * scale,
    }
    
    const handleSize = 15 // Slightly larger hit area
    
    // Check corner handles
    if (Math.abs(x - scaledCrop.x) < handleSize && Math.abs(y - scaledCrop.y) < handleSize) return 'tl'
    if (Math.abs(x - (scaledCrop.x + scaledCrop.width)) < handleSize && Math.abs(y - scaledCrop.y) < handleSize) return 'tr'
    if (Math.abs(x - scaledCrop.x) < handleSize && Math.abs(y - (scaledCrop.y + scaledCrop.height)) < handleSize) return 'bl'
    if (Math.abs(x - (scaledCrop.x + scaledCrop.width)) < handleSize && Math.abs(y - (scaledCrop.y + scaledCrop.height)) < handleSize) return 'br'
    
    // Check side handles
    if (Math.abs(x - (scaledCrop.x + scaledCrop.width / 2)) < handleSize && Math.abs(y - scaledCrop.y) < handleSize) return 't'
    if (Math.abs(x - (scaledCrop.x + scaledCrop.width / 2)) < handleSize && Math.abs(y - (scaledCrop.y + scaledCrop.height)) < handleSize) return 'b'
    if (Math.abs(x - scaledCrop.x) < handleSize && Math.abs(y - (scaledCrop.y + scaledCrop.height / 2)) < handleSize) return 'l'
    if (Math.abs(x - (scaledCrop.x + scaledCrop.width)) < handleSize && Math.abs(y - (scaledCrop.y + scaledCrop.height / 2)) < handleSize) return 'r'
    
    // Check if inside crop area for move
    if (x >= scaledCrop.x && x <= scaledCrop.x + scaledCrop.width &&
        y >= scaledCrop.y && y <= scaledCrop.y + scaledCrop.height) {
      return 'move'
    }
    
    return null
  }

  const getCursorForHandle = (handle: DragHandle): string => {
    switch (handle) {
      case 'tl': return 'nw-resize'
      case 'tr': return 'ne-resize'
      case 'bl': return 'sw-resize'
      case 'br': return 'se-resize'
      case 't': return 'n-resize'
      case 'b': return 's-resize'
      case 'l': return 'w-resize'
      case 'r': return 'e-resize'
      case 'move': return 'move'
      default: return 'default'
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const handle = getHandleAtPosition(x, y)
    if (handle) {
      setIsDragging(true)
      setDragHandle(handle)
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        cropX: cropArea.x,
        cropY: cropArea.y,
        cropW: cropArea.width,
        cropH: cropArea.height,
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // Update cursor based on handle
    if (!isDragging) {
      const handle = getHandleAtPosition(x, y)
      canvasRef.current.style.cursor = getCursorForHandle(handle)
    }
    
    if (!isDragging || !image) return

    // Track mouse intent even when outside bounds
    setMouseIntent({ x: e.clientX, y: e.clientY })
    
    const deltaX = (e.clientX - dragStart.x) / scale
    const deltaY = (e.clientY - dragStart.y) / scale
    
    let newCrop = { ...cropArea }
    
    switch (dragHandle) {
      case 'move':
        newCrop.x = Math.max(0, Math.min(image.width - dragStart.cropW, dragStart.cropX + deltaX))
        newCrop.y = Math.max(0, Math.min(image.height - dragStart.cropH, dragStart.cropY + deltaY))
        break
        
      case 'tl':
        newCrop.x = Math.max(0, Math.min(dragStart.cropX + dragStart.cropW - 50, dragStart.cropX + deltaX))
        newCrop.y = Math.max(0, Math.min(dragStart.cropY + dragStart.cropH - 50, dragStart.cropY + deltaY))
        newCrop.width = dragStart.cropW - (newCrop.x - dragStart.cropX)
        newCrop.height = dragStart.cropH - (newCrop.y - dragStart.cropY)
        break
        
      case 'tr':
        newCrop.width = Math.max(50, Math.min(image.width - dragStart.cropX, dragStart.cropW + deltaX))
        newCrop.y = Math.max(0, Math.min(dragStart.cropY + dragStart.cropH - 50, dragStart.cropY + deltaY))
        newCrop.height = dragStart.cropH - (newCrop.y - dragStart.cropY)
        break
        
      case 'bl':
        newCrop.x = Math.max(0, Math.min(dragStart.cropX + dragStart.cropW - 50, dragStart.cropX + deltaX))
        newCrop.width = dragStart.cropW - (newCrop.x - dragStart.cropX)
        newCrop.height = Math.max(50, Math.min(image.height - dragStart.cropY, dragStart.cropH + deltaY))
        break
        
      case 'br':
        newCrop.width = Math.max(50, Math.min(image.width - dragStart.cropX, dragStart.cropW + deltaX))
        newCrop.height = Math.max(50, Math.min(image.height - dragStart.cropY, dragStart.cropH + deltaY))
        break
        
      case 't':
        newCrop.y = Math.max(0, Math.min(dragStart.cropY + dragStart.cropH - 50, dragStart.cropY + deltaY))
        newCrop.height = dragStart.cropH - (newCrop.y - dragStart.cropY)
        break
        
      case 'b':
        newCrop.height = Math.max(50, Math.min(image.height - dragStart.cropY, dragStart.cropH + deltaY))
        break
        
      case 'l':
        newCrop.x = Math.max(0, Math.min(dragStart.cropX + dragStart.cropW - 50, dragStart.cropX + deltaX))
        newCrop.width = dragStart.cropW - (newCrop.x - dragStart.cropX)
        break
        
      case 'r':
        newCrop.width = Math.max(50, Math.min(image.width - dragStart.cropX, dragStart.cropW + deltaX))
        break
    }
    
    setCropArea(newCrop)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragHandle(null)
  }

  // Global mouse events to handle dragging outside canvas
  useEffect(() => {
    if (!isDragging) return
    
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current || !image) return
      
      const rect = canvasRef.current.getBoundingClientRect()
      const syntheticEvent = {
        clientX: e.clientX,
        clientY: e.clientY,
      } as React.MouseEvent<HTMLCanvasElement>
      
      handleMouseMove(syntheticEvent)
    }
    
    const handleGlobalMouseUp = () => {
      handleMouseUp()
    }
    
    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, dragHandle, dragStart, image, scale])

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
      cropArea.x,
      cropArea.y,
      cropArea.width,
      cropArea.height,
      0,
      0,
      targetWidth,
      targetHeight,
    )

    // Convert to data URL
    const croppedDataUrl = cropCanvas.toDataURL('image/png')
    onCrop(croppedDataUrl)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-1 rounded-lg max-w-5xl w-full">
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold text-white">✂️ Crop Image</h2>
          <p className="text-sm text-muted mt-1">
            Drag the handles to adjust the crop area. The image will be resized to {targetWidth}×{targetHeight}px
          </p>
        </div>

        <div className="p-4">
          <div className="flex justify-center bg-surface-2 rounded p-4" ref={containerRef}>
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="border border-border"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>

          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-muted">
              {image && (
                <>
                  <span className="mr-4">📐 Original: {image.width}×{image.height}px</span>
                  <span className="mr-4">✂️ Crop: {Math.round(cropArea.width)}×{Math.round(cropArea.height)}px</span>
                  <span>🎯 Output: {targetWidth}×{targetHeight}px</span>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-surface-2 hover:brightness-110 rounded text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCrop}
                className="px-4 py-2 bg-violet hover:brightness-110 rounded text-white"
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