import { useCallback, useEffect, useId, useRef, useState } from 'react'

interface ConquestTransferPopupProps {
  leftPercent: number
  topPercent: number
  maxArmies: number
  onConfirm: (armies: number) => void
  onCancel: () => void
  title?: string
  confirmLabel?: string
}

export default function ConquestTransferPopup({
  leftPercent,
  topPercent,
  maxArmies,
  onConfirm,
  onCancel,
  title = 'Move armies',
  confirmLabel = 'Confirm',
}: ConquestTransferPopupProps) {
  const [armies, setArmies] = useState(Math.min(3, Math.max(1, maxArmies)))
  const sliderId = useId()
  // Draggable offset relative to anchored position
  const [offset, setOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
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

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      setOffset({ dx: d.startDx + dx, dy: d.startDy + dy })
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
  }, [])

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      const d = dragRef.current
      if (!d) return
      if (e.touches.length < 1) return
      const t = e.touches[0]
      const dx = t.clientX - d.startX
      const dy = t.clientY - d.startY
      setOffset({ dx: d.startDx + dx, dy: d.startDy + dy })
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
  }, [])

  useEffect(() => {
    setArmies((prev) => Math.min(prev, Math.max(1, maxArmies)))
  }, [maxArmies])

  return (
    <div
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
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
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
              className="btn btn-ghost btn-sm"
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
