import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { resolveAssetPath } from '@/utils/assets'
import InfoTooltip from '@/components/InfoTooltip'
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
  const metalType = (m: string) => String(m).toLowerCase()
  const isDiamond = (m: string) => metalType(m) === 'diamond'
  const isCore = (m: string) => {
    const t = metalType(m)
    return t === 'bronze' || t === 'silver' || t === 'gold'
  }

  const isValidTriple = (triple: number[]): boolean => {
    if (triple.length !== 3) return false
    const cards = triple.map((i) => hand[i] ?? '')
    const d = cards.filter(isDiamond).length
    const core = cards.filter((m) => !isDiamond(m))
    // Filter to core names only
    const coreNames = core.map(metalType).filter(isCore)
    const distinctCore = Array.from(new Set(coreNames))
    // Three of a kind: all same or can become same with diamonds (<=1 distinct core)
    if (distinctCore.length <= 1) return true
    // One of each: with diamonds as wild to complete {bronze, silver, gold}
    // Need to be able to represent all three core types
    if (distinctCore.length + d >= 3) return true
    return false
  }
  const canTrade = selected.length === 3 && isValidTriple(selected)

  // Compute valid sets: three-of-a-kind or all-different
  const classifyPattern = (triple: number[]): 'three_of_a_kind' | 'one_of_each' | 'diamond_combo' => {
    const metals = triple.map((i) => metalType(hand[i]))
    const diamonds = metals.filter((m) => m === 'diamond').length
    const cores = metals.filter((m) => m !== 'diamond')
    const coreSet = new Set(cores)
    if (diamonds > 0) return 'diamond_combo'
    if (coreSet.size === 1 && cores.length === 3) return 'three_of_a_kind'
    const needed = ['bronze', 'silver', 'gold']
    const distinct = Array.from(coreSet)
    if (distinct.length === 3 && needed.every((m) => distinct.includes(m))) return 'one_of_each'
    // With diamonds wild we handled earlier; non‑diamond case falls through
    return 'diamond_combo'
  }

  const labelForSet = (triple: number[]) => {
    const pattern = classifyPattern(triple)
    if (pattern === 'three_of_a_kind') return 'Three of a kind'
    if (pattern === 'one_of_each') return 'One of each'
    return 'Diamond combo (wild)'
  }

  const validSets = useMemo(() => {
    const sets: Array<{ idx: number[]; label: string }> = []
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        for (let k = j + 1; k < hand.length; k++) {
          const triple = [i, j, k]
          if (isValidTriple(triple)) sets.push(triple)
        }
      }
    }
    return sets.map((s) => ({ idx: s, label: labelForSet(s) }))
  }, [hand])

  const projection = useMemo(() => {
    const containsDiamond = selected.some((idx) => String(hand[idx]).toLowerCase() === 'diamond')
    const mode = (treasureConfig?.payoutMode || '').toLowerCase()
    const nextIndex: number = (game?.treasureState && (game.treasureState as any).nextPayoutIndex) ?? 0

    const diamondBonus = containsDiamond ? Math.max(0, treasureConfig?.diamondSetBonus ?? 0) : 0
    let base = 0

    if (mode === 'fixed') {
      base = Math.max(1, Math.min(50, treasureConfig?.fixedValue ?? 8))
      return { base, bonus: diamondBonus, total: base + diamondBonus, mode }
    }
    if (mode === 'none') return { base: 0, bonus: 0, total: 0, mode }

    if (mode === 'classic') {
      const classicSeq = [4, 6, 8, 10, 12, 15, 20, 25, 30, 35]
      base =
        nextIndex < classicSeq.length
          ? classicSeq[nextIndex]
          : classicSeq[classicSeq.length - 1] + (nextIndex - classicSeq.length + 1) * 5
      return { base, bonus: diamondBonus, total: base + diamondBonus, mode }
    }

    // triangular (default)
    const computeTriangular = (idx: number) => {
      if (idx <= 0) return 4
      let payout = 4
      let delta = 2
      for (let i = 1; i <= idx; i++) {
        payout += delta
        delta += 1
      }
      return payout
    }
    base = computeTriangular(nextIndex)
    return { base, bonus: diamondBonus, total: base + diamondBonus, mode: 'triangular' }
  }, [game?.treasureState, hand, selected, treasureConfig])

  const iconFor = (metal: string) => {
    const m = metal.toLowerCase()
    const file =
      m === 'diamond'
        ? 'diamond'
        : m === 'gold'
          ? 'gold'
          : m === 'silver'
            ? 'silver'
            : 'bronze'
    const url = resolveAssetPath(`static/icons/treasures/${file}.svg`)
    return (
      <img
        src={url}
        alt={`${file} card`}
        className="inline-block align-middle"
        width={14}
        height={14}
        onError={(e) => {
          // fallback to emoji if CDN asset missing
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="panel w-full max-w-lg p-0 overflow-hidden" role="dialog" aria-modal="true">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Trade Treasures
            <InfoTooltip
              title={`Valid sets: one of each (bronze, silver, gold) or three of a kind. Diamonds are wild and add +${Math.max(0, treasureConfig?.diamondSetBonus ?? 0)} troops.`}
            />
          </h3>
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
                      <span className="w-4 h-4 flex items-center justify-center">{iconFor(metal)}</span>
                      <span className="capitalize">{metal}</span>
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
                {validSets.map((entry, i) => (
                  <button
                    key={`set-${i}`}
                    type="button"
                    className={`btn btn-ghost btn-xs ${
                      selected.length === 3 && entry.idx.every((v) => selected.includes(v)) ? 'ring-1 ring-[color:var(--color-accent)]' : ''
                    }`}
                    onClick={() => setSelected(entry.idx)}
                    title={entry.label}
                  >
                    <span className="flex items-center gap-1">
                      {entry.idx.map((idx) => (
                        <span key={`icon-${i}-${idx}`} className="w-4 h-4 flex items-center justify-center">
                          {iconFor(hand[idx])}
                        </span>
                      ))}
                    </span>
                    <span className="ml-1 text-[10px] opacity-80">{entry.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs text-muted mt-2">
            Rules: one of each or three of a kind. Diamonds are wild and increase payout by +
            {Math.max(0, treasureConfig?.diamondSetBonus ?? 0)}.
          </div>
          <div className="text-xs text-muted mt-2 flex items-center gap-3 flex-wrap">
            <span>Projected reinforcements:</span>
            {projection ? (
              <>
                <span className="text-white">+{projection.total}</span>
                <span className="text-muted">(base {projection.base}{projection.bonus ? ` + diamond ${projection.bonus}` : ''}{projection.mode ? ` • ${projection.mode}` : ''})</span>
              </>
            ) : (
              <span className="text-white">—</span>
            )}
            {selected.length === 3 && !canTrade && (
              <span className="text-[color:var(--color-warning)] ml-2">Invalid set</span>
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
