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
      // Only start panning when holding Ctrl (desktop)
      // Allow primary button only
      if (e.button !== 0) return
      if (!e.ctrlKey) return
      const el = containerRef.current
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
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

  // Touch gesture state
  // - Two-finger pinch to zoom + pan anchored to midpoint
  // - One-finger drag to pan (mobile convenience)
  const touchRef = useRef<{
    startDist: number
    startScale: number
    startTx: number
    startTy: number
    lastCx: number
    lastCy: number
  } | null>(null)
  const singleRef = useRef<{
    startX: number
    startY: number
    startTx: number
    startTy: number
    moved: boolean
  } | null>(null)
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]]
        const dx = t2.clientX - t1.clientX
        const dy = t2.clientY - t1.clientY
        const dist = Math.hypot(dx, dy)
        const cx = (t1.clientX + t2.clientX) / 2
        const cy = (t1.clientY + t2.clientY) / 2
        e.preventDefault()
        e.stopPropagation()
        touchRef.current = {
          startDist: Math.max(1, dist),
          startScale: view.scale,
          startTx: view.tx,
          startTy: view.ty,
          lastCx: cx,
          lastCy: cy,
        }
        // Reset single finger gesture when pinch begins
        singleRef.current = null
        return
      }
      if (e.touches.length === 1) {
        const t = e.touches[0]
        singleRef.current = {
          startX: t.clientX,
          startY: t.clientY,
          startTx: view.tx,
          startTy: view.ty,
          moved: false,
        }
        // Do not preventDefault here; allow taps to generate clicks if no move occurs
      }
    },
    [view.tx, view.ty, view.scale],
  )
  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const state = touchRef.current
        if (!state) return
        const [t1, t2] = [e.touches[0], e.touches[1]]
        const dx = t2.clientX - t1.clientX
        const dy = t2.clientY - t1.clientY
        const dist = Math.hypot(dx, dy)
        const cx = (t1.clientX + t2.clientX) / 2
        const cy = (t1.clientY + t2.clientY) / 2
        e.preventDefault()
        e.stopPropagation()

        // Compute desired scale relative to gesture start
        const scaleFactor = dist / state.startDist
        const targetScale = Math.min(
          2,
          Math.max(0.5, Number((state.startScale * scaleFactor).toFixed(3))),
        )

        // Anchor zoom at current midpoint so the point under fingers remains stable
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const lx = cx - rect.left
        const ly = cy - rect.top
        const stageX = (lx - view.tx) / Math.max(0.000001, view.scale)
        const stageY = (ly - view.ty) / Math.max(0.000001, view.scale)
        const nextTx = Math.round(lx - stageX * targetScale)
        const nextTy = Math.round(ly - stageY * targetScale)

        dispatch(setScale(targetScale as Parameters<typeof setScale>[0]))
        dispatch(setPan({ tx: nextTx, ty: nextTy }))
        // Update last centroid
        state.lastCx = cx
        state.lastCy = cy
        return
      }
      if (e.touches.length === 1) {
        const s = singleRef.current
        if (!s) return
        const t = e.touches[0]
        const dx = t.clientX - s.startX
        const dy = t.clientY - s.startY
        // If significant movement, treat as pan and suppress taps
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          e.preventDefault()
          e.stopPropagation()
          s.moved = true
          dispatch(setPan({ tx: s.startTx + dx, ty: s.startTy + dy }))
        }
      }
    },
    [containerRef, dispatch, view.scale, view.tx, view.ty],
  )
  const onTouchEnd = useCallback(() => {
    touchRef.current = null
    singleRef.current = null
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
