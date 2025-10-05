import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import useZoomPan from '@/hooks/useZoomPan'
import { centerPan, makeTransform, resetView, setImageSize } from '@/store/mapViewSlice'

interface MapCanvasProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  children?: React.ReactNode
}

export function MapCanvas({ imageUrl, imageWidth, imageHeight, children }: MapCanvasProps) {
  const dispatch = useAppDispatch()
  const containerRef = useRef<HTMLDivElement>(null)
  const view = useAppSelector((s) => s.mapView)
  const { onMouseDown, onTouchStart, onTouchMove, onTouchEnd } = useZoomPan({ containerRef })

  // Initialize image size and center when both viewport and image known
  useEffect(() => {
    dispatch(setImageSize({ w: imageWidth, h: imageHeight }))
  }, [dispatch, imageHeight, imageWidth])

  useEffect(() => {
    if (view.viewport.w > 0 && view.viewport.h > 0 && view.image.w > 0 && view.image.h > 0) {
      const _centered = centerPan({ viewport: view.viewport, image: view.image, scale: view.scale })
      // Only auto-center first time when tx/ty are both 0 (fresh mount)
      if (view.tx === 0 && view.ty === 0) {
        // Use reset to also set scale to 1
        dispatch(resetView())
      } else {
        // no-op; user already panned
      }
    }
  }, [dispatch, view.image, view.scale, view.tx, view.ty, view.viewport])

  const transform = useMemo(
    () => makeTransform(view.tx, view.ty, view.scale),
    [view.scale, view.tx, view.ty],
  )

  return (
    <div
      ref={containerRef}
      className="mapViewport relative w-full h-full overflow-hidden bg-[color:var(--surface-1)] touch-pan-y"
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
      >
        {/* Base image at intrinsic dimensions so token coords align in image pixel space */}
        <img
          src={imageUrl}
          alt="Game map"
          draggable={false}
          style={{
            width: imageWidth,
            height: imageHeight,
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
