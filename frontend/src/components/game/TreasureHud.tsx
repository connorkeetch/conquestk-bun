import type { TreasureConfig } from '@shared/types'
import { useEffect, useMemo } from 'react'
import bronzeUrl from '@/assets/treasures/bronze.svg?url'
import diamondUrl from '@/assets/treasures/diamond.svg?url'
import goldUrl from '@/assets/treasures/gold.svg?url'
import silverUrl from '@/assets/treasures/silver.svg?url'
import InfoTooltip from '@/components/InfoTooltip'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { setTreasureModalOpen } from '@/store/uiRoomSlice'
import { resolveAssetPath } from '@/utils/assets'
import { computeNextTreasurePayout } from '@/utils/treasures'

type Props = {
  variant?: 'header' | 'compact'
}

export function TreasureHud({ variant = 'header' }: Props) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game.currentGame)
  const userId = useAppSelector((s) => s.auth.user?.id)
  const room = useAppSelector((s) => s.room.currentRoom)

  const me = useMemo(
    () => game?.players.find((p: { id: string }) => p.id === userId),
    [game?.players, userId],
  )
  const hand = (me?.treasures ?? []) as string[]
  const mustCashIn = Boolean(game?.mustCashInTreasures)
  const isMyTurn = Boolean(userId && game?.currentPlayer === userId)
  const phase = game?.phase

  // Determine if the current hand has any valid redeemable set
  const hasValidSet = useMemo(() => {
    const n = hand.length
    if (n < 3) return false
    let bronze = 0
    let silver = 0
    let gold = 0
    let diamond = 0
    for (const m of hand) {
      const t = String(m).toLowerCase()
      if (t === 'bronze') bronze += 1
      else if (t === 'silver') silver += 1
      else if (t === 'gold') gold += 1
      else if (t === 'diamond') diamond += 1
    }
    if (diamond > 0 && n >= 3) return true // Any triple including a diamond is valid
    if (bronze >= 3 || silver >= 3 || gold >= 3) return true // Three of a kind
    if (bronze >= 1 && silver >= 1 && gold >= 1) return true // One of each
    return false
  }, [hand])

  // Compute next payout (displayed alongside icons)
  const { base } = computeNextTreasurePayout(
    game?.treasureState,
    (room?.treasureConfig as unknown as TreasureConfig | undefined) ?? undefined,
  )

  // Auto-open at start of my turn when:
  // - I must cash in (hand cap), or
  // - I have any valid set during reinforcement
  useEffect(() => {
    if (!isMyTurn) return
    if (mustCashIn) {
      window.requestAnimationFrame(() => {
        dispatch(setTreasureModalOpen(true))
      })
      return
    }
    if (phase === 'reinforcement' && hasValidSet) {
      window.requestAnimationFrame(() => {
        dispatch(setTreasureModalOpen(true))
      })
    }
  }, [isMyTurn, mustCashIn, phase, hasValidSet, dispatch])

  // Close the modal if I no longer have a valid set and I'm not forced to cash in
  useEffect(() => {
    if (!mustCashIn && !hasValidSet) dispatch(setTreasureModalOpen(false))
  }, [mustCashIn, hasValidSet, dispatch])

  // Icon helper (SVG only; no emoji fallback)
  const iconFor = (metal: string) => {
    const m = String(metal).toLowerCase()
    const file =
      m === 'diamond' ? 'diamond' : m === 'gold' ? 'gold' : m === 'silver' ? 'silver' : 'bronze'
    const urlMap: Record<string, string> = {
      bronze: bronzeUrl,
      silver: silverUrl,
      gold: goldUrl,
      diamond: diamondUrl,
    }
    const url = urlMap[file] || resolveAssetPath(`static/icons/treasures/${file}.svg`)
    const diamondBonus = Math.max(
      0,
      ((room?.treasureConfig as unknown as TreasureConfig | undefined)?.diamondSetBonus ??
        3) as number,
    )
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
        width={12}
        height={12}
      />
    )
  }

  const shown = hand.slice(0, variant === 'compact' ? 4 : 6)
  const overflow = Math.max(0, hand.length - shown.length)

  const pulse = isMyTurn && mustCashIn
  const containerClasses =
    variant === 'compact'
      ? 'inline-flex items-center gap-1 rounded-full border border-border bg-[color:var(--surface-2)]/80 px-2 py-1 text-xs'
      : 'inline-flex items-center gap-2 rounded-full border border-border bg-[color:var(--surface-2)]/80 px-3 py-1.5 text-sm'

  return (
    <button
      type="button"
      className={`${containerClasses} ${pulse ? 'animate-pulse ring-1 ring-[color:var(--color-warning)]' : ''} ${!isMyTurn ? 'opacity-70 cursor-not-allowed' : ''}`}
      title={isMyTurn ? 'Treasures' : 'You can trade cards on your turn'}
      onClick={() => {
        if (!isMyTurn) return
        dispatch(setTreasureModalOpen(true))
      }}
      disabled={!isMyTurn}
      aria-disabled={!isMyTurn}
    >
      <span className="inline-flex items-center gap-1 mr-1">
        <span className="opacity-80">Next</span>
        <span className="font-semibold text-white">+{base}</span>
      </span>
      <span className="mx-1 h-4 w-px bg-white/20" />
      <span className="inline-flex items-center gap-1">
        {shown.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: cards lack stable ids; index is fine for a static strip
          <span key={`${m}-${i}`} className="w-3 h-3 flex items-center justify-center">
            {iconFor(m)}
          </span>
        ))}
        {overflow > 0 && <span className="text-[10px] text-white/80">+{overflow}</span>}
      </span>
      <span className="ml-1">
        <InfoTooltip title="Trade any valid set of 3 cards for reinforcements. Diamonds are wild and add extra when included." />
      </span>
    </button>
  )
}

export default TreasureHud
