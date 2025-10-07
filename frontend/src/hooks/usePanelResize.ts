import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_PANEL_WIDTH, MIN_PANEL_WIDTH, type PanelSide } from '@/store/panelsSlice'

interface UsePanelResizeOptions {
  initialWidth: number
  side: PanelSide
  onResize: (width: number) => void
  disabled?: boolean
}

interface UsePanelResizeResult {
  width: number
  isDragging: boolean
  resizeHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void
    onTouchStart: (e: React.TouchEvent) => void
  }
}

/**
 * Custom hook for panel resize functionality
 * Handles mouse and touch events for drag-to-resize
 */
export function usePanelResize({
  initialWidth,
  side,
  onResize,
  disabled = false,
}: UsePanelResizeOptions): UsePanelResizeResult {
  const [width, setWidth] = useState(initialWidth)
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(initialWidth)

  // Sync with initial width when it changes externally
  useEffect(() => {
    setWidth(initialWidth)
  }, [initialWidth])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return

      // Calculate delta based on panel position
      // Left panels: drag right to increase width (positive delta)
      // Right panels: drag left to increase width (negative delta)
      const deltaX = side === 'left' ? e.clientX - startXRef.current : startXRef.current - e.clientX

      const newWidth = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(MAX_PANEL_WIDTH, startWidthRef.current + deltaX),
      )

      setWidth(newWidth)
    },
    [isDragging, side],
  )

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      onResize(width)
    }
  }, [isDragging, width, onResize])

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || !e.touches[0]) return

      const deltaX =
        side === 'left'
          ? e.touches[0].clientX - startXRef.current
          : startXRef.current - e.touches[0].clientX

      const newWidth = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(MAX_PANEL_WIDTH, startWidthRef.current + deltaX),
      )

      setWidth(newWidth)
    },
    [isDragging, side],
  )

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      onResize(width)
    }
  }, [isDragging, width, onResize])

  // Setup event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleTouchEnd)

      // Prevent text selection while dragging
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ew-resize'

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)

        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return
      e.preventDefault()
      setIsDragging(true)
      startXRef.current = e.clientX
      startWidthRef.current = width
    },
    [disabled, width],
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !e.touches[0]) return
      e.preventDefault()
      setIsDragging(true)
      startXRef.current = e.touches[0].clientX
      startWidthRef.current = width
    },
    [disabled, width],
  )

  return {
    width,
    isDragging,
    resizeHandleProps: {
      onMouseDown: handleMouseDown,
      onTouchStart: handleTouchStart,
    },
  }
}
