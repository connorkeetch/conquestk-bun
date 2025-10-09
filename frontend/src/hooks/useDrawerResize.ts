import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_DRAWER_HEIGHT_VH, MIN_DRAWER_HEIGHT } from '@/store/panelsSlice'

interface UseDrawerResizeOptions {
  initialHeight: number
  onResize: (height: number) => void
  disabled?: boolean
}

interface UseDrawerResizeResult {
  height: number
  isDragging: boolean
  resizeHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void
    onTouchStart: (e: React.TouchEvent) => void
  }
}

/**
 * Custom hook for drawer vertical resize functionality
 * Handles mouse and touch events for drag-to-resize vertically
 */
export function useDrawerResize({
  initialHeight,
  onResize,
  disabled = false,
}: UseDrawerResizeOptions): UseDrawerResizeResult {
  const [height, setHeight] = useState(initialHeight)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(initialHeight)

  // Sync with initial height when it changes externally
  useEffect(() => {
    setHeight(initialHeight)
  }, [initialHeight])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return

      // Calculate delta: dragging up (negative) increases height, down (positive) decreases
      const deltaY = startYRef.current - e.clientY
      const rawHeight = startHeightRef.current + deltaY

      // Clamp to min and max (as % of viewport height)
      const maxHeight = (window.innerHeight * MAX_DRAWER_HEIGHT_VH) / 100
      const newHeight = Math.max(MIN_DRAWER_HEIGHT, Math.min(maxHeight, rawHeight))

      setHeight(newHeight)
    },
    [isDragging],
  )

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      onResize(height)
    }
  }, [isDragging, height, onResize])

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || !e.touches[0]) return

      const deltaY = startYRef.current - e.touches[0].clientY
      const rawHeight = startHeightRef.current + deltaY

      const maxHeight = (window.innerHeight * MAX_DRAWER_HEIGHT_VH) / 100
      const newHeight = Math.max(MIN_DRAWER_HEIGHT, Math.min(maxHeight, rawHeight))

      setHeight(newHeight)
    },
    [isDragging],
  )

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      onResize(height)
    }
  }, [isDragging, height, onResize])

  // Setup event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleTouchEnd)

      // Prevent text selection while dragging
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ns-resize'

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
      e.stopPropagation() // Prevent drawer toggle on drag handle click
      setIsDragging(true)
      startYRef.current = e.clientY
      startHeightRef.current = height
    },
    [disabled, height],
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !e.touches[0]) return
      e.preventDefault()
      e.stopPropagation() // Prevent drawer toggle on drag handle touch
      setIsDragging(true)
      startYRef.current = e.touches[0].clientY
      startHeightRef.current = height
    },
    [disabled, height],
  )

  return {
    height,
    isDragging,
    resizeHandleProps: {
      onMouseDown: handleMouseDown,
      onTouchStart: handleTouchStart,
    },
  }
}
