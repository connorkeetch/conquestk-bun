import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ZoomControls, ZoomControlsReadyHandler } from '@/types/zoom'

export type { ZoomControls }

interface ResponsiveMapContainerProps {
  children: React.ReactNode
  mapWidth: number
  mapHeight: number
  className?: string
  backgroundImageUrl?: string
  focus?: { x: number; y: number } | null
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onZoomControlsReady?: ZoomControlsReadyHandler
}

interface MapViewportContextValue {
  zoom: number
  baseScale: number
  scale: number
  displayWidth: number
  displayHeight: number
  setZoom: (zoom: number | ((prev: number) => number)) => void
}

const MapViewportContext = createContext<MapViewportContextValue | null>(null)

export function useMapViewport() {
  return useContext(MapViewportContext)
}

export default function ResponsiveMapContainer({
  children,
  mapWidth,
  mapHeight,
  className = '',
  backgroundImageUrl: _backgroundImageUrl,
  focus = null,
  onSwipeLeft,
  onSwipeRight,
  onZoomControlsReady,
}: ResponsiveMapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [baseScale, setBaseScale] = useState(1)
  const [zoom, setZoom] = useState(1)

  // Clamp helpers based on current baseScale
  const clampZoom = useCallback(
    (z: number) => {
      const safeBase = Math.max(0.000001, Math.min(1, baseScale))
      // Allow up to 200% effective scale relative to source
      const maxZoom = 2 / safeBase
      const minZoom = 0.5
      const rounded = Math.round(z * 100) / 100
      return Math.max(minZoom, Math.min(maxZoom, rounded))
    },
    [baseScale],
  )

  // Create stable zoom control callbacks (10% steps)
  const zoomIn = useCallback(() => {
    setZoom((z) => clampZoom(z + 0.1))
  }, [clampZoom])

  const zoomOut = useCallback(() => {
    setZoom((z) => clampZoom(z - 0.1))
  }, [clampZoom])

  const resetZoom = useCallback(() => {
    setZoom(1)
  }, [])

  const setZoomClamped = useCallback(
    (next: number | ((prev: number) => number)) => {
      if (typeof next === 'function') {
        setZoom((prev) => clampZoom((next as (p: number) => number)(prev)))
      } else {
        setZoom(clampZoom(next))
      }
    },
    [clampZoom],
  )

  const controls = useMemo(
    () => ({
      zoom,
      scale: Math.min(1, baseScale) * zoom,
      baseScale: Math.min(1, baseScale),
      zoomIn,
      zoomOut,
      resetZoom,
      setZoom: setZoomClamped,
    }),
    [zoom, baseScale, zoomIn, zoomOut, resetZoom, setZoomClamped],
  )

  useEffect(() => {
    onZoomControlsReady?.(controls)
  }, [controls, onZoomControlsReady])

  useEffect(() => {
    if (!onZoomControlsReady) {
      return
    }
    return () => {
      onZoomControlsReady(null)
    }
  }, [onZoomControlsReady])
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{
    x: number
    y: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null)
  const touchPanStartRef = useRef<{
    x: number
    y: number
    scrollLeft: number
    scrollTop: number
    t: number
  } | null>(null)

  const calculateScale = useCallback(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    // Calculate scale to fit map within container
    const scaleX = containerWidth / mapWidth
    const scaleY = containerHeight / mapHeight
    // Fit the whole map within the container (allow shrinking below 1:1)
    // Fit the whole map within the container, but do not upscale past 1:1
    const newScale = Math.min(scaleX, scaleY)
    setBaseScale(Math.min(1, newScale))
  }, [mapWidth, mapHeight])

  useEffect(() => {
    calculateScale()

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateScale)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [calculateScale])

  // Don't persist zoom - always start at default 1.0 on page load
  // (Removed zoom persistence to localStorage)

  // Compute displayed dimensions from baseScale and zoom
  const display = useMemo(() => {
    const width = Math.max(1, Math.round(mapWidth * baseScale * zoom))
    const height = Math.max(1, Math.round(mapHeight * baseScale * zoom))
    return { width, height }
  }, [mapWidth, mapHeight, baseScale, zoom])

  const viewportContext = useMemo<MapViewportContextValue>(
    () => ({
      zoom,
      baseScale,
      scale: baseScale * zoom,
      displayWidth: display.width,
      displayHeight: display.height,
      setZoom: setZoomClamped,
    }),
    [zoom, baseScale, display.width, display.height, setZoomClamped],
  )

  // Zoom handlers (Ctrl/Meta + wheel)

  // Ctrl/Cmd + Wheel to zoom (zoom around cursor) in 10% steps
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const viewX = e.clientX - rect.left
      const viewY = e.clientY - rect.top
      const contentX = el.scrollLeft + viewX
      const contentY = el.scrollTop + viewY
      const relX = display.width > 0 ? contentX / display.width : 0
      const relY = display.height > 0 ? contentY / display.height : 0

      const delta = e.deltaY
      const step = delta > 0 ? -0.1 : 0.1
      const nextZoom = clampZoom(zoom + step)
      if (nextZoom === zoom) return

      setZoom(nextZoom)

      const nextWidth = Math.max(1, Math.round(mapWidth * baseScale * nextZoom))
      const nextHeight = Math.max(1, Math.round(mapHeight * baseScale * nextZoom))
      const targetLeft = relX * nextWidth - viewX
      const targetTop = relY * nextHeight - viewY

      requestAnimationFrame(() => {
        const maxLeft = Math.max(0, nextWidth - el.clientWidth)
        const maxTop = Math.max(0, nextHeight - el.clientHeight)
        el.scrollLeft = Math.max(0, Math.min(maxLeft, targetLeft))
        el.scrollTop = Math.max(0, Math.min(maxTop, targetTop))
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [zoom, baseScale, mapWidth, mapHeight, display.width, display.height, clampZoom])

  // Drag-to-pan using middle (button=1) or right mouse (button=2) to avoid conflicts with left-click
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault()
        isDraggingRef.current = true
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
        }
        // Temporarily disable text selection
        document.body.style.userSelect = 'none'
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return
      e.preventDefault()
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      el.scrollLeft = dragStartRef.current.scrollLeft - dx
      el.scrollTop = dragStartRef.current.scrollTop - dy
    }

    const endDrag = () => {
      isDraggingRef.current = false
      dragStartRef.current = null
      document.body.style.userSelect = ''
    }

    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', endDrag)
    el.addEventListener('mouseleave', endDrag)

    const preventContext = (e: MouseEvent) => {
      if (isDraggingRef.current) e.preventDefault()
    }
    el.addEventListener('contextmenu', preventContext)

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', endDrag)
      el.removeEventListener('mouseleave', endDrag)
      el.removeEventListener('contextmenu', preventContext)
    }
  }, [])

  // Enhanced touch handling: pinch-to-zoom, single-finger pan, and swipe gestures
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const getDistance = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX
      const dy = t1.clientY - t2.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Single finger - could be pan or swipe
        const t = e.touches[0]
        touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
        touchPanStartRef.current = {
          x: t.clientX,
          y: t.clientY,
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          t: Date.now(),
        }
      } else if (e.touches.length === 2) {
        // Two fingers - pinch to zoom
        e.preventDefault() // Prevent default pinch behavior
        const distance = getDistance(e.touches[0], e.touches[1])
        pinchStartRef.current = { distance, zoom }
        touchStartRef.current = null
        touchPanStartRef.current = null
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        // Pinch zoom
        e.preventDefault()
        const newDistance = getDistance(e.touches[0], e.touches[1])
        const scale = newDistance / pinchStartRef.current.distance
        const newZoom = clampZoom(pinchStartRef.current.zoom * scale)
        setZoom(newZoom)
      } else if (e.touches.length === 1 && touchPanStartRef.current) {
        // Single finger pan
        const t = e.touches[0]
        const dx = t.clientX - touchPanStartRef.current.x
        const dy = t.clientY - touchPanStartRef.current.y
        const absX = Math.abs(dx)
        const absY = Math.abs(dy)

        // If moved more than 10px, it's a pan not a tap
        if (absX > 10 || absY > 10) {
          el.scrollLeft = touchPanStartRef.current.scrollLeft - dx
          el.scrollTop = touchPanStartRef.current.scrollTop - dy
        }
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      // Handle swipe gestures (quick horizontal movement)
      const start = touchStartRef.current
      if (start && e.changedTouches.length === 1) {
        const end = e.changedTouches[0]
        const dx = end.clientX - start.x
        const dy = end.clientY - start.y
        const dt = Date.now() - start.t
        const absX = Math.abs(dx)
        const absY = Math.abs(dy)

        // Quick horizontal swipe: threshold 50px, faster than 600ms, more horizontal than vertical
        if (dt < 600 && absX > 50 && absX > absY * 2) {
          // Trigger haptic feedback if available
          if ('vibrate' in navigator) {
            navigator.vibrate(10)
          }
          if (dx < 0) onSwipeLeft?.()
          else onSwipeRight?.()
        }
      }

      // Reset refs
      touchStartRef.current = null
      pinchStartRef.current = null
      touchPanStartRef.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [onSwipeLeft, onSwipeRight, zoom, clampZoom])

  // Minimap removed

  // Focus pan when focus coordinates change (but not on display dimension changes)
  const prevFocusRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!focus) {
      prevFocusRef.current = null
      return
    }

    // Only pan if focus actually changed, not on dimension changes
    if (prevFocusRef.current?.x === focus.x && prevFocusRef.current?.y === focus.y) {
      return
    }

    prevFocusRef.current = focus

    const el = containerRef.current
    if (!el) return

    // Convert map coordinates to displayed pixels
    const fx = (focus.x / mapWidth) * display.width
    const fy = (focus.y / mapHeight) * display.height
    const targetX = Math.max(0, Math.min(display.width - el.clientWidth, fx - el.clientWidth / 2))
    const targetY = Math.max(
      0,
      Math.min(display.height - el.clientHeight, fy - el.clientHeight / 2),
    )

    // Smooth scroll when supported, with fallback
    const anyEl = el as unknown as {
      scrollTo?: (opts: { left: number; top: number; behavior?: 'auto' | 'smooth' }) => void
    }
    if (typeof anyEl.scrollTo === 'function') {
      try {
        anyEl.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' })
      } catch {
        // Fallback if behavior option not supported
        el.scrollLeft = targetX
        el.scrollTop = targetY
      }
    } else {
      el.scrollLeft = targetX
      el.scrollTop = targetY
    }
  }, [focus, display.width, display.height, mapWidth, mapHeight])

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center bg-surface-1 overflow-auto ${className}`}
      style={{ cursor: isDraggingRef.current ? 'grabbing' : undefined }}
    >
      <MapViewportContext.Provider value={viewportContext}>
        <div
          className="relative"
          style={{ width: `${display.width}px`, height: `${display.height}px` }}
        >
          {children}
        </div>

        {/* Scale indicator */}
        {baseScale < 1 && zoom === 1 && (
          <div className="absolute top-2 right-2 bg-surface-2/90 px-2 py-1 rounded text-xs text-muted">
            Scaled to {Math.round(baseScale * 100)}%
          </div>
        )}

        {/* Minimap removed */}
      </MapViewportContext.Provider>
    </div>
  )
}
