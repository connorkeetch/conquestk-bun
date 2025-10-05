import { useCallback, useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import {
  allowedScales,
  nudgePan,
  resetView,
  setPan,
  setScale,
  setViewport,
} from '@/store/mapViewSlice'

interface UseZoomPanOpts {
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function useZoomPan({ containerRef }: UseZoomPanOpts) {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.mapView)

  // Resize observer for viewport size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect
        dispatch(setViewport({ w: Math.round(cr.width), h: Math.round(cr.height) }))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, dispatch])

  // Wheel to zoom (10% steps), anchored to cursor; clamps 50%–200%
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Handle zoom instead of scroll inside the map viewport
      e.preventDefault()
      // Determine zoom direction: deltaY > 0 => zoom out
      const dir = e.deltaY > 0 ? -1 : 1
      const step = 0.1
      const targetScale = Math.min(
        2,
        Math.max(0.5, Math.round((view.scale + dir * step) * 10) / 10),
      )

      // Anchor zoom at mouse position so the point under cursor remains stable
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const stageX = (cx - view.tx) / Math.max(0.000001, view.scale)
      const stageY = (cy - view.ty) / Math.max(0.000001, view.scale)
      const nextTx = Math.round(cx - stageX * targetScale)
      const nextTy = Math.round(cy - stageY * targetScale)

      dispatch(setScale(targetScale as Parameters<typeof setScale>[0]))
      dispatch(setPan({ tx: nextTx, ty: nextTy }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [containerRef, dispatch, view.scale, view.tx, view.ty])

  // Drag to pan (mouse)
  const dragRef = useRef<{
    startX: number
    startY: number
    startTx: number
    startTy: number
    active: boolean
  } | null>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const el = containerRef.current
      if (!el) return
      e.preventDefault()
      el.focus()
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: view.tx,
        startTy: view.ty,
        active: true,
      }
      document.body.style.cursor = 'grabbing'
    },
    [containerRef, view.tx, view.ty],
  )

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const d = dragRef.current
      if (!d?.active) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      dispatch(setPan({ tx: d.startTx + dx, ty: d.startTy + dy }))
    },
    [dispatch],
  )

  const endMouseDrag = useCallback(() => {
    if (dragRef.current?.active) {
      dragRef.current.active = false
      document.body.style.cursor = ''
    }
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', endMouseDrag)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', endMouseDrag)
    }
  }, [endMouseDrag, onMouseMove])

  // Touch: one finger drag to pan; ignore pinch
  const touchRef = useRef<{ x: number; y: number; startTx: number; startTy: number } | null>(null)
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      touchRef.current = { x: t.clientX, y: t.clientY, startTx: view.tx, startTy: view.ty }
    },
    [view.tx, view.ty],
  )
  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const d = touchRef.current
      if (!d) return
      const dx = t.clientX - d.x
      const dy = t.clientY - d.y
      dispatch(setPan({ tx: d.startTx + dx, ty: d.startTy + dy }))
    },
    [dispatch],
  )
  const onTouchEnd = useCallback(() => {
    touchRef.current = null
  }, [])

  // Keyboard panning + zoom presets
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }
      const k = e.key
      // Arrow key panning
      const step = 24
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault()
        const dx = k === 'ArrowLeft' ? step * -1 : k === 'ArrowRight' ? step : 0
        const dy = k === 'ArrowUp' ? step * -1 : k === 'ArrowDown' ? step : 0
        dispatch(nudgePan({ dx, dy }))
        return
      }
      // Zoom presets
      if (k === '1') {
        e.preventDefault()
        dispatch(setScale(0.8))
        return
      }
      if (k === '2') {
        e.preventDefault()
        dispatch(setScale(1))
        return
      }
      if (k === '3') {
        e.preventDefault()
        dispatch(setScale(1.2))
        return
      }
      if (k === '0') {
        e.preventDefault()
        dispatch(resetView())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  // Helpers for toolbar
  const applyScale = useCallback(
    (s: number) => {
      const nearest = allowedScales.reduce((prev, curr) =>
        Math.abs(curr - s) < Math.abs(prev - s) ? curr : prev,
      )
      dispatch(setScale(nearest))
    },
    [dispatch],
  )

  return {
    onMouseDown,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    applyScale,
  }
}

export default useZoomPan
