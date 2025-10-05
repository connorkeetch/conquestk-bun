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
  return (
    <div
      className="absolute z-40"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transform: topPercent > 20 ? 'translate(-50%, -140%)' : 'translate(-50%, 40%)',
      }}
    >
      <div className="rounded bg-[color:var(--surface-2)]/95 border border-[color:var(--panel-border)] shadow px-2 py-2 text-xs text-[color:var(--text)] whitespace-nowrap min-w-[140px]">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Attack odds</div>
          <div className="font-mono text-[color:var(--text-muted)]">
            {Math.round(winChancePercent)}%
          </div>
        </div>
        <div className="mt-1 text-[color:var(--text-muted)]">
          {attackerDice}v{defenderDice} dice
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-secondary btn-sm ${autoEnabled ? 'ring-1 ring-white' : ''}`}
            onClick={onToggleAuto}
            title={autoEnabled ? 'Stop auto-attack' : 'Auto-attack until stop'}
          >
            {autoEnabled ? 'Stop' : 'Auto'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onAttack}>
            Attack
          </button>
        </div>
      </div>
    </div>
  )
}
