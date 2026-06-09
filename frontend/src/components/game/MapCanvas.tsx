import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import useZoomPan from '@/hooks/useZoomPan'
import { makeTransform, resetView, setImageSize } from '@/store/mapViewSlice'
import { cfImage, cfImageSrcSet } from '@/utils/assets'

interface MapCanvasProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  children?: React.ReactNode
  // Optional background click: fires when clicking map image/stage (not tokens)
  onBackgroundClick?: (e: React.MouseEvent) => void
}

export function MapCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  children,
  onBackgroundClick,
}: MapCanvasProps) {
  const dispatch = useAppDispatch()
  const containerRef = useRef<HTMLDivElement>(null)
  const view = useAppSelector((s) => s.mapView)
  const { onMouseDown, onTouchStart, onTouchMove, onTouchEnd } = useZoomPan({ containerRef })
  // Track whether a mouse click originated on the stage itself.
  // This prevents accidental background clears when mouseup happens on the stage
  // but mousedown started elsewhere (e.g., dragging a scrollbar or slider).
  const mouseDownOnStageRef = useRef(false)

  // Initialize image size and center when both viewport and image known
  useEffect(() => {
    dispatch(setImageSize({ w: imageWidth, h: imageHeight }))
  }, [dispatch, imageHeight, imageWidth])

  useEffect(() => {
    if (view.viewport.w > 0 && view.viewport.h > 0 && view.image.w > 0 && view.image.h > 0) {
      // Only auto-center first time when tx/ty are both 0 (fresh mount)
      if (view.tx === 0 && view.ty === 0) {
        // Use reset to also set scale to 1
        dispatch(resetView())
      }
    }
  }, [dispatch, view.viewport.w, view.viewport.h, view.image.w, view.image.h, view.tx, view.ty])

  // Always clear the stage mousedown flag on any mouseup to avoid stale state
  useEffect(() => {
    const handleWindowMouseUp = () => {
      mouseDownOnStageRef.current = false
    }
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => window.removeEventListener('mouseup', handleWindowMouseUp)
  }, [])

  const transform = useMemo(
    () => makeTransform(view.tx, view.ty, view.scale),
    [view.scale, view.tx, view.ty],
  )

  // Build srcset using Cloudflare Image Transformations
  // Generate responsive widths based on common breakpoints
  const responsiveSrcSet = useMemo(() => {
    const widths = [640, 1024, 1536, 2048].filter((w) => w <= imageWidth * 1.5)
    if (widths.length === 0) return `${imageUrl} ${imageWidth}w`
    return cfImageSrcSet(imageUrl, widths, { format: 'auto', quality: 85 })
  }, [imageUrl, imageWidth])

  // Optimized src with format auto-negotiation
  const optimizedSrc = useMemo(() => cfImage(imageUrl, { format: 'auto', quality: 85 }), [imageUrl])

  return (
    <div
      ref={containerRef}
      className="mapViewport relative w-full h-full overflow-hidden bg-[color:var(--surface-1)]"
      style={{ touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
      role="application"
      aria-label="Game map viewport"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="mapStage absolute left-0 top-0 will-change-transform"
        style={{
          transform,
          transformOrigin: '0 0',
          width: imageWidth,
          height: imageHeight,
        }}
        role="application"
        tabIndex={-1}
        aria-label="Map stage"
        onMouseDown={() => {
          // Only clicks that originate on the stage should trigger a background click
          mouseDownOnStageRef.current = true
        }}
        onClick={(e) => {
          // Ignore clicks where the press started outside the stage (e.g., scrollbar)
          if (!mouseDownOnStageRef.current) return
          mouseDownOnStageRef.current = false
          onBackgroundClick?.(e)
        }}
        onKeyDown={(e) => {
          if (!onBackgroundClick) return
          if (e.key === 'Enter' || e.key === ' ') {
            onBackgroundClick(e as unknown as React.MouseEvent)
          }
        }}
      >
        {/* Base image at intrinsic dimensions so token coords align in image pixel space */}
        {/* Using Cloudflare Image Transformations for on-the-fly format/size optimization */}
        <img
          src={optimizedSrc}
          alt="Game map"
          draggable={false}
          srcSet={responsiveSrcSet}
          sizes={`${imageWidth}px`}
          /* Reserve intrinsic size to prevent layout shifts and help LCP */
          width={imageWidth}
          height={imageHeight}
          /* Hint browser this is the LCP candidate */
          loading="eager"
          decoding="async"
          fetchPriority="high"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'top left',
            maxWidth: 'none',
            maxHeight: 'none',
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
        {/* Children (tokens/overlays) should be absolutely positioned relative to image top-left */}
        {children}
      </div>
    </div>
  )
}

export default MapCanvas
