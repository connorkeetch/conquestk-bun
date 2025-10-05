import { useEffect, useId, useState } from 'react'

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

  useEffect(() => {
    setArmies((prev) => Math.min(prev, Math.max(1, maxArmies)))
  }, [maxArmies])

  return (
    <div
      className="absolute z-40"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transform: topPercent > 20 ? 'translate(-50%, -140%)' : 'translate(-50%, 40%)',
      }}
    >
      <div className="rounded bg-[color:var(--surface-2)]/95 border border-[color:var(--panel-border)] shadow px-3 py-2 text-xs text-[color:var(--text)] whitespace-nowrap min-w-[200px]">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">{title}</div>
          <div className="font-mono text-[color:var(--text-muted)]">max {maxArmies}</div>
        </div>
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
            />
            <div className="w-10 text-right">
              <span className="font-bold">{armies}</span>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onConfirm(Math.max(1, Math.min(armies, maxArmies)))}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
