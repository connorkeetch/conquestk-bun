import { useEffect, useRef, useState } from 'react'

interface ResponsiveMapContainerProps {
  children: React.ReactNode
  mapWidth: number
  mapHeight: number
  className?: string
}

export default function ResponsiveMapContainer({
  children,
  mapWidth,
  mapHeight,
  className = '',
}: ResponsiveMapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [dimensions, setDimensions] = useState({ width: mapWidth, height: mapHeight })

  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current) return

      const container = containerRef.current
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight

      // Calculate scale to fit map within container
      const scaleX = containerWidth / mapWidth
      const scaleY = containerHeight / mapHeight
      const newScale = Math.min(scaleX, scaleY, 1) // Never scale up beyond 100%

      setScale(newScale)
      setDimensions({
        width: mapWidth * newScale,
        height: mapHeight * newScale,
      })
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

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center bg-surface-1 ${className}`}
    >
      <div
        className="relative"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </div>
      
      {/* Scale indicator */}
      {scale < 1 && (
        <div className="absolute top-2 right-2 bg-surface-2/90 px-2 py-1 rounded text-xs text-muted">
          Scaled to {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  )
}