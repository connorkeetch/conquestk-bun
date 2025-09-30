import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { tradeTreasureSet } from '@/store/gameActions'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export function TreasureTradeModal({ isOpen, onClose }: Props) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game.currentGame)
  const userId = useAppSelector((s) => s.auth.user?.id)

  const me = useMemo(() => game?.players.find((p) => p.id === userId), [game?.players, userId])
  const hand = (me?.treasures ?? []) as string[]
  const treasureConfig = useAppSelector((s) => s.room.currentRoom?.treasureConfig) as
    | ({ payoutMode?: string; fixedValue?: number; diamondSetBonus?: number } & Record<string, unknown>)
    | undefined
  const [selected, setSelected] = useState<number[]>([])
  const canTrade = selected.length === 3

  // Compute valid sets: three-of-a-kind or all-different
  const validSets = useMemo(() => {
    const sets: number[][] = []
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        for (let k = j + 1; k < hand.length; k++) {
          const a = hand[i]
          const b = hand[j]
          const c = hand[k]
          const allSame = a === b && b === c
          const allDiff = a !== b && a !== c && b !== c
          if (allSame || allDiff) sets.push([i, j, k])
        }
      }
    }
    return sets
  }, [hand])

  const projectedReinforcements = useMemo(() => {
    const containsDiamond = selected.some((idx) => String(hand[idx]).toLowerCase().includes('diamond'))
    const mode = (treasureConfig?.payoutMode || '').toLowerCase()
    if (mode === 'fixed') {
      const base = Math.max(1, Math.min(50, treasureConfig?.fixedValue ?? 8))
      const bonus = containsDiamond ? Math.max(0, treasureConfig?.diamondSetBonus ?? 0) : 0
      return base + bonus
    }
    if (mode === 'none') return 0
    return undefined // varies
  }, [hand, selected, treasureConfig])

  const iconFor = (metal: string) => {
    const m = metal.toLowerCase()
    if (m.includes('diamond')) return '💎'
    if (m.includes('gold')) return '🟡'
    if (m.includes('silver')) return '⚪'
    if (m.includes('bronze') || m.includes('copper')) return '🟤'
    return '⬜'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="panel w-full max-w-lg p-0 overflow-hidden" role="dialog" aria-modal="true">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold">Trade Treasures</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted">Select any 3 cards to trade for reinforcements.</p>
          {hand.length === 0 ? (
            <div className="text-sm text-muted">No treasures in hand.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {hand.map((metal, idx) => {
                const active = selected.includes(idx)
                return (
                  <button
                    key={`${metal}-${idx}`}
                    type="button"
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(idx) ? prev.filter((i) => i !== idx) : prev.length < 3 ? [...prev, idx] : prev,
                      )
                    }
                    className={`rounded border px-2 py-3 text-sm text-left ${
                      active ? 'border-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]' : 'border-border'
                    }`}
                    title={active ? 'Selected' : 'Click to select'}
                  >
                    <div className="font-medium text-white flex items-center gap-2">
                      <span>{iconFor(metal)}</span>
                      <span>{metal}</span>
                    </div>
                    <div className="text-xs text-muted">Card #{idx + 1}</div>
                  </button>
                )
              })}
            </div>
          )}
          {validSets.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-muted mb-1">Valid sets:</div>
              <div className="flex flex-wrap gap-2">
                {validSets.map((set, i) => (
                  <button
                    key={`set-${i}`}
                    type="button"
                    className={`btn btn-ghost btn-xs ${
                      selected.length === 3 && set.every((v) => selected.includes(v)) ? 'ring-1 ring-[color:var(--color-accent)]' : ''
                    }`}
                    onClick={() => setSelected(set)}
                    title="Click to select this set"
                  >
                    {set.map((idx) => iconFor(hand[idx])).join(' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs text-muted mt-2">
            Projected reinforcements:{' '}
            {projectedReinforcements === undefined ? (
              <span className="text-white">varies by payout mode</span>
            ) : (
              <span className="text-white">+{projectedReinforcements}</span>
            )}
          </div>
        </div>
        <div className="p-4 border-t border-border flex items-center justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canTrade}
            onClick={() => {
              if (selected.length === 3) {
                void dispatch(tradeTreasureSet([selected[0], selected[1], selected[2]] as [number, number, number]))
                setSelected([])
                onClose()
              }
            }}
          >
            Trade Selected
          </button>
        </div>
      </div>
    </div>
  )
}
