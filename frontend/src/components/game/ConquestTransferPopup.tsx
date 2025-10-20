import { useCallback, useEffect, useId, useRef, useState } from 'react'

interface ConquestTransferPopupProps {
  leftPercent: number
  topPercent: number
  maxArmies: number
  onConfirm: (armies: number) => void
  onCancel: () => void
  title?: string
  confirmLabel?: string
  /** Map scale factor for correct drag offset calculation within transformed container */
  scale?: number
}

export default function ConquestTransferPopup({
  leftPercent,
  topPercent,
  maxArmies,
  onConfirm,
  onCancel,
  title = 'Move armies',
  confirmLabel = 'Confirm',
  scale = 1,
}: ConquestTransferPopupProps) {
  // Default to moving all available by default; users can reduce via slider/buttons
  const [armies, setArmies] = useState(Math.max(1, maxArmies))
  const sliderId = useId()
  // Draggable offset relative to anchored position
  const [offset, setOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const elRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    startDx: number
    startDy: number
  } | null>(null)

  const startDrag = useCallback(
    (clientX: number, clientY: number) => {
      dragRef.current = { startX: clientX, startY: clientY, startDx: offset.dx, startDy: offset.dy }
      document.body.style.cursor = 'grabbing'
    },
    [offset.dx, offset.dy],
  )

  const onMouseDownHandle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      startDrag(e.clientX, e.clientY)
    },
    [startDrag],
  )

  const onTouchStartHandle = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 1) return
      const t = e.touches[0]
      e.stopPropagation()
      e.preventDefault()
      startDrag(t.clientX, t.clientY)
    },
    [startDrag],
  )

  // Clamp helper keeps popup within parent bounds accounting for transform
  const clamp = useCallback(
    (dx: number, dy: number) => {
      const el = elRef.current
      if (!el) return { dx, dy }
      const parent = (el.offsetParent as HTMLElement | null) ?? el.parentElement
      if (!parent) return { dx, dy }
      const parentW = parent.clientWidth || 0
      const parentH = parent.clientHeight || 0
      const W = el.offsetWidth || 0
      const H = el.offsetHeight || 0
      const anchorX = (leftPercent / 100) * parentW
      const anchorY = (topPercent / 100) * parentH
      const margin = 8
      const fx = 0.5
      const fy = topPercent > 20 ? -1.4 : 0.4

      const minDx = margin + fx * W - anchorX
      const maxDx = parentW - margin - (1 - fx) * W - anchorX
      const minDy = margin - anchorY - fy * H
      const maxDy = parentH - margin - H - anchorY - fy * H

      const clampedDx = Math.max(minDx, Math.min(maxDx, dx))
      const clampedDy = Math.max(minDy, Math.min(maxDy, dy))
      return { dx: clampedDx, dy: clampedDy }
    },
    [leftPercent, topPercent],
  )

  // Clamp initial position and whenever anchor changes so the popup starts in view
  useEffect(() => {
    setOffset(clamp(0, 0))
  }, [clamp])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      // Divide mouse movement by scale to account for transformed container
      const dx = d.startDx + (e.clientX - d.startX) / scale
      const dy = d.startDy + (e.clientY - d.startY) / scale
      setOffset(clamp(dx, dy))
    }
    const onEnd = () => {
      dragRef.current = null
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
    }
  }, [clamp, scale])

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      const d = dragRef.current
      if (!d) return
      if (e.touches.length < 1) return
      const t = e.touches[0]
      // Divide touch movement by scale to account for transformed container
      const dx = d.startDx + (t.clientX - d.startX) / scale
      const dy = d.startDy + (t.clientY - d.startY) / scale
      setOffset(clamp(dx, dy))
      // Prevent page scroll while dragging on mobile
      e.preventDefault()
    }
    const onEnd = () => {
      dragRef.current = null
      document.body.style.cursor = ''
    }
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [clamp, scale])

  // Re-clamp on window resize in case parent size changes
  useEffect(() => {
    const onResize = () => setOffset((o) => clamp(o.dx, o.dy))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  useEffect(() => {
    setArmies((prev) => Math.min(prev, Math.max(1, maxArmies)))
  }, [maxArmies])

  return (
    <div
      ref={elRef}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      className="absolute z-40"
      style={{
        left: `calc(${leftPercent}% + ${offset.dx}px)`,
        top: `calc(${topPercent}% + ${offset.dy}px)`,
        transform: topPercent > 20 ? 'translate(-50%, -140%)' : 'translate(-50%, 40%)',
        touchAction: 'none',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="rounded bg-[color:var(--surface-2)]/95 border border-[color:var(--panel-border)] shadow px-3 py-2 text-xs text-[color:var(--text)] whitespace-nowrap min-w-[200px]">
        <button
          type="button"
          className="flex items-center justify-between gap-2 w-full text-left cursor-grab select-none"
          onMouseDown={onMouseDownHandle}
          onTouchStart={onTouchStartHandle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold">{title}</div>
          <div className="font-mono text-[color:var(--text-muted)]">max {maxArmies}</div>
        </button>
        <div className="mt-2">
          <label htmlFor={sliderId} className="sr-only">
            Armies to move
          </label>
          <div className="flex items-center gap-2">
            <input
              id={sliderId}
              type="range"
              min={1}
              max={Math.max(1, maxArmies)}
              value={armies}
              onChange={(e) => setArmies(Number.parseInt(e.target.value, 10) || 1)}
              className="flex-1"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            />
            <div className="w-10 text-right">
              <span className="font-bold">{armies}</span>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs flex-1"
              onClick={(e) => {
                e.stopPropagation()
                setArmies(1)
              }}
              disabled={maxArmies < 1}
              title="Move 1"
            >
              Min (1)
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs flex-1"
              onClick={(e) => {
                e.stopPropagation()
                setArmies(Math.max(1, Math.floor(maxArmies / 2)))
              }}
              disabled={maxArmies < 2}
              title="Move half"
            >
              Half
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs flex-1"
              onClick={(e) => {
                e.stopPropagation()
                setArmies(Math.max(1, maxArmies))
              }}
              title="Move all"
            >
              All
            </button>
          </div>
          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={(e) => {
                e.stopPropagation()
                onConfirm(Math.max(1, Math.min(armies, maxArmies)))
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
