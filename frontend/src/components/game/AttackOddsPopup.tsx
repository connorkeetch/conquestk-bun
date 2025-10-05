import { useCallback, useEffect, useRef, useState } from 'react'

interface AttackOddsPopupProps {
  leftPercent: number
  topPercent: number
  attackerDice: 1 | 2 | 3
  defenderDice: 1 | 2
  winChancePercent: number
  onAttack: () => void
  onCancel: () => void
  autoEnabled: boolean
  onToggleAuto: () => void
}

export default function AttackOddsPopup({
  leftPercent,
  topPercent,
  attackerDice,
  defenderDice,
  winChancePercent,
  onAttack,
  onCancel,
  autoEnabled,
  onToggleAuto,
}: AttackOddsPopupProps) {
  // Draggable offset (in pixels) from the default anchored position
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

  return (
    <div
      role="dialog"
      aria-label="Attack odds"
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
      <div className="rounded bg-[color:var(--surface-2)]/95 border border-[color:var(--panel-border)] shadow px-2 py-2 text-xs text-[color:var(--text)] whitespace-nowrap min-w-[140px]">
        <button
          type="button"
          className="flex items-center justify-between gap-2 w-full text-left cursor-grab select-none"
          onMouseDown={onMouseDownHandle}
          onTouchStart={onTouchStartHandle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold">Attack odds</div>
          <div className="font-mono text-[color:var(--text-muted)]">
            {Math.round(winChancePercent)}%
          </div>
        </button>
        <div className="mt-1 text-[color:var(--text-muted)]">
          {attackerDice}v{defenderDice} dice
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
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
            className={`btn btn-secondary btn-sm ${autoEnabled ? 'ring-1 ring-white' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleAuto()
            }}
            title={autoEnabled ? 'Stop auto-attack' : 'Auto-attack until stop'}
          >
            {autoEnabled ? 'Stop' : 'Auto'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              onAttack()
            }}
          >
            Attack
          </button>
        </div>
      </div>
    </div>
  )
}
