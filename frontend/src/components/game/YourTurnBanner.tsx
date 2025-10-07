import { useEffect, useMemo, useRef, useState } from 'react'
import { getColorValue } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'
import { extractFirstHexColor, isGradientValue, pickTextOnColor } from '@/utils/color'
import { TurnTimer } from './TurnTimer'

type Props = {
  className?: string
}

/**
 * A compact, fixed banner below the header that clearly indicates
 * when it is the local player's turn. Uses the player's color as an accent.
 */
export function YourTurnBanner({ className = '' }: Props) {
  const userId = useAppSelector((s) => s.auth.user?.id)
  const game = useAppSelector((s) => s.game.currentGame)
  // Room currently unused; keep logic self-contained

  const isMyTurn = Boolean(userId && game?.currentPlayer === userId && game?.phase !== 'finished')

  const myColor = useMemo(() => {
    if (!userId || !game) return null
    const me = game.players.find((p) => (p.userId ?? p.id) === userId)
    if (!me) return null
    const val = getColorValue(me.color)
    const hex = isGradientValue(val) ? (extractFirstHexColor(val) ?? '#DC2626') : val
    return hex
  }, [game, userId])

  // Avoid re-showing after dismiss until the player changes
  const [dismissedForTurn, setDismissedForTurn] = useState<number | null>(null)
  const lastTurnRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isMyTurn) {
      lastTurnRef.current = null
      setDismissedForTurn(null)
      return
    }
    if (typeof game?.turn === 'number' && lastTurnRef.current !== game.turn) {
      lastTurnRef.current = game.turn
      setDismissedForTurn(null)
    }
  }, [isMyTurn, game?.turn])

  if (!isMyTurn) return null
  if (dismissedForTurn === game?.turn) return null

  const bg = myColor ?? '#DC2626'
  const text = pickTextOnColor(bg)
  const phaseLabel = game?.phase ? game.phase.charAt(0).toUpperCase() + game.phase.slice(1) : 'Turn'

  return (
    <div className={`fixed inset-x-0 z-40 top-14 ${className}`} aria-live="polite">
      <div className="mx-auto max-w-7xl px-4 py-2">
        <div
          className="rounded-md border px-3 py-2 shadow-md flex items-center justify-between gap-3"
          style={{
            background: `color-mix(in srgb, ${bg} 20%, transparent)`,
            borderColor: bg,
            color: text,
          }}
        >
          <div className="flex items-center gap-2 text-sm">
            <span aria-hidden className="text-base">
              🎯
            </span>
            <span className="font-semibold">It’s your turn</span>
            <span className="opacity-90">— {phaseLabel}</span>
            <TurnTimer className="ml-2" showBank={true} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDismissedForTurn(game?.turn ?? null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
