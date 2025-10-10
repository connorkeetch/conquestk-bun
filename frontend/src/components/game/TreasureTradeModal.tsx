import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import InfoTooltip from '@/components/InfoTooltip'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { tradeTreasureSet } from '@/store/gameActions'
import { resolveAssetPath } from '@/utils/assets'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export function TreasureTradeModal({ isOpen, onClose }: Props) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game.currentGame)
  const userId = useAppSelector((s) => s.auth.user?.id)

  const me = useMemo(
    () => game?.players.find((p: { id: string }) => p.id === userId),
    [game?.players, userId],
  )
  const hand = (me?.treasures ?? []) as string[]
  const treasureConfig = useAppSelector((s) => s.room.currentRoom?.treasureConfig) as
    | ({ payoutMode?: string; fixedValue?: number; diamondSetBonus?: number } & Record<
        string,
        unknown
      >)
    | undefined
  const [selected, setSelected] = useState<number[]>([])
  const isMyTurn = Boolean(userId && game?.currentPlayer === userId)
  const mustCashIn = Boolean(
    (me as unknown as { mustCashInTreasures?: boolean })?.mustCashInTreasures ??
      game?.mustCashInTreasures,
  )
  const [closeWarn, setCloseWarn] = useState(false)

  // Helper functions defined with useCallback to stabilize dependencies
  const metalType = useCallback((m: string) => String(m).toLowerCase(), [])
  const isDiamond = useCallback((m: string) => metalType(m) === 'diamond', [metalType])
  const isCore = useCallback(
    (m: string) => {
      const t = metalType(m)
      return t === 'bronze' || t === 'silver' || t === 'gold'
    },
    [metalType],
  )

  const isValidTriple = useCallback(
    (triple: number[]): boolean => {
      if (triple.length !== 3) return false
      // Bounds checking
      if (triple.some((i) => i < 0 || i >= hand.length)) return false
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
    },
    [hand, isDiamond, isCore, metalType],
  )

  const canTrade = selected.length === 3 && isValidTriple(selected)
  const tradeDisabled = !isMyTurn || !canTrade

  // Determine which cards are eligible to pick next given the current selection
  const eligible = useMemo(() => {
    const out = new Set<number>()
    const n = hand.length
    if (n === 0) return out

    // Always allow deselecting what is already chosen
    selected.forEach((idx) => {
      out.add(idx)
    })

    if (selected.length === 0) {
      // With nothing selected, everything is a valid starting point
      for (let i = 0; i < n; i++) out.add(i)
      return out
    }

    if (selected.length === 1) {
      const a = selected[0]
      for (let j = 0; j < n; j++) {
        if (j === a) continue
        // Is there any third k that makes [a, j, k] a valid triple?
        let ok = false
        for (let k = 0; k < n; k++) {
          if (k === a || k === j) continue
          if (isValidTriple([a, j, k])) {
            ok = true
            break
          }
        }
        if (ok) out.add(j)
      }
      return out
    }

    if (selected.length === 2) {
      const [a, b] = selected
      for (let k = 0; k < n; k++) {
        if (k === a || k === b) continue
        if (isValidTriple([a, b, k])) out.add(k)
      }
      return out
    }

    // When 3 are selected, only allow deselection of the chosen ones
    return out
  }, [hand, isValidTriple, selected])

  // Compute valid sets: three-of-a-kind or all-different
  const classifyPattern = useCallback(
    (triple: number[]): 'three_of_a_kind' | 'one_of_each' | 'diamond_combo' => {
      const metals = triple.map((i) => metalType(hand[i] ?? ''))
      const diamonds = metals.filter((m) => m === 'diamond').length
      const cores = metals.filter((m) => m !== 'diamond')
      const coreSet = new Set(cores)
      // First check pure patterns (no diamonds)
      if (diamonds === 0) {
        if (coreSet.size === 1 && cores.length === 3) return 'three_of_a_kind'
        const needed = ['bronze', 'silver', 'gold']
        const distinct = Array.from(coreSet)
        if (distinct.length === 3 && needed.every((m) => distinct.includes(m))) return 'one_of_each'
      }
      // Any set with diamonds is a diamond combo
      return 'diamond_combo'
    },
    [hand, metalType],
  )

  const labelForSet = useCallback(
    (triple: number[]) => {
      const pattern = classifyPattern(triple)
      if (pattern === 'three_of_a_kind') return 'Three of a kind'
      if (pattern === 'one_of_each') return 'One of each'
      return 'Diamond combo (wild)'
    },
    [classifyPattern],
  )

  // Identify current selection label if complete and valid
  const selectedLabel = useMemo(() => {
    return selected.length === 3 && canTrade ? labelForSet(selected) : null
  }, [canTrade, labelForSet, selected])

  const projection = useMemo(() => {
    const containsDiamond = selected.some((idx) => String(hand[idx]).toLowerCase() === 'diamond')
    const mode = (treasureConfig?.payoutMode || '').toLowerCase()
    // Safely extract nextPayoutIndex with type checking
    const treasureState = game?.treasureState
    const nextIndex: number =
      treasureState && typeof treasureState === 'object' && 'nextPayoutIndex' in treasureState
        ? (treasureState.nextPayoutIndex as number)
        : 0

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
      // Guard against negative or invalid indices
      const safeIdx = Math.max(0, Math.floor(idx))
      if (safeIdx === 0) return 4
      let payout = 4
      let delta = 2
      for (let i = 1; i <= safeIdx; i++) {
        payout += delta
        delta += 1
      }
      return payout
    }
    base = computeTriangular(nextIndex)
    return { base, bonus: diamondBonus, total: base + diamondBonus, mode: 'triangular' }
  }, [game?.treasureState, hand, selected, treasureConfig])

  // Icon helper (SVG only; no emoji fallback)
  const iconFor = useCallback(
    (metal: string) => {
      const m = metal.toLowerCase()
      const file =
        m === 'diamond' ? 'diamond' : m === 'gold' ? 'gold' : m === 'silver' ? 'silver' : 'bronze'
      const url = resolveAssetPath(`static/icons/treasures/${file}.svg`)
      const diamondBonus = Math.max(0, treasureConfig?.diamondSetBonus ?? 3)
      const title =
        file === 'diamond'
          ? `Diamond (+${diamondBonus} bonus)`
          : file.charAt(0).toUpperCase() + file.slice(1)
      return (
        <img
          src={url}
          alt={`${file} card`}
          title={title}
          className="inline-block align-middle"
          width={14}
          height={14}
        />
      )
    },
    [treasureConfig?.diamondSetBonus],
  )

  // Count remaining valid sets in the current hand (excludes partial selections)
  const remainingValidSets = useMemo(() => {
    if (!hand || hand.length < 3) return 0
    let count = 0
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        for (let k = j + 1; k < hand.length; k++) {
          if (isValidTriple([i, j, k])) count += 1
        }
      }
    }
    return count
  }, [hand, isValidTriple])

  if (!isOpen) return null

  const portalTarget = typeof document !== 'undefined' ? document.body : null
  const modal = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[color:color-mix(in_srgb,var(--surface-1)_8%,black)] backdrop-blur-sm">
      <div className="panel w-full max-w-lg p-0 overflow-hidden" role="dialog" aria-modal="true">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Trade Treasures
            <InfoTooltip
              title={`Valid sets: one of each (bronze, silver, gold) or three of a kind. Diamonds are wild and add +${Math.max(0, treasureConfig?.diamondSetBonus ?? 0)} troops.`}
            />
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (mustCashIn) {
                setCloseWarn(true)
                // auto-clear after 3s to avoid sticky warning
                window.setTimeout(() => setCloseWarn(false), 3000)
                return
              }
              onClose()
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          {mustCashIn && closeWarn && (
            <div className="text-xs text-[color:var(--color-warning)] bg-[color:var(--surface-2)]/70 border border-[color:var(--color-warning)]/50 rounded p-2">
              You need to trade a set before continuing. Select any 3 valid cards to cash in.
            </div>
          )}
          {!isMyTurn && (
            <div className="text-xs text-muted bg-[color:var(--surface-2)]/70 border border-border rounded p-2">
              You can trade treasures only on your turn.
            </div>
          )}
          <p className="text-sm text-muted">Select any 3 cards to trade for reinforcements.</p>
          {hand.length === 0 ? (
            <div className="text-sm text-muted">No treasures in hand.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {hand.map((metal, idx) => {
                const active = selected.includes(idx)
                const isDisabled = !active && !eligible.has(idx)
                return (
                  <button
                    // biome-ignore lint/suspicious/noArrayIndexKey: cards don't have stable ids yet; index is stable within session
                    key={`${metal}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelected((prev) => {
                        // Toggle off if already selected
                        if (prev.includes(idx)) return prev.filter((i) => i !== idx)
                        // Prevent selecting ineligible options
                        if (!eligible.has(idx)) return prev
                        // Add if we have fewer than 3
                        if (prev.length < 3) return [...prev, idx]
                        return prev
                      })
                    }}
                    className={`rounded border px-2 py-3 text-sm text-left ${
                      active
                        ? 'border-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]'
                        : isDisabled
                          ? 'border-border opacity-40 cursor-not-allowed'
                          : 'border-border'
                    }`}
                    title={
                      active
                        ? 'Selected'
                        : isDisabled
                          ? 'Cannot form a valid set with current selection'
                          : 'Click to select'
                    }
                    disabled={isDisabled}
                  >
                    <div className="font-medium text-white flex items-center gap-2">
                      <span className="w-4 h-4 flex items-center justify-center">
                        {iconFor(metal)}
                      </span>
                      <span className="capitalize">{metal}</span>
                    </div>
                    <div className="text-xs text-muted">Card #{idx + 1}</div>
                  </button>
                )
              })}
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
                <span className="text-muted">
                  (base {projection.base}
                  {projection.bonus ? ` + diamond ${projection.bonus}` : ''}
                  {projection.mode ? ` • ${projection.mode}` : ''})
                </span>
              </>
            ) : (
              <span className="text-white">—</span>
            )}
            {selected.length === 3 && !canTrade && (
              <span className="text-[color:var(--color-warning)] ml-2">Invalid set</span>
            )}
            {selectedLabel && <span className="chip text-xs">{selectedLabel}</span>}
          </div>
        </div>
        <div className="p-4 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (mustCashIn) {
                setCloseWarn(true)
                window.setTimeout(() => setCloseWarn(false), 3000)
                return
              }
              onClose()
            }}
          >
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={tradeDisabled}
            onClick={() => {
              if (tradeDisabled) return
              if (selected.length === 3) {
                void dispatch(
                  tradeTreasureSet([selected[0], selected[1], selected[2]] as [
                    number,
                    number,
                    number,
                  ]),
                )
                // Keep the modal open to allow multi-set cash-ins (e.g., after eliminations)
                // Clear local selection; the hand will refresh from server state
                setSelected([])
              }
            }}
          >
            Trade Selected
          </button>
        </div>
        {remainingValidSets > 1 && (
          <div className="px-4 pb-4 text-xs text-muted">
            You have {remainingValidSets} valid set{remainingValidSets === 1 ? '' : 's'} available.
            You can trade multiple sets consecutively.
          </div>
        )}
      </div>
    </div>
  )

  return portalTarget ? createPortal(modal, portalTarget) : modal
}
