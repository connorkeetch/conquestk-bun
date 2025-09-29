import { useEffect, useMemo, useRef, useState } from 'react'

interface ResponsiveMapContainerProps {
  children: React.ReactNode
  mapWidth: number
  mapHeight: number
  className?: string
  showMinimap?: boolean
  backgroundImageUrl?: string
  focus?: { x: number; y: number } | null
}

export default function ResponsiveMapContainer({
  children,
  mapWidth,
  mapHeight,
  className = '',
  showMinimap = true,
  backgroundImageUrl,
  focus = null,
}: ResponsiveMapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [baseScale, setBaseScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{
    x: number
    y: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)

  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current) return

      const container = containerRef.current
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight

      // Calculate scale to fit map within container
      const scaleX = containerWidth / mapWidth
      const scaleY = containerHeight / mapHeight
      const newScale = Math.min(scaleX, scaleY, 1) // fit-to-container, never upscale baseline
      setBaseScale(newScale)
    }

    calculateScale()

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateScale)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [mapWidth, mapHeight])

  // Compute displayed dimensions from baseScale and zoom
  const display = useMemo(() => {
    const width = Math.max(1, Math.round(mapWidth * baseScale * zoom))
    const height = Math.max(1, Math.round(mapHeight * baseScale * zoom))
    return { width, height }
  }, [mapWidth, mapHeight, baseScale, zoom])

  // Zoom handlers (Ctrl/Meta + wheel). Also provide UI buttons.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Only zoom when user intent is clear (Ctrl/Cmd or trackpad pinch which sets ctrlKey)
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom((z) => Math.min(3, Math.max(0.5, Math.round((z + delta) * 10) / 10)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

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

  // Minimap computations
  const minimap = useMemo(() => {
    const mmWidth = 140 // px
    const ratio = mapHeight > 0 ? mapWidth / mapHeight : 1
    const mmHeight = Math.max(60, Math.round(mmWidth / Math.max(0.1, ratio)))
    const el = containerRef.current
    const clientW = el?.clientWidth ?? 1
    const clientH = el?.clientHeight ?? 1
    const scrollL = el?.scrollLeft ?? 0
    const scrollT = el?.scrollTop ?? 0
    const viewW = (clientW / Math.max(1, display.width)) * mmWidth
    const viewH = (clientH / Math.max(1, display.height)) * mmHeight
    const viewX = (scrollL / Math.max(1, display.width)) * mmWidth
    const viewY = (scrollT / Math.max(1, display.height)) * mmHeight
    return { mmWidth, mmHeight, viewW, viewH, viewX, viewY }
  }, [display.width, display.height, mapWidth, mapHeight])

  const handleMinimapClick = (e: React.MouseEvent<HTMLElement>) => {
    const el = containerRef.current
    if (!el) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const relX = e.clientX - rect.left
    const relY = e.clientY - rect.top
    // Center viewport around clicked point
    const targetX = (relX / minimap.mmWidth) * display.width - el.clientWidth / 2
    const targetY = (relY / minimap.mmHeight) * display.height - el.clientHeight / 2
    el.scrollLeft = Math.max(0, Math.min(display.width - el.clientWidth, targetX))
    el.scrollTop = Math.max(0, Math.min(display.height - el.clientHeight, targetY))
  }

  // Focus pan when focus coordinates change
  useEffect(() => {
    if (!focus) return
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
    // Smooth scroll when supported
    const anyEl = el as unknown as {
      scrollTo?: (opts: { left: number; top: number; behavior?: 'auto' | 'smooth' }) => void
    }
    if (typeof anyEl.scrollTo === 'function') {
      anyEl.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' })
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

      {/* Zoom controls */}
      <div className="absolute bottom-2 right-2 flex gap-2 bg-surface-2/80 backdrop-blur px-2 py-1 rounded">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
          title="Zoom out (Ctrl/Cmd + scroll)"
        >
          −
        </button>
        <div className="text-xs self-center w-16 text-center text-muted">
          {Math.round(zoom * 100)}%
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))}
          title="Zoom in (Ctrl/Cmd + scroll)"
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setZoom(1)}
          title="Reset zoom"
        >
          Reset
        </button>
      </div>

      {/* Minimap */}
      {showMinimap && (
        <button
          type="button"
          className="absolute bottom-2 left-2 rounded border border-border overflow-hidden bg-surface-2/80 backdrop-blur"
          style={{ width: minimap.mmWidth, height: minimap.mmHeight }}
          onClick={handleMinimapClick}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleMinimapClick(e as unknown as React.MouseEvent<HTMLDivElement>)
            }
          }}
        >
          <div
            className="w-full h-full"
            style={
              backgroundImageUrl
                ? {
                    backgroundImage: `url(${backgroundImageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }
                : { background: 'linear-gradient(45deg, #1f2937, #374151)' }
            }
          />
          <div
            className="absolute border-2 border-primary/90 bg-black/10 pointer-events-none"
            style={{
              width: Math.max(8, minimap.viewW),
              height: Math.max(8, minimap.viewH),
              left: minimap.viewX,
              top: minimap.viewY,
            }}
          />
        </button>
      )}
    </div>
  )
}
