import { useEffect, useMemo, useState } from 'react'
import InfoTooltip from '@/components/InfoTooltip'
import { useAppSelector } from '@/hooks/redux'
import { resolveAssetPath } from '@/utils/assets'
import { TreasureTradeModal } from './TreasureTradeModal'

type Props = {
  variant?: 'header' | 'compact'
}

export function TreasureHud({ variant = 'header' }: Props) {
  const game = useAppSelector((s) => s.game.currentGame)
  const userId = useAppSelector((s) => s.auth.user?.id)

  const me = useMemo(() => game?.players.find((p) => p.id === userId), [game?.players, userId])
  const hand = (me?.treasures ?? []) as string[]
  const mustCashIn = Boolean(game?.mustCashInTreasures)
  const isMyTurn = Boolean(userId && game?.currentPlayer === userId)

  // Intentionally remove numeric payout indicators in HUD per UX request

  const [open, setOpen] = useState(false)

  // Auto-open if I must cash in and it's my turn
  useEffect(() => {
    if (isMyTurn && mustCashIn) setOpen(true)
  }, [isMyTurn, mustCashIn])

  // Icon helper with emoji fallback
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const iconFor = (metal: string) => {
    const m = String(metal).toLowerCase()
    const file =
      m === 'diamond' ? 'diamond' : m === 'gold' ? 'gold' : m === 'silver' ? 'silver' : 'bronze'
    const url = resolveAssetPath(`static/icons/treasures/${file}.svg`)
    const emoji = m === 'diamond' ? '💎' : m === 'gold' ? '🥇' : m === 'silver' ? '🥈' : '🥉'
    if (failed.has(file)) {
      return (
        <span className="inline-block align-middle text-[10px]" title={`${file} card`}>
          {emoji}
        </span>
      )
    }
    return (
      <img
        src={url}
        alt={`${file} card`}
        className="inline-block align-middle"
        width={12}
        height={12}
        onError={() => setFailed((prev) => new Set(prev).add(file))}
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
    <>
      <button
        type="button"
        className={`${containerClasses} ${pulse ? 'animate-pulse ring-1 ring-[color:var(--color-warning)]' : ''} ${!isMyTurn ? 'opacity-70 cursor-not-allowed' : ''}`}
        title={isMyTurn ? 'Treasures' : 'You can trade cards on your turn'}
        onClick={() => {
          if (!isMyTurn) return
          setOpen(true)
        }}
        disabled={!isMyTurn}
        aria-disabled={!isMyTurn}
      >
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
      <TreasureTradeModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  )
}

export default TreasureHud
