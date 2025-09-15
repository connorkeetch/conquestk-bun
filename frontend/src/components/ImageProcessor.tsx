import type React from 'react'
import { useEffect, useRef, useState } from 'react'

interface ImageProcessorProps {
  imageUrl: string
  onComplete: (processedImageUrl: string, dimensions: { width: number; height: number }) => void
  onCancel: () => void
  maxWidth?: number
  maxHeight?: number
}

export default function ImageProcessor({
  imageUrl,
  onComplete,
  onCancel,
  maxWidth = 2560,
  maxHeight = 1440,
}: ImageProcessorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [targetWidth, setTargetWidth] = useState(800)
  const [targetHeight, setTargetHeight] = useState(600)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImage(img)

      // Initialize crop area to center
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

      // Calculate preview scale
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
    ctx.strokeStyle = '#3B82F6'
    ctx.lineWidth = 2
    ctx.strokeRect(scaledCrop.x, scaledCrop.y, scaledCrop.width, scaledCrop.height)

    // Draw corner handles (make them bigger and more visible)
    const handleSize = 12
    ctx.fillStyle = '#3B82F6'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    const handles = [
      { x: scaledCrop.x, y: scaledCrop.y },
      { x: scaledCrop.x + scaledCrop.width, y: scaledCrop.y },
      { x: scaledCrop.x, y: scaledCrop.y + scaledCrop.height },
      { x: scaledCrop.x + scaledCrop.width, y: scaledCrop.y + scaledCrop.height },
    ]
    handles.forEach((handle) => {
      // White border for visibility
      ctx.fillStyle = '#fff'
      ctx.fillRect(
        handle.x - handleSize / 2 - 1,
        handle.y - handleSize / 2 - 1,
        handleSize + 2,
        handleSize + 2,
      )
      // Blue handle
      ctx.fillStyle = '#3B82F6'
      ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
    })
  }, [image, cropArea, scale])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    // Check if clicking on a resize handle (corners)
    const handleSize = 20 // Larger hit area for easier grabbing
    const handles = [
      { id: 'tl', x: cropArea.x, y: cropArea.y },
      { id: 'tr', x: cropArea.x + cropArea.width, y: cropArea.y },
      { id: 'bl', x: cropArea.x, y: cropArea.y + cropArea.height },
      { id: 'br', x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height },
    ]

    for (const handle of handles) {
      if (Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize) {
        setIsResizing(true)
        setResizeHandle(handle.id)
        setDragStart({ x, y })
        return
      }
    }

    // Check if click is inside crop area (for dragging)
    if (
      x >= cropArea.x &&
      x <= cropArea.x + cropArea.width &&
      y >= cropArea.y &&
      y <= cropArea.y + cropArea.height
    ) {
      setIsDragging(true)
      setDragStart({ x: x - cropArea.x, y: y - cropArea.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !image) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    if (isResizing && resizeHandle) {
      // Handle resizing based on which corner is being dragged
      const newCrop = { ...cropArea }
      const minSize = 100 // Minimum crop size

      switch (resizeHandle) {
        case 'tl': // Top-left
          newCrop.width = Math.max(minSize, cropArea.x + cropArea.width - x)
          newCrop.height = Math.max(minSize, cropArea.y + cropArea.height - y)
          newCrop.x = Math.min(x, cropArea.x + cropArea.width - minSize)
          newCrop.y = Math.min(y, cropArea.y + cropArea.height - minSize)
          break
        case 'tr': // Top-right
          newCrop.width = Math.max(minSize, x - cropArea.x)
          newCrop.height = Math.max(minSize, cropArea.y + cropArea.height - y)
          newCrop.y = Math.min(y, cropArea.y + cropArea.height - minSize)
          break
        case 'bl': // Bottom-left
          newCrop.width = Math.max(minSize, cropArea.x + cropArea.width - x)
          newCrop.height = Math.max(minSize, y - cropArea.y)
          newCrop.x = Math.min(x, cropArea.x + cropArea.width - minSize)
          break
        case 'br': // Bottom-right
          newCrop.width = Math.max(minSize, x - cropArea.x)
          newCrop.height = Math.max(minSize, y - cropArea.y)
          break
      }

      // Keep within image bounds
      newCrop.x = Math.max(0, newCrop.x)
      newCrop.y = Math.max(0, newCrop.y)
      newCrop.width = Math.min(image.width - newCrop.x, newCrop.width)
      newCrop.height = Math.min(image.height - newCrop.y, newCrop.height)

      setCropArea(newCrop)

      // Update target dimensions to match aspect ratio
      const aspectRatio = newCrop.width / newCrop.height
      if (aspectRatio > 1) {
        setTargetWidth(Math.min(maxWidth, Math.round(targetHeight * aspectRatio)))
      } else {
        setTargetHeight(Math.min(maxHeight, Math.round(targetWidth / aspectRatio)))
      }
    } else if (isDragging) {
      const newX = Math.max(0, Math.min(image.width - cropArea.width, x - dragStart.x))
      const newY = Math.max(0, Math.min(image.height - cropArea.height, y - dragStart.y))
      setCropArea((prev) => ({ ...prev, x: newX, y: newY }))
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsResizing(false)
    setResizeHandle(null)
  }

  const handleProcess = () => {
    if (!image) return

    // Create output canvas
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = targetWidth
    outputCanvas.height = targetHeight
    const ctx = outputCanvas.getContext('2d')

    if (!ctx) return

    // Draw cropped portion
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
    const croppedDataUrl = outputCanvas.toDataURL('image/png')
    onComplete(croppedDataUrl, { width: targetWidth, height: targetHeight })
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-1 rounded-lg max-w-4xl w-full">
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold text-white">Crop Image</h2>
          <p className="text-sm text-muted mt-1">
            Drag to position the crop area. Image will be resized to target dimensions.
          </p>
        </div>

        <div className="p-4">
          {/* Target Dimensions */}
          <div className="mb-4 flex items-center gap-4 p-3 bg-surface-2 rounded-lg">
            <span className="text-sm text-muted">Target Size:</span>
            <input
              type="number"
              value={targetWidth}
              onChange={(e) =>
                setTargetWidth(Math.min(maxWidth, Math.max(400, parseInt(e.target.value) || 400)))
              }
              className="w-24 px-2 py-1 bg-gray-600 text-white rounded"
              min="400"
              max={maxWidth}
            />
            <span className="text-muted">×</span>
            <input
              type="number"
              value={targetHeight}
              onChange={(e) =>
                setTargetHeight(Math.min(maxHeight, Math.max(300, parseInt(e.target.value) || 300)))
              }
              className="w-24 px-2 py-1 bg-gray-600 text-white rounded"
              min="300"
              max={maxHeight}
            />
            <span className="text-sm text-muted">pixels</span>
          </div>

          {/* Canvas Preview */}
          <div className="flex justify-center bg-surface-1 rounded p-4">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="border border-border"
              style={{
                maxWidth: '100%',
                height: 'auto',
                cursor: isResizing
                  ? resizeHandle === 'tl' || resizeHandle === 'br'
                    ? 'nwse-resize'
                    : 'nesw-resize'
                  : isDragging
                    ? 'move'
                    : 'default',
              }}
            />
          </div>

          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-muted">
              {image && (
                <>
                  Original: {image.width}×{image.height}px | Crop: {Math.round(cropArea.width)}×
                  {Math.round(cropArea.height)}px → {targetWidth}×{targetHeight}px
                </>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-surface-2 hover:bg-gray-600 rounded text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleProcess}
                className="px-4 py-2 bg-primary hover:bg-primary rounded text-white"
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
